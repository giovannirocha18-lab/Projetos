// =====================================================================
// FONTE SHOPEE — API oficial de afiliados (GraphQL).
// Só é usada quando as chaves SHOPEE_APP_ID e SHOPEE_SECRET estiverem
// cadastradas no Cloudflare (Settings > Variables and Secrets).
// Funcionando desde 15/10/2026.
// =====================================================================

const ENDPOINT = "https://open-api.affiliate.shopee.com.br/graphql";

const CAMPOS_BASICOS = "itemId productName price priceMin priceMax priceDiscountRate imageUrl offerLink productLink shopName sales ratingStar";
// shopType = tipo da loja (1 = Shopee Mall/oficial; 2 e 4 = indicadas). Se a API recusar o campo,
// a busca volta a usar só os básicos, para nunca deixar a Shopee fora do ar por causa dele
let extrasAceitos = true;
const camposAtuais = () => `nodes { ${CAMPOS_BASICOS}${extrasAceitos ? " shopType" : ""} }`;

async function sha256Hex(texto) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function consultar(env, montarQuery, variables) {
  try {
    return await consultarUmaVez(env, montarQuery(), variables);
  } catch (erro) {
    if (!extrasAceitos || !/shopType|field/i.test(erro.message)) throw erro;
    extrasAceitos = false;
    return consultarUmaVez(env, montarQuery(), variables);
  }
}

async function consultarUmaVez(env, query, variables) {
  const corpo = JSON.stringify({ query, variables });
  const ts = Math.floor(Date.now() / 1000);
  const assinatura = await sha256Hex(`${env.SHOPEE_APP_ID}${ts}${corpo}${env.SHOPEE_SECRET}`);
  const resp = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `SHA256 Credential=${env.SHOPEE_APP_ID}, Timestamp=${ts}, Signature=${assinatura}`,
    },
    body: corpo,
  });
  const json = await resp.json();
  if (json.errors?.length) throw new Error(`Shopee: ${json.errors[0].message}`);
  return json.data.productOfferV2.nodes || [];
}

function converter(n) {
  const preco = Number(n.priceMin || n.price);
  const desconto = Number(n.priceDiscountRate) || null;
  return {
    id: `shopee-${n.itemId}`,
    loja: "shopee",
    titulo: n.productName,
    preco,
    precoAntigo: desconto ? Math.round((preco / (1 - desconto / 100)) * 100) / 100 : null,
    desconto,
    imagem: n.imageUrl,
    avaliacao: Number(n.ratingStar) || null,
    vendidos: Number(n.sales) || null,
    vendedor: n.shopName,
    lojaOficial: Array.isArray(n.shopType) ? n.shopType.includes(1) : n.shopType === 1,
    link: n.offerLink, // link já com o código de afiliado
  };
}

const BUSCA = () => `query ($keyword: String, $sortType: Int, $page: Int, $limit: Int) {
  productOfferV2(keyword: $keyword, sortType: $sortType, page: $page, limit: $limit) { ${camposAtuais()} }
}`;

export const shopee = {
  nome: "shopee",
  ativa: (env) => Boolean(env.SHOPEE_APP_ID && env.SHOPEE_SECRET),
  porPagina: 48, // destaques: a página inicial pede mais com "Ver mais ofertas"

  async buscar(q, env) {
    // sortType 1 = relevância
    const nodes = await consultar(env, BUSCA, { keyword: q, sortType: 1, page: 1, limit: 30 });
    return nodes.map(converter);
  },

  async destaques(env, pagina = 1) {
    // sortType 2 = mais vendidos
    const nodes = await consultar(env, BUSCA, { sortType: 2, page: pagina, limit: this.porPagina });
    return nodes.map(converter);
  },
};

// Nomes dos produtos mais vendidos da Shopee agora (usados nos "em alta")
export async function nomesMaisVendidosShopee(env, limite = 50) {
  if (!shopee.ativa(env)) return [];
  const nodes = await consultar(env, BUSCA, { sortType: 2, page: 1, limit: limite });
  return nodes.map((n) => n.productName).filter(Boolean);
}
