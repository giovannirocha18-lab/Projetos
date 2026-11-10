// GET /api/buscar?q=air+fryer  -> ofertas de todas as lojas ligadas
// GET /api/buscar               -> ofertas em destaque
// GET /api/buscar?pagina=2      -> mais ofertas em destaque (só das lojas que têm páginas, como a Shopee)
// GET /api/buscar?q=...&desde=10 -> mais resultados da busca, a partir da página 10 da Shopee
//                                   (a resposta traz em "mais" o pedaço de endereço para a próxima vez)
// GET /api/buscar?q=invictus&cat=Perfumes -> busca dentro da categoria escolhida no menu
// GET /api/buscar?q=oculos&loja=awin:calvin-klein -> busca só nessa loja (página da loja aberta; pedido do Giovanni, 28/10/2026)
//
// Roda nos servidores do Cloudflare (Pages Functions). É aqui que ficam as
// chaves das APIs, sem nunca chegarem ao navegador do visitante.
import { comCategoriaDaIa } from "../../lib/ia.js";
import { naoSaoDaBusca, semNaoBuscados, respostaSemNaoBuscados } from "../../lib/iaBusca.js";
import { exemplo } from "../../lib/fontes/exemplo.js";
import { curadoria } from "../../lib/fontes/curadoria.js";
import { shopee } from "../../lib/fontes/shopee.js";
import { awin } from "../../lib/fontes/awin.js";
import { aliexpress } from "../../lib/fontes/aliexpress.js";
import { lomadee } from "../../lib/fontes/lomadee.js";
import { mercadolivre } from "../../lib/fontes/mercadolivre.js";
import { registrarBusca, tendenciaAceitavel } from "../../lib/buscas.js";
import { naoContar } from "../../lib/naoContar.js";
import { historicoAoVivo, ehAoVivo, ehOfertaDeVerdade } from "../../lib/ofertas.js";
import { semFotosQuebradas, respostaSemFotosQuebradas } from "../../lib/fotos.js";
import { normalizar } from "../../lib/texto.js";
import { anotarNaFilaML, POUCOS_ML } from "../../lib/mlFila.js";
import { carregarMapa, aplicarMapa, aprenderCategorias, catsDaLoja } from "../../lib/mapaCategorias.js";
import { separarAcessorios, produtoBuscado } from "../../lib/relevancia.js";
import { corrigirBusca, acentuarBusca, buscaNasLojas } from "../../lib/vocabulario.js";
import { categoriaPorNome, categoriaDoProduto, termoNaCategoria, ordenarNaCategoria, marcarSecoes, contarNaCategoria, vitrineDaCategoria, montarVitrine } from "../../lib/categorias.js";

// Para ligar uma loja nova: criar lib/fontes/<loja>.js e incluir aqui.
// Mercado Livre desde 04/11/2026 (catálogo + preço de cada produto; ver lib/fontes/mercadolivre.js). Vem primeiro
// (pedido do Giovanni, 04/11/2026: "prioridade ao Mercado Livre nas buscas"): intercalar() começa cada rodada por ele
const FONTES_REAIS = [mercadolivre, curadoria, shopee, awin, aliexpress, lomadee];

