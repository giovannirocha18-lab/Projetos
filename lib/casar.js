// =====================================================================
// CASAR PRODUTOS COM A IA (teste, 11/11/2026, pedido do Giovanni): a IA diz se dois anúncios de lojas diferentes são o
// MESMO produto. É o que um robô da noite precisa para montar o Modo comparação com menos erro e para casar celulares,
// que não têm código de modelo no nome. Roda no Cloudflare (o GitHub deixava o teste horas na fila): a chave da IA é o
// Secret ANTHROPIC_API_KEY do site. Por enquanto é só um teste: lê as buscas guardadas e pergunta; não grava nada.
// Dois tipos de par:
//   "código": a regra do Modo comparação já junta (mesma marca + mesmo código de modelo): a IA confirma ou separa
//   "nome":   sem código (celular, iphone, fone, notebook): pares de lojas diferentes com nomes parecidos
// Uma pergunta por par (a conferência de fotos mostrou que várias de uma vez confunde a IA).
// =====================================================================
import { MARCAS } from "./vocabulario.js";
import { MARCA_APELIDOS } from "./marcas.js";

export const MODELO_IA = "claude-haiku-5-5";
const PRECO_ENTRADA = 0.1; // US$ por milhão de tokens (os mesmos números de robo/conferir-buscas.mjs)
const PRECO_SAIDA = 0.5;
export const custoDaIa = (entrada, saida) => (entrada * PRECO_ENTRADA + saida * PRECO_SAIDA) / 1e6;
export const TETO_DO_TESTE_US = 0.2;
export const PARES_POR_BUSCA = 14;
export const BUSCAS_DO_TESTE = [
  { q: "geladeira", tipo: "código" }, { q: "micro-ondas", tipo: "código" }, { q: "smart tv 55", tipo: "código" },
  { q: "air fryer", tipo: "código" }, { q: "furadeira", tipo: "código" }, { q: "lava e seca", tipo: "código" },
  { q: "celular", tipo: "nome" }, { q: "iphone", tipo: "nome" }, { q: "fone bluetooth", tipo: "nome" }, { q: "notebook", tipo: "nome" },
];

