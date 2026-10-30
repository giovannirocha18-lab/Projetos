// GET /api/cupons -> cupons de desconto das lojas parceiras (janela "🎟️ Cupons" do site e selo "Cupom" nos cartões)
// { cupons: [{ id, loja, lojaNome, titulo, descricao?, codigoMascara?, ate?, destaque?, link }] }. Ver lib/cupons.js.
// GET /api/cupons?codigo=<id> -> { codigo, link } de um cupom: o botão "Pegar cupom" pede o código só no clique, que
// também abre a loja pelo link com comissão (teste de invasão de 25/10/2026: a lista mandava todos os códigos inteiros,
// e quem abrisse o endereço da lista via tudo sem passar pelo link)
import { cuponsLomadee, cuponsAwin } from "../../lib/cupons.js";

const CACHE_SEGUNDOS = 3 * 60 * 60;
const VERSAO = 8; // trocar para descartar o que está guardado

// Só o começo do código: "BRINOXCHEFE" -> "BRI••••••••"
const mascara = (codigo) => `${codigo.slice(0, Math.min(3, Math.ceil(codigo.length / 3)))}${"•".repeat(Math.max(codigo.length - 3, 4))}`;

// Lista completa (com os códigos), guardada no cache do Cloudflare; nunca sai inteira para o visitante
async function todos(request, env) {
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const chave = new Request(new URL(`/api/cupons?v=${VERSAO}&interno=1`, request.url));
  const guardada = cache && (await cache.match(chave));
  if (guardada) { const j = await guardada.json(); return { cupons: j.cupons, completo: true, erroAwin: j.erroAwin }; }
  try {
    // Awin falhou: mostra os da Lomadee e guarda só 10 min (sem isso, cada visita refazia as 5 páginas da Lomadee e
    // estourava o limite dela de 60/min; 30/10/2026). O motivo (só o código HTTP) vai em "erroAwin" para conferência.
    let erroAwin;
    const [lomadee, awin] = await Promise.all([
      cuponsLomadee(env),
      cuponsAwin(env).catch((e) => { erroAwin = String(e.message || e).slice(0, 80); return []; }),
    ]);
    const cupons = [...lomadee, ...awin];
    const segundos = erroAwin ? 10 * 60 : CACHE_SEGUNDOS;
    if (cache) {
      await cache.put(chave, Response.json({ cupons, erroAwin }, { headers: { "Cache-Control": `public, max-age=${segundos}` } }));
    }
    return { cupons, completo: true, erroAwin };
  } catch (e) {
    // Lomadee fora do ar ou em pausa: responde vazio e não guarda (o motivo vai em "erroAwin" também, para conferência)
    return { cupons: [], completo: false, erroAwin: `Lomadee: ${String(e.message || e).slice(0, 80)}` };
  }
}

export async function onRequestGet({ request, env }) {
  const { cupons, completo, erroAwin } = await todos(request, env);
  const id = new URL(request.url).searchParams.get("codigo");
  if (id !== null) {
    const c = cupons.find((x) => x.id === id);
    if (!c?.codigo) return Response.json({ erro: "Cupom não encontrado" }, { status: 404 });
    return Response.json({ codigo: c.codigo, link: c.link }, { headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
  }
  const publicos = cupons.map(({ codigo, ...c }) => (codigo ? { ...c, codigoMascara: mascara(codigo) } : c));
  return Response.json({ cupons: publicos, erroAwin }, {
    headers: { "Cache-Control": `public, max-age=${completo ? 15 * 60 : 60}`, "X-Robots-Tag": "noindex" },
  });
}
