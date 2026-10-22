// GET /api/conferir-lojas?parte=N -> confere quais marcas da Lomadee mandam produtos (20 por parte).
// Chamado pelo robô da madrugada (.github/workflows/robo-precos.yml). Resposta: { parte, conferidas, comProdutos, fim }
import { lomadee, conferirMarcas } from "../../lib/fontes/lomadee.js";

export async function onRequestGet({ request, env }) {
  if (!lomadee.ativa(env) || !env.DB) return Response.json({ fim: true, erro: "Lomadee ou banco desligados" });
  const parte = Math.min(Math.max(parseInt(new URL(request.url).searchParams.get("parte"), 10) || 0, 0), 50);
  try {
    return Response.json(await conferirMarcas(env, parte), { headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
  } catch (erro) {
    return Response.json({ parte, erro: String(erro?.message || erro).slice(0, 200) }, { status: 500 });
  }
}
