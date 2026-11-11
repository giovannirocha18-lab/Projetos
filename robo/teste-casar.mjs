// TESTE (pedido do Giovanni, 11/11/2026): a IA consegue dizer se dois anúncios de lojas diferentes são o MESMO produto?
// É o que um robô da noite precisaria para montar o Modo comparação com menos erro e para casar celulares, que não têm
// código de modelo no nome. Só lê as buscas do site e pergunta à IA; não grava nada no banco nem muda o site.
// Dois tipos de par:
//   A) "código": a regra do Modo comparação já juntou (mesma marca + mesmo código de modelo) — a IA confirma ou separa
//   B) "nome":   sem código (celular, iphone, fone, notebook) — pares de lojas diferentes com nomes parecidos
// Uma pergunta por par (a conferência de fotos mostrou que várias de uma vez confunde a IA).
// Uso: node robo/teste-casar.mjs [máximo de pares, padrão 160]
import Anthropic from "@anthropic-ai/sdk";
import { appendFileSync } from "node:fs";
import { MARCAS } from "../lib/vocabulario.js";
import { MARCA_APELIDOS } from "../lib/marcas.js";

const MODELO = "claude-haiku-5-5";
const PRECO_ENTRADA = 0.1; // US$ por milhão de tokens (os mesmos números de robo/conferir-buscas.mjs)
const PRECO_SAIDA = 0.5;
const TETO_US = 0.2;
const MAX_PARES = Math.min(Number(process.argv[2]) || 160, 300);
const SITE = "https://vaiprocarrinho.com.br";
const BUSCAS_CODIGO = ["geladeira", "micro-ondas", "smart tv 55", "air fryer", "furadeira", "lava e seca"];
const BUSCAS_NOME = ["celular", "iphone", "fone bluetooth", "notebook"];

const norm = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const marcas = [...new Set(MARCAS.map((m) => norm(m)))].filter((m) => m.length > 1).sort((a, b) => b.length - a.length);
const MEDIDA = /^\d+([.,]\d+)?(v|w|l|ml|kg|g|gb|tb|mb|mah|hz|khz|mhz|ghz|btus?|pol|k|p|cm|mm|m|un|pcs?|x|rpm|fps|mp|db|bar|psi|lm|kwh|cv|hp|dpi|ms|bits?|pecas?|em\d)$/;
const TERMO = new Set(["110v", "127v", "220v", "bivolt", "4k", "8k", "5g", "4g", "wifi6", "ipx4", "ipx5", "ipx7", "ip67", "ip68", "1080p", "720p", "2em1", "3em1", "4em1", "5em1", "mp3", "mp4", "hdr10"]);
function marcaDe(titulo) {
  const t = ` ${norm(titulo).replace(/[^a-z0-9]+/g, " ")} `;
  const m = marcas.find((x) => t.includes(` ${x} `));
  if (m) return m;
  for (const [apelido, dona] of Object.entries(MARCA_APELIDOS)) if (t.includes(` ${apelido} `)) return norm(dona);
  return null;
}
function codigoDe(titulo) {
  const t = norm(titulo).replace(/[^a-z0-9+.\-/ ]/g, " ");
  const cs = t.split(/\s+/).map((p) => p.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, ""))
    .filter((p) => p.length >= 4 && /[a-z]/.test(p) && /\d/.test(p) && !MEDIDA.test(p) && !TERMO.has(p) && !/^\d+x\d+/.test(p)
      && !/^\d+(gb|tb|w|v|l|ml|mah|hz|pol|btus?|kg|g|cm|mm|k|p)(\/|$)/.test(p))
    .map((p) => p.replace(/[^a-z0-9]/g, "")).filter((p) => p.length >= 4);
  return cs.sort((a, b) => b.length - a.length)[0] || null;
}
const VAZIAS = new Set(["de", "da", "do", "com", "para", "e", "em", "o", "a", "the", "novo", "nova", "original", "lacrado", "promocao", "oferta", "frete", "gratis", "envio", "imediato", "nf", "garantia", "brasil"]);
const palavras = (titulo) => new Set(norm(titulo).replace(/[^a-z0-9]+/g, " ").split(" ").filter((p) => p.length > 1 && !VAZIAS.has(p)));
const parecido = (a, b) => { let n = 0; for (const p of a) if (b.has(p)) n++; return n / (a.size + b.size - n); };

async function buscar(q) {
  const r = await fetch(`${SITE}/api/buscar?v=108&q=${encodeURIComponent(q)}&atalho=1`, { headers: { Cookie: "vpc_nao_contar=1" } });
  const d = await r.json();
  return (d.ofertas || []).filter((o) => o.bate && !o.acessorio && !o.parecido && o.preco > 0);
}

