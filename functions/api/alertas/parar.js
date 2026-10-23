// /api/alertas/parar?t=<código> -> link "Parar este alerta" do e-mail.
// GET só mostra a página com o botão (programas de e-mail abrem os links sozinhos para conferir; não pode parar aí);
// o botão (POST) para o alerta. Funciona sem entrar na conta: o código do link é secreto e vale só para aquele alerta.
const pagina = (titulo, corpo, status = 200) => new Response(`<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>${titulo} · Vai pro Carrinho</title>
<style>body{font-family:Arial,sans-serif;background:#f6f4fb;color:#1a1530;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px}
main{background:#fff;border-radius:16px;padding:24px;max-width:420px;box-shadow:0 4px 20px rgba(0,0,0,.08)}h1{color:#6d28d9;font-size:1.3rem}
button,a.botao{display:inline-block;background:#6d28d9;color:#fff;border:0;padding:12px 22px;border-radius:12px;font-size:1rem;font-weight:bold;cursor:pointer;text-decoration:none}</style>
</head><body><main>${corpo}</main></body></html>`, {
  status,
  headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
});

const html = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const lerToken = (request) => (new URL(request.url).searchParams.get("t") || "").replace(/[^0-9a-f]/g, "").slice(0, 64);

async function alertaDoToken(env, token) {
  if (!env.DB || token.length !== 64) return null;
  try {
    return await env.DB.prepare("SELECT id, titulo FROM alertas WHERE token = ?").bind(token).first();
  } catch {
    return null;
  }
}

const NAO_ACHOU = () => pagina("Alerta não encontrado",
  `<h1>🔔 Alerta não encontrado</h1><p>Este alerta já foi parado (ou o link está incompleto).</p><p><a class="botao" href="/">Ir para o site</a></p>`, 404);

export async function onRequestGet({ request, env }) {
  const token = lerToken(request);
  const alerta = await alertaDoToken(env, token);
  if (!alerta) return NAO_ACHOU();
  return pagina("Parar alerta", `<h1>🔔 Parar alerta de preço</h1><p>Você não vai mais receber e-mails sobre:</p>
<p><strong>${html(alerta.titulo)}</strong></p>
<form method="post" action="/api/alertas/parar?t=${token}"><button type="submit">Parar este alerta</button></form>`);
}

export async function onRequestPost({ request, env }) {
  // Só o botão da própria página (outro site não pode parar alertas em nome de ninguém)
  let origem = null;
  try { origem = new URL(request.headers.get("Origin")).host; } catch { /* sem Origin */ }
  if (origem !== new URL(request.url).host) return pagina("Pedido inválido", "<h1>Pedido inválido</h1>", 400);
  const alerta = await alertaDoToken(env, lerToken(request));
  if (!alerta) return NAO_ACHOU();
  await env.DB.prepare("DELETE FROM alertas WHERE id = ?").bind(alerta.id).run();
  return pagina("Alerta parado", `<h1>✅ Alerta parado</h1><p>Você não vai mais receber e-mails sobre <strong>${html(alerta.titulo)}</strong>.</p>
<p><a class="botao" href="/">Voltar para o site</a></p>`);
}
