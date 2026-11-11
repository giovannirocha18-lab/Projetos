// Roda antes das páginas e da API. Só a pasta public/ é publicada (Cloudflare > Settings > Builds > "Build output
// directory" = public): anotações, código da busca, robô e testes nem vão para o servidor. Mesmo assim, aqui vale uma
// LISTA DO QUE PODE ABRIR (segunda camada): qualquer outro endereço dá 404. Também põe cabeçalhos de segurança.
// /assets/ e /marca/ não passam por aqui (public/_routes.json): saem direto do Cloudflare, mais rápido e sem gastar o
// limite de chamadas, com os cabeçalhos de segurança do public/_headers. Só é seguro porque NADA interno fica em public/.
import { produtoPorId } from "../lib/produto.js";
import { ehPainel, quemEntrou } from "../lib/painel.js";
import { naoContar } from "../lib/naoContar.js";
import { destinoML, CAMINHO_IR_ML } from "../lib/fontes/mercadolivre.js";
import { destinoShopee, CAMINHO_IR_SHOPEE } from "../lib/fontes/shopee.js";
import { destinoAli, CAMINHO_IR_ALI } from "../lib/fontes/aliexpress.js";
import { concluirAutorizacao } from "../lib/mlConta.js";
import { dentroDoLimite, ipDe } from "../lib/conta.js";
import { categoriasDoSite } from "../lib/categorias.js";
import { VERSAO_CACHE } from "./api/buscar.js";

// Links de afiliado NOVOS (ainda não guardados) que um visitante pode gerar por hora em /ir/shopee e /ir/ali (10/11/2026).
// Quem clica de verdade fica muito abaixo; acima disso o clique vai para a página do produto sem consultar a loja
const LINKS_NOVOS_POR_HORA = 40;
async function podeGerarLink(env, request) {
  try {
    return !env.DB || (await dentroDoLimite(env.DB, `ir:${ipDe(request)}`, LINKS_NOVOS_POR_HORA));
  } catch {
    return true;
  }
}

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

// Para os buscadores (10/11/2026, revisão; preparo do lançamento, o site segue com noindex até lá): endereço canônico e
// og:url em toda página, e título/descrição próprios nas buscas (/?q=…), que antes só mudavam no navegador
const SITE = "https://vaiprocarrinho.com.br";
function comDadosDaPagina(resposta, url) {
  if (!(resposta.headers.get("Content-Type") || "").includes("text/html") || resposta.status !== 200) return resposta;
  const p = url.searchParams;
  const q = (p.get("q") || "").trim().replace(/\s+/g, " ").slice(0, 60);
  const caminho = /^\/(index(\.html)?)?$/i.test(url.pathname) ? "/" : url.pathname.replace(/(\.html)?\/?$/i, "").toLowerCase();
  const filtros = new URLSearchParams();
  if (caminho === "/") {
    if (p.get("produto")) filtros.set("produto", p.get("produto").slice(0, 80));
    else if (p.get("loja") && !q) filtros.set("loja", p.get("loja").slice(0, 80));
    else if (q) { filtros.set("q", q.toLowerCase()); if (p.get("cat")) filtros.set("cat", p.get("cat").slice(0, 40)); }
  }
  const canonico = `${SITE}${caminho}${filtros.size ? `?${filtros}` : ""}`;
  // O 1º pedido de dados da página começa junto com ela, antes de o app.js chegar (11/11/2026, pedido do Giovanni: no
  // celular os produtos demoravam; em 4G o app.js leva ~1 s e só então pedia os produtos). O endereço tem que ser
  // IGUAL ao que o app.js pede (enderecoBusca e pedirLoja em app.js); se não for, o navegador só baixa à toa, por isso
  // só os casos simples: página inicial, busca só com ?q=, Black Friday e página de loja
  const qCru = (p.get("q") || "").trim();
  const simples = !p.get("produto") && !p.has("exato") && !p.get("cat") && !p.has("mlcat");
  const lojaCrua = (p.get("loja") || "").trim();
  let dados = null;
  if (caminho === "/" && simples && qCru && !lojaCrua && qCru.length <= 100) dados = `/api/buscar?v=${VERSAO_CACHE}&q=${encodeURIComponent(qCru)}`;
  else if (caminho === "/" && simples && !qCru && !lojaCrua && !p.has("q")) dados = `/api/buscar?v=${VERSAO_CACHE}&q=`;
  else if (caminho === "/" && simples && !qCru && lojaCrua && lojaCrua.length <= 80) dados = `/api/lojas?id=${encodeURIComponent(lojaCrua)}&pagina=1`;
  else if (caminho === "/black-friday" && !qCru && !lojaCrua) dados = "/api/black-friday?pagina=1";
  let rewriter = new HTMLRewriter().on("head", { element(el) {
    if (dados) el.append(`<link rel="preload" as="fetch" crossorigin href="${dados.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")}">`, { html: true });
    el.append(`<link rel="canonical" href="${canonico.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")}">`, { html: true });
    el.append(`<meta property="og:url" content="${canonico.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")}">`, { html: true });
  } });
  if (caminho === "/" && q && !p.get("produto")) {
    const titulo = `${q.charAt(0).toUpperCase()}${q.slice(1)}: compare preços`;
    const descricao = `Compare os preços de ${q} na Shopee, Mercado Livre, AliExpress e outras lojas num só lugar.`;
    const meta = (valor) => ({ element(el) { el.setAttribute("content", valor); } });
    rewriter = rewriter.on("title", { element(el) { el.setInnerContent(`${titulo} · Vai pro Carrinho`); } })
      .on('meta[property="og:title"]', meta(titulo))
      .on('meta[property="og:description"]', meta(descricao))
      .on('meta[name="description"]', meta(descricao));
  }
  return rewriter.transform(resposta);
}