// Mostrar o guardado e atualizar por trás (pedido do Giovanni, 21/10/2026): a resposta fica no cache do Cloudflare
// por até 1 dia, mas depois de FRESCO_MS ela é refeita em segundo plano. Quem buscar recebe na hora a guardada,
// e o próximo já recebe a nova. O navegador guarda só NAVEGADOR_SEGUNDOS (para ver a atualização logo).
// Era 1 hora; 6 horas desde 03/11/2026 (limite da Shopee: cada busca refeita gasta o limite)
const FRESCO_MS = 6 * 60 * 60 * 1000;
const GUARDAR_SEGUNDOS = 24 * 60 * 60;
const NAVEGADOR_SEGUNDOS = 10 * 60;
// Busca sem nenhuma oferta de verdade (03/11/2026, print "lisinha": 0 ofertas para o Giovanni, 143 para outra pessoa):
// a Shopee às vezes responde vazio sem dar erro, e esse "nada" ficava 1 dia no cache do Cloudflare daquela cidade e
// 10 min no navegador. Agora fica só 5 min no Cloudflare e nada no navegador
const VAZIA_SEGUNDOS = 5 * 60;
const vazia = (resposta) => resposta.headers.get("X-Total-Ofertas") === "0";
// Busca pronta do robô mais velha que 30 h ainda é mostrada (e refeita por trás) por até 7 dias
const VELHA_DEMAIS_MS = 7 * 24 * 60 * 60 * 1000;
// Mesma busca não é refeita 2 vezes ao mesmo tempo, nem de novo antes de 10 min (se a Shopee recusou, cada visitante
// pedia outra vez e gastava mais o limite). Vale dentro de cada servidor do Cloudflare
const atualizando = new Map(); // endereço -> quando começou
const PAUSA_ENTRE_ATUALIZACOES_MS = 10 * 60 * 1000;
// Última resposta completa de cada busca, guardada 7 dias no Cloudflare: se a Shopee recusar ("Rate limit exceeded"),
// o visitante recebe essa em vez da lista sem a Shopee (03/11/2026)
const RESERVA_SEGUNDOS = 7 * 24 * 60 * 60;
// Na busca digitada, cada chamada pede 6 páginas de cada loja ao mesmo tempo (Shopee: 48 cada) e responde logo: o site
// mostra esses e pede sozinho as próximas (desde=7, 13…) até ter uns 100 produtos de verdade. Antes o servidor só
// respondia com tudo pronto e a primeira busca levava 12–14 s. Eram 3 páginas no plano grátis (50 consultas externas
// por chamada); com o Workers Paid (23/10/2026) o limite é 1000.
const PAGINAS_POR_LOTE = 6;
// A 1ª resposta continua com 3 páginas: com 6, a AliExpress deixava a 1ª tela ~2 s mais lenta (23/10/2026). As
// seguintes (o site pede sozinho enquanto a pessoa já vê os produtos) vêm com 6
const PRIMEIRO_LOTE = 3;
const MINIMO_PRODUTOS = 100;
// Vitrine das categorias: cada busca (4 a 6) pede 2 páginas ao mesmo tempo por chamada (o site pede as próximas sozinho)
const PAGINAS_VITRINE = 2;
// Loja que demora mais que isso fica de fora desta resposta (as outras não esperam por ela)
const LIMITE_LOJA_MS = 8000;
// Lomadee: quando demora, segura a busca inteira até 8 s (air fryer, fone bluetooth e smart tv levavam ~9 s por causa dela;
// conferido em 26/10/2026) e quase sempre traz poucos produtos. Na busca ao vivo espera no máximo 5 s
const LIMITE_LOJA_LENTA_MS = { lomadee: 5000 };
// Para o robô que prepara as buscas populares ninguém está esperando: as lojas têm mais tempo
const LIMITE_LOJA_ROBO_MS = 10000;
// Buscas populares preparadas pelo robô da madrugada (/api/preparar-buscas) valem por até 30 horas
const VALIDADE_PRONTA_MS = 30 * 60 * 60 * 1000;
// Até onde o "Ver mais" vai (pagina= nas "Ofertas do dia", desde= na busca e na vitrine)
const MAX_PAGINA = 20;
const MAX_DESDE = 100;
// Trocar este número quando mudar o formato das respostas, para não servir as guardadas antes
const VERSAO_CACHE = 108; // 108: busca vazia não fica no cache ("lisinha"); 107: palavra de 3 letras só inteira ("dry" x "Dryko"), 03/11/2026; 106: 400 candidatos por loja; 105: até 100 da Awin; 104: candidatos da Awin de cada loja (Cama In Box), 02/11/2026
export const PAGINAS_INICIO_PRONTAS = 6;
// Como o site da AliExpress busca (estudado em 21/10/2026, pedido do Giovanni): ele descobre a CATEGORIA da busca
// ("celular" -> Celulares 5090301, "geladeira" -> 60203) e mostra os produtos dela. A API de afiliados só procura a
// palavra nos títulos ("celular" trazia capinhas, "geladeira" trazia peças). Então, como no site, pedimos também dentro
// das categorias dela que são da nossa categoria buscada. Códigos tirados das páginas de busca do site e conferidos na
// API (só os que trouxeram o produto certo; categorias de roupa e decoração ficaram de fora porque misturam muito).
// Somam-se às que o mapa aprende sozinho (lib/mapaCategorias.js).
const CATS_ALIEXPRESS = {
  Pets: ["200003696", "200003700"],
  "Bebês": ["31006", "200000317", "200200150"],
  Perfumes: ["202236605", "202236604"],
  Maquiagem: ["200001129", "200001143"],
  Skincare: ["200001278", "201206503", "200004021"],
  Cabelo: ["200001211", "200263142", "201219502"],
  "Fones de ouvido": ["63705", "202231208"],
  Carregadores: ["410204"],
  "Acessórios de celular": ["380230", "202229005", "200002107"],
  "Relógios": ["200034143", "200363144"],
  Smartwatches: ["200003487"],
  "Joias e bijuterias": ["200000162", "200001694", "200001695", "200001700"],
  "Óculos": ["33902", "202213405"],
  "Calçados": ["200000963", "200000968"],
  "Bolsas e mochilas": ["152401", "201339608", "100002856"],
  "Moda íntima": ["200574005"],
  "Eletroportáteis": ["100000143", "200391143", "64301"],
  "Eletrodomésticos": ["60203", "201332907", "200005125"],
  "Mesa posta": ["201899807"],
  "Móveis": ["37032002", "37034002"],
  Cozinha: ["15230303", "201169306"],
  "Cama e banho": ["40604", "100000394", "40601"],
  "Esporte e fitness": ["200001967"],
  "Iluminação LED": ["390402", "200001051"],
  Limpeza: ["151408", "201338906", "202214807", "200367156"],
  Brinquedos: ["201270180", "2622"],
  "Informática": ["70805"],
  "Caixas de som": ["518"],
  Ferramentas: ["141705", "141711"],
  Celulares: ["5090301"],
  Automotivo: ["200000302", "200003367"],
};

