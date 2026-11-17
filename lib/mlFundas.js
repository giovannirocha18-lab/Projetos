// Buscas fundas do Mercado Livre (17/11/2026, print do Giovanni: "smartphone samsung" com 24 produtos do ML; "pode aumentar;
// se necessário reestruture o robô do ML"). O ML só nos dá o catálogo (uma ficha por modelo) e cada preço custa uma consulta,
// então não cabe em todas as ~1.900 buscas da noite: nestas (as mais procuradas) o robô pede até FICHAS_FUNDAS fichas e o
// preço de TODAS (fase "fundas" da trilha ml em lib/roboNoite.js, /api/preparar-ml?fundas=1). As outras seguem com 96 fichas
// e 24 com preço. Ordem = prioridade (a fase para pelo relógio); depois da lista vêm as mais buscadas no site e as buscas prontas.
// Para incluir uma busca: pôr na lista.
export const FICHAS_FUNDAS = 240;
export const BUSCAS_FUNDAS = [
  "celular", "smartphone", "celular samsung", "smartphone samsung", "iphone", "celular motorola", "celular xiaomi",
  "notebook", "smart tv", "geladeira", "fogão", "máquina de lavar", "micro-ondas", "air fryer", "ar condicionado",
  "fone bluetooth", "smartwatch", "tablet", "monitor", "impressora", "ventilador", "aspirador de pó", "cafeteira",
  "liquidificador", "furadeira", "parafusadeira", "caixa de som", "ps5", "xbox", "nintendo switch", "tênis", "tênis nike",
  "perfume", "mochila", "cadeira gamer", "colchão", "sofá", "guarda-roupa", "bicicleta", "relógio", "smart tv 50",
  "smart tv 55", "notebook gamer", "samsung galaxy", "iphone 16", "iphone 15", "lava e seca", "freezer", "cooktop",
  "purificador de água", "panela de pressão", "ração", "whey protein", "creatina", "fralda", "carrinho de bebê",
];
// Tamanho da lista da noite (17/11/2026, Giovanni: "pode aumentar"; cada busca custa ~150 consultas ao ML, sem esperas)
export const TOTAL_DE_FUNDAS = 300;

// A lista da noite: as fixas, as mais buscadas no site e depois as buscas prontas, na ordem delas (sem repetir), até o total.
// corrigir = corrigirBusca(...).q; aceita = filtro das tendências
// pular = termos que renderam pouco nas últimas noites (fundasFracas)
export function listaDasFundas(outras = [], corrigir = (t) => t, aceita = () => true, total = TOTAL_DE_FUNDAS, pular = new Set()) {
  const vistos = new Set();
  const lista = [];
  for (const t of [...BUSCAS_FUNDAS, ...outras.filter(aceita)]) {
    if (lista.length >= total) break;
    const q = corrigir(String(t || "").trim().toLowerCase());
    if (q.length < 3 || vistos.has(q)) continue;
    vistos.add(q);
    if (!pular.has(q)) lista.push(q);
  }
  return lista;
}

// Busca funda que rende pouco não gasta o tempo da noite (17/11/2026, Giovanni: "pode fazer"; na 1ª rodada 60 das 280
// trouxeram menos de 8 produtos com preço: "tablet", "ar condicionado", "bicicleta", "tênis nike" 0 — o catálogo do ML
// responde mal a palavra solta e a moda). O resultado de cada uma fica em ml_fundas; a fraca só é tentada de novo depois de
// 7 dias e a vaga dela vai para a busca seguinte da lista. Só conta resultado de antes desta rodada (6 h), para a lista
// não mudar no meio da noite
// Uma noite ruim não tira ninguém (17/11/2026, Giovanni: "se geladeira der erro vindo 0, sai da lista?"): só fica de fora
// a busca que veio fraca em 2 rodadas seguidas (seguidas = contador; uma rodada boa zera). Erro do ML nem é anotado
export const FUNDA_FRACA = 8;
const SEGUIDAS_PARA_SAIR = 2;
const TENTAR_DE_NOVO_MS = 7 * 864e5;
const DESTA_RODADA_MS = 6 * 3600e3;
const TABELA = `CREATE TABLE IF NOT EXISTS ml_fundas2 (termo TEXT PRIMARY KEY, produtos INTEGER NOT NULL, seguidas INTEGER NOT NULL DEFAULT 0,
  quando INTEGER NOT NULL)`;
export async function fundasFracas(db, agora = Date.now()) {
  try {
    await db.prepare(TABELA).run();
    const { results } = await db.prepare("SELECT termo FROM ml_fundas2 WHERE seguidas >= ? AND quando > ? AND quando < ?")
      .bind(SEGUIDAS_PARA_SAIR, agora - TENTAR_DE_NOVO_MS, agora - DESTA_RODADA_MS).all();
    return new Set((results || []).map((r) => r.termo));
  } catch {
    return new Set();
  }
}
// Outra rodada no mesmo dia (menos de 6 h) não conta como mais uma seguida
export async function anotarFunda(db, termo, produtos, agora = Date.now()) {
  try {
    await db.prepare(TABELA).run();
    const fraca = (Number(produtos) || 0) < FUNDA_FRACA ? 1 : 0;
    await db.prepare(`INSERT INTO ml_fundas2 (termo, produtos, seguidas, quando) VALUES (?1, ?2, ?3, ?4)
      ON CONFLICT(termo) DO UPDATE SET produtos = excluded.produtos,
        seguidas = CASE WHEN ?3 = 0 THEN 0 WHEN ?4 - quando < ${DESTA_RODADA_MS} THEN MAX(seguidas, 1) ELSE seguidas + 1 END,
        quando = CASE WHEN ?3 = 1 AND ?4 - quando < ${DESTA_RODADA_MS} THEN quando ELSE ?4 END`).bind(termo, Number(produtos) || 0, fraca, agora).run();
  } catch { /* banco fora do ar: segue */ }
}
