// GET /api/frete-gratis?pagina=N -> Ofertas do dia com frete grátis (08/11/2026, pedido do Giovanni: o botão "🚚 Frete grátis"
// da página inicial abria com 41 e só crescia rolando). Hoje só o Mercado Livre informa frete grátis: são as ofertas do dia
// dele (mais vendidos com 5% a 60% de desconto) que têm frete grátis. { ofertas, total, temMais }
import { mercadolivre } from "../../lib/fontes/mercadolivre.js";

const MAX_PAGINA = 60;
const CACHE_SEGUNDOS = 15 * 60;

export async function onRequestGet({ request, env, waitUntil }) {
  const vazio = { ofertas: [], total: 0, temMais: false };
  if (!env.DB || !mercadolivre.ativa?.(env)) return Response.json(vazio);
  const pagina = Math.min(Math.max(parseInt(new URL(request.url).searchParams.get("pagina"), 10) || 1, 1), MAX_PAGINA);
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const chave = new Request(new URL(`/api/frete-gratis?v=1&pagina=${pagina}`, request.url));
  const guardada = cache && (await cache.match(chave));
  if (guardada) return guardada;
  const dados = await mercadolivre.ofertasFreteGratis(env, pagina).catch(() => vazio);
  const resposta = Response.json({ ...dados, temMais: dados.temMais && pagina < MAX_PAGINA }, {
    headers: { "Cache-Control": dados.ofertas.length ? `public, max-age=${CACHE_SEGUNDOS}` : "no-store", "X-Robots-Tag": "noindex" },
  });
  if (cache && dados.ofertas.length) waitUntil(cache.put(chave, resposta.clone()).catch(() => {}));
  return resposta;
}
