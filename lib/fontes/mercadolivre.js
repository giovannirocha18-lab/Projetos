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

import { tokenDaConta } from "../mlConta.js";
import { normalizar } from "../texto.js";
import { temTodasAsPalavras, separarAcessorios, palavrasObrigatorias, textoParaFiltro } from "../relevancia.js";

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

// Token da conta conectada pelo painel (lib/mlConta.js), guardado 10 min na memória. Com ele a busca de anúncios continua
// 403 (teste de 05/11/2026), mas o preço das fichas abre: serve de reserva quando o token do app leva 429
const daConta = { valor: null, ate: 0 };
async function tokenReserva(env) {
  if (Date.now() < daConta.ate) return daConta.valor;
  const conta = await tokenDaConta(env).catch(() => null);
  daConta.valor = conta?.access || null;
  daConta.ate = Date.now() + Math.min(10 * 60 * 1000, Math.max(0, (conta?.ate || 0) - Date.now()));
  if (!daConta.valor) daConta.ate = Date.now() + 10 * 60 * 1000;
  return daConta.valor;
}

// GET na API com o token; 401 = token vencido: pede outro e tenta mais uma vez. 404 volta null (produto sem oferta).
// 429 (limite do Mercado Livre) com o token do app: tenta uma vez com o token da conta conectada, se houver
async function chamar(env, caminho, renovado = false, comConta = false) {
  const t = comConta ? await tokenReserva(env) : await tokenAtual(env, renovado);
  const r = await fetch(`${API}${caminho}`, { headers: { Authorization: `Bearer ${t}`, Accept: "application/json" } });
  if (r.status === 429 && !comConta && (await tokenReserva(env))) return chamar(env, caminho, renovado, true);
  if (r.status === 401 && comConta) { daConta.ate = 0; }
  if (r.status === 401 && !renovado && !comConta) return chamar(env, caminho, true);
  if (r.status === 404) return null;
  const dados = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`Mercado Livre: ${r.status} ${dados?.message || dados?.error || ""}`.trim());
  return dados;
}

// VITRINE DOS MAIS BUSCADOS (10/11/2026, página inicial): para cada termo, a foto e o preço do 1º produto do catálogo guardado
// pelo robô (ml_catalogo) que tem preço novo (ml_ofertas, até 48 h) (foto e preço do mesmo produto). Só lê o banco: nenhuma consulta ao Mercado Livre
// Produtos que não servem de foto no cartão (a foto não mostra o produto). Giovanni manda print -> pôr o id aqui
// (o id aparece em /api/em-alta?depurar=<termo>). 10/11/2026: espelhos Adnet com a foto só da alça
const VITRINE_FORA = new Set(["mercadolivre-MLB54262346", "mercadolivre-MLB57832267"]);
export async function vitrineTendencias(env, termos, depurar = false) {
  if (!env.DB || !termos.length) return [];
  const chaves = termos.map(termoML);
  const catalogos = new Map();
  try {
    const { results } = await env.DB.prepare(`SELECT termo, produtos FROM ml_catalogo WHERE termo IN (${chaves.map(() => "?").join(",")})`)
      .bind(...chaves).all();
    for (const l of results || []) catalogos.set(l.termo, JSON.parse(l.produtos).slice(0, 16));
  } catch {
    return [];
  }
  const ids = [...new Set([...catalogos.values()].flat().map((p) => p.id))];
  const ofertas = new Map();
  for (let i = 0; i < ids.length; i += 90) {
    for (const [k, v] of await ofertasDoBanco(env.DB, ids.slice(i, i + 90))) ofertas.set(k, v);
  }
  // Mais vendidos do ML que batem com cada termo (como na busca do site): vêm primeiro, o catálogo completa
  const indice = await indiceDestaques(env).catch(() => []);
  const campeoes = await Promise.all(termos.map(async (termo) => {
    const obrigatorias = palavrasObrigatorias(termo);
    const bate = temTodasAsPalavras(termo);
    const queBatem = [];
    for (const o of indice) {
      if (obrigatorias.every((p) => o.busca.includes(p)) && bate(o.titulo)) queBatem.push(o);
      if (queBatem.length >= 60) break;
    }
    const ids = separarAcessorios(queBatem, termo).filter((o) => !o.acessorio).slice(0, 8).map((o) => o.id);
    return ids.length ? dadosDosDestaques(env, ids) : [];
  }));
  // Foto e preço do 1º produto que começa pelo termo (o mais vendido, se houver)
  return termos.map((termo, i) => {
    const vistos = new Set(campeoes[i].map((o) => o.id));
    const comPreco = [...campeoes[i], ...(catalogos.get(chaves[i]) || []).map((p) => {
      const b = ofertas.get(p.id);
      return b && Date.now() - b.atualizado <= VALE_PRECO_MS ? converter(env, p, b.itens) : null;
    })].filter((o) => o?.imagem && (campeoes[i].includes(o) || !vistos.has(o.id)));
    // Só o produto buscado: capinha de R$ 15 não é "iPhone 15 Pro Max a partir de R$ 15" (mesmo filtro da busca do site)
    const marcados = separarAcessorios(comPreco, termo);
    if (depurar) return { termo, lista: marcados.map((o) => [o.id, o.preco, o.acessorio ? "A" : "", o.bate ? "B" : "", o.principal ? "P" : "", o.titulo.slice(0, 60)]) };
    // Só quem começa pelo que foi buscado ("Apple iPhone 16…", não "Kit Chaves … iPhone"; "Moto Elétrica…", não "Motosserra Elétrica")
    const produtos = marcados.filter((o) => o.principal && !VITRINE_FORA.has(o.id));
    if (!produtos.length) return { termo, foto: null, preco: null };
    // Foto e preço do mesmo produto (o 1º: o mais vendido, se houver), para o preço nunca ser de outro item
    return { termo, foto: produtos[0].imagem, preco: produtos[0].preco };
  });
}

// AMOSTRA DOS ANÚNCIOS (10/11/2026): o que /products/{id}/items manda além do preço (entrega Full, parcelas, etiquetas),
// para os selos "Full" e "sem juros". Só leitura: /api/preparar-ml?amostraItens=1 (workflow teste-ml.yml)
export async function amostraItensML(env) {
  const { results } = await env.DB.prepare("SELECT produto FROM ml_destaques ORDER BY posicao, atualizado DESC LIMIT 4").all();
  const saida = [];
  for (const { produto } of results || []) {
    try {
      const d = await chamar(env, `/products/${encodeURIComponent(produto)}/items?limit=3`);
      const i = d?.results?.[0];
      saida.push({ produto, campos: i ? Object.keys(i) : null, shipping: i?.shipping, installments: i?.installments ?? null,
        tags: i?.tags ?? null, sale_terms: i?.sale_terms ?? null, warranty: i?.warranty ?? null, price: i?.price,
        original_price: i?.original_price, todos: (d?.results || []).map((x) => ({ logistic: x.shipping?.logistic_type, tags: x.shipping?.tags, inst: x.installments ?? null })) });
    } catch (erro) {
      saida.push({ produto, erro: String(erro.message || erro).slice(0, 120) });
    }
  }
  let fila = null;
  try { fila = (await env.DB.prepare("SELECT COUNT(*) n, SUM(vezes) v FROM ml_fila").first()) || null; } catch { /* sem fila */ }
  return { saida, fila };
}

