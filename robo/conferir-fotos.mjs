// A IA confere as FOTOS dos produtos (pedido do Giovanni, 11/11/2026; ver lib/iaFotos.js). Abre as buscas como o visitante
// (as sugeridas na caixa de busca, as mais buscadas do mês e as Ofertas do dia), baixa a foto de cada produto, diminui
// (384 px: para ver se é uma balança ou um computador não precisa de mais) e pergunta ao Claude Haiku 5.5 se a foto é do
// produto do nome. Foto reprovada = o produto sai das buscas enquanto tiver essa foto.
// Ordem: primeiro o que o visitante mais vê (Escolha rápida: os mais baratos e os primeiros de cada busca), depois os 24
// primeiros, depois o resto. PARA quando o gasto chega ao teto (US$) ou o tempo acaba; cada foto é conferida uma vez só
// (tabela ia_fotos), então as noites seguintes só olham produto novo.
// Uso: node robo/conferir-fotos.mjs [teto em US$, padrão 0.50] [minutos, padrão 30]
//   (precisa de ANTHROPIC_API_KEY, CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, D1_DATABASE_ID e do pacote sharp)
import { readFileSync, appendFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import { chaveIa } from "../lib/ia.js";
import { TABELA_IA_FOTOS } from "../lib/iaFotos.js";

const MODELO = "claude-haiku-5-5";
// Preço normal do Claude Haiku 5.5, em US$ por milhão de tokens (pedidos de até 100 mil tokens)
const PRECO_ENTRADA = 0.1;
const PRECO_SAIDA = 0.5;
const SITE = "https://vaiprocarrinho.com.br";
const TETO_USD = Math.min(Math.max(Number(process.argv[2]) || 0.5, 0.01), 4); // nunca mais de US$ 4 numa rodada
const MINUTOS = Math.min(Math.max(Number(process.argv[3]) || 30, 1), 150);
const LADO = 384; // lado maior da foto mandada à IA
const POR_PEDIDO = 10; // fotos por pergunta
const PEDIDOS_AO_MESMO_TEMPO = 4;
const BUSCAS = 300; // sugestões da caixa de busca
const BUSCADAS = 150; // + as mais buscadas pelos visitantes no mês
const BUSCAS_AO_MESMO_TEMPO = 2; // limite do Cloudflare: 60 pedidos em 10 s
const PAUSA_MS = 500;
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const inicio = Date.now();
const acabouOTempo = () => Date.now() - inicio > MINUTOS * 60 * 1000;
const resumo = [];
const anotar = (linha) => { console.log(linha); resumo.push(linha); };
const fim = () => { if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, resumo.join("\n") + "\n"); };

const { ANTHROPIC_API_KEY, CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: conta, D1_DATABASE_ID: banco } = process.env;
anotar("### IA conferindo as fotos");
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
    } catch { /* tenta de novo */ }
  }
  return null;
}

// ---------------------------------------------------------------------
// Fotos
// ---------------------------------------------------------------------
async function baixarFoto(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(10000), headers: { "User-Agent": "Mozilla/5.0 (compatible; vaiprocarrinho-robo)" } });
    if (!r.ok) return null;
    const original = Buffer.from(await r.arrayBuffer());
    if (original.length < 200 || original.length > 15e6) return null;
    const pequena = await sharp(original).rotate().resize(LADO, LADO, { fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" }).jpeg({ quality: 72 }).toBuffer();
    return pequena.toString("base64");
  } catch {
    return null; // foto que não abre ou não é imagem: não é assunto daqui (o site já trata foto quebrada)
  }
}

const INSTRUCOES = `Você confere as fotos de um site brasileiro comparador de preços.
Recebe uma lista numerada: o nome de cada produto, seguido da foto que o site mostra para ele.
Para cada item, diga se a foto serve para aquele produto (ok):
- ok = true: a foto mostra o produto do nome, ou algo compatível com ele. Vale outra cor, outro modelo ou tamanho, embalagem, kit, o produto em uso, detalhe do produto, foto com texto ou selo de propaganda por cima, desenho ou ilustração do produto.
- ok = false: a foto mostra claramente OUTRO tipo de produto (nome "computador" e foto de uma balança), ou não mostra produto nenhum (só um logotipo, imagem vazia, aviso de "sem foto").
Os nomes muitas vezes são traduzidos automaticamente e têm palavras soltas: julgue pelo tipo de produto.
Na dúvida, responda true. Responda todos os itens, usando o número de cada um.`;

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

