// GET /api/painel/ml-teste?q=air+fryer — teste da fonte do Mercado Livre (lib/fontes/mercadolivre.js), só no painel
// (Cloudflare Access + passe conferido). Mostra quantos produtos vieram, quanto demorou e os primeiros, já como o site
// os recebe (preço, foto, link de afiliado). O token nunca sai daqui.
import { ehPainel, quemEntrou } from "../../../lib/painel.js";
import { mercadolivre } from "../../../lib/fontes/mercadolivre.js";

export async function onRequestGet({ request, env }) {
  const cabecalhos = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
  if (!ehPainel(request.url) || !(await quemEntrou(request, env))) {
    return Response.json({ erro: "acesso negado" }, { status: 403, headers: cabecalhos });
  }
  if (!mercadolivre.ativa(env)) {
    return Response.json({ erro: "faltam ML_CLIENT_ID e ML_CLIENT_SECRET no Cloudflare (ou falta publicar de novo)" }, { headers: cabecalhos });
  }
  const params = new URL(request.url).searchParams;
  const q = (params.get("q") || "air fryer").slice(0, 100);
  const t0 = Date.now();
  try {
    const ofertas = await mercadolivre.buscar(q, env, 1);
    if (params.get("formato") !== "json") return paginaDoTeste(q, ofertas, Date.now() - t0, cabecalhos);
    return Response.json({
      busca: q, produtos: ofertas.length, tempoMs: Date.now() - t0,
      primeiros: ofertas.slice(0, 6).map((o) => ({ titulo: o.titulo, preco: o.preco, antigo: o.precoAntigo, frete: o.freteGratis,
        oficial: o.lojaOficial, tipo: o.catsLoja?.[0], foto: o.imagem, link: o.link })),
    }, { headers: cabecalhos });
  } catch (e) {
    return Response.json({ busca: q, erro: String(e?.message || e), tempoMs: Date.now() - t0 }, { headers: cabecalhos });
  }
}

const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const reais = (v) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Página simples (tema claro) com os produtos como cartões e uma caixa para testar outra busca
function paginaDoTeste(q, ofertas, ms, cabecalhos) {
  const cartoes = ofertas.map((o) => `<a class="c" href="${esc(o.link)}" target="_blank" rel="sponsored noopener">
    <img src="${esc(o.imagem)}" alt="" loading="lazy"><div class="t">${esc(o.titulo)}</div>
    ${o.precoAntigo ? `<s>${reais(o.precoAntigo)}</s> <b class="d">-${o.desconto}%</b>` : ""}
    <div class="p">${reais(o.preco)}</div>
    ${o.freteGratis ? '<div class="f">🚚 Frete grátis</div>' : ""}${o.lojaOficial ? '<div class="o">Loja oficial</div>' : ""}
    <div class="k">${esc(o.catsLoja?.[0] || "")}</div></a>`).join("");
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Teste Mercado Livre</title><style>
body{font-family:system-ui,sans-serif;background:#f5f5f5;color:#222;margin:0;padding:16px}
form{display:flex;gap:8px;margin:0 0 8px}input{flex:1;padding:10px;font-size:16px;border:1px solid #ccc;border-radius:8px}
button{padding:10px 16px;background:#3483fa;color:#fff;border:0;border-radius:8px;font-size:16px}
.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:12px}
.c{background:#fff;border-radius:8px;padding:10px;text-decoration:none;color:#222;box-shadow:0 1px 2px #0002}
.c img{width:100%;aspect-ratio:1;object-fit:contain}.t{font-size:13px;margin:6px 0;height:3.6em;overflow:hidden}
.p{font-size:20px}.d{color:#00a650}.f{color:#00a650;font-size:13px}.o{color:#3483fa;font-size:12px}.k{color:#999;font-size:11px}
s{color:#999;font-size:12px}</style></head><body>
<form method="get"><input name="q" value="${esc(q)}" placeholder="Buscar no Mercado Livre"><button>Buscar</button></form>
<p><b>${ofertas.length}</b> produtos com preço em ${(ms / 1000).toFixed(1)} s (1ª página, até 20).</p>
<div class="g">${cartoes || "<p>Nenhum produto com vendedor agora.</p>"}</div></body></html>`;
  return new Response(html, { headers: { ...cabecalhos, "Content-Type": "text/html; charset=utf-8" } });
}
