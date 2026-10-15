// =====================================================================
// ROBÔ DE PREÇOS — AWIN
// Baixa o catálogo (feed) de todas as lojas da Awin em que o Giovanni foi
// aprovado e atualiza a tabela de ofertas no banco D1 do site:
//   produto novo -> entra | preço mudou -> atualiza e guarda no histórico
//   produto sumiu do feed -> sai do site
// Roda sozinho todo dia pelo GitHub (.github/workflows/robo-precos.yml).
//
// Segredos (GitHub > Settings > Secrets and variables > Actions):
//   AWIN_FEED_KEY          chave que aparece nos links de feed da Awin
//   CLOUDFLARE_API_TOKEN   token com permissão de editar o D1
//   CLOUDFLARE_ACCOUNT_ID  ID da conta do Cloudflare
//   D1_DATABASE_ID         ID do banco D1 ligado ao site (binding DB)
//
// Teste no computador, sem internet nem Cloudflare:
//   node robo/awin.mjs --feed robo/exemplo-awin.csv --sqlite /tmp/teste.sqlite
//   node robo/awin.mjs --feed robo/exemplo-awin-google.csv --loja 105615:Leveros --sqlite /tmp/teste.sqlite
// =====================================================================
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { readFileSync, appendFileSync } from "node:fs";
import { normalizar } from "../lib/texto.js";
import { TABELAS_OFERTAS, MIGRACOES_OFERTAS, juntarMilhares } from "../lib/ofertas.js";

const LISTA_FEEDS = "https://productdata.awin.com/datafeed/list/apikey/";
// Regiões aceitas (ex.: "BR" ou "BR,US"). Vazio = todas. Lojas de fora entram marcadas como internacionais.
const REGIOES = (process.env.ROBO_REGIOES || "").split(",").map((r) => r.trim().toUpperCase()).filter(Boolean);
// Cotação usada para converter preços em outras moedas (preenchida em main)
let COTACOES = { BRL: 1 };
// O preço convertido só é regravado quando o câmbio muda mais de ~3%, para não gastar gravações todo dia
const faixaCambio = (taxa) => Math.round(Math.log(taxa) / Math.log(1.03));
// Limite de produtos novos/alterados/removidos por dia. O plano grátis do D1
// aceita 100 mil linhas gravadas por dia, e cada produto grava mais de uma
// (tabela + índice de busca + histórico). O que passar fica para o dia seguinte.
const LIMITE = Number(process.env.ROBO_LIMITE) || 20000;
const DIAS_HISTORICO = 180;
// Número de afiliado na Awin (aparece no link da "Lista de Feed": .../publisher/3124296/...)
const ID_AFILIADO = process.env.AWIN_ID_AFILIADO
  || ((process.env.AWIN_FEED_KEY || "").match(/publisher\/(\d+)/) || [])[1] || "";
const TAMANHO_LOTE = 90_000; // bytes de SQL por envio (o D1 aceita até 100 mil)

// ---------------------------------------------------------------------
// Argumentos da linha de comando
// ---------------------------------------------------------------------
const args = process.argv.slice(2);
const arg = (nome) => args.flatMap((a, i) => (a === nome ? [args[i + 1]] : []));
const arquivosFeed = arg("--feed");
const caminhoSqlite = arg("--sqlite")[0];

// ---------------------------------------------------------------------
// Banco: D1 do Cloudflare (pela API) ou SQLite local (para testes)
// ---------------------------------------------------------------------
async function abrirBanco() {
  if (caminhoSqlite) {
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(caminhoSqlite);
    return {
      consultar: async (sql, params = []) => db.prepare(sql).all(...params),
      executar: async (sql) => db.exec(sql),
    };
  }
  const { CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: conta, D1_DATABASE_ID: banco } = process.env;
  if (!token || !conta || !banco) {
    throw new Error("Faltam os segredos CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID e/ou D1_DATABASE_ID");
  }
  const url = `https://api.cloudflare.com/client/v4/accounts/${conta}/d1/database/${banco}/query`;
  async function d1(corpo) {
    for (let tentativa = 1; ; tentativa++) {
      const resp = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const json = await resp.json().catch(() => ({}));
      if (resp.ok && json.success) return json.result;
      const erro = `D1 respondeu ${resp.status}: ${JSON.stringify(json.errors || json).slice(0, 500)}`;
      if (tentativa >= 4 || (resp.status < 500 && resp.status !== 429)) throw new Error(erro);
      console.log(`${erro} — tentando de novo`);
      await new Promise((r) => setTimeout(r, 2000 * 2 ** tentativa));
    }
  }
  return {
    consultar: async (sql, params = []) => (await d1({ sql, params }))[0].results,
    executar: async (sql) => d1({ sql }),
  };
}

