// Auditoria da busca: roda depois das buscas prontas (robo-precos.yml, job "auditoria").
// Abre no site as buscas mais comuns e lista os produtos suspeitos no topo (ver lib/auditoria.js).
// Uso: node robo/auditoria.mjs [quantidade de buscas]   (resumo no $GITHUB_STEP_SUMMARY, se existir)
import { readFileSync, appendFileSync } from "node:fs";
import { auditarBusca } from "../lib/auditoria.js";
import { termosParaSugestoes } from "../lib/vocabulario.js";

const SITE = "https://vaiprocarrinho.com.br";
const QUANTAS = Number(process.argv[2]) || 150;
const AO_MESMO_TEMPO = 2; // bem abaixo do limite de pedidos do Cloudflare (60 em 10 s por IP)
// Mesma versão do cache que o site usa: assim pega as buscas prontas (respondem na hora)
const versao = readFileSync(new URL("../functions/api/buscar.js", import.meta.url), "utf8").match(/const VERSAO_CACHE = (\d+)/)[1];

async function abrir(q) {
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    try {
      const r = await fetch(`${SITE}/api/buscar?v=${versao}&atalho=1&q=${encodeURIComponent(q)}`, { signal: AbortSignal.timeout(30000) });
      if (r.ok) return await r.json();
    } catch {}
  }
  return null;
}

const termos = termosParaSugestoes([]).slice(0, QUANTAS);
const resultados = [];
let falhas = 0;
for (let i = 0; i < termos.length; i += AO_MESMO_TEMPO) {
  await Promise.all(termos.slice(i, i + AO_MESMO_TEMPO).map(async (q) => {
    const d = await abrir(q);
    if (!d?.ofertas) { falhas++; return; }
    const suspeitos = auditarBusca(d.q || q, d.ofertas);
    if (suspeitos.length) resultados.push({ q: d.q || q, suspeitos });
  }));
}

resultados.sort((a, b) => b.suspeitos.length - a.suspeitos.length);
const total = resultados.reduce((n, r) => n + r.suspeitos.length, 0);
const linhas = [`### Auditoria da busca`, `- ${termos.length} buscas olhadas (${falhas} não abriram); ${resultados.length} com suspeitos no topo, ${total} produtos`];
for (const { q, suspeitos } of resultados) {
  linhas.push(`- **${q}**`);
  for (const s of suspeitos) linhas.push(`  - ${s.posicao}º R$ ${s.preco} (${s.loja}) ${s.titulo.slice(0, 90)} — ${s.motivos.join(", ")}`);
}
const texto = linhas.join("\n");
console.log(texto);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, texto + "\n");
