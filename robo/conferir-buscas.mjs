// A IA confere as buscas sugeridas (pedido do Giovanni, 30/10/2026; ver lib/iaBusca.js). Roda depois da auditoria.
// Para cada busca da caixa de sugestões (e, desde 03/11/2026, as mais buscadas pelos visitantes no mês): abre como o visitante (1ª resposta e o lote seguinte), separa os produtos
// mostrados como "o produto buscado" que estão fora das categorias da busca (e os 24 primeiros) e pergunta ao Claude Haiku 5.5 se cada um
// é mesmo o que a pessoa procura. "Não" = o site manda para "Ver também… produtos parecidos" daquela busca.
// "Sim" fora da categoria = categoria talvez errada: vai para o resumo (o Claude corrige as regras).
// Cada título é perguntado uma vez por busca (tabela ia_busca). Usa a API normal (não o lote): resposta na hora.
// Uso: node robo/conferir-buscas.mjs [quantidade de buscas]
//   (precisa de ANTHROPIC_API_KEY, CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID e D1_DATABASE_ID)
import { paraPainel } from "./painel.mjs";
import { readFileSync, appendFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { chaveIa, VERSAO_IA, TABELAS_IA } from "../lib/ia.js";
import { categoriaDoProduto } from "../lib/categorias.js";
import { TABELA_IA_BUSCA, termoIa, foraDasCategorias, categoriasDaBusca } from "../lib/iaBusca.js";

const MODELO = "claude-haiku-5-5";
// Preço normal (sem lote) do Claude Haiku 5.5, em US$ por milhão de tokens
const PRECO_ENTRADA = 0.1;
const PRECO_SAIDA = 0.5;
const SITE = "https://vaiprocarrinho.com.br";
const QUANTAS = Number(process.argv[2]) || 300;
const POR_PEDIDO = 80; // títulos por pergunta à IA
// Também os primeiros produtos de cada busca, mesmo dentro da categoria (03/11/2026): são os que o visitante mais vê
const TOPO = 24;
// Buscas reais dos visitantes nos últimos 30 dias (as mais buscadas), além das sugestões da caixa de busca (03/11/2026)
const BUSCADAS = 150;
// Também os mais baratos de cada busca (11/11/2026, print do Giovanni: "computador" com "Balança Computadora" no
// "💰 Mais barato" da Escolha rápida; produto errado quase sempre custa menos que o certo e a IA só via os primeiros da
// lista): os 10 de menor preço da busca e os 3 de menor preço de cada loja (quem escolhe uma loja vê o mais barato dela)
const BARATOS = 10;
const BARATOS_POR_LOJA = 3;
// Os que a IA já disse que não são o produto não contam: no lugar deles entram os próximos mais baratos. Na mesma noite a
// pergunta se repete (até RODADAS_BARATOS vezes) enquanto a rodada ainda achar 3 ou mais errados ("mochila": depois dos 10
// chaveiros mais baratos vinham 10 broches)
const RODADAS_BARATOS = 5;
function maisBaratos(ofertas, jaNao = () => false) {
  const porPreco = ofertas.filter((o) => !o.acessorio && o.preco > 0 && !jaNao(o)).sort((a, b) => a.preco - b.preco);
  const daLoja = new Map();
  return porPreco.filter((o, i) => {
    const n = daLoja.get(o.loja) || 0;
    daLoja.set(o.loja, n + 1);
    return i < BARATOS || n < BARATOS_POR_LOJA;
  });
}
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
  paraPainel("ia_buscas", { avisos: ["Faltam os segredos ANTHROPIC_API_KEY e/ou do Cloudflare: não rodou"] });
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
    const valor = `(${texto(termo)},${texto(chave)},${Number(ok) || 0},${agora})`;
    if (tamanho + valor.length > 90000) await enviar();
    lote.push(valor);
    tamanho += valor.length + 1;
  }
  await enviar();
}

