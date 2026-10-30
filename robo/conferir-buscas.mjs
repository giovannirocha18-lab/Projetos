// A IA confere as buscas sugeridas (pedido do Giovanni, 30/10/2026; ver lib/iaBusca.js). Roda depois da auditoria.
// Para cada busca da caixa de sugestões: abre como o visitante (1ª resposta e o lote seguinte), separa os produtos
// mostrados como "o produto buscado" que estão fora das categorias da busca e pergunta ao Claude Haiku 5.5 se cada um
// é mesmo o que a pessoa procura. "Não" = o site manda para "Ver também… produtos parecidos" daquela busca.
// "Sim" fora da categoria = categoria talvez errada: vai para o resumo (o Claude corrige as regras).
// Cada título é perguntado uma vez por busca (tabela ia_busca). Usa a API normal (não o lote): resposta na hora.
// Uso: node robo/conferir-buscas.mjs [quantidade de buscas]
//   (precisa de ANTHROPIC_API_KEY, CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID e D1_DATABASE_ID)
import { readFileSync, appendFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { chaveIa } from "../lib/ia.js";
import { TABELA_IA_BUSCA, termoIa, foraDasCategorias, categoriasDaBusca } from "../lib/iaBusca.js";

const MODELO = "claude-haiku-5-5";
// Preço normal (sem lote) do Claude Haiku 5.5, em US$ por milhão de tokens
const PRECO_ENTRADA = 0.1;
const PRECO_SAIDA = 0.5;
const SITE = "https://vaiprocarrinho.com.br";
const QUANTAS = Number(process.argv[2]) || 300;
const POR_PEDIDO = 80; // títulos por pergunta à IA
const AO_MESMO_TEMPO = 2; // buscas abertas ao mesmo tempo (limite do Cloudflare: 60 pedidos em 10 s; ver robo/auditoria.mjs)
const PAUSA_MS = 500;
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const resumo = [];
const anotar = (linha) => { console.log(linha); resumo.push(linha); };
const fim = () => { if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, resumo.join("\n") + "\n"); };

const { ANTHROPIC_API_KEY, CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: conta, D1_DATABASE_ID: banco } = process.env;
anotar("### IA conferindo as buscas");
if (!ANTHROPIC_API_KEY || !token || !conta || !banco) {
  anotar("- Faltam os segredos ANTHROPIC_API_KEY e/ou do Cloudflare: não rodou");
  fim();
  process.exit(0);
}
const claude = new Anthropic();

async function d1(sql, params = []) {
  for (let tentativa = 1; ; tentativa++) {
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${conta}/d1/database/${banco}/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ sql, params }),
    });
    const json = await r.json().catch(() => ({}));
    if (r.ok && json.success) return json.result[0].results;
    const erro = `D1 respondeu ${r.status}: ${JSON.stringify(json.errors || json).slice(0, 300)}`;
    if (tentativa >= 4 || (r.status < 500 && r.status !== 429)) throw new Error(erro);
    await espera(2000 * 2 ** tentativa);
  }
}
const texto = (s) => `'${String(s).replace(/'/g, "''")}'`;

async function gravar(linhas) {
  const agora = Date.now();
  let lote = [];
  let tamanho = 0;
  const enviar = async () => {
    if (lote.length) await d1(`INSERT OR REPLACE INTO ia_busca (termo, chave, ok, quando) VALUES ${lote.join(",")}`);
    lote = [];
    tamanho = 0;
  };
  for (const [termo, chave, ok] of linhas) {
    const valor = `(${texto(termo)},${texto(chave)},${ok ? 1 : 0},${agora})`;
    if (tamanho + valor.length > 90000) await enviar();
    lote.push(valor);
    tamanho += valor.length + 1;
  }
  await enviar();
}

async function jaConferidos() {
  const vistos = new Set();
  for (let desde = 0; ;) {
    const linhas = await d1("SELECT rowid AS r, termo, chave FROM ia_busca WHERE rowid > ? ORDER BY rowid LIMIT 50000", [desde]);
    if (!linhas.length) break;
    for (const l of linhas) vistos.add(`${l.termo}|${l.chave}`);
    desde = linhas.at(-1).r;
  }
  return vistos;
}

// ---------------------------------------------------------------------
// Buscas, do jeito que o visitante vê
// ---------------------------------------------------------------------
const versao = readFileSync(new URL("../functions/api/buscar.js", import.meta.url), "utf8").match(/const VERSAO_CACHE = (\d+)/)[1];
async function abrir(endereco) {
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    try {
      const r = await fetch(`${SITE}/api/buscar?v=${versao}&atalho=1&${endereco}`, { signal: AbortSignal.timeout(30000) });
      if (r.ok) return await r.json();
      if (r.status === 429) await espera(11000);
    } catch {}
  }
  return null;
}
// 1ª resposta + o lote que o site pede sozinho logo depois (o "Automotivo 1" de "jogo de ferramentas" vinha dele)
async function abrirBusca(q) {
  const d = await abrir(`q=${encodeURIComponent(q)}`);
  if (!d?.ofertas) return null;
  const ofertas = [...d.ofertas];
  if (d.mais) {
    const seguinte = await abrir(`q=${encodeURIComponent(q)}&${d.mais}`);
    const vistos = new Set(ofertas.map((o) => o.id));
    for (const o of seguinte?.ofertas || []) if (!vistos.has(o.id)) ofertas.push(o);
  }
  return { q: d.q || q, ofertas };
}

