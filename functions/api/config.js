import { json } from "../../lib/util.js";
import { BRAND, SIZES } from "../../lib/config.js";

// GET /api/config → datos públicos que necesita el frontend
export async function onRequestGet({ env }) {
  return json(
    {
      brand: BRAND,
      sizes: SIZES,
      turnstileSiteKey: env.TURNSTILE_SITE_KEY || null,
      whatsapp: env.CONTACT_WHATSAPP || null,
    },
    200,
    { "cache-control": "public, max-age=300" }
  );
}
