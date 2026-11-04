// GET /api/painel/ml-conta?q=air+fryer — só no painel: com a conta do Mercado Livre conectada (lib/mlConta.js), testa
// quais endereços da API abrem com o token da conta (busca de anúncios, anúncio, catálogo, mais vendidos).
// Mostra só o código de resposta e um resumo; o token nunca sai daqui.
import { ehPainel, quemEntrou } from "../../../lib/painel.js";
import { tokenDaConta } from "../../../lib/mlConta.js";

const API = "https://api.mercadolibre.com";
const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export async function onRequestGet({ request, env }) {
  const cabecalhos = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", "Content-Type": "text/html; charset=utf-8" };
  if (!ehPainel(request.url) || !(await quemEntrou(request, env))) return new Response("acesso negado", { status: 403, headers: cabecalhos });
  const params = new URL(request.url).searchParams;
  const q = (params.get("q") || "air fryer").slice(0, 100);
  const aviso = params.get("erro") ? `<p class="e">Erro ao conectar: ${esc(params.get("erro"))}</p>` : params.get("ok") ? '<p class="ok">✅ Conta conectada!</p>' : "";
  let conta = null;
  let erroConta = "";
  try { conta = await tokenDaConta(env); } catch (e) { erroConta = String(e?.message || e); }
  const linhas = [];
  if (conta) {
    const pedir = async (nome, caminho, resumir) => {
      try {
        const r = await fetch(`${API}${caminho}`, { headers: { Authorization: `Bearer ${conta.access}`, Accept: "application/json" } });
        const d = await r.json().catch(() => null);
        linhas.push(`<tr><td>${esc(nome)}</td><td class="${r.ok ? "ok" : "e"}">${r.status}</td><td>${esc(r.ok ? resumir(d) : d?.message || d?.error || "")}</td></tr>`);
        return r.ok ? d : null;
      } catch (e) {
        linhas.push(`<tr><td>${esc(nome)}</td><td class="e">falhou</td><td>${esc(e?.message || e)}</td></tr>`);
        return null;
      }
    };
    const busca = await pedir("Busca de anúncios (/sites/MLB/search)", `/sites/MLB/search?q=${encodeURIComponent(q)}&limit=50`,
      (d) => `${d?.paging?.total ?? "?"} anúncios; 1º: ${d?.results?.[0]?.title || "-"} R$ ${d?.results?.[0]?.price ?? "-"}`);
    const item = busca?.results?.[0]?.id;
    if (item) await pedir("Anúncio (/items/{id})", `/items/${item}`, (d) => `${d?.title} R$ ${d?.price} (${d?.sold_quantity ?? "?"} vendidos)`);
    await pedir("Catálogo (/products/search)", `/products/search?status=active&site_id=MLB&q=${encodeURIComponent(q)}&limit=5`, (d) => `${d?.paging?.total ?? "?"} fichas`);
    await pedir("Usuário (/users/me)", "/users/me", (d) => `conta ${d?.nickname || d?.id}`);
  }
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Conta do Mercado Livre</title><style>body{font-family:system-ui,sans-serif;background:#f5f5f5;color:#222;margin:0;padding:16px}
a.b{display:inline-block;padding:12px 18px;background:#3483fa;color:#fff;border-radius:8px;text-decoration:none;font-size:16px}
table{border-collapse:collapse;background:#fff;margin-top:12px}td{border:1px solid #ddd;padding:8px;font-size:14px;vertical-align:top}
.ok{color:#00a650;font-weight:700}.e{color:#c00;font-weight:700}</style></head><body>
<h1>Conta do Mercado Livre</h1>${aviso}
${conta ? `<p>Conectada (usuário ${esc(conta.usuario)}). Teste com a busca "${esc(q)}":</p><table>${linhas.join("")}</table>
<p style="margin-top:16px"><a href="/api/painel/ml-conectar">Conectar de novo</a></p>`
    : `<p>${erroConta ? `<span class="e">${esc(erroConta)}</span><br>` : ""}Conta ainda não conectada.</p>
<p><a class="b" href="/api/painel/ml-conectar">Conectar conta do Mercado Livre</a></p>
<p>Entre com a conta <b>PJ</b> do Mercado Livre e aperte <b>Permitir</b>.</p>`}
</body></html>`;
  return new Response(html, { headers: cabecalhos });
}
