// GET /api/black-friday?pagina=N -> produtos da página da Black Friday (ver lib/blackfriday.js)
// { ofertas, temMais, totais: { real, baixou, loja } }
// GET /api/black-friday?marca=samsung -> todas as ofertas da Black Friday dessa marca de uma vez (até 240; lib/marcas.js)
// { ofertas, marca, completo, temMais: false }
import { listarBlackFriday, listarBlackFridayDaMarca, misturarML, nivelBlackFriday } from "../../lib/blackfriday.js";
import { mercadolivre } from "../../lib/fontes/mercadolivre.js";
import { ofertaDeLojaRemovida, listaSoComNovos } from "../../lib/lojasRemovidas.js";
import { semDescontoFalso } from "../../lib/ofertas.js";
import { comSecaoCerta } from "../../lib/categorias.js";
import { filtroDeMarca, MAX_DA_MARCA } from "../../lib/marcas.js";
import { filtroDeBusca, MAX_DA_BUSCA } from "../../lib/buscaEspecial.js";

const POR_PAGINA = 48;
const ML_POR_PAGINA = 24; // mercadolivre.destaques devolve 24 por página
const MAX_PAGINA = 200; // era 40: rolando só se chegava a 1.920 das ~8.700 contadas (24/11/2026)
const CACHE_SEGUNDOS = 15 * 60;

export async function onRequestGet({ request, env }) {
  if (!env.DB) return Response.json({ ofertas: [], temMais: false, totais: { real: 0, baixou: 0, loja: 0 } });
  const params = new URL(request.url).searchParams;
  if (params.has("marca")) return daMarca(request, env, filtroDeMarca(params.get("marca")));
  // Busca dentro da página (22/11/2026): /api/black-friday?q=geladeira -> { ofertas, busca, completo, temMais: false }
  if (params.has("q")) return daMarca(request, env, filtroDeBusca(params.get("q")), "q");
  const pagina = Math.min(Math.max(parseInt(new URL(request.url).searchParams.get("pagina"), 10) || 1, 1), MAX_PAGINA);
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const nivel = [1, 2, 3].includes(Number(params.get("nivel"))) ? Number(params.get("nivel")) : 0;
  const chave = new Request(new URL(`/api/black-friday?v=19&pagina=${pagina}&nivel=${nivel}`, request.url));
  const guardada = cache && (await cache.match(chave));
  if (guardada) return guardada;
  // Os do Mercado Livre levam o selo "Desconto da loja" (nível 3): entram na lista geral e na do nível 3, e na contagem dele
  const [dados, doML, totalML] = await Promise.all([listarBlackFriday(env.DB, pagina, POR_PAGINA, nivel),
    !nivel || nivel === 3 ? mercadolivre.ofertasBlackFriday(env, pagina).catch(() => []) : [],
    mercadolivre.totalBlackFriday(env).catch(() => 0)]);
  dados.totais.loja += totalML;
  dados.ofertas = dados.ofertas.filter((o) => !ofertaDeLojaRemovida(o) && nivelBlackFriday(o)); // regra nova vale na hora
  dados.ofertas = dados.ofertas.map(semDescontoFalso).map(comSecaoCerta); // preço riscado também nos que a loja não dava "de/por" // lojas tiradas do site (lib/lojasRemovidas.js)
  // Mais vendidos do Mercado Livre com desconto, misturados (06/11/2026, ver misturarML em lib/blackfriday.js)
  dados.ofertas = listaSoComNovos(misturarML(dados.ofertas, doML)); // sem usado nem preço errado do vendedor (18/11/2026)
  dados.temMais = dados.temMais || doML.length >= ML_POR_PAGINA;
  // Lista vazia (antes do robô passar) não fica guardada: as ofertas aparecem assim que entrarem
  const vazia = !dados.ofertas.length;
  const resposta = Response.json({ ...dados, temMais: dados.temMais && pagina < MAX_PAGINA }, {
    headers: { "Cache-Control": vazia ? "no-store" : `public, max-age=${CACHE_SEGUNDOS}`, "X-Robots-Tag": "noindex" },
  });
  if (cache && !vazia) await cache.put(chave, resposta.clone());
  return resposta;
}

// Só uma marca: as ofertas conferidas (bf_ofertas) e os mais vendidos do Mercado Livre com desconto que citam a marca
async function daMarca(request, env, filtro, tipo = "marca") {
  const maximo = tipo === "q" ? MAX_DA_BUSCA : MAX_DA_MARCA;
  const cabecalhos = (segundos) => ({ "Cache-Control": segundos ? `public, max-age=${segundos}` : "no-store", "X-Robots-Tag": "noindex" });
  if (!filtro) return Response.json({ ofertas: [], marca: null, busca: null, completo: false, temMais: false }, { headers: cabecalhos(0) });
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const chave = new Request(new URL(`/api/black-friday?v=18${tipo === "q" ? "&r=4" : ""}&${tipo}=${encodeURIComponent(filtro.n)}`, request.url));
  const guardada = cache && (await cache.match(chave));
  if (guardada) return guardada;
  const [dados, doML] = await Promise.all([listarBlackFridayDaMarca(env.DB, filtro, maximo),
    mercadolivre.ofertasBlackFridayDaMarca(env, filtro, maximo).catch(() => ({ ofertas: [], total: 0 }))]);
  // Na busca, os do Mercado Livre também passam pela regra do produto buscado (a peneira deles é só pelas palavras)
  if (filtro.escolher) doML.ofertas = filtro.escolher(doML.ofertas, { soProdutos: dados.ofertas.length > 0, contexto: dados.ofertas });
  const ofertas = listaSoComNovos(misturarML(dados.ofertas.filter((o) => !ofertaDeLojaRemovida(o) && nivelBlackFriday(o)).map(semDescontoFalso).map(comSecaoCerta), doML.ofertas));
  const resposta = Response.json({ ofertas, ...(tipo === "q" ? { busca: filtro.q } : { marca: filtro.n }), completo: dados.total <= maximo && doML.total <= maximo, temMais: false },
    { headers: cabecalhos(ofertas.length ? CACHE_SEGUNDOS : 0) });
  if (cache && ofertas.length) await cache.put(chave, resposta.clone());
  return resposta;
}
