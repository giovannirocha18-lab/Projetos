// =====================================================================
// BLACK FRIDAY (pedido do Giovanni, 24/10/2026): página só com descontos que dá para conferir.
//
// Toda madrugada o robô refaz ~450 buscas (/api/preparar-buscas). De cada uma, guardamos na tabela bf_ofertas os
// produtos com desconto, em 3 níveis (do mais confiável para o menos):
//   1 = ✅ desconto real: preço abaixo do habitual dos últimos 30 dias, com 21+ dias de histórico nosso
//   2 = 📉 baixou: o preço caiu nos últimos 7 dias em relação ao habitual (ainda sem 21 dias de histórico)
//   3 = desconto informado pela loja (5% a 75%), em produto que ainda não dá para conferir
// Produto acompanhado há 21+ dias SEM desconto real nunca entra: é o caso da loja que sobe o preço antes da Black
// Friday para dar "desconto". Acessórios e produtos "parecidos" ficam de fora. A página (/api/black-friday) lê daqui.
// =====================================================================
import { DESCONTO_SUSPEITO } from "./ofertas.js";

const TABELA = `CREATE TABLE IF NOT EXISTS bf_ofertas (id TEXT PRIMARY KEY, nivel INTEGER NOT NULL, desconto INTEGER NOT NULL,
  oferta TEXT NOT NULL, visto INTEGER NOT NULL)`;
const INDICE = "CREATE INDEX IF NOT EXISTS bf_ordem ON bf_ofertas (nivel, desconto)";
const DESCONTO_MINIMO = 5;
const DA_LOJA_MINIMO = 10;
const DA_LOJA_POR_BUSCA = 8; // nível 3 é o mais comum: poucos por busca, para não encher a página com eles
export const VALE_POR_MS = 36 * 60 * 60 * 1000; // produto que nenhuma busca viu em 36 h sai da página

let tabelaPronta = false;
async function criarTabela(db) {
  if (tabelaPronta) return;
  await db.batch([db.prepare(TABELA), db.prepare(INDICE)]);
  tabelaPronta = true;
}

export function nivelBlackFriday(o) {
  if (!o || o.acessorio || o.parecido || !(o.preco > 0)) return null;
  const h = o.historico;
  if (h?.descontoReal >= DESCONTO_MINIMO && h.descontoReal <= DESCONTO_SUSPEITO) return { nivel: 1, desconto: h.descontoReal };
  if (h?.verificavel) return null; // 21+ dias de histórico e o preço não está abaixo do habitual: não é oferta
  if (h?.caiu >= DESCONTO_MINIMO && h.caiu <= DESCONTO_SUSPEITO) return { nivel: 2, desconto: h.caiu };
  if (o.desconto >= DA_LOJA_MINIMO && o.desconto <= DESCONTO_SUSPEITO) return { nivel: 3, desconto: o.desconto };
  return null;
}

// Guarda os produtos com desconto de uma busca e tira os que esta busca mostrou sem desconto
export async function guardarDaBusca(db, ofertas) {
  if (!db || !ofertas?.length) return 0;
  await criarTabela(db);
  const comNivel = ofertas.map((o) => ({ o, n: nivelBlackFriday(o) }));
  const lojaInformada = comNivel.filter((x) => x.n?.nivel === 3).sort((a, b) => b.n.desconto - a.n.desconto).slice(0, DA_LOJA_POR_BUSCA);
  const entram = [...comNivel.filter((x) => x.n && x.n.nivel < 3), ...lojaInformada];
  const ficam = new Set(entram.map((x) => x.o.id));
  const saem = comNivel.filter((x) => !x.n).map((x) => x.o.id);
  const agora = Date.now();
  const comandos = [];
  // Uma consulta para todos (o D1 aceita no máximo 100 valores por consulta): a lista vai em JSON
  if (entram.length) {
    comandos.push(db.prepare(
      `INSERT OR REPLACE INTO bf_ofertas (id, nivel, desconto, oferta, visto)
       SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]'), json_extract(value, '$[2]'), json_extract(value, '$[3]'), ?
       FROM json_each(?)`,
    ).bind(agora, JSON.stringify(entram.map(({ o, n }) => [o.id, n.nivel, n.desconto, JSON.stringify({ ...o, bf: n.nivel })]))));
  }
  if (saem.length) {
    comandos.push(db.prepare("DELETE FROM bf_ofertas WHERE id IN (SELECT value FROM json_each(?))")
      .bind(JSON.stringify(saem.filter((id) => !ficam.has(id)))));
  }
  if (Math.random() < 0.02) comandos.push(db.prepare("DELETE FROM bf_ofertas WHERE visto < ?").bind(agora - 3 * VALE_POR_MS));
  if (comandos.length) await db.batch(comandos);
  return entram.length;
}

// Página da Black Friday: nível 1 primeiro, depois 2, depois 3; em cada nível, o maior desconto primeiro
export async function listarBlackFriday(db, pagina, porPagina) {
  await criarTabela(db);
  const desde = Date.now() - VALE_POR_MS;
  const [lista, totais] = await db.batch([
    db.prepare(`SELECT oferta FROM bf_ofertas WHERE visto > ? ORDER BY nivel, desconto DESC LIMIT ? OFFSET ?`)
      .bind(desde, porPagina + 1, (pagina - 1) * porPagina),
    db.prepare("SELECT nivel, COUNT(*) AS n FROM bf_ofertas WHERE visto > ? GROUP BY nivel").bind(desde),
  ]);
  const ofertas = lista.results.slice(0, porPagina).map((r) => JSON.parse(r.oferta));
  const porNivel = Object.fromEntries(totais.results.map((r) => [r.nivel, r.n]));
  return {
    ofertas,
    temMais: lista.results.length > porPagina,
    totais: { real: porNivel[1] || 0, baixou: porNivel[2] || 0, loja: porNivel[3] || 0 },
  };
}
