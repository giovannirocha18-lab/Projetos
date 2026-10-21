// TEMPORÁRIO (21/10/2026): conferir categorias da AliExpress na API. Apagar depois.
import { _teste } from "../../lib/fontes/aliexpress.js";
export async function onRequestGet({ request, env }) {
  const p = new URL(request.url).searchParams;
  if (p.get("t") !== "d1f2f6c07e2a872767e63903") return new Response("não", { status: 404 });
  const extra = {};
  if (p.get("cat")) extra.category_ids = p.get("cat");
  if (p.get("kw")) extra.keywords = p.get("kw");
  const paginas = (p.get("pg") || "1,2").split(",");
  const saida = [];
  await Promise.all(paginas.map(async (pg) => {
    try {
      const r = await _teste.consultar(env, "aliexpress.affiliate.product.query", { page_no: pg, page_size: "50", fields: _teste.CAMPOS, ..._teste.parametrosBrasil(env), ...extra });
      for (const x of r) saida.push({ pg, cat: x.second_level_category_id, titulo: x.product_title.slice(0, 60), preco: x.target_sale_price });
    } catch (e) { saida.push({ pg, erro: String(e.message) }); }
  }));
  return Response.json(saida);
}
