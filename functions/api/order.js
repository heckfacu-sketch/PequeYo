import { json, err, isId, getOrder, saveOrder, notionCreateOrder, mpCreatePreference, telegram } from "../../lib/util.js";
import { SIZES } from "../../lib/config.js";

const ars = (n) => `$${Number(n).toLocaleString("es-AR")}`;

// POST /api/order  { id, name, phone, size, notes }
export async function onRequestPost({ request, env }) {
  try {
    const b = await request.json().catch(() => ({}));
    const id = b.id;
    if (!isId(id)) return err("Pedido inválido.");

    const order = await getOrder(env, id);
    if (!order) return err("No encontramos tu vista previa. Generala de nuevo.", 404);
    if (order.status !== "preview") {
      return json({ checkoutUrl: order.checkoutUrl || `/pedido?id=${id}` });
    }

    const s = SIZES[b.size];
    const name = String(b.name || "").trim();
    const phone = String(b.phone || "").trim();
    if (!s) return err("Elegí un tamaño.");
    if (name.length < 2 || name.length > 80) return err("Completá tu nombre.");
    if (phone.replace(/\D/g, "").length < 8 || phone.length > 30) return err("Completá un WhatsApp válido.");

    const origin = new URL(request.url).origin;
    Object.assign(order, {
      name,
      phone,
      size: b.size,
      sizeLabel: s.label,
      price: s.price,
      deposit: s.deposit,
      notes: String(b.notes || "").slice(0, 500),
      status: "pendiente_pago",
      previewUrl: `${origin}/api/img/previews/${id}.jpg`,
    });

    try {
      order.notionPageId = await notionCreateOrder(env, order, origin);
    } catch (e) {
      console.error("notion", e);
    }

    if (env.MP_ACCESS_TOKEN) order.checkoutUrl = await mpCreatePreference(env, order, origin);
    await saveOrder(env, order);

    await telegram(
      env,
      `🆕 Pedido nuevo (falta seña)\n${name} · ${s.label}\nWhatsApp: ${phone}\nSeña: ${ars(s.deposit)} / Total: ${ars(s.price)}\n${order.previewUrl}`
    );

    return json({ checkoutUrl: order.checkoutUrl || `${origin}/pedido?id=${id}` });
  } catch (e) {
    console.error("order", e);
    return err("No pudimos crear el pedido. Probá de nuevo en un minuto.", 500);
  }
}
