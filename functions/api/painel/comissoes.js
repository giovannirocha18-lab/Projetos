// GET /api/painel/comissoes?mes=2026-11 — comissões do mês nas 4 redes (lib/comissoes.js), para a aba Comissões do painel.
// Só no endereço do painel e com o login do Cloudflare Access (lib/painel.js). Guardado 10 minutos no cache do Cloudflare
// (as APIs das redes têm limite de consultas); ?novo=1 (botão Atualizar) pede de novo na hora.
import { ehPainel, quemEntrou } from "../../../lib/painel.js";
import { comissoesDoMes } from "../../../lib/comissoes.js";
import { lerManuais, comoPedidos } from "../../../lib/comissoesManuais.js";

const GUARDA_SEGUNDOS = 600;

export async function onRequestGet({ request, env }) {
  const cabecalhos = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
  if (!ehPainel(request.url) || !(await quemEntrou(request, env))) {
    return Response.json({ erro: "acesso negado" }, { status: 403, headers: cabecalhos });
  }
  const url = new URL(request.url);
  const agora = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }).slice(0, 7);
  let mes = url.searchParams.get("mes") || agora;
  if (!/^20\d\d-(0[1-9]|1[0-2])$/.test(mes) || mes > agora) mes = agora;

  const cache = typeof caches !== "undefined" ? caches.default : null;
  const chave = new Request(`https://${url.host}/__cache/painel-comissoes/${mes}`);
  if (cache && url.searchParams.get("novo") !== "1") {
    const guardada = await cache.match(chave);
    if (guardada) return Response.json(await comManuais(env, await guardada.json(), mes), { headers: cabecalhos });
  }
  const dados = { ...(await comissoesDoMes(env, mes)), lidoEm: Date.now() };
  // Guarda só se ao menos uma rede respondeu (erro geral não fica guardado)
  if (cache && dados.redes.some((r) => r.ok)) {
    await cache.put(chave, Response.json(dados, { headers: { "Cache-Control": `max-age=${GUARDA_SEGUNDOS}` } }));
  }
  return Response.json(await comManuais(env, dados, mes), { headers: cabecalhos });
}

// Shein e Mercado Livre digitados na aba Parâmetros (lib/comissoesManuais.js): lidos sempre na hora, fora do cache
async function comManuais(env, dados, mes) {
  const manuais = await lerManuais(env.DB, mes);
  return { ...dados, manuais, pedidos: [...dados.pedidos, ...comoPedidos(manuais)] };
}
