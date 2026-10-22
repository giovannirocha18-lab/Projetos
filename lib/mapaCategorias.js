// =====================================================================
// CATEGORIAS DAS LOJAS -> NOSSAS CATEGORIAS (aprendido sozinho)
//
// A Shopee manda com cada produto os códigos das categorias dela (3 níveis, do geral ao específico,
// sem os nomes) e a AliExpress, os códigos e nomes dela (2 níveis). O título de um produto às vezes
// engana as nossas regras ("Mini Batedeira … para Bolo" caía em Bebês), mas a categoria da loja não.
//
// Como aprende: em cada busca feita nas lojas (as do robô da madrugada e as dos visitantes), cada produto que as regras do
// título classificam vota "a categoria X da loja = nossa categoria Y". Quando uma categoria da loja tem
// votos suficientes e quase todos para a mesma categoria nossa, todos os produtos dela passam a ir para
// lá, mesmo os de título confuso. Vale a categoria mais específica da loja que já tiver sido aprendida.
//
// cat_loja_votos -> (loja, código da categoria da loja, nossa categoria, votos)
// =====================================================================
import { categoriaDoProduto } from "./categorias.js";

// Poucos votos ainda não decidem: a categoria "Pesca" da AliExpress só tinha aparecido nas buscas de óculos
// ("óculos de pesca polarizado") e virou "Óculos", mandando as varas de pesca para lá (17/10/2026)
const MIN_VOTOS = 10;
const MIN_PARTE = 0.8; // 80% dos votos para a mesma categoria nossa
const VALIDADE_MS = 5 * 60 * 1000; // o mapa fica na memória do servidor por 5 minutos

const TABELA = `CREATE TABLE IF NOT EXISTS cat_loja_votos (
  loja TEXT NOT NULL, cat TEXT NOT NULL, categoria TEXT NOT NULL, votos INTEGER NOT NULL,
  PRIMARY KEY (loja, cat, categoria))`;

// Voto de produto que o título não classificou: a categoria "Pesca" da AliExpress tinha 101 de 140 produtos assim numa
// busca de vara de pesca ("Tubo de Fibra de Carbono"), e sem esse voto os poucos "óculos de pesca" decidiam sozinhos
const SEM_CATEGORIA = "-";

let guardado = null;
const CHAVE_CACHE = "https://vaiprocarrinho.com.br/__cache/mapa-categorias-v1";
const CACHE_SEGUNDOS = 15 * 60;

// Map "loja:código" -> nome da nossa categoria (só as que já têm certeza)
export async function carregarMapa(env) {
  if (!env.DB) return new Map();
  if (guardado && Date.now() - guardado.em < VALIDADE_MS) return guardado.mapa;
  // O mapa pronto fica também no cache do Cloudflare (vale para todos os servidores daquela região): cada servidor novo
  // lia a tabela inteira de votos, e são muitos servidores (limite de leituras do D1 grátis, 22/10/2026)
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const doCache = cache && (await cache.match(CHAVE_CACHE).catch(() => null));
  if (doCache) {
    const mapa = new Map(await doCache.json());
    guardado = { mapa, em: Date.now() };
    return mapa;
  }
  const mapa = new Map();
  try {
    const { results } = await env.DB.prepare("SELECT loja, cat, categoria, votos FROM cat_loja_votos").all();
    const porCat = new Map();
    for (const r of results) {
      const chave = `${r.loja}:${r.cat}`;
      const c = porCat.get(chave) || { total: 0, melhor: null, votos: 0 };
      c.total += r.votos;
      // SEM_CATEGORIA conta no total (produtos que o título não classificou), mas nunca ganha
      if (r.categoria !== SEM_CATEGORIA && r.votos > c.votos) Object.assign(c, { melhor: r.categoria, votos: r.votos });
      porCat.set(chave, c);
    }
    for (const [chave, c] of porCat) if (c.votos >= MIN_VOTOS && c.votos >= c.total * MIN_PARTE) mapa.set(chave, c.melhor);
    if (cache && mapa.size) {
      await cache.put(CHAVE_CACHE, new Response(JSON.stringify([...mapa]), {
        headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${CACHE_SEGUNDOS}` },
      })).catch(() => {});
    }
  } catch {
    // tabela ainda não existe (o robô cria na primeira vez): ninguém usa o mapa
  }
  guardado = { mapa, em: Date.now() };
  return mapa;
}

// Códigos das categorias da loja que já sabemos serem da nossa categoria "nome" (ex.: AliExpress -> Celulares).
// A busca da AliExpress por "celular" traz quase só capinhas; pedindo também dentro dessas categorias, vêm os celulares
export function catsDaLoja(mapa, loja, nome, limite = 10) {
  const prefixo = `${loja}:`;
  return [...mapa].filter(([k, v]) => v === nome && k.startsWith(prefixo)).map(([k]) => k.slice(prefixo.length)).slice(0, limite);
}

// catMapa = nossa categoria pela categoria da loja (a mais específica que o mapa já conhece)
export function aplicarMapa(ofertas, mapa) {
  if (!mapa.size) return ofertas;
  return ofertas.map((o) => {
    if (!o.catsLoja?.length) return o;
    // O 1º nível é geral demais: "Acessórios de moda" da Shopee virou "Óculos" e levava luvas e bonés junto (21/10/2026).
    // Com subcategoria, só ela vale ("0" = a Shopee não tem esse nível); sem nenhuma aprendida, manda o título.
    const cats = o.catsLoja.length > 1 ? o.catsLoja.slice(1).filter((c) => c !== "0") : o.catsLoja;
    for (const cat of [...cats].reverse()) {
      const nossa = mapa.get(`${o.loja}:${cat}`);
      if (nossa) return { ...o, catMapa: nossa };
    }
    return o;
  });
}

// Votos desta busca (só produtos, sem acessórios; a categoria vem do título, nunca do próprio mapa; sem categoria também vota)
export async function aprenderCategorias(db, ofertas) {
  const votos = new Map();
  for (const o of ofertas) {
    if (o.acessorio || !o.catsLoja?.length) continue;
    const nossa = categoriaDoProduto(o.titulo || "")?.nome || SEM_CATEGORIA;
    for (const cat of o.catsLoja) {
      const chave = `${o.loja}\t${cat}\t${nossa}`;
      votos.set(chave, (votos.get(chave) || 0) + 1);
    }
  }
  if (!votos.size) return;
  await db.prepare(TABELA).run();
  const gravar = db.prepare(`INSERT INTO cat_loja_votos (loja, cat, categoria, votos) VALUES (?, ?, ?, ?)
    ON CONFLICT (loja, cat, categoria) DO UPDATE SET votos = votos + excluded.votos`);
  await db.batch([...votos].map(([chave, n]) => gravar.bind(...chave.split("\t"), n)));
}