// TESTE DAS NOTAS (05/11/2026, Giovanni quer o ML no "Mais bem avaliado" da Escolha rápida): o ML não manda nota nem vendas
// no catálogo. O robô chama /api/preparar-ml?testarNotas=1 e anota no log o que cada caminho de avaliações responde, com o
// token do app e com o da conta conectada. Só leitura; não guarda nada
export async function testarNotasML(env) {
  let produto = null;
  let item = null;
  try {
    const l = await env.DB.prepare("SELECT produto, dados FROM ml_destaques ORDER BY posicao, atualizado DESC LIMIT 1").first();
    produto = l?.produto || null;
    item = JSON.parse(l?.dados || "{}").itens?.find((i) => /^MLB\d+$/.test(i.item_id || ""))?.item_id || null;
  } catch { /* sem mais vendidos guardados */ }
  if (!produto) return { erro: "sem produto para testar" };
  const caminhos = [
    `/reviews/item/${item}`,
    `/reviews/item/${item}?catalog_product_id=${produto}`,
    `/products/${produto}/reviews`,
    `/reviews/product/${produto}`,
    `/products/${produto}`,
    `/items/${item}`,
  ];
  const tokens = [["app", await tokenAtual(env).catch(() => null)], ["conta", await tokenReserva(env).catch(() => null)]];
  const resultados = [];
  for (const caminho of caminhos) {
    for (const [nome, t] of tokens) {
      if (!t) { resultados.push({ caminho, token: nome, status: "sem token" }); continue; }
      try {
        const r = await fetch(`${API}${caminho}`, { headers: { Authorization: `Bearer ${t}`, Accept: "application/json" } });
        const d = await r.json().catch(() => null);
        const nota = d?.rating_average ?? d?.reviews?.rating_average ?? d?.rating ?? null;
        const total = d?.paging?.total ?? d?.reviews?.total ?? null;
        const vendas = d?.sold_quantity ?? null;
        resultados.push({ caminho, token: nome, status: r.status, nota, total, vendas,
          campos: d && typeof d === "object" ? Object.keys(d).slice(0, 25).join(",") : null, mensagem: d?.message || null });
      } catch (erro) {
        resultados.push({ caminho, token: nome, status: "falhou", mensagem: String(erro.message || erro).slice(0, 80) });
      }
    }
  }
  return { produto, item, resultados, abriu: resultados.some((r) => r.status === 200 && (r.nota != null || r.vendas != null)) };
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
    // Entrega Full do Mercado Livre (o produto já está no depósito do ML: sai rápido; 10/11/2026)
    full: Boolean(melhor.shipping?.full) || undefined,
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
  official_store_id: i.official_store_id ?? null, shipping: { free_shipping: Boolean(i.shipping?.free_shipping), full: i.shipping?.logistic_type === "fulfillment" || Boolean(i.shipping?.full) } });
