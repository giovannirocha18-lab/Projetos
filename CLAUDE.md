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
- Site estático + **Cloudflare Pages Functions**, sem build. Repositório `giovannirocha18-lab/Projetos` (privado; renomeado de `Gerador-de-Riquezas` em 14/10/2026).
- `index.html` = página "Em breve" (pública). `previa.html` = comparador (teste em `/previa`).
- `functions/api/buscar.js` = busca; junta as fontes de `lib/fontes/`, cache de 1h.
- `lib/fontes/exemplo.js` = produtos fictícios (usado enquanto nenhuma fonte real está ligada).
- `lib/fontes/curadoria.js` = produtos escolhidos à mão com link de afiliado (lista `PRODUTOS`).
  Com 1 produto ou mais, o site deixa de mostrar os exemplos. Giovanni manda os links; Claude cadastra.
- `lib/fontes/shopee.js` = API GraphQL de afiliados da Shopee (busca ao vivo, 30 por busca, sortType 1 = relevância;
  destaques = mais vendidos). Chaves `SHOPEE_APP_ID` e `SHOPEE_SECRET` no Cloudflare. ✅ **Funcionando desde 15/10/2026.**
  Ofertas da Shopee ainda **não** entram no histórico de preço (só as do robô da Awin).
- `lib/conta.js` + `functions/api/conta/*` = cadastro com "Entrar com Google" ou e-mail + senha ("Esqueci minha senha"
  manda link por e-mail via Resend; login por código foi removido em 14/10/2026), sessão por cookie, "Meu carrinho" salvo na conta (D1, binding `DB`; tabelas criadas sozinhas). Ver README.
- `lib/fontes/awin.js` = lojas da Awin: busca na tabela `ofertas` do D1 (índice FTS5 `ofertas_fts`). Liga sozinha quando
  houver ofertas `fonte='awin'` no banco. Ofertas de lojas fora da lista `LOJAS` do `app.js` levam `lojaNome`.
- `lib/ofertas.js` = criação das tabelas `ofertas`, `ofertas_fts` (com gatilhos) e `precos` (histórico de preço por dia).
- `robo/awin.mjs` = **robô de preços**: baixa a lista de feeds da Awin (chave `AWIN_FEED_KEY`), pega os das lojas aprovadas
  (região BR) e atualiza o D1 pela API do Cloudflare (só grava o que mudou; limite 20 mil/dia; não apaga nada se o feed
  falhar ou encolher mais da metade). Roda pelo GitHub Actions (`.github/workflows/robo-precos.yml`, 04:17 BRT).
  Teste local: `node robo/awin.mjs --feed robo/exemplo-awin.csv --sqlite /tmp/teste.sqlite`. Ver README.
- `privacidade.html` = Política de Privacidade. Cita `contato@vaiprocarrinho.com.br`, que **ainda não existe**.
- `_headers` + `<meta robots noindex>` escondem o site do Google até o lançamento.
- Testar local: `npx wrangler pages dev .` (rodar **de dentro do repositório**) e abrir `/previa`.
- A rede do ambiente do Claude bloqueia `*.pages.dev`, API e docs do Mercado Livre e DNS externo.

## Hospedagem e domínio
- Cloudflare Pages, projeto **vaiprocarrinho** → `vaiprocarrinho.pages.dev`. Deploy automático.
- Commits que só mexem no `CLAUDE.md` (memória) levam **`[skip ci]`** na mensagem, para não gastar publicações
  do Cloudflare (limite de 500 por mês no plano grátis).
- **Production branch = `claude/inspiring-hamilton-wafagr`** (não é a `main`!). Desde 14/10/2026 ela também é a
  **branch padrão (default) do GitHub**. Se uma conversa
  nova trabalhar em outra branch, as mudanças não vão para o ar: trazer para essa branch, ou
  levar o site para a `main` por PR e trocar em Settings > Builds > Production branch.
- Domínio registrado no Registro.br; nameservers trocados para o Cloudflare.
- Cloudflare criou registros "sem e-mail" (MX nulo, SPF -all, DMARC reject). Trocar se um dia
  quiser e-mail no domínio.

