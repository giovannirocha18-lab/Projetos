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
import { naoSaoDaBusca, semNaoBuscados, semBrinquedos, respostaSemNaoBuscados } from "../../lib/iaBusca.js";
import { semPrecoAbsurdo, marcarUsados } from "../../lib/lojasRemovidas.js";
import { fotosErradas, semFotosErradas } from "../../lib/iaFotos.js";
import { exemplo } from "../../lib/fontes/exemplo.js";
import { curadoria } from "../../lib/fontes/curadoria.js";
import { shopee } from "../../lib/fontes/shopee.js";
import { awin } from "../../lib/fontes/awin.js";
import { aliexpress } from "../../lib/fontes/aliexpress.js";
import { lomadee } from "../../lib/fontes/lomadee.js";
import { mercadolivre } from "../../lib/fontes/mercadolivre.js";
import { registrarBusca, tendenciaAceitavel, semProdutoAVenda, anotarSemProduto } from "../../lib/buscas.js";
import { POUCAS_MIN, anotarPoucas, tirarDasPoucas } from "../../lib/poucas.js";
import { anotarSinal } from "../../lib/sinais.js";
import { naoContar } from "../../lib/naoContar.js";
import { historicoAoVivo, ehAoVivo, ehOfertaDeVerdade } from "../../lib/ofertas.js";
import { semFotosQuebradas, respostaSemFotosQuebradas } from "../../lib/fotos.js";
import { normalizar } from "../../lib/texto.js";
import { anotarNaFilaML } from "../../lib/mlFila.js";
import { carregarMapa, aplicarMapa, aprenderCategorias, catsDaLoja } from "../../lib/mapaCategorias.js";
import { separarAcessorios, produtoBuscado } from "../../lib/relevancia.js";
import { criarFila } from "../../lib/fila.js";
import { corrigirBusca, acentuarBusca, buscaNasLojas, buscaSoDeConsole, pluralDeUmaPalavra, limparBusca } from "../../lib/vocabulario.js";
import { categoriaPorNome, categoriaDoProduto, termoNaCategoria, ordenarNaCategoria, soDaCategoria, marcarSecoes, contarNaCategoria, vitrineDaCategoria, montarVitrine } from "../../lib/categorias.js";

// Para ligar uma loja nova: criar lib/fontes/<loja>.js e incluir aqui.
// Mercado Livre desde 04/11/2026 (catálogo + preço de cada produto; ver lib/fontes/mercadolivre.js). Vem primeiro
// (pedido do Giovanni, 04/11/2026: "prioridade ao Mercado Livre nas buscas"): intercalar() começa cada rodada por ele
const FONTES_REAIS = [mercadolivre, curadoria, shopee, awin, aliexpress, lomadee];

// Mostrar o guardado e atualizar por trás (pedido do Giovanni, 21/10/2026): a resposta fica no cache do Cloudflare
// por até 1 dia, mas depois de FRESCO_MS ela é refeita em segundo plano. Quem buscar recebe na hora a guardada,
// e o próximo já recebe a nova. O navegador guarda só NAVEGADOR_SEGUNDOS (para ver a atualização logo).
// Era 1 hora; 6 horas desde 03/11/2026 (limite da Shopee: cada busca refeita gasta o limite)
const FRESCO_MS = 6 * 60 * 60 * 1000;
// Vitrine de categoria mudada (19/11/2026, "tênis olympikus" em Calçados; Giovanni: a marca não aparecia): a lista guardada
// antes disto é refeita na 1ª visita, sem esperar as 6 horas. Ao mudar a vitrine de uma categoria, pôr aqui a data e o nome
const CARRO_2111 = Date.UTC(2026, 10, 23, 18, 50); // 23/11 18:50: livro fora de Limpeza/Bonés; 18:25: varredura das 40 categorias (palavra com outro sentido); antes: 23/11: espelho de moto/carro fora de Decoração (era 21/11 13:20, coisa de carro só em Automotivo): todas as vitrines refeitas
const VITRINES_DESDE = new Proxy({}, { get: () => CARRO_2111 });
const NUMERO_DESDE = Date.UTC(2026, 10, 22, 15, 4); // 22/11: número depois de iOS/Android/Windows não é modelo
const CONSOLES_DESDE = Date.UTC(2026, 10, 16, 20, 35); // 16/11: regra da outra geração também nos acessórios (print "ps5")
const GUARDAR_SEGUNDOS = 24 * 60 * 60;
const LIMPA_FRESCA_MS = 10 * 60 * 1000; // de quanto em quanto tempo a cópia limpa é conferida de novo com o banco
const NAVEGADOR_SEGUNDOS = 10 * 60;
// Busca sem nenhuma oferta de verdade (03/11/2026, print "lisinha": 0 ofertas para o Giovanni, 143 para outra pessoa):
// a Shopee às vezes responde vazio sem dar erro, e esse "nada" ficava 1 dia no cache do Cloudflare daquela cidade e
// 10 min no navegador. Agora fica só 5 min no Cloudflare e nada no navegador
// 16/11/2026 (Giovanni: "veja o porquê das buscas vazias"): a busca sem resultado esperava as lojas de novo a cada visita
// (3–6 s; com loja em erro nem era guardada). Agora fica 1 h no Cloudflare, sai na hora e é REFEITA POR TRÁS depois de
// 5 min (1 min se alguma loja estava em erro); se a refeita achar ofertas, troca a guardada. O navegador segue sem guardar
const VAZIA_SEGUNDOS = 60 * 60;
const VAZIA_FRESCA_MS = 5 * 60 * 1000;
const VAZIA_COM_ERRO_FRESCA_MS = 60 * 1000;
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
// Com o visitante esperando, 2,5 s (como o Mercado Livre): a Lomadee que não responde segurava a busca vazia em 6 s.
// A busca refeita por trás e o robô seguem com o prazo maior
const LIMITE_LOJA_LENTA_VISITANTE_MS = { lomadee: 2500 };
// PRIMEIRA TELA EM ~3 s (19/11/2026, auditoria antes do lançamento: busca nova levava 4–8 s, quase tudo esperando a
// AliExpress, 3,5–5,5 s, e a Shopee, que em pane segura 2,5 s e sem pane chega a 5–7 s). Na 1ª resposta de uma busca
// nova do visitante, essas duas têm 2,5 s (como o Mercado Livre e a Lomadee): o que não chegou fica de fora dessa resposta (parcial: true), a busca é refeita
// por trás na mesma hora com os prazos normais e o site pede o complemento sozinho (&completo=1, completarLojasAtrasadas
// em app.js). A resposta parcial também fica guardada: antes, com a Shopee em erro, NADA era guardado e cada visitante
// refazia a busca inteira (93 de 99 buscas novas seguiam lentas na 2ª visita)
const PRAZO_DA_PRIMEIRA_TELA_MS = { aliexpress: 2500, shopee: 2500 };
// Refeita por trás e ainda sem a Shopee: vale meia hora antes de tentar de novo (senão cada visita mandaria refazer)
const INCOMPLETA_FRESCA_MS = 30 * 60 * 1000;
// Para o robô que prepara as buscas populares ninguém está esperando: as lojas têm mais tempo
const LIMITE_LOJA_ROBO_MS = 10000;
// Buscas populares preparadas pelo robô da madrugada (/api/preparar-buscas) valem por até 30 horas
const VALIDADE_PRONTA_MS = 30 * 60 * 60 * 1000;
const PRONTA_DE_CATEGORIA_APOS_MS = 20 * 60 * 60 * 1000;
const PRONTA_SEM_SHOPEE_APOS_MS = 3 * 24 * 60 * 60 * 1000; // pronta mais velha que isso é trocada mesmo sem a Shopee
// Até onde o "Ver mais" vai (pagina= nas "Ofertas do dia", desde= na busca e na vitrine)
const MAX_PAGINA = 20;
const MAX_DESDE = 100;
// Trocar este número quando mudar o formato das respostas, para não servir as guardadas antes
export const VERSAO_CACHE = 108; // 108: busca vazia não fica no cache ("lisinha"); 107: palavra de 3 letras só inteira ("dry" x "Dryko"), 03/11/2026; 106: 400 candidatos por loja; 105: até 100 da Awin; 104: candidatos da Awin de cada loja (Cama In Box), 02/11/2026
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

