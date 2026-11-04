// "Zerar contadores" do painel (pedido do Giovanni, 04/11/2026: "dá pra resetar todos esses contadores e começar a partir
// de hoje?"). O momento do último zerar fica na tabela painel_config (chave "inicio", em milissegundos). O painel só conta
// visitas (Web Analytics, a partir do minuto), buscas e cliques (do dia em diante; as do próprio dia antes do zerar são
// apagadas) desde então. Contas, alertas e carrinhos são de gente de verdade e não são zerados.
export const TABELA_CONFIG = "CREATE TABLE IF NOT EXISTS painel_config (chave TEXT PRIMARY KEY, valor TEXT NOT NULL)";
export const diaEmBrasilia = (ms) => new Date(ms).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

export async function inicioDaContagem(db) {
  try {
    const linha = await db.prepare("SELECT valor FROM painel_config WHERE chave = 'inicio'").first();
    const ms = Number(linha?.valor);
    return Number.isFinite(ms) && ms > 0 ? ms : null;
  } catch {
    return null; // tabela ainda não existe: conta tudo
  }
}

export async function zerarContadores(db, agora = Date.now()) {
  const dia = diaEmBrasilia(agora);
  await db.prepare(TABELA_CONFIG).run();
  await db.batch([
    db.prepare("INSERT OR REPLACE INTO painel_config (chave, valor) VALUES ('inicio', ?)").bind(String(agora)),
    db.prepare("DELETE FROM buscas WHERE dia = ?").bind(dia),
    db.prepare("DELETE FROM buscas_marcas WHERE marca >= ?").bind(dia),
    db.prepare("DELETE FROM cliques WHERE dia = ?").bind(dia),
    db.prepare("DELETE FROM cliques_produtos WHERE dia = ?").bind(dia),
  ]).catch(async () => {
    // Alguma tabela ainda não existe: faz um por um, ignorando as que faltam
    await db.prepare("INSERT OR REPLACE INTO painel_config (chave, valor) VALUES ('inicio', ?)").bind(String(agora)).run();
    for (const [sql, v] of [["DELETE FROM buscas WHERE dia = ?", dia], ["DELETE FROM buscas_marcas WHERE marca >= ?", dia],
      ["DELETE FROM cliques WHERE dia = ?", dia], ["DELETE FROM cliques_produtos WHERE dia = ?", dia]]) {
      await db.prepare(sql).bind(v).run().catch(() => {});
    }
  });
  return agora;
}
