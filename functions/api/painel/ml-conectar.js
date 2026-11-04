// GET /api/painel/ml-conectar — só no painel: leva o Giovanni à tela "Permitir" do Mercado Livre (ver lib/mlConta.js)
import { ehPainel, quemEntrou } from "../../../lib/painel.js";
import { iniciarAutorizacao } from "../../../lib/mlConta.js";

export async function onRequestGet({ request, env }) {
  const cabecalhos = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
  if (!ehPainel(request.url) || !(await quemEntrou(request, env))) {
    return Response.json({ erro: "acesso negado" }, { status: 403, headers: cabecalhos });
  }
  if (!env.ML_CLIENT_ID || !env.ML_CLIENT_SECRET || !env.DB) return Response.json({ erro: "faltam as chaves do Mercado Livre" }, { headers: cabecalhos });
  return new Response(null, { status: 302, headers: { ...cabecalhos, Location: await iniciarAutorizacao(env) } });
}
