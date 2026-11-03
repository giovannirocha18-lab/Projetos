// =====================================================================
// FONTE AWIN — lojas da rede Awin (Leveros, Efacil, Beleza na Web…).
// A Awin não tem busca ao vivo: o robô de preços (robo/awin.mjs) baixa
// todo dia o catálogo das lojas aprovadas para o banco D1, e aqui a
// busca é feita nesse banco. Liga sozinha quando o banco tiver ofertas.
// =====================================================================
import { palavras, normalizar } from "../texto.js";
import { COLUNAS_OFERTA, juntarMilhares, linhaParaOferta, comHistorico, lojasDaAwin, DESCONTO_SUSPEITO } from "../ofertas.js";
import { temTodasAsPalavras, citaAlgumaPalavra } from "../relevancia.js";
import { PALAVRAS_VAZIAS } from "../categorias.js";

const POR_LOJA_DESTAQUE = 3;

const MAX_RESULTADOS = 100; // era 60; com as vagas divididas entre as lojas (02/11/2026), 100 deixa espaço para todas
const MAX_NA_LOJA = 200; // busca dentro de uma loja: só ela aparece, então vale trazer mais
// Candidatos lidos do índice por consulta. Antes era "ORDER BY rank LIMIT 60": para ordenar, o D1 lia TODOS os
// produtos com a palavra (com a Posthaus, milhares por busca) e estourou o limite grátis de 5 milhões de linhas lidas
// por dia (22/10/2026). Sem ordenar, ele para nos primeiros CANDIDATOS; quem ordena é o site/servidor depois
// (relevância, título com todas as palavras). Produtos com a palavra no título vêm antes (coluna titulo não existe no
// índice: o filtro pelo título é feito aqui).
const CANDIDATOS = 400;
const CANDIDATOS_NA_LOJA = 5000;
const CHECAR_A_CADA = 5 * 60 * 1000;

// Lembra por 5 minutos se o banco tem ofertas, para não perguntar a cada busca
let situacao = { tem: false, ate: 0 };

// Palavras curtas ("ar", "tv") só valem inteiras: "ar"* acharia "Arkton"
const termoFts = (t) => (t.length <= 2 ? `"${t}"` : `"${t}"*`);

async function consultarTermos(db, match, loja) {
  // Busca dentro de uma loja (página da loja aberta): os 400 primeiros candidatos de todas as lojas podiam não ter
  // nenhum dela; aqui lê mais candidatos e fica só com os da loja
  const { results } = await db.prepare(
    // Busca cada candidato pelo número (num IN …). Com "JOIN … WHERE fonte = 'awin'" o SQLite preferia percorrer
    // o índice de fonte, ou seja, todas as ofertas. A fonte é conferida aqui
    `SELECT fonte, ${COLUNAS_OFERTA} FROM ofertas
     WHERE num IN (SELECT rowid FROM ofertas_fts WHERE ofertas_fts MATCH ? LIMIT ${loja ? CANDIDATOS_NA_LOJA : CANDIDATOS})${loja ? " AND loja = ?" : ""}`,
  ).bind(...(loja ? [match, loja] : [match])).all();
  return results.filter((l) => l.fonte === "awin");
}

// Candidatos de CADA loja (02/11/2026): os 400 primeiros do índice vinham na ordem em que os produtos entraram no
// banco, então loja nova (Cama In Box) nunca aparecia em "sofá" ou "colchão" — as antigas enchiam os 400. O nome da
// loja está no texto do índice (robo/awin.mjs: título + marca + categoria + loja), então cada consulta pede as palavras
// da busca E o nome da loja; todas vão juntas numa ida só ao banco (batch).
const CANDIDATOS_POR_LOJA = 400; // 150 cortava a Efacil (03/11: "smart tv 50 polegadas" 14 de 38 TVs); 400 = o que a loja maior tinha antes
let lojasGuardadas = { lista: [], ate: 0 };
async function lojasParaBuscar(db) {
  if (Date.now() < lojasGuardadas.ate) return lojasGuardadas.lista;
  const lista = (await lojasDaAwin(db)).map((l) => l.loja).filter(Boolean);
  lojasGuardadas = { lista, ate: Date.now() + CHECAR_A_CADA };
  return lista;
}
async function candidatosPorLoja(db, match) {
  const lojas = await lojasParaBuscar(db);
  if (!lojas.length) return consultarTermos(db, match, null);
  const consultas = lojas.map((loja) => db.prepare(
    `SELECT fonte, ${COLUNAS_OFERTA} FROM ofertas
     WHERE num IN (SELECT rowid FROM ofertas_fts WHERE ofertas_fts MATCH ? LIMIT ${CANDIDATOS_POR_LOJA}) AND loja = ?`,
  ).bind(`(${match}) AND "${loja.replace(/[-"]+/g, " ").trim()}"`, loja));
  const respostas = await db.batch(consultas);
  return respostas.flatMap((r) => r.results || []).filter((l) => l.fonte === "awin");
}