// robots.txt e sitemap.xml (preparo do lançamento): a API e os links de saída não são para os buscadores
const ROBOTS = `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /ir/\n\nSitemap: ${SITE}/sitemap.xml\n`;
function sitemap() {
  const xml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const enderecos = [`${SITE}/`, `${SITE}/black-friday`, `${SITE}/como-funciona`, `${SITE}/privacidade`,
    ...categoriasDoSite().map((c) => `${SITE}/?${new URLSearchParams({ q: c.busca, cat: c.nome })}`)];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${
    enderecos.map((e) => `  <url><loc>${xml(e)}</loc></url>`).join("\n")}\n</urlset>\n`;
}

export async function onRequest(contexto) {
  const url = new URL(contexto.request.url);
  if (!ehPainel(contexto.request.url) && contexto.request.method === "GET") {
    if (url.pathname === "/robots.txt") return new Response(ROBOTS, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
    if (url.pathname === "/sitemap.xml") return new Response(sitemap(), { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
  }
  const daLoja = await comPreviaDoProduto(await responder(contexto), contexto.env, url);
  const resposta = ehPainel(contexto.request.url) ? daLoja : comDadosDaPagina(daLoja, url);
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
  // Também os endereços de cada publicação de produção (<código>.vaiprocarrinho.pages.dev, que têm o banco): por eles dava
  // para tocar o robô da noite e gravar as buscas prontas com o endereço errado, fora das regras de limite do domínio
  // (10/11/2026, revisão). As prévias de outras branches não têm o banco e continuam abrindo
  if (url.hostname === "vaiprocarrinho.pages.dev" || (/\.vaiprocarrinho\.pages\.dev$/.test(url.hostname) && env.DB)) {
    return Response.redirect(`https://vaiprocarrinho.com.br${url.pathname}${url.search}`, 301);
  }
  // Site de teste (teste.vaiprocarrinho.pages.dev, 08/11/2026, pedido do Giovanni: mudanças primeiro no teste): a prévia não
  // tem o banco nem as chaves das lojas, então as chamadas /api e /ir vão para o site real (a parte visual vem da branch)
  // (as que não usam o banco, como /api/shein, respondem da própria branch: dá para ver a mudança no teste)
  if (/\.vaiprocarrinho\.pages\.dev$/.test(url.hostname) && !env.DB && /^\/(api|ir)\//.test(url.pathname) && !/^\/api\/shein\/?$/.test(url.pathname)) {
    const cabecalhos = new Headers();
    for (const [k, v] of request.headers) if (!/^(host|cf-|x-forwarded|x-real-ip)/i.test(k)) cabecalhos.set(k, v);
    const corpo = ["GET", "HEAD"].includes(request.method) ? undefined : await request.arrayBuffer();
    const r = await fetch(`https://vaiprocarrinho.com.br${url.pathname}${url.search}`, { method: request.method, headers: cabecalhos, body: corpo, redirect: "manual" });
    return new Response(r.body, r);
  }

  // Volta da tela "Permitir" do Mercado Livre (conta conectada pelo painel, lib/mlConta.js): só um "state" criado pelo
  // painel nos últimos 15 minutos é aceito; qualquer outro ?code= na página principal é ignorado
  if (url.pathname === "/" && url.searchParams.has("code") && url.searchParams.has("state")) {
    const r = await concluirAutorizacao(env, url.searchParams.get("code"), url.searchParams.get("state")).catch(() => null);
    if (r) {
      const destino = new URL("https://painel.vaiprocarrinho.com.br/api/painel/ml-conta");
      destino.searchParams.set(r.ok ? "ok" : "erro", r.ok ? "1" : String(r.erro).slice(0, 200));
      return new Response(null, { status: 302, headers: { Location: destino.toString(), "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
    }
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
  // Botão "Comprar" dos produtos da lista oficial da Shopee: link de afiliado pedido na hora (lib/fontes/shopee.js).
  // ?json=1 devolve só o link (o site usa para abrir no app da Shopee no Android)
  if (CAMINHO_IR_SHOPEE.test(url.pathname)) {
    const destino = await destinoShopee(env, url.pathname, url.origin, () => podeGerarLink(env, request));
    if (url.searchParams.has("json")) return Response.json({ link: destino }, { headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
    return new Response(null, { status: 302, headers: { Location: destino, "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } });
  }
  // Botão "Comprar" da AliExpress (10/11/2026): link de afiliado pedido na hora (lib/fontes/aliexpress.js, destinoAli)
  if (CAMINHO_IR_ALI.test(url.pathname)) {
    const destino = await destinoAli(env, url.pathname, url.origin, () => podeGerarLink(env, request));
    return new Response(null, { status: 302, headers: { Location: destino, "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } });
  }
  // O comparador ficava em /previa antes do lançamento: leva para a página principal
  if (/^\/previa(\.html)?\/?$/i.test(url.pathname)) {
    return Response.redirect(`${url.origin}/${url.search}`, 301);
  }
  // Página da Black Friday: é a página principal (o site vê o endereço e abre as ofertas da Black Friday)
  // Com barra no fim os arquivos da página eram pedidos em /black-friday/assets/… e ela abria sem estilo (10/11/2026)
  if (/^\/black-friday\/$/i.test(url.pathname)) return Response.redirect(`${url.origin}/black-friday${url.search}`, 301);
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
