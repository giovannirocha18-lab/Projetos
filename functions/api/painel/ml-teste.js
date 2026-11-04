// GET /api/painel/ml-teste?q=air+fryer — teste da fonte do Mercado Livre (lib/fontes/mercadolivre.js), só no painel
// (Cloudflare Access + passe conferido). Mostra quantos produtos vieram, quanto demorou e os primeiros, já como o site
// os recebe (preço, foto, link de afiliado). O token nunca sai daqui.
import { ehPainel, quemEntrou } from "../../../lib/painel.js";
import { mercadolivre } from "../../../lib/fontes/mercadolivre.js";

export async function onRequestGet({ request, env }) {
  const cabecalhos = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
  if (!ehPainel(request.url) || !(await quemEntrou(request, env))) {
    return Response.json({ erro: "acesso negado" }, { status: 403, headers: cabecalhos });
  }
  if (!mercadolivre.ativa(env)) {
    return Response.json({ erro: "faltam ML_CLIENT_ID e ML_CLIENT_SECRET no Cloudflare (ou falta publicar de novo)" }, { headers: cabecalhos });
  }
  const q = new URL(request.url).searchParams.get("q") || "air fryer";
  const t0 = Date.now();
  try {
    const ofertas = await mercadolivre.buscar(q, env, 1);
    return Response.json({
      busca: q, produtos: ofertas.length, tempoMs: Date.now() - t0,
      primeiros: ofertas.slice(0, 6).map((o) => ({ titulo: o.titulo, preco: o.preco, antigo: o.precoAntigo, frete: o.freteGratis,
        oficial: o.lojaOficial, tipo: o.catsLoja?.[0], foto: o.imagem, link: o.link })),
    }, { headers: cabecalhos });
  } catch (e) {
    return Response.json({ busca: q, erro: String(e?.message || e), tempoMs: Date.now() - t0 }, { headers: cabecalhos });
  }
}
