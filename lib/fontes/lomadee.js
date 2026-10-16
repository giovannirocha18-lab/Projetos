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
const VALIDADE_MARCAS = 6 * 60 * 60 * 1000;
const MAX_PAGINAS_MARCAS = 15; // 20 marcas por página
// Lojas que já buscamos direto pela API delas (comissão melhor e sem repetir produto)
const FORA = ["shopee", "aliexpress"];
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

export const lomadee = {
  nome: "lomadee",
  ativa: (env) => Boolean(env.LOMADEE_API_KEY),
  porPagina: 48,
  // A busca pede 3 páginas por vez às lojas; na Lomadee isso vira 1 consulta só, de 100 produtos (o limite dela
  // é de 60 consultas por minuto). Páginas 1–3 = consulta 1, 4–6 = consulta 2…
  porConsulta: 100,

  async buscar(q, env, pagina = 1) {
    if ((pagina - 1) % 3) return [];
    const consulta = (pagina - 1) / 3 + 1;
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
      .filter((p) => marcas.has(p.organizationId) && p.url?.startsWith("https://"))
      .map((p) => converter(p, marcas.get(p.organizationId)))
      // A busca da Lomadee aceita qualquer uma das palavras: fica só o que tem todas
      .filter((o) => o.preco > 0 && o.titulo && temTodas(o.titulo));
  },

  // "Ofertas do dia": por enquanto só Shopee, AliExpress e Awin (a Lomadee não tem lista de mais vendidos)
  async destaques() {
    return [];
  },
};
