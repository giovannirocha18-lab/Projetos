// =====================================================================
// FONTE SHOPEE — API oficial de afiliados (GraphQL).
// Só é usada quando as chaves SHOPEE_APP_ID e SHOPEE_SECRET estiverem
// cadastradas no Cloudflare (Settings > Variables and Secrets).
// Funcionando desde 15/10/2026.
// =====================================================================
import { buscarNaListaShopee } from "../shopeeLista.js";

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

async function consultar(env, montarQuery, variables, umaVez = false) {
  // Guarda se ESTA consulta pediu o shopType: várias buscas em paralelo podem falhar juntas pelo mesmo motivo,
  // e todas precisam refazer sem ele (não só a primeira que desligou o campo)
  const comExtras = extrasAceitos;
  try {
    return await consultarUmaVez(env, montarQuery(), variables, umaVez);
  } catch (erro) {
    if (!comExtras || !/shopType|productCatIds|field/i.test(erro.message)) throw erro;
    extrasAceitos = false;
    return consultarUmaVez(env, montarQuery(), variables, umaVez);
  }
}

async function consultarUmaVez(env, query, variables, umaVez) {
  return (await chamarShopee(env, query, variables, umaVez)).productOfferV2.nodes || [];
}

// Shopee em pane (13/11/2026): num dia em que ela recusava TODA busca nova ("System Error"), cada visitante esperava as 3
// tentativas (5 a 8 s) para no fim vir sem ela. Depois de uma recusa, por 3 minutos as buscas dos visitantes tentam a Shopee
// uma vez só e esperam no máximo 2,5 s (os produtos da lista guardada no banco continuam vindo). A primeira resposta boa
// desfaz. O robô e a atualização por trás não usam isso (ninguém está esperando). O aviso fica na memória e no cache do
// Cloudflare (as outras cópias do site no mesmo ponto também ficam sabendo)
const PANE_MS = 3 * 60 * 1000;
const PRAZO_EM_PANE_MS = 2500;
const CHAVE_PANE = "https://vaiprocarrinho.com.br/__shopee/pane";
const cacheDaPane = () => (typeof caches !== "undefined" ? caches.default : null);
const ehPane = (erro) => /10030|rate limit|10000|system error|demorou/i.test(String(erro?.message || erro));
let paneAte = 0;
let paneConferidaEm = 0;
async function emPane() {
  const agora = Date.now();
  if (agora < paneAte) return true;
  if (agora - paneConferidaEm < 20000) return false;
  paneConferidaEm = agora;
  const g = await cacheDaPane()?.match(CHAVE_PANE).catch(() => null);
  const ate = g ? Number(await g.text().catch(() => 0)) : 0;
  if (ate > agora) paneAte = ate;
  return agora < paneAte;
}
function marcarPane(espera) {
  const jaSabia = Date.now() < paneAte - PANE_MS / 2;
  paneAte = Date.now() + PANE_MS;
  if (jaSabia) return;
  // espera = waitUntil do pedido (buscar.js): sem ele, o Cloudflare pode cortar a gravação quando a resposta sai
  const gravar = cacheDaPane()?.put(CHAVE_PANE, new Response(String(paneAte), { headers: { "Cache-Control": `public, max-age=${PANE_MS / 1000}` } })).catch(() => {});
  if (gravar && espera) try { espera(gravar); } catch { /* fora de um pedido */ }
}
function desmarcarPane(espera) {
  if (!paneAte) return;
  paneAte = 0;
  paneConferidaEm = Date.now();
  const apagar = cacheDaPane()?.delete(CHAVE_PANE).catch(() => {});
  if (apagar && espera) try { espera(apagar); } catch { /* fora de um pedido */ }
}

