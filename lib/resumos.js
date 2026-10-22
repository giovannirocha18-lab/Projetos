// =====================================================================
// RESUMOS GUARDADOS NO BANCO
//
// Contas que leem muitas linhas (o mapa de categorias lê ~6 mil votos; os mais buscados, centenas de buscas)
// ficam prontas numa linha só da tabela resumos e são refeitas de tempos em tempos. Em 22/10/2026 essas duas
// contas leram ~5 milhões de linhas num dia (o limite grátis do D1): agora cada uso lê 1 linha.
//
// resumos -> (chave, valor em JSON, quando foi feito)
// =====================================================================

const TABELA = "CREATE TABLE IF NOT EXISTS resumos (chave TEXT PRIMARY KEY, valor TEXT NOT NULL, em INTEGER NOT NULL)";
let tabelaPronta = false;

// Devolve o resumo "chave"; se não existe ou passou de validadeMs, refaz com calcular() e guarda.
// Se outro servidor já está refazendo, usa o antigo (só um refaz de cada vez).
export async function resumo(db, chave, validadeMs, calcular) {
  if (!tabelaPronta) {
    await db.prepare(TABELA).run();
    tabelaPronta = true;
  }
  const agora = Date.now();
  const linha = await db.prepare("SELECT valor, em FROM resumos WHERE chave = ?").bind(chave).first();
  if (linha && agora - linha.em < validadeMs) return JSON.parse(linha.valor);
  if (linha) {
    // Marca como "refazendo" antes de calcular: quem chegar depois vê a data nova e usa o valor antigo
    const { meta } = await db.prepare("UPDATE resumos SET em = ? WHERE chave = ? AND em = ?").bind(agora, chave, linha.em).run();
    if (!meta.changes) return JSON.parse(linha.valor);
  }
  const valor = await calcular();
  await db.prepare("INSERT OR REPLACE INTO resumos (chave, valor, em) VALUES (?, ?, ?)")
    .bind(chave, JSON.stringify(valor), Date.now()).run();
  // Faxina de vez em quando: chaves com data ("mais-buscados:2026-10-22") deixam de ser usadas
  if (Math.random() < 0.05) await db.prepare("DELETE FROM resumos WHERE em < ?").bind(Date.now() - 7 * 864e5).run();
  return valor;
}
