// =====================================================================
// TABELA DE OFERTAS — produtos que o robô de preços (pasta robo/) baixa
// das redes de afiliados e guarda no banco D1. O site só lê daqui.
//
// ofertas      -> um produto por linha, com o preço de hoje
// ofertas_fts  -> índice de busca por palavras (atualizado sozinho pelos gatilhos)
// precos       -> histórico: o preço de cada produto em cada dia que ele mudou
// =====================================================================

export const TABELAS_OFERTAS = [
  `CREATE TABLE IF NOT EXISTS ofertas (
     num INTEGER PRIMARY KEY,
     id TEXT NOT NULL UNIQUE,
     fonte TEXT NOT NULL,
     loja TEXT NOT NULL,
     loja_nome TEXT NOT NULL,
     titulo TEXT NOT NULL,
     preco REAL NOT NULL,
     preco_antigo REAL,
     desconto INTEGER,
     imagem TEXT,
     categoria TEXT,
     link TEXT NOT NULL,
     frete_gratis INTEGER NOT NULL DEFAULT 0,
     internacional INTEGER NOT NULL DEFAULT 0,
     moeda TEXT,
     gtin TEXT,
     descricao TEXT,
     imagens TEXT,
     busca TEXT NOT NULL,
     assinatura TEXT NOT NULL,
     atualizado_em INTEGER NOT NULL)`,
  "CREATE INDEX IF NOT EXISTS ofertas_fonte_desconto ON ofertas (fonte, desconto)",
  `CREATE VIRTUAL TABLE IF NOT EXISTS ofertas_fts USING fts5(
     busca, content='ofertas', content_rowid='num', tokenize='unicode61 remove_diacritics 2')`,
  `CREATE TRIGGER IF NOT EXISTS ofertas_ai AFTER INSERT ON ofertas BEGIN
     INSERT INTO ofertas_fts (rowid, busca) VALUES (new.num, new.busca);
   END`,
  `CREATE TRIGGER IF NOT EXISTS ofertas_ad AFTER DELETE ON ofertas BEGIN
     INSERT INTO ofertas_fts (ofertas_fts, rowid, busca) VALUES ('delete', old.num, old.busca);
   END`,
  `CREATE TRIGGER IF NOT EXISTS ofertas_au AFTER UPDATE OF busca ON ofertas BEGIN
     INSERT INTO ofertas_fts (ofertas_fts, rowid, busca) VALUES ('delete', old.num, old.busca);
     INSERT INTO ofertas_fts (rowid, busca) VALUES (new.num, new.busca);
   END`,
  // Resumo das lojas da Awin (refeito pelo robô a cada execução): /api/numeros e /api/lojas leem ~10 linhas em vez de
  // contar as 60+ mil ofertas a cada vez (o D1 grátis permite 5 milhões de linhas lidas por dia; estourou em 22/10/2026)
  `CREATE TABLE IF NOT EXISTS lojas_awin (
     loja TEXT PRIMARY KEY, nome TEXT NOT NULL, produtos INTEGER NOT NULL, internacional INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS precos (
     oferta_id TEXT NOT NULL,
     dia TEXT NOT NULL,
     preco REAL NOT NULL,
     PRIMARY KEY (oferta_id, dia)) WITHOUT ROWID`,
];

// Colunas criadas depois da primeira versão (o robô aplica; dá erro se já existem, e tudo bem)
export const MIGRACOES_OFERTAS = [
  "ALTER TABLE ofertas ADD COLUMN internacional INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE ofertas ADD COLUMN moeda TEXT",
  "ALTER TABLE ofertas ADD COLUMN gtin TEXT",
  "ALTER TABLE ofertas ADD COLUMN descricao TEXT",
  "ALTER TABLE ofertas ADD COLUMN imagens TEXT",
  // Nenhuma consulta procura pelo código de barras desde que o agrupamento saiu (16/10/2026): o índice só gastava
  // 1 gravação por produto. No lugar dele entra INDICE_LOJA (mesmo gasto por produto)
  "DROP INDEX IF EXISTS ofertas_gtin",
];

// Página de cada loja (/api/lojas?id=awin:…): sem ele, uma loja pequena lia as ofertas de todas as lojas (~48 mil linhas).
// O robô cria; montar o índice grava 1 linha por oferta de uma vez, então nesse dia ele grava menos produtos
export const INDICE_LOJA = "ofertas_loja_desconto";
export const CRIAR_INDICE_LOJA = `CREATE INDEX IF NOT EXISTS ${INDICE_LOJA} ON ofertas (loja, desconto)`;

