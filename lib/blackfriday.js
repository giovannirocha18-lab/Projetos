// =====================================================================
// BLACK FRIDAY (pedido do Giovanni, 24/10/2026): página só com descontos que dá para conferir.
//
// Toda madrugada o robô refaz ~450 buscas (/api/preparar-buscas). De cada uma, guardamos na tabela bf_ofertas os
// produtos com desconto, em 3 níveis (do mais confiável para o menos):
//   1 = ✅ desconto real: preço abaixo do habitual dos últimos 30 dias, com 21+ dias de histórico nosso
//   2 = 📉 baixou: o preço caiu nos últimos 7 dias para o menor já visto (7+ dias de histórico; ver caiuDeVerdade)
//   3 = desconto informado pela loja (10% a 60%), em produto que ainda não dá para conferir
// Produto acompanhado há 21+ dias SEM desconto real nunca entra: é o caso da loja que sobe o preço antes da Black
// Friday para dar "desconto". Acessórios e produtos "parecidos" ficam de fora. A página (/api/black-friday) lê daqui.
// =====================================================================
import { DESCONTO_SUSPEITO } from "./ofertas.js";

const TABELA = `CREATE TABLE IF NOT EXISTS bf_ofertas (id TEXT PRIMARY KEY, nivel INTEGER NOT NULL, desconto INTEGER NOT NULL,
  oferta TEXT NOT NULL, visto INTEGER NOT NULL)`;
const INDICE = "CREATE INDEX IF NOT EXISTS bf_ordem ON bf_ofertas (nivel, desconto)";
const DESCONTO_MINIMO = 5;
const DA_LOJA_MINIMO = 10;
const DA_LOJA_MAXIMO = 60; // desconto da loja sem histórico nosso: acima disso costuma ser preço "de" inflado
const DA_LOJA_POR_BUSCA = 12; // nível 3 é o mais comum: poucos por busca, para não encher a página com eles
// ...e no máximo 3 de cada loja (06/11/2026: eram os 8 maiores descontos, quase sempre só Shopee/AliExpress; o Mercado Livre
// e as lojas da Awin não entravam)
const DA_LOJA_POR_LOJA = 3;
// Dois produtos com o mesmo começo do nome são o mesmo produto (vendedores diferentes da Shopee): fica só o melhor
const LETRAS_DO_NOME = 45;
export const VALE_POR_MS = 36 * 60 * 60 * 1000; // produto que nenhuma busca viu em 36 h sai da página
// Produtos guardados antes da regra nova do "baixou" (24/10/2026 15:36 UTC) não aparecem: vale só o que foi conferido depois
const REGRAS_DESDE = Date.UTC(2026, 9, 24, 15, 36);

let tabelaPronta = false;
async function criarTabela(db) {
  if (tabelaPronta) return;
  await db.batch([db.prepare(TABELA), db.prepare(INDICE)]);
  tabelaPronta = true;
}

// Desconto real muito grande em Shopee/AliExpress só com prova de que o produto vende (07/11/2026: bicicleta elétrica do
// AliExpress "-64%", de R$ 23.254 por R$ 8.429, com 1 venda, era a 2ª da página; o preço dela pulava entre os dois)
const DESCONTO_GRANDE = 60;
const VENDAS_PARA_DESCONTO_GRANDE = 10;
const MARKETPLACES = new Set(["shopee", "aliexpress"]);
const semProvaDeVenda = (o) => MARKETPLACES.has(o.loja) && !(o.vendidos >= VENDAS_PARA_DESCONTO_GRANDE);

export function nivelBlackFriday(o) {
  if (!o || o.acessorio || o.parecido || !(o.preco > 0)) return null;
  const h = o.historico;
  if (h?.descontoReal > DESCONTO_GRANDE && semProvaDeVenda(o)) return null;
  if (h?.descontoReal >= DESCONTO_MINIMO && h.descontoReal <= DESCONTO_SUSPEITO) return { nivel: 1, desconto: h.descontoReal };
  if (h?.verificavel) return null; // 21+ dias de histórico e o preço não está abaixo do habitual: não é oferta
  if (h?.caiu >= DESCONTO_MINIMO && h.caiu <= DESCONTO_SUSPEITO) return { nivel: 2, desconto: h.caiu };
  if (o.desconto >= DA_LOJA_MINIMO && o.desconto <= DA_LOJA_MAXIMO) return { nivel: 3, desconto: o.desconto };
  return null;
}

