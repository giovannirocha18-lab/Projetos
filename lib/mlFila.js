// Fila de buscas para o robô do Mercado Livre (08/11/2026, pedido do Giovanni: "o maior número de produtos do ML possível").
// Busca feita por um visitante em que o ML não veio completo (recusou por limite ou trouxe poucos produtos) entra aqui; na
// madrugada seguinte o robô (/api/preparar-ml) prepara essas buscas primeiro, com calma, e guarda produtos e preços no banco.
// A partir do dia seguinte a busca traz o ML completo e rápido. Cada termo fica 14 dias (o robô renova enquanto isso).
const TABELA = `CREATE TABLE IF NOT EXISTS ml_fila (termo TEXT PRIMARY KEY, vezes INTEGER NOT NULL DEFAULT 1,
  criado INTEGER NOT NULL, ultima INTEGER NOT NULL)`;
const DIAS = 14;
export const POUCOS_ML = 8; // menos que isso numa busca de produto = "não veio completo"
const MAXIMO_NA_FILA = 2000;
let pronta = false;
async function criar(db) {
  if (pronta) return;
  await db.prepare(TABELA).run();
  pronta = true;
}

export async function anotarNaFilaML(db, termo) {
  const t = String(termo || "").trim().toLowerCase().slice(0, 80);
  if (!db || t.length < 3) return;
  await criar(db);
  const agora = Date.now();
  // Teto de linhas (10/11/2026, revisão): com a fila cheia só soma nos termos que já estão nela
  await db.prepare(`INSERT INTO ml_fila (termo, vezes, criado, ultima)
    SELECT ?1, 1, ?2, ?2 WHERE (SELECT COUNT(*) FROM ml_fila) < ${MAXIMO_NA_FILA} OR EXISTS (SELECT 1 FROM ml_fila WHERE termo = ?1)
    ON CONFLICT(termo) DO UPDATE SET vezes = vezes + 1, ultima = excluded.ultima`).bind(t, agora).run();
}

// Os termos da fila (dos últimos 14 dias), os mais buscados primeiro; apaga os mais velhos
export async function filaML(db, limite = 400) {
  if (!db) return [];
  try {
    await criar(db);
    const desde = Date.now() - DIAS * 864e5;
    await db.prepare("DELETE FROM ml_fila WHERE ultima < ?").bind(desde).run();
    const { results } = await db.prepare("SELECT termo FROM ml_fila ORDER BY vezes DESC, ultima DESC LIMIT ?").bind(limite).all();
    return (results || []).map((r) => r.termo);
  } catch {
    return [];
  }
}
