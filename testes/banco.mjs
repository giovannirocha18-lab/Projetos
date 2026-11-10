// Teste das buscas no banco (Awin e lista oficial da Shopee) com um banco SQLite na memória, no lugar do D1.
// Rodar depois de mexer em lib/fontes/awin.js, lib/shopeeLista.js ou lib/ofertas.js:   node testes/banco.mjs
// (10/11/2026: as consultas passaram a ler em duas fases, só nome primeiro e o resto só dos escolhidos)
import { DatabaseSync } from "node:sqlite";
import { TABELAS_OFERTAS } from "../lib/ofertas.js";
import { TABELAS_SHOPEE_LISTA, buscarNaListaShopee, textoDeBusca } from "../lib/shopeeLista.js";
import { awin } from "../lib/fontes/awin.js";
import { normalizar } from "../lib/texto.js";

// O mínimo do D1 que o site usa: prepare().bind().all()/first()/run() e batch()
function d1(sqlite) {
  const comando = (sql, valores = []) => ({
    bind: (...v) => comando(sql, v),
    all: async () => ({ results: sqlite.prepare(sql).all(...valores) }),
    first: async () => sqlite.prepare(sql).get(...valores) ?? null,
    run: async () => { sqlite.prepare(sql).run(...valores); return {}; },
  });
  return { prepare: (sql) => comando(sql), batch: async (lista) => Promise.all(lista.map((c) => c.all())) };
}

const sqlite = new DatabaseSync(":memory:");
for (const t of [...TABELAS_OFERTAS, ...TABELAS_SHOPEE_LISTA]) sqlite.exec(t);
const db = d1(sqlite);
let falhas = 0;
const ok = (certo, texto) => { if (!certo) { falhas++; console.log(`✗ ${texto}`); } };

// ---- Awin: 3 lojas, 120 air fryers em cada + coisas que não são o produto
const por = sqlite.prepare(`INSERT INTO ofertas (id, fonte, loja, loja_nome, titulo, preco, preco_antigo, desconto, imagem, categoria, link,
  descricao, imagens, busca, assinatura, atualizado_em) VALUES (?, 'awin', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'x', 1)`);
for (const [loja, nome] of [["efacil", "Efacil"], ["spicy", "Spicy"], ["leveros", "Leveros"]]) {
  for (let i = 0; i < 120; i++) {
    const titulo = `Fritadeira Air Fryer Modelo ${nome} ${i} 5 Litros`;
    por.run(`${loja}-${i}`, loja, nome, titulo, 300 + i, 400 + i, 20, `https://x/${i}.jpg`, "Cozinha > Fritadeiras", `https://loja/${loja}/${i}`,
      `Descrição longa ${"bla ".repeat(50)}`, JSON.stringify(["https://x/a.jpg", "https://x/b.jpg"]), normalizar(`${titulo} cozinha ${nome}`));
  }
  por.run(`${loja}-tab`, loja, nome, "Tábua de Corte Bambu", 50, null, null, "https://x/t.jpg", "Cozinha > Air Fryer e Fritadeiras", `https://loja/${loja}/t`,
    "", null, normalizar(`Tábua de Corte Bambu cozinha air fryer ${nome}`));
}
sqlite.exec("INSERT INTO lojas_awin (loja, nome, produtos) VALUES ('efacil', 'Efacil', 121), ('spicy', 'Spicy', 121), ('leveros', 'Leveros', 121)");
sqlite.exec("INSERT INTO precos (oferta_id, dia, preco) VALUES ('efacil-0', '2026-11-01', 310), ('efacil-0', '2026-11-02', 300)");

const env = { DB: db };
const daAwin = await awin.buscar("air fryer", env, 1, {});
ok(daAwin.length === 100, `Awin: 100 ofertas (veio ${daAwin.length})`);
ok(daAwin.every((o) => /air fryer/i.test(o.titulo)), "Awin: só títulos com as palavras (a tábua tem 'air fryer' só na categoria)");
const lojas = [...new Set(daAwin.map((o) => o.loja))];
ok(lojas.length === 3, `Awin: as 3 lojas aparecem (${lojas})`);
ok(new Set(daAwin.slice(0, 3).map((o) => o.loja)).size === 3, "Awin: as lojas se revezam desde o começo");
ok(daAwin.every((o) => o.id && o.link?.startsWith("https://loja/") && o.imagem && o.preco > 0 && o.lojaNome), "Awin: ofertas completas (link, foto, preço, loja)");
ok(daAwin.every((o) => o.descricao || o.imagens), "Awin: descrição/fotos extras vieram na 2ª fase");
ok(new Set(daAwin.map((o) => o.id)).size === daAwin.length, "Awin: sem repetidos");
const naLoja = await awin.buscar("air fryer", env, 1, { soLoja: "spicy" });
ok(naLoja.length === 120 && naLoja.every((o) => o.loja === "spicy"), `Awin dentro de uma loja: 120 dela (veio ${naLoja.length})`);
ok((await awin.buscar("geladeira", env, 1, {})).length === 0, "Awin: busca sem produto dá lista vazia");

// ---- Lista da Shopee: 300 produtos, os mais curtidos primeiro, no máximo 48
const porShopee = sqlite.prepare(`INSERT INTO shopee_lista (id, titulo, preco, preco_antigo, desconto, imagem, imagens, link, vendedor, avaliacao, curtidas,
  categorias, busca, assinatura, atualizado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'x', 1)`);
for (let i = 0; i < 300; i++) {
  const titulo = `Fone Bluetooth Sem Fio Modelo ${i}`;
  porShopee.run(`shopee-${1000 + i}`, titulo, 50 + i, 80 + i, 30, "https://cf.shopee.com.br/file/a", JSON.stringify(["https://x/1", "https://x/2"]),
    `https://shope.ee/${i}`, "Loja X", 4.5, i, JSON.stringify([100, 200]), textoDeBusca(titulo));
}
porShopee.run("shopee-9", "Capa para Fone", 10, null, null, "https://x", null, "https://shope.ee/c", "Y", 5, 9999, null, textoDeBusca("Capa para Fone"));
const daLista = await buscarNaListaShopee(db, "fone bluetooth");
ok(daLista.length === 48, `Lista Shopee: 48 ofertas (veio ${daLista.length})`);
ok(daLista[0]?.curtidas === 299 && daLista[47]?.curtidas === 252, `Lista Shopee: as mais curtidas primeiro, na ordem (${daLista[0]?.curtidas}…${daLista[47]?.curtidas})`);
ok(daLista.every((o) => o.loja === "shopee" && o.link?.startsWith("https://shope.ee/") && o.imagem && o.preco > 0 && o.vendedor), "Lista Shopee: ofertas completas");
ok(daLista.every((o) => /fone bluetooth/i.test(o.titulo)), "Lista Shopee: só títulos com as palavras");
ok((await buscarNaListaShopee(db, "geladeira")).length === 0, "Lista Shopee: busca sem produto dá lista vazia");

console.log(falhas ? `\n${falhas} problema(s)` : "✓ banco: Awin e lista da Shopee leem em duas fases e devolvem as ofertas completas");
process.exitCode = falhas ? 1 : 0;
