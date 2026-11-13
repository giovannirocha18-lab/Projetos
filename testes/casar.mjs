// Robô de casar produtos (lib/casar.js): a chave do modelo, quais pares perguntar e um passo inteiro com banco e IA de
// mentira (grava os vereditos, não pergunta de novo, respeita o teto). Uso: node testes/casar.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { chaveDaOferta, chaveDoModelo, gruposDaBusca, proximoPar, idDoPar, passoDeCasar, casadosDaBusca, casadosDosIds, BUSCAS_EXTRAS, buscasDaCategoria, tamanhoDoTitulo, gruposDeConsumo, CATEGORIAS_PARA_CASAR } from "../lib/casar.js";

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
ok(grupos.length === 1 && grupos[0].map((o) => o.id).join() === "c-1,a-1,b-1,d-1,a-2", `grupos: ${JSON.stringify(grupos.map((g) => g.map((o) => o.id)))}`);
const v = new Map();
const par = (m) => { const p = proximoPar(grupos[0], m); return p ? `${p.a.id}~${p.b.id}` : null; };
ok(par(v) === "c-1~a-1", `1º par: ${par(v)}`);
v.set(idDoPar("c-1", "a-1"), "diferente"); v.set(idDoPar("c-1", "b-1"), "diferente"); v.set(idDoPar("c-1", "d-1"), "nao_sei"); v.set(idDoPar("c-1", "a-2"), "diferente");
ok(par(v) === "a-1~b-1", `depois de separar a peça: ${par(v)}`);
v.set(idDoPar("a-1", "b-1"), "igual"); v.set(idDoPar("a-1", "d-1"), "igual_outra_voltagem");
ok(par(v) === "b-1~a-2", `a=b e a=d: b com d não precisa de pergunta; falta o 2º anúncio da loja a (${par(v)})`);
v.set(idDoPar("b-1", "a-2"), "igual");
ok(par(v) === null, `dois anúncios da mesma loja não são perguntados entre si (${par(v)})`);

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
ok(r1.perguntados === 7 && r1.iguais === 3 && r1.diferentes === 4 && !r1.resta && !r1.erros, `1º passo: ${JSON.stringify(r1)}`);
const r2 = await passoDeCasar(env, { q: "geladeira brastemp" }, async () => ofertas, { pedir });
ok(r2.perguntados === 0 && perguntas === 7, `2º passo não pergunta de novo: ${JSON.stringify(r2)}`);
const lidos = await casadosDaBusca(DB, " GELADEIRA brastemp ");
ok(lidos.length === 7 && lidos.filter((p) => p[2] === 1).length === 3 && lidos.every((p) => p.length === 3), `o que o site lê: ${JSON.stringify(lidos)}`);
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
// IA fora do ar: para depois de 2 erros seguidos e não grava veredito
const r4 = await passoDeCasar(env, { q: "outra" }, async () => ofertas.map((o) => ({ ...o, id: `x${o.id}` })), { pedir: async () => ({ ok: false, status: 401, text: async () => "chave inválida" }) });
ok(r4.erros === 2 && /401/.test(r4.ultimoErro) && (await casadosDaBusca(DB, "outra")).length === 0, `IA com erro: ${JSON.stringify(r4)}`);
// Erro só num par (resposta cortada): pula esse par e confere o resto do grupo
let vez = 0;
const r5 = await passoDeCasar(env, { q: "terceira" }, async () => ofertas.map((o) => ({ ...o, id: `y${o.id}` })), { pedir: (...a) => (vez++ === 0 ? { ok: false, status: 529, text: async () => "cheio" } : pedir(...a)) });
ok(r5.erros === 1 && r5.perguntados > 1 && r5.iguais + r5.diferentes === r5.perguntados - 1, `erro num par só: ${JSON.stringify(r5)}`);
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
ok(cel("Jogo God of War Ragnarok PS5 Mídia Física", "Games") === null && cel("Apple Watch Series 10 46mm", "Smartwatches") === null, "jogos e Smartwatches fora do casamento (console voltou em 13/11/2026)");
// 12/11/2026 (medido em 2.258 anúncios reais): memória, processador, câmera e tela não são o modelo; " + " de RAM/selfie não é kit
ok(cel("Smartphone Motorola Moto G17 4g - 128gb 4gb Ram + 8gb Ram Boost, Camera 50mp Sony Lytia 600") === "motorola|nome|g17|128gb"
  && cel("Smartphone Motorola Moto g35 5G - 128GB 4GB RAM+8GB Ram Boost, e Camera 50MP") === "motorola|nome|g35|128gb", `RAM Boost não é kit: ${cel("Smartphone Motorola Moto g35 5G - 128GB 4GB RAM+8GB Ram Boost, e Camera 50MP")}`);