// "Rate limit exceeded" (erro 10030): tenta de novo depois de uma pausa. 03/11/2026: enquanto o robô preparava as
// buscas prontas, visitantes recebiam a Shopee vazia ("lisinha": 0 ofertas)
const PAUSAS_LIMITE_MS = [1500, 3000];
export async function chamarShopee(env, query, variables, umaVez = false) {
  for (let tentativa = 0; ; tentativa++) {
    try {
      return await chamarShopeeUmaVez(env, query, variables);
    } catch (erro) {
      // 05/11/2026 (auditoria): "System Error" (10000) também passa sozinho; tentava só no limite
      if (umaVez || tentativa >= PAUSAS_LIMITE_MS.length || !/10030|rate limit|10000|system error/i.test(erro.message)) throw erro;
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

// Botão "Comprar" dos produtos da lista oficial (lib/shopeeLista.js, 08/11/2026): o link curto que vem na lista (shope.ee)
// leva ao produto sem as marcas de afiliado que os links da busca ao vivo têm (utm_source=an_…, mmp_pid). Para não perder
// comissão, o site mostra o endereço nosso /ir/shopee/<loja>/<produto> e, no clique, pede à Shopee o link de afiliado do
// produto (generateShortLink, o mesmo dos outros botões), guardado 30 dias. Se a Shopee não responder, vai pelo link da lista
export const CAMINHO_IR_SHOPEE = /^\/ir\/shopee\/(\d{1,15})\/(\d{3,20})\/?$/;
const GUARDAR_LINK_S = 30 * 24 * 3600;
export async function destinoShopee(env, caminho, origem, podeGerar = null) {
  const m = CAMINHO_IR_SHOPEE.exec(caminho);
  if (!m) return null;
  const [, loja, item] = m;
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const chave = new Request(`${origem}/ir/shopee/${loja}/${item}?v=1`);
  const guardado = cache && (await cache.match(chave).catch(() => null));
  if (guardado) return guardado.text();
  // Só produto que está na lista (senão qualquer um faria o site gastar o limite da Shopee com códigos inventados)
  let curto = null;
  try {
    const l = env.DB && (await env.DB.prepare("SELECT curto FROM shopee_lista WHERE id = ?").bind(`shopee-${item}`).first());
    if (!l) return `https://shopee.com.br/product/${loja}/${item}`;
    if (/^https:\/\/(shope\.ee|[\w.-]*shopee\.com\.br)\//.test(l.curto || "")) curto = l.curto;
  } catch { /* banco fora do ar */ }
  // Limite por visitante de links novos por hora (trocando o número da loja no endereço, cada pedido gastava o limite da Shopee)
  const pode = !podeGerar || (await podeGerar());
  let link = null;
  try {
    if (pode && shopee.ativa(env)) link = await linkShopee(env, `https://shopee.com.br/product/${loja}/${item}`);
  } catch { /* limite da Shopee: usa o link da lista */ }
  if (/^https:\/\/[\w.-]*shopee\.com\.br\//.test(link || "")) {
    if (cache) await cache.put(chave, new Response(link, { headers: { "Cache-Control": `public, max-age=${GUARDAR_LINK_S}` } })).catch(() => {});
    return link;
  }
  if (curto) return curto;
  return `https://shopee.com.br/product/${loja}/${item}`;
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

  async buscar(q, env, pagina = 1, { maisVendidos = false, prazoMs = 0, soBanco = false, visitante = false, espera = null } = {}) {
    // Busca rápida (buscar.js, rapido=1): só a lista oficial guardada no banco, sem consultar a Shopee
    if (soBanco) return pagina === 1 ? buscarNaListaShopee(env.DB, q, 90) : [];
    // Limite da Shopee (03/11/2026): desde 02/11 ela recusa ("Rate limit exceeded") quando pedimos muito. Cada busca pede
    // só as 2 primeiras páginas (96 produtos; eram até 9 páginas) e cada termo da vitrine das categorias só a 1ª. As
    // páginas seguintes voltam vazias sem consultar a Shopee (o "Ver mais" continua com as outras lojas)
    if (pagina > (maisVendidos ? MAX_PAGINAS_VITRINE : MAX_PAGINAS_BUSCA)) return [];
    // sortType 1 = relevância, 2 = mais vendidos (vitrine das categorias);
    // 48 por página para sobrar bastante produto depois de separar os acessórios
    const comecou = Date.now();
    const pane = visitante && (await emPane());
    if (pane) prazoMs = prazoMs > 0 ? Math.min(prazoMs, PRAZO_EM_PANE_MS) : PRAZO_EM_PANE_MS;
    const aoVivo = consultar(env, BUSCA, { keyword: q, sortType: maisVendidos ? 2 : 1, page: pagina, limit: this.porPagina }, pane)
      .then((nodes) => nodes.map(converter));
    let respondeu = false;
    aoVivo.then(() => { respondeu = true; if (visitante) desmarcarPane(espera); }, (erro) => { respondeu = true; if (visitante && ehPane(erro)) marcarPane(espera); });
    // Lista oficial da Shopee guardada no banco (08/11/2026, lib/shopeeLista.js): na 1ª página, os produtos dela que
    // batem com a busca vêm DEPOIS dos da busca ao vivo (que trazem as vendas) e sem repetir. Se a Shopee recusar
    // (limite), o erro segue (a busca não é guardada como completa), mas levando os da lista (erro.parciais, buscar.js)
    const comPrazo = (promessa) => (prazoMs > 0 ? Promise.race([promessa, new Promise((_, falha) => setTimeout(() => { if (visitante && !respondeu) marcarPane(espera); falha(new Error("Shopee: demorou demais")); }, prazoMs))]) : promessa);
    if (pagina !== 1 || maisVendidos) return pane ? comPrazo(aoVivo) : aoVivo;
    // prazoMs (buscar.js): se a Shopee demorar (pausas de limite), desiste dela um pouco antes do prazo da busca, para os
    // produtos da lista guardada não se perderem junto (10/11/2026, revisão)
    const noPrazo = comPrazo(aoVivo);
    aoVivo.catch(() => {});
    let msVivo = 0;
    noPrazo.catch(() => {}).then(() => { msVivo = Date.now() - comecou; });
    const [vivo, lista] = await Promise.allSettled([noPrazo, buscarNaListaShopee(env.DB, q)]);
    const daLista = lista.status === "fulfilled" ? lista.value : [];
    if (vivo.status === "rejected") {
      const erro = vivo.reason instanceof Error ? vivo.reason : new Error(String(vivo.reason));
      erro.parciais = daLista;
      // Para conferir de fora (lojas.shopee.erro na resposta): se a pane valia e quanto demorou cada parte
      if (visitante && !/\[/.test(erro.message)) erro.message += ` [${pane ? "pane, " : ""}ao vivo ${msVivo} ms, lista ${Date.now() - comecou} ms]`;
      throw erro;
    }
    const ja = new Set(vivo.value.map((o) => o.id));
    return [...vivo.value, ...daLista.filter((o) => !ja.has(o.id))];
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
