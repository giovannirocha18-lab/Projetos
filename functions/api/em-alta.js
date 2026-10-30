// GET /api/em-alta -> atalhos abaixo da busca: { itens: [{ nome, busca }], categorias: [{ nome, emoji, busca }] }
// Primeiro os termos mais buscados no site na semana; completa com as
// categorias que mais aparecem entre os mais vendidos da Shopee agora.
// "categorias" = menu da barra lateral, com as que mais vendem agora na frente
import { maisBuscados } from "../../lib/buscas.js";
import { categoriasEmAlta, todasCategorias } from "../../lib/categorias.js";
import { nomesMaisVendidosShopee } from "../../lib/fontes/shopee.js";
import { normalizar } from "../../lib/texto.js";

const CACHE_SEGUNDOS = 60 * 60;
const QUANTIDADE = 8;

function responder(dados, segundos = CACHE_SEGUNDOS) {
  return new Response(JSON.stringify(dados), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": `public, max-age=${segundos}`,
      "X-Robots-Tag": "noindex",
    },
  });
}

// Busca muito feita que aparece como a categoria inteira, mais chamativa (pedido do Giovanni, 30/10/2026: "ração" -> "Pets")
const VIRA_CATEGORIA = {
  racao: { nome: "Pets", busca: "pet" },
};

export async function onRequestGet({ request, env }) {
  // Guarda por 1 hora para não consultar a Shopee a cada visita
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const chave = new Request(new URL("/api/em-alta?v=9", request.url)); // trocar o v= para descartar o guardado
  const guardada = cache && (await cache.match(chave));
  if (guardada) return guardada;

  const [doSite, maisVendidos] = await Promise.all([
    maisBuscados(env).catch(() => []),
    nomesMaisVendidosShopee(env).then((nomes) => nomes.map((nome) => ({ nome }))).catch(() => []),
  ]);
  const categorias = categoriasEmAlta(maisVendidos, QUANTIDADE);
  const vistos = new Set();
  const itens = [...doSite.map((t) => VIRA_CATEGORIA[normalizar(t)] || { nome: t, busca: t }), ...categorias]
    .filter((i) => !vistos.has(normalizar(i.busca)) && vistos.add(normalizar(i.busca)))
    .slice(0, QUANTIDADE);

  // Shopee fora do ar: responde (categorias na ordem padrão), mas guarda só 5 minutos para tentar de novo logo
  const resposta = responder({ itens, categorias: todasCategorias(maisVendidos), doSite: doSite.length },
    maisVendidos.length ? CACHE_SEGUNDOS : 5 * 60);
  if (cache) await cache.put(chave, resposta.clone());
  return resposta;
}