// ---------- monta os pares
const pares = [];
const porBusca = Math.ceil(MAX_PARES / (BUSCAS_CODIGO.length + BUSCAS_NOME.length));
for (const q of BUSCAS_CODIGO) {
  const grupos = new Map();
  for (const o of await buscar(q)) {
    const marca = marcaDe(o.titulo), cod = codigoDe(o.titulo);
    if (!marca || !cod) continue;
    const g = grupos.get(`${marca}|${cod}`) || new Map();
    if (!g.has(o.loja) || g.get(o.loja).preco > o.preco) g.set(o.loja, o);
    grupos.set(`${marca}|${cod}`, g);
  }
  let n = 0;
  // Primeiro os grupos de preços mais afastados (os mais duvidosos), depois os outros
  const lista = [...grupos.values()].filter((g) => g.size >= 2).map((g) => [...g.values()].sort((a, b) => a.preco - b.preco))
    .sort((a, b) => b.at(-1).preco / b[0].preco - a.at(-1).preco / a[0].preco);
  for (const g of lista) for (let i = 1; i < g.length && n < porBusca; i++) { pares.push({ tipo: "código", q, a: g[0], b: g[i] }); n++; }
}
for (const q of BUSCAS_NOME) {
  const of = (await buscar(q)).slice(0, 220).map((o) => ({ o, p: palavras(o.titulo) }));
  const cand = [];
  for (let i = 0; i < of.length; i++) for (let j = i + 1; j < of.length; j++) {
    if (of[i].o.loja === of[j].o.loja) continue;
    const s = parecido(of[i].p, of[j].p);
    if (s >= 0.45) cand.push({ s, a: of[i].o, b: of[j].o });
  }
  cand.sort((x, y) => y.s - x.s);
  const usados = new Set(); let n = 0;
  for (const c of cand) {
    if (n >= porBusca) break;
    if (usados.has(c.a.id) || usados.has(c.b.id)) continue; // cada anúncio em um par só, para variar os casos
    usados.add(c.a.id); usados.add(c.b.id);
    pares.push({ tipo: "nome", q, a: c.a, b: c.b, s: c.s }); n++;
  }
}
const escolhidos = pares.slice(0, MAX_PARES);
console.log(`${escolhidos.length} pares para perguntar (${escolhidos.filter((p) => p.tipo === "código").length} por código, ${escolhidos.filter((p) => p.tipo === "nome").length} por nome)`);

// ---------- pergunta à IA, um par por vez
const INSTRUCOES = `Você confere anúncios de lojas brasileiras para um comparador de preços. Recebe dois anúncios (nome e preço) de lojas diferentes e diz se são EXATAMENTE o mesmo produto, de modo que comparar o preço dos dois seja justo.
- "igual": mesma marca, mesmo modelo, mesma capacidade/tamanho/armazenamento/memória e mesmo conteúdo (não é kit de um lado e peça avulsa do outro). Cor diferente ainda é "igual".
- "igual_outra_voltagem": tudo igual, mas um é 110/127V e o outro 220V.
- "diferente": modelo, tamanho, capacidade, armazenamento, geração ou conteúdo diferentes; kit/combo contra unidade; acessório ou peça contra o produto; produto recondicionado/usado contra novo.
- "nao_sei": os nomes não dão informação suficiente para decidir.
Preço muito diferente é um sinal de produto diferente, mas não decide sozinho. Responda só com o JSON pedido; "motivo" em até 12 palavras.`;
const ESQUEMA = { type: "object", additionalProperties: false, required: ["veredito", "motivo"],
  properties: { veredito: { type: "string", enum: ["igual", "igual_outra_voltagem", "diferente", "nao_sei"] }, motivo: { type: "string" } } };
const claude = process.env.SO_PARES ? null : new Anthropic();
let entrada = 0, saida = 0, falhas = 0;
const custo = () => (entrada * PRECO_ENTRADA + saida * PRECO_SAIDA) / 1e6;
async function perguntar(par) {
  if (custo() >= TETO_US) return;
  try {
    const msg = await claude.messages.create({
      model: MODELO, max_tokens: 300,
      output_config: { effort: "low", format: { type: "json_schema", schema: ESQUEMA } },
      system: INSTRUCOES,
      messages: [{ role: "user", content: `Anúncio 1 (${par.a.lojaNome || par.a.loja}), R$ ${par.a.preco}: ${par.a.titulo.slice(0, 220)}\nAnúncio 2 (${par.b.lojaNome || par.b.loja}), R$ ${par.b.preco}: ${par.b.titulo.slice(0, 220)}` }],
    });
    entrada += msg.usage.input_tokens; saida += msg.usage.output_tokens;
    Object.assign(par, JSON.parse(msg.content.find((b) => b.type === "text")?.text || "{}"));
  } catch (erro) {
    falhas++;
    if (falhas <= 3) console.log(`Erro na IA: ${String(erro.message || erro).slice(0, 200)}`);
  }
}
const fila = process.env.SO_PARES ? [] : [...escolhidos];
await Promise.all(Array.from({ length: 5 }, async () => { for (let p = fila.shift(); p; p = fila.shift()) await perguntar(p); }));

// ---------- resumo
const linhas = [];
const diz = (t) => { console.log(t); linhas.push(t); };
diz("### Teste: a IA casando o mesmo produto em lojas diferentes");
for (const tipo of ["código", "nome"]) {
  const l = escolhidos.filter((p) => p.tipo === tipo && p.veredito);
  const n = (v) => l.filter((p) => p.veredito === v).length;
  diz(`- Pares por ${tipo}: ${l.length} respondidos → ${n("igual")} iguais, ${n("igual_outra_voltagem")} iguais com outra voltagem, ${n("diferente")} diferentes, ${n("nao_sei")} sem resposta segura`);
}
diz(`- Custo: US$ ${custo().toFixed(4)} (${entrada} tokens de entrada, ${saida} de saída; US$ ${(custo() / Math.max(1, escolhidos.filter((p) => p.veredito).length) * 1000).toFixed(2)} por mil pares); erros: ${falhas}`);
diz("");
diz("| tipo | busca | veredito | motivo | anúncio 1 | anúncio 2 |");
diz("|---|---|---|---|---|---|");
const limpo = (t) => String(t || "").replace(/\|/g, "/").replace(/\s+/g, " ");
for (const p of escolhidos.filter((x) => x.veredito)) {
  diz(`| ${p.tipo} | ${p.q} | ${p.veredito} | ${limpo(p.motivo)} | ${p.a.loja} R$ ${p.a.preco}: ${limpo(p.a.titulo).slice(0, 110)} | ${p.b.loja} R$ ${p.b.preco}: ${limpo(p.b.titulo).slice(0, 110)} |`);
}
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, linhas.join("\n") + "\n");
