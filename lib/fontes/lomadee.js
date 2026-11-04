// =====================================================================
// FONTE LOMADEE — Affiliate API (https://docs.lomadee.com.br/api-reference/introduction)
// Só é usada quando LOMADEE_API_KEY estiver cadastrada no Cloudflare (Settings > Variables and Secrets).
// A chave precisa dos escopos products:read, brands:read e shortener:write.
// Várias lojas numa rede só: cada produto vem com a marca (organizationId) e o nome dela aparece no cartão.
// Limite da Lomadee: 60 consultas por minuto por chave (por isso as marcas ficam guardadas por 6 horas
// e o link com comissão só é gerado quando alguém clica: ver functions/api/ir.js).
// =====================================================================

import { temTodasAsPalavras } from "../relevancia.js";
import { lojaComLinksQuebrados, sortear } from "../links.js";
import { semPaginasQuebradas, paginaDoProduto } from "../fotos.js";

const BASE = "https://api.lomadee.com.br";
const MAX_PAGINAS = 3;
const PAGINAS_POR_CONSULTA = 6; // = PAGINAS_POR_LOTE da busca (functions/api/buscar.js)
const VALIDADE_MARCAS = 6 * 60 * 60 * 1000;
const MAX_PAGINAS_MARCAS = 15; // 20 marcas por página
// Lojas que já buscamos direto pela API delas (comissão melhor e sem repetir produto)
// Marcas que não são loja de produtos (04/11/2026, pedido do Giovanni: "tire todos que não fazem parte da loja"):
// China in Box (restaurante de delivery), DeÔnibus (passagens), Zupper (viagens), Bauducco e Vinícola Jolimont (comida
// e bebida), eles.® (consultas e remédios com receita). Apareciam só nos cupons
const FORA = [/shopee/, /aliexpress/, /china in box/, /deonibus/, /zupper/, /bauducco/, /jolimont/, /^eles\b/];
// Algumas marcas mandam R$ 1 no lugar do preço (PCYES, 17/10/2026): essas ofertas ficam de fora
const PRECO_MINIMO = 2;
// Sites com links quebrados no catálogo da Lomadee: os produtos ficam de fora até a loja corrigir.
// vestis.com.br (UP Kids, 17/10/2026, print do Giovanni): manda para upkids.com.br com o mesmo endereço, que dá 404
// (12 de 12 produtos testados). Para conferir de novo: abrir um link "vestis.com.br/…/p" e ver se o produto abre
const SITES_QUEBRADOS = ["vestis.com.br"];
// Além da lista acima, a conferência da madrugada (conferirMarcas) abre 4 produtos de cada marca direto no site dela:
// se quase todos dão "página não encontrada", a marca sai do site (busca e "Lojas parceiras") até voltar a abrir (25/10/2026)
const LINKS_TESTADOS = 4;
const linkQuebrado = (url) => {
  try {
    const host = new URL(url).hostname;
    return SITES_QUEBRADOS.some((s) => host === s || host.endsWith(`.${s}`));
  } catch {
    return true;
  }
};
// Lojas com cor própria no site (LOJAS do app.js): o nome da marca na Lomadee -> chave da loja
const CHAVES = [["magalu", "magalu"], ["magazine luiza", "magalu"], ["amazon", "amazon"], ["shein", "shein"], ["mercado livre", "mercadolivre"]];

const normalizar = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// A Lomadee permite 60 consultas por minuto (para todos os visitantes juntos). Quando ela pede pausa (429),
// este servidor fica sem consultá-la até o fim da pausa, em vez de insistir
let pausaAte = 0;
export async function pedirLomadee(env, caminho, { metodo = "GET", corpo } = {}) {
  if (Date.now() < pausaAte) throw new Error("Lomadee em pausa (limite de consultas por minuto)");
  const resp = await fetch(`${BASE}${caminho}`, {
    method: metodo,
    headers: { "x-api-key": env.LOMADEE_API_KEY, ...(corpo && { "Content-Type": "application/json" }) },
    ...(corpo && { body: JSON.stringify(corpo) }),
  });
  const json = await resp.json().catch(() => null);
  if (resp.status === 429) pausaAte = Date.now() + (Number(resp.headers.get("Retry-After")) || 30) * 1000;
  if (!resp.ok) throw new Error(`Lomadee ${resp.status}: ${json?.message || json?.code || "erro"}`);
  return json;
}

