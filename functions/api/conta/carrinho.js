// PUT /api/conta/carrinho  { itens: [...] }  -> salva o carrinho na conta
import { banco, responder, erro, SEM_BANCO, lerJson, usuarioDaSessao, limparCarrinho, salvarCarrinho } from "../../../lib/conta.js";

export async function onRequestPut({ request, env }) {
  const db = await banco(env);
  if (!db) return SEM_BANCO();
  const dados = await lerJson(request);
  const itens = dados && limparCarrinho(dados.itens);
  if (!itens) return erro("Pedido inválido.");
  const usuario = await usuarioDaSessao(db, request);
  if (!usuario) return erro("Você não está conectado.", 401);
  await salvarCarrinho(db, usuario.id, itens);
  return responder({ ok: true, carrinho: itens });
}
