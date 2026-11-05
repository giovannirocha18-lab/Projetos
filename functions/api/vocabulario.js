// GET /api/vocabulario -> o que a caixa de busca usa para sugerir enquanto a pessoa digita (app.js):
// { termos: [mais buscados no site + produtos populares + tendências do Mercado Livre], marcas: [...], erros: { "eletrolux": "electrolux", … } }
// O site baixa uma vez e sugere sem perguntar ao servidor a cada letra.
import { termosBuscados, tendenciaAceitavel } from "../../lib/buscas.js";
import { tendenciasDasCategorias } from "../../lib/fontes/mercadolivre.js";
import { ERROS, MARCAS, termosParaSugestoes } from "../../lib/vocabulario.js";
import { CHAVE_RESUMO, termosDeMarcas } from "../../lib/marcasProdutos.js";
import { normalizar } from "../../lib/texto.js";

const CACHE_SEGUNDOS = 6 * 60 * 60;

export async function onRequestGet({ request, env }) {
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const chave = new Request(new URL("/api/vocabulario?v=11", request.url)); // trocar o v= para descartar o guardado
  const guardada = cache && (await cache.match(chave));
  if (guardada) return guardada;

  const buscados = await termosBuscados(env).catch(() => []);
  // "parafusadeira stanley", "trena stanley"…: produtos que mais aparecem com cada marca (robo/marcas.mjs, toda madrugada)
  let deMarcas = [];
  try {
    const linha = await env.DB?.prepare("SELECT valor FROM resumos WHERE chave = ?").bind(CHAVE_RESUMO).first();
    if (linha) deMarcas = termosDeMarcas(JSON.parse(linha.valor));
  } catch {
    // ainda sem o resumo (o robô cria)
  }
  // O que mais se busca no Mercado Livre em cada categoria (05/11/2026; ml_tendencias, renovado pelo robô), depois dos nossos
  const tendencias = (await tendenciasDasCategorias(env, 2500)).filter(tendenciaAceitavel);
  const vistos = new Set();
  const termos = [...termosParaSugestoes(buscados), ...deMarcas, ...tendencias].filter((t) => !vistos.has(normalizar(t)) && vistos.add(normalizar(t)));
  const resposta = new Response(JSON.stringify({ termos, marcas: MARCAS, erros: ERROS }), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      // Sem as tendências ainda (antes do robô guardá-las): só 10 min, para elas entrarem logo
      "Cache-Control": `public, max-age=${tendencias.length ? CACHE_SEGUNDOS : 600}`,
      "X-Robots-Tag": "noindex",
    },
  });
  if (cache && tendencias.length) await cache.put(chave, resposta.clone());
  return resposta;
}
