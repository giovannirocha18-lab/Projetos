// GET /api/painel/ml-teste?q=air+fryer — teste da fonte do Mercado Livre (lib/fontes/mercadolivre.js), só no painel
// (Cloudflare Access + passe conferido). Mostra quantos produtos vieram, quanto demorou e os primeiros, já como o site
// os recebe (preço, foto, link de afiliado). O token nunca sai daqui.
import { ehPainel, quemEntrou } from "../../../lib/painel.js";
import { mercadolivre, espiarCatalogoML } from "../../../lib/fontes/mercadolivre.js";

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
  // ?precos=1 (25/11/2026): "o Mercado Livre voltou a liberar os preços?" O teste rodava no GitHub (teste-ml.yml, espiar) e
  // parou com a conta de lá bloqueada. Pede tokens novos e mostra o que o preço e a ficha respondem com o app e com a conta
  if (params.has("precos")) {
    const r = await espiarCatalogoML(env, q).catch((e) => ({ erro: String(e?.message || e) }));
    if (params.get("formato") === "json") return Response.json({ q, erro: r.erro, tokens: r.tokens, vencedores: r.vencedores, tempoMs: Date.now() - t0 }, { headers: cabecalhos });
    return paginaDosPrecos(q, r, Date.now() - t0, cabecalhos);
  }
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

// Página do teste dos preços: uma frase grande (voltou / segue recusando) e as respostas do Mercado Livre embaixo
function paginaDosPrecos(q, r, ms, cabecalhos) {
  const tokens = r.tokens || {};
  const dosPrecos = Object.entries(tokens).filter(([nome]) => nome.includes("preços"));
  const abriu = dosPrecos.some(([, v]) => /^2\d\d /.test(String(v) + " "));
  const comPreco = (r.vencedores || []).filter((v) => v.preco != null).length;
  const veredito = r.erro ? ["⚠️ O teste não conseguiu rodar", "#b45309"]
    : abriu ? ["✅ O Mercado Livre VOLTOU a liberar os preços", "#00a650"]
    : dosPrecos.length ? ["❌ O Mercado Livre segue RECUSANDO os preços", "#c62828"]
    : ["⚠️ Sem resposta sobre os preços (nenhum produto no catálogo para testar)", "#b45309"];
  const linhas = Object.entries(tokens).map(([nome, v]) => `<tr><td>${esc(nome)}</td><td>${esc(v)}</td></tr>`).join("");
  const agora = new Date(Date.now() - 4 * 3600e3).toISOString().slice(0, 16).replace("T", " ");
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Teste dos preços do Mercado Livre</title><style>
body{font-family:system-ui,sans-serif;background:#f5f5f5;color:#222;margin:0;padding:16px;max-width:720px}
h1{font-size:22px;color:${veredito[1]}}table{border-collapse:collapse;background:#fff;width:100%}
td{border:1px solid #ddd;padding:8px;font-size:14px}p{font-size:14px}a{color:#3483fa}</style></head><body>
<h1>${veredito[0]}</h1>
<p>Teste feito em ${esc(agora)} (horário do Giovanni), em ${(ms / 1000).toFixed(1)} s, com a busca “${esc(q)}”.</p>
${r.erro ? `<p>Erro: ${esc(r.erro)}</p>` : ""}
<table><tr><td><b>Consulta</b></td><td><b>Resposta do Mercado Livre</b></td></tr>${linhas}</table>
<p>Preço vindo pela ficha, em 10 mais vendidos: <b>${comPreco} de ${(r.vencedores || []).length}</b>.</p>
<p>“200 ok” = respondeu. “403” = recusou. <a href="?precos=1">Testar de novo</a></p></body></html>`;
  return new Response(html, { headers: { ...cabecalhos, "Content-Type": "text/html; charset=utf-8" } });
}

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
