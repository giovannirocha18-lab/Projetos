// GET /api/cupons -> cupons de desconto das lojas parceiras (janela "🎟️ Cupons" do site e selo "Cupom" nos cartões)
// { cupons: [{ id, loja, lojaNome, titulo, descricao?, codigo?, ate?, destaque?, link }] }. Ver lib/cupons.js.
import { cuponsLomadee } from "../../lib/cupons.js";

const CACHE_SEGUNDOS = 3 * 60 * 60;
const VERSAO = 2; // trocar para descartar o que está guardado

export async function onRequestGet({ request, env }) {
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const chave = new Request(new URL(`/api/cupons?v=${VERSAO}`, request.url));
  const guardada = cache && (await cache.match(chave));
  if (guardada) return guardada;

  let cupons = [];
  let completo = true;
  try {
    cupons = await cuponsLomadee(env);
  } catch {
    completo = false; // Lomadee fora do ar ou em pausa: responde vazio e não guarda
  }
  const resposta = Response.json({ cupons }, {
    headers: { "Cache-Control": `public, max-age=${completo ? CACHE_SEGUNDOS : 60}`, "X-Robots-Tag": "noindex" },
  });
  if (cache && completo) await cache.put(chave, resposta.clone());
  return resposta;
}
