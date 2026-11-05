// =====================================================================
// FONTE SHOPEE — API oficial de afiliados (GraphQL).
// Só é usada quando as chaves SHOPEE_APP_ID e SHOPEE_SECRET estiverem
// cadastradas no Cloudflare (Settings > Variables and Secrets).
// Funcionando desde 15/10/2026.
// =====================================================================

const ENDPOINT = "https://open-api.affiliate.shopee.com.br/graphql";

const CAMPOS_BASICOS = "itemId productName price priceMin priceMax priceDiscountRate imageUrl offerLink productLink shopName sales ratingStar";
// shopType = tipo da loja (1 = Shopee Mall/oficial; 2 e 4 = indicadas); productCatIds = categorias da própria Shopee
// (códigos, do geral ao específico; a API não dá os nomes). Se a API recusar um desses campos,
// a busca volta a usar só os básicos, para nunca deixar a Shopee fora do ar por causa dele
let extrasAceitos = true;
const camposAtuais = () => `nodes { ${CAMPOS_BASICOS}${extrasAceitos ? " shopType productCatIds" : ""} }`;

async function sha256Hex(texto) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function consultar(env, montarQuery, variables) {
  // Guarda se ESTA consulta pediu o shopType: várias buscas em paralelo podem falhar juntas pelo mesmo motivo,
  // e todas precisam refazer sem ele (não só a primeira que desligou o campo)
  const comExtras = extrasAceitos;
  try {
    return await consultarUmaVez(env, montarQuery(), variables);
  } catch (erro) {
    if (!comExtras || !/shopType|productCatIds|field/i.test(erro.message)) throw erro;
    extrasAceitos = false;
    return consultarUmaVez(env, montarQuery(), variables);
  }
}

async function consultarUmaVez(env, query, variables) {
  return (await chamarShopee(env, query, variables)).productOfferV2.nodes || [];
}

// "Rate limit exceeded" (erro 10030): tenta de novo depois de uma pausa. 03/11/2026: enquanto o robô preparava as
// buscas prontas, visitantes recebiam a Shopee vazia ("lisinha": 0 ofertas)
const PAUSAS_LIMITE_MS = [1500, 3000];
export async function chamarShopee(env, query, variables) {
  for (let tentativa = 0; ; tentativa++) {
    try {
      return await chamarShopeeUmaVez(env, query, variables);
    } catch (erro) {
      // 05/11/2026 (auditoria): "System Error" (10000) também passa sozinho; tentava só no limite
      if (tentativa >= PAUSAS_LIMITE_MS.length || !/10030|rate limit|10000|system error/i.test(erro.message)) throw erro;
      await new Promise((r) => setTimeout(r, PAUSAS_LIMITE_MS[tentativa]));
    }
  }
}

async function chamarShopeeUmaVez(env, query, variables) {
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
  return json.data;
}

// Link de afiliado de qualquer página da Shopee (botão "Ir para a loja" da janela "Lojas parceiras", 26/10/2026):
// quem entra por ele e compra qualquer produto dentro do prazo do cookie gera comissão
export async function linkShopee(env, url = "https://shopee.com.br/") {
  const dados = await chamarShopee(env, "mutation ($url: String!) { generateShortLink(input: { originUrl: $url }) { shortLink } }", { url });
  return dados?.generateShortLink?.shortLink || null;
}

// Miniatura da foto (a Shopee guarda a mesma foto pequena com "_tn" no fim): carrega bem mais rápido
// que a original, que às vezes tem vários MB. O site volta para a original se a miniatura falhar.
const miniatura = (url) => (/\/file\/[\w-]+$/.test(url || "") ? `${url}_tn` : url);

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
    imagem: miniatura(n.imageUrl),
    avaliacao: Number(n.ratingStar) || null,
    vendidos: Number(n.sales) || null,
    vendedor: n.shopName,
    lojaOficial: Array.isArray(n.shopType) ? n.shopType.includes(1) : n.shopType === 1,
    catsLoja: Array.isArray(n.productCatIds) && n.productCatIds.length ? n.productCatIds.map(String) : undefined,
    link: n.offerLink, // link já com o código de afiliado
  };
}

const BUSCA = () => `query ($keyword: String, $sortType: Int, $page: Int, $limit: Int) {
  productOfferV2(keyword: $keyword, sortType: $sortType, page: $page, limit: $limit) { ${camposAtuais()} }
}`;

const MAX_PAGINAS_BUSCA = 2;
const MAX_PAGINAS_VITRINE = 1;

export const shopee = {
  nome: "shopee",
  ativa: (env) => Boolean(env.SHOPEE_APP_ID && env.SHOPEE_SECRET),
  porPagina: 48, // "Ver mais ofertas" (página inicial) e "Ver mais resultados" (busca) pedem a próxima página

  async buscar(q, env, pagina = 1, { maisVendidos = false } = {}) {
    // Limite da Shopee (03/11/2026): desde 02/11 ela recusa ("Rate limit exceeded") quando pedimos muito. Cada busca pede
    // só as 2 primeiras páginas (96 produtos; eram até 9 páginas) e cada termo da vitrine das categorias só a 1ª. As
    // páginas seguintes voltam vazias sem consultar a Shopee (o "Ver mais" continua com as outras lojas)
    if (pagina > (maisVendidos ? MAX_PAGINAS_VITRINE : MAX_PAGINAS_BUSCA)) return [];
    // sortType 1 = relevância, 2 = mais vendidos (vitrine das categorias);
    // 48 por página para sobrar bastante produto depois de separar os acessórios
    const nodes = await consultar(env, BUSCA, { keyword: q, sortType: maisVendidos ? 2 : 1, page: pagina, limit: this.porPagina });
    return nodes.map(converter);
  },

  async destaques(env, pagina = 1) {
    // sortType 2 = mais vendidos
    const nodes = await consultar(env, BUSCA, { sortType: 2, page: pagina, limit: this.porPagina });
    return nodes.map(converter);
  },
};

// Preço de hoje de um produto (alertas de preço, lib/alertas.js): itemId = número do id "shopee-<itemId>"
// O número vai escrito na consulta: como variável ($itemId: Int64) a Shopee responde "wrong type" (24/10/2026)
export async function ofertaShopeePorId(env, itemId) {
  if (!/^\d{1,20}$/.test(String(itemId))) return null;
  const nodes = await consultar(env, () => `{ productOfferV2(itemId: ${itemId}, limit: 1) { ${camposAtuais()} } }`, {});
  return nodes.length ? converter(nodes[0]) : null;
}

// Nomes dos produtos mais vendidos da Shopee agora (usados nos "em alta")
export async function nomesMaisVendidosShopee(env, limite = 50) {
  if (!shopee.ativa(env)) return [];
  const nodes = await consultar(env, BUSCA, { sortType: 2, page: 1, limit: limite });
  return nodes.map((n) => n.productName).filter(Boolean);
}