async function ofertasGuardadas(id) {
  const g = await cachePrecos()?.match(chavePreco(id)).catch(() => null);
  return g ? g.json().catch(() => null) : null;
}
async function guardarOfertas(id, itens) {
  await cachePrecos()?.put(chavePreco(id), new Response(JSON.stringify(itens), {
    headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${GUARDAR_PRECO_S}` } })).catch(() => {});
}

// ---------------------------------------------------------------------------------------------------------------------
// BANCO (D1), 04/11/2026: por causa do 429, o robô da madrugada (job "mercadolivre" do robo-precos.yml, /api/preparar-ml)
// passa devagar pelas buscas prontas e guarda o catálogo de cada termo (ml_catalogo) e as ofertas de cada produto
// (ml_ofertas). A busca do site lê de lá e só pergunta ao Mercado Livre o que não estiver guardado (e guarda também).
// ---------------------------------------------------------------------------------------------------------------------
const HORA = 60 * 60 * 1000;
// Até quando a busca do site usa o que está no banco (o robô renova a cada 1 ou 2 madrugadas; ver /api/preparar-ml)
const VALE_CATALOGO_MS = 4 * 24 * HORA;
const VALE_PRECO_MS = 48 * HORA;
// Catálogo guardado com até 48 produtos (04/11/2026): dos 16 primeiros, só ~3 tinham vendedor ("No winners found" ou só
// usados); com 48 sobram mais com preço. A busca mostra os 16 primeiros que têm preço (a vitrine, 8)
const CATALOGO = 48;
const CATALOGO_RESERVA = 16;
const CATALOGO_48_DESDE = Date.UTC(2026, 10, 5, 2, 0); // se o Mercado Livre recusar o limite de 48
// Produto sem vendedor (a maioria do catálogo) só é perguntado de novo depois de 4 dias
const VALE_SEM_VENDEDOR_MS = 4 * 24 * HORA;
let tabelasProntas = false;
async function criarTabelas(db) {
  if (tabelasProntas || !db) return;
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS ml_catalogo (termo TEXT PRIMARY KEY, produtos TEXT NOT NULL, atualizado INTEGER NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS ml_ofertas (produto TEXT PRIMARY KEY, itens TEXT NOT NULL, atualizado INTEGER NOT NULL)"),
  ]);
  tabelasProntas = true;
}
export const termoML = (q) => String(q || "").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 100);
// Só o que a página do produto usa (nome, fotos, tipo)
const produtoCurto = (p) => ({ id: p.id, name: p.name, domain_id: p.domain_id || null,
  pictures: (p.pictures || []).slice(0, 5).map((f) => ({ secure_url: f.secure_url || f.url })) });

async function catalogoGuardado(db, termo) {
  if (!db) return null;
  try {
    const l = await db.prepare("SELECT produtos, atualizado FROM ml_catalogo WHERE termo = ?").bind(termo).first();
    return l ? { produtos: JSON.parse(l.produtos), atualizado: l.atualizado } : null;
  } catch {
    return null; // tabela ainda não existe
  }
}
async function guardarCatalogo(db, termo, produtos) {
  if (!db) return;
  try {
    await criarTabelas(db);
    await db.prepare("INSERT OR REPLACE INTO ml_catalogo (termo, produtos, atualizado) VALUES (?, ?, ?)")
      .bind(termo, JSON.stringify(produtos), Date.now()).run();
  } catch { /* banco fora do ar: segue sem guardar */ }
}
async function ofertasDoBanco(db, ids) {
  const mapa = new Map();
  if (!db || !ids.length) return mapa;
  try {
    const { results } = await db.prepare(`SELECT produto, itens, atualizado FROM ml_ofertas WHERE produto IN (${ids.map(() => "?").join(",")})`)
      .bind(...ids).all();
    for (const l of results || []) mapa.set(l.produto, { itens: JSON.parse(l.itens), atualizado: l.atualizado });
  } catch { /* tabela ainda não existe */ }
  return mapa;
}
async function guardarOfertasNoBanco(db, novas) {
  if (!db || !novas.length) return;
  try {
    await criarTabelas(db);
    const agora = Date.now();
    await db.batch(novas.map(([id, itens]) => db.prepare("INSERT OR REPLACE INTO ml_ofertas (produto, itens, atualizado) VALUES (?, ?, ?)")
      .bind(id, JSON.stringify(itens), agora)));
  } catch { /* banco fora do ar: segue sem guardar */ }
}

const temPreco = (itens) => (itens || []).some((i) => paraNumero(i.price) && (!i.condition || i.condition === "new"));

// Preços dos produtos do catálogo, na ordem do catálogo, até ter "alvo" produtos com preço. O que já está no banco
// (preço dentro da validade; sem vendedor há menos de 4 dias) não é perguntado de novo.
// robo = { horas, contagem }: o robô renova o que tiver mais de "horas" e pede 1 preço por vez; no 429 guarda o que já
// conseguiu e avisa (erro com "429"), para o robô esperar 1 minuto e tentar de novo.
// maxConsultas: na busca do site, no máximo tantas perguntas ao Mercado Livre por busca (limite dele e tempo)
async function comPrecos(env, produtos, { robo = null, alvo = produtos.length, maxConsultas = Infinity } = {}) {
  const listas = new Array(produtos.length);
  const validade = robo ? robo.horas * HORA : VALE_PRECO_MS;
  const doBanco = await ofertasDoBanco(env.DB, produtos.map((p) => p.id));
  const novoNoBanco = (id) => {
    const b = doBanco.get(id);
    return Boolean(b) && Date.now() - b.atualizado < (temPreco(b.itens) ? validade : VALE_SEM_VENDEDOR_MS);
  };
  const guardadas = robo ? [] : await Promise.all(produtos.map((p) => (novoNoBanco(p.id) ? null : ofertasGuardadas(p.id))));
  const faltam = [];
  produtos.forEach((p, i) => {
    if (novoNoBanco(p.id)) listas[i] = doBanco.get(p.id).itens;
    else if (Array.isArray(guardadas[i])) listas[i] = guardadas[i];
    else faltam.push(i);
  });
  // Quantos já têm preço entre os que vêm antes de cada um que falta: pergunta só até completar o alvo
  let comPreco = listas.filter(temPreco).length;
  let proximo = 0;
  let consultas = 0;
  let limite = false;
  const novas = [];
  const trabalhar = async () => {
    while (!limite && proximo < faltam.length && comPreco < alvo && consultas < maxConsultas) {
      const i = faltam[proximo++];
      consultas++;
      try {
        if (robo) robo.contagem.consultas++;
        const d = await chamar(env, `/products/${encodeURIComponent(produtos[i].id)}/items?limit=5`);
        listas[i] = (d?.results || []).map(resumo);
        if (temPreco(listas[i])) comPreco++;
        // Quantas ofertas (vendedores) a ficha tem: só para o relatório do robô (Giovanni, 04/11/2026)
        if (robo && listas[i].length) { robo.contagem.fichasComOferta++; robo.contagem.ofertasNasFichas += Number(d?.paging?.total) || listas[i].length; }
        novas.push([produtos[i].id, listas[i]]); // sem vendedor agora (404) também fica guardado
        if (!robo) await guardarOfertas(produtos[i].id, listas[i]);
      } catch (erro) {
        if (/ 429\b/.test(erro.message)) limite = true;
        // Sem preço novo: fica com o do banco, mesmo mais velho (até VALE_PRECO_MS)
        const b = doBanco.get(produtos[i].id);
        listas[i] = b && Date.now() - b.atualizado < VALE_PRECO_MS ? b.itens : [];
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(robo ? 1 : SIMULTANEAS, faltam.length) }, trabalhar));
  await guardarOfertasNoBanco(env.DB, novas);
  if (robo) {
    robo.contagem.precos += novas.length;
    if (limite) throw new Error(`Mercado Livre: 429 (limite) depois de ${novas.length} preços nesta busca`);
  }
  // Os que ficaram sem pergunta nesta vez: o preço do banco, mesmo mais velho (até VALE_PRECO_MS)
  produtos.forEach((p, i) => {
    if (listas[i] !== undefined) return;
    const b = doBanco.get(p.id);
    listas[i] = b && Date.now() - b.atualizado < VALE_PRECO_MS ? b.itens : [];
  });
  const resultado = produtos.map((p, i) => converter(env, p, listas[i])).filter(Boolean).slice(0, alvo);
  // Na busca do site, o ML recusou (429) no meio: vira erro levando o que veio (erro.parciais). Assim a busca não é guardada
  // como completa e é refeita por trás (08/11/2026, print do Giovanni: "panela ceramica" ficou 6 h sem nenhum produto do ML)
  if (limite && resultado.length < alvo) {
    const erro = new Error(`Mercado Livre: 429 (limite) com ${resultado.length} de ${alvo} produtos com preço`);
    erro.parciais = resultado;
    throw erro;
  }
  return resultado;
}

// Produtos do catálogo para um termo: do banco se estiver novo, senão do Mercado Livre (e guarda)
async function catalogo(env, q, robo = null) {
  const termo = termoML(q);
  const guardado = await catalogoGuardado(env.DB, termo);
  const validade = robo ? robo.horas * HORA : VALE_CATALOGO_MS;
  // O robô refaz uma vez os catálogos guardados com 16 produtos antes de passarem a 48 (04/11/2026, 23h de Brasília)
  const antigo = robo && guardado && guardado.atualizado < CATALOGO_48_DESDE && guardado.produtos.length < CATALOGO;
  if (guardado && !antigo && Date.now() - guardado.atualizado < validade) return guardado.produtos;
  try {
    if (robo) robo.contagem.consultas++;
    const pedir = (n) => chamar(env, `/products/search?status=active&site_id=MLB&q=${encodeURIComponent(q)}&limit=${n}`);
    const dados = await pedir(CATALOGO).catch((erro) => {
      if (!/ 400\b/.test(erro.message)) throw erro;
      if (robo) robo.contagem.consultas++;
      return pedir(CATALOGO_RESERVA);
    });
    let produtos = (dados?.results || []).map(produtoCurto);
    // Robô: 2ª página do catálogo (mais fichas = mais chances de ter vendedor; 05/11/2026, "o máximo de produtos do ML")
    if (robo && produtos.length >= CATALOGO) {
      robo.contagem.consultas++;
      const mais = await chamar(env, `/products/search?status=active&site_id=MLB&q=${encodeURIComponent(q)}&limit=${CATALOGO}&offset=${CATALOGO}`).catch(() => null);
      const vistos = new Set(produtos.map((p) => p.id));
      produtos = [...produtos, ...(mais?.results || []).map(produtoCurto).filter((p) => !vistos.has(p.id))];
    }
    await guardarCatalogo(env.DB, termo, produtos);
    if (robo) robo.contagem.catalogos++;
    return produtos;
  } catch (erro) {
    // Mercado Livre recusou: o catálogo velho (até VALE_CATALOGO_MS) ainda serve
    if (guardado && Date.now() - guardado.atualizado < VALE_CATALOGO_MS && !robo) return guardado.produtos;
    throw erro;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// MAIS VENDIDOS (05/11/2026): /highlights/MLB/category/{categoria} abre para nós (a busca de anúncios não). O robô guarda
// toda madrugada os ~20 mais vendidos de cada categoria do Mercado Livre com o preço (ml_destaques, /api/preparar-ml?
// proxima=1; desde 05/11/2026 todas as categorias, ver ml_categorias). Servem para as "Ofertas do dia" (os com desconto) e para as vitrines das categorias (os que combinam com
// a busca da vitrine vêm primeiro).
// ---------------------------------------------------------------------------------------------------------------------
// 4 dias (05/11/2026): as sub-subcategorias são renovadas em revezamento (nem todas toda madrugada). As "Ofertas do dia"
// usam só os renovados nas últimas 30 h (VALE_OFERTA_DO_DIA_MS)
const VALE_DESTAQUES_MS = 4 * 24 * HORA;
const VALE_OFERTA_DO_DIA_MS = 30 * HORA;
// Categorias principais do Mercado Livre (reserva, se /sites/MLB/categories não responder)
const CATEGORIAS_ML_RESERVA = ["MLB5672", "MLB271599", "MLB1403", "MLB1071", "MLB1367", "MLB1368", "MLB1384", "MLB1246",
  "MLB1132", "MLB1430", "MLB1039", "MLB1743", "MLB1574", "MLB1051", "MLB1500", "MLB5726", "MLB1000", "MLB12404", "MLB1276",
  "MLB263532", "MLB1144", "MLB1499", "MLB1648", "MLB218519", "MLB3937", "MLB1182", "MLB3025", "MLB1168", "MLB264586", "MLB1953"];
// Que não interessam ao site (imóveis, veículos, serviços, ingressos, antiguidades/coleções)
const CATEGORIAS_ML_FORA = new Set(["MLB1459", "MLB1743", "MLB1540", "MLB218519", "MLB1367", "MLB1798"]);
// Listas guardadas no banco (ml_listas): 2 = tendências do Mercado Livre (o que mais se busca lá, 1 dia; entram na lista
// de buscas do robô, /api/preparar-ml), 3 = árvore das categorias principais e subcategorias (7 dias)
async function guardadoML(db, id, validade) {
  try {
    await db.prepare("CREATE TABLE IF NOT EXISTS ml_listas (id INTEGER PRIMARY KEY, lista TEXT NOT NULL, atualizado INTEGER NOT NULL)").run();
    const l = await db.prepare("SELECT lista, atualizado FROM ml_listas WHERE id = ?").bind(id).first();
    return l && Date.now() - l.atualizado < validade ? JSON.parse(l.lista) : null;
  } catch {
    return null;
  }
}
async function guardarML(db, id, lista) {
  await db.prepare("INSERT OR REPLACE INTO ml_listas (id, lista, atualizado) VALUES (?, ?, ?)").bind(id, JSON.stringify(lista), Date.now()).run().catch(() => {});
}
// Árvore das categorias (05/11/2026, atalhos da página da loja ML): nome de cada categoria principal e a principal de cada
// subcategoria. Guardada 7 dias no banco (montá-la custa uma consulta por categoria principal)
export async function arvoreML(env) {
  const guardada = env.DB && (await guardadoML(env.DB, 3, 7 * 24 * HORA));
  if (guardada?.nomes) return guardada;
  const nomes = {};
  const pai = {};
  let principais = [];
  try {
    principais = ((await chamar(env, "/sites/MLB/categories")) || []).filter((c) => /^MLB\d+$/.test(c.id || "") && !CATEGORIAS_ML_FORA.has(c.id));
  } catch { /* sem árvore desta vez */ }
  let comFilhas = 0;
  for (const c of principais) {
    nomes[c.id] = c.name;
    try {
      const d = await chamar(env, `/categories/${c.id}`);
      for (const f of d?.children_categories || []) if (/^MLB\d+$/.test(f.id || "")) pai[f.id] = c.id;
      comFilhas++;
    } catch (erro) {
      if (/ 429\b/.test(erro.message)) break;
    }
  }
  const arvore = { nomes, pai };
  if (env.DB && comFilhas >= Math.min(10, principais.length) && principais.length) await guardarML(env.DB, 3, arvore);
  return arvore;
}

// TODAS AS CATEGORIAS (05/11/2026, pedido do Giovanni: "o máximo de produtos do ML"). Antes o robô parava nas 400 primeiras
// (principais + subcategorias); o Mercado Livre tem ~27 principais, ~390 subcategorias (nível 2) e ~2.740 sub-subcategorias
// (nível 3, ex.: "Fones Bluetooth"). A tabela ml_categorias guarda as três e quando cada uma teve os mais vendidos
// renovados (destaques_em): o robô pega primeiro os níveis 1 e 2 (toda madrugada) e depois o nível 3, as mais antigas
// primeiro, até acabar o tempo (revezando entre as madrugadas).
let categoriasProntas = false;
async function tabelaCategorias(db) {
  if (categoriasProntas) return;
  await db.prepare(`CREATE TABLE IF NOT EXISTS ml_categorias (id TEXT PRIMARY KEY, pai TEXT, principal TEXT NOT NULL,
    nivel INTEGER NOT NULL, filhas_em INTEGER NOT NULL DEFAULT 0, destaques_em INTEGER NOT NULL DEFAULT 0)`).run();
  await db.prepare("ALTER TABLE ml_categorias ADD COLUMN tendencias_em INTEGER NOT NULL DEFAULT 0").run().catch(() => {}); // já existe
  categoriasProntas = true;
}
const SETE_DIAS = 7 * 24 * HORA;
// Robô (/api/preparar-ml?arvore=1): põe os níveis 1 e 2 na tabela e lê as filhas (nível 3) de até "porVez" subcategorias
// que não foram lidas nos últimos 7 dias. Devolve quantas faltam (o robô chama de novo até faltar 0)
export async function montarArvoreML(env, porVez = 25) {
  const db = env.DB;
  await tabelaCategorias(db);
  const arvore = await arvoreML(env);
  const principais = Object.keys(arvore.nomes || {});
  if (!principais.length) throw new Error("Mercado Livre: sem a lista de categorias");
  const novas = (linhas) => linhas.map(([id, pai, principal, nivel]) =>
    db.prepare("INSERT OR IGNORE INTO ml_categorias (id, pai, principal, nivel) VALUES (?, ?, ?, ?)").bind(id, pai, principal, nivel));
  // Níveis 1 e 2: só quando a árvore guardada tem alguma que a tabela ainda não tem (cada linha conta no limite de
  // consultas ao banco por chamada)
  const de1e2 = [...principais.map((id) => [id, null, id, 1]),
    ...Object.entries(arvore.pai || {}).filter(([, p]) => arvore.nomes[p]).map(([id, p]) => [id, p, p, 2])];
  const jaTem = await db.prepare("SELECT COUNT(*) AS n FROM ml_categorias WHERE nivel <= 2").first();
  if ((jaTem?.n || 0) < de1e2.length) await db.batch(novas(de1e2));
  const agora = Date.now();
  const { results } = await db.prepare("SELECT id, principal FROM ml_categorias WHERE nivel = 2 AND filhas_em < ? LIMIT ?")
    .bind(agora - SETE_DIAS, porVez).all();
  let lidas = 0;
  let filhas = 0;
  let limite = false;
  for (const c of results || []) {
    try {
      const d = await chamar(env, `/categories/${encodeURIComponent(c.id)}`);
      const lista = (d?.children_categories || []).filter((f) => /^MLB\d+$/.test(f.id || ""));
      await db.batch([...novas(lista.map((f) => [f.id, c.id, c.principal, 3])),
        db.prepare("UPDATE ml_categorias SET filhas_em = ? WHERE id = ?").bind(agora, c.id)]);
      lidas++;
      filhas += lista.length;
    } catch (erro) {
      if (/ 429\b/.test(erro.message)) { limite = true; break; }
    }
  }
  const resto = await db.prepare("SELECT COUNT(*) AS n FROM ml_categorias WHERE nivel = 2 AND filhas_em < ?").bind(agora - SETE_DIAS).first();
  const total = await db.prepare("SELECT nivel, COUNT(*) AS n FROM ml_categorias GROUP BY nivel").all();
  return { lidas, filhas, faltam: limite ? Math.max(1, resto?.n || 0) : (resto?.n || 0), limite,
    categorias: Object.fromEntries((total.results || []).map((l) => [`nivel${l.nivel}`, l.n])) };
}

// TENDÊNCIAS POR CATEGORIA (05/11/2026, Giovanni: "nosso site trazer o que o público mais está buscando"): o que mais se
// busca no Mercado Livre em cada categoria principal e subcategoria (/trends/MLB/{categoria}). Guardado em ml_tendencias
// (vale 7 dias), na ordem: o 1º de cada categoria, depois os 2º… Vira sugestão da caixa de busca (/api/vocabulario), busca
// pronta (as primeiras, /api/preparar-buscas) e busca preparada com o Mercado Livre (/api/preparar-ml).
let tendenciasProntas = false;
async function tabelaTendencias(db) {
  if (tendenciasProntas) return;
  await db.prepare(`CREATE TABLE IF NOT EXISTS ml_tendencias (termo TEXT PRIMARY KEY, texto TEXT NOT NULL, categoria TEXT NOT NULL,
    principal TEXT, posicao INTEGER NOT NULL, atualizado INTEGER NOT NULL)`).run();
  tendenciasProntas = true;
}
const VALE_TENDENCIA_MS = 7 * 24 * HORA;
// Robô (/api/preparar-ml?tendencias=1): tendências de até "porVez" categorias (níveis 1 e 2) não lidas nas últimas 20 h.
// O termo que aparece em mais de uma categoria fica com a melhor posição
export async function prepararTendenciasML(env, porVez = 30) {
  const db = env.DB;
  await Promise.all([tabelaCategorias(db), tabelaTendencias(db)]);
  const agora = Date.now();
  const antes = agora - 20 * HORA;
  const { results } = await db.prepare(`SELECT id, principal FROM ml_categorias WHERE nivel <= 2 AND tendencias_em < ?
    ORDER BY nivel, tendencias_em, id LIMIT ?`).bind(antes, porVez).all();
  let lidas = 0;
  let termos = 0;
  let limite = false;
  const erros = [];
  for (const c of results || []) {
    try {
      const lista = (await chamar(env, `/trends/MLB/${encodeURIComponent(c.id)}`)) || [];
      const linhas = (Array.isArray(lista) ? lista : []).map((t, i) => [String(t.keyword || "").replace(/\s+/g, " ").trim().toLowerCase(), i + 1])
        .filter(([t]) => t.length >= 3 && t.length <= 60);
      await db.batch([
        ...linhas.map(([texto, posicao]) => db.prepare(`INSERT INTO ml_tendencias (termo, texto, categoria, principal, posicao, atualizado)
          VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(termo) DO UPDATE SET texto = excluded.texto, categoria = excluded.categoria,
          principal = excluded.principal, posicao = excluded.posicao, atualizado = excluded.atualizado
          WHERE excluded.posicao <= ml_tendencias.posicao OR ml_tendencias.atualizado < ?`)
          .bind(normalizar(texto), texto, c.id, c.principal, posicao, agora, antes)),
        db.prepare("UPDATE ml_categorias SET tendencias_em = ? WHERE id = ?").bind(agora, c.id),
      ]);
      lidas++;
      termos += linhas.length;
    } catch (erro) {
      if (/ 429\b/.test(erro.message)) { limite = true; break; }
      erros.push(`${c.id}: ${String(erro.message || erro).slice(0, 80)}`);
      await db.prepare("UPDATE ml_categorias SET tendencias_em = ? WHERE id = ?").bind(agora, c.id).run();
    }
  }
  const resto = await db.prepare("SELECT COUNT(*) AS n FROM ml_categorias WHERE nivel <= 2 AND tendencias_em < ?").bind(antes).first();
  const total = await db.prepare("SELECT COUNT(*) AS n FROM ml_tendencias WHERE atualizado > ?").bind(agora - VALE_TENDENCIA_MS).first();
  return { lidas, termos, faltam: limite ? Math.max(1, resto?.n || 0) : (resto?.n || 0), limite, guardadas: total?.n || 0,
    erros: erros.slice(0, 3), comErro: erros.length };
}
// As tendências guardadas (texto), o 1º de cada categoria primeiro
export async function tendenciasDasCategorias(env, quantas = 1500) {
  if (!env.DB) return [];
  try {
    const { results } = await env.DB.prepare(`SELECT texto FROM ml_tendencias WHERE atualizado > ? ORDER BY posicao, principal, categoria
      LIMIT ?`).bind(Date.now() - VALE_TENDENCIA_MS, quantas).all();
    return (results || []).map((l) => l.texto);
  } catch {
    return []; // tabela ainda não existe
  }
}

export async function tendenciasML(env) {
  const guardada = env.DB && (await guardadoML(env.DB, 2, 24 * HORA));
  if (guardada) return guardada;
  let lista = [];
  try {
    lista = ((await chamar(env, "/trends/MLB")) || []).map((t) => String(t.keyword || "").trim().toLowerCase()).filter(Boolean).slice(0, 50);
  } catch { /* fica sem */ }
  if (env.DB && lista.length) await guardarML(env.DB, 2, lista);
  return lista;
}

// Nome e fotos de cada ficha mudam pouco: guardados 14 dias (ml_fichas); o preço é renovado toda madrugada (ml_ofertas)
async function fichasDoBanco(db, ids) {
  const mapa = new Map();
  try {
    await db.prepare("CREATE TABLE IF NOT EXISTS ml_fichas (produto TEXT PRIMARY KEY, dados TEXT NOT NULL, atualizado INTEGER NOT NULL)").run();
    const { results } = await db.prepare(`SELECT produto, dados FROM ml_fichas WHERE atualizado > ? AND produto IN (${ids.map(() => "?").join(",")})`)
      .bind(Date.now() - 14 * 24 * HORA, ...ids).all();
    for (const l of results || []) mapa.set(l.produto, JSON.parse(l.dados));
  } catch { /* sem banco */ }
  return mapa;
}

// titulo e desconto (05/11/2026): com as ~3.000 categorias são dezenas de milhares de mais vendidos, e a busca não pode mais
// abrir todos; ela lê só o nome (o índice, abaixo) e depois os dados dos que vai mostrar
let destaquesProntos = false;
async function tabelaDestaques(db) {
  if (destaquesProntos) return;
  await db.prepare(`CREATE TABLE IF NOT EXISTS ml_destaques (produto TEXT PRIMARY KEY, categoria TEXT NOT NULL,
    posicao INTEGER NOT NULL, dados TEXT NOT NULL, atualizado INTEGER NOT NULL)`).run();
  for (const coluna of ["titulo TEXT", "desconto INTEGER", "busca TEXT", "frete INTEGER"]) {
    await db.prepare(`ALTER TABLE ml_destaques ADD COLUMN ${coluna}`).run().catch(() => {}); // já existe
  }
  destaquesProntos = true;
}
// Oferta vencedora da ficha (buy_box_winner) no formato das ofertas guardadas
const doVencedor = (v) => (v && paraNumero(v.price) ? [{ item_id: v.item_id, price: v.price, original_price: v.original_price,
  condition: v.condition || "new", official_store_id: v.official_store_id ?? null, shipping: { free_shipping: Boolean(v.shipping?.free_shipping), full: v.shipping?.logistic_type === "fulfillment" } }] : []);

// Robô: mais vendidos de uma categoria do Mercado Livre -> banco. Fichas (PRODUCT) só: anúncio solto (ITEM) dá 403.
// 3 fichas ao mesmo tempo (05/11/2026: eram uma por vez; com ~3.000 categorias o tempo da madrugada não dava)
const SIMULTANEAS_ROBO = 3;
async function prepararDestaques(env, categoria, contagem) {
  contagem.consultas++;
  const h = await chamar(env, `/highlights/MLB/category/${encodeURIComponent(categoria)}`);
  const fichas = (h?.content || []).filter((c) => c.type === "PRODUCT" && /^MLB\d+$/.test(c.id || ""));
  await tabelaDestaques(env.DB);
  if (!fichas.length) return;
  const ids = fichas.map((f) => f.id);
  const [guardadas, precos] = await Promise.all([fichasDoBanco(env.DB, ids), ofertasDoBanco(env.DB, ids)]);
  const linhas = [];
  const fichasNovas = [];
  const precosNovos = [];
  let limite = false;
  let proxima = 0;
  const trabalhar = async () => {
    while (!limite && proxima < fichas.length) {
      const f = fichas[proxima++];
      try {
        let produto = guardadas.get(f.id);
        let vencedor = [];
        if (!produto) {
          contagem.consultas++;
          const p = await chamar(env, `/products/${encodeURIComponent(f.id)}`);
          if (!p) continue;
          produto = produtoCurto(p);
          vencedor = doVencedor(p.buy_box_winner);
          fichasNovas.push([f.id, produto]);
        }
        const b = precos.get(f.id);
        let itens = b && Date.now() - b.atualizado < 20 * HORA ? b.itens : vencedor;
        if (!temPreco(itens)) {
          contagem.consultas++;
          itens = ((await chamar(env, `/products/${encodeURIComponent(f.id)}/items?limit=5`))?.results || []).map(resumo);
          precosNovos.push([f.id, itens]);
        }
        if (!temPreco(itens)) continue;
        linhas.push([f.id, f.position || proxima, { produto, itens }]);
      } catch (erro) {
        if (/ 429\b/.test(erro.message)) limite = true;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(SIMULTANEAS_ROBO, fichas.length) }, trabalhar));
  const agora = Date.now();
  if (fichasNovas.length) {
    await env.DB.batch(fichasNovas.map(([id, d]) => env.DB.prepare("INSERT OR REPLACE INTO ml_fichas (produto, dados, atualizado) VALUES (?, ?, ?)")
      .bind(id, JSON.stringify(d), agora)));
  }
  await guardarOfertasNoBanco(env.DB, precosNovos);
  if (linhas.length) {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM ml_destaques WHERE categoria = ?").bind(categoria),
      ...linhas.map(([id, pos, dados]) => {
        const o = converter(env, dados.produto, dados.itens);
        return env.DB.prepare(`INSERT OR REPLACE INTO ml_destaques (produto, categoria, posicao, dados, atualizado, titulo, desconto, busca, frete)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, categoria, pos, JSON.stringify(dados), agora, dados.produto?.name || "", o?.desconto || 0,
          textoParaFiltro(dados.produto?.name || ""), o?.freteGratis ? 1 : 0);
      }),
    ]);
  }
  contagem.destaques += linhas.length;
  if (limite) throw new Error(`Mercado Livre: 429 (limite) depois de ${linhas.length} mais vendidos nesta categoria`);
}

