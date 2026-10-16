// GET /api/conta/google/retorno  -> o Google devolve a pessoa para cá depois do login
import {
  banco, cookieGoogle, lerCookie, COOKIE_GOOGLE, enderecoRetornoGoogle, caminhoSeguro, validarEmail, criarSessao,
} from "../../../../lib/conta.js";

function voltar(caminho, cookies) {
  const headers = new Headers({ Location: caminho, "Cache-Control": "no-store" });
  for (const c of cookies) headers.append("Set-Cookie", c);
  return new Response(null, { status: 302, headers });
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const [estado, voltaSalva] = (lerCookie(request, COOKIE_GOOGLE) || "").split("|");
  const volta = caminhoSeguro(voltaSalva);
  const apagar = cookieGoogle("", 0);
  const falhou = () => voltar(`${volta}#erro-google`, [apagar]);

  const db = await banco(env);
  const codigo = url.searchParams.get("code");
  if (!db || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return falhou();
  // Pessoa clicou em "Cancelar" no Google: só volta, sem mensagem de erro
  if (url.searchParams.get("error")) return voltar(volta, [apagar]);
  if (!estado || !codigo || url.searchParams.get("state") !== estado) return falhou();

  // Troca o código pelos dados da pessoa (conversa direta com o Google, com a chave secreta)
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: codigo,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: enderecoRetornoGoogle(request),
      grant_type: "authorization_code",
    }),
  });
  if (!resp.ok) {
    console.log(`Google respondeu ${resp.status}: ${await resp.text()}`);
    return falhou();
  }
  let dados;
  try {
    const { id_token } = await resp.json();
    const parte = id_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    dados = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(parte), (c) => c.charCodeAt(0))));
  } catch {
    return falhou();
  }
  const email = validarEmail(dados.email);
  const emissorOk = ["accounts.google.com", "https://accounts.google.com"].includes(dados.iss);
  if (!email || dados.email_verified !== true || dados.aud !== env.GOOGLE_CLIENT_ID || !emissorOk) return falhou();

  // Cria a conta na primeira vez (quem já tem conta com esse e-mail entra na mesma conta)
  const nome = String(dados.name || dados.given_name || email.split("@")[0]).replace(/\s+/g, " ").trim().slice(0, 60);
  await db.prepare("INSERT OR IGNORE INTO usuarios (email, nome, criado_em) VALUES (?, ?, ?)").bind(email, nome, Date.now()).run();
  const usuario = await db.prepare(
    "SELECT u.id, s.email_confirmado FROM usuarios u LEFT JOIN senhas s ON s.usuario_id = u.id WHERE u.email = ?",
  ).bind(email).first();
  // Senha cadastrada sem confirmar o e-mail pode ser de outra pessoa que usou este e-mail antes do
  // dono. O Google prova que o e-mail é de quem está entrando agora: apaga essa senha, desconecta
  // todos os aparelhos e invalida links de nova senha. O dono cria outra senha em "Esqueci minha senha"
  if (usuario.email_confirmado === 0) {
    await db.batch([
      db.prepare("DELETE FROM senhas WHERE usuario_id = ? AND email_confirmado = 0").bind(usuario.id),
      db.prepare("DELETE FROM sessoes WHERE usuario_id = ?").bind(usuario.id),
      db.prepare("DELETE FROM redefinicoes WHERE usuario_id = ?").bind(usuario.id),
    ]);
  }
  return voltar(volta, [apagar, await criarSessao(db, usuario.id)]);
}
