// Monitor do site (lib/sinais.js; pedido do Giovanni, 21/11/2026).
// GET  /api/sinais?dia=AAAA-MM-DD -> buscas dos visitantes que vieram com problema naquele dia + erros de tela
// POST /api/sinais { msg, onde }  -> o navegador avisa de um erro de JavaScript (sendBeacon; no máximo 3 por visita)
import { resumoDosSinais, anotarErroDeTela } from "../../lib/sinais.js";
import { naoContar } from "../../lib/naoContar.js";
import { dentroDoLimite, ipDe } from "../../lib/conta.js";

const vazio = (status = 204) => new Response(null, { status, headers: { "Cache-Control": "no-store" } });

export async function onRequestGet({ request, env }) {
  const dia = new URL(request.url).searchParams.get("dia");
  return Response.json(await resumoDosSinais(env, dia), { headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
}

export async function onRequestPost({ request, env }) {
  let mesmaOrigem = false;
  try {
    mesmaOrigem = new URL(request.headers.get("Origin") || "").host === new URL(request.url).host;
  } catch { /* Origin ausente ou "null" */ }
  if (!mesmaOrigem) return vazio(403);
  if (!env.DB || naoContar(request)) return vazio();
  let dados;
  try {
    dados = JSON.parse((await request.text()).slice(0, 1000));
  } catch {
    return vazio(400);
  }
  try {
    // 20 avisos por visitante por dia (o IP só entra na contagem do limite, apagada em 24 h)
    if (!(await dentroDoLimite(env.DB, `erro-tela:${ipDe(request)}`, 20))) return vazio();
    await anotarErroDeTela(env, dados?.msg, dados?.onde);
  } catch { /* banco fora do ar não vira erro para o visitante */ }
  return vazio();
}
