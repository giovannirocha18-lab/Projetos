// =====================================================================
// FONTE ALIEXPRESS — API oficial de afiliados (Open Platform, "Affiliates API").
// Só é usada quando ALIEXPRESS_APP_KEY e ALIEXPRESS_APP_SECRET estiverem
// cadastradas no Cloudflare (Settings > Variables and Secrets).
// ALIEXPRESS_TRACKING_ID é opcional (padrão: "vaiprocarrinho", criado no Portals).
// Preço já vem em reais (target_currency=BRL), com entrega para o Brasil.
// =====================================================================

const ENDPOINT = "https://api-sg.aliexpress.com/sync";
const TRACKING_PADRAO = "vaiprocarrinho";
// Só as primeiras páginas: 150 produtos por busca bastam e cada página é uma consulta a mais
// (o plano grátis do Cloudflare permite 50 consultas externas por visita)
const MAX_PAGINAS = 3;

const CAMPOS = [
  "product_id", "product_title", "product_main_image_url", "product_small_image_urls",
  "target_sale_price", "target_original_price", "discount", "lastest_volume",
  "promotion_link", "shop_name", "first_level_category_name",
].join(",");

async function assinar(segredo, params) {
  // Assinatura da Open Platform: HMAC-SHA256 dos parâmetros em ordem alfabética (nome + valor, tudo junto)
  const texto = Object.keys(params).sort().map((k) => `${k}${params[k]}`).join("");
  const chave = await crypto.subtle.importKey("raw", new TextEncoder().encode(segredo),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const assinatura = await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(texto));
  return [...new Uint8Array(assinatura)].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

async function consultar(env, metodo, extras) {
  const params = {
    app_key: env.ALIEXPRESS_APP_KEY,
    method: metodo,
    sign_method: "sha256",
    timestamp: String(Date.now()),
    ...extras,
  };
  params.sign = await assinar(env.ALIEXPRESS_APP_SECRET, params);
  const resp = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
    body: new URLSearchParams(params),
  });
  const json = await resp.json();
  if (json.error_response) throw new Error(`AliExpress: ${json.error_response.msg || json.error_response.code}`);
  const resultado = json[`${metodo.replace(/\./g, "_")}_response`]?.resp_result;
  // 405 = nenhum produto encontrado (não é erro)
  if (resultado?.resp_code === 405) return [];
  if (!resultado || resultado.resp_code !== 200) throw new Error(`AliExpress: ${resultado?.resp_msg || "resposta inesperada"}`);
  return resultado.result?.products?.product || [];
}

const numero = (v) => Number(String(v ?? "").replace(",", ".")) || null;

function converter(p) {
  const preco = numero(p.target_sale_price);
  const original = numero(p.target_original_price);
  const fotos = [p.product_main_image_url, ...(p.product_small_image_urls?.string || [])].filter(Boolean);
  return {
    id: `aliexpress-${p.product_id}`,
    loja: "aliexpress",
    titulo: p.product_title,
    preco,
    precoAntigo: original > preco ? original : null,
    desconto: parseInt(p.discount, 10) || null,
    imagem: fotos[0] || null,
    imagens: fotos.length > 1 ? [...new Set(fotos)].slice(0, 5) : undefined,
    vendidos: Number(p.lastest_volume) || null,
    vendedor: p.shop_name || null,
    // Vem do exterior na maior parte das vezes: o site avisa que pode haver impostos de importação
    internacional: true,
    link: p.promotion_link, // link já com o código de afiliado
  };
}

export const aliexpress = {
  nome: "aliexpress",
  ativa: (env) => Boolean(env.ALIEXPRESS_APP_KEY && env.ALIEXPRESS_APP_SECRET),
  porPagina: 50, // o máximo que a API aceita

  async buscar(q, env, pagina = 1, { maisVendidos = false } = {}) {
    if (pagina > MAX_PAGINAS) return [];
    const produtos = await consultar(env, "aliexpress.affiliate.product.query", {
      keywords: q,
      page_no: String(pagina),
      page_size: String(this.porPagina),
      fields: CAMPOS,
      // Sem "sort" = relevância; LAST_VOLUME_DESC = mais vendidos (vitrine das categorias)
      ...(maisVendidos && { sort: "LAST_VOLUME_DESC" }),
      target_currency: "BRL",
      target_language: "PT",
      ship_to_country: "BR",
      tracking_id: env.ALIEXPRESS_TRACKING_ID || TRACKING_PADRAO,
    });
    return produtos.map(converter).filter((o) => o.preco > 0 && o.link && o.titulo);
  },

  // "Ofertas do dia": a lista de produtos em alta é da "Advanced API" (ainda não liberada).
  // Até lá, a página inicial continua só com a Shopee e a Awin.
  async destaques() {
    return [];
  },
};
