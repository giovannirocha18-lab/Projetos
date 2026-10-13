// POST /api/conta/sair  -> desconecta este aparelho
import { banco, responder, erro, SEM_BANCO, lerJson, usuarioDaSessao, cookieApagar } from "../../../lib/conta.js";

export async function onRequestPost({ request, env }) {
  const db = await banco(env);
  if (!db) return SEM_BANCO();
  if (!(await lerJson(request))) return erro("Pedido inválido.");
  const usuario = await usuarioDaSessao(db, request);
  if (usuario) await db.prepare("DELETE FROM sessoes WHERE token_hash = ?").bind(usuario.tokenHash).run();
  return responder({ ok: true }, 200, { "Set-Cookie": cookieApagar() });
}
