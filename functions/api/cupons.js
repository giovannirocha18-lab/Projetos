// GET /api/cupons -> cupons de desconto das lojas parceiras (janela "🎟️ Cupons" do site e selo "Cupom" nos cartões)
// { cupons: [{ id, loja, lojaNome, titulo, descricao?, codigoMascara?, ate?, destaque?, link }] }. Ver lib/cupons.js.
// GET /api/cupons?codigo=<id> -> { codigo, link } de um cupom: o botão "Pegar cupom" pede o código só no clique, que
// também abre a loja pelo link com comissão (teste de invasão de 25/10/2026: a lista mandava todos os códigos inteiros,
// e quem abrisse o endereço da lista via tudo sem passar pelo link)
import { cuponsLomadee, cuponsAwin } from "../../lib/cupons.js";
import { lomadee, marcasComProdutos, marcasNaAwin, chaveDoNome } from "../../lib/fontes/lomadee.js";
import { ehLojaRemovida } from "../../lib/lojasRemovidas.js";

// Só cupons de lojas que têm produtos no site (04/11/2026, Giovanni: "se ela não tem produto não faz sentido manter
// cupom dela"; ex.: BioVittare). Lomadee: marca com produtos (marcasComProdutos) ou a mesma loja na Awin (Lauri
// Esporte); Awin: loja com produtos no banco (lojas_awin). Se não der para saber (banco fora), não tira nenhum
async function lojasComProdutos(env) {
  const [idsLomadee, naAwin, awin] = await Promise.all([
    lomadee.ativa(env) ? marcasComProdutos(env).then((m) => new Set(m.keys())).catch(() => null) : null,
    marcasNaAwin(env).catch(() => new Set()),
    env.DB ? env.DB.prepare("SELECT loja FROM lojas_awin WHERE produtos > 0").all()
      .then((r) => new Set(r.results.map((x) => x.loja))).catch(() => null) : null,
  ]);
  return (c) => (String(c.loja).startsWith("lomadee-")
    ? !idsLomadee || idsLomadee.has(c.marcaId) || naAwin.has(chaveDoNome(c.lojaNome))
    // pelo nome também: o cupom da EINSTAR vem como "einstar" e a loja no banco é "shining-3d-technology-inc"
    : !awin || !awin.size || awin.has(c.loja) || naAwin.has(chaveDoNome(c.lojaNome)));
}

const CACHE_SEGUNDOS = 3 * 60 * 60;
const VERSAO = 15; // 15: sem cupom velho, sem valor ou em inglês (13/11/2026); 14: sem a Lauri Esporte (04/11/2026); trocar para descartar o que está guardado (11: chave nova da Awin, 03/11/2026; 12: sem China in Box; 13: sem passagens, viagens, comida e remédios)

// Só o começo do código: "BRINOXCHEFE" -> "BRI••••••••"
const mascara = (codigo) => `${codigo.slice(0, Math.min(3, Math.ceil(codigo.length / 3)))}${"•".repeat(Math.max(codigo.length - 3, 4))}`;

// Lista completa (com os códigos), guardada no cache do Cloudflare; nunca sai inteira para o visitante.
// Cada rede vem separada e a última lista boa de cada uma fica guardada 2 dias: se uma cair (30/10/2026: a Lomadee
// respondia 500 "campaigns_request_failed" e derrubava os cupons da Awin junto), usa a última boa dela. Com alguma
// rede em falha, a lista junta fica só 10 min; o motivo (sem chaves) vai em "erroAwin"/"erroLomadee" para conferência.
const ULTIMA_BOA = 2 * 24 * 60 * 60;
async function daRede(cache, request, nome, buscar) {
  const chave = new Request(new URL(`/api/cupons?v=${VERSAO}&rede=${nome}&interno=1`, request.url));
  try {
    const cupons = await buscar();
    if (cache) await cache.put(chave, Response.json({ cupons }, { headers: { "Cache-Control": `public, max-age=${ULTIMA_BOA}` } }));
    return { cupons };
  } catch (e) {
    const guardada = cache && (await cache.match(chave));
    return { cupons: guardada ? (await guardada.json()).cupons : [], erro: String(e.message || e).slice(0, 80) };
  }
}

async function todos(request, env) {
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const chave = new Request(new URL(`/api/cupons?v=${VERSAO}&interno=1`, request.url));
  const guardada = cache && (await cache.match(chave));
  if (guardada) return await guardada.json();
  const [lomadee, awin] = await Promise.all([
    daRede(cache, request, "lomadee", () => cuponsLomadee(env)),
    daRede(cache, request, "awin", () => cuponsAwin(env)),
  ]);
  const lista = { cupons: [...lomadee.cupons, ...awin.cupons], erroLomadee: lomadee.erro, erroAwin: awin.erro };
  const segundos = lomadee.erro || awin.erro ? 10 * 60 : CACHE_SEGUNDOS;
  if (cache) await cache.put(chave, Response.json(lista, { headers: { "Cache-Control": `public, max-age=${segundos}` } }));
  return lista;
}

export async function onRequestGet({ request, env }) {
  const [{ cupons: todosCupons, erroAwin, erroLomadee }, temProdutos] = await Promise.all([todos(request, env), lojasComProdutos(env)]);
  const cupons = todosCupons.filter((c) => temProdutos(c) && !ehLojaRemovida(c.lojaNome) && !ehLojaRemovida(c.loja));
  const id = new URL(request.url).searchParams.get("codigo");
  if (id !== null) {
    const c = cupons.find((x) => x.id === id);
    if (!c?.codigo) return Response.json({ erro: "Cupom não encontrado" }, { status: 404 });
    return Response.json({ codigo: c.codigo, link: c.link }, { headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
  }
  const publicos = cupons.map(({ codigo, ...c }) => (codigo ? { ...c, codigoMascara: mascara(codigo) } : c));
  return Response.json({ cupons: publicos, erroAwin, erroLomadee }, {
    headers: { "Cache-Control": `public, max-age=${erroAwin || erroLomadee ? 60 : 15 * 60}`, "X-Robots-Tag": "noindex" },
  });
}
