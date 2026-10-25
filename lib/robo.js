// Endereços que só o robô da madrugada (robo-precos.yml) pode chamar: /api/preparar-buscas, /api/coletar-precos,
// /api/conferir-alertas e /api/conferir-lojas. Eles consultam as lojas e gravam no banco; abertos, qualquer um podia
// chamá-los sem parar e gastar o limite das APIs e do Cloudflare (25/10/2026).
// O robô manda o cabeçalho "Authorization: Bearer <chave>"; a chave é o Secret CHAVE_ROBO, cadastrado igual no
// Cloudflare (Settings > Variables and Secrets) e no GitHub (Settings > Secrets and variables > Actions).
// Sem a chave no Cloudflare, ninguém entra (nem o robô): melhor parar a coleta do que deixar aberto.

const resumo = async (texto) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto)));

// Compara os resumos byte a byte sem parar no 1º diferente: o tempo da resposta não revela a chave aos poucos
async function mesmaChave(a, b) {
  const [x, y] = await Promise.all([resumo(a), resumo(b)]);
  let diferenca = 0;
  for (let i = 0; i < x.length; i++) diferenca |= x[i] ^ y[i];
  return diferenca === 0;
}

// Devolve uma resposta de recusa, ou null se o pedido veio do robô
export async function recusarSeNaoForRobo(request, env) {
  const chave = env.CHAVE_ROBO;
  const recusa = (status, erro) => Response.json({ erro, fim: true }, {
    status, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
  });
  if (!chave || chave.length < 20) return recusa(503, "Chave do robô (CHAVE_ROBO) não configurada no Cloudflare");
  const enviada = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!enviada || !(await mesmaChave(enviada, chave))) return recusa(401, "Só o robô pode chamar este endereço (CHAVE_ROBO errada ou ausente)");
  return null;
}