export const COLUNAS_OFERTA =
  "id, loja, loja_nome, titulo, preco, preco_antigo, desconto, imagem, categoria, link, frete_gratis, internacional, moeda, gtin, descricao, imagens";

// "12.000 BTUs" e "12000 btus" precisam achar o mesmo produto
export const juntarMilhares = (s) => String(s || "").replace(/(\d)\.(?=\d{3}\b)/g, "$1");

// Linha do banco -> formato de oferta que o site entende
// Nome que o visitante conhece, quando a Awin usa o nome da empresa (chave = nome da Awin em minúsculas)
const NOMES_LOJAS = {
  "shining 3d technology inc": "EINSTAR",
};

export const RESUMO_LOJAS_AWIN = [
  "DELETE FROM lojas_awin",
  `INSERT INTO lojas_awin (loja, nome, produtos, internacional)
   SELECT loja, MAX(loja_nome), COUNT(*), MAX(internacional) FROM ofertas WHERE fonte = 'awin' GROUP BY loja`,
];

// Loja com poucos produtos (ex.: Ferramentas Kennedy com 1) fica fora da janela "Lojas parceiras" e da contagem
// "mais de N lojas", para não parecer loja vazia; os produtos dela continuam nas buscas (pedido do Giovanni, 24/10/2026).
// Sem contagem (a conferência ainda não contou), a loja fica
export const MIN_PRODUTOS_LOJA = 5;
export const lojaPequena = (produtos, mais) => !mais && produtos != null && produtos < MIN_PRODUTOS_LOJA;

// Lojas da Awin no banco: da tabela-resumo; sem ela (antes da 1ª execução do robô), contando as ofertas
export async function lojasDaAwin(db) {
  try {
    const { results } = await db.prepare("SELECT loja, nome, produtos AS n, internacional FROM lojas_awin").all();
    if (results.length) return results;
  } catch {
    // tabela ainda não existe
  }
  const { results } = await db.prepare(`SELECT loja, MAX(loja_nome) AS nome, COUNT(*) AS n, MAX(internacional) AS internacional
    FROM ofertas WHERE fonte = 'awin' GROUP BY loja`).all();
  return results;
}

export const nomeDaLojaAwin = (nome) => NOMES_LOJAS[String(nome || "").toLowerCase()] || nome;

export function linhaParaOferta(l) {
  return {
    id: l.id,
    loja: l.loja,
    lojaNome: nomeDaLojaAwin(l.loja_nome),
    titulo: l.titulo,
    preco: l.preco,
    precoAntigo: l.preco_antigo,
    desconto: l.desconto,
    imagem: l.imagem,
    emoji: null,
    categoria: l.categoria,
    // A categoria da loja ensina o mapa de categorias (lib/mapaCategorias.js), como a da Shopee e a da AliExpress
    catsLoja: l.categoria ? [String(l.categoria).slice(0, 120)] : undefined,
    avaliacao: null,
    vendidos: null,
    freteGratis: Boolean(l.frete_gratis),
    link: l.link,
    // Loja de fora do Brasil; moeda = em que moeda a loja cobra (o preço já vem convertido para reais)
    internacional: Boolean(l.internacional),
    moeda: l.moeda || null,
    // Código de barras: junta o mesmo produto vendido em lojas diferentes
    gtin: l.gtin || null,
    // Para a janela "Ver detalhes"
    descricao: l.descricao || null,
    imagens: lerLista(l.imagens),
  };
}

