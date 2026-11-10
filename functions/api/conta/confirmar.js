// POST /api/conta/confirmar  { token }          -> confirma o e-mail (link do e-mail "Confirmar e-mail")
// POST /api/conta/confirmar  { reenviar: true } -> manda o link de novo para o e-mail da pessoa conectada
// Alertas de preço só são mandados para e-mail confirmado (ver emailConfirmado em lib/conta.js)
import {
  banco, responder, erro, SEM_BANCO, lerJson, sha256, usuarioDaSessao, emailConfirmado, enviarConfirmacao,
} from "../../../lib/conta.js";

export async function onRequestPost({ request, env }) {
  const db = await banco(env);
  if (!db) return SEM_BANCO();
  const dados = await lerJson(request);
  if (!dados) return erro("Pedido inválido.");

  if (dados.reenviar) {
    const usuario = await usuarioDaSessao(db, request);
    if (!usuario) return erro("Você não está conectado.", 401);
    if (await emailConfirmado(db, usuario.id)) return responder({ ok: true, confirmado: true });
    if (!(await enviarConfirmacao(env, request, db, usuario))) return erro("Não foi possível mandar o e-mail agora. Tente mais tarde.", 429);
    return responder({ ok: true, enviado: true });
  }

  if (typeof dados.token !== "string" || !/^[0-9a-f]{64}$/.test(dados.token)) return erro("Link inválido.");
  const pedido = await db.prepare("SELECT usuario_id FROM redefinicoes WHERE token_hash = ? AND expira_em > ?")
    .bind(await sha256(dados.token), Date.now()).first();
  if (!pedido) return erro("Este link não vale mais. Peça outro em \"Meus alertas de preço\".", 401);
  // Só confirma para quem está conectado nessa mesma conta (10/11/2026, revisão): alguém cadastrava o e-mail de outra pessoa
  // com a própria senha; a dona clicava em "Confirmar" e a conta ficava confirmada com a senha de quem a criou. Sem estar
  // conectada, a pessoa entra (ou usa "Esqueci minha senha", que troca a senha, confirma o e-mail e desconecta os outros)
  const conectado = await usuarioDaSessao(db, request);
  if (conectado?.id !== pedido.usuario_id) {
    return erro("Para confirmar, entre na sua conta neste aparelho e abra o link de novo. Não lembra a senha? Use \"Esqueci minha senha\".", 401);
  }
  await db.batch([
    db.prepare("UPDATE senhas SET email_confirmado = 1 WHERE usuario_id = ?").bind(pedido.usuario_id),
    db.prepare("DELETE FROM redefinicoes WHERE token_hash = ?").bind(await sha256(dados.token)),
  ]);
  return responder({ ok: true, confirmado: true });
}
