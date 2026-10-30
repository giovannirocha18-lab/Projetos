// =====================================================================
// BUSCAS EM ALTA — conta quantas vezes cada termo foi buscado por dia
// (só o termo e o total; nada sobre quem buscou) e devolve os mais
// buscados da semana para os atalhos abaixo da busca.
// Cada pessoa conta 1 vez por termo por dia: repetir a mesma busca 100 vezes
// não põe um termo nos "em alta" (ver registrarBusca).
// =====================================================================
import { normalizar } from "./texto.js";
import { resumo } from "./resumos.js";

const DIAS_SEMANA = 7;
const GUARDAR_DIAS = 30;
const MINIMO_BUSCAS = 3; // um termo só entra em alta depois de buscado por algumas pessoas
const QUANTIDADE = 8;

// Termos que nunca aparecem nos atalhos, mesmo que muito buscados
export const BLOQUEADOS = /\b(sexo|sexy|sex shop|porn\w*|nudes?|erotic\w*|xxx|vibrador\w*|camisinhas?|preservativos?|armas?|drogas?|maconha|vapes?|pods?|cigarros?)\b/;

// Termos que saíram dos atalhos (contados quando cliques em atalhos antigos ainda viravam busca)
const FORA_DOS_ATALHOS = new Set(["roupas", "roupa", "attracione men", "boneca"]); // boneca: buscas de teste (30/10/2026)

const TABELA = `CREATE TABLE IF NOT EXISTS buscas (
  termo TEXT NOT NULL,
  dia TEXT NOT NULL,
  total INTEGER NOT NULL,
  texto TEXT NOT NULL,
  PRIMARY KEY (termo, dia)) WITHOUT ROWID`;

// Quem já contou cada termo hoje: só uma marca curta (dia + 6 letras de um resumo de IP+termo+dia).
// O IP não é guardado e a marca não volta a ele (6 letras = 16 milhões de valores, muitos IPs dão a mesma);
// as marcas de ontem são apagadas.
const TABELA_MARCAS = "CREATE TABLE IF NOT EXISTS buscas_marcas (marca TEXT PRIMARY KEY) WITHOUT ROWID";

let tabelaPronta = false;
async function banco(env) {
  if (!env.DB) return null;
  if (!tabelaPronta) {
    await env.DB.batch([env.DB.prepare(TABELA), env.DB.prepare(TABELA_MARCAS)]);
    tabelaPronta = true;
  }
  return env.DB;
}

async function marcaDoDia(ip, termo, dia) {
  // IPv6: a pessoa costuma ter um bloco inteiro (/64), então vale só o começo do endereço
  const rede = ip.includes(":") ? ip.split(":").slice(0, 4).join(":") : ip;
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${rede}|${termo}|${dia}`));
  return `${dia}:${[...new Uint8Array(hash).slice(0, 3)].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

const hoje = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const diasAtras = (n) => new Date(Date.parse(hoje()) - n * 864e5).toISOString().slice(0, 10);

// Só conta buscas que trouxeram ofertas, com tamanho de termo razoável, uma vez por pessoa (IP) por dia
export async function registrarBusca(env, q, ip) {
  const termo = normalizar(q); // sem acento, para "Tênis" e "tenis" contarem juntos
  const texto = q.trim().replace(/\s+/g, " ").toLowerCase(); // como a pessoa escreveu, para mostrar
  if (termo.length < 3 || termo.length > 40 || BLOQUEADOS.test(termo)) return;
  const db = await banco(env);
  if (!db) return;
  const dia = hoje();
  if (ip) {
    // RETURNING só devolve a linha se ela foi criada agora: se já existia, esta pessoa já contou hoje
    const nova = await db.prepare("INSERT OR IGNORE INTO buscas_marcas (marca) VALUES (?) RETURNING marca")
      .bind(await marcaDoDia(ip, termo, dia)).first();
    if (!nova) return;
  }
  await db.batch([
    db.prepare(
      `INSERT INTO buscas (termo, dia, total, texto) VALUES (?, ?, 1, ?)
       ON CONFLICT (termo, dia) DO UPDATE SET total = total + 1, texto = excluded.texto`,
    ).bind(termo, dia, texto),
    // Faxina de vez em quando: apaga o que tem mais de 30 dias e as marcas de dias anteriores
    ...(Math.random() < 0.01 ? [db.prepare("DELETE FROM buscas WHERE dia < ?").bind(diasAtras(GUARDAR_DIAS)),
      db.prepare("DELETE FROM buscas_marcas WHERE marca < ?").bind(dia)] : []),
  ]);
}

// Os mais buscados dos últimos 7 dias (lista vazia se ainda não há dados).
// ateOntem = sem contar hoje: a lista fica igual o dia todo (a coleta de preços divide as buscas em partes)
// A conta fica pronta na tabela resumos por 1 hora: o robô pedia a lista a cada busca preparada e cada vez lia
// todas as buscas da semana (1,8 milhão de leituras num dia com a lista de 30 dias, 22/10/2026)
const VALIDADE_LISTA_MS = 3600 * 1000;

export async function maisBuscados(env, { ateOntem = false } = {}) {
  const db = await banco(env);
  if (!db) return [];
  const chave = `mais-buscados:${ateOntem ? hoje() : "hoje"}`;
  return resumo(db, chave, VALIDADE_LISTA_MS, () => contarMaisBuscados(db, ateOntem));
}

async function contarMaisBuscados(db, ateOntem) {
  const { results } = await db.prepare(
    `SELECT termo, MAX(texto) AS texto, SUM(total) AS vezes FROM buscas WHERE dia >= ? AND dia < ?
     GROUP BY termo HAVING vezes >= ? ORDER BY vezes DESC, termo LIMIT ?`,
  ).bind(diasAtras(DIAS_SEMANA), ateOntem ? hoje() : "9999", MINIMO_BUSCAS, QUANTIDADE).all();
  return results.filter((r) => !BLOQUEADOS.test(r.termo) && !FORA_DOS_ATALHOS.has(r.termo)).map((r) => r.texto);
}

// Termos buscados no site nos últimos 30 dias, por pelo menos 2 pessoas (sugestões da caixa de busca)
export async function termosBuscados(env, limite = 300) {
  const db = await banco(env);
  if (!db) return [];
  return resumo(db, `termos-buscados:${limite}`, VALIDADE_LISTA_MS, () => contarTermosBuscados(db, limite));
}

async function contarTermosBuscados(db, limite) {
  const { results } = await db.prepare(
    `SELECT termo, MAX(texto) AS texto, SUM(total) AS vezes FROM buscas WHERE dia >= ?
     GROUP BY termo HAVING vezes >= 2 ORDER BY vezes DESC, termo LIMIT ?`,
  ).bind(diasAtras(GUARDAR_DIAS), limite).all();
  return results.filter((r) => !BLOQUEADOS.test(r.termo) && !FORA_DOS_ATALHOS.has(r.termo)).map((r) => r.texto);
}
