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
const CATALOGO_RESERVA = 16; // se o Mercado Livre recusar o limite de 48
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
  if (guardado && Date.now() - guardado.atualizado < validade) return guardado.produtos;
  try {
    if (robo) robo.contagem.consultas++;
    const pedir = (n) => chamar(env, `/products/search?status=active&site_id=MLB&q=${encodeURIComponent(q)}&limit=${n}`);
    const dados = await pedir(CATALOGO).catch((erro) => {
      if (!/ 400\b/.test(erro.message)) throw erro;
      if (robo) robo.contagem.consultas++;
      return pedir(CATALOGO_RESERVA);
    });
    const produtos = (dados?.results || []).map(produtoCurto);
    await guardarCatalogo(env.DB, termo, produtos);
    if (robo) robo.contagem.catalogos++;
    return produtos;
  } catch (erro) {
    // Mercado Livre recusou: o catálogo velho (até VALE_CATALOGO_MS) ainda serve
    if (guardado && Date.now() - guardado.atualizado < VALE_CATALOGO_MS && !robo) return guardado.produtos;
    throw erro;
  }
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
    return comPrecos(env, await catalogo(env, q), { alvo: limite, maxConsultas: limite });
  },

  // Robô da madrugada (/api/preparar-ml): renova no banco o catálogo e os preços de um termo que tiverem mais de "horas".
  // Devolve quantas consultas fez; limite = o Mercado Livre deu 429 (o que já conseguiu fica guardado)
  async preparar(q, env, horas) {
    const contagem = { consultas: 0, catalogos: 0, precos: 0 };
    const robo = { horas, contagem };
    try {
      const produtos = await comPrecos(env, await catalogo(env, q, robo), { robo, alvo: POR_PAGINA });
      return { ...contagem, produtos: produtos.length, limite: false };
    } catch (erro) {
      return { ...contagem, limite: / 429\b/.test(erro.message), erro: String(erro.message || erro) };
    }
  },

  // "Ofertas do dia": a API do catálogo não tem lista de ofertas; o Mercado Livre entra só nas buscas
  async destaques() {
    return [];
  },
};
