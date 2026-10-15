// =====================================================================
// FONTE SHOPEE — API oficial de afiliados (GraphQL).
// Só é usada quando as chaves SHOPEE_APP_ID e SHOPEE_SECRET estiverem
// cadastradas no Cloudflare (Settings > Variables and Secrets).
// Os nomes dos campos seguem a documentação da Open API de afiliados;
// conferir quando o acesso for liberado.
// =====================================================================

const ENDPOINT = "https://open-api.affiliate.shopee.com.br/graphql";

const CAMPOS = `
  nodes {
    itemId productName price priceMin priceMax priceDiscountRate
    imageUrl offerLink productLink shopName sales ratingStar
  }`;

async function sha256Hex(texto) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function consultar(env, query, variables) {
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
    link: n.offerLink, // link já com o código de afiliado
  };
}

const BUSCA = `query ($keyword: String, $sortType: Int, $limit: Int) {
  productOfferV2(keyword: $keyword, sortType: $sortType, page: 1, limit: $limit) { ${CAMPOS} }
}`;

export const shopee = {
  nome: "shopee",
  ativa: (env) => Boolean(env.SHOPEE_APP_ID && env.SHOPEE_SECRET),

  async buscar(q, env) {
    // sortType 1 = relevância
    const nodes = await consultar(env, BUSCA, { keyword: q, sortType: 1, limit: 30 });
    return nodes.map(converter);
  },

  async destaques(env) {
    // sortType 2 = mais vendidos
    const nodes = await consultar(env, BUSCA, { sortType: 2, limit: 24 });
    return nodes.map(converter);
  },
};

// Nomes dos produtos mais vendidos da Shopee agora (usados nos "em alta")
export async function nomesMaisVendidosShopee(env, limite = 50) {
  if (!shopee.ativa(env)) return [];
  const nodes = await consultar(env, BUSCA, { sortType: 2, limit: limite });
  return nodes.map((n) => n.productName).filter(Boolean);
}
