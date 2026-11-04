// "Não contar minhas visitas" (pedido do Giovanni, 04/11/2026): quem abre vaiprocarrinho.com.br/?nao-contar=1 ganha o cookie
// vpc_nao_contar=1 (app.js; o painel tem o botão). Com ele, o aparelho não entra nas visitas (o _middleware.js tira o Web
// Analytics da página pela CSP), nas buscas em alta (functions/api/buscar.js) nem nos cliques (functions/api/clique.js).
// /?nao-contar=0 volta a contar. O cookie não identifica ninguém: só diz "não conte".
export const COOKIE_NAO_CONTAR = "vpc_nao_contar";
export const naoContar = (request) =>
  new RegExp(`(?:^|;\\s*)${COOKIE_NAO_CONTAR}=1(?:;|$)`).test(request.headers.get("Cookie") || "");
