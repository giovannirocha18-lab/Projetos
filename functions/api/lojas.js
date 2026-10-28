// GET /api/lojas              -> lojas parceiras ativas agora (janela "Lojas parceiras" do site)
//                                { lojas: [{ id, nome, rede, produtos?, internacional? }] }
// GET /api/lojas?id=X&pagina=N -> produtos de uma loja ("Ver produtos"): { nome, ofertas, temMais }
//   id = "shopee" | "aliexpress" | "awin:<loja>" | "lomadee:<marca>"
// Pedido do Giovanni (22/10/2026). As mesmas lojas que /api/numeros conta.
import { shopee } from "../../lib/fontes/shopee.js";
import { aliexpress } from "../../lib/fontes/aliexpress.js";
import { lomadee, marcasComProdutos, produtosDaMarca } from "../../lib/fontes/lomadee.js";
import { semFotosQuebradas, respostaSemFotosQuebradas } from "../../lib/fotos.js";
import { COLUNAS_OFERTA, linhaParaOferta, comHistorico, historicoAoVivo, ehAoVivo, nomeDaLojaAwin, lojasDaAwin, lojaPequena } from "../../lib/ofertas.js";
import { carregarMapa, aplicarMapa } from "../../lib/mapaCategorias.js";
import { marcarSecoes } from "../../lib/categorias.js";

const LISTA_SEGUNDOS = 6 * 60 * 60;
const PRODUTOS_SEGUNDOS = 60 * 60;
const POR_PAGINA = 48;
const MAX_PAGINA = 20;
const VERSAO = 15; // 15: oBoticario e Efacil (28/10/2026); 14: fotos quebradas da Lomadee fora (27/10/2026); 13: Lojas Benoit fora até corrigir o feed (27/10/2026); 12: Lojas Benoit sem as fotos quebradas (27/10/2026); 11: Cobasi e Lojas Benoit (27/10/2026); 10: fotos e descrições da Lomadee; 9: fotos e descrições da Lomadee (26/10/2026); trocar para descartar o que está guardado (7: links da Lomadee assinados, 25/10/2026; 8: marcas novas da Lomadee)

function responder(dados, segundos) {
  return Response.json(dados, { headers: { "Cache-Control": `public, max-age=${segundos}`, "X-Robots-Tag": "noindex" } });
}

async function listarLojas(env) {
  const marketplaces = [
    shopee.ativa(env) && { id: "shopee", nome: "Shopee", rede: "marketplace" },
    aliexpress.ativa(env) && { id: "aliexpress", nome: "AliExpress", rede: "marketplace", internacional: true },
  ].filter(Boolean);
  const [marcas, daAwin] = await Promise.all([
    lomadee.ativa(env) ? marcasComProdutos(env).catch(() => new Map()) : new Map(),
    env.DB ? lojasDaAwin(env.DB).catch(() => null) : [],
  ]);
  const lojas = [
    ...(daAwin || []).map((l) => ({ id: `awin:${l.loja}`, nome: nomeDaLojaAwin(l.nome) || l.loja, rede: "awin", produtos: l.n, internacional: Boolean(l.internacional) || undefined })),
    ...[...marcas].map(([id, m]) => ({ id: `lomadee:${id}`, nome: m.nome, rede: "lomadee", produtos: m.produtos, produtosMais: m.produtosMais })),
  ].filter((l) => !lojaPequena(l.produtos, l.produtosMais)).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }));
  return { lojas: [...marketplaces, ...lojas], completo: (!lomadee.ativa(env) || marcas.size > 0) && daAwin !== null };
}

