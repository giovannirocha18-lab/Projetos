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
];

export const COLUNAS_OFERTA =
  "id, loja, loja_nome, titulo, preco, preco_antigo, desconto, imagem, categoria, link, frete_gratis, internacional, moeda";

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
  };
}
