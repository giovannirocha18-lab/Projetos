// =====================================================================
// ALERTAS DE PREÇO — "🔔 Me avise quando baixar" (pedido do Giovanni, 23/10/2026; ideia do Zoom e do Keepa)
//
// Quem tem conta escolhe um produto e, se quiser, um preço ("quando chegar a R$ X"); sem preço = qualquer baixa
// de 2% ou mais. Uma vez por dia o robô (robo-precos.yml) chama /api/conferir-alertas, que vê o preço de hoje:
//   - Awin: da tabela ofertas (o robô acabou de atualizar)
//   - Shopee e AliExpress: pergunta à API oficial pelo código do produto (e guarda no histórico de preço)
//   - Lomadee: o último preço que o site viu (tabela precos), porque a API não busca pelo código
// e manda UM e-mail por pessoa com tudo o que baixou. Só avisa de novo se baixar mais (ou subir e voltar a baixar).
// A tabela alertas fica em lib/conta.js (é apagada junto com a conta). Alerta com mais de 180 dias é apagado.
// =====================================================================

import { enviarEmail } from "./conta.js";
import { ofertaShopeePorId, shopee } from "./fontes/shopee.js";
import { ofertasAliExpressPorIds, aliexpress } from "./fontes/aliexpress.js";
import { historicoAoVivo } from "./ofertas.js";

export const MAX_ALERTAS = 50; // por pessoa
const BAIXA_MINIMA = 0.98; // "qualquer baixa" = 2% ou mais (centavos não viram e-mail)
const VALIDADE_DIAS = 180;
const POR_PARTE = 60; // produtos por chamada de /api/conferir-alertas (a Shopee é 1 consulta por produto)

