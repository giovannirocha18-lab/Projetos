// Um produto pelo código (link compartilhado no WhatsApp: vaiprocarrinho.com.br/?produto=<código>).
// Awin vem do banco; Shopee e AliExpress perguntam à API oficial pelo código. Lomadee não tem busca por código
// (o site compartilha uma busca pelo nome no lugar). Devolve null se a loja não achar.
import { COLUNAS_OFERTA, linhaParaOferta, comHistorico, historicoAoVivo } from "./ofertas.js";
import { ofertaShopeePorId, shopee } from "./fontes/shopee.js";
import { ofertasAliExpressPorIds, aliexpress } from "./fontes/aliexpress.js";

export const idValido = (id) => /^(awin|shopee|aliexpress)-[\w.-]{1,90}$/.test(String(id || ""));

export async function produtoPorId(env, id) {
  if (!idValido(id)) return null;
  const [fonte, ...resto] = id.split("-");
  const codigo = resto.join("-");
  if (fonte === "awin") {
    if (!env.DB) return null;
    const linha = await env.DB.prepare(`SELECT ${COLUNAS_OFERTA} FROM ofertas WHERE id = ?`).bind(id).first();
    return linha ? (await comHistorico(env.DB, [linhaParaOferta(linha)]))[0] : null;
  }
  let oferta = null;
  if (fonte === "shopee" && shopee.ativa(env)) oferta = await ofertaShopeePorId(env, codigo);
  if (fonte === "aliexpress" && aliexpress.ativa(env)) oferta = (await ofertasAliExpressPorIds(env, [codigo]))[0] || null;
  if (!oferta || !env.DB) return oferta;
  return (await historicoAoVivo(env.DB, [oferta])).ofertas[0];
}