ok(cel("Smartphone Samsung Galaxy S25 FE 256GB 5G 8GB RAM Azul Marinho 6,7\" Câm. Tripla + Selfie 12MP") === "samsung|nome|fe+s25|256gb", `selfie não é kit: ${cel("Smartphone Samsung Galaxy S25 FE 256GB 5G 8GB RAM Azul Marinho 6,7\" Câm. Tripla + Selfie 12MP")}`);
ok(cel("Celular Samsung Galaxy A56 128gb 8 Ram Grafite") === "samsung|nome|a56|128gb" && cel("Smartphone Samsung Galaxy A56 5G A566E Preto, 6.7\" - 5G+Wi-Fi+NFC, Câm.Tras 50MP, Andoid 15, 256GB, 8GB RAM") === "samsung|nome|a56|256gb"
  && cel("Celular Samsung Galaxy S26 5G, 512GB, 12GB RAM, Galaxy AI, Câmera Tripla de 50+12+10, Tela de 6.3\"") === "samsung|nome|s26|512gb", "memória, Android e câmeras fora da chave");
ok(cel("Xiaomi Redmi Note 15 PRO+ 5G, Versão Global, Câmera 200MP, Processador Snapdragon® 7s Gen 4 256GB") === "xiaomi|nome|15+note+plus+pro|256gb"
  && cel("Redmi Note 14 4G, 256GB/8GB RAM, Processador Helio G99-Ultra, Câmera 108MP") === "xiaomi|nome|14+note|256gb"
  && cel("Celular Apple iPhone 16 128GB 5G Tela 6,1\" Chip A18 iOS Original Novo Lacrado") === "iphone|nome|16|128gb", `processador fora e submarca na marca-mãe: ${cel("Redmi Note 14 4G, 256GB/8GB RAM, Processador Helio G99-Ultra, Câmera 108MP")}`);
ok(cel("realme C73 8+256 GB Smartphone Celular Versão Global") === "realme|nome|c73|256gb" && cel("Motorola Edge 60 12+256gb Verde") === "motorola|nome|60+edge|256gb", "8+256 = 256 GB");
ok(cel("Xiaomi Poco X8 5g 512GB / 256GB Nfc Versão Global") === null && cel("iPhone 17 Pro Max Laranja 256GB • 512GB • 1TB") === null && cel("Xiaomi Redmi Note 15 5G 256/512GB e 8GB RAM") === null, "anúncio com vários tamanhos: sem chave");
ok(cel("Smartphone Samsung Galaxy A57 5G Tela 6.7 256GB + Galaxy Fit 3") === null && cel("Smartphone Samsung Galaxy A37 5G Tela 6.7 128GB e Galaxy Fit 3") === null, "celular com relógio de brinde: sem chave");
// Informática (12/11/2026): processador não é código do modelo; tablet/iPad lidos pelo nome mesmo sem categoria; impressora sem categoria entra
ok(chaveDoModelo("Notebook Samsung Galaxy Book4 Intel Core i5-1335U 8GB 512GB SSD") === "samsung|book4" && chaveDoModelo("Notebook Lenovo IdeaPad Slim 3i Core I5 13420H 8GB RAM 512GB - 83NS0002BR") === "lenovo|83ns0002br"
  && chaveDoModelo("Notebook Dell Vostro 8GB DDR4 SSD 256GB NVMe Core i5") === null, `processador e memória não são código: ${chaveDoModelo("Notebook Samsung Galaxy Book4 Intel Core i5-1335U 8GB 512GB SSD")}`);
