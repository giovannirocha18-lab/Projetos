// Ronda das categorias (pedido do Giovanni, 22/11/2026: "plano de defesa" depois dos livros em "Vestidos").
// Abre o site NO AR como visitante, entra em cada categoria, toca em tipos e lê os cartões da tela. Acusa:
//   - cartão de OUTRA categoria (não pode existir: trava entraNaCategoriaAberta em app.js);
//   - cartão com cara de intruso (livro, adulto, usado…) ou que não é do tipo tocado.
// Uso: node robo/ronda-categorias.mjs            → todas as categorias, 2 tipos sorteados em cada (~45 min)
//      node robo/ronda-categorias.mjs todos      → todos os tipos (2 h+)
//      node robo/ronda-categorias.mjs "Moda feminina" "Pets"   → só essas, todos os tipos
// Sai com código 1 se achar cartão de outra categoria. Não conta visita (cookie vpc_nao_contar).
import fs from "node:fs";
const { chromium } = await import(process.env.PLAYWRIGHT || "/opt/node22/lib/node_modules/playwright/index.mjs");
const SITE = process.env.SITE || "https://vaiprocarrinho.com.br";
const fonte = fs.readFileSync(new URL("../lib/categorias.js", import.meta.url), "utf8");
const todas = [...fonte.matchAll(/\{ nome: "([^"]+)", emoji: "[^"]+", busca: "/g)].map((m) => m[1]);
const pedidas = process.argv.slice(2).filter((x) => x !== "todos");
const todosOsTipos = process.argv.includes("todos") || pedidas.length > 0;
const categorias = pedidas.length ? pedidas : todas;
// "adulto" sozinho não entra: ração "para cães adultos" deu 30+ alarmes falsos na 1ª ronda (22/11/2026)
const SUSPEITO = /\blivros?\b|\be-?book\b|(jogo|brinquedo|produto)s? adult|\+ ?18\b|er[oó]tic|sex shop|\busad[oa]s?\b|seminov|recondicionad/i;
const sortear = (lista, n) => [...lista].sort(() => Math.random() - 0.5).slice(0, n);

const navegador = await chromium.launch();
const ctx = await navegador.newContext({ viewport: { width: 1400, height: 1000 } });
await ctx.addCookies([{ name: "vpc_nao_contar", value: "1", domain: new URL(SITE).hostname, path: "/" }]);
const p = await ctx.newPage();
const errosDeTela = [];
p.on("pageerror", (e) => errosDeTela.push(e.message));
const cartoes = () => p.locator("#grade .oferta:not(.esqueleto)").evaluateAll((l) => l.map((c) => ({
  secao: c.dataset.secao || "", titulo: (c.querySelector(".oferta-titulo")?.textContent || "").trim() })));

let toques = 0, vistos = 0;
const outraCategoria = [], suspeitos = [], vazios = [];
for (const cat of categorias) {
  try {
    await p.goto(`${SITE}/?cat=${encodeURIComponent(cat)}`, { waitUntil: "load", timeout: 45000 });
    await p.locator("#grade .oferta:not(.esqueleto)").first().waitFor({ timeout: 25000 });
    await p.waitForTimeout(2500);
  } catch { vazios.push(`${cat}: a categoria não abriu`); continue; }
  const conferir = async (onde) => {
    for (let i = 0; i < 4; i++) { await p.mouse.wheel(0, 5000); await p.waitForTimeout(700); }
    const lista = await cartoes();
    vistos += lista.length;
    for (const c of lista) {
      if (c.secao && c.secao !== cat) outraCategoria.push(`${onde}: [${c.secao}] ${c.titulo.slice(0, 70)}`);
      // na categoria Livros (24/11/2026) a palavra "livro" não é suspeita
      else if (SUSPEITO.test(onde.startsWith("Livros") ? c.titulo.replace(/\blivros?\b|\be-?book\b/gi, "") : c.titulo)) suspeitos.push(`${onde}: ${c.titulo.slice(0, 70)}`);
    }
    return lista.length;
  };
  await conferir(cat);
  const nomes = (await p.locator("#filtro-tipos button").allTextContents()).map((x) => x.trim()).filter((x) => x && x !== "Todos");
  for (const tipo of todosOsTipos ? nomes : sortear(nomes, 2)) {
    try {
      await p.evaluate(() => scrollTo(0, 0));
      await p.locator("#filtro-tipos button").filter({ hasText: new RegExp(`^\\s*${tipo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`) }).first().click({ timeout: 8000 });
      await p.waitForTimeout(8000);
      toques++;
      const ativo = (await p.locator("#filtro-tipos button.ativa").textContent().catch(() => "")).trim();
      if (ativo !== tipo) { vazios.push(`${cat} → ${tipo}: sem produto (voltou para "${ativo || "?"}")`); continue; }
      await conferir(`${cat} → ${tipo}`);
    } catch (e) { vazios.push(`${cat} → ${tipo}: não consegui tocar (${String(e.message).split("\n")[0].slice(0, 60)})`); }
  }
}
await navegador.close();

const linhas = [
  `Ronda das categorias: ${categorias.length} categorias, ${toques} tipos tocados, ${vistos} cartões lidos.`,
  `Cartões de OUTRA categoria: ${outraCategoria.length}`, ...outraCategoria.slice(0, 30).map((x) => `  ✗ ${x}`),
  `Cartões suspeitos (livro, adulto, usado…): ${suspeitos.length}`, ...suspeitos.slice(0, 200).map((x) => `  ? ${x}`),
  `Tipos sem produto ou que não abriram: ${vazios.length}`, ...vazios.slice(0, 30).map((x) => `  - ${x}`),
  `Erros de tela: ${errosDeTela.length}`, ...[...new Set(errosDeTela)].slice(0, 5).map((x) => `  ! ${x}`),
];
console.log(linhas.join("\n"));
process.exit(outraCategoria.length ? 1 : 0);
