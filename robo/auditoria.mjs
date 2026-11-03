// Auditoria da busca: roda depois das buscas prontas (robo-precos.yml, job "auditoria").
// Abre no site as buscas mais comuns e lista os produtos suspeitos no topo (ver lib/auditoria.js).
// Uso: node robo/auditoria.mjs [quantidade de buscas]   (resumo no $GITHUB_STEP_SUMMARY, se existir)
import { paraPainel } from "./painel.mjs";
import { readFileSync, appendFileSync } from "node:fs";
import { auditarBusca } from "../lib/auditoria.js";
import { termosParaSugestoes } from "../lib/vocabulario.js";

const SITE = "https://vaiprocarrinho.com.br";
const QUANTAS = Number(process.argv[2]) || 150;
// Limite de pedidos do Cloudflare: 60 em 10 s por IP. Com 2 ao mesmo tempo e sem pausa, 66 de 150 buscas deram 429
// (as prontas respondem em ~0,1 s); com a pausa ficam no máximo ~4 por segundo
const AO_MESMO_TEMPO = 2;
const PAUSA_MS = 500;
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
// Mesma versão do cache que o site usa: assim pega as buscas prontas (respondem na hora)
const versao = readFileSync(new URL("../functions/api/buscar.js", import.meta.url), "utf8").match(/const VERSAO_CACHE = (\d+)/)[1];

async function abrir(q) {
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    try {
      const r = await fetch(`${SITE}/api/buscar?v=${versao}&atalho=1&q=${encodeURIComponent(q)}`, { signal: AbortSignal.timeout(30000) });
      if (r.ok) return await r.json();
      if (r.status === 429) await espera(11000); // bloqueado por 10 s: espera e tenta de novo
    } catch {}
  }
  return null;
}

const termos = termosParaSugestoes([]).slice(0, QUANTAS);
const resultados = [];
const aparicoes = new Map(); // loja -> em quantas buscas apareceu
let falhas = 0;
for (let i = 0; i < termos.length; i += AO_MESMO_TEMPO) {
  await Promise.all(termos.slice(i, i + AO_MESMO_TEMPO).map(async (q) => {
    const d = await abrir(q);
    if (!d?.ofertas) { falhas++; return; }
    for (const loja of new Set(d.ofertas.map((o) => o.loja))) aparicoes.set(loja, (aparicoes.get(loja) || 0) + 1);
    const suspeitos = auditarBusca(d.q || q, d.ofertas);
    if (suspeitos.length) resultados.push({ q: d.q || q, suspeitos });
  }));
  await espera(PAUSA_MS);
}

resultados.sort((a, b) => b.suspeitos.length - a.suspeitos.length);
const total = resultados.reduce((n, r) => n + r.suspeitos.length, 0);
const linhas = [`### Auditoria da busca`, `- ${termos.length} buscas olhadas (${falhas} não abriram); ${resultados.length} com suspeitos no topo, ${total} produtos`];
for (const { q, suspeitos } of resultados) {
  linhas.push(`- **${q}**`);
  for (const s of suspeitos) linhas.push(`  - ${s.posicao}º R$ ${s.preco} (${s.loja}) ${s.titulo.slice(0, 90)} — ${s.motivos.join(", ")}`);
}
const lojas = await conferirLojas();
linhas.push(...lojas);
paraPainel("auditoria", {
  linhas: [linhas[1], resultados.length ? `Mais suspeitos: ${resultados.slice(0, 5).map((r) => `${r.q} (${r.suspeitos.length})`).join(", ")}` : null],
  avisos: falhas > termos.length / 10 ? [`${falhas} de ${termos.length} buscas não abriram`] : [],
});
// Lojas nas buscas: 🆕 loja nova e ⚠️ loja invisível viram aviso; o resto, uma linha só
const avisosLojas = lojas.filter((l) => /🆕|⚠️/.test(l));
paraPainel("lojas", {
  linhas: [`${lojas.filter((l) => / apareceu em /.test(l)).length} lojas da Awin aparecem nas buscas comuns`],
  avisos: avisosLojas,
});
const texto = linhas.join("\n");
console.log(texto);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, texto + "\n");

// Lojas que não aparecem (02/11/2026): a Cama In Box entrou na Awin em ~31/10 e ficou 2 dias sem aparecer em nenhuma
// busca, e nada avisava (a auditoria só olhava o que aparece). Para cada loja da Awin com 20+ produtos: em quantas das
// buscas acima ela apareceu; se em nenhuma, busca as palavras dos próprios produtos dela ("Sofá", "Colchão"). Se nem
// assim aparece = ⚠️ loja invisível (aviso amarelo na execução). Loja com produtos de até 3 dias = 🆕 loja nova.
async function conferirLojas() {
  const saida = ["### Lojas nas buscas"];
  let lojas = [];
  try {
    lojas = (await (await fetch(`${SITE}/api/lojas`, { signal: AbortSignal.timeout(30000) })).json()).lojas || [];
  } catch {
    return [...saida, "- ⚠️ não deu para abrir a lista de lojas"];
  }
  for (const l of lojas.filter((x) => x.rede === "awin" && x.produtos >= 20)) {
    const chave = l.id.replace(/^awin:/, "");
    let produtos = [];
    try {
      const r = await fetch(`${SITE}/api/lojas?id=${encodeURIComponent(l.id)}&pagina=1`, { signal: AbortSignal.timeout(30000) });
      produtos = (await r.json()).ofertas || [];
    } catch {}
    await espera(PAUSA_MS);
    const nova = produtos.length > 0 && produtos.every((o) => (o.historico?.dias ?? 99) <= 3);
    const vezes = aparicoes.get(chave) || 0;
    if (nova) {
      saida.push(`- 🆕 **${l.nome}** é loja nova (${l.produtos} produtos): conferir categorias, fotos e buscas`);
      console.log(`::notice::Loja nova na Awin: ${l.nome} (${l.produtos} produtos)`);
    }
    if (vezes) {
      saida.push(`- ${l.nome}: apareceu em ${vezes} de ${termos.length} buscas`);
      continue;
    }
    // Nenhuma das buscas comuns: tenta as palavras dos produtos dela (a 1ª palavra mais comum dos títulos)
    const contagem = new Map();
    for (const o of produtos) {
      const p = String(o.titulo || "").split(/\s+/).find((w) => /^[\p{L}]{4,}$/u.test(w) && !/^kit$/i.test(w));
      if (p) contagem.set(p.toLowerCase(), (contagem.get(p.toLowerCase()) || 0) + 1);
    }
    const palavras = [...contagem.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([p]) => p);
    const achou = [];
    for (const q of palavras) {
      const d = await abrir(q);
      if (d?.ofertas?.some((o) => o.loja === chave)) achou.push(q);
      await espera(PAUSA_MS);
    }
    if (achou.length) {
      saida.push(`- ${l.nome}: nenhuma das buscas comuns, mas aparece em: ${achou.join(", ")}`);
    } else {
      saida.push(`- ⚠️ **${l.nome}** (${l.produtos} produtos) NÃO aparece em nenhuma busca (nem em: ${palavras.join(", ") || "—"})`);
      console.log(`::warning::Loja invisível nas buscas: ${l.nome} (${l.produtos} produtos)`);
    }
  }
  return saida;
}
