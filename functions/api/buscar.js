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
import { lomadee } from "../../lib/fontes/lomadee.js";
import { registrarBusca } from "../../lib/buscas.js";
import { historicoAoVivo, ehAoVivo } from "../../lib/ofertas.js";
import { carregarMapa, aplicarMapa, aprenderCategorias } from "../../lib/mapaCategorias.js";
import { separarAcessorios } from "../../lib/relevancia.js";
import { categoriaPorNome, termoNaCategoria, ordenarNaCategoria, marcarSecoes, contarNaCategoria, vitrineDaCategoria, montarVitrine } from "../../lib/categorias.js";

// Para ligar uma loja nova: criar lib/fontes/<loja>.js e incluir aqui.
const FONTES_REAIS = [curadoria, shopee, awin, aliexpress, lomadee];

const CACHE_SEGUNDOS = 60 * 60;
// Na busca digitada, cada chamada pede 3 páginas de cada loja (Shopee: 48 cada) e responde logo: o site mostra
// esses e pede sozinho as próximas (desde=4, 7…) até ter uns 100 produtos de verdade. Antes o servidor só
// respondia com tudo pronto e a primeira busca levava 12–14 s.
const PAGINAS_POR_LOTE = 3;
const MINIMO_PRODUTOS = 100;
const MAX_PAGINAS = PAGINAS_POR_LOTE;
// Vitrine das categorias: cada busca (4 ou 5) pede 1 página por chamada (o site pede as próximas sozinho)
const MAX_PAGINAS_VITRINE = 1;
// Loja que demora mais que isso fica de fora desta resposta (as outras não esperam por ela)
const LIMITE_LOJA_MS = 8000;
// Para o robô que prepara as buscas populares ninguém está esperando: as lojas têm mais tempo
const LIMITE_LOJA_ROBO_MS = 10000;
// Buscas populares preparadas pelo robô da madrugada (/api/preparar-buscas) valem por até 30 horas
const VALIDADE_PRONTA_MS = 30 * 60 * 60 * 1000;
// Até onde o "Ver mais" vai (pagina= nas "Ofertas do dia", desde= na busca e na vitrine)
const MAX_PAGINA = 20;
const MAX_DESDE = 100;
// Histórico ao vivo: grava o preço de no máximo tantos produtos por busca (sem acessórios), para uma
// busca nova não gastar centenas de gravações no D1. A coleta diária (/api/coletar-precos) cobre o resto
const GRAVAR_POR_BUSCA = 60;
// Trocar este número quando mudar o formato das respostas, para não servir as guardadas antes
const VERSAO_CACHE = 37;

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

const comLimite = (promessa, ms) => Promise.race([promessa,
  new Promise((_, falha) => setTimeout(() => falha(new Error(`demorou mais de ${ms / 1000} s`)), ms))]);

