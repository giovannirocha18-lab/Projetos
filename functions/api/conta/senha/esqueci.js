// POST /api/conta/senha/esqueci  { email, volta }  -> manda por e-mail um link para criar nova senha
import {
  banco, responder, erro, SEM_BANCO, lerJson, validarEmail, sha256, tokenAleatorio, caminhoSeguro,
  dentroDoLimite, ipDe, enviarLinkSenha, ehLocal, LINK_VALIDADE,
} from "../../../../lib/conta.js";

export async function onRequestPost({ request, env, waitUntil }) {
  const db = await banco(env);
  if (!db) return SEM_BANCO();
  // Sem o serviço de e-mail ligado, avisa (vale para todos, então não revela quem tem conta)
  if (!env.RESEND_API_KEY && !ehLocal(request)) return erro("O envio de e-mail ainda não está ligado.", 503);
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

  // A resposta é a mesma (e sai no mesmo tempo) exista ou não a conta: o trabalho de criar o link
  // e mandar o e-mail continua depois que a resposta já foi enviada
  const link = `${new URL(request.url).origin}${caminhoSeguro(dados.volta)}`;
  const trabalho = mandarLink(db, env, request, email, link).catch((e) => console.log(`Esqueci minha senha falhou: ${e}`));
  if (waitUntil) waitUntil(trabalho);
  else await trabalho;
  return responder({ ok: true });
}

async function mandarLink(db, env, request, email, endereco) {
  const usuario = await db.prepare("SELECT id, nome FROM usuarios WHERE email = ?").bind(email).first();
  if (!usuario) return;
  const token = tokenAleatorio();
  const agora = Date.now();
  await db.batch([
    db.prepare("DELETE FROM redefinicoes WHERE expira_em < ? OR usuario_id = ?").bind(agora, usuario.id),
    db.prepare("INSERT INTO redefinicoes (token_hash, usuario_id, expira_em) VALUES (?, ?, ?)")
      .bind(await sha256(token), usuario.id, agora + LINK_VALIDADE),
  ]);
  if (!(await enviarLinkSenha(env, request, email, usuario.nome, `${endereco}#nova-senha=${token}`))) {
    console.log("Não foi possível enviar o e-mail de nova senha.");
  }
}
