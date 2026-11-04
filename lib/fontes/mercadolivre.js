// =====================================================================
// FONTE MERCADO LIVRE — API oficial (api.mercadolibre.com), 04/11/2026.
// App "Vai pro Carrinho" (developers.mercadolivre.com.br/devcenter, conta PJ). Chaves no Cloudflare:
// ML_CLIENT_ID (Text) e ML_CLIENT_SECRET (Secret). Token de aplicação (client_credentials, vale 6 h).
// Teste no painel (04/11/2026, /api/painel/ml-teste): a busca comum (/sites/MLB/search) dá 403 mesmo com token, e
// /items/{id} também; o que abre é a busca no CATÁLOGO (/products/search: nome, foto, tipo do produto) e as ofertas de
// cada produto (/products/{id}/items: preço, preço antigo, frete grátis, loja oficial). Produto sem vendedor agora
// ("No winners found") fica de fora.
// Link de afiliado: o gerador do painel de afiliado dá um meli.la que leva a .../social/<perfil>?matt_word=vaiprocarrinho
// &matt_tool=40433824&ref=<código fechado>. O robô não consegue gerar esse; usa o link do produto com matt_tool +
// matt_word (formato do programa de afiliados). Conferir no painel de afiliado se os cliques contam (teste 04/11).
// O site mostra só o endereço nosso (vaiprocarrinho.com.br/ir/ml/<produto>/<anúncio>, pedido do Giovanni, 04/11/2026: tem
// gente que apaga o matt_word do link para não pagar comissão); functions/_middleware.js manda para o Mercado Livre com
// as marcas de afiliado (destinoML). Quem chega lá já foi contado.
// =====================================================================

const API = "https://api.mercadolibre.com";
// Não são segredo: aparecem em todo link de afiliado (matt_tool = número do afiliado, matt_word = etiqueta do site)
const MATT_TOOL_PADRAO = "40433824";
const ETIQUETA_PADRAO = "vaiprocarrinho";

const token = { valor: null, ate: 0, pedindo: null };
async function pedirToken(env) {
  const corpo = new URLSearchParams({ grant_type: "client_credentials", client_id: env.ML_CLIENT_ID, client_secret: env.ML_CLIENT_SECRET });
  const r = await fetch(`${API}/oauth/token`, {
    method: "POST", body: corpo, headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
  });
  const dados = await r.json().catch(() => ({}));
  if (!r.ok || !dados.access_token) throw new Error(`Mercado Livre: token ${r.status} ${dados.message || dados.error || ""}`.trim());
  token.valor = dados.access_token;
  token.ate = Date.now() + Math.max(60, (Number(dados.expires_in) || 21600) - 300) * 1000;
  return token.valor;
}
async function tokenAtual(env, renovar = false) {
  if (!renovar && token.valor && Date.now() < token.ate) return token.valor;
  // Várias buscas ao mesmo tempo esperam o mesmo pedido de token
  if (!token.pedindo) token.pedindo = pedirToken(env).finally(() => { token.pedindo = null; });
  return token.pedindo;
}

// GET na API com o token; 401 = token vencido: pede outro e tenta mais uma vez. 404 volta null (produto sem oferta)
async function chamar(env, caminho, renovado = false) {
  const t = await tokenAtual(env, renovado);
  const r = await fetch(`${API}${caminho}`, { headers: { Authorization: `Bearer ${t}`, Accept: "application/json" } });
  if (r.status === 401 && !renovado) return chamar(env, caminho, true);
  if (r.status === 404) return null;
  const dados = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`Mercado Livre: ${r.status} ${dados?.message || dados?.error || ""}`.trim());
  return dados;
}

export function linkAfiliadoML(env, url) {
  const u = new URL(url);
  u.searchParams.set("matt_tool", env.ML_MATT_TOOL || MATT_TOOL_PADRAO);
  u.searchParams.set("matt_word", env.ML_ETIQUETA || ETIQUETA_PADRAO);
  return u.toString();
}

// /ir/ml/MLB123/MLB456 -> página do produto no Mercado Livre (com o anúncio escolhido) + marcas de afiliado.
// Só aceita códigos MLB (não é um redirecionador aberto)
export const CAMINHO_IR_ML = /^\/ir\/ml\/(MLB\d{4,15})(?:\/(MLB\d{4,15}))?\/?$/i;
export function destinoML(env, caminho) {
  const m = CAMINHO_IR_ML.exec(caminho);
  if (!m) return null;
  const [produto, item] = [m[1].toUpperCase(), m[2]?.toUpperCase()];
  return linkAfiliadoML(env, `https://www.mercadolivre.com.br/p/${produto}${item ? `?pdp_filters=item_id:${item}` : ""}`);
}
const linkNosso = (produto, item) => `https://vaiprocarrinho.com.br/ir/ml/${produto}${item ? `/${item}` : ""}`;

