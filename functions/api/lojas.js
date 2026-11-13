// GET /api/lojas              -> lojas parceiras ativas agora (janela "Lojas parceiras" do site)
//                                { lojas: [{ id, nome, rede, produtos?, internacional? }] }
// GET /api/lojas?id=X&pagina=N -> produtos de uma loja ("Ver produtos"): { nome, ofertas, temMais }
//   id = "shopee" | "aliexpress" | "awin:<loja>" | "lomadee:<marca>"
// GET /api/lojas?id=X&marca=samsung -> só os produtos dessa marca na loja, de uma vez (até 240; Mercado Livre e lojas da
//   Awin; lib/marcas.js): { nome, ofertas, marca, completo, temMais: false }
// GET /api/lojas?id=mercadolivre&secao=Saúde -> só os produtos dessa categoria do site na loja Mercado Livre, de uma vez
//   (até 240): { nome, ofertas, secao, completo, temMais: false }
// Pedido do Giovanni (22/10/2026). As mesmas lojas que /api/numeros conta.
import { shopee } from "../../lib/fontes/shopee.js";
import { aliexpress } from "../../lib/fontes/aliexpress.js";
import { LOJA_SHEIN } from "../../lib/shein.js";
import { mercadolivre, produtosDaLojaML, totalDaLojaML, indiceDaLojaML, ofertasMLPorCodigos } from "../../lib/fontes/mercadolivre.js";
import { lomadee, marcasComProdutos, produtosDaMarca } from "../../lib/fontes/lomadee.js";
import { semFotosQuebradas, respostaSemFotosQuebradas } from "../../lib/fotos.js";
import { COLUNAS_OFERTA, linhaParaOferta, comHistorico, historicoAoVivo, ehAoVivo, nomeDaLojaAwin, lojasDaAwin, lojaPequena } from "../../lib/ofertas.js";
import { carregarMapa, aplicarMapa } from "../../lib/mapaCategorias.js";
import { marcarSecoes, categoriaPorNome } from "../../lib/categorias.js";
import { comCategoriaDaIa } from "../../lib/ia.js";
import { MARCAS } from "../../lib/vocabulario.js";
import { normalizar } from "../../lib/texto.js";
import { modeloBase, grupoDaCategoria, semTamanho } from "../../lib/variacoes.js";
import { filtroDeMarca, MAX_DA_MARCA } from "../../lib/marcas.js";

const LISTA_SEGUNDOS = 6 * 60 * 60;
const PRODUTOS_SEGUNDOS = 60 * 60;
const POR_PAGINA = 48;
const MAX_PAGINA = 80; // era 20 (05/11/2026: a loja Mercado Livre tem ~3.800 mais vendidos)
const VERSAO = 46; // 46: Olympikus em Calçados (13/11/2026); 45: Olympikus só em Esporte e fitness (13/11/2026); 44: Olympikus, tamanhos infantis e faixas "39-40"; 43: Olympikus (13/11/2026); 42: Mercado Livre em primeiro (08/11/2026); 41: Shein sem "Internacional" (08/11/2026); 40: Shein só com "Ir para a loja" (08/11/2026); 39: Stanley (05/11/2026); 38: aparelhos antes dos acessórios nos atalhos; 37: atalhos da loja ML; 36: total da loja ML; 35: "sapateira" não é sapato (variações); 34: até 80 páginas por loja; 33: loja Mercado Livre (05/11/2026); 32: Lauri fora também pela Lomadee; 31: sem a Lauri Esporte (04/11/2026); 30: tamanhos em inglês (XS, S, L, XL); 29: tamanhos "42 BR" e "2GG"; 28: um cartão por modelo e tipos revezados na página da loja (04/11/2026); 27: sem a Elements (04/11/2026); 26: TEKA em Cama e banho (04/11/2026); 25: "marca" nas lojas que também são marca (04/11/2026); 24: Lauri Esporte só pela Awin (04/11/2026); 23: só a conta PJ da Awin (30/10/2026); 22: Moda infantil (30/10/2026); 21: categorias da IA (29/10/2026); 20: Motorola "moto g" não é moto; 19: Central Ar toda em Eletrodomésticos; 18: Central Ar, Motorola e Calvin Klein (28/10/2026); 17: categoria da loja trava a categoria (28/10/2026); 16: Pets exclusiva (28/10/2026); 15: oBoticario e Efacil (28/10/2026); 14: fotos quebradas da Lomadee fora (27/10/2026); 13: Lojas Benoit fora até corrigir o feed (27/10/2026); 12: Lojas Benoit sem as fotos quebradas (27/10/2026); 11: Cobasi e Lojas Benoit (27/10/2026); 10: fotos e descrições da Lomadee; 9: fotos e descrições da Lomadee (26/10/2026); trocar para descartar o que está guardado (7: links da Lomadee assinados, 25/10/2026; 8: marcas novas da Lomadee)

