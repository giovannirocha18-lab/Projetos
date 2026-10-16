// GET /api/buscar?q=air+fryer  -> ofertas de todas as lojas ligadas
// GET /api/buscar               -> ofertas em destaque
// GET /api/buscar?pagina=2      -> mais ofertas em destaque (só das lojas que têm páginas, como a Shopee)
// GET /api/buscar?q=...&desde=10 -> mais resultados da busca, a partir da página 10 da Shopee
//                                   (a resposta traz em "mais" o pedaço de endereço para a próxima vez)
// GET /api/buscar?q=invictus&cat=Perfumes -> busca dentro da categoria escolhida no menu
//
// Roda nos servidores do Cloudflare (Pages Functions). É aqui que ficam as
// chaves das APIs, sem nunca chegarem ao navegador do visitante.
import { exemplo } from "../../lib/fontes/exemplo.js";
import { curadoria } from "../../lib/fontes/curadoria.js";
import { shopee } from "../../lib/fontes/shopee.js";
import { awin } from "../../lib/fontes/awin.js";
import { aliexpress } from "../../lib/fontes/aliexpress.js";
import { registrarBusca } from "../../lib/buscas.js";
import { historicoAoVivo, AO_VIVO } from "../../lib/ofertas.js";
import { separarAcessorios } from "../../lib/relevancia.js";
import { categoriaPorNome, termoNaCategoria, ordenarNaCategoria, marcarSecoes, contarNaCategoria, vitrineDaCategoria, montarVitrine } from "../../lib/categorias.js";

// Para ligar uma loja nova: criar lib/fontes/<loja>.js e incluir aqui.
const FONTES_REAIS = [curadoria, shopee, awin, aliexpress];

const CACHE_SEGUNDOS = 60 * 60;
// Na busca digitada, pede páginas da loja de 3 em 3 (Shopee: 48 cada) até ter MINIMO_PRODUTOS produtos
// de verdade (sem contar acessórios: "air fryer" traz muita forminha e papel) ou MAX_PAGINAS páginas.
// "Ver mais resultados" continua de onde parou.
const PAGINAS_POR_LOTE = 3;
const MINIMO_PRODUTOS = 100;
const MAX_PAGINAS = 9;
// Vitrine das categorias: cada busca (4 ou 5) pede 1 página por vez, até 3 páginas, até ter MINIMO_PRODUTOS
const MAX_PAGINAS_VITRINE = 3;
// Até onde o "Ver mais" vai (pagina= nas "Ofertas do dia", desde= na busca e na vitrine)
const MAX_PAGINA = 20;
const MAX_DESDE = 100;
// Histórico ao vivo: grava o preço de no máximo tantos produtos por busca (sem acessórios), para uma
// busca nova não gastar centenas de gravações no D1. A coleta diária (/api/coletar-precos) cobre o resto
const GRAVAR_POR_BUSCA = 60;
// Trocar este número quando mudar o formato das respostas, para não servir as guardadas antes
const VERSAO_CACHE = 25;

