# Memória do projeto — Vai pro Carrinho

> Lido automaticamente pelo Claude no início de cada conversa.
> **Atualizar ao final de cada etapa importante** (seções "Situação atual" e "Próximos passos")
> e **sempre que pedir uma ação ao Giovanni** (seção "Em andamento"), para não perder o fio se a sessão reiniciar.
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
- `lib/conta.js` + `functions/api/conta/*` = cadastro sem senha (código por e-mail via Resend), sessão por
  cookie, "Meu carrinho" salvo na conta (D1, binding `DB`; tabelas criadas sozinhas). Ver README.
- `privacidade.html` = Política de Privacidade. Cita `contato@vaiprocarrinho.com.br`, que **ainda não existe**.
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
| Favoritos virou "Meu carrinho" (ícone de carrinho) | ✅ |
| Cadastro sem senha + carrinho na conta (código testado localmente) | ⏳ falta Giovanni criar o D1, ligar como `DB`, criar conta no Resend e cadastrar `RESEND_API_KEY` |
| Página "Em breve" + bloqueio do Google | ✅ |
| Domínio no Cloudflare | ✅ **Active** (13/10/2026) |
| Custom domains no projeto (`vaiprocarrinho.com.br` e `www`) | ✅ site abrindo no domínio (13/10/2026) |
| Shopee Afiliados: conta | ✅ aprovada |
| Shopee: dados fiscais | ⏳ em análise |
| Shopee: conta "Maree" (para receber pagamentos) | ❗ falta ativar (link "Como ativar?" no portal) |
| Shopee: Open API | ❗ ele vai pedir depois que o cadastro estiver todo validado |
| Mercado Livre Afiliados | ❗ não se inscreveu ainda. API de busca dá 403 para muitos devs (Reclame Aqui) |
| Segurança: print com senha do Registro.br (`registrobr.jpg`) | ✅ apagado do site e do histórico do GitHub (13/10/2026). ❗ Giovanni **ainda não trocou a senha** do Registro.br: cobrar. Conferir também deploys antigos no Cloudflare (Deployments) |

## Em andamento (resumo em 13/10/2026)
- **Decisão pendente do Giovanni sobre o nome.** Há vários perfis "Vai Pro Carrinho" de achadinhos nas redes
  (Instagram @vaiprocarrinho_oficial e @vaiprocarrinho.shop, TikTok @vai.pro.carrinho, YouTube, Linktree).
  Nenhum tem site (vai.pro.carrinho.br não existe). Opções apresentadas:
  - **A) Manter o nome**: falta buscar "vai pro carrinho" (separado) no INPI; se livre, GRU serviço **389**
    (~R$ 142 com desconto de pessoa física; se der ~R$ 355, o desconto não entrou) e depois protocolar no
    **e-Marcas**: nominativa, natureza serviço, classe NCL **35** (comparação de preços, publicidade de produtos de
    terceiros). Depois comprar `vaiprocarrinho.com` pelo "Buy domain" do Cloudflare e redirecionar.
  - **B) Trocar o nome** antes do lançamento (recomendação do Claude): sugerir nomes, ele confere no INPI e no
    registro.br, registrar `.com.br` + `.com`, e trocar o nome no site todo.
  - Nomes sugeridos para a opção B (13/10/2026; busca rápida na web não achou uso; INPI/registro.br não
    conferidos porque a rede do Claude bloqueia): **Cotaly** e **Precinzo** (favoritos), Garimpaí, Achadex,
    Lupreço, Ofertô. Evitados: "carrinho" (confusão com os perfis), Comparaí (existe Compara.ai), nomes
    parecidos com Buscapé, Zoom, Promobit, Pelando, JáCotei, Precifica, KuantoKusta. Aguardando ele conferir.
  - Buscas no INPI já feitas: "vaiprocarrinho" = nada; "pro carrinho" = só "Maxpro Carrinhos e Ferramentas"
    (classe 35, registrada; risco baixo na avaliação do Claude, mas quem decide é o INPI).
  - Explicado: no Brasil a marca é de quem deposita primeiro no INPI (exceção: uso de boa-fé há 6+ meses,
    art. 129 §1º LPI); domínio não dá direito à marca. Sugerido consultar advogado de propriedade intelectual.
- **Cadastro do site**: banco D1 já criado. Faltam: binding `DB` → conta Resend + API key → secret
  `RESEND_API_KEY` → Retry deployment → ele testar o login em `/previa` e mandar print.
- Domínio e site no ar em vaiprocarrinho.com.br (página "Em breve"), fora do Google (noindex conferido).

## Próximos passos
0. Ligar o cadastro: D1 + binding `DB` + `RESEND_API_KEY` (passo a passo no README), refazer o deploy e testar
   com o e-mail dele (o Resend sem domínio verificado só entrega para o e-mail dono da conta Resend).
2. Giovanni testar `/previa` no celular e dar opinião sobre o visual.
3. Colocar produtos reais: Giovanni manda links de afiliado da Shopee (Oferta > Link personalizado) com nome e
   preço; Claude cadastra em `lib/fontes/curadoria.js`. Juntar uns 20–30 antes, porque os exemplos somem.
4. Quando a API da Shopee sair: cadastrar as chaves no Cloudflare, testar e ajustar `lib/fontes/shopee.js`.
5. Depois: Mercado Livre (curadoria com gerador de links em lote), AliExpress, Amazon, redes Awin/Lomadee.
6. Lançamento: ver "Para lançar o site" no README. Antes: verificar o domínio no Resend (+ `EMAIL_REMETENTE`)
   e criar `contato@vaiprocarrinho.com.br` (Cloudflare Email Routing; exige trocar o MX nulo).

## Decisões do Giovanni
- **Sem aviso de link de afiliado/comissão visível no site** (pedido dele em 13/10/2026). Os links mantêm
  `rel="sponsored"` (invisível, exigido pelo Google). Se entrar no programa da Amazon, ela **exige** um aviso
  ("Como Associado da Amazon…"): avisar o Giovanni e recolocar só o necessário.

## Planos combinados para o futuro (tudo no Cloudflare, sem VPS)
- **Robô de preços** (Cron Triggers) + **banco de dados D1**: só via APIs oficiais e feeds de
  afiliados (Shopee, AliExpress, Awin, Lomadee). **Nunca** raspar páginas das lojas (proibido, risco
  de perder a conta de afiliado). Guardar histórico de preços ("menor preço em 30 dias").
- **"Meu carrinho"** (renomear Favoritos): lista de itens salvos para compra futura. Sem cadastro
  fica só no aparelho; com cadastro sincroniza entre aparelhos e junta o que já estava salvo.
- **Cadastro mínimo**: só nome e e-mail, **sem senha** (código por e-mail e/ou "Entrar com Google").
  LGPD: pedir o mínimo, ter página de Política de Privacidade, alerta por e-mail só com autorização.
- Ordem: 1) produtos reais + lançamento; 2) robô + banco quando a API da Shopee sair;
  3) cadastro + alertas de preço quando houver visitantes.

## Comando de recomeço
Texto para colar numa conversa nova:

> Estamos continuando o projeto do site vaiprocarrinho.com.br. Leia o CLAUDE.md e o README.md do
> repositório, me diga em poucas linhas onde paramos e quais são os próximos passos, e continue
> trabalhando na branch claude/inspiring-hamilton-wafagr.