// Uma oferta de cada loja por vez (Shopee, AliExpress, Shopee…), para nenhuma loja ficar só no fim da lista
function intercalar(listas) {
  const saida = [];
  for (let i = 0; i < Math.max(0, ...listas.map((l) => l.length)); i++) {
    for (const lista of listas) if (i < lista.length) saida.push(lista[i]);
  }
  return saida;
}

function responder(dados, status = 200) {
  // Busca pronta já vem como texto do banco: não precisa desmontar e montar de novo
  return new Response(typeof dados === "string" ? dados : JSON.stringify(dados), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": `public, max-age=${status === 200 ? NAVEGADOR_SEGUNDOS : 0}`,
      "X-Robots-Tag": "noindex",
    },
  });
}

const comLimite = (promessa, ms) => Promise.race([promessa,
  new Promise((_, falha) => setTimeout(() => falha(new Error(`demorou mais de ${ms / 1000} s`)), ms))]);

// Cópia para o cache do Cloudflare: vale 1 dia lá e leva a hora em que a busca foi feita nas lojas
function paraGuardar(resposta, criado = Date.now(), segundos = GUARDAR_SEGUNDOS) {
  const copia = new Response(resposta.body, resposta);
  copia.headers.set("Cache-Control", `public, max-age=${vazia(resposta) ? VAZIA_SEGUNDOS : segundos}`);
  copia.headers.set("X-Criado", String(criado));
  return copia;
}

// Resposta guardada indo para o navegador: ele guarda pouco tempo
function paraNavegador(resposta) {
  const copia = new Response(resposta.body, resposta);
  copia.headers.set("Cache-Control", `public, max-age=${vazia(resposta) ? 0 : NAVEGADOR_SEGUNDOS}`);
  return copia;
}

// Buscas prontas ficam compactadas (gzip, ~10x menores) e só da versão atual. A tabela antiga (texto puro, sem
// limpeza: cada versão nova somava ~300 buscas de até 900 KB) encheu os 500 MB do D1 em 22/10/2026 e foi apagada.
const TABELA_PRONTAS = "buscas_prontas_gz";
let prontasArrumadas = false;
async function criarTabelaProntas(db) {
  if (prontasArrumadas) return;
  // Apaga a tabela antiga primeiro: com o banco cheio, nem a tabela nova conseguia ser criada
  await db.batch([
    db.prepare("DROP TABLE IF EXISTS buscas_prontas"),
    db.prepare(`CREATE TABLE IF NOT EXISTS ${TABELA_PRONTAS} (chave TEXT PRIMARY KEY, resposta BLOB NOT NULL,
      total INTEGER NOT NULL, criado INTEGER NOT NULL, versao INTEGER NOT NULL)`),
    db.prepare(`DELETE FROM ${TABELA_PRONTAS} WHERE versao <> ? OR criado < ?`).bind(VERSAO_CACHE, Date.now() - VELHA_DEMAIS_MS),
  ]);
  prontasArrumadas = true;
}

