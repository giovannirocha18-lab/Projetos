// GET /api/casados?q=geladeira -> pares de anúncios desta busca que o robô de casar (lib/casar.js) já conferiu com a IA:
// { pares: [[idA, idB, 1 = mesmo produto | 0 = não], …] }. O Modo comparação do site (app.js) usa para juntar só o que
// foi conferido; busca sem pares conferidos devolve a lista vazia e o site segue pela regra do código do modelo.
// POST /api/casados { ids: [...] } -> os pares conferidos entre esses anúncios (o que o site usa desde 12/11/2026: vale
// para qualquer busca, não só as que o robô olhou).
import { casadosDaBusca, casadosDosIds, chaveDaBusca } from "../../lib/casar.js";

export async function onRequestGet({ request, env }) {
  const q = chaveDaBusca(new URL(request.url).searchParams.get("q"));
  const responder = (pares, segundos) => Response.json({ pares }, { headers: { "Cache-Control": `public, max-age=${segundos}`, "X-Robots-Tag": "noindex" } });
  if (!q || !env.DB) return responder([], 600);
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const chave = new Request(new URL(`/api/casados?v=1&q=${encodeURIComponent(q)}`, request.url));
  const guardada = cache && (await cache.match(chave));
  if (guardada) return guardada;
  // A tabela só existe depois da 1ª noite do robô
  const pares = await casadosDaBusca(env.DB, q).catch(() => []);
  const resposta = responder(pares, pares.length ? 3600 : 600);
  if (cache) await cache.put(chave, resposta.clone());
  return resposta;
}

export async function onRequestPost({ request, env }) {
  const semCache = { headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } };
  let ids = [];
  try { ids = (await request.json())?.ids; } catch { /* corpo inválido */ }
  if (!env.DB || !Array.isArray(ids) || ids.length > 1000) return Response.json({ pares: [] }, semCache);
  return Response.json({ pares: await casadosDosIds(env.DB, ids).catch(() => []) }, semCache);
}
