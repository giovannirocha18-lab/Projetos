// GET /api/conferir-alertas?parte=0 -> confere o preço de hoje dos produtos com alerta e manda os e-mails "📉 Baixou!"
// Chamado pelo robô (robo-precos.yml) depois da Awin, parte por parte, até "fim": true. Chamar de novo não repete
// e-mail: cada alerta só avisa de novo se o preço baixar mais (ver lib/alertas.js)
import { banco } from "../../lib/conta.js";
import { conferirAlertas } from "../../lib/alertas.js";
import { recusarSeNaoForRobo } from "../../lib/robo.js";

const responder = (dados, status = 200) => new Response(JSON.stringify(dados), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
});

export async function onRequestGet({ request, env }) {
  const recusa = await recusarSeNaoForRobo(request, env);
  if (recusa) return recusa;
  if (!(await banco(env))) return responder({ erro: "Banco não configurado" }, 503);
  const url = new URL(request.url);
  const parte = Math.min(Math.max(parseInt(url.searchParams.get("parte"), 10) || 0, 0), 1000);
  return responder(await conferirAlertas(env, parte, url.origin));
}
