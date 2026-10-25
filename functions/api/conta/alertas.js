// GET    /api/conta/alertas                     -> alertas de preço da pessoa conectada
// POST   /api/conta/alertas  { oferta, alvo }   -> cria (ou muda o preço-alvo de) um alerta
// DELETE /api/conta/alertas  { id }             -> para um alerta (id = código do produto)
import {
  banco, responder, erro, SEM_BANCO, lerJson, usuarioDaSessao, tokenAleatorio, dentroDoLimite, emailConfirmado, enviarConfirmacao,
} from "../../../lib/conta.js";
import { limparAlerta, lerAlertas, MAX_ALERTAS } from "../../../lib/alertas.js";

async function conectado(env, request) {
  const db = await banco(env);
  if (!db) return { resposta: SEM_BANCO() };
  const usuario = await usuarioDaSessao(db, request);
  if (!usuario) return { resposta: erro("Você não está conectado.", 401) };
  return { db, usuario };
}

export async function onRequestGet({ request, env }) {
  const { db, usuario, resposta } = await conectado(env, request);
  if (resposta) return resposta;
  return responder({ alertas: await lerAlertas(db, usuario.id), confirmado: await emailConfirmado(db, usuario.id) });
}

export async function onRequestPost({ request, env }) {
  const dados = await lerJson(request);
  if (!dados) return erro("Pedido inválido.");
  const { db, usuario, resposta } = await conectado(env, request);
  if (resposta) return resposta;
  const a = limparAlerta(dados.oferta, dados.alvo);
  if (!a) return erro("Confira o preço do alerta: ele precisa ser menor que o preço de hoje.");
  if (!(await dentroDoLimite(db, `alerta:${usuario.id}`, 60))) return erro("Muitos pedidos. Tente de novo daqui a pouco.", 429);
  const { n } = await db.prepare("SELECT COUNT(*) AS n FROM alertas WHERE usuario_id = ? AND oferta_id <> ?")
    .bind(usuario.id, a.oferta_id).first();
  if (n >= MAX_ALERTAS) return erro(`Você já tem ${MAX_ALERTAS} alertas. Pare algum para criar outro.`);
  // Já existe: muda só o preço-alvo (e recomeça os avisos a partir do preço de hoje)
  await db.prepare(
    `INSERT INTO alertas (usuario_id, oferta_id, titulo, loja_nome, link, imagem, preco_inicial, alvo, token, criado_em)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(usuario_id, oferta_id) DO UPDATE SET
       alvo = excluded.alvo, preco_inicial = excluded.preco_inicial, avisado_preco = NULL`,
  ).bind(usuario.id, a.oferta_id, a.titulo, a.loja_nome, a.link, a.imagem, a.preco_inicial, a.alvo, tokenAleatorio(), Date.now()).run();
  // Conta com e-mail ainda não confirmado: o alerta fica guardado, mas os avisos só saem depois da confirmação.
  // O link de confirmação vai sozinho no 1º alerta; depois, pelo botão "Reenviar" em "Meus alertas de preço"
  const confirmado = await emailConfirmado(db, usuario.id);
  if (!confirmado && n === 0) await enviarConfirmacao(env, request, db, usuario).catch(() => false);
  return responder({ ok: true, alertas: await lerAlertas(db, usuario.id), confirmado });
}

export async function onRequestDelete({ request, env }) {
  const dados = await lerJson(request);
  if (!dados || typeof dados.id !== "string") return erro("Pedido inválido.");
  const { db, usuario, resposta } = await conectado(env, request);
  if (resposta) return resposta;
  await db.prepare("DELETE FROM alertas WHERE usuario_id = ? AND oferta_id = ?").bind(usuario.id, dados.id.slice(0, 100)).run();
  return responder({ ok: true, alertas: await lerAlertas(db, usuario.id) });
}
