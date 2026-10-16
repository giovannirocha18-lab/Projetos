// Diagnóstico da Lomadee (temporário): quantas marcas a chave enxerga, quais estão liberadas e se a busca traz produtos.
// Não mostra a chave nem dados de pedidos.
import { pedirLomadee } from "../../lib/fontes/lomadee.js";

export async function onRequestGet({ request, env }) {
  if (!env.LOMADEE_API_KEY) return Response.json({ erro: "sem LOMADEE_API_KEY" });
  const q = new URL(request.url).searchParams.get("q") || "air fryer";
  const saida = {};
  try {
    const marcas = await pedirLomadee(env, "/affiliate/brands?page=1&limit=20");
    saida.paginacao = marcas.pagination;
    saida.marcas = (marcas.data || []).map((m) => ({
      nome: m.name, id: m.id, site: m.site,
      canais: (m.channels || []).map((c) => ({ nome: c.name, links: (c.shortUrls || []).length, aviso: c.message || null })),
    }));
  } catch (e) { saida.erroMarcas = String(e.message || e); }
  try {
    const p = await pedirLomadee(env, `/affiliate/products?search=${encodeURIComponent(q)}&limit=5`);
    saida.produtos = { total: p.count, amostra: (p.data || []).map((x) => ({ marca: x.organizationId, nome: x.name, preco: x.options?.[0]?.pricing?.[0] })) };
  } catch (e) { saida.erroProdutos = String(e.message || e); }
  return Response.json(saida);
}