## Situação atual (atualizado em 15/10/2026)
| Item | Situação |
|---|---|
| Site publicado em `vaiprocarrinho.pages.dev` | ✅ |
| Comparador com produtos de exemplo em `/previa` | ✅ |
| Lista de produtos reais (curadoria) pronta para receber links | ✅ vazia, aguardando links |
| Favoritos virou "Meu carrinho" (ícone de carrinho) | ✅ |
| Cadastro sem senha + carrinho na conta (código testado localmente) | ✅ funcionando (14/10/2026: código chegou no e-mail dele). Sessão dura 90 dias por aparelho |
| "Entrar com Google" (código pronto, botão só aparece com as chaves) | ✅ funcionando (14/10/2026). Google Cloud: projeto "My Project 99984", app publicado |
| Página "Em breve" + bloqueio do Google | ✅ |
| Domínio no Cloudflare | ✅ **Active** (13/10/2026) |
| Custom domains no projeto (`vaiprocarrinho.com.br` e `www`) | ✅ site abrindo no domínio (13/10/2026) |
| Shopee Afiliados: conta | ✅ aprovada |
| Shopee: dados fiscais | ⏳ em análise |
| Shopee: conta "Maree" (para receber pagamentos) | ❗ falta ativar (link "Como ativar?" no portal) |
| Shopee: Open API | ❗ sem acesso (14/10/2026: tela "Abrir API" com AppID/Senha vazios e "Aplicar" cinza; pede contato com a Shopee). **Pedido de acesso feito em 14/10/2026.** 15/10/2026: ✅ **API liberada e FUNCIONANDO no site** (chaves SHOPEE_APP_ID/SHOPEE_SECRET no Cloudflare; teste /api/buscar?q=fone bluetooth → shopee ok, 30 produtos com link de afiliado s.shopee.com.br, foto, preço, desconto, avaliação, vendidos). Quando liberar: "Senha" da tela = `SHOPEE_SECRET` |
| Awin (rede de afiliados) | ✅ conta aprovada (ID 3124296). Lojas: só EINSTAR aprovada (EUA); pedidos em lojas BR pendentes |
| Robô de preços (Awin → D1, GitHub Actions 04:17) | ✅ funcionando. 31 produtos reais (EINSTAR) no site, com preço convertido do dólar |
| Histórico de preço + produto agrupado por código de barras | ✅ publicado (15/10/2026); ganha dados com o tempo |
| AliExpress Afiliados | ⏳ cadastro em análise (14/10/2026); depois pegar chaves da API |
| Logo e imagens do Instagram | ✅ em `marca/` |
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
- **Entrar com Google** funcionando (14/10/2026). Depois ele pediu para **trocar o código por e-mail por cadastro com
  e-mail + senha** (com "Esqueci minha senha" por link): feito e testado localmente. Falta ele testar no site.
