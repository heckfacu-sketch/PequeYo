const $ = (id) => document.getElementById(id);
const ars = (n) => "$" + Number(n).toLocaleString("es-AR");

let cfg = { sizes: {}, turnstileSiteKey: null };
let photoBlob = null;
let previewId = null;
let turnstileWidget = null;
let selectedSize = null;

// ── Config ───────────────────────────────────────────────────
async function loadConfig() {
  try {
    cfg = await (await fetch("/api/config")).json();
  } catch {}
  renderSizes();
  if (cfg.whatsapp) {
    const a = $("waLink");
    a.href = `https://wa.me/${cfg.whatsapp.replace(/\D/g, "")}`;
    a.classList.remove("hidden");
  }
  if (cfg.turnstileSiteKey) {
    const tryRender = () => {
      if (window.turnstile) {
        turnstileWidget = window.turnstile.render("#turnstile", { sitekey: cfg.turnstileSiteKey, theme: "auto" });
      } else setTimeout(tryRender, 200);
    };
    tryRender();
  }
}

function renderSizes() {
  const box = $("sizes");
  box.innerHTML = "";
  Object.entries(cfg.sizes || {}).forEach(([key, s], i) => {
    const el = document.createElement("label");
    el.className = "size";
    el.innerHTML = `<input type="radio" name="size" value="${key}"><strong>${s.label}</strong><span>${ars(s.price)}</span>`;
    el.addEventListener("click", () => selectSize(key));
    box.appendChild(el);
    if (i === 1) selectSize(key);
  });
}

function selectSize(key) {
  selectedSize = key;
  document.querySelectorAll(".size").forEach((el) => {
    el.classList.toggle("sel", el.querySelector("input").value === key);
  });
  const s = cfg.sizes[key];
  if (s) $("depositNote").textContent = `Seña ${ars(s.deposit)} ahora · resto ${ars(s.price - s.deposit)} antes del envío.`;
}

// ── Foto: elegir y achicar en el navegador ───────────────────
const drop = $("drop");
const input = $("photo");
drop.addEventListener("click", () => input.click());
drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") input.click(); });
drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
drop.addEventListener("dragleave", () => drop.classList.remove("over"));
drop.addEventListener("drop", (e) => {
  e.preventDefault(); drop.classList.remove("over");
  if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
});
input.addEventListener("change", () => input.files[0] && handleFile(input.files[0]));

async function handleFile(file) {
  if (!/^image\//.test(file.type)) return showMsg("previewMsg", "Elegí una imagen.", "error");
  try {
    photoBlob = await resize(file, 1024);
    $("dropImg").src = URL.createObjectURL(photoBlob);
    $("dropImg").classList.remove("hidden");
    $("dropEmpty").classList.add("hidden");
    hideMsg("previewMsg");
  } catch {
    showMsg("previewMsg", "No pudimos leer esa imagen. Probá con otra.", "error");
  }
}

function resize(file, max) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      c.toBlob((b) => (b ? resolve(b) : reject()), "image/jpeg", 0.9);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

// ── Generar vista previa ─────────────────────────────────────
const loadingLines = [
  "Esculpiendo tu cabeza gigante…",
  "Agrandando los ojitos…",
  "Lijando el vinilo…",
  "Eligiendo la mejor pose…",
  "Últimos retoques de pintura…",
];
let loadingTimer;

$("previewForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  hideMsg("previewMsg");
  const email = $("email").value.trim();
  if (!photoBlob) return showMsg("previewMsg", "Primero elegí una foto.", "error");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return showMsg("previewMsg", "Revisá el email.", "error");
  if (!$("consent").checked) return showMsg("previewMsg", "Necesitamos tu consentimiento para usar la foto.", "error");

  const fd = new FormData();
  fd.append("photo", photoBlob, "foto.jpg");
  fd.append("email", email);
  fd.append("consent", "on");
  if (window.turnstile && turnstileWidget !== null) {
    fd.append("cf-turnstile-response", window.turnstile.getResponse(turnstileWidget) || "");
  }

  setState("loading");
  $("genBtn").disabled = true;
  let i = 0;
  loadingTimer = setInterval(() => ($("loadingText").textContent = loadingLines[++i % loadingLines.length]), 4000);

  try {
    const r = await fetch("/api/preview", { method: "POST", body: fd });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || "Error");
    previewId = d.id;
    $("previewImg").src = d.previewUrl;
    setState("done");
    $("orderForm").classList.remove("hidden");
    $("genBtn").textContent = "Probar con otra foto";
  } catch (err) {
    setState("empty");
    showMsg("previewMsg", err.message, "error");
  } finally {
    clearInterval(loadingTimer);
    $("genBtn").disabled = false;
    if (window.turnstile && turnstileWidget !== null) window.turnstile.reset(turnstileWidget);
  }
});

function setState(s) {
  $("resEmpty").classList.toggle("hidden", s !== "empty");
  $("resLoading").classList.toggle("hidden", s !== "loading");
  $("resDone").classList.toggle("hidden", s !== "done");
}

// ── Pedido + seña ────────────────────────────────────────────
$("orderForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  hideMsg("orderMsg");
  if (!previewId) return;
  const body = {
    id: previewId,
    size: selectedSize,
    name: $("name").value.trim(),
    phone: $("phone").value.trim(),
    notes: $("notes").value.trim(),
  };
  if (!body.name) return showMsg("orderMsg", "Completá tu nombre.", "error");
  if (body.phone.replace(/\D/g, "").length < 8) return showMsg("orderMsg", "Completá tu WhatsApp.", "error");

  $("orderBtn").disabled = true;
  showMsg("orderMsg", "Te llevamos a Mercado Pago…", "info");
  try {
    const r = await fetch("/api/order", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || "Error");
    location.href = d.checkoutUrl;
  } catch (err) {
    showMsg("orderMsg", err.message, "error");
    $("orderBtn").disabled = false;
  }
});

function showMsg(id, text, kind) {
  const el = $(id);
  el.textContent = text;
  el.className = `msg show ${kind}`;
}
function hideMsg(id) { $(id).className = "msg"; }

loadConfig();
