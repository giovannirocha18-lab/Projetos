// Numerações de cada modelo de uma loja da Awin (16/11/2026). A busca só vê parte dos anúncios da loja (até 400 candidatos),
// então a lista de numerações do cartão saía incompleta ("34, 38" num tênis que tem do 34 ao 44). Aqui a loja inteira é
// lida uma vez (só id e título, consulta leve) e o mapa modelo -> numerações fica 6 horas no cache do Cloudflare e na
// memória: as buscas seguintes não vão ao banco por isso.
import { modeloBase, tamanhoDoTitulo, ordenarTamanhos } from "./variacoes.js";

const VALE_MS = 6 * 60 * 60 * 1000;
const memoria = new Map(); // loja -> { mapa, ate }
const chaveDe = (loja) => new Request(`https://vaiprocarrinho.com.br/__cache/tamanhos-da-loja/2/${encodeURIComponent(loja)}`);

export async function tamanhosDaLoja(db, loja) {
  const guardado = memoria.get(loja);
  if (guardado && Date.now() < guardado.ate) return guardado.mapa;
  const cache = typeof caches !== "undefined" ? caches.default : null;
  let objeto = null;
  try {
    const resposta = cache && await cache.match(chaveDe(loja));
    if (resposta) objeto = await resposta.json();
  } catch { /* sem cache: lê do banco */ }
  if (!objeto) {
    const { results } = await db.prepare("SELECT titulo FROM ofertas WHERE loja = ? AND +fonte = 'awin'").bind(loja).all();
    const juntos = new Map();
    for (const l of results || []) {
      const t = tamanhoDoTitulo(l.titulo);
      if (!t) continue;
      const base = modeloBase(l.titulo);
      if (!juntos.has(base)) juntos.set(base, []);
      juntos.get(base).push(t);
    }
    objeto = {};
    for (const [base, lista] of juntos) {
      const ordenada = ordenarTamanhos(lista);
      if (ordenada.length > 1) objeto[base] = ordenada;
    }
    if (cache) {
      await cache.put(chaveDe(loja), new Response(JSON.stringify(objeto), {
        headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${VALE_MS / 1000}` },
      })).catch(() => {});
    }
  }
  const mapa = new Map(Object.entries(objeto));
  if (memoria.size > 60) memoria.clear();
  memoria.set(loja, { mapa, ate: Date.now() + VALE_MS });
  return mapa;
}
