// Simula uma madrugada inteira do robô da noite (lib/roboNoite.js) com respostas falsas das rotas: as duas trilhas têm que
// passar por todas as fases, respeitar as esperas e terminar; o resumo do painel tem que sair no formato da aba Robô.
// Uso: node testes/robo-noite.mjs
import { TRILHAS, estadoInicial, passo, partesDoPainel, juntarNaExecucao, noiteAtual } from "../lib/roboNoite.js";

let falhas = 0;
const ok = (cond, msg) => { if (!cond) { falhas++; console.log(`✗ ${msg}`); } };

// Rotas falsas
const cont = { arvore: 0, tend: 0, dest: 0, prox: 0, ml: 0, shopee: 0, lomadee: 0, prontas: 0, limite429: 0 };
async function chamar(rota, p) {
  if (rota === "preparar-ml") {
    if (p.arvore) return { arvore: true, faltam: ++cont.arvore < 3 ? 5 : 0 };
    if (p.tendencias) return { tendencias: true, termos: 10, comErro: 0, guardadas: 100, faltam: ++cont.tend < 2 ? 1 : 0 };
    if (p.proxima && p.nivel === 2) return ++cont.dest < 4 ? { categoria: "MLB1", destaques: 20 } : { categoria: null };
    if (p.proxima) {
      cont.prox++;
      if (cont.prox === 3 && !cont.limite429) { cont.limite429 = 1; return { categoria: "MLB9", limite: true }; }
      return cont.prox < 8 ? { categoria: "MLB2", destaques: 30, faltam: 8 - cont.prox } : { categoria: "MLB2", destaques: 30, fim: true };
    }
    cont.ml++;
    const partes = 12;
    if (p.parte >= partes) return { parte: p.parte, partes, fim: true };
    return { parte: p.parte, partes, consultas: 3, precos: 10, fichasComOferta: 2, ofertasNasFichas: 7, proxima: p.parte + 1, fim: p.parte + 1 >= partes, ...(p.parte === 0 ? { fila: 4 } : {}) };
  }
  if (rota === "coletar-precos") { cont.shopee++; return { gravados: 10, erros: [], fim: p.parte >= 4 }; }
  if (rota === "conferir-lojas") { cont.lomadee++; return { comProdutos: [`Marca${p.parte}`], linksQuebrados: [], fim: p.parte >= 2 }; }
  if (rota === "preparar-buscas") { cont.prontas++; return { parte: p.parte, partes: 20, guardada: p.parte !== 5 }; }
  return { falhou: true };
}

// Relógio de mentira: cada passo leva 20 s, mais a espera pedida
let agora = Date.parse("2026-11-10T04:45:00Z");
const estados = Object.fromEntries(TRILHAS.map((t) => [t, estadoInicial(t, agora)]));
for (let i = 0; i < 5000 && TRILHAS.some((t) => estados[t].fase !== "fim"); i++) {
  for (const t of TRILHAS) {
    const e = estados[t];
    if (e.fase === "fim" || e.esperaAte > agora) continue;
    const outra = estados[TRILHAS.find((x) => x !== t)];
    const esperar = await passo(t, e, chamar, agora, outra);
    ok(Number.isFinite(esperar) && esperar >= 0, `${t}/${e.fase}: espera inválida ${esperar}`);
    e.esperaAte = agora + esperar * 1000;
  }
  agora += 20e3;
}
for (const t of TRILHAS) ok(estados[t].fase === "fim", `trilha ${t} não terminou (fase ${estados[t].fase})`);
ok(cont.limite429 === 1 && estados.ml.c.mvEsperas === 1, "espera pelo limite do ML nos mais vendidos");
ok(estados.lojas.c.prontasGuardadas === 19 && estados.lojas.c.prontasPartes === 20, `prontas: ${estados.lojas.c.prontasGuardadas} de ${estados.lojas.c.prontasPartes}`);
ok(estados.lojas.tempos.prontas.de >= estados.ml.tempos.maisvendidos.de, "as prontas só começam depois que o ML chega nos mais vendidos");
ok(estados.ml.c.fila === 4, "fila do ML anotada");

const partes = partesDoPainel(estados.ml, estados.lojas);
ok(partes.map((p) => p.chave).join() === "shopee,ml,mv,prontas,lomadee", `partes: ${partes.map((p) => p.chave)}`);
ok(partes.find((p) => p.chave === "prontas").linhas[0] === "19 de 20 buscas guardadas", "linha das prontas no formato do painel");
ok(partes.every((p) => ["ok", "aviso"].includes(p.situacao) && Array.isArray(p.linhas) && Array.isArray(p.avisos)), "situação das partes");
ok(partes.find((p) => p.chave === "lomadee").linhas[0] === "3 marcas com produtos", "marcas da Lomadee");

// Junta com o que o GitHub gravou (awin, ia, auditoria): na ordem do painel, sem repetir
const juntas = juntarNaExecucao([{ chave: "awin" }, { chave: "ia" }, { chave: "prontas", velha: true }], partes);
ok(juntas.map((p) => p.chave).join() === "awin,shopee,ml,mv,prontas,lomadee,ia" && !juntas.some((p) => p.velha), `juntas: ${juntas.map((p) => p.chave)}`);

// Janela da madrugada
ok(noiteAtual(Date.parse("2026-11-10T04:44:00Z")) === null, "antes da janela");
ok(noiteAtual(Date.parse("2026-11-10T05:00:00Z")) === "2026-11-10", "dentro da janela");
ok(noiteAtual(Date.parse("2026-11-10T10:00:00Z")) === null, "depois da janela");
ok(noiteAtual(Date.parse("2026-11-10T15:00:00Z"), { noite: "manual-x", ate: Date.parse("2026-11-10T16:00:00Z") }) === "manual-x", "rodada manual");

console.log(falhas ? `✗ ${falhas} falha(s)` : `✓ robô da noite: as 2 trilhas terminam (${Math.round((agora - Date.parse("2026-11-10T04:45:00Z")) / 6e4)} min simulados)`);
process.exitCode = falhas ? 1 : 0;
