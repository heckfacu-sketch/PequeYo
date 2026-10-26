# PequeYo — Vos, en chiquito

Web donde el cliente sube una foto, ve una vista previa de su figura estilo vinilo coleccionable, paga la seña con Mercado Pago y sigue su pedido. Vos modelás la figura real.

> **Marca:** se escribe siempre **PequeYo**. Nunca uses "Funko" ni "Funko Pop" en el nombre, dominio, logo, textos ni publicidad (es marca registrada de otra empresa). Decí "figura estilo cabezón" o "figura coleccionable".

## Cómo funciona

```
Cliente sube foto ─► /api/preview ─► OpenAI (gpt-image) ─► vista previa con marca de agua
       │                                   (foto y preview se guardan en R2)
       ▼
Elige tamaño + datos ─► /api/order ─► fila en Notion + Telegram + link de Mercado Pago
       │
       ▼
Paga la seña ─► MP llama /api/mp-webhook ─► Notion "Seña pagada" + Telegram
       │                                   └► (opcional) Meshy arranca un boceto 3D
       ▼
/pedido?id=... ─► el cliente ve el Estado que vos ponés en Notion y el visor 3D
```

## Stack y costos

| Pieza | Para qué | Costo |
|---|---|---|
| GitHub | Código | Gratis |
| Cloudflare Workers + Static Assets | Web y backend (esconde las API keys) | Gratis (100.000 requests/día) |
| Cloudflare R2 | Fotos, previews, pedidos, modelos | Gratis hasta 10 GB |
| Cloudflare KV | Límite de previews por email/IP | Gratis |
| Cloudflare Turnstile | Captcha anti-bots | Gratis |
| Notion | Tablero de pedidos | Gratis |
| Telegram | Avisos al celular | Gratis |
| Mercado Pago Checkout Pro | Seña | Solo comisión por venta |
| OpenAI Images API | Vista previa 2D | Centavos de USD por imagen (calidad baja) |
| Meshy API (opcional) | Boceto 3D automático post-seña | Requiere plan pago con API |

Dominio propio (.com.ar en NIC Argentina o .com) es opcional: Cloudflare te da `pequeyo.heckfacu.workers.dev` gratis.

---

## Puesta en marcha (paso a paso)

### 1. GitHub
1. Creá un repo privado (ej. `pequeyo`) y subí esta carpeta.
2. Nunca subas `.dev.vars` (ya está en `.gitignore`).

### 2. Cloudflare (cuenta gratis en dash.cloudflare.com)
1. **R2** → Create bucket → nombre `pequeyo`. (R2 pide cargar tarjeta aunque uses el tier gratis.)
2. **R2 → pequeyo → Settings → Object lifecycle rules**:
   - Prefijo `uploads/` → borrar a los 30 días.
   - Prefijo `previews/` → borrar a los 60 días.
   - (No pongas regla sobre `orders/` ni `models/`.)
3. **Workers & Pages → KV** → Create namespace `pequeyo-rate` → copiá el ID y pegalo en `wrangler.toml` (`REEMPLAZAR_CON_EL_ID_DEL_KV`).
4. **Turnstile** → Add widget → dominio `pequeyo.heckfacu.workers.dev` (y tu dominio si tenés) → copiá **Site key** (va en `wrangler.toml` → `TURNSTILE_SITE_KEY`) y **Secret key**.
5. **Workers & Pages → pequeyo** (Worker conectado al repo de GitHub, deploy command `npx wrangler deploy`). Los bindings de R2, KV y assets los toma de `wrangler.toml`.
6. **pequeyo → Settings → Variables and Secrets** → cargá como *Secret*:

| Nombre | De dónde sale |
|---|---|
| `OPENAI_API_KEY` | platform.openai.com → API keys |
| `TURNSTILE_SECRET` | Paso 2.4 |
| `ADMIN_KEY` | Inventá una clave larga (para ver fotos originales desde Notion) |
| `NOTION_TOKEN` | Paso 4 |
| `NOTION_DATABASE_ID` | `7b712af1d87f43dd8194cfbe3e2985ed` (ya creada) |
| `MP_ACCESS_TOKEN` | Paso 5 |
| `MP_WEBHOOK_SECRET` | Paso 5 |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | Paso 6 |
| `MESHY_API_KEY` | Opcional (paso 7) |

7. Redeploy. Cada push a GitHub publica solo.

