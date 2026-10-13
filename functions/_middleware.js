// Roda antes de qualquer página. Esconde do público os arquivos internos do
// repositório (anotações, código da busca), que o Cloudflare Pages publicaria
// junto com o site.
const INTERNOS = /^\/(claude\.md|readme\.md|\.gitignore|_headers|lib\/|functions\/)/i;

export async function onRequest({ request, next }) {
  if (INTERNOS.test(new URL(request.url).pathname)) {
    return new Response("Página não encontrada", { status: 404 });
  }
  return next();
}
