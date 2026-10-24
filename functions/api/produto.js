// GET /api/produto?id=shopee-123 -> um produto (abre a janela "Ver detalhes" de um link compartilhado)
import { produtoPorId } from "../../lib/produto.js";

const responder = (dados, status = 200) => new Response(JSON.stringify(dados), {
  status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": `public, max-age=${status === 200 ? 1800 : 60}`,
    "X-Robots-Tag": "noindex",
  },
});

export async function onRequestGet({ request, env }) {
  const id = new URL(request.url).searchParams.get("id") || "";
  try {
    const oferta = await produtoPorId(env, id);
    return oferta ? responder({ oferta }) : responder({ erro: "Produto não encontrado" }, 404);
  } catch {
    return responder({ erro: "A loja não respondeu agora" }, 502);
  }
}
