// POST /api/conta/codigo  { nome, email }  -> envia o código de acesso por e-mail
import {
  banco, responder, erro, SEM_BANCO, lerJson, validarEmail, validarNome, sha256, codigoAleatorio, enviarCodigo,
  CODIGO_VALIDADE, ENVIO_INTERVALO, ENVIOS_POR_HORA,
} from "../../../lib/conta.js";

const HORA = 60 * 60 * 1000;

export async function onRequestPost({ request, env }) {
  const db = await banco(env);
  if (!db) return SEM_BANCO();
  const dados = await lerJson(request);
  if (!dados) return erro("Pedido inválido.");
  const email = validarEmail(dados.email);
  if (!email) return erro("Confira o e-mail digitado.");
  const nome = validarNome(dados.nome);
  if (!nome) return erro("Digite o seu nome.");

  // Limite de envios: evita que alguém use o site para lotar a caixa de e-mail dos outros
  const agora = Date.now();
  const anterior = await db.prepare("SELECT enviado_em, hora_inicio, envios_hora FROM codigos WHERE email = ?").bind(email).first();
  let horaInicio = agora;
  let enviosHora = 1;
  if (anterior) {
    if (agora - anterior.enviado_em < ENVIO_INTERVALO) return erro("Aguarde um minuto para pedir outro código.", 429);
    if (agora - anterior.hora_inicio < HORA) {
      if (anterior.envios_hora >= ENVIOS_POR_HORA) return erro("Muitos códigos pedidos. Tente de novo daqui a uma hora.", 429);
      horaInicio = anterior.hora_inicio;
      enviosHora = anterior.envios_hora + 1;
    }
  }

  const codigo = codigoAleatorio();
  if (!(await enviarCodigo(env, request, email, nome, codigo))) {
    return erro("Não conseguimos enviar o e-mail agora. Tente de novo mais tarde.", 502);
  }
  await db.prepare(
    `INSERT OR REPLACE INTO codigos (email, nome, codigo_hash, expira_em, tentativas, enviado_em, hora_inicio, envios_hora)
     VALUES (?, ?, ?, ?, 0, ?, ?, ?)`,
  ).bind(email, nome, await sha256(`${email}:${codigo}`), agora + CODIGO_VALIDADE, agora, horaInicio, enviosHora).run();

  return responder({ ok: true });
}