### 3. OpenAI
1. platform.openai.com → Billing → cargá USD 5–10.
2. **Limits → poné un tope de gasto mensual** (ej. USD 10).
3. Si `gpt-image-2` no aparece en tu cuenta, cambiá `OPENAI_IMAGE_MODEL` en `wrangler.toml` por el modelo de imágenes que tengas habilitado.
4. `OPENAI_IMAGE_QUALITY`: `low` (más barato) o `medium` (mejor parecido).

### 4. Notion
La base **Pedidos PequeYo** ya está creada con las columnas que usa el código.
1. notion.so/profile/integrations → New integration (interna) → copiá el token → `NOTION_TOKEN`.
2. Abrí la base → `···` → Connections → agregá tu integración.
3. No renombres columnas ni opciones de **Estado**: la web las usa tal cual.

Estados: `Nuevo` → `Seña pagada` → `Modelando` → `Aprobación del cliente` → `Impresión y pintura` → `Enviado` (o `Cancelado`). Lo que pongas acá lo ve el cliente en su link.

### 5. Mercado Pago
1. mercadopago.com.ar/developers → Tus integraciones → Crear aplicación (Checkout Pro).
2. Probá primero con credenciales de **prueba** (`TEST-...`) y usuarios de prueba.
3. Para vender: credenciales de **producción** → `MP_ACCESS_TOKEN`.
4. Webhooks → URL `https://pequeyo.heckfacu.workers.dev/api/mp-webhook`, evento **Pagos** → copiá la clave secreta → `MP_WEBHOOK_SECRET`.
5. La web nunca confía en el aviso: vuelve a consultar el pago a MP antes de marcarlo pagado.

### 6. Telegram
1. Hablale a **@BotFather** → `/newbot` → token → `TELEGRAM_BOT_TOKEN`.
2. Mandale cualquier mensaje a tu bot y abrí `https://api.telegram.org/bot<TOKEN>/getUpdates` → copiá `chat.id` → `TELEGRAM_CHAT_ID`.

### 7. Boceto 3D automático (opcional)
- Sin `MESHY_API_KEY` todo funciona igual: el 3D lo hacés vos y mandás renders.
- Con la clave, al pagarse la seña se genera un boceto girable que el cliente ve en su link y te llega por Telegram.
- Para probar sin gastar: `MESHY_API_KEY=msy_dummy_api_key_for_test_mode_12345678`.
- Revisá licencias: lo generado en planes gratis de estas herramientas suele ser CC BY, no comercial pleno.

---

## Automatizaciones

| # | Qué | Dónde |
|---|---|---|
| 1 | Deploy automático en cada push | Cloudflare Workers Builds + GitHub |
| 2 | Pedido nuevo → fila en Notion + Telegram | `/api/order` |
| 3 | Seña pagada → Notion + Telegram (+ 3D opcional) | `/api/mp-webhook` |
| 4 | Fotos que se borran solas | Reglas de ciclo de vida en R2 |
| 5 | Antiabuso: captcha + 3 previews/día por email, 6 por IP | Turnstile + KV |
| 6 | **Tarea programada de Claude** lun–sáb 8:38: lee Notion, deja borradores en Gmail, bloquea tiempo de modelado en Calendar y te manda un resumen | Claude (scheduled task "Pedidos PequeYo diario") |

## Probar en tu compu

```bash
npm install
cp .dev.vars.example .dev.vars   # completá OPENAI_API_KEY
npm run dev                      # http://localhost:8787
```
En local, con `DEV=1`, no hace falta Turnstile. El webhook de MP solo funciona con la web publicada.

## Dónde editar

- Precios, tamaños, seña, límites, prompt → `lib/config.js`
- Textos y diseño → `public/index.html`, `public/styles.css` (tokens del design system PequeYo: paleta, Fredoka + Nunito Sans, radios y espaciado)
- Pasos del seguimiento → `public/pedido.js` (`STEPS`, deben coincidir con Estado en Notion)

## Estructura

```
lib/config.js            precios, prompt, límites
lib/util.js              OpenAI, Notion, MP, Meshy, Telegram, R2, Turnstile
src/index.js             entrada del Worker: rutea /api/* y sirve public/
functions/api/config.js  GET  datos públicos
functions/api/preview.js POST foto → vista previa
functions/api/order.js   POST pedido → Notion + link de MP
functions/api/mp-webhook.js  POST aviso de pago
functions/api/pedido.js  GET  estado del pedido (+ boceto 3D)
functions/api/img/[[path]].js  sirve previews/modelos (fotos originales solo con ADMIN_KEY)
public/                  web (index, pedido, privacidad)
```
