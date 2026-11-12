// Robô de casar produtos (lib/casar.js): a chave do modelo, quais pares perguntar e um passo inteiro com banco e IA de
// mentira (grava os vereditos, não pergunta de novo, respeita o teto). Uso: node testes/casar.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { chaveDaOferta, chaveDoModelo, gruposDaBusca, proximoPar, idDoPar, passoDeCasar, casadosDaBusca, casadosDosIds, BUSCAS_EXTRAS } from "../lib/casar.js";

let falhas = 0;
const ok = (cond, msg) => { if (!cond) { falhas++; console.log(`✗ ${msg}`); } };

// Chave do modelo
ok(chaveDoModelo("Geladeira Brastemp Frost Free 375L BRM45JB Inox 127V") === "brastemp|brm45jb", `chave: ${chaveDoModelo("Geladeira Brastemp Frost Free 375L BRM45JB Inox 127V")}`);
ok(chaveDoModelo("Smart TV 50 polegadas Samsung M75H 4K") !== chaveDoModelo("Smart TV 65 polegadas Samsung M75H 4K"), "TV: tamanho da tela na chave");
ok(/\|combo\|/.test(chaveDoModelo("Samsung Smart Tv 50 M75h + Samsung Smart Tv 43 Q5f7") || ""), "combo tem chave própria");
ok(chaveDoModelo("Geladeira Frost Free 375L Inox") === null, "sem marca ou sem código: sem chave");

// Grupos e pares
const of = (id, loja, preco, titulo = "Geladeira Brastemp BRM45JB 375L") => ({ id, loja, preco, titulo, bate: true, secao: "Eletrodomésticos" });
const ofertas = [of("a-1", "a", 3000), of("a-2", "a", 3500), of("b-1", "b", 3100), of("c-1", "c", 900), of("d-1", "d", 3200),
  of("e-1", "e", 500, "Micro-ondas Electrolux ME36S 36L"), { ...of("f-1", "f", 3000), acessorio: true }, { ...of("g-1", "g", 3000), secao: "Moda feminina" }];
const grupos = gruposDaBusca(ofertas);
ok(grupos.length === 1 && grupos[0].map((o) => o.id).join() === "c-1,a-1,b-1,d-1", `grupos: ${JSON.stringify(grupos.map((g) => g.map((o) => o.id)))}`);
const v = new Map();
const par = (m) => { const p = proximoPar(grupos[0], m); return p ? `${p.a.id}~${p.b.id}` : null; };
ok(par(v) === "c-1~a-1", `1º par: ${par(v)}`);
v.set(idDoPar("c-1", "a-1"), "diferente"); v.set(idDoPar("c-1", "b-1"), "diferente"); v.set(idDoPar("c-1", "d-1"), "nao_sei");
ok(par(v) === "a-1~b-1", `depois de separar a peça: ${par(v)}`);
v.set(idDoPar("a-1", "b-1"), "igual"); v.set(idDoPar("a-1", "d-1"), "igual_outra_voltagem");
ok(par(v) === null, `a=b e a=d: b com d não precisa de pergunta (${par(v)})`);

