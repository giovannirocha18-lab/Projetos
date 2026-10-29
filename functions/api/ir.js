// /api/ir?m=<marca>&u=<link do produto> — botão "Comprar" dos produtos da Lomadee.
// Gera o link com comissão no encurtador da Lomadee só quando alguém clica (o limite é de 60 consultas
// por minuto, não dá para gerar os 48 de cada busca) e guarda no banco: o próximo clique já sai pronto.
// Só gera link novo para endereço assinado pelo servidor (assinaturaValida, em lib/fontes/lomadee.js; teste de invasão de
// 25/10/2026): link montado por outra pessoa só leva ao site da própria marca, ou volta para a página inicial.
import { pedirLomadee, marcasAprovadas, assinaturaValida } from "../../lib/fontes/lomadee.js";
import { redirecionaBem } from "../../lib/links.js";

const UUID = /^[0-9a-f-]{20,40}$/i;

async function criarTabela(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS links_lomadee (
    url TEXT PRIMARY KEY, curto TEXT NOT NULL, criado TEXT DEFAULT (datetime('now')))`).run();
}

// Mesmo site da marca (para o caso de o encurtador falhar): "www.loja.com.br" e "loja.com.br" valem
const dominio = (host) => String(host || "").toLowerCase().replace(/^www\./, "");
function mesmoSite(url, site) {
  try {
    const alvo = dominio(new URL(url).hostname);
    const daMarca = dominio(new URL(site.startsWith("http") ? site : `https://${site}`).hostname);
    return Boolean(daMarca) && (alvo === daMarca || alvo.endsWith(`.${daMarca}`));
  } catch {
    return false;
  }
}

// O encurtador da Lomadee (lmdee.link) às vezes sai do ar e responde 500 para todas as marcas (print da Little Duck,
// 29/10/2026): antes de mandar o visitante, confere se o link curto redireciona (redirecionaBem, em lib/links.js).
// Fora do ar = vai direto ao site da marca (sem comissão); sem isso, volta ao site com um aviso de que o problema é da loja
export async function onRequestGet({ request, env }) {
  const params = new URL(request.url).searchParams;
  const marca = params.get("m") || "";
  const url = params.get("u") || "";
  const voltar = () => Response.redirect(new URL("/", request.url).toString(), 302);
  if (!env.LOMADEE_API_KEY || !UUID.test(marca) || !url.startsWith("https://") || url.length > 2000) return voltar();
  // Links salvos antes da assinatura (carrinho, alertas) continuam abrindo: pelo link já gerado ou no site da marca
  const assinado = await assinaturaValida(env, marca, url, params.get("s"));

  let guardadoQuebrado = false;
  if (env.DB) {
    try {
      await criarTabela(env.DB);
      const guardado = await env.DB.prepare("SELECT curto FROM links_lomadee WHERE url = ?").bind(url).first();
      if (guardado?.curto && (await redirecionaBem(guardado.curto))) return Response.redirect(guardado.curto, 302);
      guardadoQuebrado = Boolean(guardado?.curto);
    } catch {
      // banco fora do ar: gera o link mesmo assim
    }
  }

  try {
    if (!assinado || guardadoQuebrado) throw new Error("link sem assinatura ou encurtador fora do ar: não gera link novo");
    const canais = await pedirLomadee(env, "/affiliate/shortener/url", {
      metodo: "POST",
      corpo: { organizationId: marca, type: "Custom", url },
    });
    const curto = (Array.isArray(canais) ? canais : []).flatMap((c) => c.shortUrls || []).find((u) => u.startsWith("https://"));
    if (curto) {
      if (env.DB) await env.DB.prepare("INSERT OR REPLACE INTO links_lomadee (url, curto) VALUES (?, ?)").bind(url, curto).run().catch(() => {});
      if (await redirecionaBem(curto)) return Response.redirect(curto, 302);
    }
  } catch {
    // limite estourado ou Lomadee fora do ar: cai no link da própria loja abaixo
  }
  // Sem link com comissão, o visitante ainda chega ao produto (só se o link for mesmo do site da marca)
  let nome = "";
  try {
    const dados = (await marcasAprovadas(env)).get(marca);
    nome = dados?.nome || "";
    if (dados && mesmoSite(url, dados.site)) return Response.redirect(url, 302);
  } catch {
    // sem a lista de marcas, não arrisca mandar para um site qualquer
  }
  // Nada abre: volta ao site avisando que o problema é da loja (pedido do Giovanni, 29/10/2026)
  if (assinado) return Response.redirect(new URL(`/?aviso=loja-instavel${nome ? `&nome=${encodeURIComponent(nome)}` : ""}`, request.url).toString(), 302);
  return voltar();
}
