// GET /api/conta/google?volta=/  -> leva a pessoa para a tela de login do Google
// Precisa, no Cloudflare: GOOGLE_CLIENT_ID (variável) e GOOGLE_CLIENT_SECRET (Secret).
import { erro, cookieGoogle, enderecoRetornoGoogle, caminhoSeguro } from "../../../../lib/conta.js";

export async function onRequestGet({ request, env }) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return erro("Entrar com Google ainda não está ligado.", 503);
  const volta = caminhoSeguro(new URL(request.url).searchParams.get("volta"));
  const estado = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const destino = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  destino.search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: enderecoRetornoGoogle(request),
    response_type: "code",
    scope: "openid email profile",
    state: estado,
    prompt: "select_account",
  });
  return new Response(null, {
    status: 302,
    headers: {
      Location: destino.toString(),
      "Set-Cookie": cookieGoogle(`${estado}|${volta}`, 600),
      "Cache-Control": "no-store",
    },
  });
}