// ---------------------------------------------------------------------
// Leitura de CSV (aceita aspas, vírgula, ponto e vírgula, barra ou tab)
// ---------------------------------------------------------------------
function lerCsv(texto) {
  texto = texto.replace(/^﻿/, "");
  const primeira = texto.slice(0, texto.indexOf("\n") >>> 0);
  const sep = [",", ";", "|", "\t"].reduce((a, b) => (primeira.split(b).length > primeira.split(a).length ? b : a));
  const linhas = [];
  let linha = [], campo = "", aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) { linha.push(campo); campo = ""; }
    else if (c === "\n") { linha.push(campo.replace(/\r$/, "")); linhas.push(linha); linha = []; campo = ""; }
    else campo += c;
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
  const [cabecalho = [], ...dados] = linhas;
  const chaves = cabecalho.map((c) => c.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""));
  return dados
    .filter((l) => l.length > 1 || l[0])
    .map((l) => Object.fromEntries(chaves.map((k, i) => [k, (l[i] ?? "").trim()])));
}

async function baixarTexto(url, esconder = "") {
  const resp = await fetch(url);
  if (!resp.ok) {
    // Mostra o começo da resposta para ajudar a achar o problema, sem expor a chave
    const corpo = (await resp.text().catch(() => "")).replaceAll(esconder || "\0", "***").slice(0, 300);
    throw new Error(`HTTP ${resp.status} ${corpo.replace(/\s+/g, " ").trim()}`);
  }
  return descompactar(Buffer.from(await resp.arrayBuffer()));
}

const descompactar = (buf) => (buf[0] === 0x1f && buf[1] === 0x8b ? gunzipSync(buf) : buf).toString("utf8");

