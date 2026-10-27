// =====================================================================
// ROBÔ DE PREÇOS — AWIN
// Baixa o catálogo (feed) de todas as lojas da Awin em que o Giovanni foi
// aprovado e atualiza a tabela de ofertas no banco D1 do site:
//   produto novo -> entra | preço mudou -> atualiza e guarda no histórico
//   produto sumiu do feed -> sai do site
// Roda sozinho todo dia pelo GitHub (.github/workflows/robo-precos.yml).
//
// Segredos (GitHub > Settings > Secrets and variables > Actions):
//   AWIN_FEED_KEY          link da "Lista de Feed" da conta antiga da Awin (pessoa física)
//   AWIN_FEED_KEY_PJ       o mesmo, da conta nova (empresa/MEI); loja aprovada nas duas usa a nova
//   CLOUDFLARE_API_TOKEN   token com permissão de editar o D1
//   CLOUDFLARE_ACCOUNT_ID  ID da conta do Cloudflare
//   D1_DATABASE_ID         ID do banco D1 ligado ao site (binding DB)
//
// Teste no computador, sem internet nem Cloudflare:
//   node robo/awin.mjs --feed robo/exemplo-awin.csv --sqlite /tmp/teste.sqlite
//   node robo/awin.mjs --feed robo/exemplo-awin-google.csv --loja 105615:Leveros --sqlite /tmp/teste.sqlite
// =====================================================================
import { createHash } from "node:crypto";
import { gunzipSync, createGunzip } from "node:zlib";
import { Readable } from "node:stream";
import { readFileSync, appendFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { normalizar } from "../lib/texto.js";
import { lojaComLinksQuebrados, linksQuebrados, sortear } from "../lib/links.js";
import { TABELAS_OFERTAS, MIGRACOES_OFERTAS, RESUMO_LOJAS_AWIN, INDICE_LOJA, CRIAR_INDICE_LOJA, juntarMilhares } from "../lib/ofertas.js";

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
// Cada produto gravado = ~5 linhas no D1 (produto, índices e busca). No plano grátis (100 mil gravações por dia) eram
// 8 mil; com o Workers Paid (23/10/2026: 50 milhões de gravações por mês) grava tudo de uma vez. O limite fica só
// como trava de segurança (300 mil = ~1,5 milhão de linhas, 3% do mês)
const LIMITE = Number(process.env.ROBO_LIMITE) || 300000;
const DIAS_HISTORICO = 180;
// Número de afiliado de cada conta da Awin (aparece no link da "Lista de Feed": .../publisher/3124296/...)
const idAfiliado = (segredo) => process.env.AWIN_ID_AFILIADO || (segredo.match(/publisher\/(\d+)/) || [])[1] || "";
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
// Tamanho do banco depois da última gravação (o D1 grátis aceita até 500 MB)
let tamanhoBanco = 0;
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
      if (resp.ok && json.success) {
        const tamanho = json.result?.at(-1)?.meta?.size_after;
        if (tamanho) tamanhoBanco = tamanho;
        return json.result;
      }
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
// Lê o CSV aos pedaços: cada linha vira um objeto e é entregue a aoLinha. Assim um feed grande
// (Posthaus, 22/10/2026) não precisa caber inteiro na memória.
function criarLeitorCsv(aoLinha) {
  let sep = null, chaves = null, inicio = "", linha = [], campo = "", aspas = false, fechou = false;
  const terminarLinha = () => {
    if (!chaves) chaves = linha.map((c) => c.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""));
    else if (linha.length > 1 || linha[0]) aoLinha(Object.fromEntries(chaves.map((k, i) => [k, (linha[i] ?? "").trim()])));
    linha = [];
  };
  const processar = (s) => {
    let ini = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (aspas) {
        if (c === '"') { campo += s.slice(ini, i); aspas = false; fechou = true; ini = i + 1; }
        continue;
      }
      // Aspas logo depois de fechar aspas = aspas dentro do texto ("")
      if (c === '"') { campo += s.slice(ini, i) + (fechou ? '"' : ""); aspas = true; fechou = false; ini = i + 1; continue; }
      fechou = false;
      if (c === sep) { linha.push(campo + s.slice(ini, i)); campo = ""; ini = i + 1; }
      else if (c === "\n") { linha.push((campo + s.slice(ini, i)).replace(/\r$/, "")); campo = ""; ini = i + 1; terminarLinha(); }
    }
    campo += s.slice(ini);
  };
  const comecar = () => {
    inicio = inicio.replace(/^﻿/, "");
    const primeira = inicio.slice(0, inicio.indexOf("\n") >>> 0);
    sep = [",", ";", "|", "\t"].reduce((a, b) => (primeira.split(b).length > primeira.split(a).length ? b : a));
    const t = inicio; inicio = "";
    processar(t);
  };
  return {
    parte(texto) {
      if (sep) return processar(texto);
      inicio += texto;
      if (inicio.includes("\n")) comecar();
    },
    fim() {
      if (!sep) comecar();
      if (campo || linha.length) { linha.push(campo); terminarLinha(); }
    },
  };
}