function lerLista(json) {
  try {
    return json ? JSON.parse(json) : [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------
// Histórico de preço. A tabela precos só guarda os dias em que o preço
// mudou, então o preço de um dia é o do último registro até ele.
// ---------------------------------------------------------------------
const DIA = 864e5;
const hojeSP = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const diasEntre = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / DIA);

// registros: [{ dia: "2026-10-15", preco }], em ordem de data
export function resumirHistorico(registros, precoAtual, hoje = hojeSP()) {
  if (!registros.length) return null;
  const inicio = new Date(Date.parse(hoje) - 30 * DIA).toISOString().slice(0, 10);
  // Preços em vigor nos últimos 30 dias: os que mudaram no período + o que valia quando ele começou
  const antes = registros.filter((r) => r.dia <= inicio).at(-1);
  const noPeriodo = [antes, ...registros.filter((r) => r.dia > inicio)].filter(Boolean).map((r) => r.preco);
  const menor30 = Math.min(...noPeriodo, precoAtual);
  const maior30 = Math.max(...noPeriodo, precoAtual);
  const anterior = registros.length > 1 ? registros.at(-2) : null;
  const ultima = registros.at(-1);
  const habitual = precoHabitual(registros, inicio, hoje);
  return {
    desde: registros[0].dia,
    // Só afirma "menor em 30 dias" com 30 dias de acompanhamento e se o preço variou nesse tempo
    menorEm30Dias: diasEntre(registros[0].dia, hoje) >= 30 && maior30 > precoAtual && precoAtual <= menor30,
    // Baixou na última mudança, nos últimos 7 dias
    // (comparado com o preço habitual, se o anterior foi uma subida: 100 -> 150 -> 90 é "baixou 10%", não 40%)
    caiu: caiuDeVerdade(registros, precoAtual, anterior, ultima, habitual, hoje),
    // Desconto de verdade: % abaixo do preço que valeu mais dias nos últimos 30 (com 21+ dias de acompanhamento).
    // Subir o preço uns dias antes da Black Friday não engana: o "habitual" é o que durou mais tempo.
    descontoReal: diasEntre(registros[0].dia, hoje) >= DIAS_PARA_VERIFICAR && habitual && precoAtual <= habitual * 0.95
      ? Math.round((1 - precoAtual / habitual) * 100) : null,
    // Já dá para conferir o desconto pelo histórico (21+ dias): sem descontoReal, o "de/por" da loja não se confirma
    verificavel: diasEntre(registros[0].dia, hoje) >= DIAS_PARA_VERIFICAR,
    habitual,
    // Para o "Vale a pena comprar agora?" do site: há quantos dias o preço é acompanhado, menor e maior em 30 dias
    dias: diasEntre(registros[0].dia, hoje),
    menor30,
    maior30,
  };
}

// "Ofertas do dia" com informação real (pedido do Giovanni, 23/10/2026: "se é oferta, trazer a informação real"):
// produto acompanhado há 21+ dias só entra com desconto confirmado pelo histórico; os outros, com o desconto da loja
// entre 5% e 75% (acima disso é quase sempre preço "de" inflado: 16 de 16 da Posthaus vinham com 76–90%)
// Desconto que o histórico desmente (preço acompanhado há 21+ dias e não está abaixo do habitual): o "de/por" da loja
// some do cartão (selo -X%, preço riscado, "Você economiza"). Fica guardado em descontoDaLoja só para conferência
// Com desconto confirmado, vale o nosso: preço "de" = preço habitual (a loja dizia -40%, o real era -20%)
export function semDescontoFalso(o) {
  const h = o.historico;
  if (!o.desconto || !h?.verificavel) return o;
  if (!h.descontoReal) return { ...o, desconto: null, precoAntigo: null, descontoDaLoja: o.desconto };
  if (h.descontoReal === o.desconto) return o;
  return { ...o, desconto: h.descontoReal, precoAntigo: h.habitual, descontoDaLoja: o.desconto };
}

export const DESCONTO_MINIMO_OFERTA = 5;
export const DESCONTO_SUSPEITO = 75;
export function ehOfertaDeVerdade(o) {
  if (o.historico?.verificavel) return Boolean(o.historico.descontoReal);
  return o.desconto >= DESCONTO_MINIMO_OFERTA && o.desconto <= DESCONTO_SUSPEITO;
}

const DIAS_PARA_VERIFICAR = 21;

// "Baixou X%" só quando dá para acreditar (24/10/2026: a página da Black Friday mostrava "Smart TV 32 baixou 64%" porque
// o vendedor deixou R$ 2.500 por uma semana, e lençol "baixou 69%" porque o preço vai e volta entre 36 e 119):
// 7+ dias de acompanhamento, o preço de hoje é o menor já visto (não é só a volta de um preço que já existia) e a queda
// é de no máximo 50% (mais que isso, no nosso histórico curto, é preço "de" inflado)
const QUEDA_MAXIMA = 50;
function caiuDeVerdade(registros, precoAtual, anterior, ultima, habitual, hoje) {
  if (!anterior || diasEntre(ultima.dia, hoje) > 7 || diasEntre(registros[0].dia, hoje) < 7) return null;
  const antes = ultima.preco === precoAtual ? registros.slice(0, -1) : registros;
  if (!antes.length || antes.some((r) => r.preco <= precoAtual)) return null;
  const base = Math.min(anterior.preco, habitual || Infinity);
  if (!(base > precoAtual)) return null;
  const queda = Math.round((1 - precoAtual / base) * 100);
  return queda <= QUEDA_MAXIMA ? queda : null;
}

// Preço que ficou mais dias em vigor entre inicio e hoje (os registros só marcam os dias em que o preço mudou)
function precoHabitual(registros, inicio, hoje) {
  const dias = new Map();
  registros.forEach((r, i) => {
    const de = r.dia > inicio ? r.dia : inicio;
    const ate = registros[i + 1]?.dia || hoje;
    if (ate <= inicio) return;
    dias.set(r.preco, (dias.get(r.preco) || 0) + Math.max(diasEntre(de, ate), 0));
  });
  let melhor = null;
  for (const [preco, n] of dias) if (melhor === null || n > dias.get(melhor)) melhor = preco;
  return melhor;
}

// Registros de preço de várias ofertas (de 90 em 90: o D1 aceita no máximo 100 valores por consulta)
async function lerRegistros(db, ids) {
  const porOferta = new Map();
  for (let i = 0; i < ids.length; i += 90) {
    const parte = ids.slice(i, i + 90);
    const { results } = await db.prepare(
      `SELECT oferta_id, dia, preco FROM precos WHERE oferta_id IN (${parte.map(() => "?").join(", ")})
       ORDER BY oferta_id, dia`,
    ).bind(...parte).all();
    for (const r of results) {
      if (!porOferta.has(r.oferta_id)) porOferta.set(r.oferta_id, []);
      porOferta.get(r.oferta_id).push(r);
    }
  }
  return porOferta;
}

// Junta o resumo do histórico às ofertas
export async function comHistorico(db, ofertas) {
  if (!ofertas.length) return ofertas;
  const porOferta = await lerRegistros(db, ofertas.map((o) => o.id));
  return ofertas.map((o) => semDescontoFalso({ ...o, historico: resumirHistorico(porOferta.get(o.id) || [], o.preco) }));
}

// Lojas consultadas ao vivo (Shopee, AliExpress): não passam pelo robô, então o preço é guardado quando aparece no site
// (e na coleta diária, /api/coletar-precos). Devolve as ofertas com o histórico e a função que grava
// o preço de hoje das que são novas ou mudaram de preço.
// gravarAte = grava só os N primeiros produtos (sem acessórios): numa busca do site, para não gastar
// centenas de gravações por busca nova (o limite grátis do D1 é 100 mil por dia)
export const AO_VIVO = new Set(["shopee", "aliexpress", "lomadee"]);
// Lomadee tem várias lojas: a loja do cartão é a marca, a fonte é "lomadee"
export const ehAoVivo = (o) => AO_VIVO.has(o.fonte || o.loja);
export async function historicoAoVivo(db, ofertas, { gravarAte = Infinity } = {}) {
  const unicas = [...new Map(ofertas.filter(ehAoVivo).map((o) => [o.id, o])).values()];
  const porOferta = await lerRegistros(db, unicas.map((o) => o.id));
  const hoje = hojeSP();
  const candidatas = gravarAte === Infinity ? unicas : unicas.filter((o) => !o.acessorio).slice(0, gravarAte);
  const mudaram = candidatas.filter((o) => o.preco > 0 && porOferta.get(o.id)?.at(-1)?.preco !== o.preco);
  const historico = (o) => {
    const registros = porOferta.get(o.id) || [];
    // Só vira histórico (botão "📈 Histórico" no site) com uma mudança de preço ou 7+ dias de acompanhamento
    const temDados = registros.length > 1 || (registros.length === 1 && diasEntre(registros[0].dia, hoje) >= 7);
    return temDados ? resumirHistorico(registros, o.preco, hoje) : null;
  };
  return {
    ofertas: ofertas.map((o) => (ehAoVivo(o) ? semDescontoFalso({ ...o, historico: historico(o) }) : o)),
    // Uma consulta só, com a lista em JSON (o D1 aceita no máximo 100 valores por consulta)
    gravar: async () => {
      if (!mudaram.length) return 0;
      await db.prepare(
        `INSERT OR REPLACE INTO precos (oferta_id, dia, preco)
         SELECT json_extract(value, '$[0]'), ?, json_extract(value, '$[1]') FROM json_each(?)`,
      ).bind(hoje, JSON.stringify(mudaram.map((o) => [o.id, o.preco]))).run();
      return mudaram.length;
    },
  };
}
