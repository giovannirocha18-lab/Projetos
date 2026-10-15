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
  "CREATE INDEX IF NOT EXISTS ofertas_gtin ON ofertas (gtin)",
];

export const COLUNAS_OFERTA =
  "id, loja, loja_nome, titulo, preco, preco_antigo, desconto, imagem, categoria, link, frete_gratis, internacional, moeda, gtin";

// "12.000 BTUs" e "12000 btus" precisam achar o mesmo produto
export const juntarMilhares = (s) => String(s || "").replace(/(\d)\.(?=\d{3}\b)/g, "$1");

// Linha do banco -> formato de oferta que o site entende
export function linhaParaOferta(l) {
  return {
    id: l.id,
    loja: l.loja,
    lojaNome: l.loja_nome,
    titulo: l.titulo,
    preco: l.preco,
    precoAntigo: l.preco_antigo,
    desconto: l.desconto,
    imagem: l.imagem,
    emoji: null,
    categoria: l.categoria,
    avaliacao: null,
    vendidos: null,
    freteGratis: Boolean(l.frete_gratis),
    link: l.link,
    // Loja de fora do Brasil; moeda = em que moeda a loja cobra (o preço já vem convertido para reais)
    internacional: Boolean(l.internacional),
    moeda: l.moeda || null,
    // Código de barras: junta o mesmo produto vendido em lojas diferentes
    gtin: l.gtin || null,
  };
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
  return {
    desde: registros[0].dia,
    // Só afirma "menor em 30 dias" com 30 dias de acompanhamento e se o preço variou nesse tempo
    menorEm30Dias: diasEntre(registros[0].dia, hoje) >= 30 && maior30 > precoAtual && precoAtual <= menor30,
    // Baixou na última mudança, nos últimos 7 dias
    caiu: anterior && anterior.preco > precoAtual && diasEntre(ultima.dia, hoje) <= 7
      ? Math.round((1 - precoAtual / anterior.preco) * 100) : null,
  };
}

// Junta o resumo do histórico às ofertas (uma consulta só para a lista toda)
export async function comHistorico(db, ofertas) {
  if (!ofertas.length) return ofertas;
  const { results } = await db.prepare(
    `SELECT oferta_id, dia, preco FROM precos WHERE oferta_id IN (${ofertas.map(() => "?").join(", ")})
     ORDER BY oferta_id, dia`,
  ).bind(...ofertas.map((o) => o.id)).all();
  const porOferta = new Map();
  for (const r of results) porOferta.set(r.oferta_id, [...(porOferta.get(r.oferta_id) || []), r]);
  return ofertas.map((o) => ({ ...o, historico: resumirHistorico(porOferta.get(o.id) || [], o.preco) }));
}
