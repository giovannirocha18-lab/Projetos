// Roda antes de qualquer página. Esconde do público os arquivos internos do
// repositório (anotações, código da busca), que o Cloudflare Pages publicaria
// junto com o site.
const INTERNOS = /^\/(claude\.md|readme\.md|\.gitignore|_headers|lib\/|functions\/|robo\/|\.github\/)/i;

export async function onRequest({ request, next }) {
  const url = new URL(request.url);
  if (INTERNOS.test(url.pathname)) {
    return new Response("Página não encontrada", { status: 404 });
  }
  // O comparador ficava em /previa antes do lançamento: leva para a página principal
  if (/^\/previa(\.html)?\/?$/i.test(url.pathname)) {
    return Response.redirect(`${url.origin}/${url.search}`, 301);
  }
  return next();
}
