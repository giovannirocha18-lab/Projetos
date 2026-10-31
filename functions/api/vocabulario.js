// GET /api/vocabulario -> o que a caixa de busca usa para sugerir enquanto a pessoa digita (app.js):
// { termos: [mais buscados no site + produtos populares], marcas: [...], erros: { "eletrolux": "electrolux", … } }
// O site baixa uma vez e sugere sem perguntar ao servidor a cada letra.
import { termosBuscados } from "../../lib/buscas.js";
import { ERROS, MARCAS, termosParaSugestoes } from "../../lib/vocabulario.js";
import { CHAVE_RESUMO, termosDeMarcas } from "../../lib/marcasProdutos.js";
import { normalizar } from "../../lib/texto.js";

const CACHE_SEGUNDOS = 6 * 60 * 60;

export async function onRequestGet({ request, env }) {
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const chave = new Request(new URL("/api/vocabulario?v=5", request.url)); // trocar o v= para descartar o guardado
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
  const vistos = new Set();
  const termos = [...termosParaSugestoes(buscados), ...deMarcas].filter((t) => !vistos.has(normalizar(t)) && vistos.add(normalizar(t)));
  const resposta = new Response(JSON.stringify({ termos, marcas: MARCAS, erros: ERROS }), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": `public, max-age=${CACHE_SEGUNDOS}`,
      "X-Robots-Tag": "noindex",
    },
  });
  if (cache) await cache.put(chave, resposta.clone());
  return resposta;
}
