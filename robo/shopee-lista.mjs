// Robô da lista da Shopee (08/11/2026): baixa o feed oficial de produtos da área de afiliados da Shopee ("Feed de produto" >
// "Shopee Oficial BR", link no Secret SHOPEE_FEED_OFICIAL; o link é a "senha", nunca aparece no log) e guarda no banco D1:
//   shopee_lista (+ índice de busca shopee_lista_fts) -> a busca do site soma esses produtos aos da Shopee ao vivo
//   precos -> o preço de hoje (histórico e selo "Desconto real", igual aos da Awin)
// Só grava o que mudou (assinatura). Se a lista vier com menos da metade dos produtos de ontem, não apaga nada (parece falha).
// Roda na madrugada (robo-precos.yml, job "shopeelista"). Teste: SHOPEE_LISTA_LIMITE=2000 grava só os 2.000 primeiros.
import { createHash } from "node:crypto";
import { createGunzip } from "node:zlib";
import { Readable } from "node:stream";
import { appendFileSync } from "node:fs";
import { TABELAS_SHOPEE_LISTA, MIGRACOES_SHOPEE_LISTA, textoDeBusca } from "../lib/shopeeLista.js";
import { paraPainel } from "./painel.mjs";

const LIMITE = Number(process.env.SHOPEE_LISTA_LIMITE) || Infinity;
const TAMANHO_LOTE = 90_000; // bytes de SQL por envio (o D1 aceita até 100 mil)
const DIAS_HISTORICO = 180;
const relatorio = [];
const anotar = (t) => { console.log(t); relatorio.push(t); };

// ---------------- Banco (API do D1) ----------------
const { CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: conta, D1_DATABASE_ID: bancoId } = process.env;
let tamanhoBanco = 0;
async function d1(corpo) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${conta}/d1/database/${bancoId}/query`;
  for (let tentativa = 1; ; tentativa++) {
    const resp = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
    const json = await resp.json().catch(() => ({}));
    if (resp.ok && json.success) {
      const t = json.result?.at(-1)?.meta?.size_after;
      if (t) tamanhoBanco = t;
      return json.result;
    }
    const erro = `D1 respondeu ${resp.status}: ${JSON.stringify(json.errors || json).slice(0, 400)}`;
    if (tentativa >= 4 || (resp.status < 500 && resp.status !== 429)) throw new Error(erro);
    console.log(`${erro} — tentando de novo`);
    await new Promise((r) => setTimeout(r, 2000 * 2 ** tentativa));
  }
}
const consultar = async (sql, params = []) => (await d1({ sql, params }))[0].results;
const executar = (sql) => d1({ sql });

function sql(v) {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new Error(`Número inválido: ${v}`);
    return String(v);
  }
  return `'${String(v).replace(/\u0000/g, "").replace(/'/g, "''")}'`;
}
async function enviarEmLotes(comandos) {
  let lote = "";
  let enviados = 0;
  for (const c of comandos) {
    if (lote && lote.length + c.length > TAMANHO_LOTE) {
      await executar(lote);
      lote = "";
      if (++enviados % 100 === 0) console.log(`  ${enviados} envios ao banco…`);
    }
    lote += `${c};\n`;
  }
  if (lote) await executar(lote);
}

