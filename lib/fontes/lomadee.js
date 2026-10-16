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

export async function pedirLomadee(env, caminho, { metodo = "GET", corpo } = {}) {
  const resp = await fetch(`${BASE}${caminho}`, {
    method: metodo,
    headers: { "x-api-key": env.LOMADEE_API_KEY, ...(corpo && { "Content-Type": "application/json" }) },
    ...(corpo && { body: JSON.stringify(corpo) }),
  });
  const json = await resp.json().catch(() => null);
  if (!resp.ok) throw new Error(`Lomadee ${resp.status}: ${json?.message || json?.code || "erro"}`);
  return json;
}

// Marcas em que o afiliado foi aprovado: a Lomadee manda, para cada canal, os links da marca
// (ou uma mensagem dizendo por que o canal não pode divulgar). Guardadas por 6 horas.
let marcasGuardadas = null;
export async function marcasAprovadas(env) {
  if (marcasGuardadas && marcasGuardadas.ate > Date.now()) return marcasGuardadas.mapa;
  const todas = [];
  for (let pagina = 1; pagina <= MAX_PAGINAS_MARCAS; pagina++) {
    const json = await pedirLomadee(env, `/affiliate/brands?page=${pagina}&limit=20`);
    todas.push(...(json?.data || []));
    if (pagina >= (json?.pagination?.totalPages || 1)) break;
  }
  // Se a API não mandar os canais em nenhuma marca, não dá para saber: vale a lista toda
  const temCanais = todas.some((m) => Array.isArray(m.channels));
  const liberada = (m) => !temCanais || (m.channels || []).some((c) => (c.shortUrls || []).length && !c.message);
  const mapa = new Map(todas
    .filter((m) => m.id && liberada(m) && !FORA.some((f) => normalizar(m.name).includes(f)))
    .map((m) => [m.id, { nome: m.name, site: m.site || "" }]));
  marcasGuardadas = { ate: Date.now() + VALIDADE_MARCAS, mapa };
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

  async buscar(q, env, pagina = 1) {
    if (pagina > MAX_PAGINAS) return [];
    const marcas = await marcasAprovadas(env);
    if (!marcas.size) return [];
    const params = new URLSearchParams({
      search: q,
      page: String(pagina),
      limit: String(this.porPagina),
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