// ÍNDICE dos mais vendidos guardados (todas as categorias): só código, nome, categoria e desconto, na ordem de posição
// (1º de cada categoria, depois os 2º…; nas principais e subcategorias antes das sub-subcategorias). Guardado 30 min na
// memória. Os dados completos (fotos, preço) só dos que vão aparecer (dadosDosDestaques)
const indiceGuardado = { lista: null, ate: 0 };
async function indiceDestaques(env) {
  if (indiceGuardado.lista && Date.now() < indiceGuardado.ate) return indiceGuardado.lista;
  let lista = [];
  const desde = Date.now() - VALE_DESTAQUES_MS;
  await tabelaDestaques(env.DB).catch(() => {}); // colunas novas (titulo, desconto, busca) antes da 1ª madrugada
  // frete (08/11/2026, botão "Frete grátis" das Ofertas do dia): gravado pelo robô; nos guardados antes disso, calculado só nos
  // que têm desconto de oferta do dia, pela oferta mais barata nova (a mesma que converter() escolhe)
  const frete = `CASE WHEN d.frete IS NOT NULL THEN d.frete WHEN d.desconto BETWEEN 5 AND 60 THEN (SELECT json_extract(value, '$.shipping.free_shipping')
    FROM json_each(d.dados, '$.itens') WHERE CAST(json_extract(value, '$.price') AS REAL) > 0 AND COALESCE(json_extract(value, '$.condition'), 'new') = 'new'
    ORDER BY CAST(json_extract(value, '$.price') AS REAL) LIMIT 1) END AS frete`;
  const base = "d.produto, COALESCE(d.titulo, json_extract(d.dados, '$.produto.name')) AS titulo, d.categoria, d.desconto, d.atualizado, d.busca";
  // Tenta com o frete; se a conta do frete falhar, o índice vem sem ele (o resto do site não pode ficar sem o ML)
  const consultas = [
    `SELECT ${base}, ${frete}, c.principal, c.nivel FROM ml_destaques d LEFT JOIN ml_categorias c ON c.id = d.categoria
      WHERE d.atualizado > ? ORDER BY d.posicao, COALESCE(c.nivel, 2), d.categoria`,
    `SELECT ${base}, c.principal, c.nivel FROM ml_destaques d LEFT JOIN ml_categorias c ON c.id = d.categoria
      WHERE d.atualizado > ? ORDER BY d.posicao, COALESCE(c.nivel, 2), d.categoria`,
    // ml_categorias ainda não existe (antes da 1ª madrugada com a árvore)
    `SELECT ${base} FROM ml_destaques d WHERE d.atualizado > ? ORDER BY d.posicao, d.categoria`,
  ];
  let leu = false;
  for (const sql of consultas) {
    try {
      lista = (await env.DB.prepare(sql).bind(desde).all()).results || [];
      leu = true;
      break;
    } catch { /* tenta a próxima (ou a tabela ainda não existe) */ }
  }
  // Banco falhou agora (10/11/2026, revisão): não guarda "vazio" por 30 min; fica com a lista anterior e tenta de novo em 1 min
  if (!leu && indiceGuardado.lista?.length) {
    indiceGuardado.ate = Date.now() + 60 * 1000;
    return indiceGuardado.lista;
  }
  lista = lista.filter((l) => l.titulo).map((l) => ({ id: l.produto, titulo: l.titulo, catML: l.categoria, catPrincipal: l.principal || null,
    desconto: Number(l.desconto) || 0, atualizado: l.atualizado, busca: l.busca || textoParaFiltro(l.titulo), frete: Number(l.frete) === 1 }));
  indiceGuardado.lista = lista;
  indiceGuardado.ate = Date.now() + (leu ? 30 : 1) * 60 * 1000;
  return lista;
}
// Dados completos (como ofertas do site) dos códigos pedidos, na mesma ordem; os que não têm mais preço ficam de fora
async function dadosDosDestaques(env, ids) {
  const mapa = new Map();
  const POR_VEZ = 90; // o banco aceita até 100 valores por consulta
  const partes = [];
  for (let i = 0; i < ids.length; i += POR_VEZ) partes.push(ids.slice(i, i + POR_VEZ));
  if (!partes.length) return [];
  try {
    const respostas = await env.DB.batch(partes.map((p) => env.DB.prepare(`SELECT produto, dados, posicao FROM ml_destaques WHERE produto IN (${p.map(() => "?").join(",")})`).bind(...p)));
    for (const r of respostas) {
      for (const l of r.results || []) {
        const d = JSON.parse(l.dados);
        const o = converter(env, d.produto, d.itens);
        // rankML = posição no ranking de mais vendidos da categoria no ML (05/11/2026): o ML não nos manda vendas nem nota,
        // e é o que mostra que vende (selo no cartão e "Custo-benefício" da Escolha rápida, app.js)
        if (o) mapa.set(l.produto, Number(l.posicao) > 0 ? { ...o, rankML: Number(l.posicao) } : o);
      }
    }
  } catch { /* banco fora do ar */ }
  return ids.map((id) => mapa.get(id)).filter(Boolean);
}