// O navegador guarda só 1 minuto (08/11/2026: lojas novas e mudanças só apareciam com Ctrl+F5, ele guardava 6 h);
// o tempo longo vale no cache do Cloudflare (cache.put), que é quem responde rápido
const NAVEGADOR_SEGUNDOS = 60;
function paraNavegador(r) {
  const copia = new Response(r.body, r);
  copia.headers.set("Cache-Control", `public, max-age=${NAVEGADOR_SEGUNDOS}`);
  return copia;
}

function responder(dados, segundos) {
  return Response.json(dados, { headers: { "Cache-Control": `public, max-age=${segundos}`, "X-Robots-Tag": "noindex" } });
}

const MARCAS_LIMPAS = MARCAS.map((m) => ` ${normalizar(m).replace(/[^a-z0-9]+/g, " ").trim()} `);
const ehMarca = (nome) => {
  const n = ` ${normalizar(nome).replace(/[^a-z0-9]+/g, " ").trim()} `;
  // junto também ("oBoticario" tem "boticario"), só marca de 6+ letras
  const junto = n.replace(/ /g, "");
  return MARCAS_LIMPAS.some((m) => n.includes(m) || (m.trim().length >= 6 && junto.includes(m.replace(/ /g, ""))));
};

async function listarLojas(env) {
  const marketplaces = [
    // Mercado Livre em primeiro (08/11/2026, pedido do Giovanni)
    // produtos = os mais vendidos guardados (a página da loja mostra "Mostrando 240 de 3.798"; 05/11/2026)
    mercadolivre.ativa(env) && { id: "mercadolivre", nome: "Mercado Livre", rede: "marketplace", produtos: (await totalDaLojaML(env).catch(() => 0)) || undefined },
    shopee.ativa(env) && { id: "shopee", nome: "Shopee", rede: "marketplace" },
    aliexpress.ativa(env) && { id: "aliexpress", nome: "AliExpress", rede: "marketplace", internacional: true },
    LOJA_SHEIN, // sem produtos no site: só o botão "Ir para a loja" (lib/shein.js)
  ].filter(Boolean);
  const [marcas, daAwin] = await Promise.all([
    lomadee.ativa(env) ? marcasComProdutos(env).catch(() => new Map()) : new Map(),
    env.DB ? lojasDaAwin(env.DB).catch(() => null) : [],
  ]);
  const lojas = [
    ...(daAwin || []).map((l) => ({ id: `awin:${l.loja}`, nome: nomeDaLojaAwin(l.nome) || l.loja, rede: "awin", produtos: l.n, internacional: Boolean(l.internacional) || undefined })),
    ...[...marcas].map(([id, m]) => ({ id: `lomadee:${id}`, nome: m.nome, rede: "lomadee", produtos: m.produtos, produtosMais: m.produtosMais })),
  ].filter((l) => !lojaPequena(l.produtos, l.produtosMais)).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }))
    // Loja que também é marca (Motorola, Calvin Klein, Boticário…): buscar o nome dela mostra a marca em todas as lojas;
    // nas outras (Kabum, Efacil, Cobasi…) o site abre direto a página da loja (app.js, buscar)
    .map((l) => (ehMarca(l.nome) ? { ...l, marca: true } : l));
  return { lojas: [...marketplaces, ...lojas], completo: (!lomadee.ativa(env) || marcas.size > 0) && daAwin !== null };
}

