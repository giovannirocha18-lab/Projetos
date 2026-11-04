// POST /api/painel/zerar — botão "Zerar contadores" do painel (lib/inicioPainel.js). Só no endereço do painel, com o login
// do Cloudflare Access (lib/painel.js) e pedido feito pela própria página do painel (Origin do painel + cabeçalho X-Painel).
import { ehPainel, quemEntrou } from "../../../lib/painel.js";
import { zerarContadores } from "../../../lib/inicioPainel.js";

export async function onRequestPost({ request, env }) {
  const cabecalhos = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
  const origem = request.headers.get("Origin");
  const mesmaPagina = request.headers.get("X-Painel") === "1" && (!origem || new URL(origem).host === new URL(request.url).host);
  if (!ehPainel(request.url) || !mesmaPagina || !(await quemEntrou(request, env))) {
    return Response.json({ erro: "acesso negado" }, { status: 403, headers: cabecalhos });
  }
  if (!env.DB) return Response.json({ erro: "sem banco" }, { status: 503, headers: cabecalhos });
  const inicio = await zerarContadores(env.DB);
  return Response.json({ inicio }, { headers: cabecalhos });
}