function lerCsv(texto) {
  const linhas = [];
  const leitor = criarLeitorCsv((l) => linhas.push(l));
  leitor.parte(texto);
  leitor.fim();
  return linhas;
}

// Pedaços de texto de um arquivo (compactado ou não), sem juntar tudo na memória
async function* pedacosDeTexto(bytes) {
  const iterador = bytes[Symbol.asyncIterator]();
  const primeiro = await iterador.next();
  if (primeiro.done) return;
  const b = Buffer.from(primeiro.value);
  async function* tudo() { yield b; for (let r; !(r = await iterador.next()).done;) yield Buffer.from(r.value); }
  let fluxo = Readable.from(tudo());
  if (b[0] === 0x1f && b[1] === 0x8b) fluxo = fluxo.pipe(createGunzip());
  fluxo.setEncoding("utf8");
  yield* fluxo;
}

async function baixarPedacos(url, esconder = "") {
  const resp = await fetch(url);
  if (!resp.ok) {
    const corpo = (await resp.text().catch(() => "")).replaceAll(esconder || "\0", "***").slice(0, 300);
    throw new Error(`HTTP ${resp.status} ${corpo.replace(/\s+/g, " ").trim()}`);
  }
  return pedacosDeTexto(resp.body);
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
function linkAfiliado(p, lojaId, afiliado) {
  const link = p.aw_deep_link || p.link || "";
  if (/awin1\.com|tidd\.ly/i.test(link)) return link;
  if (!/^https?:\/\//i.test(link) || !afiliado) return null;
  return `https://www.awin1.com/cread.php?awinmid=${lojaId}&awinaffid=${afiliado}&ued=${encodeURIComponent(link)}`;
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
  if (!taxa) return `sem cotação para ${moeda}`;
  const converter = (v) => (v > 0 ? Math.round(v * taxa * 100) / 100 : v);
  const promocao = converter(numero(p.sale_price));
  const cheio = converter(numero(p.search_price) || numero(p.store_price) || numero(p.price));
  const preco = promocao > 0 ? promocao : cheio;
  const link = lojaId && linkAfiliado(p, lojaId, feed.afiliado ?? idAfiliado(process.env.AWIN_FEED_KEY || ""));
  if (!lojaId) return "sem loja";
  if (!produtoId) return "sem código do produto";
  if (!titulo) return "sem nome";
  if (!(preco > 0)) return "sem preço";
  if (!link) return "sem link de afiliado";
  if (/^(0|no|false|n)$/i.test(p.in_stock || "") || /^(0|no|false|n)$/i.test(p.is_for_sale || "")) return "fora de estoque";
  if (/out.of.stock|esgotado|indispon/i.test(p.availability || p.stock_status || "")) return "fora de estoque";

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
  // Código de barras (GTIN/EAN), sempre com 14 dígitos para comparar entre lojas
  const codigo = String(p.gtin || p.ean || p.product_gtin || p.upc || p.isbn || "").replace(/\D/g, "");
  const gtin = codigo.length >= 8 && codigo.length <= 14 && !/^0+$/.test(codigo) ? codigo.padStart(14, "0") : null;
  // Descrição sem HTML, curta, e até 5 fotos (a principal + as extras do feed)
  const descricao = String(p.description || p.product_short_description || "")
    .replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim().slice(0, 600) || null;
  const extras = [p.additional_image_link, p.alternate_image, p.alternate_image_two, p.alternate_image_three]
    .flatMap((v) => String(v || "").split(","))
    .map((v) => v.trim());
  const imagem = httpsOuNada(p.merchant_image_url) || httpsOuNada(p.large_image) || httpsOuNada(p.image_link)
    || httpsOuNada(p.aw_image_url);
  const imagens = [...new Set([imagem, ...extras.map(httpsOuNada)].filter(Boolean))].slice(0, 5);
  const dados = {
    id: `awin-${lojaId}-${produtoId}`,
    fonte: "awin",
    loja: normalizar(lojaNome).replace(/ /g, "-"),
    loja_nome: lojaNome,
    titulo,
    preco,
    preco_antigo: precoAntigo,
    desconto: precoAntigo ? Math.round((1 - preco / precoAntigo) * 100) : null,
    imagem,
    categoria,
    link,
    frete_gratis: textoFrete !== undefined && textoFrete !== "" && frete === 0 ? 1 : 0,
    internacional: feed.internacional || moeda !== "BRL" ? 1 : 0,
    moeda: moeda === "BRL" ? null : moeda,
    gtin,
    descricao,
    imagens: imagens.length > 1 ? JSON.stringify(imagens) : null,
    busca: normalizar(juntarMilhares(`${titulo} ${marca} ${categoria || ""} ${lojaNome}`)),
  };
  // Para moeda estrangeira, a assinatura usa o preço original + a faixa do câmbio
  const base = moeda === "BRL" ? dados : { ...dados, preco: numero(p.sale_price) || numero(p.search_price)
    || numero(p.store_price) || numero(p.price), preco_antigo: null, desconto: null, cambio: faixaCambio(taxa) };
  // Endereço do produto direto na loja, sem o rastreio da Awin: só para a conferência dos links (não vai para o banco)
  const daAwin = /awin1\.com|tidd\.ly/i.test(p.link || "");
  const destino = httpsOuNada(p.merchant_deep_link) || (!daAwin && httpsOuNada(p.link))
    || httpsOuNada((() => { try { return new URL(link).searchParams.get("ued"); } catch { return null; } })());
  return { ...dados, assinatura: assinar(base), destino };
}

const lojaDoId = (id) => id.split("-")[1];

// ---------------------------------------------------------------------
// Fotos quebradas: algumas lojas mandam no feed endereços de foto que não existem mais (23/10/2026: ~1 em 3 na
// Lauri Esporte, ~5% na Monte Carlo; o site mostrava o desenho padrão). O robô testa cada foto e fica com as que
// abrem; produto sem nenhuma foto que abra fica de fora. O resultado fica guardado (cache do GitHub Actions) e só é
// testado de novo depois de alguns dias, para não pedir dezenas de milhares de fotos às lojas toda madrugada.
// ---------------------------------------------------------------------
const ARQUIVO_FOTOS = process.env.ROBO_CACHE_FOTOS || ".cache/fotos.json";
const DIAS_FOTO_BOA = 14;
const DIAS_FOTO_RUIM = 3;
const TESTES_AO_MESMO_TEMPO = 64; // com 32, a 1ª vez (83 mil fotos, ~0,6 s cada) passava de 25 min
const NAVEGADOR = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

function guardarFotos(guardadas) {
  try {
    mkdirSync(dirname(ARQUIVO_FOTOS), { recursive: true });
    writeFileSync(ARQUIVO_FOTOS, JSON.stringify(Object.fromEntries(guardadas)));
  } catch (erro) {
    console.log(`Não deu para guardar o teste das fotos: ${erro.message}`);
  }
}

function lerFotosGuardadas() {
  try { return new Map(Object.entries(JSON.parse(readFileSync(ARQUIVO_FOTOS, "utf8")))); } catch { return new Map(); }
}

// true = abre, false = não existe (404, 410, não é imagem…), null = não deu para saber (tempo esgotado, rede)
async function fotoAbre(url) {
  const pedir = (metodo) => fetch(url, {
    method: metodo, redirect: "follow", signal: AbortSignal.timeout(10000),
    headers: { "User-Agent": NAVEGADOR, ...(metodo === "GET" ? { Range: "bytes=0-1023" } : {}) },
  });
  try {
    let r = await pedir("HEAD");
    // Alguns servidores não aceitam HEAD: tenta um pedacinho com GET
    if ([403, 405, 501].includes(r.status)) r = await pedir("GET");
    if (r.body) r.body.cancel().catch(() => {});
    // 403 do Amazon S3 (erro em XML, direto ou pela CloudFront) = arquivo que não existe: o S3 responde "acesso negado"
    // no lugar de 404 (27/10/2026: ~95% das fotos da Lojas Benoit, que não abrem nem no navegador)
    if (r.status === 403 && (/AmazonS3/i.test(r.headers.get("server") || "") || /xml/.test(r.headers.get("content-type") || ""))) return false;
    // Outro 403: alguns servidores barram robôs mas abrem no navegador (o imgur dá 403 para o Node e 200 para o curl).
    // Só 404/410 e "não é imagem" contam como foto quebrada
    if (r.status >= 500 || r.status === 429 || r.status === 403 || r.status === 401) return null;
    const tipo = r.headers.get("content-type") || "";
    return r.ok && (!tipo || tipo.startsWith("image/"));
  } catch {
    return null;
  }
}

async function conferirFotos(ofertas) {
  const guardadas = lerFotosGuardadas();
  const hoje = Math.floor(Date.now() / 864e5);
  const vencida = (g) => !g || hoje - g.dia > (g.ok ? DIAS_FOTO_BOA : DIAS_FOTO_RUIM);
  const testar = new Set();
  const fotosDe = (o) => (o.imagens ? JSON.parse(o.imagens) : [o.imagem]).filter(Boolean);
  // Primeiro só a foto principal; as extras só de quem teve a principal quebrada
  const rodada = async (urls) => {
    const fila = [...urls].filter((u) => vencida(guardadas.get(u)));
    let i = 0, feitas = 0;
    await Promise.all(Array.from({ length: TESTES_AO_MESMO_TEMPO }, async () => {
      while (i < fila.length) {
        const url = fila[i++];
        const ok = await fotoAbre(url);
        // Foto boa ganha um dia sorteado na última semana: assim as ~83 mil não vencem todas no mesmo dia
        if (ok !== null) guardadas.set(url, { ok, dia: ok ? hoje - Math.floor(Math.random() * 7) : hoje });
        // De tempos em tempos grava o que já testou: se o robô passar do tempo, a próxima vez continua daqui
        if (++feitas % 5000 === 0) {
          guardarFotos(guardadas);
          console.log(`Fotos testadas: ${feitas} de ${fila.length}`);
        }
      }
    }));
    return fila.length;
  };
  const boa = (u) => guardadas.get(u)?.ok !== false; // sem resposta conta como boa (não tira produto por falha de rede)
  for (const o of ofertas) if (o.imagem) testar.add(o.imagem);
  let testadas = await rodada(testar);
  const extras = new Set(ofertas.filter((o) => o.imagem && !boa(o.imagem)).flatMap(fotosDe));
  testadas += await rodada(extras);
  guardarFotos(guardadas);
  const semFoto = new Map(); // loja -> quantos ficaram de fora
  const resultado = [];
  for (const o of ofertas) {
    const fotos = fotosDe(o).filter(boa);
    if (!o.imagem || !fotos.length) {
      semFoto.set(o.loja_nome, (semFoto.get(o.loja_nome) || 0) + 1);
      continue;
    }
    if (fotos[0] === o.imagem && fotos.length === fotosDe(o).length) { resultado.push(o); continue; }
    // Foto principal trocada pela 1ª extra que abre: a assinatura muda para o produto ser regravado
    const imagens = fotos.length > 1 ? JSON.stringify(fotos) : null;
    resultado.push({ ...o, imagem: fotos[0], imagens, assinatura: assinar({ a: o.assinatura, fotos }) });
  }
  return { resultado, semFoto, testadas };
}

// ---------------------------------------------------------------------
// Links "Comprar" quebrados (25/10/2026): de cada loja, abre alguns produtos direto no site dela (endereço sem o
// rastreio da Awin, para não contar clique falso). Se quase todos dão "página não encontrada", a loja sai do site
// até o feed voltar a apontar para páginas que existem (a conferência é refeita toda madrugada).
// ---------------------------------------------------------------------
const LINKS_POR_LOJA = 8;
// Loja pequena com algum link quebrado na amostra: testa todos os produtos dela e tira só os quebrados
// (25/10/2026: na Arno, 6 de 8 davam 404 e o resto abria). Loja grande: só a regra da loja inteira
const TESTAR_TODOS_ATE = 3000;

async function conferirLinks(ofertas) {
  const porLoja = new Map();
  for (const o of ofertas) {
    if (!o.destino) continue;
    if (!porLoja.has(o.loja_nome)) porLoja.set(o.loja_nome, []);
    porLoja.get(o.loja_nome).push(o.destino);
  }
  const quebradas = new Set(); // lojas inteiras fora
  const urlsRuins = new Set(); // produtos fora
  const linhas = [];
  for (const [loja, urls] of porLoja) {
    const r = await lojaComLinksQuebrados(sortear(urls, LINKS_POR_LOJA), { minimo: 5 });
    if (r.quebrados >= 2 && urls.length <= TESTAR_TODOS_ATE) {
      const ruins = await linksQuebrados(urls);
      for (const u of ruins) urlsRuins.add(u);
      linhas.push(`${ruins.size ? "⚠️ " : ""}${loja}: todos os ${urls.length} produtos testados; ${ruins.size} dão "página não encontrada" na loja` +
        (ruins.size ? " e ficam fora do site hoje" : ""));
    } else if (r.quebrada) {
      quebradas.add(loja);
      linhas.push(`⚠️ ${loja}: ${r.quebrados} de ${r.testados} produtos dão "página não encontrada" na loja; loja fora do site hoje`);
    } else if (r.quebrados) {
      linhas.push(`${loja}: ${r.quebrados} de ${r.testados} produtos testados não abrem (loja continua)`);
    }
  }
  const resultado = ofertas.filter((o) => !quebradas.has(o.loja_nome) && !urlsRuins.has(o.destino));
  return { resultado, quebradas, produtosFora: urlsRuins.size, linhas, lojas: porLoja.size };
}

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
  "imagem", "categoria", "link", "frete_gratis", "internacional", "moeda", "gtin", "descricao", "imagens", "busca", "assinatura", "atualizado_em"];

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
      return { nome: caminho, lojaId, lojaNome, ler: async () => pedacosDeTexto(Readable.from([readFileSync(caminho)])) };
    });
  }
  // Duas contas da Awin: a nova (empresa/MEI, 20/10/2026) e a antiga (pessoa física). As lojas vão sendo
  // aprovadas de novo na conta nova; enquanto isso, as que só estão na antiga continuam vindo dela.
  // Loja aprovada nas duas usa a nova (o link do produto passa a levar o número de afiliado da empresa).
  const contas = [["AWIN_FEED_KEY_PJ", "conta nova"], ["AWIN_FEED_KEY", "conta antiga"]]
    .map(([nome, rotulo]) => ({ nome, rotulo, segredo: (process.env[nome] || "").trim() }))
    .filter((c) => c.segredo);
  if (!contas.length) throw new Error("Falta o segredo AWIN_FEED_KEY");
  const feeds = [];
  const lojasVistas = new Set();
  for (const conta of contas) {
    const daConta = await feedsDaConta(conta);
    const novas = daConta.filter((f) => !lojasVistas.has(f.lojaId));
    for (const f of novas) lojasVistas.add(f.lojaId);
    if (novas.length < daConta.length) console.log(`${conta.rotulo}: ${daConta.length - novas.length} loja(s) já vêm da conta nova`);
    feeds.push(...novas);
  }
  return feeds;
}

