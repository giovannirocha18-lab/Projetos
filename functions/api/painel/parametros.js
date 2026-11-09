// /api/painel/parametros — aba Parâmetros do painel (09/11/2026): comissões da Shein e do Mercado Livre digitadas à mão
// (lib/comissoesManuais.js). GET ?mes=2026-11 lê; POST { rede, mes, aprovada, pendente, pedidos } grava. Só no endereço do
// painel, com o login do Cloudflare Access; o POST só vindo da própria página do painel (Origin + cabeçalho X-Painel).
import { ehPainel, quemEntrou } from "../../../lib/painel.js";
import { lerManuais, gravarManual, mesValido } from "../../../lib/comissoesManuais.js";

const cabecalhos = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
const negado = () => Response.json({ erro: "acesso negado" }, { status: 403, headers: cabecalhos });
const mesAtual = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }).slice(0, 7);

export async function onRequestGet({ request, env }) {
  if (!ehPainel(request.url) || !(await quemEntrou(request, env))) return negado();
  const pedido = new URL(request.url).searchParams.get("mes");
  const mes = mesValido(pedido) ? pedido : mesAtual();
  return Response.json({ mes, valores: await lerManuais(env.DB, mes) }, { headers: cabecalhos });
}

export async function onRequestPost({ request, env }) {
  const origem = request.headers.get("Origin");
  const mesmaPagina = request.headers.get("X-Painel") === "1" && (!origem || new URL(origem).host === new URL(request.url).host);
  if (!ehPainel(request.url) || !mesmaPagina || !(await quemEntrou(request, env))) return negado();
  if (!env.DB) return Response.json({ erro: "sem banco" }, { status: 503, headers: cabecalhos });
  try {
    const salvo = await gravarManual(env.DB, await request.json());
    // A aba Comissões guarda a resposta por 10 minutos: apaga a do mês para o valor novo aparecer na hora
    const cache = typeof caches !== "undefined" ? caches.default : null;
    if (cache) await cache.delete(new Request(`https://${new URL(request.url).host}/__cache/painel-comissoes/${salvo.mes}`)).catch(() => {});
    return Response.json({ salvo }, { headers: cabecalhos });
  } catch (erro) {
    return Response.json({ erro: String(erro.message || erro) }, { status: 400, headers: cabecalhos });
  }
}