let entrada = 0, saida = 0, falhas = 0, semFoto = 0;
const custo = () => (entrada * PRECO_ENTRADA + saida * PRECO_SAIDA) / 1e6;
// Um pedido de 10 fotos custa bem menos que isto; a folga garante que o teto não é passado com pedidos em andamento
const FOLGA_USD = 0.02 * PEDIDOS_AO_MESMO_TEMPO;
const podeGastar = () => custo() + FOLGA_USD < TETO_USD;

// Devolve [[produto, ok]] dos que a IA respondeu
async function perguntar(lote) {
  const fotos = await Promise.all(lote.map((o) => baixarFoto(o.imagem)));
  const itens = lote.map((o, i) => ({ o, foto: fotos[i] })).filter((x) => x.foto);
  semFoto += lote.length - itens.length;
  if (!itens.length || !podeGastar()) return [];
  const content = itens.flatMap(({ o, foto }, i) => [
    { type: "text", text: `${i + 1}. ${String(o.titulo).slice(0, 200)}` },
    { type: "image", source: { type: "base64", media_type: "image/jpeg", data: foto } },
  ]);
  try {
    const msg = await claude.messages.create({
      model: MODELO,
      max_tokens: 4000,
      output_config: { effort: "low", format: { type: "json_schema", schema: ESQUEMA } },
      system: INSTRUCOES,
      messages: [{ role: "user", content }],
    });
    entrada += msg.usage.input_tokens;
    saida += msg.usage.output_tokens;
    const bloco = msg.content.find((b) => b.type === "text");
    const respostas = [];
    const vistos = new Set();
    for (const { n, ok } of JSON.parse(bloco?.text || "{}").itens || []) {
      if (itens[n - 1] && !vistos.has(n)) { vistos.add(n); respostas.push([itens[n - 1].o, ok]); }
    }
    return respostas;
  } catch (erro) {
    falhas++;
    console.log(`Erro na IA: ${String(erro.message || erro).slice(0, 200)}`);
    return [];
  }
}

// ---------------------------------------------------------------------
await d1(TABELA_IA_FOTOS);
const conferidas = new Map(); // nome do produto -> foto já conferida
for (let desde = 0; ;) {
  const linhas = await d1("SELECT rowid AS r, chave, foto FROM ia_fotos WHERE rowid > ? ORDER BY rowid LIMIT 50000", [desde]);
  if (!linhas.length) break;
  for (const l of linhas) conferidas.set(l.chave, l.foto);
  desde = linhas.at(-1).r;
}

let termos = [];
try {
  termos = ((await (await fetch(`${SITE}/api/vocabulario?v=3`)).json()).termos || []).slice(0, BUSCAS);
} catch {}
try {
  const desde = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const buscadas = await d1(
    "SELECT MAX(texto) AS texto FROM buscas WHERE dia >= ? GROUP BY termo ORDER BY SUM(total) DESC LIMIT ?", [desde, BUSCADAS]);
  const ja = new Set(termos.map((t) => chaveIa(t)));
  for (const { texto: t } of buscadas) if (t && !ja.has(chaveIa(t))) { termos.push(t); ja.add(chaveIa(t)); }
} catch {}
termos.unshift(""); // as Ofertas do dia da página inicial