// Ordem dos produtos de uma loja da Awin na página dela: um por modelo, revezando os tipos (ver produtosDaLoja).
// Guardada 1 hora em cada servidor do Cloudflare (as páginas 2, 3… usam a mesma)
const ordens = new Map();
async function ordemDaLoja(db, loja) {
  const guardada = ordens.get(loja);
  if (guardada && Date.now() - guardada.em < PRODUTOS_SEGUNDOS * 1000) return guardada.ids;
  ordens.delete(loja);
  const { results } = await db.prepare(
    "SELECT id, titulo, categoria, desconto FROM ofertas WHERE loja = ? AND +fonte = 'awin' ORDER BY desconto DESC",
  ).bind(loja).all();
  const vistos = new Map(); // modelo -> 1º id
  const variados = new Set(); // ids que representam mais de um tamanho
  const grupos = new Map();
  for (const l of results) {
    const modelo = modeloBase(l.titulo);
    if (vistos.has(modelo)) { variados.add(vistos.get(modelo)); continue; }
    vistos.set(modelo, l.id);
    const g = grupoDaCategoria(l.categoria);
    if (!grupos.has(g)) grupos.set(g, []);
    grupos.get(g).push(l.id);
  }
  // Um de cada tipo por vez (os tipos na ordem do maior desconto de cada um)
  const filas = [...grupos.values()];
  const ids = [];
  for (let i = 0; ids.length < MAX_PAGINA * POR_PAGINA && filas.some((f) => i < f.length); i++) {
    for (const f of filas) if (i < f.length) ids.push(f[i]);
  }
  if (ordens.size > 200) ordens.clear();
  ordens.set(loja, { ids, variados, em: Date.now() });
  return ids;
}

// Só uma marca numa loja da Awin (10/11/2026): os nomes de toda a loja (consulta leve), ficam os que citam a marca, um por
// modelo, do maior desconto para o menor; depois os dados completos só desses
async function produtosDaMarcaNaLoja(env, loja, filtro) {
  const { results } = await env.DB.prepare(
    "SELECT id, titulo FROM ofertas WHERE loja = ? AND +fonte = 'awin' ORDER BY desconto DESC",
  ).bind(loja).all();
  const vistos = new Map(); // modelo -> 1º id
  const variados = new Set();
  for (const l of results || []) {
    if (!filtro.cita(l.titulo)) continue;
    const modelo = modeloBase(l.titulo);
    if (vistos.has(modelo)) variados.add(vistos.get(modelo)); else vistos.set(modelo, l.id);
  }
  const todos = [...vistos.values()];
  const ids = todos.slice(0, MAX_DA_MARCA);
  const porId = new Map();
  const POR_VEZ = 90; // o banco aceita até 100 valores por consulta
  const partes = [];
  for (let i = 0; i < ids.length; i += POR_VEZ) partes.push(ids.slice(i, i + POR_VEZ));
  if (partes.length) {
    const respostas = await env.DB.batch(partes.map((p) => env.DB.prepare(`SELECT ${COLUNAS_OFERTA} FROM ofertas WHERE id IN (${p.map(() => "?").join(",")})`).bind(...p)));
    for (const r of respostas) for (const l of r.results || []) porId.set(l.id, l);
  }
  const ofertas = await comHistorico(env.DB, ids.map((id) => porId.get(id)).filter(Boolean).map(linhaParaOferta)
    .map((o) => (variados.has(o.id) ? { ...o, titulo: semTamanho(o.titulo) } : o)));
  return { nome: ofertas[0]?.lojaNome || loja, ofertas, temMais: false, completo: todos.length <= MAX_DA_MARCA };
}

