import { json, err, isId, getOrder, saveOrder, meshyGet, notionUpdate, notionGetStatus, telegram } from "../../lib/util.js";

const BASE_LABEL = {
  preview: "Vista previa",
  pendiente_pago: "Esperando seña",
  sena_pagada: "Seña pagada",
};

// GET /api/pedido?id=...  → estado para la página del cliente
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!isId(id)) return err("Pedido inválido.");
  const order = await getOrder(env, id);
  if (!order) return err("No encontramos el pedido.", 404);

  // Si hay 3D en curso, consultamos a Meshy (máx. cada 20 s)
  if (order.meshyTaskId && !order.modelKey && order.model3d === "generando" && env.MESHY_API_KEY) {
    const last = order.meshyCheckedAt ? Date.parse(order.meshyCheckedAt) : 0;
    if (Date.now() - last > 20000) {
      order.meshyCheckedAt = new Date().toISOString();
      try {
        const t = await meshyGet(env, order.meshyTaskId);
        order.model3dProgress = t.progress ?? null;
        if (t.status === "SUCCEEDED" && t.model_urls?.glb) {
          const glb = await fetch(t.model_urls.glb);
          if (glb.ok) {
            await env.BUCKET.put(`models/${id}.glb`, await glb.arrayBuffer(), {
              httpMetadata: { contentType: "model/gltf-binary" },
            });
            order.modelKey = `models/${id}.glb`;
            order.model3d = "listo";
            const modelUrl = `${url.origin}/api/img/models/${id}.glb`;
            try { await notionUpdate(env, order.notionPageId, { "Modelo 3D": { url: modelUrl } }); } catch (e) { console.error(e); }
            await telegram(env, `🧊 Modelo 3D automático listo: ${order.name}\n${modelUrl}`);
          }
        } else if (["FAILED", "CANCELED", "EXPIRED"].includes(t.status)) {
          order.model3d = "error";
        }
      } catch (e) {
        console.error("meshy get", e);
      }
      await saveOrder(env, order);
    }
  }

  // El estado "real" lo manejás vos en Notion (Modelando, Impresión, Enviado…)
  let estado = BASE_LABEL[order.status] || order.status;
  if (order.notionPageId) {
    try { estado = (await notionGetStatus(env, order.notionPageId)) || estado; } catch (e) { console.error(e); }
  }

  return json(
    {
      estado,
      status: order.status,
      name: order.name || null,
      sizeLabel: order.sizeLabel || null,
      deposit: order.deposit || null,
      price: order.price || null,
      checkoutUrl: order.status === "pendiente_pago" ? order.checkoutUrl || null : null,
      previewUrl: `/api/img/previews/${id}.jpg`,
      model3d: order.model3d || null,
      model3dProgress: order.model3dProgress ?? null,
      modelUrl: order.modelKey ? `/api/img/${order.modelKey}` : null,
    },
    200,
    { "cache-control": "no-store" }
  );
}