// Fichas que batem com todas as palavras da busca primeiro (05/11/2026: a busca do catálogo do Mercado Livre é solta;
// em "air fryer 5 litros" vinham 3,5 L, 4 L e 25 L antes das de 5 L, e o preço era pedido para essas primeiro)
function maisParecidasPrimeiro(q, produtos) {
  const bate = temTodasAsPalavras(q);
  const sim = [];
  const nao = [];
  for (const p of produtos) (bate(p.name || "") ? sim : nao).push(p);
  return [...sim, ...nao];
}

// Quantos mais vendidos o site tem do Mercado Livre (o total que a página da loja mostra: "Mostrando 240 de 3.798")
export async function totalDaLojaML(env) {
  return (await indiceDestaques(env)).length;
}

// Página da loja Mercado Livre (05/11/2026): os mais vendidos guardados pelo robô, um de cada categoria por vez
// Categorias do ML em que os acessórios se misturam ao produto: o produto principal vem primeiro no atalho
const PRODUTO_PRINCIPAL_DA_CATEGORIA = { MLB1051: "celular", MLB1039: "câmera" };

// Atalhos (05/11/2026): as categorias principais do ML com quantos mais vendidos cada uma tem; cat = só uma delas
export async function produtosDaLojaML(env, pagina, porPagina, cat = null) {
  const todos = await indiceDestaques(env);
  const arvore = await arvoreML(env).catch(() => ({ nomes: {}, pai: {} }));
  const principal = (o) => o.catPrincipal || arvore.pai[o.catML] || o.catML;
  const contagem = new Map();
  for (const o of todos) {
    const p = principal(o);
    if (arvore.nomes[p]) contagem.set(p, (contagem.get(p) || 0) + 1);
  }
  const atalhos = [...contagem].filter(([, n]) => n >= 8).sort((a, b) => b[1] - a[1])
    .map(([id, n]) => ({ id, nome: arvore.nomes[id], n }));
  let lista = cat ? todos.filter((o) => principal(o) === cat) : todos;
  // Dentro do atalho, o produto principal antes dos acessórios (05/11/2026: "Celulares e Telefones" misturava aparelhos com
  // carregador e rádio comunicador)
  const termo = PRODUTO_PRINCIPAL_DA_CATEGORIA[cat];
  if (termo) {
    const marcados = separarAcessorios(lista, termo);
    const eh = (o) => o.bate && !o.acessorio;
    const limpar = ({ acessorio, parecido, principal: _p, bate, nivel, ...o }) => o;
    lista = [...marcados.filter(eh), ...marcados.filter((o) => !eh(o))].map(limpar);
  }
  const ofertas = await dadosDosDestaques(env, lista.slice((pagina - 1) * porPagina, pagina * porPagina).map((o) => o.id));
  return { nome: "Mercado Livre", ofertas, temMais: lista.length > pagina * porPagina, atalhos, total: lista.length };
}