// Só uma categoria do site na loja Mercado Livre (11/11/2026, pedido do Giovanni: a lista "Categorias" da lateral filtrava
// só os ~480 produtos já carregados, de 14 mil). A categoria de cada um dos mais vendidos sai do nome (e da IA), do mesmo
// jeito que nas listas do site; guardada na memória enquanto o índice for o mesmo. Vêm os primeiros do ranking dessa
// categoria (com folga: o que mudar de categoria com os dados completos sai depois, em onRequestGet)
const FOLGA_DA_SECAO = 60;
const secoesDoIndice = new WeakMap(); // índice -> Map(código -> categoria)
async function produtosDaSecaoNaLojaML(env, secao) {
  const indice = await indiceDaLojaML(env);
  let mapa = secoesDoIndice.get(indice);
  if (!mapa) {
    const leves = await comCategoriaDaIa(env.DB, indice.map((o) => ({ id: o.id, titulo: o.titulo, loja: "mercadolivre", lojaNome: "Mercado Livre" })));
    mapa = new Map(marcarSecoes(leves).map((o) => [o.id, o.secao || ""]));
    secoesDoIndice.set(indice, mapa);
  }
  const ids = indice.filter((o) => mapa.get(o.id) === secao).map((o) => o.id);
  const ofertas = await ofertasMLPorCodigos(env, ids.slice(0, MAX_DA_MARCA + FOLGA_DA_SECAO));
  return { nome: "Mercado Livre", ofertas, temMais: false, completo: ids.length <= MAX_DA_MARCA + FOLGA_DA_SECAO };
}

async function produtosDaLoja(env, id, pagina, waitUntil, cat = null, filtro = null) {
  if (filtro) {
    if (id === "mercadolivre" && mercadolivre.ativa(env)) {
      const r = await produtosDaLojaML(env, 1, MAX_DA_MARCA, cat, filtro);
      return { nome: r.nome, ofertas: r.ofertas, temMais: false, completo: r.total <= MAX_DA_MARCA };
    }
    if (id.startsWith("awin:") && id.length > 5 && env.DB) return produtosDaMarcaNaLoja(env, id.slice(5), filtro);
    return null; // Shopee, AliExpress e Lomadee: a lista vem das lojas, página a página (sem filtro de marca)
  }
  if (id === "shopee" || id === "aliexpress") {
    const fonte = id === "shopee" ? shopee : aliexpress;
    if (!fonte.ativa(env)) return null;
    const ofertas = await fonte.destaques(env, pagina);
    return { nome: id === "shopee" ? "Shopee" : "AliExpress", ofertas, temMais: ofertas.length >= 10 && pagina < MAX_PAGINA };
  }
  // Mercado Livre (05/11/2026): os mais vendidos de cada categoria guardados pelo robô (lib/fontes/mercadolivre.js)
  if (id === "mercadolivre") return mercadolivre.ativa(env) ? produtosDaLojaML(env, pagina, POR_PAGINA, cat) : null;
  const [rede, ...resto] = id.split(":");
  const chave = resto.join(":");
  if (rede === "lomadee" && chave && lomadee.ativa(env)) {
    const r = await produtosDaMarca(env, chave, pagina, POR_PAGINA);
    // Fotos que já sabemos que não abrem saem (ver lib/fotos.js)
    return r.nome ? { ...r, ofertas: await semFotosQuebradas(env.DB, r.ofertas, { waitUntil }), temMais: r.temMais && pagina < MAX_PAGINA } : null;
  }
  if (rede === "awin" && chave && env.DB) {
    // 04/11/2026 (Giovanni: na Lauri Esporte "vem milhares de anúncio só de tênis"): a loja manda cada numeração como um
    // produto e a lista era só por desconto, então as primeiras páginas eram o mesmo tênis em 10 tamanhos. Agora: um cartão
    // por modelo (lib/variacoes.js) e os tipos da loja se revezam (tênis, jaqueta, bota, camiseta…), cada um do maior
    // desconto para o menor. A ordem sai de uma consulta leve (id, título, categoria, desconto) de toda a loja; depois só
    // os 48 da página vêm completos
    const ordem = await ordemDaLoja(env.DB, chave);
    if (!ordem.length && pagina === 1) return null;
    const ids = ordem.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);
    if (!ids.length) return { nome: chave, ofertas: [], temMais: false };
    const { results } = await env.DB.prepare(`SELECT ${COLUNAS_OFERTA} FROM ofertas WHERE id IN (${ids.map(() => "?").join(",")})`)
      .bind(...ids).all();
    const porId = new Map(results.map((l) => [l.id, l]));
    const variados = ordens.get(chave)?.variados || new Set();
    const ofertas = await comHistorico(env.DB, ids.map((id) => porId.get(id)).filter(Boolean).map(linhaParaOferta)
      .map((o) => (variados.has(o.id) ? { ...o, titulo: semTamanho(o.titulo) } : o)));
    return { nome: ofertas[0]?.lojaNome || chave, ofertas, temMais: ordem.length > pagina * POR_PAGINA && pagina < MAX_PAGINA };
  }
  return null;
}