// Um passo inteiro: banco de mentira (SQLite) com a cara do D1 e IA de mentira (c-1 é uma peça: diferente de todos)
const sqlite = new DatabaseSync(":memory:");
const comando = (sql, args = []) => ({
  sql, args,
  bind: (...a) => comando(sql, a),
  all: async () => ({ results: sqlite.prepare(sql).all(...args) }),
  run: async () => sqlite.prepare(sql).run(...args),
});
const DB = { prepare: (sql) => comando(sql), batch: async (lista) => lista.map((c) => (/^\s*SELECT/i.test(c.sql) ? { results: sqlite.prepare(c.sql).all(...c.args) } : (sqlite.prepare(c.sql).run(...c.args), { results: [] }))) };
let perguntas = 0;
const pedir = async (_url, opcoes) => {
  perguntas++;
  const texto = JSON.parse(opcoes.body).messages[0].content;
  const veredito = /R\$ 900:/.test(texto) ? "diferente" : /R\$ 3200:/.test(texto) ? "igual_outra_voltagem" : "igual";
  return { ok: true, json: async () => ({ content: [{ type: "text", text: JSON.stringify({ veredito, motivo: "teste" }) }], usage: { input_tokens: 400, output_tokens: 30 } }) };
};
const env = { DB, ANTHROPIC_API_KEY: "chave-de-teste" };
const r1 = await passoDeCasar(env, { q: "Geladeira  Brastemp" }, async () => ofertas, { pedir });
ok(r1.perguntados === 5 && r1.iguais === 2 && r1.diferentes === 3 && !r1.resta && !r1.erros, `1º passo: ${JSON.stringify(r1)}`);
const r2 = await passoDeCasar(env, { q: "geladeira brastemp" }, async () => ofertas, { pedir });
ok(r2.perguntados === 0 && perguntas === 5, `2º passo não pergunta de novo: ${JSON.stringify(r2)}`);
const lidos = await casadosDaBusca(DB, " GELADEIRA brastemp ");
ok(lidos.length === 5 && lidos.filter((p) => p[2] === 1).length === 2 && lidos.every((p) => p.length === 3), `o que o site lê: ${JSON.stringify(lidos)}`);
ok((await casadosDaBusca(DB, "fogão")).length === 0, "busca sem pares: lista vazia");
// Pelo que o site tem na tela (ids): só os pares entre eles, venham de que busca vierem
const porIds = await casadosDosIds(DB, ["a-1", "b-1", "c-1", "zz-9"]);
ok(porIds.length === 3 && porIds.filter((p) => p[2] === 1).length === 1, `por ids: ${JSON.stringify(porIds)}`);
ok((await casadosDosIds(DB, ["a-1"])).length === 0 && (await casadosDosIds(DB, ["a-1", "x|y", ""])).length === 0, "por ids: menos de 2 válidos = nada");
ok(BUSCAS_EXTRAS.includes("smart tv 55") && BUSCAS_EXTRAS.includes("fogão") && new Set(BUSCAS_EXTRAS).size === BUSCAS_EXTRAS.length, "buscas extras sem repetição");
// Seção que só vale conferida (Informática) entra nos grupos do robô
ok(gruposDaBusca([{ ...of("n-1", "a", 3000, "Notebook Dell Inspiron I15-3520"), secao: "Informática" }, { ...of("n-2", "b", 3100, "Notebook Dell I15-3520 16GB"), secao: "Informática" }]).length === 1, "Informática entra no robô");
// Sem saldo para gastar: não pergunta e avisa que resta
const r3 = await passoDeCasar(env, { q: "outra" }, async () => ofertas.map((o) => ({ ...o, id: `x${o.id}` })), { pedir, teto: 0 });
ok(r3.perguntados === 0 && r3.resta, `teto zerado: ${JSON.stringify(r3)}`);
// IA fora do ar: conta o erro e não grava veredito
const r4 = await passoDeCasar(env, { q: "outra" }, async () => ofertas.map((o) => ({ ...o, id: `x${o.id}` })), { pedir: async () => ({ ok: false, status: 401, text: async () => "chave inválida" }) });
ok(r4.erros === 1 && /401/.test(r4.ultimoErro) && (await casadosDaBusca(DB, "outra")).length === 0, `IA com erro: ${JSON.stringify(r4)}`);
ok((await passoDeCasar({ DB }, { q: "x" }, async () => [])).erro, "sem chave: erro");

// Pares por nome (celular, smartwatch, console): marca + modelo + armazenamento
const cel = (titulo, secao = "Celulares") => chaveDaOferta({ titulo, secao });
ok(cel("Smartphone Samsung Galaxy A15 128GB 4GB RAM Câmera Tripla 50MP Tela 6,5\" 5G") === "samsung|nome|a15|128gb", `celular: ${cel("Smartphone Samsung Galaxy A15 128GB 4GB RAM Câmera Tripla 50MP Tela 6,5\" 5G")}`);
ok(cel("Celular Samsung Galaxy A15 4G 128gb 4gb Ram Dual Sim Azul SM-A155M") === "samsung|nome|a15|128gb", "celular: código do fabricante não entra");
ok(cel("Samsung Galaxy A15 256GB") !== cel("Samsung Galaxy A15 128GB") && cel("Samsung Galaxy A16 128GB") !== cel("Samsung Galaxy A15 128GB"), "celular: armazenamento e modelo separam");
ok(cel("Celular Motorola Edge 60 Pro 256GB") !== cel("Celular Motorola Edge 60 256GB"), "celular: Pro separa");
ok(cel("Samsung Galaxy S26+ 256GB Câm. Tripla 50+12+10MP") === cel("Samsung Galaxy S26 Plus 5G 256GB 12GB RAM"), `S26+ = S26 Plus: ${cel("Samsung Galaxy S26+ 256GB Câm. Tripla 50+12+10MP")}`);
ok(cel("Kit 2 Celulares Samsung Galaxy A15 128GB") === null && cel("Celular Samsung bom e barato") === null, "kit e nome sem modelo: sem chave");
ok(cel("Geladeira Brastemp Frost Free 375 litros 2 portas", "Eletrodomésticos") === null, "eletrodoméstico nunca é juntado pelo nome");
ok(cel("Console Sony Playstation 5 Slim 1TB Branco", "Games") === "playstation|nome|5+slim|1tb", `console: ${cel("Console Sony Playstation 5 Slim 1TB Branco", "Games")}`);
// A cópia do site é igual à do robô
const trecho = (arq) => (readFileSync(new URL(arq, import.meta.url), "utf8").match(/\/\/ >>> nomeDoModelo[\s\S]*?\/\/ <<< nomeDoModelo/) || [""])[0];
ok(trecho("../lib/casar.js").length > 500 && trecho("../lib/casar.js") === trecho("../public/assets/app.js"), "nomeDoModelo de app.js igual à de lib/casar.js");

console.log(falhas ? `✗ ${falhas} falha(s)` : "✓ robô de casar: tudo certo");
process.exitCode = falhas ? 1 : 0;