// Um produto pelo código da ficha (link compartilhado ?produto=mercadolivre-MLB…, alertas de preço). Ofertas do banco se
// tiverem menos de 6 h; senão pergunta ao Mercado Livre
export async function ofertaMLPorId(env, codigo) {
  if (!/^MLB\d{4,15}$/i.test(codigo || "")) return null;
  const p = await chamar(env, `/products/${encodeURIComponent(codigo)}`);
  if (!p) return null;
  const doBanco = (await ofertasDoBanco(env.DB, [p.id])).get(p.id);
  let itens = doBanco && Date.now() - doBanco.atualizado < 6 * HORA ? doBanco.itens : doVencedor(p.buy_box_winner);
  if (!temPreco(itens)) {
    itens = ((await chamar(env, `/products/${encodeURIComponent(p.id)}/items?limit=5`))?.results || []).map(resumo);
    await guardarOfertasNoBanco(env.DB, [[p.id, itens]]);
  }
  return converter(env, produtoCurto(p), itens);
}

// Só a 1ª página (o preço custa uma consulta por produto); na vitrine das categorias (4 a 6 buscas juntas), menos ainda
const POR_PAGINA = 24; // era 16 (05/11/2026: "o máximo de produtos do ML")
const POR_PAGINA_VITRINE = 8;

