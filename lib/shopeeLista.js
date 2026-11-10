// =====================================================================
// LISTA DA SHOPEE — feed oficial de produtos da área de afiliados da Shopee ("Feed de produto" > "Shopee Oficial BR",
// 08/11/2026, pedido do Giovanni). ~100 mil produtos com nota 4+, atualizado todo dia pela Shopee. O robô
// (robo/shopee-lista.mjs) guarda a lista na tabela shopee_lista; aqui a busca do site lê dela e SOMA esses produtos aos
// da busca ao vivo da Shopee (lib/fontes/shopee.js). Vantagens: mais produtos da Shopee por busca, produtos da Shopee
// mesmo quando ela recusa por limite (erro 10030) e preço guardado todo dia (selo "Desconto real").
// A lista não diz quantos foram vendidos: a ordem usa as curtidas e a nota.
// =====================================================================
import { palavras, normalizar } from "./texto.js";
import { juntarMilhares } from "./ofertas.js";
import { temTodasAsPalavras, citaAlgumaPalavra } from "./relevancia.js";
import { juntaDeComposta } from "./vocabulario.js";
import { PALAVRAS_VAZIAS } from "./categorias.js";

export const TABELAS_SHOPEE_LISTA = [
  `CREATE TABLE IF NOT EXISTS shopee_lista (
     num INTEGER PRIMARY KEY,
     id TEXT NOT NULL UNIQUE,
     titulo TEXT NOT NULL,
     preco REAL NOT NULL,
     preco_antigo REAL,
     desconto INTEGER,
     imagem TEXT,
     imagens TEXT,
     link TEXT NOT NULL,
     curto TEXT,
     vendedor TEXT,
     avaliacao REAL,
     curtidas INTEGER NOT NULL DEFAULT 0,
     categorias TEXT,
     internacional INTEGER NOT NULL DEFAULT 0,
     busca TEXT NOT NULL,
     assinatura TEXT NOT NULL,
     atualizado_em INTEGER NOT NULL)`,
  `CREATE VIRTUAL TABLE IF NOT EXISTS shopee_lista_fts USING fts5(
     busca, content='shopee_lista', content_rowid='num', tokenize='unicode61 remove_diacritics 2')`,
  `CREATE TRIGGER IF NOT EXISTS shopee_lista_ai AFTER INSERT ON shopee_lista BEGIN
     INSERT INTO shopee_lista_fts (rowid, busca) VALUES (new.num, new.busca);
   END`,
  `CREATE TRIGGER IF NOT EXISTS shopee_lista_ad AFTER DELETE ON shopee_lista BEGIN
     INSERT INTO shopee_lista_fts (shopee_lista_fts, rowid, busca) VALUES ('delete', old.num, old.busca);
   END`,
  `CREATE TRIGGER IF NOT EXISTS shopee_lista_au AFTER UPDATE OF busca ON shopee_lista BEGIN
     INSERT INTO shopee_lista_fts (shopee_lista_fts, rowid, busca) VALUES ('delete', old.num, old.busca);
     INSERT INTO shopee_lista_fts (rowid, busca) VALUES (new.num, new.busca);
   END`,
];
// Colunas criadas depois (o robô aplica; dá erro se já existem, e tudo bem)
export const MIGRACOES_SHOPEE_LISTA = ["ALTER TABLE shopee_lista ADD COLUMN curto TEXT"];

// Texto do índice de busca: só o nome (as categorias da lista vêm em inglês: "Beauty > Makeup")
export const textoDeBusca = (titulo) => normalizar(juntarMilhares(titulo));

// Miniatura da foto (como na busca ao vivo, lib/fontes/shopee.js): carrega bem mais rápido que a original
const miniatura = (url) => (/\/file\/[\w-]+$/.test(url || "") ? `${url}_tn` : url);

function lerLista(json) {
  try {
    return json ? JSON.parse(json) : [];
  } catch {
    return [];
  }
}

