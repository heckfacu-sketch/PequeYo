// GET /api/img/previews/<id>.jpg | models/<id>.glb | uploads/<id>.jpg?key=ADMIN_KEY
export async function onRequestGet({ params, request, env }) {
  const key = (Array.isArray(params.path) ? params.path : [params.path]).join("/");
  if (!/^(previews|models|uploads)\/[0-9a-f-]{36}\.(jpg|glb)$/.test(key)) {
    return new Response("Not found", { status: 404 });
  }

  // Las fotos originales son privadas: solo vos con ADMIN_KEY
  const isPrivate = key.startsWith("uploads/");
  if (isPrivate) {
    const k = new URL(request.url).searchParams.get("key");
    if (!env.ADMIN_KEY || k !== env.ADMIN_KEY) return new Response("Forbidden", { status: 403 });
  }

  const obj = await env.BUCKET.get(key);
  if (!obj) return new Response("Not found", { status: 404 });

  const h = new Headers();
  obj.writeHttpMetadata(h);
  h.set("etag", obj.httpEtag);
  h.set("cache-control", isPrivate ? "private, no-store" : "public, max-age=86400");
  h.set("x-robots-tag", "noindex");
  return new Response(obj.body, { headers: h });
}