// Páginas 2 em diante da busca (10/11/2026, Giovanni: "por que o ML só traz 24?"): só do banco, sem consulta ao ML (o limite
// 429 é o que segurava a 1ª página em 24). Ordem: os mais vendidos que batem com a busca (produto antes de acessório), depois o
// catálogo guardado pelo robô com preço de até 48 h. A 1ª página é o começo dessa mesma lista
const PAGINAS_DO_BANCO = 9; // até 10 páginas = 240 produtos do ML por busca
async function listaDoBanco(env, q) {
  const obrigatorias = palavrasObrigatorias(q);
  const bate = temTodasAsPalavras(q);
  const queBatem = [];
  for (const o of await indiceDestaques(env)) {
    if (obrigatorias.every((p) => o.busca.includes(p)) && bate(o.titulo)) queBatem.push(o);
    if (queBatem.length >= 400) break;
  }
  const marcados = separarAcessorios(queBatem, q);
  const ids = [...marcados.filter((o) => !o.acessorio), ...marcados.filter((o) => o.acessorio)].map((o) => ({ destaque: o.id }));
  const vistos = new Set(ids.map((i) => i.destaque));
  const guardado = await catalogoGuardado(env.DB, termoML(q));
  const doCatalogo = maisParecidasPrimeiro(q, guardado?.produtos || []).filter((p) => !vistos.has(p.id));
  return [...ids, ...doCatalogo.map((p) => ({ produto: p }))];
}
async function paginaDoBanco(env, q, pagina) {
  const lista = await listaDoBanco(env, q);
  // A partir de onde a 1ª página parou; os do catálogo sem preço no banco são pulados (a página pode vir com menos de 24)
  const parte = lista.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);
  const destaques = await dadosDosDestaques(env, parte.filter((i) => i.destaque).map((i) => i.destaque));
  const produtos = parte.filter((i) => i.produto).map((i) => i.produto);
  const precos = await ofertasDoBanco(env.DB, produtos.map((p) => p.id));
  const doCatalogo = produtos.map((p) => {
    const b = precos.get(p.id);
    return b && Date.now() - b.atualizado <= VALE_PRECO_MS ? converter(env, p, b.itens) : null;
  }).filter(Boolean);
  // temMais: a lista do banco continua depois desta página (buscar.js; a página vem com menos de 24 quando falta preço)
  return Object.assign([...destaques, ...doCatalogo], { temMais: pagina <= PAGINAS_DO_BANCO && lista.length > pagina * POR_PAGINA });
}

