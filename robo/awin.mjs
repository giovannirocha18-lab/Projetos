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
// =====================================================================
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { readFileSync, appendFileSync } from "node:fs";
import { normalizar } from "../lib/texto.js";
import { TABELAS_OFERTAS, juntarMilhares } from "../lib/ofertas.js";

const LISTA_FEEDS = "https://productdata.awin.com/datafeed/list/apikey/";
const REGIOES = (process.env.ROBO_REGIOES || "BR").split(",");
// Limite de produtos novos/alterados/removidos por dia. O plano grátis do D1
// aceita 100 mil linhas gravadas por dia, e cada produto grava mais de uma
// (tabela + índice de busca + histórico). O que passar fica para o dia seguinte.
const LIMITE = Number(process.env.ROBO_LIMITE) || 20000;
const DIAS_HISTORICO = 180;
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

async function baixarTexto(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
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

function paraOferta(p) {
  const lojaId = p.merchant_id;
  const link = p.aw_deep_link;
  const titulo = (p.product_name || "").replace(/\s+/g, " ").slice(0, 200);
  const preco = numero(p.search_price) || numero(p.store_price);
  if (!lojaId || !p.aw_product_id || !link || !titulo || !(preco > 0)) return null;
  if (p.currency && p.currency.toUpperCase() !== "BRL") return null;
  if (/^(0|no|false|n)$/i.test(p.in_stock || "") || /^(0|no|false|n)$/i.test(p.is_for_sale || "")) return null;

  const antigo = Math.max(numero(p.rrp_price) || 0, numero(p.product_price_old) || 0, numero(p.base_price) || 0);
  const precoAntigo = antigo > preco * 1.01 ? antigo : null;
  const lojaNome = nomeDaLoja(p.merchant_name) || `Loja ${lojaId}`;
  const categoria = (p.category_name || p.merchant_category || "").slice(0, 60) || null;
  const frete = numero(p.delivery_cost);
  const dados = {
    id: `awin-${lojaId}-${p.aw_product_id}`,
    fonte: "awin",
    loja: normalizar(lojaNome).replace(/ /g, "-"),
    loja_nome: lojaNome,
    titulo,
    preco,
    preco_antigo: precoAntigo,
    desconto: precoAntigo ? Math.round((1 - preco / precoAntigo) * 100) : null,
    imagem: httpsOuNada(p.merchant_image_url) || httpsOuNada(p.large_image) || httpsOuNada(p.aw_image_url),
    categoria,
    link,
    frete_gratis: p.delivery_cost !== undefined && p.delivery_cost !== "" && frete === 0 ? 1 : 0,
    busca: normalizar(juntarMilhares(`${titulo} ${p.brand_name || ""} ${categoria || ""} ${lojaNome}`)),
  };
  return { ...dados, assinatura: assinar(dados) };
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
  "imagem", "categoria", "link", "frete_gratis", "busca", "assinatura", "atualizado_em"];

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
    return arquivosFeed.map((caminho) => ({ nome: caminho, ler: async () => descompactar(readFileSync(caminho)) }));
  }
  const chave = process.env.AWIN_FEED_KEY;
  if (!chave) throw new Error("Falta o segredo AWIN_FEED_KEY");
  const lista = lerCsv(await baixarTexto(LISTA_FEEDS + encodeURIComponent(chave)));
  if (!lista.length) throw new Error("A lista de feeds da Awin veio vazia (a chave AWIN_FEED_KEY está certa?)");
  const ativos = lista.filter((f) =>
    /^(active|joined)/i.test(f.membership_status || "") && f.url
    && (!f.primary_region || REGIOES.includes(f.primary_region.toUpperCase())));
  console.log(`Awin: ${lista.length} feeds visíveis, ${ativos.length} de lojas aprovadas (${REGIOES.join(", ")})`);
  return ativos.map((f) => ({
    nome: `${f.advertiser_name} (feed ${f.feed_id})`,
    lojaId: f.advertiser_id,
    ler: () => baixarTexto(f.url),
  }));
}

async function main() {
  const inicio = Date.now();
  const banco = await abrirBanco();
  for (const comando of TABELAS_OFERTAS) await banco.executar(comando);

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
        const o = paraOferta(p);
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
