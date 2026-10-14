// POST /api/conta/cadastrar  { nome, email, senha }  -> cria a conta e já conecta a pessoa
import {
  banco, erro, SEM_BANCO, lerJson, validarEmail, validarNome, validarSenha, SENHA_MINIMO, embaralharSenha,
  dentroDoLimite, ipDe, respostaConectado,
} from "../../../lib/conta.js";

export async function onRequestPost({ request, env }) {
  const db = await banco(env);
  if (!db) return SEM_BANCO();
  const dados = await lerJson(request);
  if (!dados) return erro("Pedido inválido.");
  const nome = validarNome(dados.nome);
  if (!nome) return erro("Digite o seu nome.");
  const email = validarEmail(dados.email);
  if (!email) return erro("Confira o e-mail digitado.");
  const senha = validarSenha(dados.senha);
  if (!senha) return erro(`A senha precisa ter pelo menos ${SENHA_MINIMO} caracteres.`);
  if (!(await dentroDoLimite(db, `cadastro:${ipDe(request)}`, 10))) {
    return erro("Muitos cadastros feitos daqui. Tente de novo mais tarde.", 429);
  }

  // Quem já tem conta (com Google ou senha) não pode ter a senha trocada por aqui
  const existe = await db.prepare("SELECT id FROM usuarios WHERE email = ?").bind(email).first();
  if (existe) return erro("Este e-mail já tem conta. Clique em \"Já tenho conta\" para entrar.", 409);

  const hash = await embaralharSenha(senha);
  const novo = await db.prepare("INSERT INTO usuarios (email, nome, criado_em) VALUES (?, ?, ?) RETURNING id")
    .bind(email, nome, Date.now()).first();
  await db.prepare("INSERT INTO senhas (usuario_id, hash, email_confirmado) VALUES (?, ?, 0)").bind(novo.id, hash).run();
  return respostaConectado(db, { id: novo.id, nome, email });
}
