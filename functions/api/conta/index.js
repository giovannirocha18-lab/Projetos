// GET    /api/conta  -> quem está conectado e o carrinho salvo
// DELETE /api/conta  -> exclui a conta e todos os dados dela (direito garantido pela LGPD)
import {
  banco, responder, SEM_BANCO, erro, lerJson, usuarioDaSessao, lerCarrinho, cookieApagar, chavesDoEmail,
} from "../../../lib/conta.js";

export async function onRequestGet({ request, env }) {
  const db = await banco(env);
  // Sem banco ligado, o site simplesmente esconde o botão de entrar
  if (!db) return responder({ ativo: false });
  const google = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
  const usuario = await usuarioDaSessao(db, request);
  if (!usuario) return responder({ ativo: true, google, usuario: null });
  return responder({
    ativo: true,
    google,
    usuario: { nome: usuario.nome, email: usuario.email },
    carrinho: await lerCarrinho(db, usuario.id),
  });
}

export async function onRequestDelete({ request, env }) {
  const db = await banco(env);
  if (!db) return SEM_BANCO();
  if (!(await lerJson(request))) return erro("Pedido inválido.");
  const usuario = await usuarioDaSessao(db, request);
  if (!usuario) return erro("Você não está conectado.", 401);
  await db.batch([
    db.prepare("DELETE FROM carrinhos WHERE usuario_id = ?").bind(usuario.id),
    db.prepare("DELETE FROM alertas WHERE usuario_id = ?").bind(usuario.id),
    db.prepare("DELETE FROM sessoes WHERE usuario_id = ?").bind(usuario.id),
    db.prepare("DELETE FROM senhas WHERE usuario_id = ?").bind(usuario.id),
    db.prepare("DELETE FROM redefinicoes WHERE usuario_id = ?").bind(usuario.id),
    // Limites de tentativas ligados ao e-mail (chaves exatas: LIKE aceitaria % e _ vindos do e-mail)
    ...chavesDoEmail(usuario.email).map((chave) => db.prepare("DELETE FROM limites WHERE chave = ?").bind(chave)),
    db.prepare("DELETE FROM usuarios WHERE id = ?").bind(usuario.id),
  ]);
  return responder({ ok: true }, 200, { "Set-Cookie": cookieApagar() });
}
