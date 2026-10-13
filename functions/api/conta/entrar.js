// POST /api/conta/entrar  { email, codigo }  -> confere o código e conecta a pessoa
import {
  banco, responder, erro, SEM_BANCO, lerJson, validarEmail, sha256, criarSessao, lerCarrinho, CODIGO_TENTATIVAS,
} from "../../../lib/conta.js";

export async function onRequestPost({ request, env }) {
  const db = await banco(env);
  if (!db) return SEM_BANCO();
  const dados = await lerJson(request);
  if (!dados) return erro("Pedido inválido.");
  const email = validarEmail(dados.email);
  const codigo = String(dados.codigo || "").replace(/\D/g, "");
  if (!email || codigo.length !== 6) return erro("Digite o código de 6 números.");

  const pedido = await db.prepare("SELECT * FROM codigos WHERE email = ?").bind(email).first();
  if (!pedido || pedido.expira_em < Date.now() || pedido.tentativas >= CODIGO_TENTATIVAS) {
    return erro("Esse código não vale mais. Peça um novo código.", 401);
  }
  if (pedido.codigo_hash !== (await sha256(`${email}:${codigo}`))) {
    await db.prepare("UPDATE codigos SET tentativas = tentativas + 1 WHERE email = ?").bind(email).run();
    const restam = CODIGO_TENTATIVAS - pedido.tentativas - 1;
    return erro(restam > 0 ? "Código errado. Confira o e-mail e tente de novo." : "Código errado. Peça um novo código.", 401);
  }

  // Código certo: cria a conta na primeira vez (o nome de quem já tem conta não muda)
  // e apaga o código para ele não ser usado de novo
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO usuarios (email, nome, criado_em) VALUES (?, ?, ?)").bind(email, pedido.nome, Date.now()),
    db.prepare("UPDATE codigos SET expira_em = 0 WHERE email = ?").bind(email),
  ]);
  const usuario = await db.prepare("SELECT id, nome, email FROM usuarios WHERE email = ?").bind(email).first();
  const cookie = await criarSessao(db, usuario.id);

  return responder(
    { ativo: true, usuario: { nome: usuario.nome, email: usuario.email }, carrinho: await lerCarrinho(db, usuario.id) },
    200,
    { "Set-Cookie": cookie },
  );
}
