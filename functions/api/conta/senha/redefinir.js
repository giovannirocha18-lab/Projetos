// POST /api/conta/senha/redefinir  { token, senha }  -> grava a nova senha (link do e-mail) e conecta a pessoa
import {
  banco, erro, SEM_BANCO, lerJson, sha256, validarSenha, SENHA_MINIMO, embaralharSenha, respostaConectado,
} from "../../../../lib/conta.js";

export async function onRequestPost({ request, env }) {
  const db = await banco(env);
  if (!db) return SEM_BANCO();
  const dados = await lerJson(request);
  if (!dados || typeof dados.token !== "string" || !/^[0-9a-f]{64}$/.test(dados.token)) return erro("Link inválido.");
  const senha = validarSenha(dados.senha);
  if (!senha) return erro(`A senha precisa ter pelo menos ${SENHA_MINIMO} caracteres.`);

  const tokenHash = await sha256(dados.token);
  const pedido = await db.prepare(
    `SELECT u.id, u.nome, u.email FROM redefinicoes r JOIN usuarios u ON u.id = r.usuario_id
     WHERE r.token_hash = ? AND r.expira_em > ?`,
  ).bind(tokenHash, Date.now()).first();
  if (!pedido) return erro("Este link não vale mais. Peça um novo em \"Esqueci minha senha\".", 401);

  // Nova senha + e-mail confirmado. Desconecta os outros aparelhos e o link não vale de novo
  await db.batch([
    db.prepare(
      `INSERT INTO senhas (usuario_id, hash, email_confirmado) VALUES (?, ?, 1)
       ON CONFLICT(usuario_id) DO UPDATE SET hash = excluded.hash, email_confirmado = 1`,
    ).bind(pedido.id, await embaralharSenha(senha)),
    db.prepare("DELETE FROM redefinicoes WHERE usuario_id = ?").bind(pedido.id),
    db.prepare("DELETE FROM sessoes WHERE usuario_id = ?").bind(pedido.id),
    db.prepare("DELETE FROM limites WHERE chave = ? OR substr(chave, 1, ?) = ?")
      .bind(`entrar-todos:${pedido.email}`, `entrar:${pedido.email}:`.length, `entrar:${pedido.email}:`),
  ]);
  return respostaConectado(db, pedido);
}