export const mercadolivre = {
  nome: "mercadolivre",
  ativa: (env) => Boolean(env.ML_CLIENT_ID && env.ML_CLIENT_SECRET),
  porPagina: POR_PAGINA,

  async buscar(q, env, pagina = 1, { maisVendidos = false } = {}) {
    if (!q || pagina > PAGINAS_DO_BANCO + 1) return [];
    if (pagina > 1) return paginaDoBanco(env, q, pagina);
    const limite = maisVendidos ? POR_PAGINA_VITRINE : POR_PAGINA;
    // Os mais vendidos do Mercado Livre que combinam com a busca vêm primeiro (vitrines; e em toda busca desde 05/11/2026:
    // "celular" na loja ML trazia 1 aparelho antigo, porque o catálogo do ML devolve muito modelo velho sem vendedor)
    // (o índice tem só o nome; os dados completos só dos que vão aparecer)
    // Filtro rápido (palavras obrigatórias no nome já preparado) antes do completo: são dezenas de milhares de nomes
    const obrigatorias = palavrasObrigatorias(q);
    const bate = temTodasAsPalavras(q);
    // Até 400 (na ordem de posição: os mais vendidos de cada categoria primeiro), para separar os acessórios depressa
    const queBatem = [];
    for (const o of await indiceDestaques(env)) {
      if (obrigatorias.every((p) => o.busca.includes(p)) && bate(o.titulo)) queBatem.push(o);
      if (queBatem.length >= 400) break;
    }
    // O produto buscado antes dos acessórios ("celular": aparelhos antes de capinhas e suportes dos mais vendidos)
    const marcados = separarAcessorios(queBatem, q);
    const ordem = [...marcados.filter((o) => !o.acessorio), ...marcados.filter((o) => o.acessorio)].map((o) => o.id);
    const campeoes = await dadosDosDestaques(env, ordem.slice(0, limite + 4));
    if (campeoes.length >= limite) return campeoes.slice(0, limite);
    const vistos = new Set(campeoes.map((o) => o.id));
    const juntar = (lista) => [...campeoes, ...lista.filter((o) => !vistos.has(o.id))].slice(0, limite);
    let doCatalogo;
    try {
      doCatalogo = await comPrecos(env, maisParecidasPrimeiro(q, await catalogo(env, q)), { alvo: limite, maxConsultas: limite });
    } catch (erro) {
      // Recusa do ML (429): a loja conta como em erro (a busca é refeita por trás), mas leva os que já vieram
      // (mais vendidos + os do catálogo que deram preço; buscar.js usa erro.parciais)
      erro.parciais = juntar(Array.isArray(erro.parciais) ? erro.parciais : []);
      throw erro;
    }
    return juntar(doCatalogo);
  },

  // Robô da madrugada (/api/preparar-ml): renova no banco o catálogo e os preços de um termo que tiverem mais de "horas".
  // Devolve quantas consultas fez; limite = o Mercado Livre deu 429 (o que já conseguiu fica guardado)
  async preparar(q, env, horas) {
    const contagem = { consultas: 0, catalogos: 0, precos: 0, fichasComOferta: 0, ofertasNasFichas: 0 };
    const robo = { horas, contagem };
    try {
      const produtos = await comPrecos(env, maisParecidasPrimeiro(q, await catalogo(env, q, robo)), { robo, alvo: POR_PAGINA });
      return { ...contagem, produtos: produtos.length, limite: false };
    } catch (erro) {
      return { ...contagem, limite: / 429\b/.test(erro.message), erro: String(erro.message || erro) };
    }
  },

  // Black Friday (06/11/2026): os mais vendidos com desconto de min% a max%, na ordem do ranking de vendas (o que mais
  // vende primeiro; pela regra do Giovanni, produto atual e que vende). Por desconto, o topo era só 75% em produto estranho
  async ofertasBlackFriday(env, pagina = 1, min = 10, max = 60) {
    const desde = Date.now() - VALE_OFERTA_DO_DIA_MS;
    const lista = (await indiceDestaques(env)).filter((o) => o.desconto >= min && o.desconto <= max && o.atualizado > desde);
    return dadosDosDestaques(env, lista.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA).map((o) => o.id));
  },

  // "Ofertas do dia": os mais vendidos do Mercado Livre com desconto (guardados pelo robô), na ordem do ranking de vendas
  // (06/11/2026, pedido do Giovanni: por maior desconto o topo era só 75% em maçarico, simulador de sutura...). Desconto de
  // 5% a 60%, como na Black Friday (acima disso costuma ser preço "de" inflado)
  async destaques(env, pagina = 1) {
    // Só os renovados nas últimas 30 h (o preço de oferta muda rápido)
    const desde = Date.now() - VALE_OFERTA_DO_DIA_MS;
    const comDesconto = (await indiceDestaques(env)).filter((o) => o.desconto >= 5 && o.desconto <= 60 && o.atualizado > desde);
    return dadosDosDestaques(env, comDesconto.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA).map((o) => o.id));
  },

  // Botão "🚚 Frete grátis" das Ofertas do dia (08/11/2026, pedido do Giovanni: abria com 41 e só crescia rolando): as mesmas
  // ofertas do dia do Mercado Livre (única loja que informa frete grátis), só as com frete grátis, e quantas são ao todo
  async ofertasFreteGratis(env, pagina = 1, porPagina = 48) {
    const desde = Date.now() - VALE_OFERTA_DO_DIA_MS;
    const lista = (await indiceDestaques(env)).filter((o) => o.frete && o.desconto >= 5 && o.desconto <= 60 && o.atualizado > desde);
    const ofertas = await dadosDosDestaques(env, lista.slice((pagina - 1) * porPagina, pagina * porPagina).map((o) => o.id));
    return { ofertas: ofertas.filter((o) => o.freteGratis), total: lista.length, temMais: lista.length > pagina * porPagina };
  },

  // Robô (/api/preparar-ml?proxima=1): mais vendidos da próxima categoria da vez (ml_categorias): primeiro as principais e
  // subcategorias não renovadas nas últimas 20 h, depois as sub-subcategorias, a mais antiga primeiro. nivelMax = 2: só
  // as principais e subcategorias (o job "mercadolivre"; as sub-subcategorias ficam para o job "maisvendidos")
  async prepararProxima(env, nivelMax = 3) {
    const db = env.DB;
    await tabelaCategorias(db);
    const antes = Date.now() - 20 * HORA;
    const c = await db.prepare(`SELECT id, nivel FROM ml_categorias WHERE destaques_em < ? AND nivel <= ?
      ORDER BY CASE WHEN nivel <= 2 THEN 0 ELSE 1 END, destaques_em, id LIMIT 1`).bind(antes, nivelMax).first();
    const faltam = async () => (await db.prepare("SELECT COUNT(*) AS n FROM ml_categorias WHERE destaques_em < ? AND nivel <= ?")
      .bind(antes, nivelMax).first())?.n || 0;
    if (!c) return { categoria: null, fim: true, faltam: 0 };
    const contagem = { consultas: 0, destaques: 0 };
    try {
      await prepararDestaques(env, c.id, contagem);
    } catch (erro) {
      const limite = / 429\b/.test(erro.message);
      // Recusa do Mercado Livre: a categoria fica para a próxima tentativa (o robô espera 1 minuto)
      if (limite) return { categoria: c.id, nivel: c.nivel, fim: false, ...contagem, limite, erro: String(erro.message || erro) };
      await db.prepare("UPDATE ml_categorias SET destaques_em = ? WHERE id = ?").bind(Date.now(), c.id).run();
      return { categoria: c.id, nivel: c.nivel, fim: false, faltam: await faltam(), ...contagem, limite: false, erro: String(erro.message || erro) };
    }
    await db.prepare("UPDATE ml_categorias SET destaques_em = ? WHERE id = ?").bind(Date.now(), c.id).run();
    const n = await faltam();
    return { categoria: c.id, nivel: c.nivel, fim: n === 0, faltam: n, ...contagem, limite: false };
  },
};
