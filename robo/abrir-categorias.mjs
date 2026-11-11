// Abre as 40 categorias do site toda manhã, depois dos robôs da noite (ideia do Giovanni, 11/11/2026: "um robô que abre o
// site e clica nas categorias já deixa o site pronto para uso pela manhã"). O robô da noite já prepara as categorias; este
// passo é a garantia: categoria que ficou sem lista pronta é montada aqui (a visita guarda a pronta, functions/api/buscar.js),
// e o resumo mostra quanto cada uma demorou. Não usa IA e não custa nada.
// Uso: node robo/abrir-categorias.mjs
import { readFileSync, appendFileSync } from "node:fs";
import { categoriasParaPreparar } from "../lib/categorias.js";

const SITE = "https://vaiprocarrinho.com.br";
const LENTA_MS = 3000;
const versao = readFileSync(new URL("../functions/api/buscar.js", import.meta.url), "utf8").match(/const VERSAO_CACHE = (\d+)/)[1];
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const resumo = [];
const anotar = (linha) => { console.log(linha); resumo.push(linha); };

// O mesmo endereço que o site pede ao tocar na categoria; atalho=1 = não conta como busca de visitante
async function abrir({ nome, busca }) {
  const inicio = Date.now();
  try {
    const r = await fetch(`${SITE}/api/buscar?v=${versao}&q=${encodeURIComponent(busca)}&cat=${encodeURIComponent(nome)}&atalho=1`,
      { signal: AbortSignal.timeout(60000) });
    const dados = r.ok ? await r.json() : null;
    return { nome, ms: Date.now() - inicio, ofertas: dados?.ofertas?.length || 0, status: r.status };
  } catch (erro) {
    return { nome, ms: Date.now() - inicio, ofertas: 0, status: 0, erro: String(erro.message || erro).slice(0, 80) };
  }
}

anotar("### Categorias abertas pela manhã");
const categorias = categoriasParaPreparar();
const primeira = [];
for (const c of categorias) {
  primeira.push(await abrir(c));
  await espera(300); // limite do Cloudflare: 60 pedidos em 10 s
}
const lentas = primeira.filter((r) => r.ms > LENTA_MS || !r.ofertas);
// As que demoraram foram montadas agora: abre de novo para conferir que ficaram prontas
const segunda = [];
if (lentas.length) {
  await espera(5000);
  for (const r of lentas) {
    segunda.push(await abrir(categorias.find((c) => c.nome === r.nome)));
    await espera(300);
  }
}
const seg = (ms) => `${(ms / 1000).toFixed(1).replace(".", ",")} s`;
const aindaLentas = segunda.filter((r) => r.ms > LENTA_MS || !r.ofertas);
anotar(`- ${categorias.length} categorias abertas; ${primeira.length - lentas.length} já estavam prontas (até ${seg(LENTA_MS)}); ` +
  `${lentas.length} precisaram ser montadas agora`);
for (const r of lentas) {
  const d = segunda.find((x) => x.nome === r.nome);
  anotar(`  - ${r.nome}: ${seg(r.ms)}${r.ofertas ? "" : ` (sem ofertas, resposta ${r.status}${r.erro ? `: ${r.erro}` : ""})`} → na 2ª vez ${d ? seg(d.ms) : "-"}${d && !d.ofertas ? " (sem ofertas)" : ""}`);
}
anotar(aindaLentas.length
  ? `- ⚠️ Continuam lentas ou vazias depois de abrir de novo: ${aindaLentas.map((r) => r.nome).join(", ")}`
  : "- ✅ Todas as categorias respondem rápido");
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, resumo.join("\n") + "\n");
