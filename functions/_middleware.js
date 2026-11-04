// Roda antes das páginas e da API. Só a pasta public/ é publicada (Cloudflare > Settings > Builds > "Build output
// directory" = public): anotações, código da busca, robô e testes nem vão para o servidor. Mesmo assim, aqui vale uma
// LISTA DO QUE PODE ABRIR (segunda camada): qualquer outro endereço dá 404. Também põe cabeçalhos de segurança.
// /assets/ e /marca/ não passam por aqui (public/_routes.json): saem direto do Cloudflare, mais rápido e sem gastar o
// limite de chamadas, com os cabeçalhos de segurança do public/_headers. Só é seguro porque NADA interno fica em public/.
import { produtoPorId } from "../lib/produto.js";
import { ehPainel, quemEntrou } from "../lib/painel.js";
import { naoContar } from "../lib/naoContar.js";
import { destinoML, CAMINHO_IR_ML } from "../lib/fontes/mercadolivre.js";

const PUBLICOS = /^\/(index(\.html)?|privacidade(\.html)?\/?|como-funciona(\.html)?\/?|manifest\.webmanifest|api\/.*|assets\/[\w.-]+|marca\/[\w.-]+)?$/i;

const VERIFICACAO_AWIN = "2e195e3c8c68351f1709348e09eae77d";

// O que as páginas podem carregar: código e dados só do próprio site, fontes do Google Fonts e
// fotos de qualquer loja (https). Estilos "inline" ficam liberados porque o site muda estilos pelo
// código e a Política de Privacidade tem um <style>. Cloudflare Web Analytics (ligado em 03/11/2026)
// também funciona. Nenhum outro site pode abrir o nosso dentro de uma moldura (frame-ancestors).
const CSP = [
  "default-src 'self'",
  "script-src 'self' https://static.cloudflareinsights.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' https: data: blob:",
  "connect-src 'self' https://cloudflareinsights.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const SEGURANCA = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "Content-Security-Policy": CSP,
};

// Aparelho que pediu para não ser contado (lib/naoContar.js): a mesma CSP sem o Cloudflare Web Analytics, que assim não
// carrega nem envia a visita
const CSP_SEM_CONTAGEM = CSP.replace(" https://static.cloudflareinsights.com", "").replace(" https://cloudflareinsights.com", "");

// Endereço "limpo" para conferir os internos: %2F, %2E, barras repetidas e "/./" não enganam a regra
function caminhoNormal(caminho) {
  try {
    caminho = decodeURIComponent(caminho);
  } catch {
    // endereço com % quebrado: confere como veio
  }
  caminho = caminho.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
  while (/\/\.(\/|$)/.test(caminho)) caminho = caminho.replace(/\/\.(\/|$)/, "/");
  return caminho;
}

// As respostas do Cloudflare podem vir "travadas" (cabeçalhos só de leitura): copia para poder mexer
function comSeguranca(resposta) {
  const nova = new Response(resposta.body, resposta);
  for (const [nome, valor] of Object.entries(SEGURANCA)) nova.headers.set(nome, valor);
  return nova;
}

