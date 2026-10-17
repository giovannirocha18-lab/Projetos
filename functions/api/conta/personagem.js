// PUT /api/conta/personagem  { personagem: {...} | null }  -> salva (ou apaga) o personagem da animação de busca
import { banco, responder, erro, SEM_BANCO, lerJson, usuarioDaSessao, limparPersonagem } from "../../../lib/conta.js";

export async function onRequestPut({ request, env }) {
  const db = await banco(env);
  if (!db) return SEM_BANCO();
  const dados = await lerJson(request);
  if (!dados) return erro("Pedido inválido.");
  const usuario = await usuarioDaSessao(db, request);
  if (!usuario) return erro("Você não está conectado.", 401);
  // null = voltar ao padrão (o site sorteia o personagem a cada busca)
  if (dados.personagem === null) {
    await db.prepare("DELETE FROM personagens WHERE usuario_id = ?").bind(usuario.id).run();
    return responder({ ok: true, personagem: null });
  }
  const personagem = limparPersonagem(dados.personagem);
  if (!personagem) return erro("Pedido inválido.");
  await db.prepare(`INSERT INTO personagens (usuario_id, dados) VALUES (?, ?)
    ON CONFLICT(usuario_id) DO UPDATE SET dados = excluded.dados`).bind(usuario.id, JSON.stringify(personagem)).run();
  return responder({ ok: true, personagem });
}
