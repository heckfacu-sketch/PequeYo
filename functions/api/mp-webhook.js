import { isId, getOrder, saveOrder, mpValidSignature, mpGetPayment, notionUpdate, meshyStart, telegram } from "../../lib/util.js";

const ok = () => new Response("ok");

// POST /api/mp-webhook  → Mercado Pago avisa pagos acá
export async function onRequestPost({ request, env }) {
  try {
    const url = new URL(request.url);
    const body = await request.json().catch(() => ({}));
    const type = body.type || url.searchParams.get("type") || url.searchParams.get("topic");
    const dataId = String(body?.data?.id || url.searchParams.get("data.id") || url.searchParams.get("id") || "");
    if (type !== "payment" || !dataId) return ok();

    if (!(await mpValidSignature(env, request, dataId))) return new Response("bad signature", { status: 401 });

    // Nunca confiamos en el aviso: consultamos el pago real a MP.
    const pay = await mpGetPayment(env, dataId);
    const id = pay.external_reference;
    if (!isId(id)) return ok();
    const order = await getOrder(env, id);
    if (!order || order.paidAt) return ok();
    if (pay.status !== "approved") return ok();

    order.status = "sena_pagada";
    order.paidAt = new Date().toISOString();
    order.paymentId = dataId;
    order.amountPaid = Number(pay.transaction_amount);
    const shortPaid = order.amountPaid < order.deposit;

    // 3D automático (opcional, solo si cargaste MESHY_API_KEY)
    if (env.MESHY_API_KEY) {
      try {
        const prev = await env.BUCKET.get(`previews/${id}.jpg`);
        if (prev) {
          order.meshyTaskId = await meshyStart(env, new Uint8Array(await prev.arrayBuffer()));
          order.model3d = "generando";
        }
      } catch (e) {
        console.error("meshy start", e);
        order.model3d = "error";
      }
    }

    await saveOrder(env, order);
    try {
      await notionUpdate(env, order.notionPageId, { Estado: { select: { name: "Seña pagada" } } });
    } catch (e) {
      console.error("notion", e);
    }
    await telegram(
      env,
      `💰 Seña pagada${shortPaid ? " ⚠️ MONTO MENOR AL ESPERADO" : ""}\n${order.name} · ${order.sizeLabel}\nPagó: $${order.amountPaid.toLocaleString("es-AR")}\nWhatsApp: ${order.phone}`
    );
    return ok();
  } catch (e) {
    console.error("webhook", e);
    return new Response("error", { status: 500 }); // MP reintenta
  }
}
