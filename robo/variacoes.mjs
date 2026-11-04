// Auditoria das variações (04/11/2026, pedido do Giovanni: "um robô só pra filtrar esses casos pra não poluir o site").
// Algumas lojas mandam cada tamanho/numeração como um produto ("Tênis … Azul 40", "… Azul 41"…). O site junta essas
// variações num cartão só pela regra de lib/variacoes.js (modeloBase) e pela cópia dela em app.js (semTamanho).
// Este relatório (job "auditoria" do robo-precos.yml) procura, em cada loja da Awin, grupos de anúncios com o mesmo preço
// e o mesmo nome tirando a última palavra, e diz quantos o site já junta e quais ainda NÃO junta (com exemplos),
// para completar a regra. Não muda nada no site.
// Uso: node robo/variacoes.mjs   (precisa de CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID e D1_DATABASE_ID)
import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { paraPainel } from "./painel.mjs";
import { modeloBase } from "../lib/variacoes.js";
import { normalizar } from "../lib/texto.js";

const MINIMO_NO_GRUPO = 3; // 2 iguais podem ser coincidência; 3+ com só o fim diferente quase sempre é tamanho/cor

// linhas = [{ loja_nome, titulo, preco }] -> por loja: { anuncios, juntados, gruposJuntados, naoJuntados: [{ n, exemplos }] }
export function auditarVariacoes(linhas) {
  const grupos = new Map();
  for (const l of linhas) {
    const t = normalizar(String(l.titulo || "")).replace(/[^a-z0-9\/ ]+/g, " ").replace(/\s+/g, " ").trim();
    const palavras = t.split(" ");
    if (palavras.length < 3) continue;
    const chave = `${l.loja_nome}|${Number(l.preco).toFixed(2)}|${palavras.slice(0, -1).join(" ")}`;
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push(l.titulo);
  }
  const lojas = new Map();
  const daLoja = (nome) => lojas.get(nome) || lojas.set(nome, { anuncios: 0, juntados: 0, gruposJuntados: 0, naoJuntados: [] }).get(nome);
  for (const l of linhas) daLoja(l.loja_nome).anuncios++;
  for (const [chave, titulos] of grupos) {
    const distintos = [...new Set(titulos)];
    if (distintos.length < MINIMO_NO_GRUPO) continue;
    const loja = daLoja(chave.split("|")[0]);
    const modelos = new Set(distintos.map(modeloBase));
    if (modelos.size === 1) {
      loja.juntados += distintos.length;
      loja.gruposJuntados++;
    } else {
      loja.naoJuntados.push({ n: distintos.length, exemplos: distintos.slice(0, 3) });
    }
  }
  for (const l of lojas.values()) l.naoJuntados.sort((a, b) => b.n - a.n);
  return lojas;
}

async function principal() {
  const { CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: conta, D1_DATABASE_ID: banco } = process.env;
  if (!token || !conta || !banco) {
    console.log("Faltam os segredos do Cloudflare: auditoria das variações não rodou");
    return;
  }
  const consultar = async (sql, params = []) => {
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${conta}/d1/database/${banco}/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ sql, params }),
    });
    const json = await r.json();
    if (!json.success) throw new Error(JSON.stringify(json.errors).slice(0, 300));
    return json.result[0].results;
  };
  // Em partes de 5 mil (a resposta inteira passaria do limite da API)
  const linhas = [];
  let ultimo = "";
  for (;;) {
    const parte = await consultar("SELECT id, loja_nome, titulo, preco FROM ofertas WHERE fonte = 'awin' AND id > ? ORDER BY id LIMIT 5000", [ultimo]);
    linhas.push(...parte);
    if (parte.length < 5000) break;
    ultimo = parte.at(-1).id;
  }
  const lojas = [...auditarVariacoes(linhas)].sort((a, b) => b[1].naoJuntados.length - a[1].naoJuntados.length || b[1].juntados - a[1].juntados);
  const comVariacoes = lojas.filter(([, l]) => l.juntados || l.naoJuntados.length);
  const saida = [
    "### Variações (tamanhos/cores como anúncios separados)",
    `- ${linhas.length} anúncios da Awin conferidos; ${comVariacoes.length} lojas com variações`,
    ...comVariacoes.flatMap(([nome, l]) => [
      `- ${nome}: ${l.juntados} anúncios já juntados em ${l.gruposJuntados} modelos` +
        (l.naoJuntados.length ? `; ⚠️ **${l.naoJuntados.length} grupos NÃO juntados**` : " ✅"),
      ...l.naoJuntados.slice(0, 8).map((g) => `  - (${g.n}) ${g.exemplos.map((t) => `"${t.slice(-45)}"`).join(" / ")}`),
    ]),
  ].join("\n");
  console.log(saida);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, saida + "\n");
  const naoJuntados = comVariacoes.filter(([, l]) => l.naoJuntados.length);
  paraPainel("variacoes", {
    linhas: [`${comVariacoes.reduce((s, [, l]) => s + l.juntados, 0)} anúncios de tamanho/cor já juntados num cartão só (${comVariacoes.length} lojas)`],
    avisos: naoJuntados.slice(0, 6).map(([nome, l]) => `${nome}: ${l.naoJuntados.length} grupos de variações que o site ainda não junta (ex.: ${l.naoJuntados[0].exemplos[0].slice(-40)})`),
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await principal();
