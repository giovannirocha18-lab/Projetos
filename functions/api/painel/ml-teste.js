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
  // Preço, foto, vendedor e link: o catálogo só traz o nome; o preço vem do produto (buy box) ou das ofertas dele
  const ids = (testes[1].amostra || []).map((p) => p.id).filter(Boolean).slice(0, 2);
  const detalhes = await Promise.all(ids.map(async (id) => {
    const lerJson = async (url) => {
      try {
        const r = await fetch(url, { headers: { Authorization: `Bearer ${t}`, Accept: "application/json" } });
        return { status: r.status, dados: await r.json().catch(() => null) };
      } catch (e) { return { status: 0, dados: { message: String(e?.message || e) } }; }
    };
    const [p, it] = await Promise.all([lerJson(`${API}/products/${id}`), lerJson(`${API}/products/${id}/items?limit=3`)]);
    const bb = p.dados?.buy_box_winner;
    const ofertas = (it.dados?.results || []).slice(0, 3);
    let item = null;
    const idItem = bb?.item_id || ofertas[0]?.item_id;
    if (idItem) {
      const ri = await lerJson(`${API}/items/${idItem}`);
      item = { status: ri.status, titulo: ri.dados?.title, preco: ri.dados?.price, link: ri.dados?.permalink,
        foto: ri.dados?.pictures?.[0]?.secure_url || ri.dados?.thumbnail, vendidos: ri.dados?.sold_quantity ?? null,
        erro: ri.status === 200 ? null : (ri.dados?.message || ri.dados?.error) };
    }
    return {
      id, produto: { status: p.status, nome: p.dados?.name, foto: p.dados?.pictures?.[0]?.url || null, link: p.dados?.permalink || null,
        preco_buybox: bb?.price ?? null, original: bb?.original_price ?? null, frete_gratis: bb?.shipping?.free_shipping ?? null,
        item_id: bb?.item_id || null, erro: p.status === 200 ? null : (p.dados?.message || p.dados?.error) },
      ofertas: { status: it.status, total: it.dados?.paging?.total ?? null,
        lista: ofertas.map((o) => ({ item_id: o.item_id, preco: o.price, original: o.original_price, vendedor: o.seller_id, frete_gratis: o.shipping?.free_shipping })),
        erro: it.status === 200 ? null : (it.dados?.message || it.dados?.error) },
      anuncio: item,
    };
  }));
  return Response.json({ token: { status: rt.status, validade_s: tk.expires_in || null }, busca: q, testes, detalhes }, { headers: cabecalhos });
}
