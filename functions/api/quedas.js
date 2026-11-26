// GET /api/quedas?pagina=N -> página "Quedas de preço" (lib/blackfriday.js, listarQuedas): produtos conferidos pelo nosso
// histórico cujo preço baixou nos últimos 7 dias, dos que caíram hoje para os mais antigos
// { ofertas: [{ …oferta, queda: { dia, antes } }], temMais, totais: { hoje, ontem, semana }, hoje }
import { listarQuedas, listarQuedasDaBusca, nivelBlackFriday } from "../../lib/blackfriday.js";
import { filtroDeBusca, MAX_DA_BUSCA } from "../../lib/buscaEspecial.js";
import { ofertaDeLojaRemovida, listaSoComNovos } from "../../lib/lojasRemovidas.js";
import { semDescontoFalso } from "../../lib/ofertas.js";
import { comSecaoCerta } from "../../lib/categorias.js";

const POR_PAGINA = 48;
const MAX_PAGINA = 40;
const CACHE_SEGUNDOS = 15 * 60; // no Cloudflare; no navegador só 2 min, para correção nossa aparecer logo (16/11/2026)

export async function onRequestGet({ request, env }) {
  const vazio = { ofertas: [], temMais: false, totais: { hoje: 0, ontem: 0, semana: 0 } };
  if (!env.DB) return Response.json(vazio);
  // Busca dentro da página (22/11/2026): /api/quedas?q=geladeira -> { ofertas, busca, completo, temMais: false, hoje }
  if (new URL(request.url).searchParams.has("q")) return daBusca(request, env, filtroDeBusca(new URL(request.url).searchParams.get("q")));
  const pagina = Math.min(Math.max(parseInt(new URL(request.url).searchParams.get("pagina"), 10) || 1, 1), MAX_PAGINA);
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const chave = new Request(new URL(`/api/quedas?v=14&pagina=${pagina}`, request.url));
  const guardada = cache && (await cache.match(chave));
  if (guardada) return guardada;
  const dados = await listarQuedas(env.DB, pagina, POR_PAGINA);
  // Lojas tiradas do site e regras novas valem na hora; preço riscado = o de costume (como na Black Friday)
  dados.ofertas = dados.ofertas.filter((o) => !ofertaDeLojaRemovida(o) && nivelBlackFriday(o)?.nivel <= 2).map(semDescontoFalso).map(comSecaoCerta);
  dados.ofertas = listaSoComNovos(dados.ofertas); // sem usado nem preço errado do vendedor (18/11/2026)
  const semNada = !dados.ofertas.length;
  const resposta = Response.json({ ...dados, temMais: dados.temMais && pagina < MAX_PAGINA }, {
    headers: { "Cache-Control": semNada ? "no-store" : `public, max-age=120, s-maxage=${CACHE_SEGUNDOS}`, "X-Robots-Tag": "noindex" },
  });
  if (cache && !semNada) await cache.put(chave, resposta.clone());
  return resposta;
}

async function daBusca(request, env, filtro) {
  const cabecalhos = (segundos) => ({ "Cache-Control": segundos ? `public, max-age=120, s-maxage=${segundos}` : "no-store", "X-Robots-Tag": "noindex" });
  if (!filtro) return Response.json({ ofertas: [], busca: null, completo: false, temMais: false }, { headers: cabecalhos(0) });
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const chave = new Request(new URL(`/api/quedas?v=14&r=3&q=${encodeURIComponent(filtro.n)}`, request.url));
  const guardada = cache && (await cache.match(chave));
  if (guardada) return guardada;
  const dados = await listarQuedasDaBusca(env.DB, filtro, MAX_DA_BUSCA);
  const ofertas = listaSoComNovos(dados.ofertas.filter((o) => !ofertaDeLojaRemovida(o) && nivelBlackFriday(o)?.nivel <= 2).map(semDescontoFalso).map(comSecaoCerta));
  const resposta = Response.json({ ofertas, busca: filtro.q, completo: dados.total <= MAX_DA_BUSCA, temMais: false, hoje: dados.hoje },
    { headers: cabecalhos(ofertas.length ? CACHE_SEGUNDOS : 0) });
  if (cache && ofertas.length) await cache.put(chave, resposta.clone());
  return resposta;
}