- Domínio e site no ar em vaiprocarrinho.com.br (página "Em breve"), fora do Google (noindex conferido).
- **Outras APIs enquanto a Shopee não libera** (pesquisado em 14/10/2026): 1º **AliExpress** (portals.aliexpress.com +
  Open Platform; cadastro aberto, API de busca + link de afiliado); 2º **Lomadee** (Affiliate API, várias lojas BR);
  3º **Awin** (feeds de produtos, aprovação loja por loja); Amazon só depois de **10 vendas em 30 dias** (Creators API).
  **Decidido começar pela AliExpress** (14/10/2026). Links enviados: portals.aliexpress.com (afiliado) e
  openservice.aliexpress.com (API). **Cadastro de afiliado enviado em 14/10/2026: em análise** (1h a 2 dias úteis;
  resposta por e-mail; nova verificação em até 1 semana). Site cadastrado como "Sem rede", Brasil. Depois de aprovado:
  cadastro no openservice.aliexpress.com para pegar App Key/App Secret (vão como Secrets no Cloudflare).
  Próximas sugeridas (14/10/2026): **Lomadee** (lomadee.com.br; ~350 lojas; API nova não confirmou busca por palavra,
  conferir com a conta aberta; pesquisado 14/10/2026: cadastro grátis sem CNPJ, Pix, comissão definida por loja ~4–11%,
  validação até 90 dias, regras de canal por loja no painel, reclamações de atraso no Reclame Aqui; site deles bloqueado
  na rede do Claude) e **Awin** (awin.com/br, como "Publisher"; feeds de produtos por loja; pesquisado 14/10/2026: depósito de R$ 5
  devolvido no 1º pagamento; sem busca ao vivo, e sim arquivos de produtos (Create-a-Feed / Product Feed List) para
  baixar no banco D1 e buscar lá = robô de preços; comparadores são o público principal dos feeds; cada loja aprova;
  uma página cita taxa de 25% sobre a comissão, conferir no painel. Cuidado: awin.br.com NÃO é o site oficial).
  **Awin: cadastro concluído e ID de afiliado liberado (14/10/2026).** Tipos marcados: Mecanismo de Comparação +
  Criadores de Conteúdo. Próximo: ele pedir entrada em lojas BR com feed de produtos (menu Anunciantes); depois
  Ferramentas > "Crie um Feed" gera o link de download, que **contém chave secreta** (vai como Secret no Cloudflare,
  nunca no chat). Lista da Awin analisada em 14/10/2026 (71 lojas com feed, 56 BR). Recomendadas: Grupo 1 (eletro/ar,
  mesmas categorias em várias lojas = comparação real): Leveros, Central Ar, Dufrio, Efacil, Ferreira Costa, Lojas Benoit,
  Panasonic, Arno, Shark-Ninja, Compra Certa, IBBL, Spicy, Elements, Motorola, Kabum. Grupo 2 (multimarcas): Beleza na
  Web, Posthaus, Cobasi, Centauro. Grupo 3 (marcas): Animale, Estée Lauder, Calvin Klein, Trussardi, Karsten, Jo Malone,
  Lego, adidas, Nike, Olympikus, Mizuno, ASICS. Evitar: Brastemp (EPC 0,01), Kipling/Legale (aprovação <50%), Luuna
  (174 dias p/ pagar), lojas estrangeiras/eróticas/VPN. Cookie de 1 dia (Efacil, Central Ar, Kabum, Cobasi, Olympikus,
  Centauro, MAC) rende menos. Ideia sugerida: nicho de lançamento "ar-condicionado e eletrodomésticos".
  **Robô de preços da Awin programado e testado localmente (14/10/2026)**, ainda sem dados reais. Falta o Giovanni:
  (a) ✅ branch padrão do GitHub trocada para `claude/inspiring-hamilton-wafagr` (14/10/2026, conferido); (b) segredos no GitHub: ✅ CLOUDFLARE_ACCOUNT_ID, ✅ D1_DATABASE_ID (banco "vaiprocarrinho"),
  ✅ CLOUDFLARE_API_TOKEN (token "robo-precos", D1 Edit) cadastrados e testados; ✅ AWIN_FEED_KEY = link da "Lista de Feed" (15/10/2026);
  (c) depois da 1ª loja aprovada, rodar em Actions > Robô de preços > Run workflow e mandar print do resumo.
  Nomes das colunas da lista de feeds da Awin foram deduzidos da documentação: conferir na 1ª execução real.
  15/10/2026: a Awin mostra o link novo da lista em Ferramentas > Crie um Feed > caixa "Download da Lista de Feed"
  (formato ui.awin.com/productdata-darwin-download/publisher/<id>/<chave>/1/feedList). O segredo AWIN_FEED_KEY deve
  ser esse link inteiro (o robô aceita link ou chave; 1ª tentativa só com a chave deu HTTP 400). O robô registra no log
  as colunas e situações da lista para conferência.
  **15/10/2026: robô rodou com sucesso (execução #3).** Lista lida: 907 feeds, todos "Not Joined" (nenhuma loja aprovou
  ainda). Colunas reais: advertiser_id, advertiser_name, primary_region, membership_status, datafeed_format, feed_id,
  feed_name, language, vertical, last_imported, last_checked, no_of_products, url. Robô aceita "Joined"/"active".
  Na 1ª loja aprovada, conferir no log: produtos aceitos e o `datafeed_format` (o robô lê o formato padrão da Awin:
  aw_product_id, product_name, search_price, aw_deep_link… e, desde 15/10/2026, também o formato Google: title, price,
  sale_price, link, image_link, availability; se o link vier sem rastreio da Awin, monta awin1.com/cread.php com
  awinaffid = ID de afiliado 3124296, tirado do link da Lista de Feed). A Awin avisou que as lojas estão migrando para o formato Google.
  Roda sozinho todo dia 04:17; quando uma loja aprovar, os produtos entram na madrugada seguinte.
  **15/10/2026: 1ª aprovação = EINSTAR** (scanner 3D, loja dos EUA, preço em dólar). Execução #4 confirmou: status de loja
  aprovada na lista = "active" (5 feeds da EINSTAR), mas o robô ignora de propósito (região US / moeda USD).
  Nenhuma loja BR aprovada ainda.
  **15/10/2026: decisão do Giovanni — aceitar lojas de fora do Brasil** (ex.: Shein envia de fora). Robô agora aceita
  todas as regiões; converte USD/EUR/GBP… para BRL pela AwesomeAPI (regrava só se o câmbio mudar >3%); escolhe 1 feed
  por loja estrangeira (pt > EUA/inglês > maior); colunas novas `internacional` e `moeda` (migração automática).
  Site mostra selo "🌎 Internacional · valor aproximado" (dica: pode haver impostos de importação).
  **15/10/2026, execução #6: primeiros produtos reais no banco!** 31 produtos da EINSTAR / SHINING 3D (feed US/inglês,
  formato Google com aw_deep_link; 100 fora de estoque ignorados). Cotação: AwesomeAPI não trouxe o dólar (talvez exija
  chave agora); usou ExchangeRate-API (open.er-api.com). Com ofertas reais no banco, o `/previa` deixou de mostrar os
  produtos de exemplo (só aparecem os 31 scanners até outras lojas aprovarem). Pedido ao Giovanni: conferir no `/previa`
  buscando "scanner".