async function jaConferidos() {
  const vistos = new Map(); // "termo|chave" -> 1 (é o produto) ou 0 (não é)
  for (let desde = 0; ;) {
    const linhas = await d1("SELECT rowid AS r, termo, chave, ok FROM ia_busca WHERE rowid > ? ORDER BY rowid LIMIT 50000", [desde]);
    if (!linhas.length) break;
    for (const l of linhas) vistos.set(`${l.termo}|${l.chave}`, l.ok);
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
// A lista inteira, como quem rola a página até o fim: 1ª resposta + os lotes seguintes (até LOTES)
const LOTES = 8;
async function abrirBusca(q) {
  const d = await abrir(`q=${encodeURIComponent(q)}`);
  if (!d?.ofertas) return null;
  const ofertas = [...d.ofertas];
  const vistos = new Set(ofertas.map((o) => o.id));
  let mais = d.mais;
  for (let lote = 1; mais && lote < LOTES; lote++) {
    const seguinte = await abrir(`q=${encodeURIComponent(q)}&${mais}`);
    for (const o of seguinte?.ofertas || []) if (!vistos.has(o.id)) { vistos.add(o.id); ofertas.push(o); }
    mais = seguinte?.mais;
  }
  return { q: d.q || q, ofertas };
}

// ---------------------------------------------------------------------
// Pergunta à IA
// ---------------------------------------------------------------------
// 16/11/2026 (pedido do Giovanni: "solução definitiva, não consigo olhar item a item"; o topo vinha certo e os erros
// apareciam descendo a lista): a IA confere a lista INTEIRA de cada busca (produtos e acessórios, todos os lotes), pelo
// nome; onde fica em dúvida, olha a FOTO. Cada título é perguntado uma vez por busca; depois, só os novos de cada noite.
// Veredito (tabela ia_busca.ok): 1 = é o produto; 2 = peça/acessório dele; 0 = não tem a ver (o site esconde)
const INSTRUCOES = `Você confere os resultados da busca de um site brasileiro comparador de preços.
Recebe o que a pessoa buscou e uma lista numerada de títulos de anúncios (muitos traduzidos automaticamente, com palavras soltas).
Classifique cada título:
- P (produto): é o próprio produto buscado, de qualquer marca, cor, estampa, capacidade ou versão, novo ou usado (busca "jogo de ferramentas", título "Kit Maleta 46 Peças Chaves Soquete"; busca "air fryer", título "Fritadeira Air Fryer Mickey 3L"). As versões do modelo buscado também são P: busca "iphone 16" aceita iPhone 16, 16 Plus, 16 Pro, 16 Pro Max e 16e (novo, usado ou de vitrine); busca "ps5" aceita PS5 Slim, Pro, Digital e pacotes com jogo; busca "galaxy s24" aceita S24 Ultra e S24 FE.
- A (acessório): peça, acessório, capa, cabo, suporte, jogo ou complemento feito PARA o produto buscado ou compatível com ele (busca "ps5", título "Capa para controle PS5"; busca "geladeira", título "Filtro para geladeira Consul").
- N (não tem a ver): outro produto que só cita as palavras em outro sentido, ou algo de OUTRO modelo. Brinquedo é sempre N quando a busca é de um produto de verdade: versão de brinquedo, infantil de faz de conta, miniatura, item de boneca ou de casinha, colecionável e fantasia (busca "geladeira": "Barbie com Geladeira e Acessórios", "Geladeira Mini Brands Fill The Fridge", "Mini Geladeira Infantil 2 Portas" e "Cozinha Infantil com Geladeira" são N; busca "notebook": "Laptop Infantil Bilíngue" é N). Só não vale se a própria busca é de brinquedo ("boneca", "lego", "geladeira de brinquedo"). Se a busca diz o número do modelo ou da geração, o tamanho ou a capacidade (ps5, iphone 16, 55 polegadas, 5 litros, 12 kg), anúncio de OUTRO número, geração ou tamanho é N (iPhone 15 na busca "iphone 16"; TV de 50 na busca "smart tv 55"), inclusive o acessório que só serve em outro modelo (busca "ps5": "Console PlayStation 4 Slim" é N, "Cabo para PS2 e PS3" é N, "Controle para PS4 e PS5" é A). Se a busca não diz modelo nem tamanho, qualquer um vale.
- D (dúvida): só pelo nome não dá para saber.
Responda só com os números de cada grupo A, N e D; todo título que não aparecer em nenhum grupo conta como P. Na dúvida entre P e A, tanto faz. Use N quando tiver certeza: brinquedo, miniatura e outro modelo/tamanho são casos certos; versão do mesmo modelo (Pro, Max, Slim, usado) nunca é N.`;

const ESQUEMA = {
  type: "object",
  properties: {
    a: { type: "array", items: { type: "integer" } },
    n: { type: "array", items: { type: "integer" } },
    d: { type: "array", items: { type: "integer" } },
  },
  required: ["a", "n", "d"],
  additionalProperties: false,
};
const ESQUEMA_DA_FOTO = {
  type: "object",
  properties: { tipo: { type: "string", enum: ["P", "A", "N"] } },
  required: ["tipo"],
  additionalProperties: false,
};
const NOTA = { P: 1, A: 2, N: 0 };
const PEDIDOS_JUNTOS = 3; // perguntas da mesma busca ao mesmo tempo
const FOTOS_POR_BUSCA = 20; // dúvidas de cada busca decididas pela foto (o resto fica como está)

let entrada = 0, saida = 0, falhas = 0, pelaFoto = 0;
const lerJson = (msg) => JSON.parse(msg.content.find((b) => b.type === "text")?.text || "{}");
async function perguntarParte(q, parte) {
  const msg = await claude.messages.create({
    model: MODELO,
    max_tokens: 2000,
    output_config: { effort: "low", format: { type: "json_schema", schema: ESQUEMA } },
    system: INSTRUCOES,
    messages: [{ role: "user", content: `Busca: "${q}"\n\n${parte.map((o, j) => `${j + 1}. ${String(o.titulo).slice(0, 200)}`).join("\n")}` }],
  });
  entrada += msg.usage.input_tokens;
  saida += msg.usage.output_tokens;
  const r = lerJson(msg);
  const grupo = new Map();
  for (const [letra, lista] of [["A", r.a], ["N", r.n], ["D", r.d]]) for (const n of lista || []) if (parte[n - 1] && !grupo.has(n - 1)) grupo.set(n - 1, letra);
  return parte.map((o, j) => [o, grupo.get(j) || "P"]);
}
// Dúvida pelo nome: a foto decide (uma por pergunta: com várias juntas a IA trocava de produto, 10/11/2026)
async function perguntarPelaFoto(q, o) {
  const msg = await claude.messages.create({
    model: MODELO,
    max_tokens: 200,
    output_config: { effort: "low", format: { type: "json_schema", schema: ESQUEMA_DA_FOTO } },
    system: `${INSTRUCOES}\nAgora é um anúncio só, com a FOTO dele: responda P, A ou N olhando a foto e o nome (sem D). Se a foto não ajudar, responda P.`,
    messages: [{ role: "user", content: [
      { type: "image", source: { type: "url", url: o.imagem } },
      { type: "text", text: `Busca: "${q}"\nTítulo: ${String(o.titulo).slice(0, 200)}` },
    ] }],
  });
  entrada += msg.usage.input_tokens;
  saida += msg.usage.output_tokens;
  pelaFoto++;
  return lerJson(msg).tipo;
}
// Devolve [oferta, 1 | 2 | 0] dos que a IA respondeu (dúvida sem foto, ou além do limite de fotos, fica sem veredito)
async function perguntar(q, ofertas) {
  const partes = [];
  for (let i = 0; i < ofertas.length; i += POR_PEDIDO) partes.push(ofertas.slice(i, i + POR_PEDIDO));
  const lidas = [];
  for (let i = 0; i < partes.length; i += PEDIDOS_JUNTOS) {
    // A resposta às vezes vem com o JSON quebrado (4 em ~65 perguntas nos testes de 16/11/2026): pergunta de novo uma vez
    const feitas = await Promise.all(partes.slice(i, i + PEDIDOS_JUNTOS).map((parte) => perguntarParte(q, parte).catch(() => perguntarParte(q, parte)).catch((erro) => {
      falhas++;
      console.log(`Erro na IA (${q}): ${String(erro.message || erro).slice(0, 200)}`);
      return [];
    })));
    lidas.push(...feitas.flat());
  }
  const respostas = lidas.filter(([, letra]) => letra !== "D").map(([o, letra]) => [o, NOTA[letra]]);
  const duvidas = lidas.filter(([o, letra]) => letra === "D" && /^https:\/\//.test(o.imagem || "")).slice(0, FOTOS_POR_BUSCA);
  for (let i = 0; i < duvidas.length; i += PEDIDOS_JUNTOS) {
    await Promise.all(duvidas.slice(i, i + PEDIDOS_JUNTOS).map(async ([o]) => {
      const tipo = await perguntarPelaFoto(q, o).catch(() => null); // foto que não abre: fica sem veredito
      if (tipo in NOTA) respostas.push([o, NOTA[tipo]]);
    }));
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
try {
  const desde = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const buscadas = await d1(
    "SELECT MAX(texto) AS texto FROM buscas WHERE dia >= ? GROUP BY termo ORDER BY SUM(total) DESC LIMIT ?", [desde, BUSCADAS]);
  const ja = new Set(termos.map((t) => termoIa(t)));
  for (const { texto: t } of buscadas) if (t && !ja.has(termoIa(t))) { termos.push(t); ja.add(termoIa(t)); }
} catch {}

// Teste: IA_BUSCAS_SO="ps5|geladeira" confere só essas buscas (input ia_so do workflow), DO ZERO: esquece o que a IA já
// tinha respondido para elas (serve para refazer uma busca depois de mudar as instruções)
if (process.env.IA_BUSCAS_SO) {
  termos = process.env.IA_BUSCAS_SO.split("|").map((t) => t.trim()).filter(Boolean);
  for (const t of termos) {
    const termo = termoIa(t);
    await d1("DELETE FROM ia_busca WHERE termo = ?", [termo]);
    for (const k of [...vistos.keys()]) if (k.startsWith(`${termo}|`)) vistos.delete(k);
  }
}

const naoSao = []; // { q, titulo, secao, loja }
const categoriaDuvidosa = []; // { q, titulo, secao, cats }
// Categoria corrigida pela IA (03/11/2026): a IA disse que o produto É o buscado, mas ele estava em outra categoria. Só
// quando a busca é de um produto com categoria conhecida ("smartwatch" = Smartwatches) e a busca tem só essa categoria;
// busca de marca ("stanley": copo e ferramenta) fica de fora. Grava em ia_categorias, que o site usa acima das regras
const correcoes = new Map(); // chave do título -> categoria
let abertas = 0, perguntados = 0, viraramAcessorio = 0, parouEm = 0;
const comecou = Date.now();
// Tempo máximo desta etapa por noite (o resto das buscas fica para a noite seguinte; os vereditos ficam guardados)
const MAX_MIN = Number(process.env.IA_BUSCAS_MIN) || 70;
const novas = [];
for (let i = 0; i < termos.length; i += AO_MESMO_TEMPO) {
  await Promise.all(termos.slice(i, i + AO_MESMO_TEMPO).map(async (q0) => {
    const busca = await abrirBusca(q0);
    if (!busca) return;
    abertas++;
    const { q, ofertas } = busca;
    const termo = termoIa(q);
    const porChave = new Map();
    const fora = new Set(foraDasCategorias(ofertas));
    const catsDaBusca = [...(categoriasDaBusca(ofertas) || [])];
    const cats = catsDaBusca.map((c) => c || "Outros").join(" + ");
    const doProduto = categoriaDoProduto(q)?.nome;
    const corrigeCom = catsDaBusca.length === 1 && doProduto && catsDaBusca[0] === doProduto ? doProduto : null;
    // Tudo o que a busca mostra e ainda não tem veredito (o que as regras já marcaram como "parecido" o site já esconde)
    for (const o of ofertas) {
      const chave = chaveIa(o.titulo || "");
      if (!chave || o.parecido) continue;
      // Já respondido "é o produto" numa noite anterior e ainda fora da categoria: corrige sem perguntar de novo
      if (vistos.get(`${termo}|${chave}`) === 1 && corrigeCom && fora.has(o)) correcoes.set(chave, corrigeCom);
      if (!vistos.has(`${termo}|${chave}`) && !porChave.has(chave)) porChave.set(chave, o);
    }
    const lista = [...porChave.values()];
    if (!lista.length) return;
    perguntados += lista.length;
    for (const [o, nota] of await perguntar(q, lista)) {
      novas.push([termo, chaveIa(o.titulo), nota]);
      vistos.set(`${termo}|${chaveIa(o.titulo)}`, nota);
      const item = { q, titulo: o.titulo, secao: o.secao || "Outros", loja: o.lojaNome || o.loja, cats };
      if (nota === 0) naoSao.push(item);
      else if (nota === 2 && !o.acessorio) viraramAcessorio++;
      else if (nota === 1 && fora.has(o)) {
        categoriaDuvidosa.push(item);
        if (corrigeCom) correcoes.set(chaveIa(o.titulo), corrigeCom);
      }
    }
  }));
  // Guarda aos poucos (a 1ª passada é longa: o que já foi respondido não se perde se o tempo acabar)
  if (novas.length >= 2000) await gravar(novas.splice(0));
  if (Date.now() - comecou > MAX_MIN * 60000) { parouEm = i + AO_MESMO_TEMPO; break; }
  await espera(PAUSA_MS);
}
await gravar(novas);
if (correcoes.size) {
  await d1(TABELAS_IA[0]);
  const valores = [...correcoes].map(([chave, cat]) => `(${texto(chave)},${texto(cat)},${VERSAO_IA},${Date.now()})`);
  for (let i = 0; i < valores.length; i += 300) {
    await d1(`INSERT OR REPLACE INTO ia_categorias (chave, categoria, versao, quando) VALUES ${valores.slice(i, i + 300).join(",")}`);
  }
}

const custo = (entrada * PRECO_ENTRADA + saida * PRECO_SAIDA) / 1e6;
anotar(`- ${abertas} de ${termos.length} buscas abertas (lista inteira de cada uma); ${perguntados} anúncios novos perguntados à IA, ${pelaFoto} decididos pela foto (${falhas} perguntas com erro)`);
if (parouEm) anotar(`- ⏳ O tempo da noite acabou na busca ${parouEm} de ${termos.length}: o resto continua na próxima noite`);
anotar(`- Não têm a ver com a busca (o site esconde): ${naoSao.length}; eram mostrados como produto e são acessório dele: ${viraramAcessorio}`);
anotar(`- São o produto, mas em outra categoria (conferir as regras de categoria): ${categoriaDuvidosa.length}; ` +
  `categoria corrigida sozinha em ${correcoes.size} (busca de produto com uma categoria só)`);
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
paraPainel("ia_buscas", {
  linhas: [
    `${abertas} de ${termos.length} buscas abertas (lista inteira); ${perguntados} anúncios novos perguntados à IA, ${pelaFoto} pela foto${parouEm ? ` (parou na ${parouEm}: continua amanhã)` : ""}`,
    `Escondidos (não têm a ver com a busca): ${naoSao.length}; viraram acessório: ${viraramAcessorio}`,
    `Categorias corrigidas sozinhas: ${correcoes.size}`,
    `Custo: US$ ${custo.toFixed(2)}`,
  ],
  avisos: falhas ? [`${falhas} perguntas à IA deram erro (saldo da Anthropic acabou?)`] : [],
});
listar("Escondidos pela IA", naoSao, false);
listar("Categoria a conferir", categoriaDuvidosa, true);
fim();