const https = (url) => (url ? String(url).replace(/^http:\/\//, "https://") : null);
const paraNumero = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);

// Produto do catálogo + a oferta mais barata dele (só novos)
function converter(env, p, itens) {
  const novos = (itens || []).filter((i) => paraNumero(i.price) && (!i.condition || i.condition === "new"));
  if (!novos.length) return null;
  const melhor = novos.reduce((a, b) => (Number(b.price) < Number(a.price) ? b : a));
  const preco = Number(melhor.price);
  const original = paraNumero(melhor.original_price);
  const precoAntigo = original && original > preco ? original : null;
  const fotos = [...new Set((p.pictures || []).map((f) => https(f.secure_url || f.url)).filter(Boolean))];
  if (!fotos.length || !p.name || !/^MLB\d+$/i.test(p.id || "")) return null;
  return {
    id: `mercadolivre-${p.id}`,
    loja: "mercadolivre",
    titulo: p.name,
    preco,
    precoAntigo,
    desconto: precoAntigo ? Math.round((1 - preco / precoAntigo) * 100) : null,
    imagem: fotos[0],
    imagens: fotos.length > 1 ? fotos.slice(0, 5) : undefined,
    // A API do catálogo não manda vendidos nem nota; o selo de menor preço pede prova (comProva em app.js)
    vendidos: null,
    avaliacao: null,
    vendedor: null,
    lojaOficial: melhor.official_store_id != null,
    freteGratis: Boolean(melhor.shipping?.free_shipping),
    // Tipo do produto no Mercado Livre ("MLB-AIR_FRYERS"): ensina o mapa de categorias como as das outras lojas
    catsLoja: p.domain_id ? [String(p.domain_id)] : undefined,
    link: /^MLB\d+$/i.test(p.id) ? linkNosso(p.id, /^MLB\d+$/i.test(melhor.item_id || "") ? melhor.item_id : null) : null,
  };
}

// Ofertas de uma lista de produtos do catálogo (uma consulta por produto). No máximo SIMULTANEAS de cada vez: o Cloudflare
// abre só 6 conexões ao mesmo tempo por chamada, e com as 20 juntas a Shopee esperava na fila e passava dos 8 s
// (04/11/2026: "liquidificador oster 1400w" ficou sem Shopee)
const SIMULTANEAS = 2;
// Limite do Mercado Livre (04/11/2026: "429 local_rate_limited" depois de poucas buscas seguidas): as ofertas de cada
// produto ficam guardadas 6 h no cache do Cloudflare (o mesmo produto aparece em muitas buscas), e no primeiro 429 a busca
// para de pedir preços (os produtos sem preço ficam de fora desta vez)
const GUARDAR_PRECO_S = 6 * 60 * 60;
const cachePrecos = () => (typeof caches !== "undefined" ? caches.default : null);
const chavePreco = (id) => new Request(`https://vaiprocarrinho.com.br/__ml/ofertas/${encodeURIComponent(id)}`);
const resumo = (i) => ({ item_id: i.item_id, price: i.price, original_price: i.original_price, condition: i.condition,
  official_store_id: i.official_store_id ?? null, shipping: { free_shipping: Boolean(i.shipping?.free_shipping) } });
async function ofertasGuardadas(id) {
  const g = await cachePrecos()?.match(chavePreco(id)).catch(() => null);
  return g ? g.json().catch(() => null) : null;
}
async function guardarOfertas(id, itens) {
  await cachePrecos()?.put(chavePreco(id), new Response(JSON.stringify(itens), {
    headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${GUARDAR_PRECO_S}` } })).catch(() => {});
}
async function comPrecos(env, produtos) {
  const listas = new Array(produtos.length);
  const guardadas = await Promise.all(produtos.map((p) => ofertasGuardadas(p.id)));
  const faltam = [];
  guardadas.forEach((g, i) => { if (Array.isArray(g)) listas[i] = g; else faltam.push(i); });
  let proximo = 0;
  let limite = false;
  const trabalhar = async () => {
    while (!limite && proximo < faltam.length) {
      const i = faltam[proximo++];
      try {
        const d = await chamar(env, `/products/${encodeURIComponent(produtos[i].id)}/items?limit=5`);
        listas[i] = (d?.results || []).map(resumo);
        await guardarOfertas(produtos[i].id, listas[i]); // sem vendedor agora (404) também fica guardado
      } catch (erro) {
        if (/ 429\b/.test(erro.message)) limite = true;
        listas[i] = [];
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(SIMULTANEAS, faltam.length) }, trabalhar));
  return produtos.map((p, i) => converter(env, p, listas[i])).filter(Boolean);
}

// Só a 1ª página (o preço custa uma consulta por produto); na vitrine das categorias (4 a 6 buscas juntas), menos ainda
const POR_PAGINA = 16;
const POR_PAGINA_VITRINE = 8;

export const mercadolivre = {
  nome: "mercadolivre",
  ativa: (env) => Boolean(env.ML_CLIENT_ID && env.ML_CLIENT_SECRET),
  porPagina: POR_PAGINA,

  async buscar(q, env, pagina = 1, { maisVendidos = false } = {}) {
    if (!q || pagina > 1) return [];
    const limite = maisVendidos ? POR_PAGINA_VITRINE : POR_PAGINA;
    const dados = await chamar(env, `/products/search?status=active&site_id=MLB&q=${encodeURIComponent(q)}&limit=${limite}`);
    return comPrecos(env, dados?.results || []);
  },

  // "Ofertas do dia": a API do catálogo não tem lista de ofertas; o Mercado Livre entra só nas buscas
  async destaques() {
    return [];
  },
};
