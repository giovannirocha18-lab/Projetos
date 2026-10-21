// TEMPORÁRIO (21/10/2026): conferir quantos celulares a AliExpress entrega para o Brasil. Apagar depois.
import { _teste } from "../../lib/fontes/aliexpress.js";
export async function onRequestGet({ request, env }) {
  const p = new URL(request.url).searchParams;
  if (p.get("t") !== "d1f2f6c07e2a872767e63903") return new Response("não", { status: 404 });
  const casos = [
    ["cat sem palavra", { category_ids: "5090301" }],

  ];
  const saida = {};
  for (const [nome, extra] of casos) {
    saida[nome] = [];
    for (const pg of [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,20,30]) {
      try {
        const r = await _teste.consultar(env, "aliexpress.affiliate.product.query", { page_no: String(pg), page_size: "50", fields: _teste.CAMPOS, ..._teste.parametrosBrasil(env), ...extra });
        saida[nome].push({ pg, n: r.length, cats: [...new Set(r.map((x) => x.second_level_category_id))].slice(0, 5), ids: r.map((x) => x.product_id), ex: r.slice(0, 1).map((x) => x.product_title.slice(0, 40)) });
      } catch (e) { saida[nome].push({ pg, erro: String(e.message) }); }
    }
  }
  return Response.json(saida);
}