// Fila em 3 níveis: 0 = Escolha rápida (os 3 mais baratos e os 6 primeiros de cada busca, e as Ofertas do dia);
// 1 = os 24 primeiros e os 10 mais baratos; 2 = o resto que aparece como produto
const niveis = [new Map(), new Map(), new Map()];
const naFila = new Set();
const por = (nivel, o) => {
  const chave = chaveIa(o.titulo || "");
  if (!chave || !o.imagem || !/^https:\/\//.test(o.imagem) || naFila.has(chave) || conferidas.get(chave) === o.imagem) return;
  naFila.add(chave);
  niveis[nivel].set(chave, o);
};
let abertas = 0;
for (let i = 0; i < termos.length && !acabouOTempo(); i += BUSCAS_AO_MESMO_TEMPO) {
  await Promise.all(termos.slice(i, i + BUSCAS_AO_MESMO_TEMPO).map(async (q) => {
    const d = await abrir(`q=${encodeURIComponent(q)}`);
    if (!d?.ofertas) return;
    abertas++;
    const produtos = d.ofertas.filter((o) => !o.acessorio);
    const baratos = produtos.filter((o) => o.preco > 0).sort((a, b) => a.preco - b.preco);
    const primeiros = q ? produtos.filter((o) => o.principal) : produtos;
    for (const o of q ? [...baratos.slice(0, 3), ...primeiros.slice(0, 6)] : produtos) por(0, o);
    for (const o of [...primeiros.slice(0, 24), ...baratos.slice(0, 10)]) por(1, o);
    for (const o of produtos) por(2, o);
  }));
  await espera(PAUSA_MS);
}
const fila = niveis.flatMap((m, nivel) => [...m.values()].map((o) => ({ o, nivel })));
anotar(`- ${abertas} de ${termos.length} buscas abertas; fotos ainda não conferidas: ${niveis[0].size} da Escolha rápida, ` +
  `${niveis[1].size} entre os primeiros e ${niveis[2].size} no resto`);

const novas = []; // [chave, ok, foto]
const reprovadas = []; // { titulo, loja, foto, nivel }
const feitasPorNivel = [0, 0, 0];
let proximo = 0;
let parou = "";
await Promise.all(Array.from({ length: PEDIDOS_AO_MESMO_TEMPO }, async () => {
  while (proximo < fila.length) {
    if (!podeGastar()) { parou = `chegou ao teto de US$ ${TETO_USD.toFixed(2)}`; return; }
    if (acabouOTempo()) { parou = `acabou o tempo (${MINUTOS} min)`; return; }
    const lote = fila.slice(proximo, proximo + POR_PEDIDO);
    proximo += lote.length;
    const nivelDe = new Map(lote.map((x) => [x.o, x.nivel]));
    for (const [o, ok] of await perguntar(lote.map((x) => x.o))) {
      novas.push([chaveIa(o.titulo), ok, o.imagem]);
      feitasPorNivel[nivelDe.get(o)]++;
      if (!ok) reprovadas.push({ titulo: o.titulo, loja: o.lojaNome || o.loja, foto: o.imagem, nivel: nivelDe.get(o) });
    }
  }
}));

// Grava (aprovadas e reprovadas: nenhuma é perguntada de novo enquanto a foto for a mesma)
const agora = Date.now();
let lote = [];
let tamanho = 0;
const enviar = async () => {
  if (lote.length) await d1(`INSERT OR REPLACE INTO ia_fotos (chave, ok, quando, foto) VALUES ${lote.join(",")}`);
  lote = [];
  tamanho = 0;
};
for (const [chave, ok, foto] of novas) {
  const valor = `(${texto(chave)},${ok ? 1 : 0},${agora},${texto(foto)})`;
  if (tamanho + valor.length > 90000) await enviar();
  lote.push(valor);
  tamanho += valor.length + 1;
}
await enviar();

anotar(`- Fotos conferidas: ${novas.length} (${feitasPorNivel[0]} da Escolha rápida, ${feitasPorNivel[1]} entre os primeiros, ${feitasPorNivel[2]} no resto); ` +
  `ficaram para a próxima rodada: ${Math.max(fila.length - proximo, 0)}${parou ? ` (${parou})` : ""}`);
anotar(`- Fotos que não abriram (puladas): ${semFoto}; perguntas à IA com erro: ${falhas}`);
anotar(`- **Reprovadas (a foto não é do produto; saem das buscas): ${reprovadas.length}**`);
anotar(`- Custo: US$ ${custo().toFixed(4)} de até US$ ${TETO_USD.toFixed(2)} (${entrada.toLocaleString("pt-BR")} tokens de entrada, ${saida.toLocaleString("pt-BR")} de saída` +
  `${novas.length ? `; US$ ${(custo() / novas.length * 1000).toFixed(3)} por mil fotos` : ""}); ${Math.round((Date.now() - inicio) / 60000)} min`);
if (reprovadas.length) {
  anotar("#### Fotos reprovadas");
  for (const r of reprovadas.slice(0, 300)) anotar(`- (${r.loja}) ${String(r.titulo).slice(0, 110)} — ${r.foto}`);
  if (reprovadas.length > 300) anotar(`- … e mais ${reprovadas.length - 300}`);
}
fim();
