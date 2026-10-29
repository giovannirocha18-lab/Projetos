// Robô da IA (pedido do Giovanni, 29/10/2026): o Claude Haiku 5.5 diz a categoria de cada produto e o resultado
// fica na tabela ia_categorias do banco (ver lib/ia.js). Usa a Batch API (metade do preço; o lote leva de minutos a
// algumas horas): uma execução manda o lote e as seguintes leem o resultado quando ele fica pronto.
// Títulos: os produtos das lojas da Awin no banco + os das buscas prontas do site (Shopee, AliExpress, Lomadee).
// Só manda o que ainda não tem categoria nesta VERSAO_IA.
// Uso: node robo/ia.mjs [--limite N] [--buscas N] [--esperar MINUTOS]
//   (precisa de ANTHROPIC_API_KEY, CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID e D1_DATABASE_ID)
import { readFileSync, appendFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { VERSAO_IA, SEM_CATEGORIA, chaveIa, TABELAS_IA } from "../lib/ia.js";
import { categoriasParaIa, categoriaDoProduto } from "../lib/categorias.js";
import { termosParaSugestoes } from "../lib/vocabulario.js";

const MODELO = "claude-haiku-5-5";
const POR_PEDIDO = 100; // títulos por pedido à IA (as instruções vão uma vez por pedido)
// Preço da Batch API (metade do normal) do Claude Haiku 5.5, em US$ por milhão de tokens
const PRECO_ENTRADA = 0.05;
const PRECO_SAIDA = 0.25;
const SITE = "https://vaiprocarrinho.com.br";

const arg = (nome, padrao) => {
  const i = process.argv.indexOf(`--${nome}`);
  return i > 0 ? Number(process.argv[i + 1]) : padrao;
};
const LIMITE = arg("limite", 300000);
const BUSCAS = arg("buscas", 400);
const ESPERAR_MIN = arg("esperar", 0);
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const resumo = [];
const anotar = (linha) => { console.log(linha); resumo.push(linha); };

const { ANTHROPIC_API_KEY, CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: conta, D1_DATABASE_ID: banco } = process.env;
if (!ANTHROPIC_API_KEY || !token || !conta || !banco) {
  console.log("Faltam os segredos ANTHROPIC_API_KEY e/ou do Cloudflare: robô da IA não rodou");
  process.exit(0);
}
const claude = new Anthropic();

// ---------------------------------------------------------------------
// Banco (D1 pela API do Cloudflare)
// ---------------------------------------------------------------------
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

// Grava várias linhas por consulta (até ~90 KB de SQL cada; o D1 aceita até 100 KB)
async function gravarCategorias(linhas) {
  const agora = Date.now();
  let lote = [];
  let tamanho = 0;
  const enviar = async () => {
    if (!lote.length) return;
    await d1(`INSERT OR REPLACE INTO ia_categorias (chave, categoria, versao, quando) VALUES ${lote.join(",")}`);
    lote = [];
    tamanho = 0;
  };
  for (const [chave, categoria] of linhas) {
    const valor = `(${texto(chave)},${texto(categoria)},${VERSAO_IA},${agora})`;
    if (tamanho + valor.length > 90000) await enviar();
    lote.push(valor);
    tamanho += valor.length + 1;
  }
  await enviar();
}

// ---------------------------------------------------------------------
// Títulos a classificar
// ---------------------------------------------------------------------
async function titulosDaAwin() {
  const titulos = [];
  for (let desde = 0; ;) {
    const linhas = await d1("SELECT num, titulo FROM ofertas WHERE fonte = 'awin' AND num > ? ORDER BY num LIMIT 20000", [desde]);
    if (!linhas.length) break;
    for (const l of linhas) if (l.titulo) titulos.push(l.titulo);
    desde = linhas.at(-1).num;
  }
  return titulos;
}

// Shopee, AliExpress e Lomadee não ficam no banco: pega os títulos das buscas prontas do site (respondem na hora)
async function titulosDasBuscas(quantas) {
  const versao = readFileSync(new URL("../functions/api/buscar.js", import.meta.url), "utf8").match(/const VERSAO_CACHE = (\d+)/)[1];
  const termos = ["", ...termosParaSugestoes([]).slice(0, quantas)];
  const titulos = [];
  for (let i = 0; i < termos.length; i += 2) {
    await Promise.all(termos.slice(i, i + 2).map(async (q) => {
      try {
        const r = await fetch(`${SITE}/api/buscar?v=${versao}&atalho=1&q=${encodeURIComponent(q)}`, { signal: AbortSignal.timeout(30000) });
        if (!r.ok) return;
        for (const o of (await r.json()).ofertas || []) if (o.fonte !== "awin" && o.titulo) titulos.push(o.titulo);
      } catch {}
    }));
    await espera(500); // limite de pedidos do Cloudflare (ver robo/auditoria.mjs)
  }
  return titulos;
}

async function jaClassificadas() {
  const chaves = new Set();
  for (let desde = ""; ;) {
    const linhas = await d1("SELECT chave FROM ia_categorias WHERE versao = ? AND chave > ? ORDER BY chave LIMIT 50000", [VERSAO_IA, desde]);
    if (!linhas.length) break;
    for (const l of linhas) chaves.add(l.chave);
    desde = linhas.at(-1).chave;
  }
  return chaves;
}

// ---------------------------------------------------------------------
// Pedido à IA
// ---------------------------------------------------------------------
const CATEGORIAS = categoriasParaIa();
const NOMES = [...CATEGORIAS.map((c) => c.nome), SEM_CATEGORIA];
const INSTRUCOES = `Você classifica produtos de lojas brasileiras nas categorias de um site comparador de preços.
Para cada título numerado, escolha a categoria em que um comprador procuraria esse produto.

Categorias (com exemplos de produtos de cada uma):
${CATEGORIAS.map((c) => `- ${c.nome}${c.exemplos.length ? `: ${c.exemplos.join(", ")}` : ""}`).join("\n")}
- ${SEM_CATEGORIA}: nenhuma das anteriores serve

Regras:
- Olhe o que o produto É, não o que aparece estampado nele ("Camiseta Estampa Gato" é roupa, não Pets; "Caneca Carros" é Cozinha).
- Produto para animais de estimação (ração, cama, coleira, brinquedo de pet) é Pets.
- Peças e acessórios vão na categoria do aparelho em que são usados quando a categoria existe: capa, película e suporte de celular = Acessórios de celular; carregador, cabo e power bank = Carregadores; peça de carro ou moto = Automotivo.
- Geladeira, fogão, micro-ondas, máquina de lavar, ar-condicionado, TV, ventilador = Eletrodomésticos. Air fryer, liquidificador, cafeteira, batedeira = Eletroportáteis.
- Capacete, luva, baú e roupa de motociclista são Automotivo. Celulares da Motorola ("Moto G") são Celulares, não Automotivo. Roupa e itens de bebê são Bebês; brinquedo infantil é Brinquedos.
- Roupas: Moda íntima (cueca, calcinha, sutiã, pijama, meia), Moda fitness (roupa de academia), senão Moda masculina ou Moda feminina. Calçados ficam em Calçados.
- Use ${SEM_CATEGORIA} só quando nenhuma categoria servir.
Responda com uma linha por título, usando o número dele.`;

const ESQUEMA = {
  type: "object",
  properties: {
    itens: {
      type: "array",
      items: {
        type: "object",
        properties: { n: { type: "integer" }, c: { type: "string", enum: NOMES } },
        required: ["n", "c"],
        additionalProperties: false,
      },
    },
  },
  required: ["itens"],
  additionalProperties: false,
};

const parametros = (titulos) => ({
  model: MODELO,
  max_tokens: 8000,
  output_config: { effort: "low", format: { type: "json_schema", schema: ESQUEMA } },
  system: INSTRUCOES,
  messages: [{ role: "user", content: titulos.map((t, i) => `${i + 1}. ${t.slice(0, 200)}`).join("\n") }],
});

async function mandarLote(titulos) {
  const pedidos = [];
  for (let i = 0; i < titulos.length; i += POR_PEDIDO) pedidos.push({ id: `p${pedidos.length}`, titulos: titulos.slice(i, i + POR_PEDIDO) });
  const lote = await claude.messages.batches.create({
    requests: pedidos.map((p) => ({ custom_id: p.id, params: parametros(p.titulos) })),
  });
  await d1("INSERT INTO ia_lotes (id, criado, aberto, titulos) VALUES (?, ?, 1, ?)", [lote.id, Date.now(), titulos.length]);
  for (let i = 0; i < pedidos.length; i += 50) {
    await d1(`INSERT INTO ia_pedidos (lote, pedido, titulos) VALUES ${pedidos.slice(i, i + 50)
      .map((p) => `(${texto(lote.id)},${texto(p.id)},${texto(JSON.stringify(p.titulos))})`).join(",")}`);
  }
  anotar(`- Lote ${lote.id} enviado: ${titulos.length} títulos em ${pedidos.length} pedidos`);
  return lote.id;
}

async function lerLote(id) {
  const pedidos = new Map((await d1("SELECT pedido, titulos FROM ia_pedidos WHERE lote = ?", [id])).map((p) => [p.pedido, JSON.parse(p.titulos)]));
  const linhas = [];
  const exemplos = [];
  let entrada = 0, saida = 0, falhas = 0, semResposta = 0;
  for await (const r of await claude.messages.batches.results(id)) {
    const titulos = pedidos.get(r.custom_id);
    if (r.result.type !== "succeeded" || !titulos) { falhas++; continue; }
    const msg = r.result.message;
    entrada += msg.usage.input_tokens;
    saida += msg.usage.output_tokens;
    const bloco = msg.content.find((b) => b.type === "text");
    let itens = [];
    try {
      itens = JSON.parse(bloco?.text || "{}").itens || [];
    } catch {
      falhas++;
      continue;
    }
    const vistos = new Set();
    for (const { n, c } of itens) {
      const titulo = titulos[n - 1];
      if (!titulo || vistos.has(n) || !NOMES.includes(c)) continue;
      vistos.add(n);
      linhas.push([chaveIa(titulo), c]);
      if (exemplos.length < 40 && linhas.length % 12 === 1) exemplos.push([titulo, c]);
    }
    semResposta += titulos.length - vistos.size;
  }
  await gravarCategorias(linhas);
  await d1("UPDATE ia_lotes SET aberto = 0 WHERE id = ?", [id]);
  await d1("DELETE FROM ia_pedidos WHERE lote = ?", [id]);

  const custo = (entrada * PRECO_ENTRADA + saida * PRECO_SAIDA) / 1e6;
  const iguais = exemplos.filter(([t, c]) => (categoriaDoProduto(t)?.nome || SEM_CATEGORIA) === c).length;
  anotar(`- Lote ${id} lido: ${linhas.length} títulos com categoria (${semResposta} sem resposta, ${falhas} pedidos com erro)`);
  anotar(`- Tokens: ${entrada.toLocaleString("pt-BR")} de entrada e ${saida.toLocaleString("pt-BR")} de saída = US$ ${custo.toFixed(4)}`);
  if (linhas.length) anotar(`- Custo por 1.000 títulos: US$ ${((custo / linhas.length) * 1000).toFixed(4)}`);
  const porCategoria = new Map();
  for (const [, c] of linhas) porCategoria.set(c, (porCategoria.get(c) || 0) + 1);
  anotar(`- Por categoria: ${[...porCategoria].sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} ${n}`).join(", ")}`);
  anotar(`- Exemplos (IA x regras atuais; ${iguais} de ${exemplos.length} iguais):`);
  for (const [t, c] of exemplos) {
    const regra = categoriaDoProduto(t)?.nome || SEM_CATEGORIA;
    anotar(`  - ${t.slice(0, 90)} → **${c}**${regra === c ? "" : ` (regras: ${regra})`}`);
  }
}

// ---------------------------------------------------------------------
anotar("### Robô da IA (categorias)");
for (const sql of TABELAS_IA) await d1(sql);

let [aberto] = await d1("SELECT id FROM ia_lotes WHERE aberto = 1 ORDER BY criado LIMIT 1");
if (!aberto) {
  const [daAwin, dasBuscas, feitas] = await Promise.all([titulosDaAwin(), titulosDasBuscas(BUSCAS), jaClassificadas()]);
  const porChave = new Map();
  for (const t of [...dasBuscas, ...daAwin]) {
    const c = chaveIa(t);
    if (c && !feitas.has(c) && !porChave.has(c)) porChave.set(c, t);
  }
  let pendentes = [...porChave.values()];
  anotar(`- Títulos: ${daAwin.length.toLocaleString("pt-BR")} da Awin, ${dasBuscas.length.toLocaleString("pt-BR")} das buscas; ${feitas.size.toLocaleString("pt-BR")} já com categoria; ${pendentes.length.toLocaleString("pt-BR")} novos`);
  // Limite (teste pequeno): pega títulos espalhados pela lista, não só os primeiros
  if (pendentes.length > LIMITE) {
    const passo = pendentes.length / LIMITE;
    pendentes = Array.from({ length: LIMITE }, (_, i) => pendentes[Math.floor(i * passo)]);
  }
  if (pendentes.length) aberto = { id: await mandarLote(pendentes) };
}

if (aberto) {
  const ate = Date.now() + ESPERAR_MIN * 60000;
  for (;;) {
    const lote = await claude.messages.batches.retrieve(aberto.id);
    if (lote.processing_status === "ended") {
      await lerLote(aberto.id);
      break;
    }
    if (Date.now() > ate) {
      anotar(`- Lote ${aberto.id} ainda processando (${lote.request_counts.processing} pedidos): o resultado é lido na próxima execução`);
      break;
    }
    await espera(30000);
  }
} else {
  anotar("- Nada novo para classificar");
}

if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, resumo.join("\n") + "\n");
