// Monitor das buscas dos visitantes (pedido do Giovanni, 21/11/2026: "um monitor por trás do site para acompanhar tudo que é
// digitado e o que vem de resultado, para achar defeito; conforme vêm os defeitos, você vai consertando no outro dia").
// Guarda por DIA, para cada busca feita por visitante: quantas vezes, quantas ofertas vieram, quantas ficaram à mostra e o
// problema visto ("vazia", "sem o produto", "poucas", "lenta"). E os erros de tela (JavaScript) que o navegador mandar.
// Nada da pessoa é guardado (nem IP): só o texto da busca e contagens. Fica 14 dias.
// Quem lê: GET /api/sinais?dia=AAAA-MM-DD (a conferência da madrugada do Claude) e o painel.
import { normalizar } from "./texto.js";
import { tendenciaAceitavel } from "./buscas.js";

const TABELAS = [
  `CREATE TABLE IF NOT EXISTS sinais_busca (dia TEXT NOT NULL, q TEXT NOT NULL, cat TEXT NOT NULL, vezes INTEGER NOT NULL,
     total INTEGER NOT NULL, mostra INTEGER, ms INTEGER, problema TEXT NOT NULL, lojas_erro TEXT, PRIMARY KEY (dia, q, cat)) WITHOUT ROWID`,
  `CREATE TABLE IF NOT EXISTS erros_tela (dia TEXT NOT NULL, msg TEXT NOT NULL, onde TEXT NOT NULL, vezes INTEGER NOT NULL,
     PRIMARY KEY (dia, msg, onde)) WITHOUT ROWID`,
];
const DIAS_GUARDADOS = 14;
export const POUCAS_A_MOSTRA = 10;
export const LENTA_MS = 6000;
const hoje = (agora = Date.now()) => new Date(agora).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const diaAntes = (dias, agora = Date.now()) => hoje(agora - dias * 864e5);
// Texto que pode ser dado pessoal (telefone, CPF, e-mail) não é guardado
const PARECE_PESSOAL = /(\d[\s.\-]?){8,}|@/;

// O problema de uma busca, pelo que veio: "" = nenhum. parcial = 1ª tela com lojas atrasadas (o resto chega depois)
export function problemaDaBusca({ total, mostra, bate, ms, parcial }) {
  if (!total) return "vazia";
  if (parcial) return "";
  if (bate === 0) return "sem o produto";
  if (mostra !== undefined && mostra < POUCAS_A_MOSTRA) return "poucas";
  if (ms > LENTA_MS) return "lenta";
  return "";
}

// contar = false: só completa os números de uma busca já contada (a resposta feita na hora traz mais detalhe que a guardada)
export async function anotarSinal(env, { q, cat = "", total = 0, mostra, bate, ms, parcial, lojasErro = "" }, { contar = true, agora = Date.now() } = {}) {
  const termo = normalizar(q).trim();
  if (!env.DB || termo.length < 2 || termo.length > 80 || PARECE_PESSOAL.test(String(q)) || PARECE_PESSOAL.test(termo)) return;
  const problema = problemaDaBusca({ total, mostra, bate, ms, parcial });
  await env.DB.batch([
    ...TABELAS.map((t) => env.DB.prepare(t)),
    env.DB.prepare(`INSERT INTO sinais_busca (dia, q, cat, vezes, total, mostra, ms, problema, lojas_erro) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (dia, q, cat) DO UPDATE SET vezes = vezes + ?, total = excluded.total, mostra = COALESCE(excluded.mostra, mostra),
        ms = COALESCE(excluded.ms, ms), lojas_erro = COALESCE(excluded.lojas_erro, lojas_erro),
        problema = CASE WHEN excluded.problema != '' OR excluded.mostra IS NOT NULL THEN excluded.problema ELSE problema END`)
      .bind(hoje(agora), termo, String(cat || "").slice(0, 40), contar ? 1 : 0, total, mostra ?? null, ms ?? null, problema, lojasErro || null, contar ? 1 : 0),
    ...(Math.random() < 0.01 ? [env.DB.prepare("DELETE FROM sinais_busca WHERE dia < ?").bind(diaAntes(DIAS_GUARDADOS, agora)),
      env.DB.prepare("DELETE FROM erros_tela WHERE dia < ?").bind(diaAntes(DIAS_GUARDADOS, agora))] : []),
  ]);
}

const MAX_ERROS_POR_DIA = 300; // mensagens diferentes; além disso o dia não aceita mais (ninguém enche a tabela)
export async function anotarErroDeTela(env, msg, onde, agora = Date.now()) {
  const m = String(msg || "").replace(/\s+/g, " ").trim().slice(0, 200);
  const o = String(onde || "").replace(/\s+/g, " ").trim().slice(0, 80);
  if (!env.DB || m.length < 3 || PARECE_PESSOAL.test(m)) return;
  const dia = hoje(agora);
  await env.DB.batch(TABELAS.map((t) => env.DB.prepare(t)));
  const ja = await env.DB.prepare("SELECT COUNT(*) AS n FROM erros_tela WHERE dia = ?").bind(dia).first();
  if ((ja?.n || 0) >= MAX_ERROS_POR_DIA) return;
  await env.DB.prepare(`INSERT INTO erros_tela (dia, msg, onde, vezes) VALUES (?, ?, ?, 1)
    ON CONFLICT (dia, msg, onde) DO UPDATE SET vezes = vezes + 1`).bind(dia, m, o).run();
}

// Resumo de um dia (padrão: ontem e hoje juntos não; um dia por vez). Só buscas que passam no filtro das tendências
// (termo impróprio não sai daqui)
export async function resumoDosSinais(env, dia, agora = Date.now()) {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(dia || "") ? dia : hoje(agora);
  if (!env.DB) return { dia: d, buscas: 0, comProblema: [], errosDeTela: [] };
  await env.DB.batch(TABELAS.map((t) => env.DB.prepare(t)));
  const [totais, problemas, erros] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS termos, COALESCE(SUM(vezes), 0) AS vezes, SUM(problema != '') AS ruins FROM sinais_busca WHERE dia = ?").bind(d).first(),
    env.DB.prepare(`SELECT q, cat, vezes, total, mostra, ms, problema, lojas_erro FROM sinais_busca WHERE dia = ? AND problema != ''
      ORDER BY vezes DESC, total ASC LIMIT 200`).bind(d).all(),
    env.DB.prepare("SELECT msg, onde, vezes FROM erros_tela WHERE dia = ? ORDER BY vezes DESC LIMIT 40").bind(d).all(),
  ]);
  return {
    dia: d, buscas: totais?.vezes || 0, termos: totais?.termos || 0, termosComProblema: totais?.ruins || 0,
    comProblema: (problemas.results || []).filter((r) => tendenciaAceitavel(r.q)).slice(0, 120)
      .map((r) => ({ q: r.q, ...(r.cat && { cat: r.cat }), vezes: r.vezes, problema: r.problema, total: r.total, ...(r.mostra !== null && { mostra: r.mostra }),
        ...(r.ms && { ms: r.ms }), ...(r.lojas_erro && { lojasErro: r.lojas_erro }) })),
    errosDeTela: erros.results || [],
  };
}