// Feeds das lojas aprovadas numa conta. O segredo pode ser: o link da "Lista de Feed" (Ferramentas >
// Crie um Feed, caixa "Download da Lista de Feed"), um link de download de feed, ou só a chave.
async function feedsDaConta({ nome: nomeSegredo, rotulo, segredo }) {
  const chave = (segredo.match(/apikey\/([^/?#\s]+)/i) || [])[1];
  const urlLista = /^https?:\/\/.*feedlist/i.test(segredo) ? segredo : LISTA_FEEDS + encodeURIComponent(chave || segredo);
  const esconder = (url) => url.replace(/[0-9a-f]{24,}/gi, "***");
  let textoLista;
  try {
    textoLista = await baixarTexto(urlLista, chave || segredo);
  } catch (erro) {
    throw new Error(`A Awin recusou a lista de feeds (${esconder(erro.message)}). Confira o segredo ${nomeSegredo}: ` +
      `deve ser o link da caixa "Download da Lista de Feed" (Ferramentas > Crie um Feed)`);
  }
  const lista = lerTabela(textoLista);
  if (!lista.length) throw new Error(`A lista de feeds da Awin veio vazia (o segredo ${nomeSegredo} está certo?)`);
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
  console.log(`Awin (${rotulo}): ${lista.length} feeds visíveis, ${aprovados.length} de lojas aprovadas, ${escolhidos.length} usados` +
    `${REGIOES.length ? ` (regiões ${REGIOES.join(", ")})` : ""}`);
  return escolhidos.map((f) => ({
    nome: `${pegar(f, "advertisername", "merchantname") || "Loja"} (feed ${pegar(f, "feedid", "id")}, ` +
      `${regiao(f) || "?"}/${idioma(f) || "?"})`,
    lojaId: pegar(f, "advertiserid", "merchantid"),
    lojaNome: pegar(f, "advertisername", "merchantname"),
    internacional: regiao(f) && regiao(f) !== "BR" ? 1 : 0,
    afiliado: idAfiliado(segredo),
    ler: () => baixarPedacos(pegar(f, "url", "downloadurl", "feedurl"), chave),
  }));
}

// Cotação do dia em reais (ex.: { USD: 5.41, EUR: 5.93 }), da AwesomeAPI (dados do mercado).
// Para testes sem internet: ROBO_COTACOES='{"USD":5.4}'.
async function buscarCotacoes() {
  if (process.env.ROBO_COTACOES) return JSON.parse(process.env.ROBO_COTACOES);
  const moedas = ["USD", "EUR", "GBP", "CAD", "AUD", "CHF", "CNY", "JPY", "MXN", "ARS", "CLP"];
  // Tenta várias fontes gratuitas, na ordem; usa a primeira que responder
  const fontes = [
    ["AwesomeAPI", async () => {
      const json = await (await fetch(`https://economia.awesomeapi.com.br/json/last/${moedas.map((m) => `${m}-BRL`).join(",")}`)).json();
      return Object.fromEntries(moedas.map((m) => [m, Number(json[`${m}BRL`]?.bid)]));
    }],
    ["ExchangeRate-API", async () => {
      const json = await (await fetch("https://open.er-api.com/v6/latest/BRL")).json();
      return Object.fromEntries(moedas.map((m) => [m, 1 / Number(json.rates?.[m])]));
    }],
    ["Frankfurter (BCE)", async () => {
      const json = await (await fetch("https://api.frankfurter.app/latest?from=BRL")).json();
      return Object.fromEntries(moedas.map((m) => [m, 1 / Number(json.rates?.[m])]));
    }],
  ];
  for (const [nome, buscar] of fontes) {
    try {
      const cotacoes = Object.fromEntries(Object.entries(await buscar())
        .filter(([, v]) => Number.isFinite(v) && v > 0).map(([m, v]) => [m, Math.round(v * 10000) / 10000]));
      if (cotacoes.USD) {
        console.log(`Cotações (${nome}): ${Object.entries(cotacoes).map(([m, v]) => `${m} ${v}`).join(", ")}`);
        return cotacoes;
      }
      console.log(`Cotação: ${nome} não trouxe o dólar; tentando a próxima fonte`);
    } catch (erro) {
      console.log(`Cotação: ${nome} falhou (${erro.message}); tentando a próxima fonte`);
    }
  }
  // Sem cotação, produtos em moeda estrangeira ficam de fora hoje (e nada deles é apagado)
  console.log("⚠️ Não consegui a cotação do dia; lojas em moeda estrangeira ficam para amanhã");
  return {};
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
  // Índice novo: montar grava 1 linha por oferta já no banco (MAX(num) lê 1 linha; COUNT(*) leria todas).
  // Esse gasto sai do orçamento de hoje (~5 linhas por produto), para não passar das 100 mil gravações do D1
  let gastoIndice = 0;
  const temIndice = (await banco.consultar("SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = ?", [INDICE_LOJA])).length;
  if (!temIndice) {
    gastoIndice = (await banco.consultar("SELECT MAX(num) AS n FROM ofertas"))[0]?.n || 0;
    await banco.executar(CRIAR_INDICE_LOJA);
    console.log(`Índice ${INDICE_LOJA} criado (~${gastoIndice} linhas gravadas)`);
  }
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
      let aceitos = 0, total = 0, colunas = "";
      const recusas = {};
      const daLoja = new Map();
      const leitor = criarLeitorCsv((p) => {
        if (!total++) colunas = Object.keys(p).join(", ");
        const o = paraOferta(p, feed);
        // paraOferta devolve o motivo (texto) quando o produto fica de fora
        if (typeof o === "string") { recusas[o] = (recusas[o] || 0) + 1; return; }
        daLoja.set(o.id, o);
        aceitos++;
      });
      for await (const pedaco of await feed.ler()) leitor.parte(pedaco);
      leitor.fim();
      // Só conta a loja como baixada se o feed chegou inteiro (erro no meio não apaga nada)
      for (const [id, o] of daLoja) {
        novas.set(id, o);
        lojasBaixadas.add(lojaDoId(id));
        lojasAtivas.add(lojaDoId(id));
      }
      const motivos = Object.entries(recusas).sort((a, b) => b[1] - a[1]).map(([m, n]) => `${m}: ${n}`).join(", ");
      relatorio.push(`✅ ${feed.nome}: ${aceitos} de ${total} produtos aceitos${motivos ? ` (fora: ${motivos})` : ""}`);
      if (total && aceitos < total / 2) console.log(`Colunas do feed ${feed.nome}: ${colunas}`);
    } catch (erro) {
      relatorio.push(`❌ ${feed.nome}: ${erro.message}`);
    }
  }
  if (!lojasBaixadas.size) {
    relatorio.forEach((l) => console.log(l));
    throw new Error("Nenhum feed foi baixado com sucesso; nada foi alterado");
  }
  // Produtos tirados de propósito (foto que não abre ou link quebrado): não contam para a trava "feed caiu mais da
  // metade" lá embaixo (25/10/2026: na Arno saíram 50 de 87; 27/10: na Lojas Benoit, 3.072 sem foto, e a trava não deixou removê-los)
  const foraDeProposito = [];
  // Teste local com arquivo de exemplo (--feed): as fotos são de mentira, não testa
  if (!arquivosFeed.length && !process.env.ROBO_SEM_TESTE_FOTOS) {
    const inicioFotos = Date.now();
    const { resultado, semFoto, testadas } = await conferirFotos([...novas.values()]);
    const comFoto = new Set(resultado.map((o) => o.id));
    for (const id of novas.keys()) if (!comFoto.has(id)) foraDeProposito.push(id);
    novas.clear();
    for (const o of resultado) novas.set(o.id, o);
    const fora = [...semFoto].map(([loja, n]) => `${loja} ${n}`).join(", ");
    relatorio.push(`📷 Fotos: ${testadas} testadas em ${Math.round((Date.now() - inicioFotos) / 1000)} s; ` +
      (fora ? `produtos sem foto que abre (ficam de fora): ${fora}` : "nenhum produto sem foto"));
    const links = await conferirLinks([...novas.values()]);
    const ficam = new Set(links.resultado.map((o) => o.id));
    for (const id of novas.keys()) if (!ficam.has(id)) foraDeProposito.push(id);
    novas.clear();
    for (const o of links.resultado) novas.set(o.id, o);
    relatorio.push(`🔗 Links: ${LINKS_POR_LOJA} produtos testados em cada uma das ${links.lojas} lojas; ` +
      (links.quebradas.size || links.produtosFora
        ? `${links.quebradas.size} loja(s) inteira(s) e ${links.produtosFora} produto(s) fora por links quebrados` : "todas abrem"));
    relatorio.push(...links.linhas);
  }
  relatorio.forEach((l) => console.log(l));

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
  const hojePorLoja = contar([...novas.keys(), ...foraDeProposito]);
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
  let orcamento = LIMITE - Math.ceil(gastoIndice / 5);
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
  // Apaga o histórico antigo, mas guarda o último preço de cada produto antes do limite: só gravamos quando
  // o preço muda, então num produto de preço estável esse registro é o preço atual (sem ele, o histórico some)
  comandos.push(`DELETE FROM precos WHERE dia < ${sql(limiteHistorico)} AND dia < (SELECT MAX(p2.dia) FROM precos p2
    WHERE p2.oferta_id = precos.oferta_id AND p2.dia < ${sql(limiteHistorico)})`);
  comandos.push(...RESUMO_LOJAS_AWIN);
  await enviarEmLotes(banco, comandos);

  const novos = gravarHoje.filter((o) => !atuais.has(o.id)).length;
  const pendentes = remover.length - removerHoje.length + gravarLista.length - gravarHoje.length;
  const resumo = [
    `Produtos nos feeds: ${novas.size}`,
    `Novos no site: ${novos}`,
    `Atualizados: ${gravarHoje.length - novos} (preço mudou em ${precosMudaram})`,
    `Removidos: ${removerHoje.length}`,
    pendentes ? `Ficaram para amanhã (limite diário de ${LIMITE}): ${pendentes}` : null,
    tamanhoBanco ? `Tamanho do banco: ${Math.round(tamanhoBanco / 1e6)} MB de 500 MB` : null,
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
