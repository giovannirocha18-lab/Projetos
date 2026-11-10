// POST /api/clique — conta os cliques que levam às lojas (botões "Comprar", foto do produto, cupom, "Ir para a loja"…)
// (pedido do Giovanni, 03/11/2026: é o clique que gera comissão). O site manda com navigator.sendBeacon, sem atrasar a ida
// à loja. Guarda só contagens por dia: loja + lugar do site, e produto. Nada da pessoa (nem IP) é guardado.
// O robô lê as contagens toda madrugada (robo/numeros-site.mjs, "Números do site").
import { naoContar } from "../../lib/naoContar.js";
import { dentroDoLimite, ipDe } from "../../lib/conta.js";

// Cliques contados por visitante por dia (10/11/2026, revisão: com o Origin copiado dava para inventar cliques sem fim e
// encher as tabelas). O IP só entra na contagem do limite (tabela limites, apagada em 24 h)
const CLIQUES_POR_DIA = 300;

const TABELAS = [
  `CREATE TABLE IF NOT EXISTS cliques (dia TEXT NOT NULL, loja TEXT NOT NULL, onde TEXT NOT NULL, total INTEGER NOT NULL,
     PRIMARY KEY (dia, loja, onde)) WITHOUT ROWID`,
  `CREATE TABLE IF NOT EXISTS cliques_produtos (dia TEXT NOT NULL, oferta_id TEXT NOT NULL, titulo TEXT NOT NULL, loja TEXT NOT NULL,
     total INTEGER NOT NULL, PRIMARY KEY (dia, oferta_id)) WITHOUT ROWID`,
];
// Lugares do site de onde sai o clique (o que vier diferente disso é ignorado)
const LUGARES = new Set(["oferta", "foto", "detalhes", "historico", "comparar", "carrinho", "alerta", "cupom", "loja-parceira", "campanha-shein"]);

let tabelasProntas = false;
const hoje = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const texto = (v, max) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const vazio = (status = 204) => new Response(null, { status, headers: { "Cache-Control": "no-store" } });

export async function onRequestPost({ request, env }) {
  // Só conta o que vem das páginas do próprio site
  // (revisão de segurança de 06/11/2026: sem Origin era aceito, e dava para inventar cliques com qualquer título; e
  // "Origin: null" derrubava com erro 500). O navegador sempre manda o Origin no sendBeacon/POST
  let mesmaOrigem = false;
  try {
    mesmaOrigem = new URL(request.headers.get("Origin") || "").host === new URL(request.url).host;
  } catch { /* Origin ausente ou "null" */ }
  if (!mesmaOrigem) return vazio(403);
  if (!env.DB || naoContar(request)) return vazio(); // aparelho que pediu para não ser contado (lib/naoContar.js)
  let dados;
  try {
    dados = JSON.parse((await request.text()).slice(0, 2000));
  } catch {
    return vazio(400);
  }
  const onde = texto(dados?.onde, 20);
  const loja = texto(dados?.loja, 60);
  if (!LUGARES.has(onde) || !loja) return vazio(400);
  const idDado = texto(dados?.id, 80);
  const id = /^[\w.:-]{3,80}$/.test(idDado) ? idDado : "";
  const titulo = texto(dados?.titulo, 120);
  const dia = hoje();
  try {
    if (!(await dentroDoLimite(env.DB, `clique:${ipDe(request)}`, CLIQUES_POR_DIA, 24 * 3600 * 1000).catch(() => true))) return vazio();
    if (!tabelasProntas) {
      await env.DB.batch(TABELAS.map((t) => env.DB.prepare(t)));
      tabelasProntas = true;
    }
    const contas = [env.DB.prepare(
      `INSERT INTO cliques (dia, loja, onde, total) VALUES (?, ?, ?, 1)
       ON CONFLICT (dia, loja, onde) DO UPDATE SET total = total + 1`).bind(dia, loja, onde)];
    if (id && titulo) {
      contas.push(env.DB.prepare(
        `INSERT INTO cliques_produtos (dia, oferta_id, titulo, loja, total) VALUES (?, ?, ?, ?, 1)
         ON CONFLICT (dia, oferta_id) DO UPDATE SET total = total + 1`).bind(dia, id, titulo, loja));
    }
    await env.DB.batch(contas);
  } catch {
    // Banco fora do ar: o clique não conta, mas a pessoa já foi para a loja
  }
  return vazio();
}

export const onRequestGet = () => vazio(405);