ok(chaveDaOferta({ titulo: "Tablet Samsung Galaxy Tab A9+ X216B - Grafite, Tela 11\", WiFi+5G, Android 13", secao: undefined }) === "samsung|nome|a9+plus"
  && chaveDaOferta({ titulo: "Tablet Samsung Galaxy Tab A11 4GB RAM 64GB 8,7\" Android 15 Helio G99 Wi-Fi", secao: "Informática" }) === "samsung|nome|a11|64gb", `tablet pelo nome: ${chaveDaOferta({ titulo: "Tablet Samsung Galaxy Tab A9+ X216B - Grafite, Tela 11\", WiFi+5G, Android 13" })}`);
ok(chaveDaOferta({ titulo: "iPad Apple 11\" A16, Wi-Fi, 256GB, Câmera 12MP, Amarelo - MD4J4BZ/A", secao: "Celulares" }) === "ipad|nome|a16|256gb"
  && chaveDaOferta({ titulo: "iPad Wi-Fi 256 gb - Cor prata (a16)" }) === "ipad|nome|a16|256gb", `iPad: ${chaveDaOferta({ titulo: "iPad Apple 11\" A16, Wi-Fi, 256GB, Câmera 12MP, Amarelo - MD4J4BZ/A", secao: "Celulares" })}`);
ok(gruposDaBusca([{ id: "i-1", loja: "a", preco: 900, titulo: "Impressora Multifuncional Epson EcoTank L3250 Wi-Fi", bate: true }, { id: "i-2", loja: "b", preco: 950, titulo: "Impressora Epson L3250 Tanque de Tinta", bate: true }]).length === 1
  && gruposDaBusca([{ id: "c-1", loja: "a", preco: 900, titulo: "Capa Epson L3250 protetora", bate: true }, { id: "c-2", loja: "b", preco: 950, titulo: "Tampa Epson L3250", bate: true }]).length === 0, "impressora sem categoria entra; outra coisa sem categoria não");
// Revisão de 13/11/2026 (Eletrodomésticos, Eletroportáteis, Ferramentas): código curto, marcas só do comparador, aspirador
const ep = (titulo, secao = "Eletroportáteis") => chaveDaOferta({ titulo, secao });
ok(ep("Liquidificador Turbo Power Mondial 550W - L-99 FB") === "mondial|l99" && ep("Liquidificador Mondial Turbo Power L99 Preto") === "mondial|l99", `código curto: ${ep("Liquidificador Turbo Power Mondial 550W - L-99 FB")}`);
ok(ep("Ar Condicionado Split LG 12000 Btus R-32 220V", "Eletrodomésticos") === null && ep("Esmerilhadeira Bosch M14 720W", "Ferramentas") === null
  && ep("Sanduicheira Mondial S-12 e S-19") === null && ep("Notebook Dell G15 16GB", "Games") === null, "gás, rosca, dois códigos curtos e outra seção: sem chave");
ok(ep("Purificador De Água IBBL FR600 Speciale Branco 127V", "Eletrodomésticos") === "ibbl|fr600" && ep("Fogão Itatiaia Waves 4 Bocas", "Eletrodomésticos") === null, "marca só do comparador");
ok(gruposDaBusca([{ id: "s-1", loja: "a", preco: 190, titulo: "Aspirador de Pó Vertical Electrolux STK15 1450W", bate: true, secao: "Limpeza" },
  { id: "s-2", loja: "b", preco: 200, titulo: "Aspirador de Pó Vertical com Fio Electrolux 1450W STK15", bate: true, secao: "Limpeza" }]).length === 1
  && gruposDaBusca([{ id: "s-3", loja: "a", preco: 19, titulo: "Detergente Ypê ABC123 500ml", bate: true, secao: "Limpeza" }, { id: "s-4", loja: "b", preco: 20, titulo: "Detergente Ypê ABC123", bate: true, secao: "Limpeza" }]).length === 0,
  "aspirador (Limpeza) entra no comparador; o resto da Limpeza não");
