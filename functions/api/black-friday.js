// GET /api/black-friday?pagina=N -> produtos da página da Black Friday (ver lib/blackfriday.js)
// { ofertas, temMais, totais: { real, baixou, loja } }
import { listarBlackFriday } from "../../lib/blackfriday.js";

const POR_PAGINA = 48;
const MAX_PAGINA = 40;
const CACHE_SEGUNDOS = 30 * 60;

export async function onRequestGet({ request, env }) {
  if (!env.DB) return Response.json({ ofertas: [], temMais: false, totais: { real: 0, baixou: 0, loja: 0 } });
  const pagina = Math.min(Math.max(parseInt(new URL(request.url).searchParams.get("pagina"), 10) || 1, 1), MAX_PAGINA);
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const chave = new Request(new URL(`/api/black-friday?v=1&pagina=${pagina}`, request.url));
  const guardada = cache && (await cache.match(chave));
  if (guardada) return guardada;
  const dados = await listarBlackFriday(env.DB, pagina, POR_PAGINA);
  const resposta = Response.json({ ...dados, temMais: dados.temMais && pagina < MAX_PAGINA }, {
    headers: { "Cache-Control": `public, max-age=${CACHE_SEGUNDOS}`, "X-Robots-Tag": "noindex" },
  });
  if (cache) await cache.put(chave, resposta.clone());
  return resposta;
}