// Uma oferta de cada loja por vez (Shopee, AliExpress, Shopee…), para nenhuma loja ficar só no fim da lista
function intercalar(listas) {
  const saida = [];
  for (let i = 0; i < Math.max(0, ...listas.map((l) => l.length)); i++) {
    for (const lista of listas) if (i < lista.length) saida.push(lista[i]);
  }
  return saida;
}

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
  const pagina = Math.min(Math.max(parseInt(params.get("pagina"), 10) || 1, 1), MAX_PAGINA);
  const desde = Math.min(Math.max(parseInt(params.get("desde"), 10) || 1, 1), MAX_DESDE);
  const categoria = q ? categoriaPorNome(params.get("cat")) : null;

  // Conta a busca para os "em alta" da semana, sem atrasar a resposta.
  // Clique num atalho não conta: senão o atalho se manteria em alta sozinho.
  // O IP só serve para contar cada pessoa uma vez por termo por dia (ver lib/buscas.js); não é guardado.
  const contar = (resposta) => {
    if (q && pagina === 1 && desde === 1 && !params.has("atalho") && Number(resposta.headers.get("X-Total-Ofertas")) > 0) {
      waitUntil(registrarBusca(env, q, request.headers.get("CF-Connecting-IP")).catch(() => {}));
    }
    return resposta;
  };

  // Guarda as respostas por 1 hora para não gastar o limite das APIs
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const chave = new Request(new URL(`/api/buscar?v=${VERSAO_CACHE}&q=${encodeURIComponent(q.toLowerCase())}${categoria ? `&cat=${encodeURIComponent(categoria.nome)}` : ""}${pagina > 1 ? `&pagina=${pagina}` : ""}${desde > 1 ? `&desde=${desde}` : ""}`, request.url));
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
          if (!termo) {
            const ofertas = await fonte.destaques(env, pagina);
            lojas[fonte.nome] = { ok: true, total: ofertas.length };
            return ofertas;
          }
          const paginas = opcoes?.paginas || [pagina];
          if (!fonte.porPagina) {
            // Lojas sem páginas (Awin, curadoria) vêm inteiras na primeira vez: uma consulta só por termo
            if (!paginas.includes(1)) return [];
            const ofertas = await fonte.buscar(termo, env, 1, opcoes);
            lojas[fonte.nome] = { ok: lojas[fonte.nome]?.ok !== false, total: Math.max(ofertas.length, lojas[fonte.nome]?.total || 0) };
            return ofertas;
          }
          const listas = await Promise.all(paginas.map((p) => fonte.buscar(termo, env, p, opcoes)));
          const vistos = new Set();
          const ofertas = listas.flat().filter((o) => !vistos.has(o.id) && vistos.add(o.id));
          // total = tamanho da última página (cheia = a loja tem mais). Na vitrine (várias buscas) vale a que trouxe mais
          lojas[fonte.nome] = { ok: lojas[fonte.nome]?.ok !== false, total: Math.max(listas.at(-1).length, lojas[fonte.nome]?.total || 0) };
          return ofertas;
        } catch (erro) {
          // Uma loja fora do ar não derruba a busca nas outras
          lojas[fonte.nome] = { ok: false, erro: String(erro.message || erro) };
          return [];
        }
      }),
    );
    return intercalar(resultados);
  };

  // Busca digitada: pede páginas de 3 em 3 até ter produtos suficientes (ver MINIMO_PRODUTOS).
  // termos = o que foi digitado (e, na categoria, "invictus perfume"); contar = quantos produtos de verdade
  // há entre os que chegaram nesta rodada (conta só os novos: refazer a lista toda a cada rodada gastava CPU)
  const buscarAteEncher = async (termos, contar) => {
    const juntas = [];
    const vistos = new Set();
    let produtos = 0;
    let pag = desde;
    let acabou = false;
    do {
      const paginas = Array.from({ length: PAGINAS_POR_LOTE }, (_, i) => pag + i);
      for (const l of Object.values(lojas)) l.total = 0;
      const listas = await Promise.all(termos.map((t) => consultar(t, { paginas })));
      const novas = listas.flat().filter((o) => !vistos.has(o.id) && vistos.add(o.id));
      juntas.push(...novas);
      produtos += contar(novas);
      pag += PAGINAS_POR_LOTE;
      acabou = !fontes.some((f) => f.porPagina && lojas[f.nome]?.total >= f.porPagina);
    } while (!acabou && pag - desde < MAX_PAGINAS && produtos < MINIMO_PRODUTOS);
    return { juntas, proxima: acabou || pag > MAX_DESDE ? null : pag };
  };
  let mais = null;

  // Abriu uma categoria: vitrine com os produtos em alta (várias buscas, mais vendidos primeiro)
  const vitrine = vitrineDaCategoria(q, categoria);
  let ofertas;
  let foraDaCategoria = false;
  if (vitrine) {
    // "apple watch" nos mais vendidos da Shopee é quase tudo pulseira: continua pedindo páginas até encher
    // Cada página é marcada (acessório/bate) uma vez só, quando chega
    const marcadas = vitrine.buscas.map(() => []);
    let pag = desde;
    let acabou = false;
    do {
      for (const l of Object.values(lojas)) l.total = 0;
      const novas = await Promise.all(vitrine.buscas.map((termo) => consultar(termo, { maisVendidos: true, paginas: [pag] })));
      novas.forEach((lista, i) => marcadas[i].push(...separarAcessorios(lista, vitrine.buscas[i])));
      pag += 1;
      acabou = !fontes.some((f) => f.porPagina && lojas[f.nome]?.total >= f.porPagina);
      ofertas = montarVitrine(marcadas, vitrine, categoria);
    } while (!acabou && pag - desde < MAX_PAGINAS_VITRINE && ofertas.length < MINIMO_PRODUTOS);
    ofertas = marcarSecoes(ofertas, categoria);
    mais = acabou || pag > MAX_DESDE ? null : `desde=${pag}`;
  } else if (categoria) {
    // Dentro de uma categoria: o que foi digitado + (se a categoria tem chave) "invictus perfume";
    // fica só o que não é de outra categoria, o que é dela primeiro. Se nada sobrar, busca em tudo (e o site avisa).
    const extra = termoNaCategoria(q, categoria);
    const { juntas, proxima } = await buscarAteEncher(extra ? [extra, q] : [q],
      (novas) => contarNaCategoria(separarAcessorios(novas, q), categoria));
    ofertas = ordenarNaCategoria(separarAcessorios(juntas, q), categoria);
    if (!ofertas.some((o) => o.naCategoria) && desde === 1) {
      ofertas = marcarSecoes(separarAcessorios(juntas, q));
      foraDaCategoria = ofertas.length > 0;
    }
    mais = proxima && `desde=${proxima}`;
  } else if (q) {
    // Na busca, acessórios ("tapete para air fryer") vão para o fim e o site os esconde
    const { juntas, proxima } = await buscarAteEncher([q], (novas) => separarAcessorios(novas, q).filter((o) => !o.acessorio).length);
    ofertas = marcarSecoes(separarAcessorios(juntas, q));
    mais = proxima && `desde=${proxima}`;
  } else {
    ofertas = await consultar(q);
  }
  // "Ofertas do dia": a próxima página
  if (!q) {
    mais = pagina < MAX_PAGINA && fontes.some((f) => f.porPagina && lojas[f.nome]?.total >= f.porPagina) ? `pagina=${pagina + 1}` : null;
  }
  // Shopee e AliExpress: junta o histórico de preço e guarda o preço de hoje (sem atrasar a resposta).
  // É o que permite o selo "Desconto real" (ex.: na Black Friday). Banco fora do ar não derruba a busca.
  if (env.DB && ofertas.some((o) => AO_VIVO.has(o.loja))) {
    try {
      const vivo = await historicoAoVivo(env.DB, ofertas, { gravarAte: GRAVAR_POR_BUSCA });
      ofertas = vivo.ofertas;
      waitUntil(vivo.gravar().catch(() => {}));
    } catch {
      // tabela precos ainda não existe (o robô cria) ou D1 indisponível
    }
  }

  const resposta = responder({
    q,
    categoria: categoria && !foraDaCategoria ? categoria.nome : null,
    foraDaCategoria,
    exemplo: !reais.length,
    ofertas,
    // Botão "Ver mais ofertas" / "Ver mais resultados": o site pede /api/buscar?q=...&<mais>
    temMais: Boolean(mais),
    mais,
    lojas,
    tempoMs: Date.now() - inicio,
  });
  // Produtos de exemplo não contam como busca em alta
  resposta.headers.set("X-Total-Ofertas", reais.length ? String(ofertas.length) : "0");
  if (cache && Object.values(lojas).every((l) => l.ok)) await cache.put(chave, resposta.clone());
  return contar(resposta);
}
