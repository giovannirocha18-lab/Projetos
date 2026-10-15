// Roda antes de qualquer página. Esconde do público os arquivos internos do
// repositório (anotações, código da busca), que o Cloudflare Pages publicaria
// junto com o site.
const INTERNOS = /^\/(claude\.md|readme\.md|\.gitignore|_headers|lib\/|functions\/|robo\/|\.github\/|\.claude\/)/i;

const VERIFICACAO_AWIN = "2e195e3c8c68351f1709348e09eae77d";

export async function onRequest({ request, next }) {
  const url = new URL(request.url);
  // O endereço vaiprocarrinho.pages.dev (do Cloudflare) não pode ser desligado: leva para o domínio
  // oficial. As prévias de outras branches (algo.vaiprocarrinho.pages.dev) continuam abrindo.
  if (url.hostname === "vaiprocarrinho.pages.dev") {
    return Response.redirect(`https://vaiprocarrinho.com.br${url.pathname}${url.search}`, 301);
  }
  if (INTERNOS.test(url.pathname)) {
    return new Response("Página não encontrada", { status: 404 });
  }
  // Verificação do site na Awin (método do arquivo). Respondido aqui porque o Cloudflare Pages
  // tiraria o ".html" do endereço com um redirecionamento, e o verificador espera o arquivo direto.
  if (url.pathname === `/${VERIFICACAO_AWIN}.html`) {
    // Mesmo conteúdo do arquivo baixado da Awin
    return new Response(`Validation content="${VERIFICACAO_AWIN}"`, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
  // O comparador ficava em /previa antes do lançamento: leva para a página principal
  if (/^\/previa(\.html)?\/?$/i.test(url.pathname)) {
    return Response.redirect(`${url.origin}/${url.search}`, 301);
  }
  return next();
}