// Linha do banco -> oferta no mesmo formato da busca ao vivo da Shopee
export function linhaParaOfertaShopee(l) {
  const imagens = lerLista(l.imagens);
  return {
    id: l.id,
    loja: "shopee",
    titulo: l.titulo,
    preco: l.preco,
    precoAntigo: l.preco_antigo > l.preco ? l.preco_antigo : null,
    desconto: l.desconto || null,
    imagem: miniatura(l.imagem),
    imagens: imagens.length > 1 ? imagens : undefined,
    avaliacao: Number(l.avaliacao) || null,
    vendidos: null, // a lista não traz vendas
    curtidas: Number(l.curtidas) || null,
    vendedor: l.vendedor || null,
    internacional: Boolean(l.internacional),
    // Códigos de categoria da Shopee (os mesmos da busca ao vivo): ensinam o mapa de categorias
    catsLoja: lerLista(l.categorias).length ? lerLista(l.categorias).map(String) : undefined,
    link: l.link,
    daLista: true,
  };
}

const CANDIDATOS = 2000; // lidos do índice por consulta; os melhores (curtidas, nota) ficam
const MAX_RESULTADOS = 48;
const CHECAR_A_CADA = 5 * 60 * 1000;
let situacao = { tem: false, ate: 0 };

// Palavras curtas ("ar", "tv") só valem inteiras: "ar"* acharia "Arkton" (igual à Awin)
const termoFts = (t) => (t.length <= 2 ? `"${t}"` : `"${t}"*`);

async function temLista(db) {
  if (Date.now() < situacao.ate) return situacao.tem;
  let tem = false;
  try {
    tem = Boolean(await db.prepare("SELECT 1 FROM shopee_lista LIMIT 1").first());
  } catch (erro) {
    // Tabela ainda não existe: o robô nunca rodou. Outra falha do banco: vale o que se sabia e confere de novo em 30 s
    if (!/no such table/i.test(String(erro?.message || erro))) {
      situacao = { tem: situacao.tem, ate: Date.now() + 30 * 1000 };
      return situacao.tem;
    }
  }
  situacao = { tem, ate: Date.now() + CHECAR_A_CADA };
  return tem;
}

async function consultar(db, match) {
  const { results } = await db.prepare(
    `SELECT id, titulo, preco, preco_antigo, desconto, imagem, imagens, link, vendedor, avaliacao, curtidas, categorias, internacional
     FROM shopee_lista WHERE num IN (SELECT rowid FROM shopee_lista_fts WHERE shopee_lista_fts MATCH ? LIMIT ${CANDIDATOS})
     ORDER BY curtidas DESC, avaliacao DESC`,
  ).bind(match).all();
  return results || [];
}

// Produtos da lista que têm todas as palavras da busca no nome (em buscas de 3+ palavras, sem nenhum assim, os que só não
// têm uma), os mais curtidos primeiro. Banco fora do ar ou sem a lista: [] (a busca ao vivo segue sozinha)
export async function buscarNaListaShopee(db, q, max = MAX_RESULTADOS) {
  if (!db || !(await temLista(db))) return [];
  const termos = palavras(juntarMilhares(q)).filter((t) => !PALAVRAS_VAZIAS.has(t)).slice(0, 8);
  if (!termos.length) return [];
  try {
    const grupos = [];
    for (let i = 0; i < termos.length; i++) {
      const junta = i + 1 < termos.length && juntaDeComposta(termos[i], termos[i + 1]);
      if (junta) { grupos.push(`((${termoFts(termos[i])} AND ${termoFts(termos[i + 1])}) OR ${termoFts(junta)})`); i++; }
      else grupos.push(termoFts(termos[i]));
    }
    const temTodas = temTodasAsPalavras(q);
    let linhas = (await consultar(db, grupos.join(" AND "))).filter((l) => temTodas(l.titulo));
    if (!linhas.length && termos.length > 2) {
      const menosUma = termos.map((_, i) => `(${termos.filter((__, j) => j !== i).map(termoFts).join(" AND ")})`);
      const cita = citaAlgumaPalavra(q);
      linhas = (await consultar(db, menosUma.join(" OR "))).filter((l) => cita(l.titulo));
    }
    return linhas.slice(0, max).map(linhaParaOfertaShopee);
  } catch {
    return [];
  }
}
