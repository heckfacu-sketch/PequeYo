const $ = (id) => document.getElementById(id);
const id = new URLSearchParams(location.search).get("id");

// Mismos nombres que la columna "Estado" en Notion
const STEPS = ["Esperando seña", "Seña pagada", "Modelando", "Aprobación del cliente", "Impresión y pintura", "Enviado"];

async function load() {
  if (!id) { $("subtitle").textContent = "Link inválido."; return; }
  let d;
  try {
    const r = await fetch(`/api/pedido?id=${encodeURIComponent(id)}`);
    d = await r.json();
    if (!r.ok) throw new Error(d.error);
  } catch (e) {
    $("subtitle").textContent = e.message || "No pudimos cargar el pedido.";
    return;
  }

  $("title").textContent = d.name ? `¡Hola, ${d.name.split(" ")[0]}!` : "Tu pedido";
  $("subtitle").textContent = d.sizeLabel ? `Figura ${d.sizeLabel} · Estado: ${d.estado}` : `Estado: ${d.estado}`;
  $("previewImg").src = d.previewUrl;

  const estado = d.estado === "Nuevo" ? "Esperando seña" : d.estado;
  const idx = Math.max(0, STEPS.indexOf(estado));
  $("timeline").innerHTML = STEPS.map((s, i) =>
    `<li class="${i < idx ? "done" : i === idx ? "now" : ""}">${s}</li>`).join("");

  if (d.checkoutUrl) {
    $("payBtn").href = d.checkoutUrl;
    $("payBtn").classList.remove("hidden");
  } else $("payBtn").classList.add("hidden");

  if (d.modelUrl) {
    $("mv").src = d.modelUrl;
    $("modelBox").classList.remove("hidden");
    $("modelWait").classList.add("hidden");
  } else if (d.model3d === "generando") {
    $("modelWait").classList.remove("hidden");
    $("progress").textContent = d.model3dProgress != null ? `${d.model3dProgress}%` : "";
    setTimeout(load, 25000);
  } else if (d.status === "pendiente_pago") {
    setTimeout(load, 8000); // por si el webhook de MP llega unos segundos después
  }
}

load();
