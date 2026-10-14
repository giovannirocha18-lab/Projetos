// POST /api/conta/entrar  { email, senha }  -> confere a senha e conecta a pessoa
import {
  banco, erro, SEM_BANCO, lerJson, validarEmail, conferirSenha, dentroDoLimite, ipDe, respostaConectado,
} from "../../../lib/conta.js";

export async function onRequestPost({ request, env }) {
  const db = await banco(env);
  if (!db) return SEM_BANCO();
  const dados = await lerJson(request);
  if (!dados) return erro("Pedido inválido.");
  const email = validarEmail(dados.email);
  if (!email || typeof dados.senha !== "string" || !dados.senha) return erro("Digite o seu e-mail e a sua senha.");

  // Contra quem tenta adivinhar senhas: no máximo 10 tentativas por hora por e-mail e 30 por aparelho
  if (!(await dentroDoLimite(db, `entrar:${email}`, 10)) || !(await dentroDoLimite(db, `entrar-ip:${ipDe(request)}`, 30))) {
    return erro("Muitas tentativas. Tente de novo daqui a uma hora ou clique em \"Esqueci minha senha\".", 429);
  }

  const usuario = await db.prepare(
    "SELECT u.id, u.nome, u.email, s.hash FROM usuarios u LEFT JOIN senhas s ON s.usuario_id = u.id WHERE u.email = ?",
  ).bind(email).first();
  if (usuario && !usuario.hash) {
    return erro("Essa conta não tem senha. Entre com o Google ou clique em \"Esqueci minha senha\" para criar uma.", 401);
  }
  if (!usuario || !(await conferirSenha(dados.senha.slice(0, 128), usuario.hash))) {
    return erro("E-mail ou senha incorretos.", 401);
  }
  return respostaConectado(db, usuario);
}
