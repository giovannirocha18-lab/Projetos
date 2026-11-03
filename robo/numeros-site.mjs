// Números do site (03/11/2026, pedido do Giovanni: "o tráfego do site dá para medir?"). Lê do banco o que o site já
// guarda e põe no resumo da execução do robô: buscas por dia (cada pessoa conta 1 vez por termo por dia; o robô não conta),
// termos mais buscados da semana, contas criadas e alertas de preço. Visitas e páginas vistas ficam no Web Analytics do
// Cloudflare (não passam pelo banco).
// Uso: node robo/numeros-site.mjs   (precisa de CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID e D1_DATABASE_ID)
import { appendFileSync } from "node:fs";

const { CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: conta, D1_DATABASE_ID: banco } = process.env;
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
// Tabela que ainda não existe (ninguém criou conta, por exemplo) conta como vazia
const tentar = (sql, params) => d1(sql, params).catch(() => []);

const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const diasAtras = (n) => new Date(Date.parse(hoje) - n * 864e5).toISOString().slice(0, 10);
const dataBr = (dia) => dia.split("-").reverse().slice(0, 2).join("/");
const semanaMs = Date.now() - 7 * 864e5;

const porDia = await tentar(
  "SELECT dia, SUM(total) AS buscas, COUNT(*) AS termos FROM buscas WHERE dia >= ? GROUP BY dia ORDER BY dia", [diasAtras(14)]);
const top = await tentar(
  "SELECT MAX(texto) AS texto, SUM(total) AS vezes FROM buscas WHERE dia >= ? GROUP BY termo ORDER BY vezes DESC LIMIT 15", [diasAtras(7)]);
const [contas] = await tentar("SELECT COUNT(*) AS total, SUM(criado_em >= ?) AS semana FROM usuarios", [semanaMs]);
const [alertas] = await tentar("SELECT COUNT(*) AS total, SUM(criado_em >= ?) AS semana FROM alertas", [semanaMs]);
const [carrinhos] = await tentar("SELECT COUNT(*) AS total FROM carrinhos WHERE itens NOT IN ('', '[]')");

const linhas = ["### Números do site"];
const semana = porDia.filter((d) => d.dia >= diasAtras(6));
const total = (lista) => lista.reduce((n, d) => n + d.buscas, 0);
linhas.push(`- Buscas nos últimos 7 dias: **${total(semana)}** (7 dias antes: ${total(porDia.filter((d) => d.dia < diasAtras(6)))})`);
linhas.push(`- Por dia: ${porDia.filter((d) => d.dia >= diasAtras(6)).map((d) => `${dataBr(d.dia)}: ${d.buscas}`).join(" · ") || "nenhuma"}`);
if (top.length) linhas.push(`- Mais buscados na semana: ${top.map((t) => `${t.texto} (${t.vezes})`).join(", ")}`);
linhas.push(`- Contas: ${contas?.total || 0} (${contas?.semana || 0} novas na semana) · Alertas de preço: ${alertas?.total || 0} ` +
  `(${alertas?.semana || 0} novos) · Carrinhos com produto: ${carrinhos?.total || 0}`);
linhas.push("- Visitas e páginas vistas: painel do Cloudflare (Web Analytics)");

const texto = linhas.join("\n");
console.log(texto);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${texto}\n`);