// Divide as vagas entre as lojas (uma de cada por vez), com no máximo 2 variações do mesmo produto por loja
// ("Colchão Select - Casal", "- Queen", "- King"…: a Cama In Box manda cada tamanho e cor como um produto)
function revezarLojas(linhas, max) {
  const porLoja = new Map();
  for (const l of linhas) {
    if (!porLoja.has(l.loja)) porLoja.set(l.loja, []);
    porLoja.get(l.loja).push(l);
  }
  const filas = [...porLoja.values()];
  const variacoes = new Map();
  const saida = [];
  while (saida.length < max && filas.some((f) => f.length)) {
    for (const fila of filas) {
      while (fila.length) {
        const l = fila.shift();
        const base = `${l.loja}|${normalizar(l.titulo.replace(/ - [^-]*$/, ""))}`;
        const vezes = variacoes.get(base) || 0;
        if (vezes >= 2) continue;
        variacoes.set(base, vezes + 1);
        saida.push(l);
        break;
      }
      if (saida.length >= max) break;
    }
  }
  return saida;
}

export const awin = {
  nome: "awin",

  async ativa(env) {
    if (!env.DB) return false;
    if (Date.now() < situacao.ate) return situacao.tem;
    let tem = false;
    try {
      tem = Boolean(await env.DB.prepare("SELECT 1 FROM ofertas WHERE fonte = 'awin' LIMIT 1").first());
    } catch {
      // Tabela ainda não existe: o robô nunca rodou
    }
    situacao = { tem, ate: Date.now() + CHECAR_A_CADA };
    return tem;
  },

  async buscar(q, env, _pagina, opcoes) {
    const loja = opcoes?.soLoja || null;
    const max = loja ? MAX_NA_LOJA : MAX_RESULTADOS;
    // "de/do/para…" não contam: "armario de cozinha" virava 3 palavras e o "faltando uma" aceitava "Tábua de Cozinha"
    const termos = palavras(juntarMilhares(q)).filter((t) => !PALAVRAS_VAZIAS.has(t)).slice(0, 8);
    if (!termos.length) return [];
    // O índice tem título + marca + categoria + loja: "armario de cozinha" achava "Tábua de Cozinha OXO" porque a
    // categoria da Spicy é "Cozinha > Armários…" (print de 17/10/2026). Fica só o que tem as palavras no título.
    const temTodas = temTodasAsPalavras(q);
    const consultar = (match) => (loja ? consultarTermos(env.DB, match, loja) : candidatosPorLoja(env.DB, match));
    const escolher = (lista) => (loja ? lista.slice(0, max) : revezarLojas(lista, max));
    let linhas = escolher((await consultar(termos.map(termoFts).join(" "))).filter((l) => temTodas(l.titulo)));
    // Nenhum produto com todas as palavras: em buscas de 3+ palavras, aceita os que só não têm uma
    // ("fritadeira air fryer mondial 4l"). Com 2 palavras não: "ar condicionado" traria qualquer "ar".
    if (!linhas.length && termos.length > 2) {
      const menosUma = termos.map((_, i) => `(${termos.filter((__, j) => j !== i).map(termoFts).join(" AND ")})`);
      const cita = citaAlgumaPalavra(q);
      linhas = escolher((await consultar(menosUma.join(" OR "))).filter((l) => cita(l.titulo)));
    }
    return comHistorico(env.DB, linhas.map(linhaParaOferta));
  },

  // "Ofertas do dia": até 3 de cada loja, maior desconto primeiro, entre 10% e 75% (eram os 16 maiores descontos de
  // todas juntas: vinham só da Posthaus, com 76–90%, quase sempre preço "de" inflado; 23/10/2026). Usa o índice (loja, desconto)
  async destaques(env) {
    const lojas = await lojasDaAwin(env.DB);
    const consulta = env.DB.prepare(
      `SELECT ${COLUNAS_OFERTA} FROM ofertas WHERE loja = ? AND +fonte = 'awin' AND desconto BETWEEN 10 AND ${DESCONTO_SUSPEITO}
       ORDER BY desconto DESC LIMIT ${POR_LOJA_DESTAQUE}`,
    );
    const porLoja = (await env.DB.batch(lojas.map((l) => consulta.bind(l.loja)))).map((r) => r.results || []);
    // Intercala as lojas: a 1ª de cada, depois a 2ª de cada…
    const linhas = [];
    for (let i = 0; i < POR_LOJA_DESTAQUE; i++) for (const lista of porLoja) if (lista[i]) linhas.push(lista[i]);
    return comHistorico(env.DB, linhas.map(linhaParaOferta));
  },
};