// Consoles de videogame (13/11/2026): só o aparelho; jogo, acessório, pacote e controle a mais ficam sem chave
const cs = (titulo) => chaveDaOferta({ titulo, secao: "Games" });
ok(cs("Console Xbox Series S 512gb Cor Branco") === "console|xbox series s|512gb" && cs("Microsoft Xbox Series S 512gb Standard Cor Branco") === "console|xbox series s|512gb", `console: ${cs("Console Xbox Series S 512gb Cor Branco")}`);
ok(cs("Console Playstation 5 Slim Edição Digital 825 Gb") === "console|ps5 slim|digital|825gb" && cs("Console Sony Playstation 5 Edição Slim Disk 1tb Branco") === "console|ps5 slim|disco|1tb", "PS5: digital e com disco separados");
ok([ "Controle Sem Fio Xbox Series X|S", "Battlefield 6 - Xbox Series X", "Nintendo Switch Sports Resort - NS2", "Console Microsoft Xbox Series S 512gb Com Controle Adicional Cor Vermelho",
  "Console PlayStation5 Slim Disk - Pacote ASTRO BOT e Gran Turismo 7", "Xbox Série S - Sem Controle" ].every((t) => cs(t) === null), "jogo, acessório e pacote: sem chave");
ok(gruposDaBusca([{ id: "x-1", loja: "a", preco: 3900, titulo: "Console Xbox Series S 512gb Cor Branco", bate: true, secao: "Games" }, { id: "x-2", loja: "b", preco: 2899, titulo: "Xbox Series S 512gb", bate: true, secao: "Games" },
  { id: "x-3", loja: "c", preco: 99, titulo: "Pentiment Xbox Series X|S, Xbox One (Digital)", bate: true, secao: "Games" }]).length === 1, "console em 2 lojas vira grupo; jogo não");
// A cópia do site é igual à do robô
const trecho = (arq) => (readFileSync(new URL(arq, import.meta.url), "utf8").match(/\/\/ >>> nomeDoModelo[\s\S]*?\/\/ <<< nomeDoModelo/) || [""])[0];
ok(trecho("../lib/casar.js").length > 500 && trecho("../lib/casar.js") === trecho("../public/assets/app.js"), "nomeDoModelo de app.js igual à de lib/casar.js");

// Categoria inteira: tipos de produto com 3 páginas e produto + marca, sem repetir
const daCat = buscasDaCategoria("Eletrodomésticos");
ok(daCat.length > 150 && daCat.find((b) => b.q === "geladeira")?.paginas === 3 && daCat.some((b) => b.q === "geladeira brastemp" && !b.paginas)
  && new Set(daCat.map((b) => b.q)).size === daCat.length && buscasDaCategoria("Não existe").length === 0, `buscas da categoria: ${daCat.length}`);
const todas = ["Celulares", "Ferramentas"].flatMap((c) => buscasDaCategoria(c));
ok(todas.some((b) => b.q === "iphone 16" && b.paginas === 3) && todas.some((b) => b.q === "furadeira bosch") && Array.isArray(buscasDaCategoria()), `categorias: ${todas.length}`);

// Usado não entra nos grupos: a loja fica representada pelo novo, mesmo mais caro
const s24 = gruposDaBusca([{ id: "s-1", loja: "shopee", preco: 2000, titulo: "Usado: Galaxy S24 128GB Cinza Bom - Trocafy - Samsung", bate: true, secao: "Celulares" },
  { id: "s-2", loja: "shopee", preco: 3900, titulo: "Samsung Galaxy S24 128GB Preto", bate: true, secao: "Celulares" },
  { id: "m-1", loja: "mercadolivre", preco: 4000, titulo: "Celular Samsung Galaxy S24 128gb 8gb Ram", bate: true, secao: "Celulares" }]);
