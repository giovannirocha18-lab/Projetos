// GET /api/cupons -> cupons de desconto das lojas parceiras (janela "🎟️ Cupons" do site e selo "Cupom" nos cartões)
// { cupons: [{ id, loja, lojaNome, titulo, descricao?, codigoMascara?, ate?, destaque?, link }] }. Ver lib/cupons.js.
// GET /api/cupons?codigo=<id> -> { codigo, link } de um cupom: o botão "Pegar cupom" pede o código só no clique, que
// também abre a loja pelo link com comissão (teste de invasão de 25/10/2026: a lista mandava todos os códigos inteiros,
// e quem abrisse o endereço da lista via tudo sem passar pelo link)
import { cuponsLomadee, cuponsAwin } from "../../lib/cupons.js";

const CACHE_SEGUNDOS = 3 * 60 * 60;
const VERSAO = 6; // trocar para descartar o que está guardado

// Só o começo do código: "BRINOXCHEFE" -> "BRI••••••••"
const mascara = (codigo) => `${codigo.slice(0, Math.min(3, Math.ceil(codigo.length / 3)))}${"•".repeat(Math.max(codigo.length - 3, 4))}`;

// Lista completa (com os códigos), guardada no cache do Cloudflare; nunca sai inteira para o visitante
async function todos(request, env) {
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const chave = new Request(new URL(`/api/cupons?v=${VERSAO}&interno=1`, request.url));
  const guardada = cache && (await cache.match(chave));
  if (guardada) return { cupons: (await guardada.json()).cupons, completo: true };
  try {
    // Awin fora do ar: mostra os da Lomadee, mas não guarda (tenta de novo no próximo pedido)
    let awinOk = true;
    const [lomadee, awin] = await Promise.all([cuponsLomadee(env), cuponsAwin(env).catch(() => { awinOk = false; return []; })]);
    const cupons = [...lomadee, ...awin];
    if (!awinOk) return { cupons, completo: false };
    if (cache) {
      await cache.put(chave, Response.json({ cupons }, { headers: { "Cache-Control": `public, max-age=${CACHE_SEGUNDOS}` } }));
    }
    return { cupons, completo: true };
  } catch {
    return { cupons: [], completo: false }; // Lomadee fora do ar ou em pausa: responde vazio e não guarda
  }
}

export async function onRequestGet({ request, env }) {
  const { cupons, completo } = await todos(request, env);
  const id = new URL(request.url).searchParams.get("codigo");
  if (id !== null) {
    const c = cupons.find((x) => x.id === id);
    if (!c?.codigo) return Response.json({ erro: "Cupom não encontrado" }, { status: 404 });
    return Response.json({ codigo: c.codigo, link: c.link }, { headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
  }
  const publicos = cupons.map(({ codigo, ...c }) => (codigo ? { ...c, codigoMascara: mascara(codigo) } : c));
  return Response.json({ cupons: publicos }, {
    headers: { "Cache-Control": `public, max-age=${completo ? 15 * 60 : 60}`, "X-Robots-Tag": "noindex" },
  });
}