// O navegador guarda app.js e estilo.css por horas (regra do Cloudflare). Para todo visitante receber a versão
// nova logo depois de cada publicação, sem Ctrl+F5, as páginas pedem "assets/app.js?v=<código do arquivo>":
// o código (ETag) muda quando o arquivo muda, e o navegador entende que é outro arquivo.
const versoes = new Map(); // arquivo -> código; vale enquanto esta publicação estiver no ar
async function versaoDe(env, origem, arquivo) {
  if (!versoes.has(arquivo)) {
    const resp = await env.ASSETS.fetch(new URL(`/${arquivo}`, origem)).catch(() => null);
    const etag = resp?.ok ? (resp.headers.get("ETag") || "").replace(/^W\//, "").replace(/"/g, "") : "";
    if (!etag) return null; // tenta de novo na próxima página
    versoes.set(arquivo, etag.slice(0, 12));
  }
  return versoes.get(arquivo);
}

async function comVersaoNosArquivos(resposta, env, origem) {
  if (!env.ASSETS || !(resposta.headers.get("Content-Type") || "").includes("text/html")) return resposta;
  const trocar = (atributo) => ({
    async element(el) {
      const valor = el.getAttribute(atributo) || "";
      if (!/^\/?assets\/[\w.-]+\.(js|css)$/.test(valor)) return;
      const versao = await versaoDe(env, origem, valor.replace(/^\//, ""));
      if (versao) el.setAttribute(atributo, `${valor}?v=${versao}`);
    },
  });
  return new HTMLRewriter().on("script[src]", trocar("src")).on("link[href]", trocar("href")).transform(resposta);
}

// Prévia do link /black-friday no WhatsApp e nas redes
function comPreviaDaBlackFriday(resposta) {
  const titulo = "Black Friday de verdade: só desconto conferido";
  const descricao = "Acompanhamos o preço de cada produto todos os dias. Se a loja subiu o preço antes, a oferta não aparece.";
  const meta = (valor) => ({ element(el) { el.setAttribute("content", valor); } });
  return new HTMLRewriter()
    .on("title", { element(el) { el.setInnerContent(`${titulo} · Vai pro Carrinho`); } })
    .on('meta[property="og:title"]', meta(titulo))
    .on('meta[property="og:description"]', meta(descricao))
    .on('meta[name="description"]', meta(descricao))
    .transform(resposta);
}

// Link de produto compartilhado (?produto=shopee-123): a prévia do WhatsApp mostra a foto, o nome e o preço dele
async function comPreviaDoProduto(resposta, env, url) {
  const id = url.searchParams.get("produto");
  if (!id || !/^\/(index(\.html)?)?$/.test(url.pathname) || !(resposta.headers.get("Content-Type") || "").includes("text/html")) return resposta;
  const o = await produtoPorId(env, id).catch(() => null);
  if (!o) return resposta;
  const preco = Number(o.preco).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const titulo = `${o.titulo.slice(0, 90)} por ${preco}`;
  const meta = (valor) => ({ element(el) { el.setAttribute("content", valor); } });
  let rewriter = new HTMLRewriter()
    .on("title", { element(el) { el.setInnerContent(`${titulo} · Vai pro Carrinho`); } })
    .on('meta[property="og:title"]', meta(titulo))
    .on('meta[property="og:description"]', meta(`${o.lojaNome || { shopee: "Shopee", aliexpress: "AliExpress" }[o.loja] || o.loja} · compare preços no Vai pro Carrinho`));
  if (/^https:\/\//.test(o.imagem || "")) rewriter = rewriter.on('meta[property="og:image"]', meta(o.imagem.replace(/_tn$/, "")));
  return rewriter.transform(resposta);
}

export async function onRequest(contexto) {
  const url = new URL(contexto.request.url);
  const resposta = await comPreviaDoProduto(await responder(contexto), contexto.env, url);
  const pronta = comSeguranca(await comVersaoNosArquivos(resposta, contexto.env, url.origin));
  if (naoContar(contexto.request)) pronta.headers.set("Content-Security-Policy", CSP_SEM_CONTAGEM);
  return pronta;
}

const naoEncontrada = () => new Response("Página não encontrada", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });

// painel.vaiprocarrinho.com.br: só a página do painel e os números dela, e só com o login do Cloudflare Access
// (lib/painel.js). Nada da loja abre nesse endereço. /assets/ não passa por aqui, mas o Access protege o endereço todo.
async function responderPainel({ request, next, env }, url) {
  const semCache = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
  if (!(await quemEntrou(request, env))) {
    return new Response("Acesso negado", { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8", ...semCache } });
  }
  const caminho = caminhoNormal(url.pathname);
  let resposta;
  if (caminho === "/" || caminho === "/index.html") resposta = await env.ASSETS.fetch(new Request(new URL("/painel", url.origin)));
  else if (/^\/api\/painel\/[\w-]+$/.test(caminho)) resposta = await next();
  else if (caminho === "/favicon.ico") return Response.redirect(`${url.origin}/marca/vaiprocarrinho-icone.svg`, 302);
  else return naoEncontrada();
  resposta = new Response(resposta.body, resposta);
  for (const [nome, valor] of Object.entries(semCache)) resposta.headers.set(nome, valor);
  return resposta;
}

async function responder(contexto) {
  const { request, next, env } = contexto;
  const url = new URL(request.url);
  if (ehPainel(request.url)) return responderPainel(contexto, url);
  // Os números do painel nunca respondem no endereço da loja
  if (/^\/api\/painel(\/|$)/i.test(caminhoNormal(url.pathname))) return naoEncontrada();
  // O endereço vaiprocarrinho.pages.dev (do Cloudflare) não pode ser desligado: leva para o domínio
  // oficial. As prévias de outras branches (algo.vaiprocarrinho.pages.dev) continuam abrindo.
  if (url.hostname === "vaiprocarrinho.pages.dev") {
    return Response.redirect(`https://vaiprocarrinho.com.br${url.pathname}${url.search}`, 301);
  }

  // Verificação do site na Awin (método do arquivo). Respondido aqui porque o Cloudflare Pages
  // tiraria o ".html" do endereço com um redirecionamento, e o verificador espera o arquivo direto.
  if (url.pathname === `/${VERIFICACAO_AWIN}.html`) {
    // Mesmo conteúdo do arquivo baixado da Awin
    return new Response(`Validation content="${VERIFICACAO_AWIN}"`, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
  // Botão "Comprar" dos produtos do Mercado Livre: o site mostra só o endereço nosso e aqui leva ao Mercado Livre com as
  // marcas de afiliado (lib/fontes/mercadolivre.js, destinoML). O destino é sempre www.mercadolivre.com.br
  if (CAMINHO_IR_ML.test(url.pathname)) {
    const destino = destinoML(env, url.pathname);
    if (destino) {
      return new Response(null, { status: 302, headers: { Location: destino, "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } });
    }
  }
  // O comparador ficava em /previa antes do lançamento: leva para a página principal
  if (/^\/previa(\.html)?\/?$/i.test(url.pathname)) {
    return Response.redirect(`${url.origin}/${url.search}`, 301);
  }
  // Página da Black Friday: é a página principal (o site vê o endereço e abre as ofertas da Black Friday)
  if (/^\/black-friday\/?$/i.test(url.pathname) && env.ASSETS) {
    const pagina = await env.ASSETS.fetch(new Request(new URL("/", url.origin)));
    return comPreviaDaBlackFriday(pagina);
  }
  // Só os endereços públicos (página principal, Política de Privacidade e API); o resto não existe para o visitante
  const caminho = caminhoNormal(url.pathname);
  let cru = url.pathname;
  try { cru = decodeURIComponent(cru); } catch { /* % quebrado: confere como veio */ }
  // Endereço "torto" nunca passa: ".." (mesmo escrito %2e%2e), barra dupla ou barra invertida (%5c)
  const torto = /(^|\/)\.\.(\/|$)/.test(caminho) || /\/\/|\\/.test(cru);
  if (torto || !PUBLICOS.test(caminho)) {
    return naoEncontrada();
  }
  return next();
}