async function produtosDaLoja(env, id, pagina, waitUntil) {
  if (id === "shopee" || id === "aliexpress") {
    const fonte = id === "shopee" ? shopee : aliexpress;
    if (!fonte.ativa(env)) return null;
    const ofertas = await fonte.destaques(env, pagina);
    return { nome: id === "shopee" ? "Shopee" : "AliExpress", ofertas, temMais: ofertas.length >= 10 && pagina < MAX_PAGINA };
  }
  const [rede, ...resto] = id.split(":");
  const chave = resto.join(":");
  if (rede === "lomadee" && chave && lomadee.ativa(env)) {
    const r = await produtosDaMarca(env, chave, pagina, POR_PAGINA);
    // Fotos que já sabemos que não abrem saem (ver lib/fotos.js)
    return r.nome ? { ...r, ofertas: await semFotosQuebradas(env.DB, r.ofertas, { waitUntil }), temMais: r.temMais && pagina < MAX_PAGINA } : null;
  }
  if (rede === "awin" && chave && env.DB) {
    // Primeiro os com desconto (maior primeiro), depois o resto. "ORDER BY desconto DESC" segue o índice (loja, desconto)
    // e para ao juntar a página: com COALESCE ou outra coluna na ordem, o D1 leria todas as ofertas da loja a cada página.
    // "+fonte" impede o banco de preferir o índice (fonte, desconto), que percorre as ofertas de todas as lojas da Awin
    const { results } = await env.DB.prepare(
      `SELECT ${COLUNAS_OFERTA} FROM ofertas WHERE loja = ? AND +fonte = 'awin'
       ORDER BY desconto DESC LIMIT ${POR_PAGINA + 1} OFFSET ${(pagina - 1) * POR_PAGINA}`,
    ).bind(chave).all();
    if (!results.length && pagina === 1) return null;
    const ofertas = await comHistorico(env.DB, results.slice(0, POR_PAGINA).map(linhaParaOferta));
    return { nome: ofertas[0]?.lojaNome || chave, ofertas, temMais: results.length > POR_PAGINA && pagina < MAX_PAGINA };
  }
  return null;
}

export async function onRequestGet({ request, env, waitUntil }) {
  const params = new URL(request.url).searchParams;
  const id = (params.get("id") || "").slice(0, 120);
  const pagina = Math.min(Math.max(parseInt(params.get("pagina"), 10) || 1, 1), MAX_PAGINA);
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const chave = new Request(new URL(`/api/lojas?v=${VERSAO}${id ? `&id=${encodeURIComponent(id)}&pagina=${pagina}` : ""}`, request.url));
  const guardada = cache && (await cache.match(chave));
  if (guardada) return respostaSemFotosQuebradas(env.DB, guardada, waitUntil);

  let resposta;
  if (!id) {
    const { lojas, completo } = await listarLojas(env);
    resposta = responder({ lojas }, completo ? LISTA_SEGUNDOS : 300);
    if (!completo) return resposta; // Lomadee fora do ar: não guarda
  } else {
    let dados;
    try {
      dados = await produtosDaLoja(env, id, pagina, waitUntil);
    } catch (erro) {
      // 500 (o Cloudflare troca a resposta 502 pela página dele)
      return Response.json({ erro: "Não foi possível carregar os produtos desta loja agora", detalhe: String(erro?.message || erro).slice(0, 200) }, { status: 500 });
    }
    if (!dados) return Response.json({ erro: "Loja não encontrada" }, { status: 404 });
    const mapa = await carregarMapa(env).catch(() => null);
    let ofertas = marcarSecoes(mapa ? aplicarMapa(dados.ofertas, mapa) : dados.ofertas);
    // Shopee, AliExpress e Lomadee: histórico de preço como na busca (e guarda o preço de hoje, no máx. 60)
    if (env.DB && ofertas.some(ehAoVivo)) {
      try {
        const vivo = await historicoAoVivo(env.DB, ofertas);
        ofertas = vivo.ofertas;
        waitUntil(vivo.gravar().catch(() => {}));
      } catch {
        // D1 indisponível: segue sem histórico
      }
    }
    resposta = responder({ nome: dados.nome, ofertas, temMais: dados.temMais }, PRODUTOS_SEGUNDOS);
  }
  if (cache) waitUntil(cache.put(chave, resposta.clone()));
  return resposta;
}