const norm = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
let marcas = null;
const MEDIDA = /^\d+([.,]\d+)?(v|w|l|ml|kg|g|gb|tb|mb|mah|hz|khz|mhz|ghz|btus?|pol|k|p|cm|mm|m|un|pcs?|x|rpm|fps|mp|db|bar|psi|lm|kwh|cv|hp|dpi|ms|bits?|pecas?|em\d)$/;
const TERMO = new Set(["110v", "127v", "220v", "bivolt", "4k", "8k", "5g", "4g", "wifi6", "ipx4", "ipx5", "ipx7", "ip67", "ip68", "1080p", "720p", "2em1", "3em1", "4em1", "5em1", "mp3", "mp4", "hdr10"]);
export function marcaDoTitulo(titulo) {
  marcas = marcas || [...new Set(MARCAS.map((m) => norm(m)))].filter((m) => m.length > 1).sort((a, b) => b.length - a.length);
  const t = ` ${norm(titulo).replace(/[^a-z0-9]+/g, " ")} `;
  const m = marcas.find((x) => t.includes(` ${x} `));
  if (m) return m;
  for (const [apelido, dona] of Object.entries(MARCA_APELIDOS)) if (t.includes(` ${apelido} `)) return norm(dona);
  return null;
}
export function codigoDoTitulo(titulo) {
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
const resumo = (o) => ({ loja: o.lojaNome || o.loja, preco: o.preco, titulo: String(o.titulo || "").slice(0, 220) });

// Pares de anúncios de lojas diferentes para perguntar à IA
export function paresDaBusca(ofertas, tipo, maximo = PARES_POR_BUSCA) {
  const validas = ofertas.filter((o) => o.bate && !o.acessorio && !o.parecido && o.preco > 0);
  const pares = [];
  if (tipo === "código") {
    const grupos = new Map();
    for (const o of validas) {
      const marca = marcaDoTitulo(o.titulo), cod = codigoDoTitulo(o.titulo);
      if (!marca || !cod) continue;
      const g = grupos.get(`${marca}|${cod}`) || new Map();
      if (!g.has(o.loja) || g.get(o.loja).preco > o.preco) g.set(o.loja, o);
      grupos.set(`${marca}|${cod}`, g);
    }
    // Primeiro os grupos de preços mais afastados (os mais duvidosos)
    const lista = [...grupos.values()].filter((g) => g.size >= 2).map((g) => [...g.values()].sort((a, b) => a.preco - b.preco))
      .sort((a, b) => b.at(-1).preco / b[0].preco - a.at(-1).preco / a[0].preco);
    for (const g of lista) for (let i = 1; i < g.length && pares.length < maximo; i++) pares.push({ a: resumo(g[0]), b: resumo(g[i]) });
    return pares;
  }
  const of = validas.slice(0, 220).map((o) => ({ o, p: palavras(o.titulo) }));
  const cand = [];
  for (let i = 0; i < of.length; i++) for (let j = i + 1; j < of.length; j++) {
    if (of[i].o.loja === of[j].o.loja) continue;
    const s = parecido(of[i].p, of[j].p);
    if (s >= 0.45) cand.push({ s, a: of[i].o, b: of[j].o });
  }
  cand.sort((x, y) => y.s - x.s);
  const usados = new Set(); // cada anúncio em um par só, para variar os casos
  for (const c of cand) {
    if (pares.length >= maximo) break;
    if (usados.has(c.a.id) || usados.has(c.b.id)) continue;
    usados.add(c.a.id); usados.add(c.b.id);
    pares.push({ a: resumo(c.a), b: resumo(c.b) });
  }
  return pares;
}

const INSTRUCOES = `Você confere anúncios de lojas brasileiras para um comparador de preços. Recebe dois anúncios (nome e preço) de lojas diferentes e diz se são EXATAMENTE o mesmo produto, de modo que comparar o preço dos dois seja justo.
- "igual": mesma marca, mesmo modelo, mesma capacidade/tamanho/armazenamento/memória e mesmo conteúdo (não é kit de um lado e peça avulsa do outro). Cor diferente ainda é "igual".
- "igual_outra_voltagem": tudo igual, mas um anúncio diz 110/127V e o outro diz 220V. Se só um informa a voltagem (ou nenhum), é "igual".
- "diferente": modelo, tamanho, capacidade, armazenamento, geração, processador, sistema operacional (Linux contra Windows) ou conteúdo diferentes; kit/combo contra unidade; acessório ou peça contra o produto; produto recondicionado/usado contra novo.
- "nao_sei": os nomes não dão informação suficiente para decidir.
Quando os dois trazem o mesmo código de modelo do fabricante, palavras diferentes para descrever o formato não fazem o produto ser outro. Preço muito diferente é um sinal de produto diferente, mas não decide sozinho. Responda só com o JSON pedido; "motivo" em até 12 palavras.`;
const ESQUEMA = { type: "object", additionalProperties: false, required: ["veredito", "motivo"],
  properties: { veredito: { type: "string", enum: ["igual", "igual_outra_voltagem", "diferente", "nao_sei"] }, motivo: { type: "string" } } };

// Pergunta um par à IA (API da Anthropic direto, sem biblioteca: é só um pedido HTTPS)
export async function perguntarPar(chave, par, pedir = fetch) {
  const r = await pedir("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": chave, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODELO_IA, max_tokens: 300,
      output_config: { effort: "low", format: { type: "json_schema", schema: ESQUEMA } },
      system: INSTRUCOES,
      messages: [{ role: "user", content: `Anúncio 1 (${par.a.loja}), R$ ${par.a.preco}: ${par.a.titulo}\nAnúncio 2 (${par.b.loja}), R$ ${par.b.preco}: ${par.b.titulo}` }],
    }),
  });
  if (!r.ok) throw new Error(`IA respondeu ${r.status}: ${(await r.text()).slice(0, 160)}`);
  const msg = await r.json();
  const texto = (msg.content || []).find((b) => b.type === "text")?.text || "{}";
  const { veredito, motivo } = JSON.parse(texto);
  return { veredito, motivo: String(motivo || "").slice(0, 120), entrada: msg.usage?.input_tokens || 0, saida: msg.usage?.output_tokens || 0 };
}

// Uma parte do teste = uma busca: monta os pares e pergunta todos (5 por vez)
export async function parteDoTeste(env, parte, ofertasDaBusca, pedir = fetch) {
  const busca = BUSCAS_DO_TESTE[parte];
  if (!busca) return { fim: true, pares: [] };
  if (!env.ANTHROPIC_API_KEY) return { erro: "ANTHROPIC_API_KEY não está cadastrada no Cloudflare (ou o site ainda não foi publicado depois do cadastro)", fim: true, pares: [] };
  const pares = paresDaBusca(await ofertasDaBusca(busca.q), busca.tipo).map((p) => ({ ...p, q: busca.q, tipo: busca.tipo }));
  let entrada = 0, saida = 0, erros = 0, ultimoErro = "";
  const fila = [...pares];
  await Promise.all(Array.from({ length: 5 }, async () => {
    for (let p = fila.shift(); p; p = fila.shift()) {
      try {
        const r = await perguntarPar(env.ANTHROPIC_API_KEY, p, pedir);
        entrada += r.entrada; saida += r.saida;
        p.veredito = r.veredito; p.motivo = r.motivo;
      } catch (erro) { erros++; ultimoErro = String(erro?.message || erro).slice(0, 200); }
    }
  }));
  return { q: busca.q, tipo: busca.tipo, pares, entrada, saida, erros, ultimoErro, fim: parte + 1 >= BUSCAS_DO_TESTE.length };
}
