// =====================================================================
// FONTE AWIN — lojas da rede Awin (Leveros, Efacil, Beleza na Web…).
// A Awin não tem busca ao vivo: o robô de preços (robo/awin.mjs) baixa
// todo dia o catálogo das lojas aprovadas para o banco D1, e aqui a
// busca é feita nesse banco. Liga sozinha quando o banco tiver ofertas.
// =====================================================================
import { palavras } from "../texto.js";
import { COLUNAS_OFERTA, juntarMilhares, linhaParaOferta, comHistorico } from "../ofertas.js";

const MAX_RESULTADOS = 60;
const CHECAR_A_CADA = 5 * 60 * 1000;

// Lembra por 5 minutos se o banco tem ofertas, para não perguntar a cada busca
let situacao = { tem: false, ate: 0 };

// Palavras curtas ("ar", "tv") só valem inteiras: "ar"* acharia "Arkton"
const termoFts = (t) => (t.length <= 2 ? `"${t}"` : `"${t}"*`);

async function consultarTermos(db, match) {
  const { results } = await db.prepare(
    `SELECT ${COLUNAS_OFERTA.split(", ").map((c) => `o.${c}`).join(", ")}
     FROM ofertas_fts JOIN ofertas o ON o.num = ofertas_fts.rowid
     WHERE ofertas_fts MATCH ? AND o.fonte = 'awin'
     ORDER BY ofertas_fts.rank
     LIMIT ${MAX_RESULTADOS}`,
  ).bind(match).all();
  return results;
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

  async buscar(q, env) {
    const termos = palavras(juntarMilhares(q)).slice(0, 8);
    if (!termos.length) return [];
    let linhas = await consultarTermos(env.DB, termos.map(termoFts).join(" "));
    // Nenhum produto com todas as palavras: em buscas de 3+ palavras, aceita os que só não têm uma
    // ("fritadeira air fryer mondial 4l"). Com 2 palavras não: "ar condicionado" traria qualquer "ar".
    if (!linhas.length && termos.length > 2) {
      const menosUma = termos.map((_, i) => `(${termos.filter((__, j) => j !== i).map(termoFts).join(" AND ")})`);
      linhas = await consultarTermos(env.DB, menosUma.join(" OR "));
    }
    return comHistorico(env.DB, linhas.map(linhaParaOferta));
  },

  async destaques(env) {
    const { results } = await env.DB.prepare(
      `SELECT ${COLUNAS_OFERTA} FROM ofertas
       WHERE fonte = 'awin' AND desconto >= 10
       ORDER BY desconto DESC LIMIT 16`,
    ).all();
    return comHistorico(env.DB, results.map(linhaParaOferta));
  },
};
