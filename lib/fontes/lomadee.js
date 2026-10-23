// =====================================================================
// FONTE LOMADEE — Affiliate API (https://docs.lomadee.com.br/api-reference/introduction)
// Só é usada quando LOMADEE_API_KEY estiver cadastrada no Cloudflare (Settings > Variables and Secrets).
// A chave precisa dos escopos products:read, brands:read e shortener:write.
// Várias lojas numa rede só: cada produto vem com a marca (organizationId) e o nome dela aparece no cartão.
// Limite da Lomadee: 60 consultas por minuto por chave (por isso as marcas ficam guardadas por 6 horas
// e o link com comissão só é gerado quando alguém clica: ver functions/api/ir.js).
// =====================================================================

import { temTodasAsPalavras } from "../relevancia.js";

const BASE = "https://api.lomadee.com.br";
const MAX_PAGINAS = 3;
const PAGINAS_POR_CONSULTA = 6; // = PAGINAS_POR_LOTE da busca (functions/api/buscar.js)
const VALIDADE_MARCAS = 6 * 60 * 60 * 1000;
const MAX_PAGINAS_MARCAS = 15; // 20 marcas por página
// Lojas que já buscamos direto pela API delas (comissão melhor e sem repetir produto)
const FORA = ["shopee", "aliexpress"];
// Algumas marcas mandam R$ 1 no lugar do preço (PCYES, 17/10/2026): essas ofertas ficam de fora
const PRECO_MINIMO = 2;
// Sites com links quebrados no catálogo da Lomadee: os produtos ficam de fora até a loja corrigir.
// vestis.com.br (UP Kids, 17/10/2026, print do Giovanni): manda para upkids.com.br com o mesmo endereço, que dá 404
// (12 de 12 produtos testados). Para conferir de novo: abrir um link "vestis.com.br/…/p" e ver se o produto abre
const SITES_QUEBRADOS = ["vestis.com.br"];
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
const CHAVE_CACHE_MARCAS = "https://vaiprocarrinho.com.br/__cache/lomadee-marcas-v1";
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
  const mapa = new Map(todas
    .filter((m) => m.id && liberada(m) && !FORA.some((f) => normalizar(m.name).includes(f)))
    .map((m) => [m.id, { nome: m.name, site: m.site || "" }]));
  marcasGuardadas = { ate: Date.now() + VALIDADE_MARCAS, mapa };
  if (cache && mapa.size) {
    await cache.put(CHAVE_CACHE_MARCAS, new Response(JSON.stringify([...mapa]), {
      headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${VALIDADE_MARCAS / 1000}` },
    })).catch(() => {});
  }
  return mapa;
}

function chaveLoja(nome) {
  const n = normalizar(nome);
  const conhecida = CHAVES.find(([trecho]) => n.includes(trecho));
  return conhecida ? conhecida[1] : `lomadee-${n.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

const semHtml = (s) => String(s || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

function converter(p, marca) {
  const opcoes = p.options || [];
  const opcao = opcoes.find((o) => o.available !== false && o.pricing?.[0]?.price > 0) || opcoes[0] || {};
  // A documentação fala em centavos, mas a API manda em reais (Air Fryer Philco = 598; conferido em 16/10/2026)
  const preco = Number(opcao.pricing?.[0]?.price) || 0;
  const antigo = Number(opcao.pricing?.[0]?.listPrice) || 0;
  const fotos = [...(p.images || []), ...(opcao.images || [])].map((i) => i?.url).filter(Boolean);
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
  return { nome: marca.nome, ofertas, temMais: dados.length >= porPagina };
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
let comProdutosGuardado = null;

export async function marcasComProdutos(env) {
  const marcas = await marcasAprovadas(env);
  if (!comProdutosGuardado || comProdutosGuardado.ate < Date.now()) {
    let ids = null;
    try {
      // Marca que a conferência ainda não conseguiu ver (a Lomadee falhou) vale pela lista de 22/10: antes ela sumia
      // do site (23/10/2026: 3 partes falharam e as lojas caíram de 33 para 22)
      const { results } = await env.DB.prepare("SELECT id, produtos FROM marcas_lomadee").all();
      if (results.length) {
        const vistas = new Set(results.map((r) => r.id));
        ids = new Set([...results.filter((r) => r.produtos > 0).map((r) => r.id),
          ...[...COM_PRODUTOS_EM_22_10].filter((id) => !vistas.has(id))]);
      }
    } catch {
      // tabela ainda não existe ou banco fora do ar
    }
    comProdutosGuardado = { ate: Date.now() + VALIDADE_COM_PRODUTOS, ids: ids || COM_PRODUTOS_EM_22_10 };
  }
  return new Map([...marcas].filter(([id]) => comProdutosGuardado.ids.has(id)));
}

// Confere uma parte das marcas (20 por vez: a Lomadee aceita 60 consultas por minuto) e guarda quantos produtos cada uma mandou
export async function conferirMarcas(env, parte, porParte = 20) {
  const todas = [...(await marcasAprovadas(env))].sort(([a], [b]) => a.localeCompare(b));
  const fatia = todas.slice(parte * porParte, (parte + 1) * porParte);
  const fim = (parte + 1) * porParte >= todas.length;
  if (!fatia.length) return { parte, conferidas: 0, comProdutos: 0, fim: true };
  const contagens = [];
  for (const [id, marca] of fatia) {
    try {
      const { ofertas } = await produtosDaMarca(env, id, 1, 10);
      contagens.push([id, marca.nome, ofertas.length]);
    } catch {
      // Lomadee falhou para esta marca: fica como estava
    }
  }
  if (contagens.length) {
    const agora = Date.now();
    await env.DB.batch([env.DB.prepare(TABELA_MARCAS), ...contagens.map(([id, nome, n]) => env.DB.prepare(
      "INSERT OR REPLACE INTO marcas_lomadee (id, nome, produtos, conferido) VALUES (?, ?, ?, ?)").bind(id, nome, n, agora))]);
  }
  comProdutosGuardado = null;
  return { parte, conferidas: contagens.length, comProdutos: contagens.filter(([, , n]) => n > 0).map(([, nome]) => nome), fim };
}

export const lomadee = {
  nome: "lomadee",
  ativa: (env) => Boolean(env.LOMADEE_API_KEY),
  porPagina: 48,
  // A busca pede 6 páginas por vez às lojas; na Lomadee isso vira 1 consulta só (o limite dela é de 60 consultas
  // por minuto). Páginas 1–6 = consulta 1, 7–12 = consulta 2… Com 100 produtos por consulta ela levava mais de 8 s;
  // com 48, uns 2 s. Duas consultas ao mesmo tempo passavam dos 8 s (23/10/2026)
  porConsulta: 48,

  async buscar(q, env, pagina = 1) {
    if ((pagina - 1) % PAGINAS_POR_CONSULTA) return [];
    const consulta = (pagina - 1) / PAGINAS_POR_CONSULTA + 1;
    if (consulta > MAX_PAGINAS) return [];
    const marcas = await marcasAprovadas(env);
    if (!marcas.size) return [];
    const params = new URLSearchParams({
      search: q,
      page: String(consulta),
      limit: String(this.porConsulta),
      isAvailable: "true",
    });
    // Sem organizationIds: com a lista de todas as marcas liberadas a Lomadee devolvia 0 produtos.
    // As marcas não liberadas ficam de fora logo abaixo
    const json = await pedirLomadee(env, `/affiliate/products?${params}`);
    const temTodas = temTodasAsPalavras(q);
    return (json?.data || [])
      .filter((p) => marcas.has(p.organizationId) && p.url?.startsWith("https://") && !linkQuebrado(p.url))
      .map((p) => converter(p, marcas.get(p.organizationId)))
      // A busca da Lomadee aceita qualquer uma das palavras: fica só o que tem todas
      .filter((o) => o.preco >= PRECO_MINIMO && o.titulo && temTodas(o.titulo));
  },

  // "Ofertas do dia": por enquanto só Shopee, AliExpress e Awin (a Lomadee não tem lista de mais vendidos)
  async destaques() {
    return [];
  },
};
