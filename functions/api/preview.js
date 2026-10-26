import { json, err, newId, isEmail, verifyTurnstile, hitLimit, saveOrder, openaiPreview } from "../../lib/util.js";
import { LIMITS } from "../../lib/config.js";

// POST /api/preview  (multipart: photo, email, consent, cf-turnstile-response)
export async function onRequestPost({ request, env }) {
  try {
    const ip = request.headers.get("cf-connecting-ip") || "local";
    const form = await request.formData();
    const photo = form.get("photo");
    const email = String(form.get("email") || "").trim().toLowerCase();
    const consent = form.get("consent");
    const token = form.get("cf-turnstile-response");

    if (!(photo instanceof File) || !photo.size) return err("Subí una foto.");
    if (!/^image\/(jpeg|png|webp)$/.test(photo.type)) return err("La foto tiene que ser JPG, PNG o WEBP.");
    if (photo.size > LIMITS.maxUploadBytes) return err("La foto es muy pesada (máx. 8 MB).");
    if (!isEmail(email)) return err("Revisá el email.");
    if (!consent) return err("Necesitamos tu consentimiento para usar la foto.");

    if (!(await verifyTurnstile(env, token, ip))) {
      return err("No pudimos verificar que seas humano. Recargá la página.", 403);
    }
    if (
      (await hitLimit(env, `ip:${ip}`, LIMITS.previewsPerIpPerDay)) ||
      (await hitLimit(env, `em:${email}`, LIMITS.previewsPerEmailPerDay))
    ) {
      return err("Llegaste al límite de vistas previas por hoy. Probá mañana o escribinos.", 429);
    }

    const bytes = new Uint8Array(await photo.arrayBuffer());
    const id = newId();
    await env.BUCKET.put(`uploads/${id}.jpg`, bytes, {
      httpMetadata: { contentType: photo.type },
      customMetadata: { email },
    });

    const preview = await openaiPreview(env, bytes, photo.type);
    await env.BUCKET.put(`previews/${id}.jpg`, preview, { httpMetadata: { contentType: "image/jpeg" } });

    await saveOrder(env, { id, email, status: "preview", createdAt: new Date().toISOString() });
    return json({ id, previewUrl: `/api/img/previews/${id}.jpg` });
  } catch (e) {
    console.error("preview", e);
    return err("No pudimos generar la vista previa. Probá con otra foto: de frente, con buena luz y una sola persona.", 500);
  }
}
