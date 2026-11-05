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
import { temTodasAsPalavras } from "../relevancia.js";

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
  return produtos.map((p, i) => converter(env, p, listas[i])).filter(Boolean).slice(0, alvo);
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
// destaques=N). Servem para as "Ofertas do dia" (os com desconto) e para as vitrines das categorias (os que combinam com
// a busca da vitrine vêm primeiro).
// ---------------------------------------------------------------------------------------------------------------------
const VALE_DESTAQUES_MS = 48 * HORA;
// Categorias principais do Mercado Livre (reserva, se /sites/MLB/categories não responder)
const CATEGORIAS_ML_RESERVA = ["MLB5672", "MLB271599", "MLB1403", "MLB1071", "MLB1367", "MLB1368", "MLB1384", "MLB1246",
  "MLB1132", "MLB1430", "MLB1039", "MLB1743", "MLB1574", "MLB1051", "MLB1500", "MLB5726", "MLB1000", "MLB12404", "MLB1276",
  "MLB263532", "MLB1144", "MLB1499", "MLB1648", "MLB218519", "MLB3937", "MLB1182", "MLB3025", "MLB1168", "MLB264586", "MLB1953"];
// Que não interessam ao site (imóveis, veículos, serviços, ingressos, antiguidades/coleções)
const CATEGORIAS_ML_FORA = new Set(["MLB1459", "MLB1743", "MLB1540", "MLB218519", "MLB1367", "MLB1798"]);
// Lista das categorias para os mais vendidos (05/11/2026): as principais e as subcategorias de cada uma (centenas),
// guardada 7 dias no banco (montá-la custa uma consulta por categoria principal). Também as tendências do Mercado Livre
// (o que mais se busca lá), guardadas 1 dia, que entram na lista de buscas do robô (/api/preparar-ml)
const MAX_CATEGORIAS = 400;
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
export async function categoriasML(env) {
  const guardada = env.DB && (await guardadoML(env.DB, 1, 7 * 24 * HORA));
  if (guardada?.length) return guardada;
  let principais = [];
  try {
    principais = ((await chamar(env, "/sites/MLB/categories")) || []).map((c) => c.id).filter((id) => /^MLB\d+$/.test(id));
  } catch { /* usa a reserva */ }
  if (!principais.length) principais = CATEGORIAS_ML_RESERVA;
  principais = principais.filter((id) => !CATEGORIAS_ML_FORA.has(id));
  const filhas = [];
  for (const id of principais) {
    try {
      const c = await chamar(env, `/categories/${id}`);
      filhas.push(...(c?.children_categories || []).map((f) => f.id).filter((f) => /^MLB\d+$/.test(f || "")));
    } catch (erro) {
      if (/ 429\b/.test(erro.message)) break;
    }
  }
  const lista = [...new Set([...principais, ...filhas])].slice(0, MAX_CATEGORIAS);
  if (env.DB && filhas.length) await guardarML(env.DB, 1, lista);
  return lista;
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

async function tabelaDestaques(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS ml_destaques (produto TEXT PRIMARY KEY, categoria TEXT NOT NULL,
    posicao INTEGER NOT NULL, dados TEXT NOT NULL, atualizado INTEGER NOT NULL)`).run();
}
// Oferta vencedora da ficha (buy_box_winner) no formato das ofertas guardadas
const doVencedor = (v) => (v && paraNumero(v.price) ? [{ item_id: v.item_id, price: v.price, original_price: v.original_price,
  condition: v.condition || "new", official_store_id: v.official_store_id ?? null, shipping: { free_shipping: Boolean(v.shipping?.free_shipping) } }] : []);

// Robô: mais vendidos de uma categoria do Mercado Livre -> banco. Fichas (PRODUCT) só: anúncio solto (ITEM) dá 403
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
  for (const f of fichas) {
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
      linhas.push([f.id, f.position || linhas.length + 1, { produto, itens }]);
    } catch (erro) {
      if (/ 429\b/.test(erro.message)) { limite = true; break; }
    }
  }
  const agora = Date.now();
  if (fichasNovas.length) {
    await env.DB.batch(fichasNovas.map(([id, d]) => env.DB.prepare("INSERT OR REPLACE INTO ml_fichas (produto, dados, atualizado) VALUES (?, ?, ?)")
      .bind(id, JSON.stringify(d), agora)));
  }
  await guardarOfertasNoBanco(env.DB, precosNovos);
  if (linhas.length) {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM ml_destaques WHERE categoria = ?").bind(categoria),
      ...linhas.map(([id, pos, dados]) => env.DB.prepare("INSERT OR REPLACE INTO ml_destaques (produto, categoria, posicao, dados, atualizado) VALUES (?, ?, ?, ?, ?)")
        .bind(id, categoria, pos, JSON.stringify(dados), agora)),
    ]);
  }
  contagem.destaques += linhas.length;
  if (limite) throw new Error(`Mercado Livre: 429 (limite) depois de ${linhas.length} mais vendidos nesta categoria`);
}

// Mais vendidos guardados (todas as categorias), já como ofertas do site, na ordem de posição (1º de cada categoria,
// depois os 2º…). Guardados 10 min na memória
const destaquesGuardados = { lista: null, ate: 0 };
async function destaquesDoBanco(env) {
  if (destaquesGuardados.lista && Date.now() < destaquesGuardados.ate) return destaquesGuardados.lista;
  let lista = [];
  try {
    const { results } = await env.DB.prepare("SELECT dados FROM ml_destaques WHERE atualizado > ? ORDER BY posicao, categoria")
      .bind(Date.now() - VALE_DESTAQUES_MS).all();
    lista = (results || []).map((l) => { const d = JSON.parse(l.dados); return converter(env, d.produto, d.itens); }).filter(Boolean);
  } catch { /* tabela ainda não existe */ }
  destaquesGuardados.lista = lista;
  destaquesGuardados.ate = Date.now() + 10 * 60 * 1000;
  return lista;
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

// Página da loja Mercado Livre (05/11/2026): os mais vendidos guardados pelo robô, um de cada categoria por vez
export async function produtosDaLojaML(env, pagina, porPagina) {
  const todos = await destaquesDoBanco(env);
  return { nome: "Mercado Livre", ofertas: todos.slice((pagina - 1) * porPagina, pagina * porPagina), temMais: todos.length > pagina * porPagina };
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

export const mercadolivre = {
  nome: "mercadolivre",
  ativa: (env) => Boolean(env.ML_CLIENT_ID && env.ML_CLIENT_SECRET),
  porPagina: POR_PAGINA,

  async buscar(q, env, pagina = 1, { maisVendidos = false } = {}) {
    if (!q || pagina > 1) return [];
    const limite = maisVendidos ? POR_PAGINA_VITRINE : POR_PAGINA;
    // Os mais vendidos do Mercado Livre que combinam com a busca vêm primeiro (vitrines; e em toda busca desde 05/11/2026:
    // "celular" na loja ML trazia 1 aparelho antigo, porque o catálogo do ML devolve muito modelo velho sem vendedor)
    const campeoes = (await destaquesDoBanco(env)).filter(((bate) => (o) => bate(o.titulo))(temTodasAsPalavras(q)));
    if (campeoes.length >= limite) return campeoes.slice(0, limite);
    const doCatalogo = await comPrecos(env, maisParecidasPrimeiro(q, await catalogo(env, q)), { alvo: limite, maxConsultas: limite }).catch((erro) => {
      if (campeoes.length) return [];
      throw erro;
    });
    const vistos = new Set(campeoes.map((o) => o.id));
    return [...campeoes, ...doCatalogo.filter((o) => !vistos.has(o.id))].slice(0, limite);
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

  // "Ofertas do dia": os mais vendidos do Mercado Livre com desconto (guardados pelo robô), maior desconto primeiro
  async destaques(env, pagina = 1) {
    const comDesconto = (await destaquesDoBanco(env)).filter((o) => o.precoAntigo > o.preco)
      .sort((a, b) => (b.desconto || 0) - (a.desconto || 0));
    return comDesconto.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);
  },

  // Robô (/api/preparar-ml?destaques=N): mais vendidos da N-ésima categoria do Mercado Livre
  async prepararDestaques(env, n) {
    const categorias = await categoriasML(env);
    if (n >= categorias.length) return { categoria: null, categorias: categorias.length, fim: true };
    const contagem = { consultas: 0, destaques: 0 };
    try {
      await prepararDestaques(env, categorias[n], contagem);
      return { categoria: categorias[n], categorias: categorias.length, fim: n + 1 >= categorias.length, ...contagem, limite: false };
    } catch (erro) {
      return { categoria: categorias[n], categorias: categorias.length, fim: false, ...contagem,
        limite: / 429\b/.test(erro.message), erro: String(erro.message || erro) };
    }
  },
};