// ---------------- Leitura do CSV (aos pedaços; o arquivo tem ~200 MB) ----------------
function criarLeitorCsv(aoLinha) {
  let chaves = null, linha = [], campo = "", aspas = false, fechou = false;
  const terminar = () => {
    if (!chaves) chaves = linha.map((c) => c.replace(/^﻿/, "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""));
    else if (linha.length > 1) aoLinha(Object.fromEntries(chaves.map((k, i) => [k, (linha[i] ?? "").trim()])));
    linha = [];
  };
  return {
    parte(s) {
      let ini = 0;
      for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (aspas) {
          if (c === '"') { campo += s.slice(ini, i); aspas = false; fechou = true; ini = i + 1; }
          continue;
        }
        if (c === '"') { campo += s.slice(ini, i) + (fechou ? '"' : ""); aspas = true; fechou = false; ini = i + 1; continue; }
        fechou = false;
        if (c === ",") { linha.push(campo + s.slice(ini, i)); campo = ""; ini = i + 1; }
        else if (c === "\n") { linha.push((campo + s.slice(ini, i)).replace(/\r$/, "")); campo = ""; ini = i + 1; terminar(); }
      }
      campo += s.slice(ini);
    },
    fim() { if (campo || linha.length) { linha.push(campo); terminar(); } },
  };
}

// ---------------- Produto do feed -> linha do banco ----------------
const numero = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);
const https = (u) => (/^https?:\/\//.test(u || "") ? String(u).replace(/^http:\/\//, "https://") : null);
const assinar = (d) => createHash("sha1").update(JSON.stringify(d)).digest("hex").slice(0, 16);

function paraLinha(p) {
  if (!/^\d{3,20}$/.test(p.itemid || "")) return "sem código";
  if ((p.condition || "New").toLowerCase() !== "new") return "usado";
  const preco = numero(p.sale_price) || numero(p.price);
  if (!preco) return "sem preço";
  const titulo = String(p.title || "").replace(/\s+/g, " ").trim().slice(0, 200);
  if (!titulo) return "sem nome";
  const imagens = [...new Set([p.image_link, p.image_link_2, p.image_link_3].map(https).filter(Boolean))];
  if (!imagens.length) return "sem foto";
  const curto = https(p.product_short_link) || https(p.product_link);
  if (!curto) return "sem link";
  // O botão "Comprar" vai pelo endereço nosso, que pede à Shopee o link de afiliado no clique (destinoShopee em
  // lib/fontes/shopee.js); o link curto da lista fica de reserva. Sem o código da loja, vai direto pelo link curto
  const m = /\/product\/(\d+)\/(\d+)/.exec(p.product_link || "") || /-i\.(\d+)\.(\d+)/.exec(p.product_link || "");
  const link = m && m[2] === p.itemid ? `https://vaiprocarrinho.com.br/ir/shopee/${m[1]}/${m[2]}` : curto;
  const antigo = numero(p.price);
  const precoAntigo = antigo && antigo > preco ? antigo : null;
  const desconto = precoAntigo ? Math.round((1 - preco / precoAntigo) * 100) : null;
  const dados = {
    id: `shopee-${p.itemid}`,
    titulo,
    preco,
    preco_antigo: precoAntigo,
    desconto: desconto && desconto > 0 ? desconto : null,
    imagem: imagens[0],
    imagens: imagens.length > 1 ? JSON.stringify(imagens) : null,
    link,
    curto,
    vendedor: String(p.shop_name || "").slice(0, 80) || null,
    avaliacao: numero(p.item_rating),
    curtidas: Math.round(Number(p.like) || 0),
    categorias: JSON.stringify([p.global_catid1, p.global_catid2, p.global_catid3].filter((c) => /^\d+$/.test(c || ""))),
    internacional: /^cross/i.test(p.cb_option || "") && !/non/i.test(p.cb_option || "") ? 1 : 0,
    busca: textoDeBusca(titulo),
  };
  return { ...dados, assinatura: assinar(dados) };
}

const CAMPOS = ["id", "titulo", "preco", "preco_antigo", "desconto", "imagem", "imagens", "link", "curto", "vendedor", "avaliacao", "curtidas",
  "categorias", "internacional", "busca", "assinatura", "atualizado_em"];
function gravar(o, agora) {
  const valores = CAMPOS.map((c) => sql(c === "atualizado_em" ? agora : o[c])).join(", ");
  const atualizar = CAMPOS.filter((c) => c !== "id").map((c) => `${c} = excluded.${c}`).join(", ");
  return `INSERT INTO shopee_lista (${CAMPOS.join(", ")}) VALUES (${valores}) ON CONFLICT(id) DO UPDATE SET ${atualizar}`;
}

// O link curto leva ao produto com o código de afiliado? Mostra só os nomes dos parâmetros do endereço final
async function conferirLinkAfiliado(link) {
  try {
    let url = link;
    for (let i = 0; i < 6; i++) {
      const r = await fetch(url, { redirect: "manual", headers: { "User-Agent": "Mozilla/5.0 (vaiprocarrinho robô)" } });
      const proximo = r.headers.get("location");
      if (!proximo || r.status < 300 || r.status >= 400) break;
      url = new URL(proximo, url).toString();
    }
    const u = new URL(url);
    const nomes = [...u.searchParams.keys()];
    const temAfiliado = nomes.some((n) => /utm_source|af_|aff|smtt|mmp_pid|utm_campaign/i.test(n));
    return `${temAfiliado ? "✅" : "ℹ️"} Link curto da lista leva a ${u.host}${u.pathname.slice(0, 30)}… com ${nomes.length ? nomes.join(", ") : "nenhum parâmetro"}`;
  } catch (e) {
    return `❔ Não deu para conferir o link curto (${e.message})`;
  }
}

async function main() {
  const inicio = Date.now();
  if (!token || !conta || !bancoId) throw new Error("Faltam os segredos do Cloudflare");
  const linkFeed = String(process.env.SHOPEE_FEED_OFICIAL || "").split(/\s+/).find((l) => /^https?:\/\//.test(l));
  if (!linkFeed) throw new Error("Secret SHOPEE_FEED_OFICIAL vazio");
  for (const c of TABELAS_SHOPEE_LISTA) await executar(c);
  for (const c of MIGRACOES_SHOPEE_LISTA) await executar(c).catch(() => {}); // coluna já existe

  // 1. Baixa e lê a lista
  const resp = await fetch(linkFeed);
  if (!resp.ok) throw new Error(`a Shopee respondeu ${resp.status} ao baixar a lista (o link pode ter mudado: copiar de novo em Feed de produto)`);
  const novas = new Map();
  const recusas = {};
  let total = 0;
  const leitor = criarLeitorCsv((p) => {
    total++;
    if (novas.size >= LIMITE) return;
    const o = paraLinha(p);
    if (typeof o === "string") { recusas[o] = (recusas[o] || 0) + 1; return; }
    novas.set(o.id, o);
  });
  let fluxo = Readable.fromWeb(resp.body);
  // gzip? (até 08/11/2026 vinha CSV puro)
  const iter = fluxo[Symbol.asyncIterator]();
  const primeiro = await iter.next();
  async function* tudo() { if (!primeiro.done) yield primeiro.value; for (let r; !(r = await iter.next()).done;) yield r.value; }
  fluxo = Readable.from(tudo());
  if (!primeiro.done && primeiro.value[0] === 0x1f && primeiro.value[1] === 0x8b) fluxo = fluxo.pipe(createGunzip());
  fluxo.setEncoding("utf8");
  for await (const pedaco of fluxo) leitor.parte(pedaco);
  leitor.fim();
  const motivos = Object.entries(recusas).map(([m, n]) => `${m}: ${n}`).join(", ");
  anotar(`📦 Lista da Shopee: ${novas.size.toLocaleString("pt-BR")} de ${total.toLocaleString("pt-BR")} produtos aceitos${motivos ? ` (fora: ${motivos})` : ""}`);
  if (!novas.size) throw new Error("a lista veio vazia; nada foi alterado");
  const exemplo = novas.values().next().value;
  anotar(await conferirLinkAfiliado(exemplo.curto));
  const viaSite = [...novas.values()].filter((o) => o.link.startsWith("https://vaiprocarrinho.com.br/ir/shopee/")).length;
  anotar(`🔗 ${viaSite.toLocaleString("pt-BR")} produtos com o "Comprar" pelo link de afiliado pedido no clique (os outros pelo link da lista)`);

  // 2. Compara com o banco
  const atuais = new Map();
  for (let ultimo = ""; ;) {
    const linhas = await consultar("SELECT id, assinatura, preco FROM shopee_lista WHERE id > ? ORDER BY id LIMIT 5000", [ultimo]);
    for (const l of linhas) atuais.set(l.id, l);
    if (linhas.length < 5000) break;
    ultimo = linhas.at(-1).id;
  }
  let remover = [...atuais.keys()].filter((id) => !novas.has(id));
  if (LIMITE !== Infinity) remover = []; // teste com limite: não apaga o resto
  else if (atuais.size >= 1000 && novas.size < atuais.size / 2) {
    anotar(`⚠️ A lista caiu de ${atuais.size} para ${novas.size} produtos: nada foi removido hoje`);
    remover = [];
  }
  // Os mais curtidos primeiro (são os que mais aparecem nas buscas)
  const gravarLista = [...novas.values()].filter((o) => atuais.get(o.id)?.assinatura !== o.assinatura)
    .sort((a, b) => b.curtidas - a.curtidas);

  // 3. Grava
  const agora = Date.now();
  const dia = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  const comandos = [];
  for (let i = 0; i < remover.length; i += 200) comandos.push(`DELETE FROM shopee_lista WHERE id IN (${remover.slice(i, i + 200).map(sql).join(", ")})`);
  let precosMudaram = 0;
  for (const o of gravarLista) {
    comandos.push(gravar(o, agora));
    const antes = atuais.get(o.id);
    if (!antes || antes.preco !== o.preco) {
      if (antes) precosMudaram++;
      comandos.push(`INSERT OR REPLACE INTO precos (oferta_id, dia, preco) VALUES (${sql(o.id)}, ${sql(dia)}, ${sql(o.preco)})`);
    }
  }
  await enviarEmLotes(comandos);

  const novos = gravarLista.filter((o) => !atuais.has(o.id)).length;
  const resumo = [
    `Na lista: ${novas.size.toLocaleString("pt-BR")}`,
    `Novos no site: ${novos.toLocaleString("pt-BR")}`,
    `Atualizados: ${(gravarLista.length - novos).toLocaleString("pt-BR")} (preço mudou em ${precosMudaram.toLocaleString("pt-BR")})`,
    `Removidos: ${remover.length.toLocaleString("pt-BR")}`,
    tamanhoBanco ? `Tamanho do banco: ${Math.round(tamanhoBanco / 1e6)} MB (limite do plano: 10 GB)` : null,
    `Tempo: ${Math.round((Date.now() - inicio) / 1000)} s`,
  ].filter(Boolean);
  resumo.forEach((l) => console.log(l));
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      `## 🧡 Lista da Shopee\n\n${[...relatorio, "", ...resumo].map((l) => (l ? `- ${l}` : "")).join("\n")}\n`);
  }
  paraPainel("shopeelista", {
    linhas: [relatorio[0], ...resumo.filter((l) => !l.startsWith("Tempo"))],
    avisos: relatorio.filter((l) => /^(⚠️|❔)/.test(l)),
  });
}

main().catch((erro) => {
  console.error(`ERRO: ${erro.message}`);
  paraPainel("shopeelista", { avisos: [`Parou com erro: ${erro.message}`] });
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## 🧡 Lista da Shopee\n\n- ❌ ${erro.message}\n`);
  process.exit(1);
});
