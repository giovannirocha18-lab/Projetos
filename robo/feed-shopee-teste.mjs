// Teste do feed de produtos da Shopee (área de afiliados > Feed de produto, 08/11/2026): baixa o arquivo do link guardado no
// Secret SHOPEE_FEED_OFICIAL e mostra o que vem nele (colunas, quantos produtos, exemplos), sem mostrar o link (é a "senha").
// Rodar: aba Actions > "Teste do feed da Shopee" > Run workflow. Não grava nada no banco.
import { createWriteStream, createReadStream, readFileSync, appendFileSync, statSync, readdirSync } from "node:fs";
import { createGunzip } from "node:zlib";
import { execFileSync } from "node:child_process";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const saida = [];
const log = (t = "") => { console.log(t); saida.push(t); };
const fim = () => { if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, saida.join("\n") + "\n"); };

const links = String(process.env.SHOPEE_FEED_OFICIAL || "").split(/\s+/).filter((l) => /^https?:\/\//.test(l));
log("### Teste do feed da Shopee (Shopee Oficial BR)");
if (!links.length) { log("- ❌ Secret SHOPEE_FEED_OFICIAL vazio ou sem link"); fim(); process.exit(1); }
const u = new URL(links[0]);
log(`- Links no Secret: ${links.length}`);
log(`- Endereço: ${u.host}${u.pathname} · parâmetros: ${[...u.searchParams.keys()].join(", ") || "nenhum"}`);
// Data de validade escondida em algum parâmetro? (número de 10 ou 13 dígitos)
for (const [k, v] of u.searchParams) {
  if (/^\d{10}$|^\d{13}$/.test(v)) log(`  - "${k}" parece data: ${new Date(v.length === 10 ? Number(v) * 1000 : Number(v)).toISOString()}`);
}

const inicio = Date.now();
const r = await fetch(links[0], { redirect: "follow" });
log(`- Resposta: ${r.status} · tipo ${r.headers.get("content-type")} · tamanho ${r.headers.get("content-length") || "?"} · ${r.headers.get("content-encoding") || "sem compressão HTTP"}`);
if (r.url !== links[0]) log(`- Redirecionou para: ${new URL(r.url).host}`);
if (!r.ok) { log(`- ❌ Não baixou. Início da resposta: ${(await r.text()).slice(0, 300).replace(/https?:\/\/\S+/g, "[link]")}`); fim(); process.exit(1); }
await pipeline(Readable.fromWeb(r.body), createWriteStream("feed.bin"));
const bytes = statSync("feed.bin").size;
log(`- Baixado: ${(bytes / 1e6).toFixed(1)} MB em ${((Date.now() - inicio) / 1000).toFixed(0)} s`);

// Formato: gzip, zip ou CSV direto
const cabeca = readFileSync("feed.bin").subarray(0, 4);
let arquivo = "feed.bin";
let entrada;
if (cabeca[0] === 0x1f && cabeca[1] === 0x8b) { log("- Formato: gzip"); entrada = createReadStream(arquivo).pipe(createGunzip()); }
else if (cabeca[0] === 0x50 && cabeca[1] === 0x4b) {
  log("- Formato: zip");
  execFileSync("unzip", ["-o", "-q", "feed.bin", "-d", "feed_zip"]);
  const dentro = readdirSync("feed_zip", { recursive: true }).filter((f) => /\.csv$/i.test(f));
  log(`  - Arquivos dentro: ${dentro.join(", ")}`);
  arquivo = `feed_zip/${dentro[0]}`;
  entrada = createReadStream(arquivo);
} else { log("- Formato: texto (CSV)"); entrada = createReadStream(arquivo); }

// Leitor de CSV simples (aspas, vírgulas e quebras de linha dentro de aspas)
let cabecalho = null, linhas = 0, exemplos = [], campo = "", linha = [], aspas = false, anterior = "";
const cheios = [], numeros = {};
const fecharLinha = () => {
  linha.push(campo); campo = "";
  if (!cabecalho) { cabecalho = linha.map((c) => c.replace(/^﻿/, "").trim()); }
  else if (linha.length > 1) {
    linhas++;
    linha.forEach((v, i) => { if (v !== "") cheios[i] = (cheios[i] || 0) + 1; });
    if (exemplos.length < 3) exemplos.push(linha);
    for (const [i, nome] of cabecalho.entries()) {
      if (/sold|vend|sales|rating|price|preco|discount/i.test(nome) && linha[i] !== "" && Number.isFinite(Number(linha[i]))) {
        (numeros[nome] ||= []).length < 200000 && numeros[nome].push(Number(linha[i]));
      }
    }
  }
  linha = [];
};
const decoder = new TextDecoder();
for await (const pedaco of entrada) {
  const texto = decoder.decode(pedaco, { stream: true });
  for (const ch of texto) {
    if (aspas) {
      if (ch === '"') aspas = false; else campo += ch;
    } else if (ch === '"') { if (anterior === '"') campo += '"'; aspas = true; }
    else if (ch === ",") { linha.push(campo); campo = ""; }
    else if (ch === "\n") fecharLinha();
    else if (ch !== "\r") campo += ch;
    anterior = ch;
  }
}
if (campo || linha.length) fecharLinha();

log(`- **Produtos no arquivo: ${linhas.toLocaleString("pt-BR")}**`);
log(`- Colunas (${cabecalho.length}), com % preenchido:`);
for (const [i, nome] of cabecalho.entries()) log(`  - ${nome}: ${Math.round(((cheios[i] || 0) / Math.max(linhas, 1)) * 100)}%`);
const esconder = (v) => String(v).replace(/(https?:\/\/[^/\s]+)\S*/g, "$1/…").slice(0, 90);
log("- Exemplos (links encurtados):");
for (const ex of exemplos) log(`  - ${cabecalho.map((n, i) => `${n}=${esconder(ex[i] ?? "")}`).join(" | ")}`);
for (const [nome, vals] of Object.entries(numeros)) {
  vals.sort((a, b) => a - b);
  const p = (q) => vals[Math.floor((vals.length - 1) * q)];
  log(`- ${nome}: mín ${vals[0]} · mediana ${p(0.5)} · 90% ${p(0.9)} · máx ${vals.at(-1)}`);
}
fim();
