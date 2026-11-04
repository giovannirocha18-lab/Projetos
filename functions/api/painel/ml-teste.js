// GET /api/painel/ml-teste — teste da API do Mercado Livre (04/11/2026), só no painel (Cloudflare Access + passe conferido).
// Pede um token de aplicação (client_credentials) com ML_CLIENT_ID + ML_CLIENT_SECRET (Pages) e tenta as buscas que o
// comparador usaria. Mostra só o código de resposta de cada uma e alguns títulos/preços; o token nunca sai daqui.
import { ehPainel, quemEntrou } from "../../../lib/painel.js";

const API = "https://api.mercadolibre.com";

async function tentar(nome, url, token) {
  try {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
    const texto = await r.text();
    let dados = null;
    try { dados = JSON.parse(texto); } catch { /* não é JSON */ }
    const lista = dados?.results || (Array.isArray(dados) ? dados : null) || dados?.content || [];
    const amostra = (Array.isArray(lista) ? lista : []).slice(0, 3).map((p) => ({
      id: p.id, titulo: p.title || p.name, preco: p.price ?? p.buy_box_winner?.price ?? null, link: p.permalink || null,
    }));
    return {
      nome, status: r.status, total: dados?.paging?.total ?? (Array.isArray(lista) ? lista.length : null),
      amostra, erro: r.ok ? null : (dados?.message || dados?.error || texto.slice(0, 200)),
    };
  } catch (e) {
    return { nome, status: 0, erro: String(e?.message || e) };
  }
}

export async function onRequestGet({ request, env }) {
  const cabecalhos = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
  if (!ehPainel(request.url) || !(await quemEntrou(request, env))) {
    return Response.json({ erro: "acesso negado" }, { status: 403, headers: cabecalhos });
  }
  if (!env.ML_CLIENT_ID || !env.ML_CLIENT_SECRET) {
    return Response.json({ erro: "faltam ML_CLIENT_ID e ML_CLIENT_SECRET no Cloudflare (ou falta publicar de novo)" }, { headers: cabecalhos });
  }
  const q = new URL(request.url).searchParams.get("q") || "air fryer";
  const corpo = new URLSearchParams({ grant_type: "client_credentials", client_id: env.ML_CLIENT_ID, client_secret: env.ML_CLIENT_SECRET });
  const rt = await fetch(`${API}/oauth/token`, {
    method: "POST", body: corpo,
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
  });
  const tk = await rt.json().catch(() => ({}));
  if (!rt.ok || !tk.access_token) {
    return Response.json({ token: { status: rt.status, erro: tk.message || tk.error || "sem token" } }, { headers: cabecalhos });
  }
  const t = tk.access_token;
  const qq = encodeURIComponent(q);
  const testes = await Promise.all([
    tentar("busca de anúncios (sites/MLB/search)", `${API}/sites/MLB/search?q=${qq}&limit=5`, t),
    tentar("busca no catálogo (products/search)", `${API}/products/search?status=active&site_id=MLB&q=${qq}&limit=5`, t),
    tentar("mais vendidos (highlights, Eletrodomésticos)", `${API}/highlights/MLB/category/MLB5726`, t),
    tentar("categorias (público)", `${API}/sites/MLB/categories`, t),
  ]);
  return Response.json({ token: { status: rt.status, escopo: tk.scope || null, validade_s: tk.expires_in || null }, busca: q, testes }, { headers: cabecalhos });
}