async function criarTabelaProntas(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS buscas_prontas (
    chave TEXT PRIMARY KEY, resposta TEXT NOT NULL, total INTEGER NOT NULL, criado INTEGER NOT NULL)`).run();
}

export async function onRequestGet({ request, env, waitUntil }) {
  // O robô (/api/preparar-buscas) passa preparar = true: busca de novo nas lojas e guarda a resposta no banco
  const preparar = Boolean(env.__PREPARAR);
  const limiteLoja = preparar ? LIMITE_LOJA_ROBO_MS : LIMITE_LOJA_MS;
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
  const guardada = !preparar && cache && (await cache.match(chave));
  if (guardada) return contar(guardada);
  // Busca popular já preparada pelo robô: responde na hora (e guarda no cache por 1 hora)
  // Vale para as buscas populares e para as "Ofertas do dia" da página inicial (q vazio, 1ª página)
  const primeira = pagina === 1 && desde === 1;
  if (primeira && !preparar && env.DB) {
    try {
      const pronta = await env.DB.prepare("SELECT resposta, total, criado FROM buscas_prontas WHERE chave = ?").bind(chave.url).first();
      if (pronta && Date.now() - pronta.criado < VALIDADE_PRONTA_MS) {
        const resposta = responder(JSON.parse(pronta.resposta));
        resposta.headers.set("X-Total-Ofertas", String(pronta.total));
        resposta.headers.set("X-Pronta", "1");
        if (cache) waitUntil(cache.put(chave, resposta.clone()).catch(() => {}));
        return contar(resposta);
      }
    } catch {
      // tabela ainda não existe (o robô cria): segue buscando nas lojas
    }
  }

  const ligadas = await Promise.all(FONTES_REAIS.map((f) => f.ativa(env)));
  const reais = FONTES_REAIS.filter((_, i) => ligadas[i]);
  // Enquanto nenhuma API estiver ligada, usa os produtos de exemplo
  // Da 2ª página em diante, só as lojas que têm mais páginas de destaques
  const fontes = (reais.length ? reais : [exemplo]).filter((f) => pagina === 1 || f.porPagina);

  // Categorias das lojas que já sabemos traduzir para as nossas (ver lib/mapaCategorias.js)
  const mapa = await carregarMapa(env);
  const lojas = {};
  const consultar = async (termo, opcoes) => {
    const resultados = await Promise.all(
      fontes.map(async (fonte) => {
        const t0 = Date.now();
        const medir = () => { if (lojas[fonte.nome]) lojas[fonte.nome].ms = Math.max(Date.now() - t0, lojas[fonte.nome].ms || 0); };
        try {
          if (!termo) {
            const ofertas = await comLimite(fonte.destaques(env, pagina), limiteLoja);
            lojas[fonte.nome] = { ok: true, total: ofertas.length };
            medir();
            return ofertas;
          }
          const paginas = opcoes?.paginas || [pagina];
          if (!fonte.porPagina) {
            // Lojas sem páginas (Awin, curadoria) vêm inteiras na primeira vez: uma consulta só por termo
            if (!paginas.includes(1)) return [];
            const ofertas = await comLimite(fonte.buscar(termo, env, 1, opcoes), limiteLoja);
            lojas[fonte.nome] = { ok: lojas[fonte.nome]?.ok !== false, total: Math.max(ofertas.length, lojas[fonte.nome]?.total || 0) };
            medir();
            return ofertas;
          }
          const listas = await comLimite(Promise.all(paginas.map((p) => fonte.buscar(termo, env, p, opcoes))), limiteLoja);
          const vistos = new Set();
          const ofertas = listas.flat().filter((o) => !vistos.has(o.id) && vistos.add(o.id));
          // total = tamanho da última página (cheia = a loja tem mais). Na vitrine (várias buscas) vale a que trouxe mais
          lojas[fonte.nome] = { ok: lojas[fonte.nome]?.ok !== false, total: Math.max(listas.at(-1).length, lojas[fonte.nome]?.total || 0) };
          medir();
          return ofertas;
        } catch (erro) {
          // Uma loja fora do ar não derruba a busca nas outras
          lojas[fonte.nome] = { ok: false, erro: String(erro.message || erro) };
          medir();
          return [];
        }
      }),
    );
    return aplicarMapa(intercalar(resultados), mapa);
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
  if (env.DB && ofertas.some(ehAoVivo)) {
    try {
      const vivo = await historicoAoVivo(env.DB, ofertas, { gravarAte: GRAVAR_POR_BUSCA });
      ofertas = vivo.ofertas;
      waitUntil(vivo.gravar().catch(() => {}));
    } catch {
      // tabela precos ainda não existe (o robô cria) ou D1 indisponível
    }
  }

  // O robô ensina o mapa de categorias com as buscas dele (catsLoja e catMapa ficam na resposta para conferência)
  if (preparar && env.DB) await aprenderCategorias(env.DB, ofertas).catch(() => {});
  ofertas = ofertas.map(({ catLojaNome, ...o }) => o);

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
  const todasOk = Object.values(lojas).every((l) => l.ok);
  if (cache && todasOk) await cache.put(chave, resposta.clone());
  // Busca pronta: guarda mesmo que uma loja pequena tenha falhado (vindo do robô do GitHub, a Lomadee às vezes
  // trava), desde que a Shopee tenha respondido
  const prontaOk = lojas.shopee?.ok && ofertas.length > 0;
  if (preparar && primeira && prontaOk && reais.length && env.DB) {
    await criarTabelaProntas(env.DB);
    await env.DB.prepare("INSERT OR REPLACE INTO buscas_prontas (chave, resposta, total, criado) VALUES (?, ?, ?, ?)")
      .bind(chave.url, await resposta.clone().text(), ofertas.length, Date.now()).run();
  }
  if (preparar) return resposta; // o robô não conta como busca em alta
  return contar(resposta);
}
