// GET /api/black-friday?pagina=N -> produtos da página da Black Friday (ver lib/blackfriday.js)
// { ofertas, temMais, totais: { real, baixou, loja } }
// GET /api/black-friday?marca=samsung -> todas as ofertas da Black Friday dessa marca de uma vez (até 240; lib/marcas.js)
// { ofertas, marca, completo, temMais: false }
import { listarBlackFriday, listarBlackFridayDaMarca, misturarML, nivelBlackFriday } from "../../lib/blackfriday.js";
import { mercadolivre } from "../../lib/fontes/mercadolivre.js";
import { ofertaDeLojaRemovida } from "../../lib/lojasRemovidas.js";
import { semDescontoFalso } from "../../lib/ofertas.js";
import { filtroDeMarca, MAX_DA_MARCA } from "../../lib/marcas.js";

const POR_PAGINA = 48;
const ML_POR_PAGINA = 24; // mercadolivre.destaques devolve 24 por página
const MAX_PAGINA = 40;
const CACHE_SEGUNDOS = 15 * 60;

export async function onRequestGet({ request, env }) {
  if (!env.DB) return Response.json({ ofertas: [], temMais: false, totais: { real: 0, baixou: 0, loja: 0 } });
  const params = new URL(request.url).searchParams;
  if (params.has("marca")) return daMarca(request, env, filtroDeMarca(params.get("marca")));
  const pagina = Math.min(Math.max(parseInt(new URL(request.url).searchParams.get("pagina"), 10) || 1, 1), MAX_PAGINA);
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const chave = new Request(new URL(`/api/black-friday?v=8&pagina=${pagina}`, request.url));
  const guardada = cache && (await cache.match(chave));
  if (guardada) return guardada;
  const [dados, doML] = await Promise.all([listarBlackFriday(env.DB, pagina, POR_PAGINA),
    mercadolivre.ofertasBlackFriday(env, pagina).catch(() => [])]);
  dados.ofertas = dados.ofertas.filter((o) => !ofertaDeLojaRemovida(o) && nivelBlackFriday(o)); // regra nova vale na hora
  dados.ofertas = dados.ofertas.map(semDescontoFalso); // preço riscado também nos que a loja não dava "de/por" // lojas tiradas do site (lib/lojasRemovidas.js)
  // Mais vendidos do Mercado Livre com desconto, misturados (06/11/2026, ver misturarML em lib/blackfriday.js)
  dados.ofertas = misturarML(dados.ofertas, doML);
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
async function daMarca(request, env, filtro) {
  const cabecalhos = (segundos) => ({ "Cache-Control": segundos ? `public, max-age=${segundos}` : "no-store", "X-Robots-Tag": "noindex" });
  if (!filtro) return Response.json({ ofertas: [], marca: null, completo: false, temMais: false }, { headers: cabecalhos(0) });
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const chave = new Request(new URL(`/api/black-friday?v=8&marca=${encodeURIComponent(filtro.n)}`, request.url));
  const guardada = cache && (await cache.match(chave));
  if (guardada) return guardada;
  const [dados, doML] = await Promise.all([listarBlackFridayDaMarca(env.DB, filtro, MAX_DA_MARCA),
    mercadolivre.ofertasBlackFridayDaMarca(env, filtro, MAX_DA_MARCA).catch(() => ({ ofertas: [], total: 0 }))]);
  const ofertas = misturarML(dados.ofertas.filter((o) => !ofertaDeLojaRemovida(o) && nivelBlackFriday(o)).map(semDescontoFalso), doML.ofertas);
  const resposta = Response.json({ ofertas, marca: filtro.n, completo: dados.total <= MAX_DA_MARCA && doML.total <= MAX_DA_MARCA, temMais: false },
    { headers: cabecalhos(ofertas.length ? CACHE_SEGUNDOS : 0) });
  if (cache && ofertas.length) await cache.put(chave, resposta.clone());
  return resposta;
}