export async function onRequestGet({ request, env, waitUntil }) {
  const params = new URL(request.url).searchParams;
  const id = (params.get("id") || "").slice(0, 120);
  const pagina = Math.min(Math.max(parseInt(params.get("pagina"), 10) || 1, 1), MAX_PAGINA);
  // Atalho de categoria da loja Mercado Livre (?mlcat=MLB1051; 05/11/2026)
  const cat = /^MLB\d{1,12}$/.test(params.get("mlcat") || "") ? params.get("mlcat") : null;
  // Só uma categoria do site na loja Mercado Livre (?secao=Saúde)
  const secao = id === "mercadolivre" && params.has("secao") ? categoriaPorNome(params.get("secao").slice(0, 60))?.nome : null;
  if (id && params.has("secao") && !secao) return Response.json({ erro: "Categoria não encontrada" }, { status: 404 });
  // Só uma marca (?marca=samsung): marca fora da nossa lista não é atendida
  const filtro = id && params.has("marca") ? filtroDeMarca(params.get("marca")) : null;
  if (id && params.has("marca") && !filtro) return Response.json({ erro: "Marca não encontrada" }, { status: 404 });
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const chave = new Request(new URL(`/api/lojas?v=${VERSAO}${id ? `&id=${encodeURIComponent(id)}${secao ? `&secao=${encodeURIComponent(secao)}` : filtro ? `&marca=${encodeURIComponent(filtro.n)}` : `&pagina=${pagina}`}` : ""}${cat ? `&mlcat=${cat}` : ""}`, request.url));
  const guardada = cache && (await cache.match(chave));
  if (guardada) return paraNavegador(await respostaSemFotosQuebradas(env.DB, guardada, waitUntil));

  let resposta;
  if (!id) {
    const { lojas, completo } = await listarLojas(env);
    resposta = responder({ lojas }, completo ? LISTA_SEGUNDOS : 300);
    if (!completo) return resposta; // Lomadee fora do ar: não guarda
  } else {
    let dados;
    try {
      dados = secao ? (mercadolivre.ativa(env) ? await produtosDaSecaoNaLojaML(env, secao) : null) : await produtosDaLoja(env, id, pagina, waitUntil, cat, filtro);
    } catch (erro) {
      // 500 (o Cloudflare troca a resposta 502 pela página dele)
      return Response.json({ erro: "Não foi possível carregar os produtos desta loja agora", detalhe: String(erro?.message || erro).slice(0, 200) }, { status: 500 });
    }
    if (!dados) return Response.json({ erro: "Loja não encontrada" }, { status: 404 });
    const mapa = await carregarMapa(env).catch(() => null);
    let ofertas = marcarSecoes(await comCategoriaDaIa(env.DB, mapa ? aplicarMapa(dados.ofertas, mapa) : dados.ofertas));
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
    // Só a categoria pedida, pela categoria final de cada produto (a mesma que o site mostra)
    if (secao) {
      ofertas = ofertas.filter((o) => o.secao === secao);
      dados.completo = dados.completo && ofertas.length <= MAX_DA_MARCA; // sobrou produto fora da resposta: o "Ver mais" continua
      ofertas = ofertas.slice(0, MAX_DA_MARCA);
    }
    resposta = responder({ nome: dados.nome, ofertas, ...(secao && { secao, completo: Boolean(dados.completo) }), temMais: dados.temMais, ...(filtro && { marca: filtro.n, completo: Boolean(dados.completo) }), ...(dados.atalhos && { atalhos: dados.atalhos, total: dados.total }) }, PRODUTOS_SEGUNDOS);
  }
  if (cache) waitUntil(cache.put(chave, resposta.clone()));
  return paraNavegador(resposta);
}
