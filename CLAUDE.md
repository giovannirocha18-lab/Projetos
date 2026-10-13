# Memória do projeto — Vai pro Carrinho

> Lido automaticamente pelo Claude no início de cada conversa.
> **Atualizar ao final de cada etapa importante** (seções "Situação atual" e "Próximos passos").
> **Nunca** colocar aqui senhas, Secrets, App IDs, CPF ou dados bancários.

## Sobre o dono e o jeito de trabalhar
- Giovanni, não é programador. Responder **sempre em português**, simples, passo a passo, com
  nomes de botões exatamente como aparecem na tela. Ele manda prints das telas.
- Pedir que **nunca** mande senhas ou chaves secretas no chat nem suba no GitHub.
- Quando ele pedir "gera o comando de recomeço": atualizar este arquivo, fazer commit/push e
  entregar o texto da seção "Comando de recomeço".

## O que é o site
**vaiprocarrinho.com.br**: comparador de preços. O visitante busca um produto e o site lista
ofertas de várias lojas (Shopee, Mercado Livre, Amazon, AliExpress, Magalu, Shein…), todas com o
link de afiliado do Giovanni. Estratégia: Shopee em volume (API), Mercado Livre em curadoria.

## Estrutura técnica (ver README.md)
- Site estático + **Cloudflare Pages Functions**, sem build. Repositório `giovannirocha18-lab/Gerador-de-Riquezas` (privado).
- `index.html` = página "Em breve" (pública). `previa.html` = comparador (teste em `/previa`).
- `functions/api/buscar.js` = busca; junta as fontes de `lib/fontes/`, cache de 1h.
- `lib/fontes/exemplo.js` = produtos fictícios (usado enquanto nenhuma fonte real está ligada).
- `lib/fontes/curadoria.js` = produtos escolhidos à mão com link de afiliado (lista `PRODUTOS`).
  Com 1 produto ou mais, o site deixa de mostrar os exemplos. Giovanni manda os links; Claude cadastra.
- `lib/fontes/shopee.js` = API GraphQL de afiliados da Shopee; liga com as variáveis
  `SHOPEE_APP_ID` e `SHOPEE_SECRET` no Cloudflare. **Escrito pela documentação, nunca testado.**
- `_headers` + `<meta robots noindex>` escondem o site do Google até o lançamento.
- Testar local: `npx wrangler pages dev .` (rodar **de dentro do repositório**) e abrir `/previa`.
- A rede do ambiente do Claude bloqueia `*.pages.dev`, API e docs do Mercado Livre e DNS externo.

## Hospedagem e domínio
- Cloudflare Pages, projeto **vaiprocarrinho** → `vaiprocarrinho.pages.dev`. Deploy automático.
- **Production branch = `claude/inspiring-hamilton-wafagr`** (não é a `main`!). Se uma conversa
  nova trabalhar em outra branch, as mudanças não vão para o ar: trazer para essa branch, ou
  levar o site para a `main` por PR e trocar em Settings > Builds > Production branch.
- Domínio registrado no Registro.br; nameservers trocados para o Cloudflare.
- Cloudflare criou registros "sem e-mail" (MX nulo, SPF -all, DMARC reject). Trocar se um dia
  quiser e-mail no domínio.

## Situação atual (atualizado em 13/10/2026)
| Item | Situação |
|---|---|
| Site publicado em `vaiprocarrinho.pages.dev` | ✅ |
| Comparador com produtos de exemplo em `/previa` | ✅ |
| Lista de produtos reais (curadoria) pronta para receber links | ✅ vazia, aguardando links |
| Página "Em breve" + bloqueio do Google | ✅ |
| Domínio no Cloudflare | ⏳ "Invalid nameservers / pending", aguardando propagação |
| Custom domains no projeto (`vaiprocarrinho.com.br` e `www`) | ⏳ só dá para adicionar depois do domínio ficar **Active** |
| Shopee Afiliados: conta | ✅ aprovada |
| Shopee: dados fiscais | ⏳ em análise |
| Shopee: conta "Maree" (para receber pagamentos) | ❗ falta ativar (link "Como ativar?" no portal) |
| Shopee: Open API | ❗ ele vai pedir depois que o cadastro estiver todo validado |
| Mercado Livre Afiliados | ❗ não se inscreveu ainda. API de busca dá 403 para muitos devs (Reclame Aqui) |
| Segurança: print com senha do Registro.br (`registrobr.jpg`) | ✅ apagado do site e do histórico do GitHub (13/10/2026). ❗ Giovanni **ainda não trocou a senha** do Registro.br: cobrar. Conferir também deploys antigos no Cloudflare (Deployments) |

## Próximos passos
1. Quando o domínio ficar Active: Workers & Pages > vaiprocarrinho > Custom domains > adicionar os dois domínios.
2. Giovanni testar `/previa` no celular e dar opinião sobre o visual.
3. Colocar produtos reais: Giovanni manda links de afiliado da Shopee (Oferta > Link personalizado) com nome e
   preço; Claude cadastra em `lib/fontes/curadoria.js`. Juntar uns 20–30 antes, porque os exemplos somem.
4. Quando a API da Shopee sair: cadastrar as chaves no Cloudflare, testar e ajustar `lib/fontes/shopee.js`.
5. Depois: Mercado Livre (curadoria com gerador de links em lote), AliExpress, Amazon, redes Awin/Lomadee.
6. Lançamento: ver "Para lançar o site" no README.

## Comando de recomeço
Texto para colar numa conversa nova:

> Estamos continuando o projeto do site vaiprocarrinho.com.br. Leia o CLAUDE.md e o README.md do
> repositório, me diga em poucas linhas onde paramos e quais são os próximos passos, e continue
> trabalhando na branch claude/inspiring-hamilton-wafagr.