// ---------------------------------------------------------------------
// Feed da Awin -> ofertas
// ---------------------------------------------------------------------
function numero(v) {
  let s = String(v || "").replace(/[^\d.,]/g, "");
  if (!s) return null;
  const ultimo = Math.max(s.lastIndexOf(","), s.lastIndexOf("."));
  // A vírgula ou o ponto que aparece por último é o separador dos centavos
  if (ultimo >= 0 && s.length - ultimo - 1 <= 2) s = s.slice(0, ultimo).replace(/[.,]/g, "") + "." + s.slice(ultimo + 1);
  else s = s.replace(/[.,]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

const nomeDaLoja = (nome) => String(nome || "").replace(/\s+BR$/i, "").trim();
const httpsOuNada = (url) => (/^https:\/\//i.test(url || "") ? url : null);
const assinar = (dados) => createHash("sha1").update(JSON.stringify(dados)).digest("hex").slice(0, 16);

// Link com o código de afiliado. Feeds no formato Google às vezes trazem só o
// link direto da loja: aí o link de rastreio da Awin é montado aqui.
function linkAfiliado(p, lojaId) {
  const link = p.aw_deep_link || p.link || "";
  if (/awin1\.com|tidd\.ly/i.test(link)) return link;
  if (!/^https?:\/\//i.test(link) || !ID_AFILIADO) return null;
  return `https://www.awin1.com/cread.php?awinmid=${lojaId}&awinaffid=${ID_AFILIADO}&ued=${encodeURIComponent(link)}`;
}

// Aceita o formato padrão da Awin e o novo, baseado no Google
// (title, price "2399.90 BRL", sale_price, image_link, availability…)
function paraOferta(p, feed = {}) {
  const lojaId = p.merchant_id || feed.lojaId;
  const produtoId = p.aw_product_id || p.id || p.item_id;
  const titulo = (p.product_name || p.title || "").replace(/\s+/g, " ").slice(0, 200);
  const moeda = (p.currency || (String(p.price || p.search_price || "").match(/\b[A-Z]{3}\b/) || [])[0]
    || feed.moeda || "BRL").toUpperCase();
  const taxa = COTACOES[moeda];
  if (!taxa) return null; // moeda sem cotação: fica de fora
  const converter = (v) => (v > 0 ? Math.round(v * taxa * 100) / 100 : v);
  const promocao = converter(numero(p.sale_price));
  const cheio = converter(numero(p.search_price) || numero(p.store_price) || numero(p.price));
  const preco = promocao > 0 ? promocao : cheio;
  const link = lojaId && linkAfiliado(p, lojaId);
  if (!lojaId || !produtoId || !link || !titulo || !(preco > 0)) return null;
  if (/^(0|no|false|n)$/i.test(p.in_stock || "") || /^(0|no|false|n)$/i.test(p.is_for_sale || "")) return null;
  if (/out.of.stock|esgotado|indispon/i.test(p.availability || p.stock_status || "")) return null;

  const antigo = Math.max(converter(numero(p.rrp_price)) || 0, converter(numero(p.product_price_old)) || 0,
    converter(numero(p.base_price)) || 0, promocao > 0 ? cheio || 0 : 0);
  const precoAntigo = antigo > preco * 1.01 ? antigo : null;
  const lojaNome = nomeDaLoja(p.merchant_name || feed.lojaNome) || `Loja ${lojaId}`;
  const tipo = (p.product_type || "").split(">").pop().trim();
  const categoria = (p.category_name || p.merchant_category || tipo || "").slice(0, 60) || null;
  // Frete: delivery_cost (padrão) ou shipping no formato Google ("BR:::0.00 BRL")
  const textoFrete = p.delivery_cost ?? (p.shipping ? p.shipping.split(":").pop() : undefined);
  const frete = numero(textoFrete);
  const marca = p.brand_name || p.brand || "";
  const dados = {
    id: `awin-${lojaId}-${produtoId}`,
    fonte: "awin",
    loja: normalizar(lojaNome).replace(/ /g, "-"),
    loja_nome: lojaNome,
    titulo,
    preco,
    preco_antigo: precoAntigo,
    desconto: precoAntigo ? Math.round((1 - preco / precoAntigo) * 100) : null,
    imagem: httpsOuNada(p.merchant_image_url) || httpsOuNada(p.large_image) || httpsOuNada(p.image_link)
      || httpsOuNada(p.aw_image_url),
    categoria,
    link,
    frete_gratis: textoFrete !== undefined && textoFrete !== "" && frete === 0 ? 1 : 0,
    internacional: feed.internacional || moeda !== "BRL" ? 1 : 0,
    moeda: moeda === "BRL" ? null : moeda,
    busca: normalizar(juntarMilhares(`${titulo} ${marca} ${categoria || ""} ${lojaNome}`)),
  };
  // Para moeda estrangeira, a assinatura usa o preço original + a faixa do câmbio
  const base = moeda === "BRL" ? dados : { ...dados, preco: numero(p.sale_price) || numero(p.search_price)
    || numero(p.store_price) || numero(p.price), preco_antigo: null, desconto: null, cambio: faixaCambio(taxa) };
  return { ...dados, assinatura: assinar(base) };
}

const lojaDoId = (id) => id.split("-")[1];

// ---------------------------------------------------------------------
// Escrita no banco, em lotes
// ---------------------------------------------------------------------
function sql(v) {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new Error(`Número inválido: ${v}`);
    return String(v);
  }
  return `'${String(v).replace(/\u0000/g, "").replace(/'/g, "''")}'`;
}

const CAMPOS = ["id", "fonte", "loja", "loja_nome", "titulo", "preco", "preco_antigo", "desconto",
  "imagem", "categoria", "link", "frete_gratis", "internacional", "moeda", "busca", "assinatura", "atualizado_em"];

function gravar(o, agora) {
  const valores = CAMPOS.map((c) => sql(c === "atualizado_em" ? agora : o[c])).join(", ");
  const atualizar = CAMPOS.filter((c) => c !== "id").map((c) => `${c} = excluded.${c}`).join(", ");
  return `INSERT INTO ofertas (${CAMPOS.join(", ")}) VALUES (${valores}) ON CONFLICT(id) DO UPDATE SET ${atualizar}`;
}

async function enviarEmLotes(banco, comandos) {
  let lote = "";
  for (const c of comandos) {
    if (lote && lote.length + c.length > TAMANHO_LOTE) {
      await banco.executar(lote);
      lote = "";
    }
    lote += `${c};\n`;
  }
  if (lote) await banco.executar(lote);
}

// ---------------------------------------------------------------------
// Principal
// ---------------------------------------------------------------------
async function obterFeeds() {
  if (arquivosFeed.length) {
    // --loja 105615:Leveros informa a loja de um feed que não traz merchant_id (formato Google)
    const lojas = arg("--loja");
    return arquivosFeed.map((caminho, i) => {
      const [lojaId, lojaNome] = (lojas[i] || "").split(":");
      return { nome: caminho, lojaId, lojaNome, ler: async () => descompactar(readFileSync(caminho)) };
    });
  }
  // O segredo pode ser: o link da "Lista de Feed" (Ferramentas > Crie um Feed, caixa
  // "Download da Lista de Feed"), um link de download de feed, ou só a chave.
  const segredo = (process.env.AWIN_FEED_KEY || "").trim();
  if (!segredo) throw new Error("Falta o segredo AWIN_FEED_KEY");
  const chave = (segredo.match(/apikey\/([^/?#\s]+)/i) || [])[1];
  const urlLista = /^https?:\/\/.*feedlist/i.test(segredo) ? segredo : LISTA_FEEDS + encodeURIComponent(chave || segredo);
  const esconder = (url) => url.replace(/[0-9a-f]{24,}/gi, "***");
  let textoLista;
  try {
    textoLista = await baixarTexto(urlLista, chave || segredo);
  } catch (erro) {
    throw new Error(`A Awin recusou a lista de feeds (${esconder(erro.message)}). Confira o segredo AWIN_FEED_KEY: ` +
      `deve ser o link da caixa "Download da Lista de Feed" (Ferramentas > Crie um Feed)`);
  }
  const lista = lerTabela(textoLista);
  if (!lista.length) throw new Error("A lista de feeds da Awin veio vazia (o segredo AWIN_FEED_KEY está certo?)");
  // Os nomes das colunas variam entre os formatos da Awin: procura por aproximação
  const pegar = (f, ...nomes) => {
    const chaves = Object.keys(f);
    for (const nome of nomes) {
      const achada = chaves.find((k) => k.replace(/[^a-z0-9]/gi, "").toLowerCase() === nome);
      if (achada && f[achada] !== "") return String(f[achada]);
    }
    return "";
  };
  console.log(`Colunas da lista de feeds: ${Object.keys(lista[0]).join(", ")}`);
  const situacoes = {};
  for (const f of lista) {
    const s = pegar(f, "membershipstatus", "status", "joined") || "(vazio)";
    situacoes[s] = (situacoes[s] || 0) + 1;
  }
  console.log(`Situação das lojas na lista: ${JSON.stringify(situacoes)}`);
  const regiao = (f) => pegar(f, "primaryregion", "region", "advertiserregion").toUpperCase();
  const idioma = (f) => pegar(f, "language", "idioma").toLowerCase();
  const aprovados = lista.filter((f) =>
    /^(active|joined|yes|true|1)$/i.test(pegar(f, "membershipstatus", "status", "joined"))
    && pegar(f, "url", "downloadurl", "feedurl")
    && (!REGIOES.length || !regiao(f) || REGIOES.includes(regiao(f))));

  // Loja de fora costuma ter um feed por país/idioma (o mesmo produto em dólar, euro, libra…).
  // Para não repetir produto: se a loja tem feed em português, usa os em português;
  // senão, usa só o melhor (Estados Unidos/inglês primeiro, depois o com mais produtos).
  const porLoja = new Map();
  for (const f of aprovados) {
    const id = pegar(f, "advertiserid", "merchantid");
    porLoja.set(id, [...(porLoja.get(id) || []), f]);
  }
  const escolhidos = [];
  for (const feedsDaLoja of porLoja.values()) {
    const emPortugues = feedsDaLoja.filter((f) => idioma(f).startsWith("pt"));
    if (emPortugues.length) { escolhidos.push(...emPortugues); continue; }
    const nota = (f) => (regiao(f) === "US" ? 2 : 0) + (idioma(f).startsWith("en") ? 1 : 0);
    const qtd = (f) => Number(pegar(f, "noofproducts", "products")) || 0;
    escolhidos.push(feedsDaLoja.sort((a, b) => nota(b) - nota(a) || qtd(b) - qtd(a))[0]);
  }
  console.log(`Awin: ${lista.length} feeds visíveis, ${aprovados.length} de lojas aprovadas, ${escolhidos.length} usados` +
    `${REGIOES.length ? ` (regiões ${REGIOES.join(", ")})` : ""}`);
  return escolhidos.map((f) => ({
    nome: `${pegar(f, "advertisername", "merchantname") || "Loja"} (feed ${pegar(f, "feedid", "id")}, ` +
      `${regiao(f) || "?"}/${idioma(f) || "?"})`,
    lojaId: pegar(f, "advertiserid", "merchantid"),
    lojaNome: pegar(f, "advertisername", "merchantname"),
    internacional: regiao(f) && regiao(f) !== "BR" ? 1 : 0,
    ler: () => baixarTexto(pegar(f, "url", "downloadurl", "feedurl"), chave),
  }));
}

// Cotação do dia em reais (ex.: { USD: 5.41, EUR: 5.93 }), da AwesomeAPI (dados do mercado).
// Para testes sem internet: ROBO_COTACOES='{"USD":5.4}'.
async function buscarCotacoes() {
  if (process.env.ROBO_COTACOES) return JSON.parse(process.env.ROBO_COTACOES);
  const moedas = ["USD", "EUR", "GBP", "CAD", "AUD", "CHF", "CNY", "JPY", "MXN", "ARS", "CLP"];
  try {
    const resp = await fetch(`https://economia.awesomeapi.com.br/json/last/${moedas.map((m) => `${m}-BRL`).join(",")}`);
    const json = await resp.json();
    const cotacoes = {};
    for (const m of moedas) {
      const valor = Number(json[`${m}BRL`]?.bid);
      if (valor > 0) cotacoes[m] = valor;
    }
    console.log(`Cotações: ${Object.entries(cotacoes).map(([m, v]) => `${m} ${v}`).join(", ")}`);
    return cotacoes;
  } catch (erro) {
    // Sem cotação, produtos em moeda estrangeira ficam de fora hoje (e nada deles é apagado)
    console.log(`⚠️ Não consegui a cotação do dia (${erro.message}); lojas em moeda estrangeira ficam para amanhã`);
    return {};
  }
}

// A lista pode vir em CSV ou em JSON
function lerTabela(texto) {
  const t = texto.trim();
  if (t.startsWith("[") || t.startsWith("{")) {
    const json = JSON.parse(t);
    const itens = Array.isArray(json) ? json : Object.values(json).find(Array.isArray) || [];
    return itens.map((i) => Object.fromEntries(Object.entries(i).map(([k, v]) => [k, v == null ? "" : String(v)])));
  }
  return lerCsv(texto);
}

async function main() {
  const inicio = Date.now();
  const banco = await abrirBanco();
  for (const comando of TABELAS_OFERTAS) await banco.executar(comando);
  for (const comando of MIGRACOES_OFERTAS) await banco.executar(comando).catch(() => {}); // coluna já existe
  COTACOES = { ...COTACOES, ...(await buscarCotacoes()) };

  // 1. Baixa os feeds
  const feeds = await obterFeeds();
  if (!feeds.length) {
    // Também protege contra apagar tudo se a Awin mudar o formato da lista
    console.log("Nenhuma loja aprovada com feed ainda. Nada foi alterado.");
    return;
  }
  const novas = new Map();
  const lojasAtivas = new Set(feeds.map((f) => f.lojaId).filter(Boolean));
  const lojasBaixadas = new Set();
  const relatorio = [];
  for (const feed of feeds) {
    try {
      const produtos = lerCsv(await feed.ler());
      let aceitos = 0;
      for (const p of produtos) {
        const o = paraOferta(p, feed);
        if (!o) continue;
        novas.set(o.id, o);
        lojasBaixadas.add(lojaDoId(o.id));
        lojasAtivas.add(lojaDoId(o.id));
        aceitos++;
      }
      relatorio.push(`✅ ${feed.nome}: ${aceitos} de ${produtos.length} produtos aceitos`);
    } catch (erro) {
      relatorio.push(`❌ ${feed.nome}: ${erro.message}`);
    }
  }
  relatorio.forEach((l) => console.log(l));
  if (!lojasBaixadas.size) throw new Error("Nenhum feed foi baixado com sucesso; nada foi alterado");

  // 2. Compara com o que já está no banco
  const atuais = new Map();
  for (let ultimo = ""; ;) {
    const linhas = await banco.consultar(
      "SELECT id, assinatura, preco FROM ofertas WHERE fonte = 'awin' AND id > ? ORDER BY id LIMIT 5000", [ultimo]);
    for (const l of linhas) atuais.set(l.id, l);
    if (linhas.length < 5000) break;
    ultimo = linhas.at(-1).id;
  }

  // Só remove produtos de lojas que vieram certinho hoje, ou de lojas que
  // saíram da lista de aprovadas. Feed com erro não apaga nada, e feed que
  // encolheu mais da metade de um dia para o outro também não (parece falha).
  const contar = (ids) => ids.reduce((c, id) => c.set(lojaDoId(id), (c.get(lojaDoId(id)) || 0) + 1), new Map());
  const antesPorLoja = contar([...atuais.keys()]);
  const hojePorLoja = contar([...novas.keys()]);
  for (const [loja, antes] of antesPorLoja) {
    if (lojasBaixadas.has(loja) && hojePorLoja.get(loja) < antes / 2 && antes >= 20) {
      lojasBaixadas.delete(loja);
      relatorio.push(`⚠️ Loja ${loja}: feed caiu de ${antes} para ${hojePorLoja.get(loja)} produtos; nada foi removido dela hoje`);
      console.log(relatorio.at(-1));
    }
  }
  const remover = [...atuais.keys()].filter((id) => {
    const loja = lojaDoId(id);
    return lojasBaixadas.has(loja) ? !novas.has(id) : !lojasAtivas.has(loja) && !arquivosFeed.length;
  });
  const gravarLista = [...novas.values()].filter((o) => atuais.get(o.id)?.assinatura !== o.assinatura);

  // 3. Grava, respeitando o limite diário
  let orcamento = LIMITE;
  const removerHoje = remover.slice(0, orcamento);
  orcamento -= removerHoje.length;
  // Primeiro os que já existem (preço mudou), depois os novos
  gravarLista.sort((a, b) => Number(atuais.has(b.id)) - Number(atuais.has(a.id)));
  const gravarHoje = gravarLista.slice(0, Math.max(orcamento, 0));

  const agora = Date.now();
  const dia = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  const limiteHistorico = new Date(agora - DIAS_HISTORICO * 864e5).toISOString().slice(0, 10);
  const comandos = [];
  for (let i = 0; i < removerHoje.length; i += 200) {
    comandos.push(`DELETE FROM ofertas WHERE id IN (${removerHoje.slice(i, i + 200).map(sql).join(", ")})`);
  }
  let precosMudaram = 0;
  for (const o of gravarHoje) {
    comandos.push(gravar(o, agora));
    const antes = atuais.get(o.id);
    if (!antes || antes.preco !== o.preco) {
      if (antes) precosMudaram++;
      comandos.push(`INSERT OR REPLACE INTO precos (oferta_id, dia, preco) VALUES (${sql(o.id)}, ${sql(dia)}, ${sql(o.preco)})`);
    }
  }
  comandos.push(`DELETE FROM precos WHERE dia < ${sql(limiteHistorico)}`);
  await enviarEmLotes(banco, comandos);

  const novos = gravarHoje.filter((o) => !atuais.has(o.id)).length;
  const pendentes = remover.length - removerHoje.length + gravarLista.length - gravarHoje.length;
  const resumo = [
    `Produtos nos feeds: ${novas.size}`,
    `Novos no site: ${novos}`,
    `Atualizados: ${gravarHoje.length - novos} (preço mudou em ${precosMudaram})`,
    `Removidos: ${removerHoje.length}`,
    pendentes ? `Ficaram para amanhã (limite diário de ${LIMITE}): ${pendentes}` : null,
    `Tempo: ${Math.round((Date.now() - inicio) / 1000)} s`,
  ].filter(Boolean);
  resumo.forEach((l) => console.log(l));
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      `## 🛒 Robô de preços — Awin\n\n${[...relatorio, "", ...resumo].map((l) => (l ? `- ${l}` : "")).join("\n")}\n`);
  }
}

main().catch((erro) => {
  console.error(`ERRO: ${erro.message}`);
  process.exit(1);
});
