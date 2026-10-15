// GET /api/em-alta -> termos mais buscados no site nos últimos 7 dias
import { maisBuscados } from "../../lib/buscas.js";

const CACHE_SEGUNDOS = 60 * 60;

export async function onRequestGet({ env }) {
  let termos = [];
  try {
    termos = await maisBuscados(env);
  } catch {
    // Sem banco ou sem dados: o site usa a lista padrão
  }
  return new Response(JSON.stringify({ termos }), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": `public, max-age=${CACHE_SEGUNDOS}`,
      "X-Robots-Tag": "noindex",
    },
  });
}
