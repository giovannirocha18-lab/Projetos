// Relatório das categorias das lojas da Awin (roda no job "auditoria" do robo-precos.yml).
// Para cada caminho de categoria que as lojas mandam no feed, mostra em qual das nossas categorias ele cai
// (lib/caminhos.js) e lista os caminhos sem categoria, para conferir de vez em quando e completar as regras.
// Uso: node robo/caminhos.mjs   (precisa de CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID e D1_DATABASE_ID)
import { appendFileSync } from "node:fs";
import { categoriaDoCaminho } from "../lib/caminhos.js";
import { categoriaDoProduto } from "../lib/categorias.js";

const { CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: conta, D1_DATABASE_ID: banco } = process.env;
if (!token || !conta || !banco) {
  console.log("Faltam os segredos do Cloudflare: relatório das categorias das lojas não rodou");
  process.exit(0);
}

async function consultar(sql) {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${conta}/d1/database/${banco}/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ sql }),
  });
  const json = await r.json();
  if (!json.success) throw new Error(JSON.stringify(json.errors).slice(0, 300));
  return json.result[0].results;
}

const linhas = await consultar(`SELECT loja_nome, categoria, COUNT(*) AS n, MIN(titulo) AS exemplo
  FROM ofertas WHERE fonte = 'awin' GROUP BY loja_nome, categoria ORDER BY n DESC`);

const porLoja = new Map();
const semCategoria = [];
const tabela = [];
for (const l of linhas) {
  const nossa = categoriaDoCaminho(l.categoria, categoriaDoProduto);
  const loja = porLoja.get(l.loja_nome) || { total: 0, com: 0 };
  loja.total += l.n;
  if (nossa) loja.com += l.n;
  porLoja.set(l.loja_nome, loja);
  if (nossa) tabela.push(l.n >= 20 ? `  - ${l.loja_nome} | ${l.categoria} → **${nossa}** (${l.n})` : null);
  else semCategoria.push(`  - ${l.loja_nome} | ${l.categoria || "(vazio)"} (${l.n}) ex.: ${String(l.exemplo).slice(0, 60)}`);
}

const saida = [
  "### Categorias das lojas (Awin)",
  ...[...porLoja].sort((a, b) => b[1].total - a[1].total)
    .map(([nome, { total, com }]) => `- ${nome}: ${Math.round((100 * com) / total)}% com categoria da loja (${com} de ${total})`),
  `- Caminhos sem categoria: ${semCategoria.length}`,
  ...semCategoria.slice(0, 150),
  "- Caminhos com categoria (20+ produtos):",
  ...tabela.filter(Boolean).slice(0, 400),
].join("\n");
console.log(saida);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, saida + "\n");
