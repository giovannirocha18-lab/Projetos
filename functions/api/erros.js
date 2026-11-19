// Erros de digitação que o site APRENDE sozinho (pedido do Giovanni, 19/11/2026: "cada erro novo, ela armazena e corrige").
//   GET  /api/erros  -> { erros: { "parafuzadeira": "parafusadeira", … } }  (a caixa de busca junta aos erros que já conhece)
//   POST /api/erros  { pares: [["errada", "certa"], …] }
// Quem ensina é o próprio site: uma busca veio VAZIA, o site trocou a palavra pela mais parecida das buscas conhecidas
// (buscaCorrigidaPeloVocabulario em app.js) e a busca corrigida trouxe produtos. Daí em diante a palavra é corrigida na hora,
// ao dar espaço, para todo mundo. Nada da pessoa é guardado (o IP só entra no limite por dia, tabela limites).
// O servidor confere cada par antes de guardar, para ninguém ensinar besteira: uma palavra só de cada lado, só letras, a
// certa tem que ser palavra de busca conhecida (ou marca), a errada não pode ser, mesma inicial e no máximo 1 letra de
// diferença (2 em palavra de 9+ letras).
import { dentroDoLimite, ipDe } from "../../lib/conta.js";
import { naoContar } from "../../lib/naoContar.js";
import { normalizar } from "../../lib/texto.js";
import { ERROS, MARCAS, distancia, termosParaSugestoes } from "../../lib/vocabulario.js";
import { tendenciaAceitavel } from "../../lib/buscas.js";

const TABELA = `CREATE TABLE IF NOT EXISTS erros_aprendidos (errada TEXT PRIMARY KEY, certa TEXT NOT NULL, votos INTEGER NOT NULL,
  quando INTEGER NOT NULL) WITHOUT ROWID`;
const PARES_POR_DIA = 20; // por visitante
const MAXIMO_GUARDADO = 5000;
const CACHE_SEGUNDOS = 10 * 60;
const CHAVE_DO_VOCABULARIO = "/api/vocabulario?v=15"; // a mesma de functions/api/vocabulario.js

// Aprendeu errado? Pôr a palavra aqui: ela é apagada do banco e não é mais aprendida
// ("cabeca" entrou num teste de 19/11/2026 como "caneca")
const ESQUECER = ["cabeca"];
// Letra TROCADA por outra (mesmo tamanho, sem ser duas vizinhas invertidas) é o erro mais arriscado ("cabeça" x "caneca"):
// só passa a valer depois de aprendido 2 vezes. Letra faltando, sobrando ou invertida vale na 1ª
const VOTOS_PARA_LETRA_TROCADA = 2;
const letraTrocada = (a, b) => a.length === b.length && [...a].sort().join("") !== [...b].sort().join("");
let tabelaPronta = false;
const limpo = (s) => normalizar(String(s || "")).replace(/[^a-z0-9]+/g, " ").trim();
const vazio = (status = 204) => new Response(null, { status, headers: { "Cache-Control": "no-store" } });

// Palavras das buscas que o site conhece: as do vocabulário guardado (com as tendências e os mais buscados) ou, sem ele, as fixas
async function palavrasConhecidas(request) {
  let termos = termosParaSugestoes();
  try {
    const guardado = typeof caches !== "undefined" && (await caches.default.match(new Request(new URL(CHAVE_DO_VOCABULARIO, request.url))));
    const dados = guardado && (await guardado.json());
    if (dados?.termos?.length) termos = dados.termos;
  } catch { /* fica com as fixas */ }
  const palavras = new Set();
  for (const t of [...termos, ...MARCAS]) for (const p of limpo(t).split(" ")) if (p.length >= 4) palavras.add(p);
  return palavras;
}

// O par pode ser aprendido? (exportada para o teste)
export function parAceitavel(errada, certa, conhecidas) {
  if (!/^[a-z]{4,25}$/.test(errada) || !/^[a-z]{4,25}$/.test(certa) || errada === certa || errada[0] !== certa[0]) return false;
  if (ERROS[errada] || ESQUECER.includes(errada) || !conhecidas.has(certa)) return false;
  if (conhecidas.has(errada) || conhecidas.has(`${errada}s`) || (errada.endsWith("s") && conhecidas.has(errada.slice(0, -1)))) return false;
  if (!tendenciaAceitavel(certa) || !tendenciaAceitavel(errada)) return false;
  const maximo = errada.length >= 9 ? 2 : 1;
  return distancia(errada, certa, maximo) <= maximo;
}

async function criarTabela(db) {
  if (tabelaPronta) return;
  await db.prepare(TABELA).run();
  if (ESQUECER.length) await db.prepare(`DELETE FROM erros_aprendidos WHERE errada IN (${ESQUECER.map(() => "?").join(",")})`).bind(...ESQUECER).run();
  tabelaPronta = true;
}

export async function onRequestGet({ request, env }) {
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const chave = new Request(new URL("/api/erros", request.url));
  const guardada = cache && (await cache.match(chave));
  if (guardada) return guardada;
  let erros = {};
  try {
    await criarTabela(env.DB);
    const { results } = await env.DB.prepare("SELECT errada, certa, votos FROM erros_aprendidos ORDER BY quando DESC LIMIT ?").bind(MAXIMO_GUARDADO).all();
    erros = Object.fromEntries(results.filter((r) => r.votos >= VOTOS_PARA_LETRA_TROCADA || !letraTrocada(r.errada, r.certa)).map((r) => [r.errada, r.certa]));
  } catch { /* sem banco: nada aprendido */ }
  const resposta = new Response(JSON.stringify({ erros }), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": `public, max-age=${CACHE_SEGUNDOS}`, "X-Robots-Tag": "noindex" },
  });
  if (cache) await cache.put(chave, resposta.clone());
  return resposta;
}

export async function onRequestPost({ request, env }) {
  let mesmaOrigem = false;
  try {
    mesmaOrigem = new URL(request.headers.get("Origin") || "").host === new URL(request.url).host;
  } catch { /* Origin ausente ou "null" */ }
  if (!mesmaOrigem) return vazio(403);
  if (!env.DB || naoContar(request)) return vazio();
  let dados;
  try {
    dados = JSON.parse((await request.text()).slice(0, 1000));
  } catch {
    return vazio(400);
  }
  const pares = (Array.isArray(dados?.pares) ? dados.pares : []).slice(0, 3)
    .map((par) => (Array.isArray(par) ? [limpo(par[0]), limpo(par[1])] : null)).filter(Boolean);
  if (!pares.length) return vazio(400);
  try {
    const conhecidas = await palavrasConhecidas(request);
    const bons = pares.filter(([errada, certa]) => parAceitavel(errada, certa, conhecidas));
    if (!bons.length) return vazio();
    if (!(await dentroDoLimite(env.DB, `erro:${ipDe(request)}`, PARES_POR_DIA, 24 * 3600 * 1000).catch(() => true))) return vazio();
    await criarTabela(env.DB);
    // A 1ª correção aprendida para uma palavra fica; a mesma de novo só soma (outra diferente não troca)
    await env.DB.batch(bons.map(([errada, certa]) => env.DB.prepare(
      `INSERT INTO erros_aprendidos (errada, certa, votos, quando) VALUES (?, ?, 1, ?)
       ON CONFLICT (errada) DO UPDATE SET votos = votos + (certa = excluded.certa), quando = excluded.quando`).bind(errada, certa, Date.now())));
    if (typeof caches !== "undefined") await caches.default.delete(new Request(new URL("/api/erros", request.url))).catch(() => {});
  } catch { /* banco fora do ar: o site segue sem aprender */ }
  return vazio();
}
