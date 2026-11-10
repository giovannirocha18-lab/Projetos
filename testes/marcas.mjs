// Teste do filtro de marca feito no servidor (lib/marcas.js; Black Friday e páginas de loja com ?marca=).
// Rodar depois de mexer em lib/marcas.js, lib/blackfriday.js, functions/api/black-friday.js ou functions/api/lojas.js
// e nas listas MARCA_APELIDOS / LOJAS_QUE_SAO_MARCA de public/assets/app.js:   node testes/marcas.mjs
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { filtroDeMarca, MARCA_APELIDOS, LOJAS_QUE_SAO_MARCA } from "../lib/marcas.js";
import { listarBlackFridayDaMarca, guardarDaBusca } from "../lib/blackfriday.js";

let falhas = 0;
const ok = (certo, texto) => { if (!certo) { falhas++; console.log(`✗ ${texto}`); } };

// ---- As cópias das listas do site continuam iguais às de app.js
const app = readFileSync(resolve(import.meta.dirname, "../public/assets/app.js"), "utf8");
const doApp = (nome) => new Function(`return (${app.match(new RegExp(`const ${nome} = (\\{[^}]*\\});`))[1]})`)();
ok(JSON.stringify(doApp("MARCA_APELIDOS")) === JSON.stringify(MARCA_APELIDOS), "MARCA_APELIDOS de lib/marcas.js igual à de app.js");
ok(JSON.stringify(doApp("LOJAS_QUE_SAO_MARCA")) === JSON.stringify(LOJAS_QUE_SAO_MARCA), "LOJAS_QUE_SAO_MARCA de lib/marcas.js igual à de app.js");

// ---- A peneira
ok(filtroDeMarca("texto qualquer") === null && filtroDeMarca("") === null, "marca fora da lista não é aceita");
const brastemp = filtroDeMarca("brastemp");
ok(brastemp.cita("Geladeira BRASTEMP Frost Free 375L") && !brastemp.cita("Geladeira Consul 340L"), "Brastemp pelo nome");
const apple = filtroDeMarca("apple");
ok(apple.cita("iPhone 15 128GB") && apple.cita("Apple Watch SE") && !apple.cita("Capa Pineapple"), "Apple pelos apelidos, só palavra inteira");
const britania = filtroDeMarca("britania");
ok(britania?.cita("Fritadeira BRITÂNIA 4L") && britania.cita("Ventilador Britania"), "Britânia com e sem acento");
ok(filtroDeMarca("o boticario")?.cita("Malbec O Boticário 100ml"), "marca de duas palavras");
const karsten = filtroDeMarca("karsten");
ok(karsten.cita("Toalha de Banho Fio Penteado", "Karsten") && !karsten.cita("Toalha de Banho", "Teka"), "loja que é marca: produto sem marca no nome");

// ---- Black Friday de uma marca (banco SQLite na memória no lugar do D1)
function d1(sqlite) {
  const comando = (sql, valores = []) => ({
    bind: (...v) => comando(sql, v),
    all: async () => ({ results: sqlite.prepare(sql).all(...valores) }),
    first: async () => sqlite.prepare(sql).get(...valores) ?? null,
    run: async () => { sqlite.prepare(sql).run(...valores); return {}; },
  });
  return { prepare: (sql) => comando(sql), batch: async (lista) => Promise.all(lista.map((c) => c.all())) };
}
const db = d1(new DatabaseSync(":memory:"));
const oferta = (id, titulo, desconto, extra = {}) => ({ id, titulo, loja: "awin", lojaNome: "Efacil", preco: 100, desconto, ...extra });
const ofertas = [];
for (let i = 0; i < 300; i++) ofertas.push(oferta(`s${i}`, `Smart TV Samsung ${i} Polegadas`, 20, { historico: { descontoReal: 10 + (i % 40) } }));
for (let i = 0; i < 200; i++) ofertas.push(oferta(`l${i}`, `Smart TV LG ${i} Polegadas`, 20, { historico: { descontoReal: 15 } }));
ofertas.push(oferta("b1", "Geladeira Brastemp Frost Free Duplex 375 Litros Inox BRM45", 20, { historico: { descontoReal: 30 } }));
ofertas.push(oferta("b2", "Geladeira Brastemp Frost Free Duplex 375 Litros Inox BRM45 220V", 20, { historico: { descontoReal: 12 } })); // mesmo começo do nome
ofertas.push(oferta("b3", "Micro-ondas Brastemp 32 Litros", 20, { historico: { caiu: 8 } }));
ofertas.push(oferta("g1", "Smartphone Galaxy A55", 20, { historico: { descontoReal: 9 }, lojaNome: "Kabum" }));
await guardarDaBusca(db, ofertas);

const daBrastemp = await listarBlackFridayDaMarca(db, brastemp, 240);
ok(daBrastemp.total === 2 && daBrastemp.ofertas.map((o) => o.id).join() === "b1,b3", `Brastemp: 2 produtos, sem o repetido, desconto real antes (veio ${daBrastemp.ofertas.map((o) => o.id)})`);
const daSamsung = await listarBlackFridayDaMarca(db, filtroDeMarca("samsung"), 240);
ok(daSamsung.total === 301 && daSamsung.ofertas.length === 240, `Samsung: 301 ao todo (com o Galaxy), 240 na resposta (veio ${daSamsung.total}/${daSamsung.ofertas.length})`);
ok(daSamsung.ofertas.every((o) => /samsung|galaxy/i.test(o.titulo) && o.bf === 1), "Samsung: só a marca, ofertas completas");
ok(daSamsung.ofertas[0].historico.descontoReal === 49, "Samsung: maior desconto primeiro");
ok((await listarBlackFridayDaMarca(db, filtroDeMarca("philco"), 240)).ofertas.length === 0, "marca sem oferta: lista vazia");

console.log(falhas ? `✗ ${falhas} falha(s)` : "✓ filtro de marca no servidor ok");
process.exitCode = falhas ? 1 : 0;
