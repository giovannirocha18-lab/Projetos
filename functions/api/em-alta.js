// GET /api/em-alta -> atalhos abaixo da busca: { itens: [{ nome, busca }] }
// Primeiro os termos mais buscados no site na semana; completa com as
// categorias que mais aparecem entre os mais vendidos da Shopee agora
import { maisBuscados } from "../../lib/buscas.js";
import { categoriasEmAlta } from "../../lib/categorias.js";
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

  const [doSite, categorias] = await Promise.all([
    maisBuscados(env).catch(() => []),
    nomesMaisVendidosShopee(env).then((nomes) => categoriasEmAlta(nomes.map((nome) => ({ nome })), QUANTIDADE))
      .catch(() => []),
  ]);
  const vistos = new Set();
  const itens = [...doSite.map((t) => ({ nome: t, busca: t })), ...categorias]
    .filter((i) => !vistos.has(normalizar(i.busca)) && vistos.add(normalizar(i.busca)))
    .slice(0, QUANTIDADE);

  const resposta = responder({ itens, doSite: doSite.length });
  if (cache) await cache.put(chave, resposta.clone());
  return resposta;
}
