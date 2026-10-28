// =====================================================================
// FONTE AWIN — lojas da rede Awin (Leveros, Efacil, Beleza na Web…).
// A Awin não tem busca ao vivo: o robô de preços (robo/awin.mjs) baixa
// todo dia o catálogo das lojas aprovadas para o banco D1, e aqui a
// busca é feita nesse banco. Liga sozinha quando o banco tiver ofertas.
// =====================================================================
import { palavras } from "../texto.js";
import { COLUNAS_OFERTA, juntarMilhares, linhaParaOferta, comHistorico, lojasDaAwin, DESCONTO_SUSPEITO } from "../ofertas.js";
import { temTodasAsPalavras, citaAlgumaPalavra } from "../relevancia.js";
import { PALAVRAS_VAZIAS } from "../categorias.js";

const POR_LOJA_DESTAQUE = 3;

const MAX_RESULTADOS = 60;
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
    let linhas = (await consultarTermos(env.DB, termos.map(termoFts).join(" "), loja)).filter((l) => temTodas(l.titulo)).slice(0, max);
    // Nenhum produto com todas as palavras: em buscas de 3+ palavras, aceita os que só não têm uma
    // ("fritadeira air fryer mondial 4l"). Com 2 palavras não: "ar condicionado" traria qualquer "ar".
    if (!linhas.length && termos.length > 2) {
      const menosUma = termos.map((_, i) => `(${termos.filter((__, j) => j !== i).map(termoFts).join(" AND ")})`);
      const cita = citaAlgumaPalavra(q);
      linhas = (await consultarTermos(env.DB, menosUma.join(" OR "), loja)).filter((l) => cita(l.titulo)).slice(0, max);
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
