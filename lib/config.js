// ─────────────────────────────────────────────────────────────
// Configuración del negocio. Editá acá precios, tamaños y textos.
// ─────────────────────────────────────────────────────────────

// Marca. NO uses "Funko" en el nombre, logo ni dominio.
export const BRAND = "PequeYo";

// Precios en ARS. "deposit" es la seña que se cobra por Mercado Pago.
export const SIZES = {
  chica:   { label: "Chica · 10 cm",   price: 25000, deposit: 10000 },
  mediana: { label: "Mediana · 15 cm", price: 35000, deposit: 15000 },
  grande:  { label: "Grande · 20 cm",  price: 48000, deposit: 20000 },
};

// Topes para que nadie te funda el saldo de la API.
export const LIMITS = {
  previewsPerEmailPerDay: 3,
  previewsPerIpPerDay: 6,
  maxUploadBytes: 8 * 1024 * 1024,
};

// Prompt de la vista previa 2D. Sin marcas registradas a propósito.
export const PREVIEW_PROMPT = `Transform the person in this photo into a stylized collectible vinyl toy figurine.
Style: oversized head (about 1.6 times the body height), small simplified body, large round solid black eyes with a tiny white highlight, tiny or no nose, minimal mouth, smooth matte vinyl material, clean sculpted shapes.
Keep the person recognizable: same hairstyle and hair color, skin tone, facial hair, glasses, accessories and outfit colors.
Composition: full body, standing, front three-quarter view, centered, plain soft light-gray studio background, soft floor shadow, product photography, sharp focus.
Do not add any text, logos, brand names, packaging or box.`;