- **Instagram oficial** sendo criado (14/10/2026). Claude gerou foto de perfil (carrinho branco/amarelo no gradiente
  roxo→rosa do site) e um post "Em breve", 1080x1080. Imagens não ficam no repositório (geradas em HTML + Chromium).
- **Logo** criada (14/10/2026): ícone (quadrado arredondado com gradiente do site + carrinho branco/amarelo) + texto
  "Vai pro Carrinho" em Plus Jakarta Sans 800. Versões em `marca/`: `logo-claro` (fundo branco), `logo-escuro`
  (fundo escuro/gradiente), `logo-icone` 1024px e `vaiprocarrinho-icone.svg`. PNGs com fundo transparente.

- **Análise de concorrentes (15/10/2026)**: Zoom/Buscapé (mesmo dono, grupo Mosaico/Banco PAN): página por produto com
  todas as lojas, histórico de preço (40 dias / 6 meses), alerta de queda por e-mail/WhatsApp, extensão de navegador.
  Pelando (comunidade vota "temperatura") e Promobit (equipe confere as ofertas, cupons). Google Shopping: cobertura.
  Sugeridas para nós, em ordem: 1) histórico de preço + selo "menor preço em 30 dias" (a tabela `precos` já guarda);
  2) agrupar o mesmo produto de várias lojas pelo código de barras (GTIN/EAN; feeds formato Google trazem `gtin`);
  3) alerta de preço por e-mail (já temos conta + Resend); 4) cupons das lojas (Awin "Minhas Ofertas"); 5) desconto
  verificado pelo histórico (evita "desconto falso"). **Giovanni escolheu 1 e 2; feitos em 15/10/2026:**
  - Robô guarda `gtin` (código de barras com 14 dígitos; migração + índice `ofertas_gtin`).
  - `lib/ofertas.js` `comHistorico()`: a busca da Awin junta o resumo do histórico (`historico.menorEm30Dias` só com
    30+ dias de acompanhamento e preço que variou; `historico.caiu` = % da última queda, se nos últimos 7 dias).
  - `/api/historico?id=` devolve os pontos; no site, botão "📈 Histórico de preço" abre janela com gráfico em degraus
    (Hoje/Menor/Maior + dica ao passar o dedo). Selos "📉 Menor em 30 dias" e "📉 Baixou X%".
  - Site agrupa ofertas com o mesmo `gtin`: um cartão com o menor preço + "+ N lojas com este produto" (lista com preço/link).
  - Execução #7 do robô gravou o gtin nos 31 produtos da EINSTAR (migração aplicada no D1). Publicado.
- Convite na Awin de "World Businesses for Sale" (venda de empresas, Reino Unido, libras): recomendado **não aceitar**
  (não é produto de consumo; o feed poluiria a busca). Regra geral: convites de lojas fora do perfil = recusar.

## Próximos passos
1. Giovanni: acompanhar aprovações das lojas BR na Awin (aba "Inscrito"); recusar convites fora do perfil.
   Quando entrar a 1ª loja BR, conferir o log do robô (Actions > Robô de preços) e os produtos no `/previa`.
2. AliExpress: quando aprovar, cadastro no openservice.aliexpress.com, chaves como Secrets no Cloudflare, Claude escreve
   `lib/fontes/aliexpress.js`.
3. Giovanni testar `/previa` no celular (busca "scanner") e opinar sobre o visual; testar cadastro com e-mail + senha.
4. Quando houver visitantes: alerta de preço por e-mail (item 3 da análise de concorrentes); depois cupons e desconto
   verificado pelo histórico.
5. ✅ Shopee ligada (15/10/2026). Ideia futura: guardar preços da Shopee no histórico (robô consultando os mais buscados).
6. Lançamento: ver "Para lançar o site" no README (esperar ter várias lojas BR). Antes: verificar o domínio no Resend
   (+ `EMAIL_REMETENTE`) e criar `contato@vaiprocarrinho.com.br` (Cloudflare Email Routing; exige trocar o MX nulo).
7. Pendências do Giovanni: trocar a senha do Registro.br; INPI (pagar GRU antes de ~21/01/2027).

## Decisões do Giovanni
- **Aceitar lojas internacionais** (15/10/2026), com preço convertido para reais e selo "Internacional".
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

> Estamos continuando o projeto do site vaiprocarrinho.com.br. Leia o CLAUDE.md e o README.md da
> branch claude/inspiring-hamilton-wafagr, me diga em poucas linhas onde paramos e quais são os próximos passos, e continue
> trabalhando na branch claude/inspiring-hamilton-wafagr.
