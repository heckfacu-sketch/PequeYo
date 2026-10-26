// Entrada del Worker: rutea /api/* a los handlers y el resto a los archivos de /public
import * as config from "../functions/api/config.js";
import * as preview from "../functions/api/preview.js";
import * as order from "../functions/api/order.js";
import * as mpWebhook from "../functions/api/mp-webhook.js";
import * as pedido from "../functions/api/pedido.js";
import * as img from "../functions/api/img/[[path]].js";

const routes = {
  "/api/config": config,
  "/api/preview": preview,
  "/api/order": order,
  "/api/mp-webhook": mpWebhook,
  "/api/pedido": pedido,
};

function pick(mod, method) {
  if (method === "GET" || method === "HEAD") return mod.onRequestGet;
  if (method === "POST") return mod.onRequestPost;
  return null;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    let mod = routes[path];
    let params = {};
    if (!mod && path.startsWith("/api/img/")) {
      mod = img;
      params = { path: path.slice("/api/img/".length).split("/") };
    }

    if (mod) {
      const handler = pick(mod, request.method);
      if (!handler) return new Response("Method not allowed", { status: 405 });
      return handler({ request, env, ctx, params });
    }
    if (path.startsWith("/api/")) return new Response("Not found", { status: 404 });

    return env.ASSETS.fetch(request);
  },
};
