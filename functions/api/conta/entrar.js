// POST /api/conta/entrar  { email, senha }  -> confere a senha e conecta a pessoa
import {
  banco, erro, SEM_BANCO, lerJson, validarEmail, conferirSenha, SENHA_FALSA, senhaPrecisaAtualizar, embaralharSenha, dentroDoLimite, ipDe, respostaConectado,
} from "../../../lib/conta.js";

// Mesma mensagem para todo erro de login (não revela se o e-mail tem conta ou se a conta é do Google)
const ERRO_LOGIN = "E-mail ou senha incorretos. Se você criou a conta com o Google, use \"Entrar com Google\" ou clique em \"Esqueci minha senha\".";

export async function onRequestPost({ request, env }) {
  const db = await banco(env);
  if (!db) return SEM_BANCO();
  const dados = await lerJson(request);
  if (!dados) return erro("Pedido inválido.");
  const email = validarEmail(dados.email);
  if (!email || typeof dados.senha !== "string" || !dados.senha) return erro("Digite o seu e-mail e a sua senha.");

  // Contra quem tenta adivinhar senhas: no máximo 30 tentativas por hora por aparelho e 10 erros por hora
  // por e-mail. A tentativa é contada antes de conferir (vale mesmo com muitos pedidos ao mesmo tempo) e
  // descontada se a senha estiver certa: só os erros ficam contando
  const chaveEmail = `entrar:${email}`;
  if (!(await dentroDoLimite(db, `entrar-ip:${ipDe(request)}`, 30)) || !(await dentroDoLimite(db, chaveEmail, 10))) {
    return erro("Muitas tentativas. Tente de novo daqui a uma hora ou clique em \"Esqueci minha senha\".", 429);
  }

  const usuario = await db.prepare(
    "SELECT u.id, u.nome, u.email, s.hash FROM usuarios u LEFT JOIN senhas s ON s.usuario_id = u.id WHERE u.email = ?",
  ).bind(email).first();
  // Sem conta ou sem senha: confere contra uma senha falsa para demorar o mesmo tempo
  const certa = await conferirSenha(dados.senha.slice(0, 128), usuario?.hash || SENHA_FALSA);
  if (!usuario?.hash || !certa) return erro(ERRO_LOGIN, 401);

  await db.prepare("DELETE FROM limites WHERE chave = ?").bind(chaveEmail).run();
  // Senha guardada no formato antigo (1 rodada): troca pela mais forte agora que sabemos a senha (23/10/2026)
  if (senhaPrecisaAtualizar(usuario.hash)) {
    const novo = await embaralharSenha(dados.senha.slice(0, 128));
    await db.prepare("UPDATE senhas SET hash = ? WHERE usuario_id = ?").bind(novo, usuario.id).run().catch(() => {});
  }
  return respostaConectado(db, usuario);
}