const compactar = async (texto) =>
  new Uint8Array(await new Response(new Blob([texto]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer());
const descompactar = (bytes) =>
  new Response(new Blob([new Uint8Array(bytes)]).stream().pipeThrough(new DecompressionStream("gzip"))).text();

// "awin:calvin-klein" -> { id, rede: "awin", chave: "calvin-klein" }; rede = nome da fonte (lib/fontes/<rede>.js)
function lojaDaBusca(id) {
  const [rede, ...resto] = String(id || "").trim().slice(0, 120).split(":");
  const chave = resto.join(":");
  if (rede === "shopee" || rede === "aliexpress" || rede === "mercadolivre") return { id: rede, rede, chave: null };
  if ((rede === "awin" || rede === "lomadee") && chave) return { id: `${rede}:${chave}`, rede, chave };
  return null;
}

export async function onRequestGet({ request, env, waitUntil }) {
  // O robô (/api/preparar-buscas) passa preparar = true: busca de novo nas lojas e guarda a resposta no banco
  const preparar = Boolean(env.__PREPARAR);
  // Atualização por trás de uma busca guardada que passou de FRESCO_MS: busca nas lojas e regrava o cache
  const atualizar = Boolean(env.__ATUALIZAR);
  const limiteDe = (fonte) => (preparar ? LIMITE_LOJA_ROBO_MS : LIMITE_LOJA_LENTA_MS[fonte.nome] || LIMITE_LOJA_MS);
  const inicio = Date.now();
  const params = new URL(request.url).searchParams;
  // Erros comuns de digitação são trocados antes de buscar ("eletrolux" -> "electrolux"); a resposta traz o q
  // corrigido e o site avisa. exato=1 = "Buscar por eletrolux mesmo". sugestao = "Você quis dizer…?" (não troca sozinho)
  const digitado = (params.get("q") || "").trim().slice(0, 100);
  const { q, sugestao } = params.has("exato") ? { q: acentuarBusca(digitado), sugestao: null } : corrigirBusca(digitado);
  const pagina = Math.min(Math.max(parseInt(params.get("pagina"), 10) || 1, 1), MAX_PAGINA);
  const desde = Math.min(Math.max(parseInt(params.get("desde"), 10) || 1, 1), MAX_DESDE);
  // Busca dentro de uma loja (id como em /api/lojas: shopee, aliexpress, mercadolivre, awin:<loja>, lomadee:<marca>). A categoria não vale junto
  const soLoja = q ? lojaDaBusca(params.get("loja")) : null;
  const categoria = q && !soLoja ? categoriaPorNome(params.get("cat")) : null;

  // Conta a busca para os "em alta" da semana, sem atrasar a resposta.
  // Clique num atalho não conta: senão o atalho se manteria em alta sozinho.
  // O IP só serve para contar cada pessoa uma vez por termo por dia (ver lib/buscas.js); não é guardado.
  const contar = (resposta) => {
    if (q && pagina === 1 && desde === 1 && !params.has("atalho") && !naoContar(request) && Number(resposta.headers.get("X-Total-Ofertas")) > 0) {
      waitUntil(registrarBusca(env, q, request.headers.get("CF-Connecting-IP")).catch(() => {}));
    }
    return resposta;
  };

  // Guarda as respostas (ver FRESCO_MS) para responder na hora e não gastar o limite das APIs
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const chave = new Request(new URL(`/api/buscar?v=${VERSAO_CACHE}&q=${encodeURIComponent(q.toLowerCase())}${categoria ? `&cat=${encodeURIComponent(categoria.nome)}` : ""}${soLoja ? `&loja=${encodeURIComponent(soLoja.id)}` : ""}${pagina > 1 ? `&pagina=${pagina}` : ""}${desde > 1 ? `&desde=${desde}` : ""}`, request.url));
  // Refaz a busca nas lojas em segundo plano (sem contar como busca)
  const refazerPorTras = (criado) => {
    if (preparar || atualizar || Date.now() - criado < FRESCO_MS) return;
    if (Date.now() - (atualizando.get(chave.url) || 0) < PAUSA_ENTRE_ATUALIZACOES_MS) return;
    if (atualizando.size > 5000) atualizando.clear();
    atualizando.set(chave.url, Date.now());
    waitUntil(onRequestGet({ request, env: { ...env, __ATUALIZAR: true }, waitUntil }).catch(() => {}));
  };
  // contar=1: o site usou a busca que adiantou enquanto a pessoa digitava; só falta contar para os "em alta"
  const soContar = params.has("contar");
  const guardada = !preparar && !atualizar && cache && (await cache.match(chave));
  if (guardada) {
    if (soContar) { contar(guardada); return new Response(null, { status: 204 }); }
    refazerPorTras(Number(guardada.headers.get("X-Criado")) || 0);
    return contar(paraNavegador(await respostaSemNaoBuscados(env.DB, q, await respostaSemFotosQuebradas(env.DB, guardada, waitUntil))));
  }
  // Busca popular já preparada pelo robô: responde na hora (e guarda no cache por 1 hora)
  // Vale para as buscas populares e para as "Ofertas do dia" da página inicial (q vazio, 1ª página)
  // As primeiras páginas das "Ofertas do dia" também ficam prontas (29/10/2026: "Ver mais ofertas" levava ~4,5 s por página)
  const primeira = desde === 1 && (pagina === 1 || (!q && pagina <= PAGINAS_INICIO_PRONTAS));
  if (primeira && !preparar && !atualizar && env.DB) {
    try {
      const pronta = await env.DB.prepare(`SELECT resposta, total, criado FROM ${TABELA_PRONTAS} WHERE chave = ?`).bind(chave.url).first();
      if (pronta && Date.now() - pronta.criado < VELHA_DEMAIS_MS) {
        const resposta = responder(await descompactar(pronta.resposta));
        resposta.headers.set("X-Total-Ofertas", String(pronta.total));
        resposta.headers.set("X-Pronta", "1");
        if (soContar) { contar(resposta); return new Response(null, { status: 204 }); }
        // Mais velha que 30 h (o robô não rodou): vai para o cache como vencida, então já é refeita por trás
        const criado = Date.now() - pronta.criado < VALIDADE_PRONTA_MS ? pronta.criado : 0;
        if (cache) waitUntil(cache.put(chave, paraGuardar(resposta.clone(), criado)).catch(() => {}));
        refazerPorTras(criado);
        return contar(await respostaSemNaoBuscados(env.DB, q, await respostaSemFotosQuebradas(env.DB, resposta, waitUntil)));
      }
    } catch {
      // tabela ainda não existe (o robô cria): segue buscando nas lojas
    }
  }
  // Nada guardado para contar: não vale buscar de novo nas lojas só para isso
  if (soContar) return new Response(null, { status: 204 });

  const ligadas = await Promise.all(FONTES_REAIS.map((f) => f.ativa(env)));
  const reais = FONTES_REAIS.filter((_, i) => ligadas[i]);
  // Enquanto nenhuma API estiver ligada, usa os produtos de exemplo
  // Da 2ª página em diante, só as lojas que têm mais páginas de destaques
  const fontes = (reais.length ? reais : [exemplo]).filter((f) => (pagina === 1 || f.porPagina) && (!soLoja || f.nome === soLoja.rede));

  // Categorias das lojas que já sabemos traduzir para as nossas (ver lib/mapaCategorias.js)
  const mapa = await carregarMapa(env);
  const lojas = {};
  const consultar = async (termo, opcoesDaBusca) => {
    if (soLoja) opcoesDaBusca = { ...opcoesDaBusca, soLoja: soLoja.chave };
    // A loja pode buscar também dentro das categorias dela que já sabemos serem da categoria do que foi buscado
    const catBusca = termo ? categoriaDoProduto(termo) : null;
    // resto = a busca sem o nome da categoria ("celular samsung" -> "samsung"; "celular" -> ""): dentro da categoria
    // da loja, o produto só precisa citar o resto
    const nomeDaCategoria = catBusca ? new Set(`${catBusca.busca} ${catBusca.chave || ""}`.split(" ").map(normalizar).filter(Boolean)) : null;
    const resto = catBusca ? normalizar(termo).split(" ").filter((p) => p && !nomeDaCategoria.has(p) && !nomeDaCategoria.has(p.replace(/e?s$/, ""))).join(" ") : "";
    const opcoes = catBusca ? { ...opcoesDaBusca, catsDaLoja: Object.assign((loja) => catsDaLoja(mapa, loja, catBusca.nome),
      { CONHECIDAS_ALIEXPRESS: CATS_ALIEXPRESS[catBusca.nome], resto }) } : opcoesDaBusca;
    const resultados = await Promise.all(
      fontes.map(async (fonte) => {
        const t0 = Date.now();
        const medir = () => { if (lojas[fonte.nome]) lojas[fonte.nome].ms = Math.max(Date.now() - t0, lojas[fonte.nome].ms || 0); };
        try {
          if (!termo) {
            const ofertas = await comLimite(fonte.destaques(env, pagina), limiteDe(fonte));
            lojas[fonte.nome] = { ok: true, total: ofertas.length };
            medir();
            return ofertas;
          }
          const paginas = opcoes?.paginas || [pagina];
          if (!fonte.porPagina) {
            // Lojas sem páginas (Awin, curadoria) vêm inteiras na primeira vez: uma consulta só por termo
            if (!paginas.includes(1)) return [];
            const ofertas = await comLimite(fonte.buscar(termo, env, 1, opcoes), limiteDe(fonte));
            lojas[fonte.nome] = { ok: lojas[fonte.nome]?.ok !== false, total: Math.max(ofertas.length, lojas[fonte.nome]?.total || 0) };
            medir();
            return ofertas;
          }
          // Prazo por página (10/11/2026, revisão): com um prazo só para o lote, a página lenta jogava fora as que já tinham
          // chegado. prazoMs = a loja pode desistir da parte lenta antes e devolver o que tem (Shopee: lista oficial do banco)
          const prazo = limiteDe(fonte);
          const comPrazo = { ...opcoes, prazoMs: prazo - 1000 };
          const porPagina = await Promise.allSettled(paginas.map((p) => comLimite(fonte.buscar(termo, env, p, comPrazo), prazo)));
          // Uma página falhou: a loja conta como em erro, mas o que as outras páginas trouxeram não se perde
          const falha = porPagina.find((r) => r.status === "rejected");
          if (falha) {
            const erro = falha.reason instanceof Error ? falha.reason : new Error(String(falha.reason));
            erro.parciais = porPagina.flatMap((r) => (r.status === "fulfilled" ? r.value : r.reason?.parciais || []));
            throw erro;
          }
          const listas = porPagina.map((r) => r.value);
          const vistos = new Set();
          const ofertas = listas.flat().filter((o) => !vistos.has(o.id) && vistos.add(o.id));
          // total = tamanho da última página (cheia = a loja tem mais). Na vitrine (várias buscas) vale a que trouxe mais
          // 10/11/2026 (revisão): a página chega já filtrada (títulos fora da busca, produto sem preço), então o tamanho dela
          // não diz se a loja acabou; a loja que sabe avisa com lista.temMais (AliExpress e Mercado Livre) e o "Ver mais" continua
          const ultima = listas.at(-1);
          const tamanho = ultima.temMais === true ? Math.max(ultima.length, fonte.porPagina)
            : ultima.temMais === false ? Math.min(ultima.length, fonte.porPagina - 1) : ultima.length;
          lojas[fonte.nome] = { ok: lojas[fonte.nome]?.ok !== false, total: Math.max(tamanho, lojas[fonte.nome]?.total || 0) };
          medir();
          return ofertas;
        } catch (erro) {
          // Uma loja fora do ar não derruba a busca nas outras. erro.parciais = o que a loja ainda conseguiu trazer
          // (Shopee recusando: os produtos da lista oficial guardada no banco, lib/shopeeLista.js)
          lojas[fonte.nome] = { ok: false, erro: String(erro.message || erro) };
          medir();
          return Array.isArray(erro?.parciais) ? erro.parciais : [];
        }
      }),
    );
    return comCategoriaDaIa(env.DB, aplicarMapa(intercalar(resultados), mapa));
  };

  // Busca digitada: pede páginas de 3 em 3 até ter produtos suficientes (ver MINIMO_PRODUTOS).
  // termos = o que foi digitado (e, na categoria, "invictus perfume"); contar = quantos produtos de verdade
  // há entre os que chegaram nesta rodada (conta só os novos: refazer a lista toda a cada rodada gastava CPU)
  // porLote: páginas de cada termo por rodada (3+ buscas juntas, como "bateria carro", pedem 1 cada)
  const buscarAteEncher = async (termos, contar, porLote = desde === 1 ? PRIMEIRO_LOTE : PAGINAS_POR_LOTE) => {
    const juntas = [];
    const vistos = new Set();
    let produtos = 0;
    let pag = desde;
    let acabou = false;
    do {
      const paginas = Array.from({ length: porLote }, (_, i) => pag + i);
      for (const l of Object.values(lojas)) l.total = 0;
      const listas = await Promise.all(termos.map((t) => consultar(t, { paginas })));
      const novas = listas.flat().filter((o) => !vistos.has(o.id) && vistos.add(o.id));
      juntas.push(...novas);
      produtos += contar(novas);
      pag += porLote;
      acabou = !fontes.some((f) => f.porPagina && lojas[f.nome]?.total >= f.porPagina);
    } while (!acabou && pag - desde < porLote && produtos < MINIMO_PRODUTOS);
    return { juntas, proxima: acabou || pag > MAX_DESDE ? null : pag };
  };
  let mais = null;

  // Abriu uma categoria: vitrine com os produtos em alta (várias buscas, mais vendidos primeiro)
  const vitrine = vitrineDaCategoria(q, categoria);
  // O que foi buscado é claramente de outra categoria ("air fryer mondial" com Cabelo aberta mostrava só secadores
  // Mondial; print do Giovanni, 19/10/2026): busca em todas e o site avisa
  const daBusca = categoria && !vitrine ? categoriaDoProduto(q) : null;
  const outraCategoria = Boolean(daBusca) && daBusca.nome !== categoria.nome;
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
      const paginas = Array.from({ length: PAGINAS_VITRINE }, (_, i) => pag + i);
      const novas = await Promise.all(vitrine.buscas.map((termo) => consultar(termo, { maisVendidos: true, paginas })));
      novas.forEach((lista, i) => marcadas[i].push(...separarAcessorios(lista, vitrine.buscas[i])));
      pag += PAGINAS_VITRINE;
      acabou = !fontes.some((f) => f.porPagina && lojas[f.nome]?.total >= f.porPagina);
      ofertas = montarVitrine(marcadas, vitrine, categoria);
    } while (!acabou && pag - desde < PAGINAS_VITRINE && ofertas.length < MINIMO_PRODUTOS);
    ofertas = marcarSecoes(ofertas, categoria);
    mais = acabou || pag > MAX_DESDE ? null : `desde=${pag}`;
  } else if (categoria && !outraCategoria) {
    // Dentro de uma categoria: o que foi digitado + (se a categoria tem chave) "invictus perfume";
    // fica só o que não é de outra categoria, o que é dela primeiro. Se nada sobrar, busca em tudo (e o site avisa).
    const extra = termoNaCategoria(q, categoria);
    const { juntas, proxima } = await buscarAteEncher(extra ? [extra, q] : [q],
      (novas) => contarNaCategoria(separarAcessorios(novas, q), categoria));
    ofertas = ordenarNaCategoria(separarAcessorios(juntas, q), categoria);
    if (!ofertas.some((o) => o.naCategoria) && desde === 1) {
      ofertas = marcarSecoes(separarAcessorios(juntas, q), null, categoriaDoProduto(q), produtoBuscado(q));
      foraDaCategoria = ofertas.length > 0;
    }
    mais = proxima && `desde=${proxima}`;
  } else if (q) {
    // Na busca, acessórios ("tapete para air fryer") vão para o fim e o site os esconde
    // "tv" pesquisa "smart tv" nas lojas; "bateria carro", várias buscas com marca/amperagem (ver buscaNasLojas)
    const { buscas, termo, precoMin } = buscaNasLojas(q);
    const separar = (lista) => separarAcessorios(lista, termo, { precoMin });
    const { juntas, proxima } = await buscarAteEncher(buscas, (novas) => separar(novas).filter((o) => !o.acessorio).length,
      buscas.length > 2 ? 1 : undefined);
    ofertas = marcarSecoes(separar(juntas), null, categoriaDoProduto(q), produtoBuscado(termo));
    foraDaCategoria = outraCategoria;
    mais = proxima && `desde=${proxima}`;
  } else {
    ofertas = await consultar(q);
  }
  // "Ofertas do dia": a próxima página
  if (!q) {
    mais = pagina < MAX_PAGINA && fontes.some((f) => f.porPagina && lojas[f.nome]?.total >= f.porPagina) ? `pagina=${pagina + 1}` : null;
  }
  // O que a IA disse não ser o produto buscado vai para "Ver também… produtos parecidos" (ver lib/iaBusca.js)
  if (q) ofertas = semNaoBuscados(ofertas, await naoSaoDaBusca(env.DB, q));
  // Lomadee: tira as fotos que já sabemos que não abrem (ver lib/fotos.js); nas buscas prontas do robô, testa antes
  ofertas = await semFotosQuebradas(env.DB, ofertas, { esperar: Boolean(preparar), waitUntil });
  // Shopee e AliExpress: junta o histórico de preço e guarda o preço de hoje (sem atrasar a resposta).
  // É o que permite o selo "Desconto real" (ex.: na Black Friday). Banco fora do ar não derruba a busca.
  if (env.DB && ofertas.some(ehAoVivo)) {
    try {
      // Guarda o preço de hoje de todos os produtos que mudaram (eram só 60 por busca no plano grátis do D1; com o
      // Workers Paid, 23/10/2026, todos: mais produtos ganham histórico e o selo "Desconto real" a tempo da Black Friday)
      const vivo = await historicoAoVivo(env.DB, ofertas);
      ofertas = vivo.ofertas;
      waitUntil(vivo.gravar().catch(() => {}));
    } catch {
      // tabela precos ainda não existe (o robô cria) ou D1 indisponível
    }
  }
  // "Ofertas do dia" só com oferta de verdade (ver ehOfertaDeVerdade em lib/ofertas.js): desconto confirmado pelo nosso
  // histórico primeiro, depois o desconto da loja entre 5% e 75%. Os mais vendidos sem desconto ficam de fora
  if (!q && reais.length) {
    const deVerdade = ofertas.filter(ehOfertaDeVerdade);
    ofertas = [...deVerdade.filter((o) => o.historico?.descontoReal), ...deVerdade.filter((o) => !o.historico?.descontoReal)];
  }

  // Toda busca feita nas lojas ensina o mapa de categorias (catsLoja e catMapa ficam na resposta para conferência).
  // Quanto mais buscas diferentes, menos o mapa erra (uma categoria da loja vista só em buscas de óculos virava "Óculos").
  // De 22 a 23/10/2026 só o robô ensinava (limite grátis do D1); com o Workers Paid voltou a valer para todas
  if (env.DB) {
    const aprender = aprenderCategorias(env.DB, ofertas).catch(() => {});
    if (preparar) await aprender;
    else waitUntil(aprender);
  }
  ofertas = ofertas.map(({ catLojaNome, ...o }) => o);

  // Mercado Livre incompleto nesta busca (recusou ou veio pouco): vai para a fila do robô da madrugada (lib/mlFila.js)
  // Só busca que trouxe produtos e passa no filtro das tendências (10/11/2026, revisão: termos inventados enchiam a fila e o
  // robô gastava a madrugada do ML neles)
  if (q && pagina === 1 && desde === 1 && !preparar && !atualizar && !soLoja && env.DB && lojas.mercadolivre && reais.length
    && ofertas.length >= 5 && tendenciaAceitavel(q)
    && (!lojas.mercadolivre.ok || ofertas.filter((o) => o.loja === "mercadolivre").length < POUCOS_ML)) {
    waitUntil(anotarNaFilaML(env.DB, q).catch(() => {}));
  }
  const resposta = responder({
    q,
    sugestao,
    categoria: categoria && !foraDaCategoria ? categoria.nome : null,
    loja: soLoja?.id || null,
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
  // Sem nenhuma oferta: o navegador não guarda. Com loja em erro (03/11/2026: Shopee "Rate limit exceeded" enquanto o
  // robô prepara as buscas prontas), guarda só 1 minuto, para a próxima tentativa já trazer a loja de volta
  if (!ofertas.length) resposta.headers.set("Cache-Control", "public, max-age=0");
  else if (!todasOk) resposta.headers.set("Cache-Control", "public, max-age=60");
  if (cache && todasOk) await cache.put(chave, paraGuardar(resposta.clone()));
  // Só uma loja menor falhou (a Lomadee trava bastante) e a Shopee respondeu: guarda 1 hora, marcada como velha (o
  // próximo visitante recebe na hora e ela é refeita por trás). Antes não guardava e cada visitante ia de novo às lojas
  else if (cache && lojas.shopee?.ok && ofertas.length) await cache.put(chave, paraGuardar(resposta.clone(), 0, 60 * 60));
  const chaveReserva = new Request(`${chave.url}&reserva=1`);
  if (cache && todasOk && ofertas.length) {
    const reserva = new Response(resposta.clone().body, resposta);
    reserva.headers.set("Cache-Control", `public, max-age=${RESERVA_SEGUNDOS}`);
    waitUntil(cache.put(chaveReserva, reserva).catch(() => {}));
  }
  // A Shopee recusou: entrega a última resposta completa desta busca, se houver (o navegador guarda só 1 minuto)
  if (cache && !preparar && !atualizar && lojas.shopee && !lojas.shopee.ok) {
    const reserva = await cache.match(chaveReserva).catch(() => null);
    if (reserva) {
      const copia = new Response(reserva.body, reserva);
      copia.headers.set("Cache-Control", "public, max-age=60");
      copia.headers.set("X-Reserva", "1");
      return contar(copia);
    }
  }
  // Busca pronta: guarda mesmo que uma loja pequena tenha falhado (vindo do robô do GitHub, a Lomadee às vezes
  // trava), desde que a Shopee tenha respondido
  const prontaOk = lojas.shopee?.ok && ofertas.length > 0;
  if (preparar && primeira && prontaOk && reais.length && env.DB) {
    await criarTabelaProntas(env.DB);
    await env.DB.prepare(`INSERT OR REPLACE INTO ${TABELA_PRONTAS} (chave, resposta, total, criado, versao) VALUES (?, ?, ?, ?, ?)`)
      .bind(chave.url, await compactar(await resposta.clone().text()), ofertas.length, Date.now(), VERSAO_CACHE).run();
  }
  if (preparar || atualizar) return resposta; // o robô e a atualização por trás não contam como busca em alta
  return contar(resposta);
}