// ---------------------------------------------------------------------
// Pergunta à IA
// ---------------------------------------------------------------------
const INSTRUCOES = `Você confere os resultados da busca de um site brasileiro comparador de preços.
Recebe o que a pessoa buscou e uma lista numerada de títulos de produtos (muitos traduzidos automaticamente, com palavras soltas).
Para cada título, diga se o produto É o que a pessoa procura:
- sim: é o próprio produto buscado, de qualquer marca, modelo, tamanho, cor ou versão (ex.: busca "jogo de ferramentas" e título "Kit Maleta 46 Peças Chaves Soquete").
- não: é outro produto que só cita as palavras da busca em outro sentido, uma peça ou acessório dele, um brinquedo/miniatura dele, ou algo para outro uso (ex.: busca "jogo de ferramentas" e título "Jogo de Chá Matcha … ferramentas de cozinha" ou "Conjunto de Jogos de Tabuleiro … Ferramenta").
Na dúvida, responda sim. Responda com uma linha por título, usando o número dele.`;

const ESQUEMA = {
  type: "object",
  properties: {
    itens: {
      type: "array",
      items: {
        type: "object",
        properties: { n: { type: "integer" }, ok: { type: "boolean" } },
        required: ["n", "ok"],
        additionalProperties: false,
      },
    },
  },
  required: ["itens"],
  additionalProperties: false,
};

let entrada = 0, saida = 0, falhas = 0;
async function perguntar(q, titulos) {
  const respostas = new Map();
  for (let i = 0; i < titulos.length; i += POR_PEDIDO) {
    const parte = titulos.slice(i, i + POR_PEDIDO);
    try {
      const msg = await claude.messages.create({
        model: MODELO,
        max_tokens: 4000,
        output_config: { effort: "low", format: { type: "json_schema", schema: ESQUEMA } },
        system: INSTRUCOES,
        messages: [{ role: "user", content: `Busca: "${q}"\n\n${parte.map((t, j) => `${j + 1}. ${t.slice(0, 200)}`).join("\n")}` }],
      });
      entrada += msg.usage.input_tokens;
      saida += msg.usage.output_tokens;
      const bloco = msg.content.find((b) => b.type === "text");
      for (const { n, ok } of JSON.parse(bloco?.text || "{}").itens || []) {
        if (parte[n - 1] && !respostas.has(parte[n - 1])) respostas.set(parte[n - 1], ok);
      }
    } catch (erro) {
      falhas++;
      console.log(`Erro na IA (${q}): ${String(erro.message || erro).slice(0, 200)}`);
    }
  }
  return respostas;
}

// ---------------------------------------------------------------------
await d1(TABELA_IA_BUSCA);
const vistos = await jaConferidos();
let termos = [];
try {
  termos = (await (await fetch(`${SITE}/api/vocabulario?v=3`)).json()).termos || [];
} catch {}
termos = termos.slice(0, QUANTAS);

const naoSao = []; // { q, titulo, secao, loja }
const categoriaDuvidosa = []; // { q, titulo, secao, cats }
let abertas = 0, perguntados = 0;
const novas = [];
for (let i = 0; i < termos.length; i += AO_MESMO_TEMPO) {
  await Promise.all(termos.slice(i, i + AO_MESMO_TEMPO).map(async (q0) => {
    const busca = await abrirBusca(q0);
    if (!busca) return;
    abertas++;
    const { q, ofertas } = busca;
    const termo = termoIa(q);
    const porChave = new Map();
    for (const o of foraDasCategorias(ofertas)) {
      const chave = chaveIa(o.titulo || "");
      if (chave && !vistos.has(`${termo}|${chave}`) && !porChave.has(chave)) porChave.set(chave, o);
    }
    if (!porChave.size) return;
    const lista = [...porChave.values()];
    perguntados += lista.length;
    const respostas = await perguntar(q, lista.map((o) => o.titulo));
    const cats = [...(categoriasDaBusca(ofertas) || [])].map((c) => c || "Outros").join(" + ");
    for (const o of lista) {
      if (!respostas.has(o.titulo)) continue;
      const ok = respostas.get(o.titulo);
      novas.push([termo, chaveIa(o.titulo), ok]);
      vistos.add(`${termo}|${chaveIa(o.titulo)}`);
      const item = { q, titulo: o.titulo, secao: o.secao || "Outros", loja: o.lojaNome || o.loja, cats };
      (ok ? categoriaDuvidosa : naoSao).push(item);
    }
  }));
  await espera(PAUSA_MS);
}
await gravar(novas);

const custo = (entrada * PRECO_ENTRADA + saida * PRECO_SAIDA) / 1e6;
anotar(`- ${abertas} de ${termos.length} buscas abertas; ${perguntados} produtos fora da categoria da busca perguntados à IA (${falhas} perguntas com erro)`);
anotar(`- Não são o produto buscado (saem do meio dos resultados daquela busca): ${naoSao.length}`);
anotar(`- São o produto, mas em outra categoria (conferir as regras de categoria): ${categoriaDuvidosa.length}`);
anotar(`- Custo: US$ ${custo.toFixed(4)} (${entrada.toLocaleString("pt-BR")} tokens de entrada, ${saida.toLocaleString("pt-BR")} de saída)`);
const listar = (titulo, itens, comCats) => {
  if (!itens.length) return;
  anotar(`#### ${titulo}`);
  const porBusca = new Map();
  for (const it of itens) porBusca.set(it.q, [...(porBusca.get(it.q) || []), it]);
  for (const [q, lista] of porBusca) {
    anotar(`- **${q}**${comCats ? ` (categoria da busca: ${lista[0].cats})` : ""}`);
    for (const it of lista.slice(0, 15)) anotar(`  - [${it.secao}] (${it.loja}) ${it.titulo.slice(0, 100)}`);
    if (lista.length > 15) anotar(`  - … e mais ${lista.length - 15}`);
  }
};
listar("Escondidos pela IA", naoSao, false);
listar("Categoria a conferir", categoriaDuvidosa, true);
fim();
