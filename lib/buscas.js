// =====================================================================
// BUSCAS EM ALTA — conta quantas vezes cada termo foi buscado por dia
// (só o termo e o total; nada sobre quem buscou) e devolve os mais
// buscados da semana para os atalhos abaixo da busca.
// =====================================================================
import { normalizar } from "./texto.js";

const DIAS_SEMANA = 7;
const GUARDAR_DIAS = 30;
const MINIMO_BUSCAS = 3; // um termo só entra em alta depois de buscado algumas vezes
const QUANTIDADE = 8;

// Termos que nunca aparecem nos atalhos, mesmo que muito buscados
export const BLOQUEADOS = /\b(sexo|sexy|sex shop|porn\w*|nudes?|erotic\w*|xxx|vibrador\w*|camisinhas?|preservativos?|armas?|drogas?|maconha|vapes?|pods?|cigarros?)\b/;

const TABELA = `CREATE TABLE IF NOT EXISTS buscas (
  termo TEXT NOT NULL,
  dia TEXT NOT NULL,
  total INTEGER NOT NULL,
  texto TEXT NOT NULL,
  PRIMARY KEY (termo, dia)) WITHOUT ROWID`;

let tabelaPronta = false;
async function banco(env) {
  if (!env.DB) return null;
  if (!tabelaPronta) {
    await env.DB.prepare(TABELA).run();
    tabelaPronta = true;
  }
  return env.DB;
}

const hoje = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const diasAtras = (n) => new Date(Date.parse(hoje()) - n * 864e5).toISOString().slice(0, 10);

// Só conta buscas que trouxeram ofertas, com tamanho de termo razoável
export async function registrarBusca(env, q) {
  const termo = normalizar(q); // sem acento, para "Tênis" e "tenis" contarem juntos
  const texto = q.trim().replace(/\s+/g, " ").toLowerCase(); // como a pessoa escreveu, para mostrar
  if (termo.length < 3 || termo.length > 40 || BLOQUEADOS.test(termo)) return;
  const db = await banco(env);
  if (!db) return;
  await db.batch([
    db.prepare(
      `INSERT INTO buscas (termo, dia, total, texto) VALUES (?, ?, 1, ?)
       ON CONFLICT (termo, dia) DO UPDATE SET total = total + 1, texto = excluded.texto`,
    ).bind(termo, hoje(), texto),
    // Faxina de vez em quando: apaga o que tem mais de 30 dias
    ...(Math.random() < 0.01 ? [db.prepare("DELETE FROM buscas WHERE dia < ?").bind(diasAtras(GUARDAR_DIAS))] : []),
  ]);
}

// Os mais buscados dos últimos 7 dias (lista vazia se ainda não há dados)
export async function maisBuscados(env) {
  const db = await banco(env);
  if (!db) return [];
  const { results } = await db.prepare(
    `SELECT termo, MAX(texto) AS texto, SUM(total) AS vezes FROM buscas WHERE dia >= ?
     GROUP BY termo HAVING vezes >= ? ORDER BY vezes DESC LIMIT ?`,
  ).bind(diasAtras(DIAS_SEMANA), MINIMO_BUSCAS, QUANTIDADE).all();
  return results.filter((r) => !BLOQUEADOS.test(r.termo)).map((r) => r.texto);
}

// ---------------------------------------------------------------------
// Transforma nomes de produtos em termos curtos de busca:
// "Fone Bluetooth TWS Kaidi KD-771 Sem Fio" -> "fone bluetooth"
// ---------------------------------------------------------------------
const GENERICAS = new Set(("novo nova novos novas kit combo conjunto promocao promoção oferta original lancamento " +
  "lançamento premium super mega top mais vendido frete gratis grátis pronta entrega atacado lote par pares unidade " +
  "unidades peças pecas com sem de da do das dos para pra e o a os as em no na nos nas um uma the and for with by").split(" "));
const LIGACOES = new Set(["de", "da", "do", "para"]);

export function termosDosProdutos(nomes, quantidade = 8) {
  const termos = [];
  const primeiras = new Set();
  for (const nome of nomes) {
    const tokens = String(nome).replace(/[\[\](){}|/\\+*#!?.,:;"“”´`~^_=<>]/g, " ").split(/\s+/).filter(Boolean);
    // Palavra que serve: só letras (aceita hífen), não genérica e não marca em CAIXA ALTA (KAIDI, H'MASTON, TWS)
    const serve = (t) => /^[a-zà-ú]{3,}(-[a-zà-ú]+)*$/i.test(t) && !GENERICAS.has(t.toLowerCase()) && t !== t.toUpperCase();
    const i = tokens.findIndex(serve);
    if (i < 0) continue;
    // Pega a palavra seguinte que serve, mantendo "de/para" no meio ("fone de ouvido")
    let termo = tokens[i];
    const j = tokens.findIndex((t, k) => k > i && serve(t));
    if (j > i && j - i <= 2 && tokens.slice(i + 1, j).every((t) => LIGACOES.has(t.toLowerCase()))) {
      termo = tokens.slice(i, j + 1).join(" ");
    }
    termo = termo.toLowerCase();
    const primeira = normalizar(tokens[i]);
    // Um termo por tipo de produto (evita "fone de ouvido" e "fone bluetooth" juntos)
    if (termo.length < 4 || primeiras.has(primeira) || BLOQUEADOS.test(normalizar(termo))) continue;
    primeiras.add(primeira);
    termos.push(termo);
    if (termos.length >= quantidade) break;
  }
  return termos;
}
