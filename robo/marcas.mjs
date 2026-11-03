// Sugestões "produto + marca" da caixa de busca (31/10/2026; ver lib/marcasProdutos.js). Roda depois do robô da IA:
// lê os títulos de todos os produtos que já passaram pelo site (tabela ia_categorias, chave = título sem acento) e guarda,
// para cada marca, os produtos que mais aparecem com ela. /api/vocabulario manda isso para o site.
// Uso: node robo/marcas.mjs   (precisa de CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID e D1_DATABASE_ID)
import { paraPainel } from "./painel.mjs";
import { appendFileSync } from "node:fs";
import { produtosPorMarca, CHAVE_RESUMO } from "../lib/marcasProdutos.js";

const { CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: conta, D1_DATABASE_ID: banco } = process.env;
if (!token || !conta || !banco) {
  console.log("Faltam os segredos do Cloudflare: sugestões de marcas não foram refeitas");
  process.exit(0);
}
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
async function d1(sql, params = []) {
  for (let tentativa = 1; ; tentativa++) {
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${conta}/d1/database/${banco}/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ sql, params }),
    });
    const json = await r.json().catch(() => ({}));
    if (r.ok && json.success) return json.result[0].results;
    if (tentativa >= 4 || (r.status < 500 && r.status !== 429)) throw new Error(`D1 respondeu ${r.status}: ${JSON.stringify(json.errors || json).slice(0, 300)}`);
    await espera(2000 * 2 ** tentativa);
  }
}

const titulos = [];
for (let desde = ""; ;) {
  const linhas = await d1("SELECT chave FROM ia_categorias WHERE chave > ? ORDER BY chave LIMIT 50000", [desde]);
  if (!linhas.length) break;
  for (const l of linhas) titulos.push(l.chave);
  desde = linhas.at(-1).chave;
}
const porMarca = produtosPorMarca(titulos);
await d1("CREATE TABLE IF NOT EXISTS resumos (chave TEXT PRIMARY KEY, valor TEXT NOT NULL, em INTEGER NOT NULL)");
await d1("INSERT OR REPLACE INTO resumos (chave, valor, em) VALUES (?, ?, ?)", [CHAVE_RESUMO, JSON.stringify(porMarca), Date.now()]);

const marcas = Object.keys(porMarca);
const linhas = [`### Sugestões "produto + marca"`, `- ${titulos.length.toLocaleString("pt-BR")} títulos lidos; ${marcas.length} marcas com sugestões`,
  ...["stanley", "mondial", "tramontina", "samsung", "nike", "dewalt"].filter((m) => porMarca[m]).map((m) => `  - ${m}: ${porMarca[m].join(", ")}`)];
console.log(linhas.join("\n"));
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, linhas.join("\n") + "\n");
paraPainel("marcas", { linhas: [`${marcas.length} marcas com sugestões "produto + marca"`] });
