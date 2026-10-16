// GET /api/buscar?q=air+fryer  -> ofertas de todas as lojas ligadas
// GET /api/buscar               -> ofertas em destaque
// GET /api/buscar?pagina=2      -> mais ofertas em destaque (só das lojas que têm páginas, como a Shopee)
// GET /api/buscar?q=...&pagina=2 -> mais resultados da busca (idem)
// GET /api/buscar?q=invictus&cat=Perfumes -> busca dentro da categoria escolhida no menu
//
// Roda nos servidores do Cloudflare (Pages Functions). É aqui que ficam as
// chaves das APIs, sem nunca chegarem ao navegador do visitante.
import { exemplo } from "../../lib/fontes/exemplo.js";
import { curadoria } from "../../lib/fontes/curadoria.js";
import { shopee } from "../../lib/fontes/shopee.js";
import { awin } from "../../lib/fontes/awin.js";
import { registrarBusca } from "../../lib/buscas.js";
import { separarAcessorios } from "../../lib/relevancia.js";
import { categoriaPorNome, termoNaCategoria, daCategoria, vitrineDaCategoria, montarVitrine } from "../../lib/categorias.js";

// Para ligar uma loja nova: criar lib/fontes/<loja>.js e incluir aqui.
const FONTES_REAIS = [curadoria, shopee, awin];

const CACHE_SEGUNDOS = 60 * 60;
// Trocar este número quando mudar o formato das respostas, para não servir as guardadas antes
const VERSAO_CACHE = 11;

function responder(dados, status = 200) {
  return new Response(JSON.stringify(dados), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": `public, max-age=${status === 200 ? CACHE_SEGUNDOS : 0}`,
      "X-Robots-Tag": "noindex",
    },
  });
}

export async function onRequestGet({ request, env, waitUntil }) {
  const inicio = Date.now();
  const params = new URL(request.url).searchParams;
  const q = (params.get("q") || "").trim().slice(0, 100);
  const pagina = Math.min(Math.max(parseInt(params.get("pagina"), 10) || 1, 1), 20);
  const categoria = q ? categoriaPorNome(params.get("cat")) : null;

  // Conta a busca para os "em alta" da semana, sem atrasar a resposta.
  // Clique num atalho não conta: senão o atalho se manteria em alta sozinho.
  const contar = (resposta) => {
    if (q && pagina === 1 && !params.has("atalho") && Number(resposta.headers.get("X-Total-Ofertas")) > 0) {
      waitUntil(registrarBusca(env, q).catch(() => {}));
    }
    return resposta;
  };

  // Guarda as respostas por 1 hora para não gastar o limite das APIs
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const chave = new Request(new URL(`/api/buscar?v=${VERSAO_CACHE}&q=${encodeURIComponent(q.toLowerCase())}${categoria ? `&cat=${encodeURIComponent(categoria.nome)}` : ""}${pagina > 1 ? `&pagina=${pagina}` : ""}`, request.url));
  const guardada = cache && (await cache.match(chave));
  if (guardada) return contar(guardada);

  const ligadas = await Promise.all(FONTES_REAIS.map((f) => f.ativa(env)));
  const reais = FONTES_REAIS.filter((_, i) => ligadas[i]);
  // Enquanto nenhuma API estiver ligada, usa os produtos de exemplo
  // Da 2ª página em diante, só as lojas que têm mais páginas de destaques
  const fontes = (reais.length ? reais : [exemplo]).filter((f) => pagina === 1 || f.porPagina);

  const lojas = {};
  const consultar = async (termo, opcoes) => {
    const resultados = await Promise.all(
      fontes.map(async (fonte) => {
        try {
          const ofertas = termo ? await fonte.buscar(termo, env, pagina, opcoes) : await fonte.destaques(env, pagina);
          // Na vitrine (várias buscas) a loja vale pela busca que trouxe mais
          lojas[fonte.nome] = { ok: lojas[fonte.nome]?.ok !== false, total: Math.max(ofertas.length, lojas[fonte.nome]?.total || 0) };
          return ofertas;
        } catch (erro) {
          // Uma loja fora do ar não derruba a busca nas outras
          lojas[fonte.nome] = { ok: false, erro: String(erro.message || erro) };
          return [];
        }
      }),
    );
    return resultados.flat();
  };

  // Abriu uma categoria: vitrine com os produtos em alta (várias buscas, mais vendidos primeiro)
  const vitrine = vitrineDaCategoria(q, categoria);
  let ofertas;
  let foraDaCategoria = false;
  if (vitrine) {
    const listas = await Promise.all(vitrine.buscas.map(async (termo) => separarAcessorios(await consultar(termo, { maisVendidos: true }), termo)));
    ofertas = montarVitrine(listas, vitrine, categoria);
  } else {
    // Dentro de uma categoria: "invictus" em Perfumes pesquisa "invictus perfume".
    // Se nada aparecer na categoria, mostra a busca em tudo (e o site avisa).
    let encontradas = await consultar(categoria ? termoNaCategoria(q, categoria) : q);
    if (categoria) {
      encontradas = daCategoria(encontradas, categoria);
      if (!encontradas.length && pagina === 1) {
        for (const k of Object.keys(lojas)) delete lojas[k];
        encontradas = await consultar(q);
        foraDaCategoria = encontradas.length > 0;
      }
    }
    // Na busca, acessórios ("tapete para air fryer") vão para o fim e o site os esconde
    ofertas = q ? separarAcessorios(encontradas, q) : encontradas;
  }
  const resposta = responder({
    q,
    categoria: categoria && !foraDaCategoria ? categoria.nome : null,
    foraDaCategoria,
    exemplo: !reais.length,
    ofertas,
    // Avisa o site se vale mostrar o botão "Ver mais ofertas" / "Ver mais resultados"
    temMais: fontes.some((f) => f.porPagina && lojas[f.nome]?.total >= f.porPagina),
    lojas,
    tempoMs: Date.now() - inicio,
  });
  // Produtos de exemplo não contam como busca em alta
  resposta.headers.set("X-Total-Ofertas", reais.length ? String(ofertas.length) : "0");
  if (cache && Object.values(lojas).every((l) => l.ok)) await cache.put(chave, resposta.clone());
  return contar(resposta);
}
