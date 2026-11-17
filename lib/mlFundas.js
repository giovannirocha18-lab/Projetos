// Buscas fundas do Mercado Livre (17/11/2026, print do Giovanni: "smartphone samsung" com 24 produtos do ML; "pode aumentar;
// se necessário reestruture o robô do ML"). O ML só nos dá o catálogo (uma ficha por modelo) e cada preço custa uma consulta,
// então não cabe em todas as ~1.900 buscas da noite: nestas (as mais procuradas) o robô pede até FICHAS_FUNDAS fichas e o
// preço de TODAS (fase "fundas" da trilha ml em lib/roboNoite.js, /api/preparar-ml?fundas=1). As outras seguem com 96 fichas
// e 24 com preço. Ordem = prioridade; depois vêm produto + marca, as mais buscadas no site e as buscas prontas.
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
// "Produto + marca" (17/11/2026): o catálogo do ML responde mal a palavra solta ("celular" 7 produtos com preço, "tablet" 0)
// e bem à frase completa ("smartphone samsung" 47). Pedido do Giovanni: buscar pela frase completa ("geladeira brastemp"…),
// guardar tudo e, quando alguém buscar só "geladeira", ler do grupo (listaDoBanco em lib/fontes/mercadolivre.js junta os
// catálogos guardados que começam pela busca). As combinações são as do comparador (CATEGORIAS_PARA_CASAR em lib/casar.js)
import { CATEGORIAS_PARA_CASAR } from "./casar.js";
export function produtosComMarca() {
  const filas = Object.values(CATEGORIAS_PARA_CASAR).map((c) => c.marcas.flatMap(([produtos, marcas]) => produtos.flatMap((p) => marcas.map((m) => `${p} ${m}`))));
  // Uma de cada categoria por vez, para nenhuma ficar para o fim
  const lista = [];
  for (let i = 0; filas.some((f) => i < f.length); i++) for (const f of filas) if (i < f.length) lista.push(f[i]);
  return lista;
}

// Tamanho da lista (cada busca custa ~150 consultas ao ML e ~25 s; por noite cabem umas 300: a fase começa pelas que
// estão há mais tempo sem passar, então a lista inteira roda a cada 2 ou 3 noites)
export const TOTAL_DE_FUNDAS = 900;

// A lista: as fixas, produto + marca, as mais buscadas no site e depois as buscas prontas, na ordem delas (sem repetir),
// até o total. corrigir = corrigirBusca(...).q; aceita = filtro das tendências
export function listaDasFundas(outras = [], corrigir = (t) => t, aceita = () => true, total = TOTAL_DE_FUNDAS) {
  const vistos = new Set();
  const lista = [];
  for (const t of [...BUSCAS_FUNDAS, ...produtosComMarca(), ...outras.filter(aceita)]) {
    if (lista.length >= total) break;
    const q = corrigir(String(t || "").trim().toLowerCase());
    if (q.length < 3 || vistos.has(q)) continue;
    vistos.add(q);
    lista.push(q);
  }
  return lista;
}

// Qual busca funda fazer agora: a que está há mais tempo sem passar (a que nunca passou primeiro, na ordem da lista);
// a que passou há menos de REFAZER_MS já está em dia. Busca que rende pouco não gasta o tempo da noite: a que veio com menos
// de FUNDA_FRACA produtos com preço em 2 rodadas seguidas fica 7 dias de fora (Giovanni: "se geladeira der erro vindo 0, sai
// da lista?" — uma noite ruim não tira ninguém; rodada boa zera; erro do ML não conta). Sair daqui não tira nada do site: a
// busca segue no robô normal e nos mais vendidos
export const FUNDA_FRACA = 8;
const SEGUIDAS_PARA_SAIR = 2;
const DE_FORA_MS = 7 * 864e5;
export const REFAZER_MS = 20 * 3600e3;
const TABELA = `CREATE TABLE IF NOT EXISTS ml_fundas2 (termo TEXT PRIMARY KEY, produtos INTEGER NOT NULL, seguidas INTEGER NOT NULL DEFAULT 0,
  quando INTEGER NOT NULL)`;
export function proximaFunda(termos, estado, agora = Date.now()) {
  let fracas = 0;
  const faltam = [];
  termos.forEach((t, i) => {
    const e = estado.get(t);
    if (e && e.seguidas >= SEGUIDAS_PARA_SAIR && agora - e.quando < DE_FORA_MS) { fracas++; return; }
    if (!e || agora - e.quando >= REFAZER_MS) faltam.push({ t, i, quando: e?.quando || 0 });
  });
  faltam.sort((a, b) => a.quando - b.quando || a.i - b.i);
  return { busca: faltam[0]?.t || null, faltam: faltam.length, fracas };
}
export async function estadoDasFundas(db) {
  const estado = new Map();
  try {
    await db.prepare(TABELA).run();
    const { results } = await db.prepare("SELECT termo, produtos, seguidas, quando FROM ml_fundas2").all();
    for (const r of results || []) estado.set(r.termo, r);
  } catch { /* banco fora do ar: segue com a lista inteira */ }
  return estado;
}
// produtos = null: a busca deu erro (não é limite): só marca a hora, para a fase não insistir nela
export async function anotarFunda(db, termo, produtos, agora = Date.now()) {
  try {
    await db.prepare(TABELA).run();
    if (produtos === null) {
      await db.prepare(`INSERT INTO ml_fundas2 (termo, produtos, seguidas, quando) VALUES (?1, 0, 0, ?2)
        ON CONFLICT(termo) DO UPDATE SET quando = excluded.quando`).bind(termo, agora).run();
      return;
    }
    const fraca = (Number(produtos) || 0) < FUNDA_FRACA ? 1 : 0;
    await db.prepare(`INSERT INTO ml_fundas2 (termo, produtos, seguidas, quando) VALUES (?1, ?2, ?3, ?4)
      ON CONFLICT(termo) DO UPDATE SET produtos = excluded.produtos, seguidas = CASE WHEN ?3 = 0 THEN 0 ELSE seguidas + 1 END,
        quando = excluded.quando`).bind(termo, Number(produtos) || 0, fraca, agora).run();
  } catch { /* banco fora do ar: segue */ }
}
