// GET /api/quedas?pagina=N -> página "Quedas de preço" (lib/blackfriday.js, listarQuedas): produtos conferidos pelo nosso
// histórico cujo preço baixou nos últimos 7 dias, dos que caíram hoje para os mais antigos
// { ofertas: [{ …oferta, queda: { dia, antes } }], temMais, totais: { hoje, ontem, semana }, hoje }
import { listarQuedas, nivelBlackFriday } from "../../lib/blackfriday.js";
import { ofertaDeLojaRemovida } from "../../lib/lojasRemovidas.js";
import { semDescontoFalso } from "../../lib/ofertas.js";

const POR_PAGINA = 48;
const MAX_PAGINA = 40;
const CACHE_SEGUNDOS = 15 * 60;

export async function onRequestGet({ request, env }) {
  const vazio = { ofertas: [], temMais: false, totais: { hoje: 0, ontem: 0, semana: 0 } };
  if (!env.DB) return Response.json(vazio);
  const pagina = Math.min(Math.max(parseInt(new URL(request.url).searchParams.get("pagina"), 10) || 1, 1), MAX_PAGINA);
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const chave = new Request(new URL(`/api/quedas?v=1&pagina=${pagina}`, request.url));
  const guardada = cache && (await cache.match(chave));
  if (guardada) return guardada;
  const dados = await listarQuedas(env.DB, pagina, POR_PAGINA);
  // Lojas tiradas do site e regras novas valem na hora; preço riscado = o de costume (como na Black Friday)
  dados.ofertas = dados.ofertas.filter((o) => !ofertaDeLojaRemovida(o) && nivelBlackFriday(o)?.nivel <= 2).map(semDescontoFalso);
  const semNada = !dados.ofertas.length;
  const resposta = Response.json({ ...dados, temMais: dados.temMais && pagina < MAX_PAGINA }, {
    headers: { "Cache-Control": semNada ? "no-store" : `public, max-age=${CACHE_SEGUNDOS}`, "X-Robots-Tag": "noindex" },
  });
  if (cache && !semNada) await cache.put(chave, resposta.clone());
  return resposta;
}
