// GET /api/ir-loja?id=<loja> -> leva à página inicial da loja pelo link com comissão (botão "Ir para a loja" da janela
// "Lojas parceiras", pedido do Giovanni, 26/10/2026). Quem entra por ele e compra qualquer produto da loja dentro do
// prazo do cookie gera comissão. id = "shopee" | "aliexpress" | "awin:<loja>" | "lomadee:<marca>", como em /api/lojas.
// Os links só saem das próprias redes (ou do banco), nunca do endereço pedido: não serve para mandar gente a outro site.
// Cada link fica guardado 7 dias no cache do Cloudflare (as redes limitam quantos links dá para gerar).
import { shopee, linkShopee } from "../../lib/fontes/shopee.js";
import { aliexpress, linkAliExpress } from "../../lib/fontes/aliexpress.js";
import { lomadee, marcasAprovadas } from "../../lib/fontes/lomadee.js";
import { mercadolivre, linkAfiliadoML } from "../../lib/fontes/mercadolivre.js";
import { redirecionaBem } from "../../lib/links.js";

const GUARDAR_SEGUNDOS = 7 * 24 * 60 * 60;
const VERSAO = 1;

// Awin: link padrão da rede para a loja (sem "ued" = página inicial), com o mesmo afiliado dos produtos dessa loja
// (cada loja pode vir da conta PF ou da PJ)
async function linkAwin(env, loja) {
  if (!env.DB) return null;
  const linha = await env.DB.prepare("SELECT link FROM ofertas WHERE loja = ? AND +fonte = 'awin' LIMIT 1").bind(loja).first();
  if (!linha?.link) return null;
  const p = new URL(linha.link).searchParams;
  const loja_id = p.get("awinmid") || p.get("m");
  const afiliado = p.get("awinaffid") || p.get("a");
  if (!/^\d+$/.test(loja_id || "") || !/^\d+$/.test(afiliado || "")) return null;
  return `https://www.awin1.com/cread.php?awinmid=${loja_id}&awinaffid=${afiliado}`;
}

async function gerar(env, id) {
  if (id === "shopee") return shopee.ativa(env) ? linkShopee(env) : null;
  if (id === "aliexpress") return aliexpress.ativa(env) ? linkAliExpress(env) : null;
  // Mercado Livre: página inicial com as marcas de afiliado (matt_tool/matt_word, como nos produtos)
  if (id === "mercadolivre") return mercadolivre.ativa(env) ? linkAfiliadoML(env, "https://www.mercadolivre.com.br/") : null;
  const [rede, chave] = id.split(":");
  if (rede === "awin" && /^[a-z0-9-]{1,80}$/.test(chave || "")) return linkAwin(env, chave);
  if (rede === "lomadee" && /^[0-9a-f-]{20,40}$/i.test(chave || "") && lomadee.ativa(env)) {
    return (await marcasAprovadas(env)).get(chave)?.link || null;
  }
  return null;
}

export async function onRequestGet({ request, env }) {
  const id = (new URL(request.url).searchParams.get("id") || "").slice(0, 120);
  const voltar = () => Response.redirect(new URL(`/?loja=${encodeURIComponent(id)}`, request.url).toString(), 302);
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const chave = new Request(new URL(`/api/ir-loja?v=${VERSAO}&id=${encodeURIComponent(id)}`, request.url));
  const guardado = cache && (await cache.match(chave));
  // Lomadee: o encurtador dela às vezes sai do ar (29/10/2026); aí mostra os produtos da loja aqui, com um aviso
  const lomadeeFora = async (link) => id.startsWith("lomadee:") && !(await redirecionaBem(link));
  const avisar = () => Response.redirect(new URL(`/?loja=${encodeURIComponent(id)}&aviso=loja-instavel`, request.url).toString(), 302);
  if (guardado) {
    const link = await guardado.text();
    return (await lomadeeFora(link)) ? avisar() : Response.redirect(link, 302);
  }

  let link = null;
  try {
    link = await gerar(env, id);
  } catch (erro) {
    console.log(`Ir para a loja ${id}: ${erro.message}`);
  }
  // Sem link com comissão (rede fora do ar), mostra os produtos da loja no próprio site
  if (!/^https:\/\//.test(link || "")) return voltar();
  if (cache) {
    await cache.put(chave, new Response(link, { headers: { "Cache-Control": `public, max-age=${GUARDAR_SEGUNDOS}` } })).catch(() => {});
  }
  if (await lomadeeFora(link)) return avisar();
  return Response.redirect(link, 302);
}
