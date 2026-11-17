// Buscas com poucos resultados (15/11/2026, Giovanni: "somando as lojas temos milhões de produtos, então uma busca com
// pouco resultado tem que ser investigada e corrigida automaticamente").
// 1. Toda busca comum (visitante ou robô das prontas, 1ª página, site todo) com menos de POUCAS_MIN ofertas é anotada
//    aqui, com as lojas que falharam (functions/api/buscar.js).
// 2. Na madrugada, a fase "poucas" do robô da noite (lib/roboNoite.js → rota "rever-poucas" em functions/api/robo-noite.js)
//    refaz cada uma como o robô das prontas (mais tempo por loja, Shopee com nova tentativa) e guarda como busca pronta.
//    Melhorou: resolvido sozinho. Continua pouca: fica o diagnóstico (lojas em erro, quantas viraram acessório/parecido,
//    quantas são de outra categoria) para o Claude corrigir a regra na conferência da madrugada (CLAUDE.md).
import { normalizar } from "./texto.js";

export const POUCAS_MIN = 30;
const VALE_MS = 14 * 864e5; // termo não buscado de novo em 14 dias sai da lista
const REVER_DE_NOVO_MS = 3 * 864e5; // revista e ainda pouca: só volta à fila depois de 3 dias (ou se buscarem de novo)

const TABELA = `CREATE TABLE IF NOT EXISTS buscas_poucas (termo TEXT PRIMARY KEY, total INTEGER, lojas_erro TEXT, vezes INTEGER,
  primeira INTEGER, ultima INTEGER, revista INTEGER, depois INTEGER, diagnostico TEXT)`;

// Palavras inventadas nos testes de velocidade de 16/11 (Giovanni, 17/11: "pode apagar"): nunca entram e saem da lista
const TERMOS_DE_TESTE = ["qqwwzz teste um", "trambolhex 9000", "zorbflux nimbo", "vvbbnnmm", "qwzzkx plorb", "zzkkjjqq", "xyzqwk blorf"];
const apagarTestes = (env) => env.DB.prepare(`DELETE FROM buscas_poucas WHERE termo IN (${TERMOS_DE_TESTE.map(() => "?").join(",")})`)
  .bind(...TERMOS_DE_TESTE);

// Lojas que falharam nesta resposta, só os nomes (o texto do erro fica de fora)
export const lojasEmErro = (lojas) => Object.entries(lojas || {}).filter(([, l]) => l && !l.ok).map(([nome]) => nome);

export async function anotarPoucas(env, q, ofertas, lojas, agora = Date.now()) {
  const termo = normalizar(q).trim();
  if (!env.DB || termo.length < 3 || termo.length > 60 || TERMOS_DE_TESTE.includes(termo)) return;
  await env.DB.batch([
    env.DB.prepare(TABELA),
    env.DB.prepare(`INSERT INTO buscas_poucas (termo, total, lojas_erro, vezes, primeira, ultima) VALUES (?, ?, ?, 1, ?, ?)
      ON CONFLICT (termo) DO UPDATE SET total = excluded.total, lojas_erro = excluded.lojas_erro, vezes = vezes + 1, ultima = excluded.ultima`)
      .bind(termo, ofertas.length, lojasEmErro(lojas).join(","), agora, agora),
    ...(Math.random() < 0.02 ? [env.DB.prepare("DELETE FROM buscas_poucas WHERE ultima < ?").bind(agora - VALE_MS)] : []),
  ]);
}

// A busca voltou com bastante oferta (visitante ou robô): sai da lista
export async function tirarDasPoucas(env, q) {
  const termo = normalizar(q).trim();
  if (!env.DB || !termo) return;
  await env.DB.prepare("DELETE FROM buscas_poucas WHERE termo = ?").bind(termo).run().catch(() => {});
}

// Próxima da fila: nunca revista, ou buscada de novo depois da revisão, ou revista há 3 dias+ (mais buscadas primeiro)
export async function proximaPouca(env, agora = Date.now()) {
  if (!env.DB) return null;
  try {
    await apagarTestes(env).run();
    return await env.DB.prepare(`SELECT termo, total FROM buscas_poucas WHERE ultima > ?
      AND (revista IS NULL OR ultima > revista OR revista < ?) ORDER BY vezes DESC, ultima DESC LIMIT 1`)
      .bind(agora - VALE_MS, agora - REVER_DE_NOVO_MS).first();
  } catch { return null; } // a tabela nasce na 1ª anotação
}

export async function marcarRevista(env, termo, depois, diagnostico, agora = Date.now()) {
  await env.DB.prepare("UPDATE buscas_poucas SET revista = ?, depois = ?, diagnostico = ? WHERE termo = ?")
    .bind(agora, depois, diagnostico, termo).run();
}

// O que ainda não se resolveu (para a aba Robô e para a conferência da madrugada)
export async function poucasSemSolucao(env, limite = 30) {
  if (!env.DB) return [];
  try {
    await apagarTestes(env).run();
    const { results } = await env.DB.prepare(`SELECT termo, total, depois, vezes, diagnostico FROM buscas_poucas
      WHERE revista IS NOT NULL AND depois < ? ORDER BY vezes DESC, ultima DESC LIMIT ?`).bind(POUCAS_MIN, limite).all();
    return results;
  } catch { return []; }
}

// Diagnóstico de uma resposta refeita: por que veio pouco
export function diagnosticar(dados) {
  const ofertas = dados?.ofertas || [];
  const erro = lojasEmErro(dados?.lojas);
  const acessorios = ofertas.filter((o) => o.acessorio).length;
  const produtos = ofertas.length - acessorios;
  const partes = [];
  if (erro.length) partes.push(`lojas em erro: ${erro.join(", ")}`);
  if (dados?.foraDaCategoria) partes.push("fora da categoria");
  partes.push(`${produtos} produtos e ${acessorios} acessórios/parecidos`);
  if (!ofertas.length) partes.push("nenhuma loja achou nada (termo errado ou produto que não existe?)");
  return partes.join("; ");
}
