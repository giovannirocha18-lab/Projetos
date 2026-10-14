# Memória do projeto — Vai pro Carrinho

> Lido automaticamente pelo Claude no início de cada conversa.
> **Atualizar ao final de cada etapa importante** (seções "Situação atual" e "Próximos passos")
> e **sempre que pedir uma ação ao Giovanni** (seção "Em andamento"), para não perder o fio se a sessão reiniciar.
> **Nunca** colocar aqui senhas, Secrets, App IDs, CPF ou dados bancários.

## Sobre o dono e o jeito de trabalhar
- Giovanni, não é programador. Responder **sempre em português**, simples, passo a passo, com
  nomes de botões exatamente como aparecem na tela. Ele manda prints das telas.
- **Respostas curtas**: só o essencial e necessário, sem explicações extras (pedido dele em 14/10/2026,
  para economizar tokens).
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
- Commits que só mexem no `CLAUDE.md` (memória) levam **`[skip ci]`** na mensagem, para não gastar publicações
  do Cloudflare (limite de 500 por mês no plano grátis).
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
| Cadastro sem senha + carrinho na conta (código testado localmente) | ✅ funcionando (14/10/2026: código chegou no e-mail dele). Sessão dura 90 dias por aparelho |
| "Entrar com Google" (código pronto, botão só aparece com as chaves) | ⏳ Google Cloud (projeto "My Project 99984"): Branding feito e app publicado (14/10/2026). Falta criar o cliente OAuth + `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` no Cloudflare + Retry deployment + teste |
| Página "Em breve" + bloqueio do Google | ✅ |
| Domínio no Cloudflare | ✅ **Active** (13/10/2026) |
| Custom domains no projeto (`vaiprocarrinho.com.br` e `www`) | ✅ site abrindo no domínio (13/10/2026) |
| Shopee Afiliados: conta | ✅ aprovada |
| Shopee: dados fiscais | ⏳ em análise |
| Shopee: conta "Maree" (para receber pagamentos) | ❗ falta ativar (link "Como ativar?" no portal) |
| Shopee: Open API | ❗ sem acesso (14/10/2026: tela "Abrir API" com AppID/Senha vazios e "Aplicar" cinza; pede contato com a Shopee). **Pedido de acesso feito em 14/10/2026, aguardando resposta.** Quando liberar: "Senha" da tela = `SHOPEE_SECRET` |
| Mercado Livre Afiliados | ❗ não se inscreveu ainda. API de busca dá 403 para muitos devs (Reclame Aqui) |
| Segurança: print com senha do Registro.br (`registrobr.jpg`) | ✅ apagado do site e do histórico do GitHub (13/10/2026). ❗ Giovanni **ainda não trocou a senha** do Registro.br: cobrar. Conferir também deploys antigos no Cloudflare (Deployments) |

## Em andamento (resumo em 14/10/2026)
- **Nome: decidido manter "Vai Pro Carrinho"** (ver "Decisões"). Pedido da marca no INPI **adiado** (14/10/2026:
  Giovanni não consegue pagar a GRU de R$ 440 agora). Lembrar de retomar; ideal pagar antes de ~**21/01/2027**.
  Passos quando retomar:
  1. Falta a busca "vai pro carrinho" (separado) no INPI. Já feitas: "vaiprocarrinho" = nada; "pro carrinho" = só
     "Maxpro Carrinhos e Ferramentas" (classe 35, risco baixo na avaliação do Claude).
  2. GRU serviço **389** (pedido eletrônico com especificação pré-aprovada) → pagar → guardar o número da GRU.
     **Valores corretos** (tabela oficial INPI de 20/12/2025): 389 = **R$ 440 com desconto** / R$ 880 sem;
     394 = R$ 860 / R$ 1.720. Os R$ 142 citados antes eram da tabela antiga (erro do Claude, corrigido com ele).
     A GRU dele saiu R$ 440 = já com o desconto. Ainda haverá a taxa de concessão no deferimento (conferir na tabela).
     (14/10/2026: ele perguntou 389 x 394. Explicado: 394 = especificação escrita à mão, mais cara e com mais risco de
     exigência do INPI; recomendado 389. A GRU paga define o tipo de formulário no e-Marcas.)
  3. Protocolar no **e-Marcas**: apresentação nominativa, natureza de serviço, classe NCL **35** (comparação de preços;
     publicidade/divulgação de produtos de terceiros). Claude ajuda a escolher a especificação pelo print.
  - Prazo do INPI explicado (14/10/2026): decisão leva hoje ~14 a 20 meses (TCU: média sem oposição foi de 7 para
    19 meses); fila grande, 60 dias obrigatórios de oposição, poucos examinadores. A data do depósito já garante a
    prioridade; o ® só depois do certificado.
  4. Depois: comprar `vaiprocarrinho.com` pelo "Buy domain" do Cloudflare e redirecionar para o `.com.br`.
  - Contexto: 12+ perfis "Vai Pro Carrinho" de achadinhos no Instagram/TikTok (nenhum com site ou marca no INPI).
    Riscos explicados: INPI pode negar por expressão de uso comum (art. 124 VI/VII LPI) e terceiros podem contestar
    com uso de boa-fé há 6+ meses (art. 129 §1º; o perfil mais ativo posta desde 21/07/2026 → prazo ~21/01/2027).
    Por isso: depositar o quanto antes. Pior caso: perde a GRU e segue usando o nome sem exclusividade.
- **Cadastro do site**: ✅ testado e funcionando (14/10/2026).
- **Entrar com Google** (14/10/2026): ele pediu Google ou e-mail+senha; feito Google (senha não recomendada).
  Aguardando ele criar as credenciais no Google Cloud e cadastrar no Cloudflare.
- Domínio e site no ar em vaiprocarrinho.com.br (página "Em breve"), fora do Google (noindex conferido).

## Próximos passos
2. Giovanni testar `/previa` no celular e dar opinião sobre o visual.
3. Colocar produtos reais: Giovanni manda links de afiliado da Shopee (Oferta > Link personalizado) com nome e
   preço; Claude cadastra em `lib/fontes/curadoria.js`. Juntar uns 20–30 antes, porque os exemplos somem.
4. Quando a API da Shopee sair: cadastrar as chaves no Cloudflare, testar e ajustar `lib/fontes/shopee.js`.
5. Depois: Mercado Livre (curadoria com gerador de links em lote), AliExpress, Amazon, redes Awin/Lomadee.
6. Lançamento: ver "Para lançar o site" no README. Antes: verificar o domínio no Resend (+ `EMAIL_REMETENTE`)
   e criar `contato@vaiprocarrinho.com.br` (Cloudflare Email Routing; exige trocar o MX nulo).

## Decisões do Giovanni
- **Mantém o nome "Vai Pro Carrinho"** (14/10/2026), ciente dos perfis com o mesmo nome e dos riscos de marca.
  Nomes alternativos pesquisados, caso mude de ideia: Baratim, Cotaí, Precinzo, Cotaly.
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