const texto = (v, max) => (typeof v === "string" ? v.slice(0, max) : null);
// Link do botão do e-mail: da loja (https) ou o nosso /api/ir (Lomadee, que gera o link com comissão no clique)
const linkValido = (v) => (typeof v === "string" && (/^https:\/\//i.test(v) || /^\/api\/ir\?/.test(v)) ? v.slice(0, 1000) : null);
const fonteDoId = (id) => String(id).split("-")[0];

// Produto vindo do site -> campos guardados (ou null se faltar algo)
export function limparAlerta(oferta, alvo) {
  if (!oferta || typeof oferta !== "object") return null;
  const id = texto(oferta.id, 100);
  const link = linkValido(oferta.link);
  const preco = Number(oferta.preco);
  if (!id || !/^(awin|shopee|aliexpress|lomadee)-[\w.-]+$/.test(id) || !link || !(preco > 0)) return null;
  const valorAlvo = alvo === null || alvo === undefined || alvo === "" ? null : Number(alvo);
  if (valorAlvo !== null && !(valorAlvo > 0 && valorAlvo < preco)) return null;
  return {
    oferta_id: id,
    titulo: texto(oferta.titulo, 200) || "Produto",
    loja_nome: texto(oferta.lojaNome || oferta.loja, 60),
    link,
    imagem: typeof oferta.imagem === "string" && /^https:\/\//i.test(oferta.imagem) ? oferta.imagem.slice(0, 1000) : null,
    preco_inicial: preco,
    alvo: valorAlvo === null ? null : Math.round(valorAlvo * 100) / 100,
  };
}

// Linha do banco -> o que o site mostra em "Meus alertas"
export const alertaParaSite = (a) => ({
  id: a.oferta_id, titulo: a.titulo, lojaNome: a.loja_nome, link: a.link, imagem: a.imagem,
  precoInicial: a.preco_inicial, alvo: a.alvo, ultimoPreco: a.ultimo_preco, criadoEm: a.criado_em,
});

export async function lerAlertas(db, usuarioId) {
  const { results } = await db.prepare("SELECT * FROM alertas WHERE usuario_id = ? ORDER BY criado_em DESC").bind(usuarioId).all();
  return results.map(alertaParaSite);
}

// ---------------------------------------------------------------------
// Preço de hoje de cada produto (Map id -> preço). Produto que a loja não informou fica de fora.
// ---------------------------------------------------------------------
async function precosDeHoje(env, ids) {
  const precos = new Map();
  const porFonte = (f) => ids.filter((id) => fonteDoId(id) === f);
  const aoVivo = []; // ofertas da Shopee/AliExpress consultadas agora: vão também para o histórico de preço

  const awin = porFonte("awin");
  if (awin.length) {
    const { results } = await env.DB.prepare(`SELECT id, preco FROM ofertas WHERE id IN (${awin.map(() => "?").join(",")})`)
      .bind(...awin).all();
    for (const r of results) precos.set(r.id, r.preco);
  }

  const daShopee = shopee.ativa(env) ? porFonte("shopee") : [];
  const daShopeeHoje = await Promise.all(daShopee.map((id) => ofertaShopeePorId(env, id.slice("shopee-".length)).catch(() => null)));
  for (const o of daShopeeHoje) if (o?.preco > 0) { precos.set(o.id, o.preco); aoVivo.push(o); }

  const daAli = aliexpress.ativa(env) ? porFonte("aliexpress") : [];
  for (let i = 0; i < daAli.length; i += 50) {
    const lote = daAli.slice(i, i + 50).map((id) => id.slice("aliexpress-".length));
    const ofertas = await ofertasAliExpressPorIds(env, lote).catch((e) => { console.log(`Alertas: ${e.message}`); return []; });
    for (const o of ofertas) { precos.set(o.id, o.preco); aoVivo.push(o); }
  }

  // Lomadee (e quem a loja não respondeu agora): último preço que o site guardou no histórico
  const semPreco = ids.filter((id) => !precos.has(id) && fonteDoId(id) !== "awin");
  if (semPreco.length) {
    const { results } = await env.DB.prepare(
      `SELECT oferta_id, preco FROM precos p WHERE oferta_id IN (${semPreco.map(() => "?").join(",")})
       AND dia = (SELECT MAX(dia) FROM precos WHERE oferta_id = p.oferta_id)`,
    ).bind(...semPreco).all();
    for (const r of results) precos.set(r.oferta_id, r.preco);
  }

  if (aoVivo.length) await (await historicoAoVivo(env.DB, aoVivo)).gravar().catch(() => 0);
  return precos;
}

// Avisa? Preço chegou no alvo (ou baixou 2%+ do preço de quando criou) e está abaixo do último aviso
function deveAvisar(a, preco) {
  let limite = a.alvo ?? a.preco_inicial * BAIXA_MINIMA;
  if (a.avisado_preco) limite = Math.min(limite, a.avisado_preco * BAIXA_MINIMA);
  return preco <= limite;
}

// ---------------------------------------------------------------------
// Uma parte da conferência diária (produtos em ordem; a parte N = produtos N*60 a N*60+59)
// ---------------------------------------------------------------------
export async function conferirAlertas(env, parte, origem) {
  const db = env.DB;
  if (parte === 0) await db.prepare("DELETE FROM alertas WHERE criado_em < ?").bind(Date.now() - VALIDADE_DIAS * 864e5).run();
  const { results: produtos } = await db.prepare("SELECT DISTINCT oferta_id FROM alertas ORDER BY oferta_id LIMIT ? OFFSET ?")
    .bind(POR_PARTE, parte * POR_PARTE).all();
  const ids = produtos.map((p) => p.oferta_id);
  if (!ids.length) return { parte, fim: true, produtos: 0, comPreco: 0, avisos: 0 };

  const precos = await precosDeHoje(env, ids);
  const { results: alertas } = await db.prepare(
    `SELECT a.*, u.email, u.nome, s.email_confirmado FROM alertas a JOIN usuarios u ON u.id = a.usuario_id
     LEFT JOIN senhas s ON s.usuario_id = u.id
     WHERE a.oferta_id IN (${ids.map(() => "?").join(",")})`,
  ).bind(...ids).all();

  const agora = Date.now();
  const atualizar = [];
  const porPessoa = new Map();
  for (const a of alertas) {
    const preco = precos.get(a.oferta_id);
    if (!(preco > 0)) continue;
    // E-mail não confirmado (conta criada com senha, sem abrir nenhum link do e-mail): não manda nada. Pode ser o
    // e-mail de outra pessoa (ver emailConfirmado em lib/conta.js); o aviso sai depois que a pessoa confirmar
    if (a.email_confirmado === 0) {
      atualizar.push(db.prepare("UPDATE alertas SET ultimo_preco = ?, conferido_em = ? WHERE id = ?").bind(preco, agora, a.id));
      continue;
    }
    let avisado = a.avisado_preco;
    if (deveAvisar(a, preco)) {
      avisado = preco;
      if (!porPessoa.has(a.usuario_id)) porPessoa.set(a.usuario_id, { email: a.email, nome: a.nome, itens: [] });
      porPessoa.get(a.usuario_id).itens.push({ ...a, preco });
    } else if (avisado && preco > (a.alvo ?? a.preco_inicial)) {
      avisado = null; // subiu de novo: a próxima baixa avisa outra vez
    }
    atualizar.push(db.prepare("UPDATE alertas SET ultimo_preco = ?, avisado_preco = ?, conferido_em = ? WHERE id = ?")
      .bind(preco, avisado, agora, a.id));
  }

  // Grava antes de mandar: se o e-mail falhar, não manda de novo amanhã o mesmo aviso (melhor perder um que repetir)
  if (atualizar.length) await db.batch(atualizar);
  let enviados = 0;
  for (const pessoa of porPessoa.values()) {
    if (await enviarAviso(env, origem, pessoa).catch(() => false)) enviados++;
  }
  return { parte, fim: produtos.length < POR_PARTE, produtos: ids.length, comPreco: precos.size, avisos: enviados };
}

// ---------------------------------------------------------------------
// E-mail "📉 Baixou!"
// ---------------------------------------------------------------------
const brl = (v) => Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const html = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function enviarAviso(env, origem, { email, nome, itens }) {
  const primeiroNome = String(nome || "").split(" ")[0];
  // O botão leva ao produto no nosso site (ou ao /api/ir da Lomadee, que confere a assinatura): nunca a um link que veio
  // do navegador de quem criou o alerta
  const link = (a) => (a.link?.startsWith("/api/ir?") ? `${origem}${a.link}` : `${origem}/?produto=${encodeURIComponent(a.oferta_id)}`);
  const parar = (a) => `${origem}/api/alertas/parar?t=${a.token}`;
  const assunto = itens.length === 1
    ? `📉 Baixou: ${itens[0].titulo.slice(0, 60)} por R$ ${brl(itens[0].preco)}`
    : `📉 ${itens.length} produtos que você acompanha baixaram de preço`;
  const linhaTexto = (a) => `- ${a.titulo}\n  Agora R$ ${brl(a.preco)} (era R$ ${brl(a.preco_inicial)} quando você criou o alerta)`
    + `${a.loja_nome ? ` na ${a.loja_nome}` : ""}\n  Ver oferta: ${link(a)}\n  Parar este alerta: ${parar(a)}`;
  const blocoHtml = (a) => `<div style="border:1px solid #e9e4f5;border-radius:12px;padding:12px;margin:12px 0">
      ${a.imagem ? `<img src="${html(a.imagem)}" alt="" width="96" height="96" style="float:left;width:96px;height:96px;object-fit:contain;margin-right:12px;border-radius:8px">` : ""}
      <p style="margin:0 0 6px;font-weight:bold">${html(a.titulo)}</p>
      <p style="margin:0 0 6px"><span style="font-size:20px;font-weight:bold;color:#15803d">R$ ${brl(a.preco)}</span>
        <span style="color:#625d78;text-decoration:line-through">R$ ${brl(a.preco_inicial)}</span>
        <span style="color:#625d78;font-size:13px">${a.loja_nome ? ` · ${html(a.loja_nome)}` : ""}</span></p>
      <p style="margin:0"><a href="${html(link(a))}" style="display:inline-block;background:#6d28d9;color:#fff;padding:8px 16px;border-radius:10px;text-decoration:none;font-weight:bold">Ver oferta</a>
        <a href="${html(parar(a))}" style="color:#625d78;font-size:12px;margin-left:10px">Parar este alerta</a></p>
      <div style="clear:both"></div>
    </div>`;
  return enviarEmail(env, {
    to: email,
    subject: assunto,
    text: `Olá, ${primeiroNome}!\n\nBaixou o preço de ${itens.length === 1 ? "um produto" : "produtos"} que você pediu para acompanhar:\n\n`
      + `${itens.map(linhaTexto).join("\n\n")}\n\nPreço e estoque podem mudar a qualquer momento. Confira na loja antes de comprar.\n`
      + `Para ver ou parar todos os alertas: ${origem} > Minha conta > Meus alertas de preço.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#1a1530">
      <h2 style="color:#6d28d9">🛒 Vai pro Carrinho</h2>
      <p>Olá, ${html(primeiroNome)}! 📉 Baixou o preço de ${itens.length === 1 ? "um produto" : "produtos"} que você pediu para acompanhar:</p>
      ${itens.map(blocoHtml).join("")}
      <p style="color:#625d78;font-size:13px">Preço e estoque podem mudar a qualquer momento. Confira na loja antes de comprar.
        Para ver ou parar todos os alertas: <a href="${html(origem)}" style="color:#6d28d9">vaiprocarrinho.com.br</a> > Minha conta > Meus alertas de preço.</p>
    </div>`,
  });
}