// Marcas em que o afiliado foi aprovado: a Lomadee manda, para cada canal, os links da marca
// (ou uma mensagem dizendo por que o canal não pode divulgar). Guardadas por 6 horas.
// Guardadas na memória do servidor e no cache do Cloudflare (que vale para todos os servidores): a lista tem
// 7 páginas e buscá-la em cada servidor novo atrasava a primeira busca em vários segundos
let marcasGuardadas = null;
const CHAVE_CACHE_MARCAS = "https://vaiprocarrinho.com.br/__cache/lomadee-marcas-v5"; // v2: com o link da marca; v3: marcas liberadas em 26/10/2026; v4: sem China in Box; v5: sem as que não são loja
export async function marcasAprovadas(env) {
  if (marcasGuardadas && marcasGuardadas.ate > Date.now()) return marcasGuardadas.mapa;
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const guardadas = cache && (await cache.match(CHAVE_CACHE_MARCAS).catch(() => null));
  if (guardadas) {
    const mapa = new Map(await guardadas.json());
    marcasGuardadas = { ate: Date.now() + VALIDADE_MARCAS, mapa };
    return mapa;
  }
  // 1ª página diz quantas são; as outras vêm todas ao mesmo tempo
  const primeira = await pedirLomadee(env, "/affiliate/brands?page=1&limit=20");
  const totalPaginas = Math.min(primeira?.pagination?.totalPages || 1, MAX_PAGINAS_MARCAS);
  const resto = await Promise.all(Array.from({ length: totalPaginas - 1 }, (_, i) =>
    pedirLomadee(env, `/affiliate/brands?page=${i + 2}&limit=20`)));
  const todas = [primeira, ...resto].flatMap((json) => json?.data || []);
  // Se a API não mandar os canais em nenhuma marca, não dá para saber: vale a lista toda
  const temCanais = todas.some((m) => Array.isArray(m.channels));
  const liberada = (m) => !temCanais || (m.channels || []).some((c) => (c.shortUrls || []).length && !c.message);
  // link = link com comissão da página inicial da marca, do canal liberado (botão "Ir para a loja", 26/10/2026)
  const linkDoCanal = (m) => (m.channels || []).find((c) => (c.shortUrls || []).length && !c.message)?.shortUrls[0] || "";
  const mapa = new Map(todas
    .filter((m) => m.id && liberada(m) && !FORA.some((f) => f.test(normalizar(m.name))))
    .map((m) => [m.id, { nome: m.name, site: m.site || "", link: linkDoCanal(m) }]));
  marcasGuardadas = { ate: Date.now() + VALIDADE_MARCAS, mapa };
  if (cache && mapa.size) {
    await cache.put(CHAVE_CACHE_MARCAS, new Response(JSON.stringify([...mapa]), {
      headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${VALIDADE_MARCAS / 1000}` },
    })).catch(() => {});
  }
  return mapa;
}

// Assinatura dos links "Comprar" (25/10/2026, teste de invasão): o /api/ir só gera link com comissão para endereços que
// este servidor tirou da própria Lomadee. Sem isso, qualquer um montava /api/ir?m=<marca>&u=<site falso> e usava o nosso
// domínio (e o encurtador da Lomadee, que tem limite de 60 por minuto) para mandar gente a outro site.
// A chave da assinatura é derivada do Secret LOMADEE_API_KEY (nunca sai do servidor)
let chaveAssinatura = null;
async function assinar(env, marca, url) {
  if (!chaveAssinatura || chaveAssinatura.de !== env.LOMADEE_API_KEY) {
    const chave = await crypto.subtle.importKey("raw", new TextEncoder().encode(`links-comprar:${env.LOMADEE_API_KEY}`),
      { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    chaveAssinatura = { de: env.LOMADEE_API_KEY, chave };
  }
  const assinado = await crypto.subtle.sign("HMAC", chaveAssinatura.chave, new TextEncoder().encode(`${marca}|${url}`));
  return [...new Uint8Array(assinado)].slice(0, 16).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Confere a assinatura de um link /api/ir (comparação sem parar no 1º caractere diferente)
export async function assinaturaValida(env, marca, url, s) {
  if (!env.LOMADEE_API_KEY || typeof s !== "string" || s.length !== 32) return false;
  const certa = await assinar(env, marca, url);
  let diferenca = 0;
  for (let i = 0; i < 32; i++) diferenca |= certa.charCodeAt(i) ^ s.charCodeAt(i);
  return diferenca === 0;
}

// Põe a assinatura nos links das ofertas (o converter() abaixo é síncrono; a assinatura não)
async function comLinksAssinados(env, ofertas) {
  await Promise.all(ofertas.map(async (o) => {
    const p = new URL(o.link, "https://x").searchParams;
    o.link += `&s=${await assinar(env, p.get("m"), p.get("u"))}`;
  }));
  return ofertas;
}

export function chaveLoja(nome) {
  const n = normalizar(nome);
  const conhecida = CHAVES.find(([trecho]) => n.includes(trecho));
  return conhecida ? conhecida[1] : `lomadee-${n.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

// Descrição em texto puro. Algumas marcas mandam o HTML da página já "escapado" (&lt;style&gt;…; PCYES, print do Giovanni,
// 26/10/2026): desfaz o escape antes e tira estilos e scripts inteiros
const ENTIDADES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const desfazerEscape = (s) => s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (tudo, e) => {
  if (e[0] === "#") {
    const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : " ";
  }
  return ENTIDADES[e.toLowerCase()] ?? tudo;
});
const semHtml = (s) => desfazerEscape(desfazerEscape(String(s || "")))
  .replace(/<(style|script)[^>]*>[\s\S]*?<\/\1>/gi, " ")
  .replace(/<[^>]*>/g, " ")
  .replace(/<[^>]*$/, " ") // a API corta a descrição no meio de uma tag
  .replace(/\s+/g, " ").trim();

// Algumas marcas põem o endereço da página do produto na lista de fotos (PCYES): o cartão ficava sem foto.
// Fica só o que pode ser foto: com extensão de imagem ou de outro endereço que não a página do produto
const EXTENSAO_FOTO = /\.(jpe?g|png|webp|gif|avif)(\?|#|$)/i;
function ehFoto(url, pagina) {
  if (!/^https?:\/\//.test(url || "")) return false;
  if (EXTENSAO_FOTO.test(url)) return true;
  try {
    const u = new URL(url);
    const pg = new URL(pagina);
    return !(u.hostname === pg.hostname && u.pathname === pg.pathname) && !(u.hostname === pg.hostname && !/\/(media|image|img|foto|produtos?)\b/i.test(u.pathname));
  } catch {
    return false;
  }
}

function converter(p, marca) {
  const opcoes = p.options || [];
  const opcao = opcoes.find((o) => o.available !== false && o.pricing?.[0]?.price > 0) || opcoes[0] || {};
  // A documentação fala em centavos, mas a API manda em reais (Air Fryer Philco = 598; conferido em 16/10/2026)
  const preco = Number(opcao.pricing?.[0]?.price) || 0;
  const antigo = Number(opcao.pricing?.[0]?.listPrice) || 0;
  const fotos = [...(p.images || []), ...(opcao.images || [])].map((i) => i?.url).filter((u) => ehFoto(u, p.url));
  const descricao = semHtml(p.description).slice(0, 600);
  return {
    id: `lomadee-${p.id}`,
    fonte: "lomadee",
    loja: chaveLoja(marca.nome),
    lojaNome: marca.nome,
    titulo: p.name,
    preco,
    precoAntigo: antigo > preco ? antigo : null,
    desconto: antigo > preco ? Math.round((1 - preco / antigo) * 100) : null,
    imagem: fotos[0] || null,
    imagens: fotos.length > 1 ? [...new Set(fotos)].slice(0, 5) : undefined,
    descricao: descricao || undefined,
    gtin: opcao.ean || undefined,
    // O link com comissão é gerado na hora do clique (o encurtador conta no limite de 60 por minuto)
    link: `/api/ir?m=${encodeURIComponent(p.organizationId)}&u=${encodeURIComponent(p.url)}`,
  };
}

// "Ver produtos" de uma marca na janela "Lojas parceiras" (pedido do Giovanni, 22/10/2026): produtos só dessa marca.
// A API filtra pela marca com organizationIds (com TODAS as marcas ela devolvia 0; com uma só, conferir no ar).
// Se o filtro não vier respeitado, ficam só os da marca entre os que vieram.
export async function produtosDaMarca(env, id, pagina = 1, porPagina = 48) {
  const marcas = await marcasAprovadas(env);
  const marca = marcas.get(id);
  if (!marca) return { nome: null, ofertas: [], temMais: false };
  const params = new URLSearchParams({ page: String(pagina), limit: String(porPagina), isAvailable: "true", organizationIds: id });
  const json = await pedirLomadee(env, `/affiliate/products?${params}`);
  const dados = json?.data || [];
  const ofertas = dados
    .filter((p) => p.organizationId === id && p.url?.startsWith("https://") && !linkQuebrado(p.url))
    .map((p) => converter(p, marca))
    .filter((o) => o.preco >= PRECO_MINIMO && o.titulo);
  return { nome: marca.nome, ofertas: await comLinksAssinados(env, ofertas), temMais: dados.length >= porPagina };
}

// Só contam como lojas parceiras (janela "Lojas parceiras" e "mais de N lojas") as marcas que mandam produtos: em 22/10/2026
// só 24 de 105 marcas liberadas tinham produtos na API (pedido do Giovanni: "o site precisa ser fidedigno"). O robô da
// madrugada confere todas (/api/conferir-lojas) e guarda quantos produtos cada uma tem; marca que passar a mandar produtos
// aparece sozinha no dia seguinte. Sem a tabela (antes da 1ª conferência ou banco fora do ar), vale a conferência de 22/10.
const TABELA_MARCAS = `CREATE TABLE IF NOT EXISTS marcas_lomadee (
  id TEXT PRIMARY KEY, nome TEXT NOT NULL, produtos INTEGER NOT NULL, conferido INTEGER NOT NULL)`;
const COM_PRODUTOS_EM_22_10 = new Set([
  "2e12febc-de9f-4d9f-924c-741f13e41cb7",
  "392fe765-2ba9-47b5-8b41-d2540d6c24b2",
  "24e709ab-e640-445b-864a-41223d9eab2e",
  "de93faa0-5a21-46b6-a1eb-ff6ef1c23779",
  "a7e37619-acd3-4617-9475-5ffaeaad404b",
  "d855f505-7e26-4961-a182-c2139aeadd2c",
  "7f241a92-3f89-4346-86ab-babace37ef8a",
  "e36f5bbb-3e5f-42e2-be4c-6c32dac101c2",
  "40167aca-ebfe-4ffd-bc01-e6778fb7aeed",
  "9b4047d8-7011-4264-8144-d43fd0fb1f77",
  "32f49cb0-40e1-42b7-8b18-d6fffc0e8233",
  "10e15c60-c43b-439c-9d53-373bb4388756",
  "c364d4e3-56e2-4da9-a6ea-195716da559a",
  "d4f00f2f-a064-4a3e-87a0-83c7589ee65d",
  "f31e32be-c116-4739-85a3-43f85681b237",
  "4395b3b8-8d26-4bd3-ab4f-554e39a40ac1",
  "ac21d19c-3590-4a86-a9df-16bf6151e570",
  "0f15db57-cb67-47d7-9a8b-666bdc62e7b6",
  "6d69265c-6b83-4ff4-916f-95a75057947d",
  "bbe8757f-7781-436c-a63d-aa86495a6a81",
  "99d04b75-a41a-4c87-a016-543c7e3634f3",
  "08240553-644a-4b31-b7e6-d07f3b895c3b",
  "07365f74-02b7-481f-bb71-98a4929240b6",
  "d9a040f8-bb54-40d2-804b-150f007305d0",
]);
const VALIDADE_COM_PRODUTOS = 30 * 60 * 1000;
// A Lomadee não informa o total de produtos de uma marca (o "count" da resposta é só o da página). A conferência pede
// 1 página de 100: com menos, é o número exato; com 100, "mais de 100" (pedir todas as páginas gastaria o limite de
// 60 consultas por minuto). Conferências antes de 24/10/2026 pediam só 10: esses números não aparecem no site
const CONTAGEM = 100;
const MAX_PAGINAS_POR_PARTE = 600;
const CONTA_TOTAL_DESDE = Date.UTC(2026, 9, 24, 12, 20);
let comProdutosGuardado = null;

// Marcas que também estão na Awin (04/11/2026, print do Giovanni): a Lauri Esporte vem pelas duas redes; pela Lomadee
// os produtos vinham com as fotos antigas (a loja trocou as fotos e ~80% davam "não encontrada") e cada tênis aparecia
// 2 vezes. A Awin tem o catálogo inteiro e o robô confere as fotos toda noite: fica só a Awin (cupons das duas continuam)
const chaveDoNome = (nome) => normalizar(nome).replace(/\s+br$/, "").replace(/[^a-z0-9]/g, "");
let naAwinGuardado = null;
async function marcasNaAwin(env) {
  if (naAwinGuardado && naAwinGuardado.ate > Date.now()) return naAwinGuardado.nomes;
  let nomes = new Set();
  try {
    const { results } = await env.DB.prepare("SELECT nome FROM lojas_awin WHERE produtos > 0").all();
    nomes = new Set(results.map((r) => chaveDoNome(r.nome)).filter(Boolean));
  } catch {
    // sem banco ou tabela ainda não existe: não tira nenhuma
  }
  naAwinGuardado = { ate: Date.now() + 60 * 60 * 1000, nomes };
  return nomes;
}

export async function marcasComProdutos(env) {
  const marcas = await marcasAprovadas(env);
  if (!comProdutosGuardado || comProdutosGuardado.ate < Date.now()) {
    let ids = null;
    let quantos = new Map();
    let quebradas = new Set();
    try {
      // Marca que a conferência ainda não conseguiu ver (a Lomadee falhou) vale pela lista de 22/10: antes ela sumia
      // do site (23/10/2026: 3 partes falharam e as lojas caíram de 33 para 22)
      const { results } = await env.DB.prepare("SELECT * FROM marcas_lomadee").all();
      quebradas = new Set(results.filter((r) => r.quebrado).map((r) => r.id));
      if (results.length) {
        quantos = new Map(results.filter((r) => r.conferido >= CONTA_TOTAL_DESDE && r.produtos > 0)
          .map((r) => [r.id, { produtos: r.produtos, produtosMais: Boolean(r.mais) || undefined }]));
        const vistas = new Set(results.map((r) => r.id));
        ids = new Set([...results.filter((r) => r.produtos > 0 && !r.quebrado).map((r) => r.id),
          ...[...COM_PRODUTOS_EM_22_10].filter((id) => !vistas.has(id))]);
      }
    } catch {
      // tabela ainda não existe ou banco fora do ar
    }
    comProdutosGuardado = { ate: Date.now() + VALIDADE_COM_PRODUTOS, ids: ids || COM_PRODUTOS_EM_22_10, quantos, quebradas };
  }
  // produtos = quantos a marca tem (janela "Lojas parceiras"), se a conferência já contou
  const naAwin = await marcasNaAwin(env);
  return new Map([...marcas].filter(([id, m]) => comProdutosGuardado.ids.has(id) && !naAwin.has(chaveDoNome(m.nome)))
    .map(([id, m]) => [id, { ...m, ...comProdutosGuardado.quantos.get(id) }]));
}

// Marcas cujos produtos dão "página não encontrada" no site delas (ficam fora da busca)
async function marcasQuebradas(env) {
  if (!comProdutosGuardado || comProdutosGuardado.ate < Date.now()) await marcasComProdutos(env).catch(() => {});
  return comProdutosGuardado?.quebradas || new Set();
}

// Confere uma parte das marcas (20 por vez: a Lomadee aceita 60 consultas por minuto) e guarda quantos produtos cada uma mandou
export async function conferirMarcas(env, parte, porParte = 20) {
  const todas = [...(await marcasAprovadas(env))].sort(([a], [b]) => a.localeCompare(b));
  const fatia = todas.slice(parte * porParte, (parte + 1) * porParte);
  const fim = (parte + 1) * porParte >= todas.length;
  if (!fatia.length) return { parte, conferidas: 0, comProdutos: 0, fim: true };
  const contagens = [];
  // Páginas de produto testadas nesta chamada (cada uma é uma visita ao site da marca; o resto fica para a próxima noite)
  let paginasParaTestar = MAX_PAGINAS_POR_PARTE;
  let paginasTestadas = 0;
  const paginasQuebradas = [];
  for (const [id, marca] of fatia) {
    try {
      // Conta só os produtos que funcionam (sem link quebrado nem preço de R$ 1)
      const lidos = await produtosDaMarca(env, id, 1, CONTAGEM);
      // Abre alguns produtos direto no site da marca (o endereço que está dentro do link /api/ir, sem passar pela Lomadee)
      const enderecos = lidos.ofertas.map(paginaDoProduto).filter(Boolean);
      const links = enderecos.length ? await lojaComLinksQuebrados(sortear(enderecos, LINKS_TESTADOS), { ms: 6000 }) : null;
      // Marca boa: testa a página de cada produto e esconde os que dão "página não encontrada" (29/10/2026, Little Duck)
      let ofertas = lidos.ofertas;
      if (!links?.quebrada && env.DB && paginasParaTestar > 0) {
        const r = await semPaginasQuebradas(env.DB, ofertas, paginasParaTestar);
        paginasParaTestar -= r.testadas;
        paginasTestadas += r.testadas;
        if (r.quebradas) paginasQuebradas.push(`${marca.nome}: ${r.quebradas}`);
        ofertas = r.ofertas;
      }
      contagens.push([id, marca.nome, ofertas.length, lidos.temMais ? 1 : 0, links?.quebrada ? 1 : 0]);
    } catch {
      // Lomadee falhou para esta marca: fica como estava
    }
  }
  if (contagens.length) {
    const agora = Date.now();
    await env.DB.prepare(TABELA_MARCAS).run();
    // Coluna "mais" (24/10/2026): 1 = a marca tem mais produtos que os contados
    await env.DB.prepare("ALTER TABLE marcas_lomadee ADD COLUMN mais INTEGER NOT NULL DEFAULT 0").run().catch(() => {});
    // Coluna "quebrado" (25/10/2026): 1 = os produtos dão "página não encontrada" no site da marca
    await env.DB.prepare("ALTER TABLE marcas_lomadee ADD COLUMN quebrado INTEGER NOT NULL DEFAULT 0").run().catch(() => {});
    await env.DB.batch(contagens.map(([id, nome, n, mais, quebrado]) => env.DB.prepare(
      "INSERT OR REPLACE INTO marcas_lomadee (id, nome, produtos, mais, conferido, quebrado) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(id, nome, n, mais, agora, quebrado)));
  }
  comProdutosGuardado = null;
  return {
    parte, conferidas: contagens.length, comProdutos: contagens.filter(([, , n, , q]) => n > 0 && !q).map(([, nome]) => nome),
    linksQuebrados: contagens.filter(([, , , , q]) => q).map(([, nome]) => nome),
    paginasTestadas, paginasQuebradas, fim,
  };
}

export const lomadee = {
  nome: "lomadee",
  ativa: (env) => Boolean(env.LOMADEE_API_KEY),
  porPagina: 48,
  // A busca pede 6 páginas por vez às lojas; na Lomadee isso vira 1 consulta só (o limite dela é de 60 consultas
  // por minuto). Páginas 1–6 = consulta 1, 7–12 = consulta 2… Com 100 produtos por consulta ela levava mais de 8 s;
  // com 48, uns 2 s. Duas consultas ao mesmo tempo passavam dos 8 s (23/10/2026)
  porConsulta: 48,

  async buscar(q, env, pagina = 1, opcoes) {
    const soMarca = opcoes?.soLoja || null; // busca dentro de uma marca (página da loja aberta)
    if ((pagina - 1) % PAGINAS_POR_CONSULTA) return [];
    const consulta = (pagina - 1) / PAGINAS_POR_CONSULTA + 1;
    if (consulta > MAX_PAGINAS) return [];
    const [marcas, quebradas, naAwin] = await Promise.all([marcasAprovadas(env), marcasQuebradas(env), marcasNaAwin(env)]);
    if (!marcas.size) return [];
    const params = new URLSearchParams({
      search: q,
      page: String(consulta),
      limit: String(this.porConsulta),
      isAvailable: "true",
    });
    if (soMarca) params.set("organizationIds", soMarca);
    // Sem organizationIds: com a lista de todas as marcas liberadas a Lomadee devolvia 0 produtos.
    // As marcas não liberadas ficam de fora logo abaixo
    const json = await pedirLomadee(env, `/affiliate/products?${params}`);
    const temTodas = temTodasAsPalavras(q);
    return comLinksAssinados(env, (json?.data || [])
      .filter((p) => marcas.has(p.organizationId) && !quebradas.has(p.organizationId) && (!soMarca || p.organizationId === soMarca)
        && !naAwin.has(chaveDoNome(marcas.get(p.organizationId).nome))
        && p.url?.startsWith("https://") && !linkQuebrado(p.url))
      .map((p) => converter(p, marcas.get(p.organizationId)))
      // A busca da Lomadee aceita qualquer uma das palavras: fica só o que tem todas
      .filter((o) => o.preco >= PRECO_MINIMO && o.titulo && temTodas(o.titulo)));
  },

  // "Ofertas do dia": por enquanto só Shopee, AliExpress e Awin (a Lomadee não tem lista de mais vendidos)
  async destaques() {
    return [];
  },
};