ok(s24.length === 1 && s24[0].map((o) => o.id).join() === "s-2,m-1", `usado fora dos grupos: ${JSON.stringify(s24.map((g) => g.map((o) => o.id)))}`);

// Produtos de consumo (Pets, Suplementos, Perfumes): tamanho tirado do nome + nomes parecidos; kit e anúncio sem tamanho ficam fora
ok(tamanhoDoTitulo("racao golden gatos castrados 10,1kg") === "10100g" && tamanhoDoTitulo("whey 1.8kg 840g protein") === "1800g"
  && tamanhoDoTitulo("perfume malbec 100 ml") === "100ml" && tamanhoDoTitulo("bravecto caes 20 a 40kg 1000mg 1 comprimido") === "40000g"
  && tamanhoDoTitulo("multivitaminico 60 capsulas") === "60un" && tamanhoDoTitulo("racao golden gatos") === null, "tamanho do nome");
const pet = (id, loja, preco, titulo, secao = "Pets") => ({ id, loja, preco, titulo, bate: true, secao });
const racoes = [
  pet("m-1", "mercadolivre", 30, "Ração GoldeN Gatos Castrados Sabor Carne 1kg"), pet("s-1", "shopee", 33, "Ração pra Gatos Adultos Castrados Golden sabor Carne 1kg"),
  pet("s-2", "shopee", 180, "Ração Golden Fórmula Cães Adultos Frango e Arroz 15kg"), pet("c-1", "cobasi", 175, "Ração Golden Fórmula Cães Adultos Frango e Arroz - 15 kg"),
  pet("m-2", "mercadolivre", 255, "Ração Golden Formula Cães Adultos 15 Kg"), pet("e-1", "efacil", 72, "Ração Pitty para Cães Adultos 15kg"), pet("s-3", "shopee", 90, "Ração Pitty Cão Adulto 15kg"),
  pet("s-4", "shopee", 300, "Kit 2 Ração Golden Fórmula Cães Adultos 15kg"), pet("c-2", "cobasi", 33, "Ração Golden Seleção Natural Gatos Filhotes Frango e Arroz"),
  pet("s-5", "shopee", 50, "Ração Whiskas Carne Gatos Adultos 2,7 kg"), pet("e-2", "efacil", 23, "Ração Whiskas Premium Adulto Carne 2,7kg"),
  pet("s-6", "shopee", 60, "Areia Higiênica Pipicat Floral para Gatos 4kg"), pet("x-1", "x", 61, "Coleira peitoral para cães tamanho M"),
];
const gc = gruposDeConsumo(racoes).filter((g) => new Set(g.map((o) => o.loja)).size >= 2).map((g) => g.map((o) => o.id).sort().join());
ok(gc.includes("m-1,s-1") && gc.includes("c-1,m-2,s-2") && gc.includes("e-1,s-3") && gc.includes("e-2,s-5") && gc.length === 4, `grupos de consumo: ${JSON.stringify(gc)}`);
ok(gruposDeConsumo(racoes).every((g) => !g.some((o) => o.id === "s-4" || o.id === "c-2")), "kit e anúncio sem tamanho não entram");
ok(gruposDaBusca(racoes).length === 0 && Object.keys(CATEGORIAS_PARA_CASAR).join() === "Eletrodomésticos,Eletroportáteis,Ferramentas,Celulares,Informática", `só as 5 categorias principais: ${Object.keys(CATEGORIAS_PARA_CASAR)}`);

console.log(falhas ? `✗ ${falhas} falha(s)` : "✓ robô de casar: tudo certo");
process.exitCode = falhas ? 1 : 0;
