// GET /api/em-alta -> termos para os atalhos abaixo da busca:
// primeiro os mais buscados no site na semana; completa com os produtos
// mais vendidos da Shopee no momento
import { maisBuscados, termosDosProdutos } from "../../lib/buscas.js";
import { nomesMaisVendidosShopee } from "../../lib/fontes/shopee.js";
import { normalizar } from "../../lib/texto.js";

const CACHE_SEGUNDOS = 60 * 60;
const QUANTIDADE = 8;

function responder(dados) {
  return new Response(JSON.stringify(dados), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": `public, max-age=${CACHE_SEGUNDOS}`,
      "X-Robots-Tag": "noindex",
    },
  });
}

export async function onRequestGet({ request, env }) {
  // Guarda por 1 hora para não consultar a Shopee a cada visita
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const chave = new Request(new URL("/api/em-alta", request.url));
  const guardada = cache && (await cache.match(chave));
  if (guardada) return guardada;

  const [doSite, vendidos] = await Promise.all([
    maisBuscados(env).catch(() => []),
    nomesMaisVendidosShopee(env).then((nomes) => termosDosProdutos(nomes, QUANTIDADE)).catch(() => []),
  ]);
  const vistos = new Set();
  const termos = [...doSite, ...vendidos]
    .filter((t) => !vistos.has(normalizar(t)) && vistos.add(normalizar(t)))
    .slice(0, QUANTIDADE);

  const resposta = responder({ termos, doSite: doSite.length });
  if (cache) await cache.put(chave, resposta.clone());
  return resposta;
}