// Lojas que a busca rápida (rapido=1) lê só do nosso banco, sem consultar a loja
const FONTES_DO_BANCO = new Set(["awin", "shopee", "mercadolivre"]);

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
  // Cópia sem alguma loja (X-Incompleta): o navegador guarda só 1 minuto, para logo receber a completa
  copia.headers.set("Cache-Control", `public, max-age=${vazia(resposta) ? 0 : resposta.headers.get("X-Incompleta") ? 60 : NAVEGADOR_SEGUNDOS}`);
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
  let prazoCurto = false; // 1ª resposta de uma busca nova do visitante (ver PRAZO_DA_PRIMEIRA_TELA_MS)
  const limiteDe = (fonte) => (preparar ? LIMITE_LOJA_ROBO_MS
    : (prazoCurto && PRAZO_DA_PRIMEIRA_TELA_MS[fonte.nome]) || (!atualizar && LIMITE_LOJA_LENTA_VISITANTE_MS[fonte.nome]) || LIMITE_LOJA_LENTA_MS[fonte.nome] || LIMITE_LOJA_MS);
  const inicio = Date.now();
  const params = new URL(request.url).searchParams;
  // Erros comuns de digitação são trocados antes de buscar ("eletrolux" -> "electrolux"); a resposta traz o q
  // corrigido e o site avisa. exato=1 = "Buscar por eletrolux mesmo". sugestao = "Você quis dizer…?" (não troca sozinho)
  const comoVeio = (params.get("q") || "").trim().slice(0, 100);
  const digitado = limparBusca(comoVeio);
  // Busca só de símbolos ou emoji ("!!!"): nada a procurar (antes ia às lojas por 8 s ou dava erro 500)
  if (comoVeio && !/[\p{L}\p{N}]/u.test(digitado)) {
    return Response.json({ q: comoVeio, sugestao: null, categoria: null, loja: null, foraDaCategoria: false, exemplo: false, ofertas: [], temMais: false, mais: null, lojas: {}, tempoMs: 0 },
      { headers: { "Cache-Control": "public, max-age=300", "X-Total-Ofertas": "0" } });
  }
  // 14/11/2026 (Giovanni: "a opção com a correção automática é melhor e passa mais segurança"): a marca parecida
  // ("playsation" -> "playstation") também é trocada sozinha; antes só aparecia o "Você quis dizer…?", que ele quase não viu.
  // O site mostra "Corrigimos … · Buscar como digitei" (exato=1 desfaz)
  const corrigida = params.has("exato") ? null : corrigirBusca(digitado);
  const qCorrigida = corrigida ? corrigida.sugestao || corrigida.q : acentuarBusca(digitado);
  const q = (!params.has("exato") && pluralDeUmaPalavra(qCorrigida)) || qCorrigida;
  const sugestao = null;
  const pagina = Math.min(Math.max(parseInt(params.get("pagina"), 10) || 1, 1), MAX_PAGINA);
  const desde = Math.min(Math.max(parseInt(params.get("desde"), 10) || 1, 1), MAX_DESDE);
  // Busca dentro de uma loja (id como em /api/lojas: shopee, aliexpress, mercadolivre, awin:<loja>, lomadee:<marca>). A categoria não vale junto
  const soLoja = q ? lojaDaBusca(params.get("loja")) : null;
  const categoria = q && !soLoja ? categoriaPorNome(params.get("cat")) : null;

  // Conta a busca para os "em alta" da semana, sem atrasar a resposta.
  // Clique num atalho não conta: senão o atalho se manteria em alta sozinho.
  // O IP só serve para contar cada pessoa uma vez por termo por dia (ver lib/buscas.js); não é guardado.
  // Monitor (lib/sinais.js, 21/11/2026): toda busca de visitante fica anotada por dia com o que veio, para a conferência
  // da madrugada achar as que saíram vazias, sem o produto, com poucas ofertas ou lentas
  const visitanteDeVerdade = q && pagina === 1 && desde === 1 && !params.has("atalho") && !params.has("completo") && !params.has("medir")
    && !params.has("rapido") && !preparar && !atualizar && !naoContar(request);
  const contar = (resposta) => {
    if (visitanteDeVerdade && resposta.status === 200) {
      waitUntil(anotarSinal(env, { q, cat: params.get("cat") || (params.get("loja") ? `loja:${params.get("loja")}` : ""),
        total: Number(resposta.headers.get("X-Total-Ofertas")) || 0, parcial: Boolean(resposta.headers.get("X-Parcial")) }).catch(() => {}));
    }
    if (q && pagina === 1 && desde === 1 && !params.has("atalho") && !naoContar(request) && Number(resposta.headers.get("X-Total-Ofertas")) > 0) {
      waitUntil(registrarBusca(env, q, request.headers.get("CF-Connecting-IP")).catch(() => {}));
    }
    return resposta;
  };

  // Guarda as respostas (ver FRESCO_MS) para responder na hora e não gastar o limite das APIs
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const chaveCheia = new Request(new URL(`/api/buscar?v=${VERSAO_CACHE}&q=${encodeURIComponent(q.toLowerCase())}${categoria ? `&cat=${encodeURIComponent(categoria.nome)}` : ""}${categoria && q && !vitrineDaCategoria(q, categoria) ? "&so=4" : ""}${soLoja ? `&loja=${encodeURIComponent(soLoja.id)}` : ""}${pagina > 1 ? `&pagina=${pagina}` : ""}${desde > 1 ? `&desde=${desde}` : ""}`, request.url));
  // rapido=1 (10/11/2026, ideia do Giovanni: "a Shopee já tem uma lista baixada, ela não serve?"): responde só com o que
  // está no nosso banco (lista oficial da Shopee, lojas da Awin e mais vendidos/catálogo do Mercado Livre), sem consultar
  // nenhuma loja: sai em menos de 1 s e não gasta o limite da Shopee. O site usa ao marcar uma marca (completarMarca em
  // app.js) e depois pede a busca completa. Se a completa já estiver guardada, vai ela mesma. Guardada em chave própria
  const rapido = Boolean(q) && params.has("rapido") && pagina === 1 && desde === 1 && !soLoja && !preparar && !atualizar;
  if (rapido && cache) {
    const cheia = await cache.match(chaveCheia);
    if (cheia) return paraNavegador(await respostaSemNaoBuscados(env.DB, q, await respostaSemFotosQuebradas(env.DB, cheia, waitUntil)));
  }
  const chave = rapido ? new Request(`${chaveCheia.url}&rapido=1`) : chaveCheia;
  // Refaz a busca nas lojas em segundo plano (sem contar como busca)
  const refazerPorTras = (criado, semOfertas = false) => {
    // Busca só do console ("xbox series", "ps5"…): a guardada antes de 13/11/2026 17h05 UTC não tem os consoles do Mercado
    // Livre (print do Giovanni: comparador vazio em "xbox series"); refaz já, sem esperar as 6 horas
    // (e busca com número, de modelo: a guardada antes de 22/11/2026 pode ter o número da versão do sistema contando
    // como modelo, print "iphone 18" com um iPhone 16 "iOS 18" no Menor preço)
    const semConsoles = (Boolean(q) && criado < CONSOLES_DESDE && buscaSoDeConsole(q)) || (criado < NUMERO_DESDE && /\d/.test(q))
      || Boolean(categoria && criado < (VITRINES_DESDE[categoria.nome] || 0) && vitrineDaCategoria(q, categoria));
    if (preparar || atualizar || (Date.now() - criado < (semOfertas ? VAZIA_FRESCA_MS : FRESCO_MS) && !semConsoles)) return;
    if (Date.now() - (atualizando.get(chave.url) || 0) < PAUSA_ENTRE_ATUALIZACOES_MS) return;
    if (atualizando.size > 5000) atualizando.clear();
    atualizando.set(chave.url, Date.now());
    waitUntil(trocarPelaPronta(criado).then((trocou) => trocou || onRequestGet({ request, env: { ...env, __ATUALIZAR: true }, waitUntil })).catch(() => {}));
  };
  // A cópia deste ponto do Cloudflare é mais velha que a busca pronta do banco (o robô refez a busca depois): troca pela
  // pronta em vez de ir às lojas. Sem isso, com a Shopee em erro a cópia velha ficava até vencer, porque a busca refeita
  // por trás sem a Shopee não substitui a guardada (13/11/2026, print do Giovanni: "xbox" abrindo com Xbox One Fat horas
  // depois de o robô ter guardado a lista nova)
  const trocarPelaPronta = async (criado) => {
    if (!cache || !env.DB || desde !== 1 || !(pagina === 1 || (!q && pagina <= PAGINAS_INICIO_PRONTAS))) return false;
    const nova = await env.DB.prepare(`SELECT criado FROM ${TABELA_PRONTAS} WHERE chave = ?`).bind(chave.url).first().catch(() => null);
    if (!nova || nova.criado <= criado + 60 * 1000) return false;
    const pronta = await env.DB.prepare(`SELECT resposta, total, criado FROM ${TABELA_PRONTAS} WHERE chave = ?`).bind(chave.url).first();
    if (!pronta) return false;
    const resposta = responder(await descompactar(pronta.resposta));
    resposta.headers.set("X-Total-Ofertas", String(pronta.total));
    resposta.headers.set("X-Pronta", "1");
    await cache.put(chave, paraGuardar(resposta.clone(), pronta.criado));
    await guardarLimpa(await limpar(resposta), pronta.criado);
    // 16/11/2026: a pronta mais nova entra mesmo já passada das 6 horas (Games: o ponto do Cloudflare seguia com a lista de
    // 37 ofertas de 27 h antes, com a pronta de 354 no banco havia 16 h, porque a busca refeita sem a Shopee não troca a
    // guardada). Sendo velha, devolve false para a busca também ser refeita nas lojas
    return Date.now() - pronta.criado <= FRESCO_MS;
  };
  // contar=1: o site usou a busca que adiantou enquanto a pessoa digitava; só falta contar para os "em alta"
  const soContar = params.has("contar");
  // Medidor (11/11/2026, Giovanni: categoria lenta na 1ª vez no celular): Server-Timing diz quanto levou cada etapa da
  // resposta guardada. medir=1 pula a cópia do Cloudflare (o caminho de quem é o 1º da cidade) e só lê a busca pronta do
  // banco: sem pronta responde 404, nunca vai às lojas
  const medir = params.has("medir") && !preparar && !atualizar;
  const etapas = [];
  let marco = Date.now();
  const etapa = (nome) => { etapas.push(`${nome};dur=${Date.now() - marco}`); marco = Date.now(); };
  const comTempos = (resposta) => {
    const copia = new Response(resposta.body, resposta);
    copia.headers.set("Server-Timing", [...etapas, `cidade;desc=${request.cf?.colo || "?"}`].join(", "));
    if (medir) copia.headers.set("Cache-Control", "no-store");
    return copia;
  };
  // Cópia "limpa" (11/11/2026, print do Giovanni: categoria "Buscando…" por segundos na 1ª vez no celular). Toda resposta
  // guardada passava, a cada visita, por consultas ao banco para tirar fotos quebradas e produtos que a IA reprovou; medido:
  // 1,2–2,8 s em Brinquedos (muita foto da Lomadee) mesmo ao lado do banco, e do Brasil cada consulta custa mais. Agora o
  // resultado dessa limpeza também fica guardado no Cloudflare e sai na hora, sem banco; passados 10 minutos, a visita
  // seguinte recebe a mesma cópia e a limpeza é refeita por trás
  const chaveLimpa = new Request(`${chave.url}&limpa=1`);
  const limpar = async (resposta) => {
    const semFotos = await respostaSemFotosQuebradas(env.DB, resposta, waitUntil);
    etapa("fotos");
    const limpa = await respostaSemNaoBuscados(env.DB, q, semFotos);
    etapa("ia");
    return limpa;
  };
  const guardarLimpa = async (limpa, criado, segundos) => {
    if (!cache) return;
    const copia = paraGuardar(limpa, criado, segundos);
    copia.headers.set("X-Limpa", String(Date.now()));
    await cache.put(chaveLimpa, copia).catch(() => {});
  };
  const refazerLimpa = async () => {
    const crua = await cache.match(chave);
    if (!crua) return cache.delete(chaveLimpa); // a cópia de origem venceu: a próxima visita monta tudo de novo
    await guardarLimpa(await limpar(crua.clone()), Number(crua.headers.get("X-Criado")) || 0);
  };
  // completo=1: o site pede o que faltou na 1ª resposta (parcial). Só lê a cópia guardada; enquanto a busca refeita por
  // trás não terminou responde 204 (o site tenta de novo em alguns segundos). Nunca vai às lojas
  if (params.has("completo") && !preparar && !atualizar) {
    const pronta = cache && (await cache.match(chave).catch(() => null));
    if (!pronta || pronta.headers.get("X-Parcial")) return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
    return paraNavegador(await limpar(pronta));
  }
  const usarGuardadas = !preparar && !atualizar && !medir && cache;
  const limpa = usarGuardadas && (await cache.match(chaveLimpa));
  etapa("limpa");
  if (limpa) {
    if (soContar) { contar(limpa); return new Response(null, { status: 204 }); }
    refazerPorTras(Number(limpa.headers.get("X-Criado")) || 0, vazia(limpa));
    if (Date.now() - (Number(limpa.headers.get("X-Limpa")) || 0) > LIMPA_FRESCA_MS) waitUntil(refazerLimpa().catch(() => {}));
    return contar(comTempos(paraNavegador(limpa)));
  }
  const guardada = usarGuardadas && (await cache.match(chave));
  etapa("copia");
  if (guardada) {
    if (soContar) { contar(guardada); return new Response(null, { status: 204 }); }
    const criado = Number(guardada.headers.get("X-Criado")) || 0;
    refazerPorTras(criado, vazia(guardada));
    const pronta = await limpar(guardada);
    waitUntil(guardarLimpa(pronta.clone(), criado));
    return contar(comTempos(paraNavegador(pronta)));
  }
  // Busca popular já preparada pelo robô: responde na hora (e guarda no cache por 1 hora)
  // Vale para as buscas populares e para as "Ofertas do dia" da página inicial (q vazio, 1ª página)
  // As primeiras páginas das "Ofertas do dia" também ficam prontas (29/10/2026: "Ver mais ofertas" levava ~4,5 s por página)
  const primeira = desde === 1 && (pagina === 1 || (!q && pagina <= PAGINAS_INICIO_PRONTAS));
  if (medir && !(primeira && env.DB)) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  if (primeira && !preparar && !atualizar && env.DB) {
    try {
      const pronta = await env.DB.prepare(`SELECT resposta, total, criado FROM ${TABELA_PRONTAS} WHERE chave = ?`).bind(chave.url).first();
      etapa("banco");
      if (pronta && Date.now() - pronta.criado < VELHA_DEMAIS_MS) {
        const resposta = responder(await descompactar(pronta.resposta));
        etapa("abrir");
        resposta.headers.set("X-Total-Ofertas", String(pronta.total));
        resposta.headers.set("X-Pronta", "1");
        resposta.headers.set("X-Criado", String(pronta.criado)); // a abertura das categorias pelo robô confere a idade
        if (soContar) { contar(resposta); return new Response(null, { status: 204 }); }
        // Mais velha que 30 h (o robô não rodou): vai para o cache como vencida, então já é refeita por trás
        const criado = Date.now() - pronta.criado < VALIDADE_PRONTA_MS ? pronta.criado : 0;
        if (cache && !medir) waitUntil(cache.put(chave, paraGuardar(resposta.clone(), criado)).catch(() => {}));
        if (!medir) refazerPorTras(criado);
        // Pronta da última noite (o robô já a gravou sem fotos quebradas nem reprovados): sai na hora, como veio do banco,
        // e a limpeza fica para trás (é o caminho do 1º visitante do dia em cada cidade)
        // 15/11/2026 (Giovanni: "dá erro nas primeiras buscas só"): a pronta com mais de 30 h também sai na hora; antes
        // passava pela limpeza no banco antes de responder (1–3 s a mais, do Brasil, na 1ª visita de cada cidade)
        if (cache && !medir) {
          waitUntil(limpar(resposta.clone()).then((l) => guardarLimpa(l, criado)).catch(() => {}));
          return contar(comTempos(resposta));
        }
        const limpa = await limpar(resposta);
        // medir=2: só os tempos e o ponto do Cloudflare que atendeu (para o Giovanni abrir no celular e mandar o print)
        if (params.get("medir") === "2") {
          return Response.json({ cidade: request.cf?.colo || "", etapas_ms: Object.fromEntries(etapas.map((x) => x.split(";dur=")).map(([n, v]) => [n, Number(v)])), total_ms: Date.now() - inicio },
            { headers: { "Cache-Control": "no-store" } });
        }
        return medir ? comTempos(limpa) : contar(comTempos(limpa));
      }
    } catch {
      // tabela ainda não existe (o robô cria): segue buscando nas lojas
    }
    if (medir) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  // Nada guardado para contar: não vale buscar de novo nas lojas só para isso
  if (soContar) return new Response(null, { status: 204 });

  etapa("guardadas");
  const ligadas = await Promise.all(FONTES_REAIS.map((f) => f.ativa(env)));
  const reais = FONTES_REAIS.filter((_, i) => ligadas[i]);
  // Enquanto nenhuma API estiver ligada, usa os produtos de exemplo
  // Da 2ª página em diante, só as lojas que têm mais páginas de destaques
  const fontes = (reais.length ? reais : [exemplo]).filter((f) => (pagina === 1 || f.porPagina) && (!soLoja || f.nome === soLoja.rede)
    && (!rapido || FONTES_DO_BANCO.has(f.nome)));

  // Categorias das lojas que já sabemos traduzir para as nossas (ver lib/mapaCategorias.js)
  // O que não depende das lojas começa junto com elas (19/11/2026: do ponto do Cloudflare ao banco, cada consulta custa
  // 100–400 ms, e estas vinham uma atrás da outra depois das lojas)
  const iaAntes = q ? naoSaoDaBusca(env.DB, q).catch(() => null) : null;
  const fotosAntes = fotosErradas(env.DB).catch(() => null);
  const mapa = await carregarMapa(env);
  etapa("mapa");
  const lojas = {};
  // Uma fila por pedido para Shopee, AliExpress e Lomadee: sobram vagas de conexão para o Mercado Livre (lib/fila.js)
  const fila = criarFila();
  const consultar = async (termo, opcoesDaBusca) => {
    if (soLoja) opcoesDaBusca = { ...opcoesDaBusca, soLoja: soLoja.chave };
    if (rapido) opcoesDaBusca = { ...opcoesDaBusca, soBanco: true };
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
          const comPrazo = { ...opcoes, prazoMs: prazo - 1000, visitante: !preparar && !atualizar, espera: waitUntil, fila };
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
          const etapas = listas.find((l) => l.etapas)?.etapas; // quanto levou cada parte dentro da loja (Mercado Livre)
          if (etapas) lojas[fonte.nome].etapas = etapas;
          medir();
          return ofertas;
        } catch (erro) {
          // Uma loja fora do ar não derruba a busca nas outras. erro.parciais = o que a loja ainda conseguiu trazer
          // (Shopee recusando: os produtos da lista oficial guardada no banco, lib/shopeeLista.js)
          lojas[fonte.nome] = { ok: false, erro: String(erro.message || erro), ...(erro?.etapas ? { etapas: erro.etapas } : {}) };
          if (fonte.nome === "shopee" && shopeeReaproveitadas) lojas.shopee.reaproveitadas = shopeeReaproveitadas; // outro termo da mesma busca já trouxe
          medir();
          const parciais = Array.isArray(erro?.parciais) ? erro.parciais : [];
          if (fonte.nome !== "shopee") return parciais;
          // Shopee recusando e é o robô das prontas: os produtos dela da busca guardada entram de novo (ver antigasDaShopee)
          const antigas = await antigasDaShopee();
          if (!antigas.length) return parciais;
          const jaVeio = new Set(parciais.map((o) => o.id));
          const voltam = antigas.filter((o) => !jaVeio.has(o.id));
          lojas.shopee.reaproveitadas = shopeeReaproveitadas = voltam.length;
          return [...parciais, ...voltam];
        }
      }),
    );
    return comCategoriaDaIa(env.DB, aplicarMapa(intercalar(resultados), mapa));
  };

  // 13/11/2026: a busca por palavra da Shopee passou o dia em "System Error 10000" (o testador oficial dela dava o mesmo).
  // O robô só trocava a busca pronta com a Shopee respondendo, então as prontas ficavam com as regras da véspera. Agora,
  // quando a Shopee recusa, o robô reaproveita os produtos dela da pronta guardada (passam de novo pelas regras da busca
  // com os das outras lojas) e a pronta é trocada. guardadaEm = quando o produto veio da Shopee de verdade: depois de
  // 7 dias sem a Shopee responder, ele sai. Só na busca comum do robô (categoria já se renova sem a Shopee); uma vez por busca
  // Só os campos que a Shopee manda (lib/fontes/shopee.js e lib/shopeeLista.js): as marcas das regras da véspera
  // (principal, acessorio, variante, parecido, secao, historico…) saem e são refeitas. O desconto que o histórico tinha
  // escondido (descontoDaLoja) volta a ser o da loja, para ser conferido de novo
  const CAMPOS_DA_SHOPEE = ["id", "loja", "titulo", "preco", "precoAntigo", "desconto", "imagem", "imagens", "avaliacao", "vendidos", "curtidas",
    "vendedor", "lojaOficial", "internacional", "catsLoja", "link", "daLista"];
  const comoVeioDaShopee = (o, criado) => {
    const limpa = Object.fromEntries(CAMPOS_DA_SHOPEE.filter((c) => o[c] !== undefined).map((c) => [c, o[c]]));
    if (o.descontoDaLoja) {
      limpa.desconto = o.descontoDaLoja;
      limpa.precoAntigo = Math.round((o.preco / (1 - o.descontoDaLoja / 100)) * 100) / 100;
    }
    limpa.guardadaEm = o.guardadaEm || criado;
    return limpa;
  };
  const REAPROVEITAR_SHOPEE_MS = 7 * 24 * 60 * 60 * 1000;
  let antigasPedidas = null;
  let shopeeReaproveitadas = 0;
  const antigasDaShopee = () => {
    if (!preparar || !q || categoria || soLoja || rapido || pagina !== 1 || desde !== 1 || !env.DB) return Promise.resolve([]);
    if (antigasPedidas) return Promise.resolve([]); // a busca tem vários termos ("xbox" + "xbox series x"): entram uma vez só
    antigasPedidas = (async () => {
      const pronta = await env.DB.prepare(`SELECT resposta, criado FROM ${TABELA_PRONTAS} WHERE chave = ?`).bind(chave.url).first();
      if (!pronta) return [];
      const dados = JSON.parse(await descompactar(pronta.resposta));
      return (dados.ofertas || [])
        .filter((o) => o.loja === "shopee")
        .map((o) => comoVeioDaShopee(o, pronta.criado))
        .filter((o) => Date.now() - o.guardadaEm < REAPROVEITAR_SHOPEE_MS);
    })().catch(() => []);
    return antigasPedidas;
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
  const vitrineDesde = categoria ? VITRINES_DESDE[categoria.nome] || 0 : 0;
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
  } else if (categoria) {
    // Dentro de uma categoria: o que foi digitado + (se a categoria tem chave) "invictus perfume";
    // fica só o que não é de outra categoria, o que é dela primeiro. Se nada sobrar, busca em tudo (e o site avisa).
    const extra = termoNaCategoria(q, categoria);
    const { juntas, proxima } = await buscarAteEncher(extra ? [extra, q] : [q],
      (novas) => contarNaCategoria(separarAcessorios(novas, q), categoria));
    // 21/11/2026 (regra do Giovanni, print "porta deslizante" dentro de Automotivo misturada com fechadura de casa e
    // porta-cartões): busca dentro da categoria devolve SÓ o que é dela (ver soDaCategoria em lib/categorias.js)
    ofertas = soDaCategoria(ordenarNaCategoria(separarAcessorios(juntas, q), categoria), categoria);
    // Nada da categoria com as palavras da busca ("air fryer mondial" com Cabelo aberta): busca em tudo e o site avisa
    if (!ofertas.some((o) => o.bate) && desde === 1) {
      ofertas = marcarSecoes(separarAcessorios(juntas, q), null, categoriaDoProduto(q), produtoBuscado(q));
      foraDaCategoria = ofertas.length > 0;
    }
    mais = proxima && `desde=${proxima}`;
  } else if (q) {
    // Na busca, acessórios ("tapete para air fryer") vão para o fim e o site os esconde
    // "tv" pesquisa "smart tv" nas lojas; "bateria carro", várias buscas com marca/amperagem (ver buscaNasLojas)
    const { buscas, termo, precoMin } = buscaNasLojas(q);
    prazoCurto = !preparar && !atualizar && pagina === 1 && desde === 1 && !rapido && !soLoja && Boolean(cache);
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
  etapa("lojas");
  // 20/11/2026 (medição depois da auditoria: "tênis nike air max" veio com 0 ofertas e ficou guardada vazia): quando a
  // AliExpress e a Shopee passam do prazo curto e as outras lojas não têm o produto, a 1ª tela sairia VAZIA, e tela vazia
  // não pede complemento. Nesse caso a busca é refeita aqui mesmo com os prazos normais: o visitante espera mais, mas vê
  // os produtos em vez de "nada encontrado"
  if (prazoCurto && !ofertas.length && Object.keys(PRAZO_DA_PRIMEIRA_TELA_MS).some((nome) => lojas[nome] && !lojas[nome].ok)) {
    return onRequestGet({ request, env: { ...env, __ATUALIZAR: true }, waitUntil });
  }
  // O que a IA disse não ser o produto buscado vai para "Ver também… produtos parecidos" (ver lib/iaBusca.js)
  if (q) ofertas = semBrinquedos(semNaoBuscados(ofertas, await iaAntes), q);
  ofertas = marcarUsados(semPrecoAbsurdo(ofertas), q); // preço errado do vendedor sai; usado/ferro-velho vai marcado (lib/lojasRemovidas.js)
  ofertas = semFotosErradas(ofertas, await fotosAntes); // foto que não é do produto (lib/iaFotos.js)
  // Lomadee: tira as fotos que já sabemos que não abrem (ver lib/fotos.js); nas buscas prontas do robô, testa antes
  etapa("ia");
  ofertas = await semFotosQuebradas(env.DB, ofertas, { esperar: Boolean(preparar), waitUntil });
  etapa("fotos");
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
  etapa("historico");
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

  // Alguma loja ficou de fora por causa do prazo curto da 1ª tela (ou o Mercado Livre segue por trás): o site pede o resto
  const parcial = prazoCurto && ofertas.length > 0 && Object.values(lojas).some((l) => !l.ok);
  // Toda busca de visitante vai para a fila do robô do Mercado Livre da madrugada (lib/mlFila.js). 16/11/2026 (print
  // "starlink" com 18 do ML; Giovanni: "seria bom fazer pra outros produtos também"): antes só entrava a que trazia menos
  // de 8 do ML ou com o ML em erro; o robô lê o dobro do catálogo e pede o preço de mais fichas do que dá na hora
  // Só busca que trouxe produtos e passa no filtro das tendências (10/11/2026, revisão: termos inventados enchiam a fila e o
  // robô gastava a madrugada do ML neles)
  if (q && pagina === 1 && desde === 1 && !preparar && !atualizar && !soLoja && !rapido && env.DB && lojas.mercadolivre && reais.length
    && ofertas.length >= 5 && tendenciaAceitavel(q) && !naoContar(request)) {
    waitUntil(anotarNaFilaML(env.DB, q).catch(() => {}));
  }
  // Trouxe ofertas, mas nenhuma é o produto (só acessórios e parecidos): o termo sai das sugestões de tendência por 3 dias
  // (lib/buscas.js). Vale também para o robô das prontas; só a busca comum, na 1ª página, no site todo
  if (q && pagina === 1 && desde === 1 && !soLoja && !rapido && !categoria && env.DB && !parcial && semProdutoAVenda(ofertas)
    // …e só se as lojas responderam: com 2+ lojas em erro o produto pode estar justamente nelas (auditoria de 13/11/2026)
    && Object.values(lojas).filter((l) => !l.ok).length <= 1) {
    waitUntil(anotarSemProduto(env, q).catch(() => {}));
  }
  // Poucas ofertas numa busca comum (15/11/2026, Giovanni: "busca com pouco resultado tem que ser investigada e corrigida
  // automaticamente"): anota para o robô da noite refazer e diagnosticar (lib/poucas.js). O robô (preparar) tira da lista
  // quando volta a vir bastante. Termos fora do filtro das tendências (impróprios, inventados) não entram
  if (q && pagina === 1 && desde === 1 && !soLoja && !rapido && !categoria && !atualizar && !parcial && env.DB && reais.length && tendenciaAceitavel(q)
    // Teste com o cookie "não contar" fica fora (17/11/2026: termos de teste como "grampo de cabelo preto 25360" enchiam a lista)
    && (preparar || !naoContar(request))) {
    const tarefa = ofertas.length < POUCAS_MIN ? anotarPoucas(env, q, ofertas, lojas) : preparar ? tirarDasPoucas(env, q) : null;
    if (tarefa) { if (preparar) await tarefa.catch(() => {}); else waitUntil(tarefa.catch(() => {})); }
  }
  // Monitor: os detalhes que só a busca feita na hora tem (quantos ficam à mostra, quantos são o produto, tempo)
  if (visitanteDeVerdade && !preparar && !atualizar && env.DB) {
    const produtos = ofertas.filter((o) => !o.acessorio && !o.parecido && !o.naoBuscado);
    waitUntil(anotarSinal(env, { q, cat: params.get("cat") || (params.get("loja") ? `loja:${params.get("loja")}` : ""), total: ofertas.length,
      mostra: produtos.length, bate: ofertas.filter((o) => o.bate && !o.acessorio).length, ms: Date.now() - inicio, parcial,
      lojasErro: Object.entries(lojas).filter(([, l]) => l && !l.ok).map(([n]) => n).join(",") }, { contar: false }).catch(() => {}));
  }
  const resposta = responder({
    q,
    ...(parcial && { parcial: true }),
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
  // Quanto levou cada parte da busca feita na hora (19/11/2026, auditoria: a resposta levava 1,5–2 s a mais que a loja mais lenta)
  etapa("resto");
  resposta.headers.set("Server-Timing", [...etapas, `cidade;desc=${request.cf?.colo || "?"}`].join(", "));
  // O visitante não espera a gravação no cache (o robô e a atualização por trás esperam: a gravação é o trabalho deles)
  const guardarNoCache = (...gravacoes) => {
    const tudo = Promise.all(gravacoes);
    if (preparar || atualizar) return tudo;
    waitUntil(tudo.catch(() => {}));
    return null;
  };
  const todasOk = Object.values(lojas).every((l) => l.ok);
  if (!todasOk) resposta.headers.set("X-Incompleta", "1");
  if (parcial) resposta.headers.set("X-Parcial", "1");
  // Sem nenhuma oferta: o navegador não guarda. Com loja em erro (03/11/2026: Shopee "Rate limit exceeded" enquanto o
  // robô prepara as buscas prontas), guarda só 1 minuto, para a próxima tentativa já trazer a loja de volta
  if (!ofertas.length) resposta.headers.set("Cache-Control", "public, max-age=0");
  else if (!todasOk) resposta.headers.set("Cache-Control", "public, max-age=60");
  if (cache && todasOk) await guardarNoCache(cache.put(chave, paraGuardar(resposta.clone())), guardarLimpa(resposta.clone()));
  // Só uma loja menor falhou (a Lomadee trava bastante) e a Shopee respondeu: guarda 1 hora, marcada como velha (o
  // próximo visitante recebe na hora e ela é refeita por trás). Antes não guardava e cada visitante ia de novo às lojas
  // Sem ofertas e com loja em erro: guarda também (não era guardada), já quase vencida, para ser refeita por trás em 1 min
  else if (cache && !ofertas.length && !rapido) {
    const criadoVazia = Date.now() - (VAZIA_FRESCA_MS - VAZIA_COM_ERRO_FRESCA_MS);
    await guardarNoCache(cache.put(chave, paraGuardar(resposta.clone(), criadoVazia)), guardarLimpa(resposta.clone(), criadoVazia));
  // A refeita achou ofertas e a guardada era a vazia: troca mesmo com loja em erro (senão o "não achamos" ficava 1 h)
  } else if (cache && ofertas.length && !lojas.shopee?.ok && vazia((await cache.match(chave).catch(() => null)) || new Response(null))) {
    await guardarNoCache(cache.put(chave, paraGuardar(resposta.clone(), 0, 60 * 60)), guardarLimpa(resposta.clone(), 0, 60 * 60));
  // Vitrine da categoria mudada (VITRINES_DESDE): a cópia de antes da mudança é trocada mesmo com loja em erro (a vitrine faz
  // várias buscas na Shopee e basta uma ser recusada; sem isto "tênis olympikus" só entraria em Calçados dias depois)
  } else if (cache && ofertas.length && vitrine && vitrineDesde && (Number((await cache.match(chave).catch(() => null))?.headers.get("X-Criado")) || 0) < vitrineDesde) {
    await guardarNoCache(cache.put(chave, paraGuardar(resposta.clone())), guardarLimpa(resposta.clone()));
  } else if (cache && lojas.shopee?.ok && ofertas.length) await guardarNoCache(cache.put(chave, paraGuardar(resposta.clone(), 0, 60 * 60)), guardarLimpa(resposta.clone(), 0, 60 * 60));
  // Sem a Shopee (19/11/2026): não era guardada e cada visitante refazia a busca inteira. Agora guarda 1 hora, desde que não
  // haja uma cópia COMPLETA no lugar (essa fica). A parcial da 1ª tela entra já vencida (é refeita por trás agora mesmo); a
  // refeita por trás que continua sem a Shopee vale meia hora
  else if (cache && ofertas.length && !rapido && !preparar) {
    const atual = await cache.match(chave).catch(() => null);
    if (!atual || atual.headers.get("X-Incompleta") || vazia(atual)) {
      const criadoIncompleta = parcial ? 0 : Date.now() - (FRESCO_MS - INCOMPLETA_FRESCA_MS);
      await guardarNoCache(cache.put(chave, paraGuardar(resposta.clone(), criadoIncompleta, 60 * 60)), guardarLimpa(resposta.clone(), criadoIncompleta, 60 * 60));
    }
  }
  // Não guardou a resposta nova: a limpa antiga só sai se a cópia de origem também não existe mais.
  // 15/11/2026 (Giovanni: categoria demorando a abrir no celular): com a Shopee em erro TODA atualização por trás caía aqui e
  // apagava a cópia limpa, mesmo com a de origem ainda guardada; a visita seguinte refazia a limpeza no banco antes de
  // responder (1–3 s medidos em Bebês, Decoração, Limpeza…) e disparava outra atualização, que apagava de novo
  else if (cache) waitUntil(cache.match(chave).then((origem) => (origem ? null : cache.delete(chaveLimpa))).catch(() => {}));
  // Resposta parcial: refaz já, por trás, com os prazos normais (o site pede o complemento em alguns segundos)
  if (parcial && cache && Date.now() - (atualizando.get(chave.url) || 0) > PAUSA_ENTRE_ATUALIZACOES_MS) {
    atualizando.set(chave.url, Date.now());
    waitUntil(onRequestGet({ request, env: { ...env, __ATUALIZAR: true }, waitUntil }).catch(() => {}));
  }
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
  const prontaOk = (lojas.shopee?.ok || lojas.shopee?.reaproveitadas > 0) && ofertas.length > 0;
  // 11/11/2026 (Giovanni: no celular as categorias demoravam ~5 s a mais): a pronta só era guardada pelo robô e só com a
  // Shopee respondendo. Categoria em que a Shopee recusava toda noite ficava sem pronta (some depois de 7 dias) e cada
  // visitante esperava a consulta às lojas (7–9 s em Ferramentas e Bonés). Agora:
  //  - a visita a uma categoria (e a atualização por trás dela) também guarda a pronta;
  //  - sem a Shopee, guarda assim mesmo se não houver pronta ou se a guardada tiver mais de 3 dias (melhor uma lista sem
  //    a Shopee na hora do que fazer o visitante esperar)
  if ((preparar || categoria) && primeira && !rapido && !soLoja && ofertas.length > 0 && reais.length && env.DB) {
    try {
      await criarTabelaProntas(env.DB);
      let guardar = prontaOk;
      if (!guardar && ofertas.length >= 24) {
        const atual = await env.DB.prepare(`SELECT criado, total FROM ${TABELA_PRONTAS} WHERE chave = ?`).bind(chave.url).first();
        // Categoria: são várias buscas na Shopee de uma vez e basta uma ser recusada para a Shopee contar como "falhou"
        // (era por isso que as categorias quase nunca eram guardadas); as outras vieram, então renova a cada noite
        guardar = !atual || Date.now() - atual.criado > (categoria ? PRONTA_DE_CATEGORIA_APOS_MS : PRONTA_SEM_SHOPEE_APOS_MS)
          // 15/11/2026: veio o dobro (ou mais) da guardada: troca mesmo sem a Shopee (Games tinha 37; lib/poucas.js)
          || ofertas.length >= 2 * (Number(atual.total) || 0)
          // vitrine da categoria mudada depois da pronta guardada (VITRINES_DESDE)
          || Boolean(vitrine && vitrineDesde && atual.criado < vitrineDesde);
      }
      // 14/11/2026: na madrugada a AliExpress e a Lomadee demoraram mais de 10 s na hora de "air fryer" e a pronta nova
      // (323 ofertas, AliExpress 44) tomou o lugar da boa (763). Com loja em erro, não troca uma pronta de menos de 3 dias
      // por uma com menos da metade das ofertas
      if (guardar && !todasOk) {
        const atual = await env.DB.prepare(`SELECT total, criado FROM ${TABELA_PRONTAS} WHERE chave = ?`).bind(chave.url).first();
        // 15/11: só segura por 30 h (antes 3 dias): com a Shopee instável, "smart tv" e outras ficavam com a lista de
        // ontem, vencida, e a 1ª visita de cada cidade demorava
        if (atual && atual.total > 2 * ofertas.length && Date.now() - atual.criado < VALIDADE_PRONTA_MS) guardar = false;
      }
      if (guardar) {
        const gravar = async () => env.DB.prepare(`INSERT OR REPLACE INTO ${TABELA_PRONTAS} (chave, resposta, total, criado, versao) VALUES (?, ?, ?, ?, ?)`)
          .bind(chave.url, await compactar(await resposta.clone().text()), ofertas.length, Date.now(), VERSAO_CACHE).run();
        if (preparar) await gravar(); else waitUntil(gravar().catch(() => {})); // o visitante não espera a gravação
      }
    } catch {
      if (preparar) throw new Error("Não deu para guardar a busca pronta");
    }
  }
  if (preparar || atualizar) return resposta; // o robô e a atualização por trás não contam como busca em alta
  return contar(resposta);
}
