// POST /api/conta/senha/esqueci  { email, volta }  -> manda por e-mail um link para criar nova senha
import {
  banco, responder, erro, SEM_BANCO, lerJson, validarEmail, sha256, tokenAleatorio, caminhoSeguro,
  dentroDoLimite, ipDe, enviarLinkSenha, LINK_VALIDADE,
} from "../../../../lib/conta.js";

export async function onRequestPost({ request, env }) {
  const db = await banco(env);
  if (!db) return SEM_BANCO();
  const dados = await lerJson(request);
  if (!dados) return erro("Pedido inválido.");
  const email = validarEmail(dados.email);
  if (!email) return erro("Confira o e-mail digitado.");

  // Limite de envios: evita que alguém use o site para lotar a caixa de e-mail dos outros
  if (!(await dentroDoLimite(db, `esqueci-1min:${email}`, 1, 60 * 1000))) {
    return erro("Aguarde um minuto para pedir outro link.", 429);
  }
  if (!(await dentroDoLimite(db, `esqueci:${email}`, 5)) || !(await dentroDoLimite(db, `esqueci-ip:${ipDe(request)}`, 20))) {
    return erro("Muitos pedidos. Tente de novo daqui a uma hora.", 429);
  }

  // A resposta é a mesma exista ou não a conta (não revela quem tem cadastro)
  const usuario = await db.prepare("SELECT id, nome FROM usuarios WHERE email = ?").bind(email).first();
  if (usuario) {
    const token = tokenAleatorio();
    const agora = Date.now();
    await db.batch([
      db.prepare("DELETE FROM redefinicoes WHERE expira_em < ? OR usuario_id = ?").bind(agora, usuario.id),
      db.prepare("INSERT INTO redefinicoes (token_hash, usuario_id, expira_em) VALUES (?, ?, ?)")
        .bind(await sha256(token), usuario.id, agora + LINK_VALIDADE),
    ]);
    const link = `${new URL(request.url).origin}${caminhoSeguro(dados.volta)}#nova-senha=${token}`;
    if (!(await enviarLinkSenha(env, request, email, usuario.nome, link))) {
      return erro("Não conseguimos enviar o e-mail agora. Tente de novo mais tarde.", 502);
    }
  }
  return responder({ ok: true });
}