// Guarda os produtos com desconto de uma busca e tira os que esta busca mostrou sem desconto
export async function guardarDaBusca(db, ofertas) {
  if (!db || !ofertas?.length) return 0;
  await criarTabela(db);
  const comNivel = ofertas.map((o) => ({ o, n: nivelBlackFriday(o) }));
  const porLoja = new Map();
  const lojaInformada = comNivel.filter((x) => x.n?.nivel === 3).sort((a, b) => b.n.desconto - a.n.desconto)
    .filter(({ o }) => {
      const n = porLoja.get(o.loja) || 0;
      porLoja.set(o.loja, n + 1);
      return n < DA_LOJA_POR_LOJA;
    }).slice(0, DA_LOJA_POR_BUSCA);
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

// Página da Black Friday: nível 1 primeiro, depois 2, depois 3. Em cada nível as lojas se revezam (o maior desconto de
// cada loja, depois o 2º de cada loja...) e o mesmo produto de vendedores diferentes aparece uma vez só (06/11/2026: o topo
// tinha o mesmo sapatênis 6 vezes, e quase só Shopee)
const VISTAS = `WITH v AS (
    SELECT oferta, nivel, desconto, id, json_extract(oferta, '$.loja') AS loja,
      ROW_NUMBER() OVER (PARTITION BY lower(substr(json_extract(oferta, '$.titulo'), 1, ${LETRAS_DO_NOME}))
        ORDER BY nivel, desconto DESC, id) AS repetido
    FROM bf_ofertas WHERE visto > ?),
  u AS (SELECT *, ROW_NUMBER() OVER (PARTITION BY nivel, loja ORDER BY desconto DESC, id) AS vez FROM v WHERE repetido = 1)`;

export async function listarBlackFriday(db, pagina, porPagina) {
  await criarTabela(db);
  const desde = Math.max(Date.now() - VALE_POR_MS, REGRAS_DESDE);
  const [lista, totais] = await db.batch([
    db.prepare(`${VISTAS} SELECT oferta FROM u ORDER BY nivel, vez, desconto DESC, id LIMIT ? OFFSET ?`)
      .bind(desde, porPagina + 1, (pagina - 1) * porPagina),
    db.prepare(`${VISTAS} SELECT nivel, COUNT(*) AS n FROM u GROUP BY nivel`).bind(desde),
  ]);
  const ofertas = lista.results.slice(0, porPagina).map((r) => JSON.parse(r.oferta));
  const porNivel = Object.fromEntries(totais.results.map((r) => [r.nivel, r.n]));
  return {
    ofertas,
    temMais: lista.results.length > porPagina,
    totais: { real: porNivel[1] || 0, baixou: porNivel[2] || 0, loja: porNivel[3] || 0 },
  };
}

// Só uma marca (?marca=, lib/marcas.js; 10/11/2026): em duas fases, como a busca no banco. 1ª: só o nome e a loja de todas
// as ofertas (leve), para separar as que citam a marca; 2ª: os dados completos só dessas (até `maximo`), na ordem da
// página (nível, depois maior desconto), sem o mesmo produto de vendedores diferentes
export async function listarBlackFridayDaMarca(db, filtro, maximo) {
  await criarTabela(db);
  const desde = Math.max(Date.now() - VALE_POR_MS, REGRAS_DESDE);
  const { results } = await db.prepare(`SELECT id, json_extract(oferta, '$.titulo') AS titulo, json_extract(oferta, '$.lojaNome') AS lojaNome
    FROM bf_ofertas WHERE visto > ? ORDER BY nivel, desconto DESC, id`).bind(desde).all();
  const nomes = new Set();
  const ids = [];
  for (const l of results || []) {
    if (!filtro.cita(l.titulo, l.lojaNome)) continue;
    const nome = String(l.titulo || "").toLowerCase().slice(0, LETRAS_DO_NOME);
    if (nomes.has(nome)) continue;
    nomes.add(nome);
    ids.push(l.id);
  }
  const total = ids.length;
  const escolhidos = ids.slice(0, maximo);
  const POR_VEZ = 90; // o banco aceita até 100 valores por consulta
  const partes = [];
  for (let i = 0; i < escolhidos.length; i += POR_VEZ) partes.push(escolhidos.slice(i, i + POR_VEZ));
  const porId = new Map();
  if (partes.length) {
    const respostas = await db.batch(partes.map((p) => db.prepare(`SELECT id, oferta FROM bf_ofertas WHERE id IN (${p.map(() => "?").join(",")})`).bind(...p)));
    for (const r of respostas) for (const l of r.results || []) porId.set(l.id, JSON.parse(l.oferta));
  }
  return { ofertas: escolhidos.map((id) => porId.get(id)).filter(Boolean), total };
}

// Mercado Livre na Black Friday (pedido do Giovanni, 06/11/2026): os mais vendidos do ML com desconto de 10% a 60%, na ordem
// do ranking de vendas (mercadolivre.ofertasBlackFriday, renovados toda madrugada), entram misturados nas páginas, 1 a cada 3 cartões (24 do ML a cada 48). O histórico nosso do ML
// começou em 04/11: até lá eles são "🏷️ Desconto da loja" (nível 3); com os dias, os das buscas prontas ganham
// "📉 Baixou" e "✅ Desconto real" pelo caminho normal (guardarDaBusca)
export const ML_A_CADA = 3;
export function misturarML(ofertas, doML) {
  const ja = new Set(ofertas.map((o) => o.id));
  const ml = doML.filter((o) => !ja.has(o.id) && nivelBlackFriday(o)).map((o) => ({ ...o, bf: 3 }));
  const saida = [];
  let i = 0;
  for (const o of ofertas) {
    saida.push(o);
    if (++i % (ML_A_CADA - 1) === 0 && ml.length) saida.push(ml.shift());
  }
  return [...saida, ...ml];
}
