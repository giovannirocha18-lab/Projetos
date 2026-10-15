// GET /api/historico?id=awin-105615-1001 -> preços de um produto ao longo do tempo
// (só os dias em que o preço mudou; o gráfico do site desenha em degraus)
const CACHE_SEGUNDOS = 60 * 60;

function responder(dados, status = 200) {
  return new Response(JSON.stringify(dados), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": `public, max-age=${status === 200 ? CACHE_SEGUNDOS : 0}`,
      "X-Robots-Tag": "noindex",
    },
  });
}

export async function onRequestGet({ request, env }) {
  const id = (new URL(request.url).searchParams.get("id") || "").slice(0, 120);
  if (!id || !env.DB) return responder({ erro: "Produto não informado" }, 400);
  try {
    const { results } = await env.DB.prepare(
      "SELECT dia, preco FROM precos WHERE oferta_id = ? ORDER BY dia",
    ).bind(id).all();
    const atual = await env.DB.prepare("SELECT preco FROM ofertas WHERE id = ?").bind(id).first();
    return responder({ id, pontos: results, atual: atual?.preco ?? null });
  } catch {
    return responder({ id, pontos: [], atual: null });
  }
}
