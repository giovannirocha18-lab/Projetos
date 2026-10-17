// GET /api/numeros -> quantas lojas parceiras o site tem agora (frase "Milhões de produtos de mais de N lojas" no site)
// { lojas, lojasArredondado, marketplaces }. Conta só o que de fato aparece nas buscas:
//  - Shopee e AliExpress (1 loja cada, com as chaves ligadas; são marketplaces com milhões de produtos)
//  - marcas da Lomadee liberadas para o canal (as mesmas que a busca usa)
//  - lojas da Awin com produtos no banco
import { shopee } from "../../lib/fontes/shopee.js";
import { aliexpress, totalAliExpress } from "../../lib/fontes/aliexpress.js";
import { lomadee, marcasAprovadas, pedirLomadee } from "../../lib/fontes/lomadee.js";

const CACHE_SEGUNDOS = 6 * 60 * 60;

// "mais de 120" em vez de "mais de 127": arredonda para baixo (de 10 em 10 a partir de 20) para a frase ser sempre verdade
const arredondar = (n) => (n >= 20 ? Math.floor(n / 10) * 10 : n);

// ?medir=1: conta de verdade quantos produtos as lojas têm (não guarda; para conferir a frase "milhões")
const PALAVRAS_MEDIR = ["celular", "vestido", "tenis", "cozinha", "brinquedo", "maquiagem", "ferramenta", "decoracao", "carro", "bolsa"];
async function medir(env) {
  const ali = aliexpress.ativa(env)
    ? await Promise.all(PALAVRAS_MEDIR.map((p) => totalAliExpress(env, p).then((n) => [p, n]).catch((e) => [p, String(e.message || e)])))
    : [];
  const lom = lomadee.ativa(env)
    ? await pedirLomadee(env, "/affiliate/products?limit=1&isAvailable=true").then((j) => j?.count ?? null).catch((e) => String(e.message || e))
    : null;
  return Response.json({ aliexpress: Object.fromEntries(ali), lomadeeTodasAsMarcas: lom }, { headers: { "Cache-Control": "no-store" } });
}

export async function onRequestGet({ request, env }) {
  if (new URL(request.url).searchParams.has("medir")) return medir(env);
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const chave = new Request(new URL("/api/numeros?v=1", request.url)); // trocar o v= para descartar o guardado
  const guardada = cache && (await cache.match(chave));
  if (guardada) return guardada;

  const marketplaces = [shopee, aliexpress].filter((f) => f.ativa(env)).length;
  const [daLomadee, daAwin] = await Promise.all([
    lomadee.ativa(env) ? marcasAprovadas(env).then((m) => m.size).catch(() => 0) : 0,
    env.DB ? env.DB.prepare("SELECT COUNT(DISTINCT loja) AS n FROM ofertas WHERE fonte = 'awin'").first("n").catch(() => 0) : 0,
  ]);
  const lojas = marketplaces + daLomadee + (daAwin || 0);
  const completo = !lomadee.ativa(env) || daLomadee > 0; // Lomadee fora do ar: guarda só 5 minutos
  const resposta = Response.json({ lojas, lojasArredondado: arredondar(lojas), marketplaces }, {
    headers: { "Cache-Control": `public, max-age=${completo ? CACHE_SEGUNDOS : 300}`, "X-Robots-Tag": "noindex" },
  });
  if (cache && completo) await cache.put(chave, resposta.clone());
  return resposta;
}
