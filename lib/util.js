import { PREVIEW_PROMPT, BRAND } from "./config.js";

// ── Respuestas ───────────────────────────────────────────────
export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
export const err = (message, status = 400) => json({ error: message }, status);

export const newId = () => crypto.randomUUID();
export const isId = (s) =>
  typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);
export const isEmail = (s) => typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) && s.length < 200;

// ── Base64 ───────────────────────────────────────────────────
export function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
export function bytesToB64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

// ── Anti-abuso ───────────────────────────────────────────────
export async function verifyTurnstile(env, token, ip) {
  if (!env.TURNSTILE_SECRET) return env.DEV === "1"; // en producción, sin secret = rechaza
  const fd = new FormData();
  fd.append("secret", env.TURNSTILE_SECRET);
  fd.append("response", token || "");
  if (ip) fd.append("remoteip", ip);
  const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: fd });
  const d = await r.json();
  return !!d.success;
}

// Devuelve true si se pasó del límite diario (y si no, suma uno).
export async function hitLimit(env, key, max) {
  if (!env.RATE) return false;
  const day = new Date().toISOString().slice(0, 10);
  const k = `${key}:${day}`;
  const n = parseInt((await env.RATE.get(k)) || "0", 10);
  if (n >= max) return true;
  await env.RATE.put(k, String(n + 1), { expirationTtl: 60 * 60 * 26 });
  return false;
}

// ── Pedidos (JSON en R2) ─────────────────────────────────────
export async function getOrder(env, id) {
  const o = await env.BUCKET.get(`orders/${id}.json`);
  return o ? await o.json() : null;
}
export async function saveOrder(env, order) {
  order.updatedAt = new Date().toISOString();
  await env.BUCKET.put(`orders/${order.id}.json`, JSON.stringify(order), {
    httpMetadata: { contentType: "application/json" },
  });
  return order;
}

// ── Telegram ─────────────────────────────────────────────────
export async function telegram(env, text) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text, disable_web_page_preview: true }),
    });
  } catch (e) {
    console.error("telegram", e);
  }
}

// ── OpenAI: foto → figura 2D ─────────────────────────────────
export async function openaiPreview(env, photoBytes, mime) {
  const fd = new FormData();
  fd.append("model", env.OPENAI_IMAGE_MODEL || "gpt-image-2");
  fd.append("prompt", PREVIEW_PROMPT);
  fd.append("image", new File([photoBytes], "foto.jpg", { type: mime || "image/jpeg" }));
  fd.append("size", "1024x1024");
  fd.append("quality", env.OPENAI_IMAGE_QUALITY || "low");
  fd.append("output_format", "jpeg");
  fd.append("output_compression", "85");
  fd.append("n", "1");
  const r = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: fd,
  });
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 400)}`);
  const d = await r.json();
  return b64ToBytes(d.data[0].b64_json);
}

// ── Notion ───────────────────────────────────────────────────
async function notion(env, path, method, body) {
  const r = await fetch(`https://api.notion.com/v1/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.NOTION_TOKEN}`,
      "Notion-Version": "2022-06-28",
      "content-type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`Notion ${r.status}: ${(await r.text()).slice(0, 400)}`);
  return r.json();
}

export async function notionCreateOrder(env, o, origin) {
  if (!env.NOTION_TOKEN || !env.NOTION_DATABASE_ID) return null;
  const photoUrl = env.ADMIN_KEY ? `${origin}/api/img/uploads/${o.id}.jpg?key=${env.ADMIN_KEY}` : null;
  const page = await notion(env, "pages", "POST", {
    parent: { database_id: env.NOTION_DATABASE_ID },
    properties: {
      Cliente: { title: [{ text: { content: o.name } }] },
      Email: { email: o.email },
      WhatsApp: { phone_number: o.phone },
      Estado: { select: { name: "Nuevo" } },
      "Tamaño": { select: { name: o.sizeLabel } },
      Total: { number: o.price },
      "Seña": { number: o.deposit },
      "Pedido ID": { rich_text: [{ text: { content: o.id } }] },
      Preview: { url: o.previewUrl },
      "Foto original": { url: photoUrl },
      Notas: { rich_text: [{ text: { content: o.notes || "" } }] },
    },
  });
  return page.id;
}

export async function notionUpdate(env, pageId, properties) {
  if (!pageId || !env.NOTION_TOKEN) return;
  await notion(env, `pages/${pageId}`, "PATCH", { properties });
}

export async function notionGetStatus(env, pageId) {
  if (!pageId || !env.NOTION_TOKEN) return null;
  const p = await notion(env, `pages/${pageId}`, "GET");
  return p?.properties?.Estado?.select?.name || null;
}

// ── Mercado Pago ─────────────────────────────────────────────
export async function mpCreatePreference(env, o, origin) {
  const back = `${origin}/pedido?id=${o.id}`;
  const r = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.MP_ACCESS_TOKEN}`,
      "content-type": "application/json",
      "X-Idempotency-Key": o.id,
    },
    body: JSON.stringify({
      items: [{
        id: o.size,
        title: `Seña PequeYo (${o.sizeLabel})`,
        quantity: 1,
        unit_price: o.deposit,
        currency_id: "ARS",
      }],
      payer: { email: o.email, name: o.name },
      external_reference: o.id,
      back_urls: { success: back, pending: back, failure: back },
      auto_return: "approved",
      notification_url: `${origin}/api/mp-webhook`,
      statement_descriptor: BRAND.slice(0, 22),
    }),
  });
  if (!r.ok) throw new Error(`MP ${r.status}: ${(await r.text()).slice(0, 400)}`);
  const d = await r.json();
  return d.init_point;
}

export async function mpGetPayment(env, paymentId) {
  const r = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: `Bearer ${env.MP_ACCESS_TOKEN}` },
  });
  if (!r.ok) throw new Error(`MP payment ${r.status}`);
  return r.json();
}

// Valida la firma x-signature del webhook (si configuraste el secret).
export async function mpValidSignature(env, request, dataId) {
  if (!env.MP_WEBHOOK_SECRET) return true;
  const sig = request.headers.get("x-signature") || "";
  const reqId = request.headers.get("x-request-id") || "";
  const parts = Object.fromEntries(sig.split(",").map((p) => p.trim().split("=")));
  if (!parts.ts || !parts.v1) return false;
  const manifest = `id:${String(dataId).toLowerCase()};request-id:${reqId};ts:${parts.ts};`;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(env.MP_WEBHOOK_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(manifest));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex === parts.v1;
}

// ── Meshy: imagen → 3D (solo post-seña, opcional) ────────────
export async function meshyStart(env, imageBytes) {
  if (!env.MESHY_API_KEY) return null;
  const r = await fetch("https://api.meshy.ai/openapi/v1/image-to-3d", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.MESHY_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      image_url: `data:image/jpeg;base64,${bytesToB64(imageBytes)}`,
      should_texture: true,
    }),
  });
  if (!r.ok) throw new Error(`Meshy ${r.status}: ${(await r.text()).slice(0, 400)}`);
  const d = await r.json();
  return d.result;
}

export async function meshyGet(env, taskId) {
  const r = await fetch(`https://api.meshy.ai/openapi/v1/image-to-3d/${encodeURIComponent(taskId)}`, {
    headers: { Authorization: `Bearer ${env.MESHY_API_KEY}` },
  });
  if (!r.ok) throw new Error(`Meshy get ${r.status}`);
  return r.json();
}
