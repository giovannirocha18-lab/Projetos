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
- **Contexto da conversa** (pedido dele em 16/10/2026): **não** resumir/compactar (gasta tokens). Quando a conversa
  ficar longa (~20% do contexto usado; Claude estima, não há medidor exato), Claude por conta própria: atualiza este
  arquivo, faz commit/push com `[skip ci]` e avisa: "Abra uma conversa nova e cole o comando de recomeço" (texto no fim
  deste arquivo). O resumo automático configurado antes foi retirado.
- Quando ele pedir "gera o comando de recomeço": atualizar este arquivo, fazer commit/push e
  entregar o texto da seção "Comando de recomeço".

## O que é o site
**vaiprocarrinho.com.br**: comparador de preços. O visitante busca um produto e o site lista
ofertas de várias lojas (Shopee, Mercado Livre, Amazon, AliExpress, Magalu, Shein…), todas com o
link de afiliado do Giovanni. Estratégia: Shopee em volume (API), Mercado Livre em curadoria.

## Estrutura técnica (ver README.md)
- Site estático + **Cloudflare Pages Functions**, sem build. Repositório `giovannirocha18-lab/Projetos` (privado; renomeado de `Gerador-de-Riquezas` em 14/10/2026).
- `public/index.html` = **o comparador (página principal) desde 15/10/2026** (tudo que é publicado fica em `public/`). A antiga página "Em breve" foi apagada e o
  endereço `/previa` redireciona (301) para `/` (feito no `functions/_middleware.js`).
- `functions/api/buscar.js` = busca; junta as fontes de `lib/fontes/`, cache de 1h.
- `lib/fontes/exemplo.js` = produtos fictícios (usado enquanto nenhuma fonte real está ligada).
- `lib/fontes/curadoria.js` = produtos escolhidos à mão com link de afiliado (lista `PRODUTOS`).
  Com 1 produto ou mais, o site deixa de mostrar os exemplos. Giovanni manda os links; Claude cadastra.
- `lib/fontes/shopee.js` = API GraphQL de afiliados da Shopee (busca ao vivo, 48 por página, sortType 1 = relevância; botão "Ver mais resultados" pede a próxima página;
  destaques = mais vendidos). Chaves `SHOPEE_APP_ID` e `SHOPEE_SECRET` no Cloudflare. ✅ **Funcionando desde 15/10/2026.**
  Ofertas da Shopee, AliExpress e Lomadee entram no histórico de preço ao vivo (`historicoAoVivo`).
- `lib/conta.js` + `functions/api/conta/*` = cadastro com "Entrar com Google" ou e-mail + senha ("Esqueci minha senha"
  manda link por e-mail via Resend; login por código foi removido em 14/10/2026), sessão por cookie, "Meu carrinho" salvo na conta (D1, binding `DB`; tabelas criadas sozinhas). Ver README.
- `lib/fontes/awin.js` = lojas da Awin: busca na tabela `ofertas` do D1 (índice FTS5 `ofertas_fts`). Liga sozinha quando
  houver ofertas `fonte='awin'` no banco. Ofertas de lojas fora da lista `LOJAS` do `app.js` levam `lojaNome`.
- `lib/ofertas.js` = criação das tabelas `ofertas`, `ofertas_fts` (com gatilhos) e `precos` (histórico de preço por dia).
- `robo/awin.mjs` = **robô de preços**: baixa a lista de feeds da Awin (chave `AWIN_FEED_KEY`), pega os das lojas aprovadas
  (região BR) e atualiza o D1 pela API do Cloudflare (só grava o que mudou; trava de 300 mil por vez desde 23/10/2026, plano pago; não apaga nada se o feed
  falhar ou encolher mais da metade). Roda pelo GitHub Actions (`.github/workflows/robo-precos.yml`, 02:30 de Cuiabá desde 16/10/2026).
  Teste local: `node robo/awin.mjs --feed robo/exemplo-awin.csv --sqlite /tmp/teste.sqlite`. Ver README.
- `privacidade.html` = Política de Privacidade. Cita `contato@vaiprocarrinho.com.br` (✅ existe desde 26/10/2026, encaminha para o Gmail dele).
- `_headers` + `<meta robots noindex>` escondem o site do Google até o lançamento.
- Testar local: `npx wrangler pages dev public` (rodar **de dentro do repositório**; desde 17/10/2026 o site fica em `public/`) e abrir a página principal.
- Rede do ambiente do Claude: **"Completo" desde 16/10/2026** (Giovanni trocou em Ambiente > Edit > Acesso à rede). Antes
  bloqueava docs/API da Lomadee, AliExpress, Mercado Livre, `*.pages.dev`. Vale em conversas novas.

## Hospedagem e domínio
- Cloudflare Pages, projeto **vaiprocarrinho** → `vaiprocarrinho.pages.dev`. Deploy automático.
  Desde 16/10/2026 `vaiprocarrinho.pages.dev` redireciona (301) para `vaiprocarrinho.com.br` (no `_middleware.js`;
  o Cloudflare não deixa desligar o endereço .pages.dev). Prévias de outras branches continuam abrindo.
- Commits que só mexem no `CLAUDE.md` (memória) levam **`[skip ci]`** na mensagem, para não gastar publicações
  do Cloudflare (limite de 500 por mês no plano grátis). **Cuidado**: o Cloudflare olha só o último commit de cada push;
  se ele tiver `[skip ci]`, o push inteiro não é publicado. Fazer push do código ANTES do commit da memória, e nunca escrever essa marca no meio de outra mensagem (17/10/2026).
- **Production branch = `claude/inspiring-hamilton-wafagr`** (não é a `main`!). Desde 14/10/2026 ela também é a
  **branch padrão (default) do GitHub**. Se uma conversa
  nova trabalhar em outra branch, as mudanças não vão para o ar: trazer para essa branch, ou
  levar o site para a `main` por PR e trocar em Settings > Builds > Production branch.
- Domínio registrado no Registro.br; nameservers trocados para o Cloudflare.
- Cloudflare criou registros "sem e-mail" (MX nulo, SPF -all, DMARC reject). Trocar se um dia
  quiser e-mail no domínio.

## Situação atual (atualizado em 16/10/2026, fim da 3ª sessão; ver também as entradas de 17/10/2026 em "Em andamento")
| Item | Situação |
|---|---|
| Site publicado em `vaiprocarrinho.pages.dev` | ✅ |
| Comparador com produtos reais (Shopee + Awin + AliExpress) | ✅ (AliExpress desde 16/10/2026; falta Giovanni conferir AliExpress nas "Ofertas do dia" no site) |
| Lista de produtos reais (curadoria) pronta para receber links | ✅ vazia, aguardando links |
| Favoritos virou "Meu carrinho" (ícone de carrinho) | ✅ |
| Cadastro sem senha + carrinho na conta (código testado localmente) | ✅ funcionando (14/10/2026: código chegou no e-mail dele). Sessão dura 90 dias por aparelho |
| "Entrar com Google" (código pronto, botão só aparece com as chaves) | ✅ funcionando (14/10/2026). Google Cloud: projeto "My Project 99984", app publicado |
| Comparador na página principal (saiu o "Em breve") | ✅ 15/10/2026, ainda escondido do Google (noindex) |
| Domínio no Cloudflare | ✅ **Active** (13/10/2026) |
| Custom domains no projeto (`vaiprocarrinho.com.br` e `www`) | ✅ site abrindo no domínio (13/10/2026) |
| Shopee Afiliados: conta | ✅ aprovada. ID de afiliado **18326001319** (aparece nos links: `utm_source=an_18326001319`, `utm_medium=affiliates`; conferido 15/10/2026) |
| Shopee: dados fiscais | ⏳ em análise |
| Shopee: conta "Maree" (para receber pagamentos) | ❗ falta ativar (link "Como ativar?" no portal) |
| Shopee: Open API | ❗ sem acesso (14/10/2026: tela "Abrir API" com AppID/Senha vazios e "Aplicar" cinza; pede contato com a Shopee). **Pedido de acesso feito em 14/10/2026.** 15/10/2026: ✅ **API liberada e FUNCIONANDO no site** (chaves SHOPEE_APP_ID/SHOPEE_SECRET no Cloudflare; teste /api/buscar?q=fone bluetooth → shopee ok, 30 produtos com link de afiliado s.shopee.com.br, foto, preço, desconto, avaliação, vendidos). Quando liberar: "Senha" da tela = `SHOPEE_SECRET` |
| Awin (rede de afiliados) | ✅ conta aprovada (ID 3124296). Lojas aprovadas: EINSTAR (EUA), **Spicy e Shark-Ninja (BR, 15/10/2026)**; outras BR pendentes |
| Robô de preços (Awin → D1 + coleta Shopee, GitHub Actions 02:30 Cuiabá) | ✅ funcionando. Execução #10 (15/10/2026, disparada pelo Claude): 398 produtos (Spicy 349, Shark-Ninja 18, EINSTAR 31) |
| Histórico de preço + produto agrupado por código de barras | ✅ publicado (15/10/2026); ganha dados com o tempo |
| AliExpress Afiliados | ✅ **aprovado (16/10/2026)**. Cadastro de desenvolvedor no openservice.aliexpress.com ✅ aprovado (16/10/2026; "Affiliates (individual)", Brasil; Conformidade de Dados: Não/Não/Não/Não, local Brasil, Não/Não/Sim = **compromisso: apagar dados da AliExpress se a parceria acabar**). App "Vai pro Carrinho" criado (16/10/2026): categoria Affiliates API, status **Test**, 1000 chamadas/min, "Standard API for Publishers" ativa (Advanced API = hot products, inativa, opcional). Tracking ID `vaiprocarrinho` criado e posto como padrão (é o padrão no código). **`lib/fontes/aliexpress.js` pronto e publicado (16/10/2026)**: busca (até 3 páginas de 50, BRL, entrega BR, selo Internacional), vitrine por mais vendidos, histórico ao vivo como a Shopee, lojas intercaladas na lista; sem "Ofertas do dia" (precisa da Advanced API). Testado só com fetch falso (rede do Claude bloqueia api-sg.aliexpress.com). ✅ **FUNCIONANDO no site (16/10/2026)**: chaves no Cloudflare, teste `/api/buscar?q=mochila notebook` trouxe produtos da AliExpress intercalados com a Shopee (link s.click.aliexpress.com, fotos, preço em R$, vendedor). Vendidos da AliExpress costumam ser baixos (campo lastest_volume). **Filtro "Envio" (16/10/2026, pedido dele)**: barra lateral "Todos / 🇧🇷 Nacional / 🌎 Internacional" (campo `internacional`). A API da AliExpress não diz de onde sai o produto: `aliexpress.buscar` faz uma 2ª consulta com `delivery_days=5` (entrega no BR em até 5 dias = armazém no Brasil) e marca esses como nacionais com selo verde "🇧🇷 Envio do Brasil"; se a API recusar/ignorar o filtro, tudo fica internacional. **Não testado com a API real** (rede do Claude bloqueada): Giovanni conferir. Shopee conta como nacional (API não informa vendedor internacional). Cores dos botões (16/10/2026, pedido dele): **AliExpress roxo-azulado `#6d28d9`**, **Spicy vinho `#b0002a`**, **Kabum azul `#0060b1`** (20/10/2026) (`CORES_POR_NOME` no `app.js`, pelo começo do nome da loja da Awin); outras lojas da Awin roxas. **"Ofertas do dia" com AliExpress (16/10/2026, pedido dele)**: `destaques()` tenta a Advanced API (hotproduct.query); se recusar, usa 4 buscas das vitrines por página (mudam todo dia, espalhadas pelas categorias), mais vendidos com desconto e sem acessórios, 6 de cada, intercalados (24 por página). Próximo: Giovanni conferir no site; opcional pedir a "Advanced API" |
| Lomadee (rede de afiliados, ~133 lojas, PF) | ✅ **funcionando no site (16/10/2026)**: busca ao vivo + link com comissão no clique (`/api/ir`). Ver "Outras redes para PF" |
| Busca rápida | ✅ 16/10/2026: busca nova ~3 s (era 12–14 s); buscas populares prontas no banco (robô 02:30). ⏳ Conferir se as 91 ficaram prontas (Claude rodou o preparo manualmente no fim da sessão) |
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
  Roda sozinho todo dia (02:30 de Cuiabá); quando uma loja aprovar, os produtos entram na madrugada seguinte.
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
  - ~~Site agrupa ofertas com o mesmo `gtin`~~ **removido em 16/10/2026 (pedido do Giovanni: confundia; cada produto no seu
    próprio cartão)**. O robô continua guardando o `gtin`.
  - Execução #7 do robô gravou o gtin nos 31 produtos da EINSTAR (migração aplicada no D1). Publicado.
- **15/10/2026: 4 lojas recusaram na Awin.** Causa provável explicada: quem avalia abre vaiprocarrinho.com.br e vê só
  "Em breve" (sem produtos/visitas), conta nova, sem e-mail de contato. Sugerido: ver o motivo na aba "Recusado",
  trocar o "Em breve" pelo comparador (já tem Shopee real), criar contato@ e pedir de novo depois. Aguardando decisão.
  Motivos reais (print): **Leveros = "URL inativo, página não encontrada"** (viram o "Em breve"); **Central Ar e Dufrio =
  "não trabalha com afiliado pessoa física"** (exigem CNPJ; conta Awin dele é PF). Sugerido: comparador na página principal
  e, no futuro, avaliar abrir MEI (atualizar a conta Awin para PJ) para lojas que exigem CNPJ.
  ✅ Comparador colocado na página principal (15/10/2026). Próximo: Giovanni pedir de novo à Leveros em alguns dias.
  16/10/2026: mais uma loja recusou com "link inválido" (URL informada: https://vaiprocarrinho.com.br/). Claude não
  consegue abrir o domínio da sua rede. Pedido ao Giovanni: testar no celular com 4G (com e sem www), testar em
  httpstatus.io, conferir Cloudflare > Security > Bots ("Bot Fight Mode" pode barrar o robô da Awin) e a URL cadastrada
  no perfil da Awin; mandar print do motivo da recusa. Conferido (print): Bot fight mode e AI Labyrinth **desligados** (não é isso). httpstatus.io = 200 (site abre de fora).
  Perfil Awin (Conta > Informações do Site): URL do Site Primário = https://vaiprocarrinho.com.br (certo); "Nome do Site"
  estava com a URL → sugerido trocar para "Vai pro Carrinho". Guia "Espaços Promocionais" conferida: site certo, descrição e setores ok. Sugerido: pôr o Instagram em
  "Links", preencher "Contato" e ver o que é o ícone de escudo ao lado do site (possível verificação).
  O escudo = **site NÃO verificado na Awin** (provável causa do "link inválido"). 16/10/2026: meta tag
  `<meta name="verification" …>` da Awin colocada no `index.html` (manter no lançamento). 1ª tentativa de "Verificar Site": escudo igual. Adicionado também o método do arquivo
  (`/2e195e3c8c68351f1709348e09eae77d.html`, respondido no `_middleware.js` porque o Pages tira o ".html"). Arquivo abre no navegador dele, mas a Awin ainda não verifica.
  Próximo: ver Cloudflare > Security > Events (bloqueios na hora do clique), desligar "Browser Integrity Check" e
  conferir o conteúdo do arquivo baixado da Awin (se não for só o código, trocar no middleware). Security > Analytics > Events:
  nenhum bloqueio na hora da verificação (só 4 bloqueios antigos de robôs em 14–15/10). Cloudflare não é a causa.
  Arquivo da Awin contém `Validation content="<código>"` (não só o código): middleware ajustado para responder igual.
  Conferido no navegador dele: arquivo responde igual ao da Awin, mas o escudo continua igual. Próximo: passar o mouse
  no escudo (ver o aviso), esperar algumas horas e, se seguir, abrir chamado em Suporte da Awin (texto entregue a ele).
  Chat com o suporte da Awin (16/10/2026): **verificação do site NÃO é obrigatória** (estão mudando o processo).
  Então o escudo não é a causa das recusas. Mantidas a meta tag e o arquivo (não atrapalham).
  **Causa real achada pelo suporte: o site estava BLOQUEADO na Awin.** Pediram o desbloqueio (pronto em até 2h, 16/10/2026).
  Próximo: Giovanni pedir de novo às lojas que recusaram (ex.: Leveros) dizendo que o site estava bloqueado e foi corrigido.
  Hipóteses: recusa avaliada quando ainda era "Em breve"; ou loja checa se o site aparece no Google (noindex esconde).
- **E-mail contato@ (15/10/2026)**: passos do Cloudflare Email Routing entregues ao Giovanni (encaminhar para o e-mail
  pessoal dele; apagar antes o MX nulo e o TXT `v=spf1 -all`). Só recebe; responder como contato@ exige configurar
  "Enviar e-mail como" no Gmail com SMTP (ex.: Resend). Aguardando ele fazer e mandar print.
- **Pedir de novo às lojas que recusaram (15/10/2026)**: Giovanni vai reenviar. Texto entregue a ele: apresenta o
  Vai pro Carrinho (comparador; preço, desconto, frete, histórico), diz que a recusa foi porque o site estava bloqueado
  na Awin por engano (suporte corrigiu) e que o comparador já funciona com produtos reais; promete usar preço/link
  oficiais, sem cupons falsos nem anúncios pagos com a marca (ele deve conferir se isso é verdade). **Não** reenviar a
  Central Ar e Dufrio (exigem CNPJ). Próximo: ver respostas na Awin.
- **Outras redes para PF (16/10/2026, Giovanni: Awin demora e lojas recusam PF)**: sugerido 1) **Lomadee** (aceita CPF, tem API;
  conferir se PF pode divulgar em site ou só redes sociais) e 2) **Admitad** (rede internacional com feeds como a Awin; conferir
  lojas BR abertas); 3) **Mercado Livre e Amazon** (aceitam CPF; sem API de busca liberada → curadoria: ele manda links, Claude
  cadastra); Magalu/Temu/Shein aceitam CPF mas sem API conhecida (só curadoria). Alternativa: **MEI** para virar PJ na Awin.
  **16/10/2026: cadastro na Lomadee feito** (painel: Início, Minha carteira, Meus canais, Marcas, Ofertas, Cupons, Produtos,
  Para Desenvolvedores). Canal "Comparador de Preços" criado; meta tag `<meta name="lomadee" …>` de verificação posta no `index.html` (manter).
  ✅ Canal "Vai pro carrinho" **Ativo** (16/10/2026), ID do canal 5275daaf-c3d2-4f89-9b4a-75ad4f19906a.
  API (pesquisado 16/10/2026; docs.lomadee.com.br bloqueado na rede do Claude): base `https://api.lomadee.com.br`
  (api-beta ainda funciona), chave no cabeçalho `x-api-key` (chave com escopos; sem escopo = 403), `GET /affiliate/products`
  (limit 1–100; filtros preço/marca/disponibilidade; nome do parâmetro de palavra-chave NÃO confirmado), `/affiliate/brands`,
  `/affiliate/orders`; limite 60 req/min por chave+IP. Pode trazer produtos de marcas não aprovadas (filtrar por organizationId).
  Resposta de `GET /affiliate/products?page=1&limit=5` (print do Giovanni): `{ data: [{ organizationId, id, available, name,
  description, url, images:[{url}], options:[{ id, ean, name, available, seller, images, categories, brands,
  pricing:[{listPrice, price}], stocks:[{value}] }] }], count }`. `url` deve ser o link normal: link de afiliado sai do
  **Shorten** (`POST "Shorten a URL"`, escopo shortener:write). Chave: criada no painel (API Keys / GraphQL open-api), mostrada
  1 vez; escopos products:read, brands:read, campaigns:read, shortener:read, shortener:write. Chave tipo Affiliate (rotas
  /affiliate/*); Partner é outra (401 se trocar). Limites: 60 req/60s; limit máx 20 em brands/campaigns, 100 em products.
  ✅ **Código pronto e publicado (16/10/2026)**, testado só com Lomadee simulada: `lib/fontes/lomadee.js` (busca
  `GET /affiliate/products?search=&limit=48&isAvailable=true&organizationIds=<aprovadas>`, preço em centavos ÷100; marcas
  aprovadas = `/affiliate/brands` com canal que tem shortUrls sem `message`, guardadas 6h; Shopee/AliExpress da Lomadee ficam de
  fora; loja = chave do app.js (Magalu, Amazon…) ou `lomadee-<nome>` + `lojaNome`; `fonte: "lomadee"` entra no histórico ao vivo
  via `ehAoVivo`). Link "Comprar" = `/api/ir?m=<org>&u=<url>` (`functions/api/ir.js`): gera o link com comissão no encurtador
  (`POST /affiliate/shortener/url`, type Custom) só no clique e guarda na tabela D1 `links_lomadee`; se falhar, manda para o
  produto só se for do site da marca. Sem "Ofertas do dia" da Lomadee. Liga sozinho com o Secret `LOMADEE_API_KEY`.
  ✅ **FUNCIONANDO no site (16/10/2026)**: chave "vaiprocarrinho" (escopos Marcas, Campanhas, Produtos, Encurtador leitura/escrita;
  sem Canais/Pedidos) no Secret `LOMADEE_API_KEY`. A chave enxerga **133 marcas** (a maioria já liberada para o canal; ex.: FATOR 5
  "This channel is not allowed by the organization"). Descobertas reais: **preço vem em REAIS** (a doc diz centavos) e mandar
  `organizationIds` com todas as marcas faz a API devolver 0 → filtro feito no site. Teste "air fryer": Friopeças (Philco R$ 598,
  Britânia, Mallory, Elgin); clique `/api/ir` → `lmdee.link/...` → friopecas.com.br com `utm_source=lomadee` ✅.
  A busca da Lomadee é solta ("air fryer" trazia jaquetas/capacete "Air" da Moto BR; print do Giovanni): `lomadee.buscar` só
  aceita títulos com todas as palavras (`temTodasAsPalavras` em `lib/relevancia.js`) e o selo "Menor preço da busca" só vai
  para o produto exato (sem ele, ninguém ganha). Casos no `testes/busca.mjs`. Cache v=31.
  (Antigo) **Próximo (conversa nova, rede liberada)**: Claude ler docs.lomadee.com.br ("Get all Products" Query Parameters, "Shorten a URL",
  "API Keys"); Giovanni criar a chave e pôr Secret `LOMADEE_API_KEY` no Cloudflare (nunca no chat); Claude montar
  `lib/fontes/lomadee.js` (busca + link encurtado guardado no D1 + só marcas aprovadas + controle de limite) e testar.
- Convite na Awin de "World Businesses for Sale" (venda de empresas, Reino Unido, libras): recomendado **não aceitar**
  (não é produto de consumo; o feed poluiria a busca). Regra geral: convites de lojas fora do perfil = recusar.

- **Layout (15/10/2026, pedido do Giovanni)**: no computador os filtros viraram uma barra em cima dos resultados (lojas
  como "pílulas"), página mais larga (container 1600px) e até 6 cartões por linha. No celular continua a gaveta de
  filtros. Logo real (`marca/vaiprocarrinho-icone.svg`) no topo e como ícone da aba em todas as páginas.
- **Página inicial compacta (15/10/2026, pedido do Giovanni)**: abertura (hero) baixa só com título numa linha + busca +
  "Em alta" (no celular, numa linha que desliza). Tirados o selo, o texto e a fileira de lojas (citava lojas que ainda
  não temos). "⚡ Ofertas do dia" virou grade logo abaixo da busca (Shopee: 24 mais vendidos + Awin com desconto);
  categorias vieram para baixo.
  Depois (pedido dele): faixa da busca ainda menor (título pequeno, busca 48px, chips menores; no celular sem título) e
  **presa logo abaixo do cabeçalho** (`position: sticky`, altura do cabeçalho medida no JS em `--altura-topo`).
  Manchas de luz do hero removidas (cortavam a lista de sugestões).
- **Cabeçalho no estilo Shopee (15/10/2026, pedido do Giovanni)**: o hero foi removido. Cabeçalho único, **fixo no topo**,
  com o gradiente do site: faixa fina (slogan à esquerda, "Política de Privacidade" à direita), logo, busca larga branca
  com botão e os termos "Em alta" logo abaixo (lista `EM_ALTA` no `app.js`), conta e carrinho à direita. No celular: sem
  faixa fina e sem termos em alta; busca em linha própria. A página inicial começa direto em "⚡ Ofertas do dia".

- **Gatilhos de compra honestos (15/10/2026, pedido do Giovanni)**: botão "Comprar na <loja> →" (no celular só "Comprar");
  "Você economiza R$ X" sob o preço; "🔥 N mil vendidos" em laranja quando ≥ 1.000; selo "⭐ Mais vendido" no campeão de
  vendas da lista (mín. 100); "🏆 Menor preço entre N lojas" no produto agrupado por código de barras e "🏆 Menor preço da
  busca" no mais barato; frete grátis em selo verde forte. **Regra combinada: nada de urgência/escassez falsa** (contador,
  "só restam 2", "N pessoas vendo") — CDC proíbe propaganda enganosa e as lojas podem cancelar a afiliação.
- **"Em alta" dinâmico (15/10/2026)**: `lib/buscas.js` conta cada busca que trouxe ofertas reais (tabela `buscas` no D1:
  termo sem acento, dia, total, texto; só isso, nada sobre quem buscou; apaga após 30 dias). `/api/em-alta` devolve os
  8 mais buscados dos últimos 7 dias (mínimo 3 buscas; termos impróprios bloqueados). O site mostra esses primeiro e
  completa com as **categorias em alta**: `lib/categorias.js` classifica pelo nome os 50 mais vendidos da Shopee
  (ex.: "Shorts Masculino Tactel" → "Moda masculina") e ordena as categorias que mais aparecem (mais no topo = mais
  pontos). Cada atalho tem `nome` (o que aparece) e `busca` (o que pesquisa, ex.: "Mesa posta" → "sousplat").
  Pedido do Giovanni (15/10/2026): atalhos não podem repetir os produtos das "Ofertas do dia". Resposta guardada 1h.

- **Janela "Ver detalhes" (15/10/2026, pedido do Giovanni)**: clicar no nome do produto ou em "🔍 Ver detalhes" abre
  janela com foto grande (galeria se a loja manda várias), nome completo, preço/economia, nota e vendidos, vendedor e
  selo "✔ Loja oficial" (Shopee, campo `shopType`; se a API recusar o campo, a busca refaz sem ele), descrição (só Awin:
  robô guarda `descricao` até 600 letras e `imagens` até 5; a API da Shopee não tem descrição), outras lojas, histórico e
  botão Comprar. Nada é lido das páginas das lojas. Colunas novas só existem no D1 depois que o robô roda (migração).
  Ajuste (pedido dele): na Shopee a janela repetia o cartão (API de afiliados manda só 1 foto e sem descrição), então
  "Ver detalhes" só aparece quando há descrição ou 2+ fotos (hoje: Awin). Selo "✔ Oficial" foi para o cartão.

- **Barra lateral (15/10/2026, pedido do Giovanni)**: cabeçalho, página e rodapé usam a tela toda (sem limite de 1600px), barra encostada na esquerda. Substituiu a barra de filtros em cima e a seção "Navegue por
  categoria". Fica à esquerda na página inicial e na busca, presa abaixo do cabeçalho: "Ordenar por" (Mais relevantes,
  Menor/Maior preço, Maior desconto, Mais vendidos), "Categorias" (desde 16/10/2026: as 37 de `lib/categorias.js` (16/10: tirada "Roupas" genérica, que na Shopee trazia guarda-roupas; entrou "Móveis"),
  com emoji, vindas de `/api/em-alta` campo `categorias`, ordenadas pelas que mais vendem agora na Shopee; 12 visíveis +
  "Ver todas"; as 9 antigas do `app.js` só enquanto carrega; a ativa fica marcada. A API de afiliados da Shopee não dá
  a lista de nomes de categorias, então a lista é nossa e a ordem acompanha as vendas), "Lojas parceiras" (lojas da lista atual, com quantidade), Preço e Mais opções. Na página inicial os filtros
  valem para as "Ofertas do dia". No celular vira gaveta pelo botão "☰ Categorias e filtros".

- **Busca sem acessórios (15/10/2026, pedido do Giovanni)**: `lib/relevancia.js` marca `acessorio: true` nas ofertas cujo
  título tem palavra de acessório antes do termo buscado ("Tapete air fryer"), "para/for/compatível + termo" ou palavra
  de acessório logo depois em inglês ("Air Fryer Liners"); não marca nada se a própria busca tiver palavra de acessório
  ("capa iphone"). O site esconde os acessórios (botão "Ver também N acessórios e peças" e opção "Mostrar acessórios e
  peças" em Mais opções); se só houver acessórios, mostra todos. Shopee passou a trazer 48 por busca (era 30).
  Também "para/for/adequado/compatível" até 8 palavras antes da 1ª vez que o termo aparece. Busca da Awin: palavras de
  1–2 letras só valem inteiras ("ar" achava "Arkton"); sem resultado com todas as palavras, só aceita "faltando uma"
  em buscas de 3+ palavras (antes aceitava qualquer palavra). Cache da busca tem versão (`VERSAO_CACHE` + `v=` no app.js).
  Reescrito em 15/10/2026 ("air fryer oster" mostrava motor/botão): lista `PECAS` (motor, botão, resistência, tapete…)
  vale no começo do título mesmo sem o termo junto; `GENERICAS` (cesto, copo, assadeira…) só logo antes do termo e só
  em buscas de 2+ palavras (busca por marca "stanley"/"tramontina" não esconde). Produtos com todas as palavras da
  busca vêm primeiro ("airfryer" conta como "air fryer"). Teste: título → acessório? em casos reais antes de mudar.
  16/10/2026 (air fryer mostrava limpador, grelha, bandeja "for Chefman" e airfryer de brinquedo): `PECAS` + limpa/limpador/
  desengordurante/espuma; `DEPOIS` (janela de 5 palavras) + grelha/assadeira/forminha/bandeja/silicone/oil/drip;
  `EM_QUALQUER_LUGAR` (for, compatível, fits, limpador, desengordurante; "for men/women" não conta); "para <termo>" em
  qualquer ocorrência; brinquedo/miniatura escondidos quando a busca é de outra categoria (não em Brinquedos/Bebês).
- **Fotos mais leves (15/10/2026)**: Shopee manda a foto original (às vezes vários MB); `shopee.js` troca pela miniatura
  (`_tn` no fim da URL). Se a miniatura falhar, o `app.js` (`fotoQuebrada`) volta para a original.
- **Atalhos "em alta" (15/10/2026)**: "Roupas" e "Attracione men" vinham das buscas do site (cliques em atalhos antigos
  contavam como busca). Agora clique em atalho/categoria manda `&atalho=1` e não é contado; `FORA_DOS_ATALHOS` em
  `lib/buscas.js` tira termos ruins já contados. `/api/em-alta` também tem versão no cache (`?v=`).
- **Ordem das categorias (15/10/2026, pedido do Giovanni)**: botões "Mais vendidos | A–Z" acima da lista na barra
  lateral; escolha guardada no aparelho (localStorage `ordemCategorias`).
- **"Ver mais resultados" na busca (15/10/2026, pedido do Giovanni)**: `/api/buscar?q=…&pagina=N` (só fontes com
  `porPagina`, hoje Shopee; Awin vem toda na 1ª). Só a página 1 conta para "em alta". Novos itens entram antes dos acessórios.
- **Mais ofertas na página inicial (16/10/2026, pedido do Giovanni)**: "Ofertas do dia" = 48 mais vendidos da Shopee
  (`shopee.porPagina`) + Awin com desconto; botão "Ver mais ofertas" pede `/api/buscar?pagina=N` (só fontes com
  `porPagina`, até 20 páginas; resposta traz `temMais`) e junta à lista; filtros e ordem valem para tudo que já carregou.

- **Busca dentro da categoria (16/10/2026, pedido do Giovanni)**: clicar numa categoria abre `?q=<busca>&cat=<nome>`;
  buscar algo com a categoria aberta mantém o `cat` ("invictus" em Perfumes). O servidor (`termoNaCategoria`/`daCategoria`
  em `lib/categorias.js`) pesquisa "invictus perfume" e tira produtos classificados em outra categoria; se nada sobrar,
  busca em tudo e o site avisa. Resultado mostra "Na categoria 🌸 Perfumes · Buscar em todas as categorias ✕"; a caixa
  de busca diz "Buscar em Perfumes…". Atalhos "em alta" e o logo saem da categoria.
  Ajuste (pedido dele): ao abrir uma categoria a caixa de busca fica vazia e o título é "🩲 Moda íntima" (`navegandoCategoria`).
- **"Menor preço" respeita a busca (16/10/2026, pedido do Giovanni)**: **16/10: o card "🏆 Menor preço · Economize até" do topo foi REMOVIDO (pedido dele: confundia); fica só o selo no cartão.** servidor marca `bate: true` quando o título tem
  todas as palavras buscadas; o card "🏆 Menor preço" e o selo usam só esses, sem acessórios e sem preço fora da curva
  (< 30% ou > 3× a mediana) (`ofertasComparaveis` no `app.js`). `PECAS` ganhou bateria, bit, broca, carvão, mandril, ponteira, soquete.
- **Vitrine de categoria (16/10/2026, pedido do Giovanni)**: "Celulares" trazia celular de botão para idoso. Categoria pode
  ter `vitrine` (`lib/categorias.js`): ao abrir a categoria (sem busca dentro), o servidor junta várias buscas
  (iphone, samsung galaxy, xiaomi, motorola), tira acessórios, preço < R$ 500 e palavras excluídas (idoso, botão, flip…)
  e intercala as marcas. Só Celulares tem vitrine por enquanto; dá para pôr em outras. Celulares foi para antes de
  Automotivo ("Moto G" não é moto); Smartwatches ganhou "watch" e "mi band".
  16/10/2026 (pedido dele): **todas as 37 categorias têm vitrine** com 4 buscas de produtos em alta (ex.: Perfumes =
  lattafa, perfume árabe, body splash, perfume importado), cada uma pela ordem de **mais vendidos** da Shopee
  (`shopee.buscar(..., { maisVendidos: true })` = sortType 2), intercaladas. Atalhos "em alta" que são categoria também
  abrem a vitrine. Cada categoria aberta = 4 consultas à Shopee (guardadas 1h). Revisar as listas de tempos em tempos.
  Ajuste: Informática trazia notebook de brinquedo e medidor de pressão → buscas "notebook lenovo"/"monitor gamer",
  `excluir` (infantil, educativo, pressão…) e Brinquedos ganhou "educativo"/"laptop infantil".
  16/10: Smartwatches mostrava só 2 (vitrine pedia 1 página por busca e "apple watch" é quase tudo pulseira). Vitrine agora
  pede 1 página por busca por rodada, até 3 rodadas (`MAX_PAGINAS_VITRINE`) ou 100 produtos; "Ver mais" continua com `desde=`.
  Smartwatches: buscas smartwatch, apple watch, galaxy watch, amazfit, xiaomi smart band; precoMin 80; excluir + carregador/case.
  16/10: TV Stick ("Smart TV … Dual Band") aparecia em Smartwatches. `montarVitrine` agora só aceita produto classificado na
  própria categoria, ou sem categoria mas com o termo da busca inteiro e na ordem no título (`temFrase`).
- **Busca dentro da categoria refeita (16/10/2026, pedido do Giovanni)**: "capacete" em Automotivo virava "capacete acessórios
  para carro" (lixo). Agora pesquisa o que foi digitado e, só se a categoria tiver `chave` (ex.: Perfumes = "perfume"),
  também "invictus perfume"; junta, tira o que é de outra categoria e põe primeiro o que é da categoria
  (`ordenarNaCategoria`). Perfumes ganhou "eau de"/"toilette".
- **~100 resultados por busca (16/10/2026, pedido do Giovanni)**: busca digitada pede páginas da Shopee de 3 em 3
  (`buscarAteEncher` em `buscar.js`) até ter 100 produtos **sem contar acessórios** ("air fryer" na Shopee é ~80% forminha/papel)
  ou 9 páginas. A resposta traz `mais` ("desde=10" na busca, "pagina=2" na vitrine/início) e o site pede `&<mais>` no
  "Ver mais resultados".
  Vitrine e "Ofertas do dia" continuam 1 página. Teste com Shopee simulada: `fetch` falso + `onRequestGet` direto no Node.
- **Anúncios repetidos (16/10/2026, pedido do Giovanni)**: na Shopee vários vendedores publicam o mesmo produto com códigos
  diferentes. `semRepetidos()` no `app.js` junta por mesmo título (60 letras) + preço ou mesma foto e fica com o que vendeu mais.
- **Histórico da Shopee + "Desconto real" (16/10/2026, item 1 da análise, pedido do Giovanni)**: `/api/buscar` grava na tabela
  `precos` o preço de hoje das ofertas da Shopee que mudaram (`historicoAoVivo` em `lib/ofertas.js`, via waitUntil) e junta o
  resumo. Coleta diária: job `shopee` no `robo-precos.yml` chama `/api/coletar-precos?parte=N` (5 buscas por parte: as 148
  das vitrines + mais buscados; cada parte 1x por dia, tabela `coletas`). Selo "✅ Desconto real -X%" = preço ≥5% abaixo do
  **preço habitual** (o que durou mais dias nos últimos 30), com 21+ dias de acompanhamento (pronto para a Black Friday
  27/11/2026). "Baixou X%" agora compara com o habitual (subir e baixar não engana). Botão "📈 Histórico" na Shopee só
  com mudança de preço ou 7+ dias. Teste: `node:sqlite` como D1 falso + `fetch` falso (ver conversa de 16/10).
- **Botão "🚚 Frete grátis (N)" (16/10/2026, item 2)**: acima da lista (início e busca), liga o filtro `#so-frete`; só aparece
  se a lista tem 8+ ofertas com frete grátis (`FRETE_MINIMO`). **A API de afiliados da Shopee não informa frete** (depende do
  CEP e dos cupons; ler a página da Shopee é proibido). Giovanni preocupado em frustrar o visitante: botão quase sempre
  escondido até haver mais lojas da Awin.
- **Mais opções no topo da barra lateral (16/10/2026, pedido do Giovanni; 24/10: "Com desconto" removido, pedido dele — já há "Maior desconto" em Ordenar por; o quadro some quando não há frete grátis)**: "Frete grátis / Com desconto / Mostrar acessórios e
  peças" logo abaixo de "Ordenar por". (Testado e desfeito a pedido dele: quadro de resultados preso no topo com botão de acessórios.)
- **F5 volta ao começo (16/10/2026, pedido do Giovanni)**: atualizar a página tira busca/categoria do endereço, zera filtros e
  ordem e volta ao topo (`performance.getEntriesByType("navigation")[0].type === "reload"`). Link com `?q=` aberto direto continua funcionando.
- **Categorias nos resultados (16/10/2026, pedido do Giovanni)**: "invictus" em Perfumes trazia pôster/camiseta, e "Menor preço"/
  "Maior desconto" os punham no topo. Servidor marca `secao` (categoria do produto, `marcarSecoes` em `lib/categorias.js`) em toda
  busca e vitrine; busca dentro de categoria não tira mais nada (ordem: da categoria, sem categoria, outras, acessórios).
  Barra lateral "Categorias nos resultados" (caixinhas com quantidade, "Outros" = sem categoria): na busca dentro de categoria
  começa só com ela marcada; na busca normal todas marcadas. Ordenar por preço/desconto põe primeiro o produto exato
  (`produtoExato`: todas as palavras + da categoria). Cache v=25.
- **Palavras perto umas das outras (16/10/2026, pedido do Giovanni)**: "mini pc" trazia "Microfone Mini USB … para PC" no topo.
  `criarPontuacao` (`lib/relevancia.js`): frase inteira > todas as palavras perto (até 4 no meio, sem contar de/para/com) >
  espalhadas (não `bate`); palavra logo depois de "para/for…" só conta se o título começa pelo 1º termo ("Capa para iPhone" ok). Cache v=26.
- **⚠️ REGRA: teste da busca (16/10/2026, pedido do Giovanni, porque correções antigas "voltavam")**: `node testes/busca.mjs`
  tem que dar "✓ Tudo certo" **antes de publicar qualquer mudança na busca** (`lib/relevancia.js`, `lib/categorias.js`, `buscar.js`).
  Tem os termos mais buscados (pesquisa 16/10: MELI Trends 2025, Google "Mais Desejados" 2025, Shopee 2025/Mapa 2026) e
  **todo print de erro do Giovanni vira um caso novo** no arquivo. Sinônimos em `SINONIMOS`/`comSinonimos` (`lib/relevancia.js`):
  smartphone=celular, capinha=capa, smart watch=smartwatch, PlayStation 5=ps5, televisão=tv, refrigerador=geladeira,
  laptop=notebook, "55 polegadas"=55. Pontuação aceita frase com de/para no meio ("Retrovisor para Moto"). Cache v=27 (v=28 desde a Lomadee).
- **"Maior desconto" honesto (16/10/2026, pedido do Giovanni)**: categoria em "Maior desconto" mostrava -81% em produto de
  R$ 13 (preço antigo inflado). Agora (`nivelDesconto` no `app.js`): 1º "Desconto real" do nosso histórico (como o Zoom),
  2º desconto da loja de 5–75%, 3º acima de 75% (`DESCONTO_SUSPEITO`, provável maquiagem de preço), 4º sem desconto.
  Nova opção "Maior economia (R$)" com os mesmos níveis. "Maior desconto" virou "Maior desconto (%)".
- **Busca mais rápida (16/10/2026, pedido do Giovanni: busca nova levava 12–14 s)**: (1) **Buscas prontas**: job `prontas` no
  `robo-precos.yml` chama `/api/preparar-buscas?parte=N` (1 busca por chamada; ~89: 37 categorias + `POPULARES` + mais buscados),
  que roda o `buscar.js` com `env.__PREPARAR` e guarda a resposta na tabela D1 `buscas_prontas` (vale 30 h; cabeçalho `X-Pronta: 1`).
  (2) **Resposta em partes**: cada chamada de busca pede só 1 lote (3 páginas de cada loja; vitrine 1 página) e o site pede o
  resto sozinho (`completarSozinho` no `app.js`, até 100 produtos sem acessórios ou 3 pedidos). Loja com mais de 8 s fica de
  fora daquela resposta (`LIMITE_LOJA_MS`). Marcas da Lomadee: páginas em paralelo e guardadas no cache do Cloudflare 6 h. Cache v=32.
  Lomadee: 1 consulta de 48 por lote (100 passava de 8 s; limite dela 60/min, pausa no 429). Pelo robô do GitHub a Lomadee
  costuma travar (>25 s; daqui do Claude responde em ~3 s): busca pronta é guardada se a Shopee respondeu (robô espera 10 s
  por loja). Busca nova medida: ~3 s (antes 12–14 s).
- **Animação da busca (17/10/2026, pedido do Giovanni)**: no quadro "Buscando…" um boneco empurra o carrinho do logo da esquerda
  para a direita, olhando para os lados (`ANIMACAO_BUSCANDO` no `app.js`, CSS `.anim-*`). A regra `prefers-reduced-motion` foi
  **tirada do site inteiro** (pedido dele: o Windows dele tem "Efeitos de animação" desligado e tudo ficava parado).
- **AliExpress sem produto sem relação (17/10/2026, print do Giovanni: "batedeira" trazia capacitor de carro)**: na busca digitada,
  `aliexpress.buscar` só aceita título que cita alguma palavra buscada (`citaAlgumaPalavra` em `lib/relevancia.js`; não exige todas
  porque os títulos são traduzidos). Sinônimos novos: "fritadeira a/de/sem ar/óleo" = air fryer; "bateria portátil/externa",
  "carregador portátil" = power bank (o detector de acessórios agora também usa `comSinonimos`). No site, buscar com uma categoria
  aberta só filtra pela categoria se ela tiver o produto exato (`bate` e não acessório). Cache v=33.
- **Categorias das lojas (17/10/2026, pedido do Giovanni: "muita coisa errada" nas categorias)**: a Shopee manda `productCatIds`
  (3 níveis, só códigos; a API de afiliados não dá os nomes) e a AliExpress `first/second_level_category_id/name`. Ficam em
  `catsLoja` em cada oferta. `lib/mapaCategorias.js` aprende sozinho "categoria da loja → nossa categoria" com as buscas do robô
  (`/api/preparar-buscas`: cada produto classificado pelo título vota; tabela D1 `cat_loja_votos`; vale com 5+ votos e 70%+).
  A categoria aprendida (`catMapa`) manda na `secao`, na busca dentro da categoria e na vitrine; sem ela, as regras do título.
  1ª rodada: 208 categorias aprendidas. Limite: a Shopee põe batedeira de mão em Casa > Cozinha, então ela aparece em "Cozinha".
  Também: categoria aberta só filtra a busca se tiver 30%+ dos produtos exatos. Cache v=36.
- **Página inicial (17/10/2026, pedidos do Giovanni)**: título "🔍 Buscando ofertas do dia…" (lupa animada) enquanto carrega
  (`tituloOfertas` no `app.js`); as "Ofertas do dia" viraram busca pronta (parte 0 do `/api/preparar-buscas`, `q` vazio):
  abre em ~0,5 s (eram ~6 s, por causa da AliExpress). Botão "Comprar no AliExpress" com letra menor (`texto-longo`) e
  todos os botões com a mesma altura numa linha.
- **Sem Ctrl+F5 (17/10/2026, pedido do Giovanni)**: o Cloudflare manda o navegador guardar app.js/estilo.css por 4 h. O
  `_middleware.js` reescreve as páginas para `assets/app.js?v=<ETag>` (HTMLRewriter + `env.ASSETS`), então cada publicação
  chega a todos os visitantes na hora. Não precisa mudar nada a cada publicação.
- **"ps5" (17/10/2026, print do Giovanni)**: a API de afiliados da Shopee ordena diferente do site dela (adesivo, enfeite no topo).
  `separarAcessorios` marca `principal` quando o título começa pelo termo (2 primeiras palavras, pulando `ANTES_DO_NOME`:
  console, novo, sony…) e põe esses primeiro; o site mantém isso ao juntar lotes. Acessórios novos: skin, sticker, enfeite,
  adesivo/suporte depois do termo, "protetor(a)" em qualquer lugar. Cache v=37.
- **Modelos da animação da busca (17/10/2026)**: v1 (boneco de camiseta amarela + carrinho do logo) e v2 (moça de rabo de cavalo +
  carrinho de grade) viraram `PERSONAGENS_PRONTOS` (ver "Meu personagem"). Os dois enchem de produtos.
- **Meu personagem (17/10/2026, pedido do Giovanni)**: na conta, botão "🎨 Montar meu personagem" abre editor com prévia andando:
  cabelo (curto/rabo/cacheado/careca), cor do cabelo, pele (5 tons), rosto (sorriso/óculos/barba/piscadinha), roupa (6 cores) e
  carrinho (do logo/de supermercado). `desenharPersonagem()` no `app.js` monta o SVG por partes; opções em `PERSONAGEM_OPCOES`
  (app.js) e `OPCOES_PERSONAGEM` (lib/conta.js) — mudar nos dois. Tabela D1 `personagens`; `PUT /api/conta/personagem`
  (null = voltar ao sorteio); apagado ao excluir a conta; citado na Política. Sem escolha (ou sem conta): sorteia entre os 2
  prontos (`PERSONAGENS_PRONTOS` = antigos v1 e v2) a cada busca. Decidido NÃO pedir sexo no cadastro (LGPD/atrito).
- **Mapa de categorias (17/10/2026, print "vara de pesca" em Óculos)**: a categoria "Pesca" da AliExpress tinha sido aprendida
  como Óculos (só aparecia nas buscas de óculos). Agora toda busca nas lojas ensina o mapa (não só o robô), produto sem categoria
  pelo título também vota ("-", conta no total mas nunca ganha), vale com 10+ votos e 80%+, mapa recarrega a cada 5 min.
  Esporte e fitness ganhou vara de pesca/molinete/carretilha/anzol. Cache v=39.
- **Logo (17/10/2026, pedido dele)**: clicar no logo zera busca, categoria, filtros e ordem.
- **Segurança dos arquivos (17/10/2026, pedido do Giovanni: "nada de segurança frágil")**: o `_middleware.js` agora usa LISTA DO QUE
  PODE ABRIR (`PUBLICOS`: /, index, privacidade, api/*, assets/<arquivo>, marca/<arquivo>, arquivo da Awin, /previa); todo o resto
  dá 404, e endereço com "..", "//" ou "\" também. Antes era lista de bloqueio e `testes/busca.mjs` abria. Testado com 24 endereços
  (script de teste na conversa). **NÃO usar `_routes.json` para tirar /assets/ e /marca/ do middleware**: testado,
  `/assets/..%2fCLAUDE.md` abria a memória. Para ganhar desempenho com segurança: mover o site para a pasta `public/` e trocar
  em Cloudflare > Settings > Builds > "Build output directory" para `public` (fazer a troca ANTES do push).
  ✅ **FEITO (17/10/2026)**: Giovanni trocou "Build output directory" para `public`; só `public/` é publicada (index, privacidade,
  assets, marca, _headers, _routes.json). `/assets/*` e `/marca/*` saem direto do Cloudflare (`public/_routes.json`), com
  cabeçalhos de segurança no `public/_headers`. Testado no ar: 10 páginas públicas abrem, 24 endereços internos/truques bloqueados.
  **Nunca pôr nada interno em `public/`.** Para testar local: `npx wrangler pages dev public` (de dentro do repositório).
- **"microondas" (17/10/2026, print do Giovanni)**: peças de conserto apareciam como produto. `PECAS` + filamento, magnetron,
  capacitor, diodo, display, membrana, lâmpada, válvula, temporizador, prato, detector; `EM_QUALQUER_LUGAR` + reparo, conserto,
  substituição, reposição, dedicado(a) (tradução AliExpress), magnetron, capacitor, filamento, diodo, membrana, interruptor, placa;
  `DEPOIS` + pé(s), almofada, frigideira; sinônimo "micro ondas" = microondas. Cache v=40.
- **⭐ Produto x acessório em 3 camadas (17/10/2026, pedido do Giovanni: "resolver de vez as buscas erradas")** — `separarAcessorios`
  em `lib/relevancia.js`, mesmo princípio da patente do Google US10354308 (classificar a BUSCA como produto ou acessório):
  1) **Alvo**: a palavra de acessório da busca, se houver ("prato" em "prato microondas", "reparo", "cabo", "viseira", "copo"…);
     senão a 1ª palavra. Busca de acessório põe os acessórios na frente e não esconde nada.
  2) **Nível do título** (`criarNivelDoTitulo`): 2 = começa pelo alvo (pulando `ANTES_DO_NOME`: console, forno, fritadeira, mini,
     smart, novo…); 1 = alvo na 2ª palavra sem "de/para" nem peça antes ("Electrolux Micro-ondas"); 0 = só cita ("Imã de Geladeira").
     Códigos de modelo (B220, SM-B315E) não contam como palavra. Nível 1 e 2 = `principal` (vêm primeiro).
  3) **Preço como prova** (só busca de produto): mediana dos nível 2 (5+); nível 0 abaixo de 20% e nível 1 abaixo de 10% = acessório.
  Genéricas (cesto, tela, fonte, copo, teclado, cooler, pneu…) só nas 2 palavras logo antes do produto. Novas peças: viseira, palmilha,
  cadarço, evaporadora, condensador(a), radiador, difusor, compressor, imã. Avaliado com 24 buscas reais (16 de produto, 8 de acessório)
  baixadas do site: geladeira -55 imãs/peças, ar condicionado -76 peças de carro, bicicleta -76 pneus/câmaras, máquina de lavar -29,
  monitor -27; celular simples de R$ 100 continua aparecendo. Casos de preço no `testes/busca.mjs` (`CASOS_PRECO`). Cache v=41.
  Para avaliar de novo: baixar `/api/buscar?v=41&q=<termo>` de várias buscas e rodar `separarAcessorios` comparando com a marcação antiga.
- **Awin só pelo título (17/10/2026, print "armario de cozinha")**: o índice FTS tem título + marca + categoria + loja, e a categoria
  da Spicy ("Cozinha > Armários…") trazia tábua e facas. `awin.buscar` agora filtra por `temTodasAsPalavras` no título (e
  `citaAlgumaPalavra` no "faltando uma"); "de/do/para" não contam como palavra na busca da Awin. Cache v=44.
- **Aviso "não está à venda nas lojas parceiras" (17/10/2026, print "maquina de lavar eletrolux" = só peças)**: `avisoSemProduto`
  no `app.js`: busca digitada com 0 ofertas `principal` → "😕 “X” não está à venda nas nossas lojas parceiras no momento…";
  com 1–2 (`POUCOS_PRODUTOS`) → "Encontramos só N oferta(s)…". Nesse caso sem selo "Menor preço da busca". Conferido em 23 buscas
  reais (marcas como stanley/nike têm 11+ principais, não avisa). `PECAS` + eletrobomba, bomba, agitador, embreagem, atuador,
  pressostato, nivelador, pezinho, rolamento, dosador, tirante, carcaça; sinônimos Electrolux=Eletrolux, Lavadora=máquina de lavar
  (menos alta pressão/louças). Cache v=45 (v=46 desde a correção de digitação).
- **Correção de digitação + sugestões enquanto digita (17/10/2026, pedido do Giovanni: "eletrolux" só achava peças; o certo é
  "electrolux")**: `lib/vocabulario.js` tem `MARCAS`, `ERROS` (erros comuns → certo; trocados antes de buscar), `POPULARES`
  (movido do preparar-buscas) e termos produto+marca. `/api/buscar` responde com o `q` corrigido; o site mostra
  "Corrigimos “…” · Buscar como digitei" (`&exato=1` não corrige) e, para marca parecida fora da lista ERROS, só
  "Você quis dizer: …?" (`marcaParecida`: marcas de 7+ letras, 1 letra errada; 9+, 2; conferido com 3 mil palavras de títulos
  reais para não sugerir "nivea" em "nivel"). Caixa de busca: `sugerir()` no `app.js` com o vocabulário de `/api/vocabulario`
  (mais buscados no site em 30 dias por 2+ pessoas, populares, vitrines, marcas, erros; baixado 1 vez ao focar a caixa):
  entende erro ("geladeria", "xiome"), completa com marca ("maquina de lavar ele" → electrolux). **Erro novo que o Giovanni
  mandar → acrescentar em `ERROS` e no teste `CORRECOES` do `testes/busca.mjs`.** Cache v=46.
- **"Milhões de produtos de mais de N lojas" (17/10/2026, pedido do Giovanni)**: faixa do topo (computador) e quadro acima das
  "Ofertas do dia" (todos). Número real de `/api/numeros` (guardado 6 h): Shopee + AliExpress + marcas da Lomadee liberadas para o
  canal + lojas da Awin no banco, arredondado para baixo de 10 em 10. No ar: 112 lojas → "mais de 110". "Milhões" conferido em 17/10/2026 (total_record_count da
  AliExpress com entrega no BR): decoração 679 mil, carro 619 mil, brinquedo 448 mil, ferramenta 377 mil, bolsa 341 mil, vestido
  316 mil… (~3 milhões em 10 palavras, só AliExpress; a Shopee não informa total).
- **Tela toda de verdade (17/10/2026, print do Giovanni)**: a regra "cabeçalho/página/rodapé sem limite de 1600px" nunca valia: um
  pedaço solto de animação antiga no `estilo.css` (sobra do commit da animação da busca) anulava a regra seguinte. Removido;
  em tela de 1890px a barra lateral encosta na esquerda e cabem 6 cartões por linha (eram 5).
- **Botão no celular (17/10/2026, print do Giovanni)**: era só "Comprar →"; agora 2 linhas "Comprar" + "na Shopee" menor
  (`textoComprar` no `app.js`, `.comprar-curto` no CSS).
- **Filtro de lojas (17/10/2026, print do Giovanni: só 3 lojas pareciam ser todas as parceiras)**: título virou "Lojas nesta lista"
  + nota "Temos mais de N lojas parceiras; aqui aparecem as que têm ofertas nesta lista" (`#nota-lojas`, número de `/api/numeros`).
- **Política de Privacidade enxuta (17/10/2026, pedido do Giovanni)**: tiradas "Não pedimos CPF…", "Para que usamos" e "Onde os
  dados ficam"; IP/e-mail (24 h), contagem de buscas, Cloudflare/Resend e "fora do Brasil" ficaram num parágrafo só (exigência da LGPD:
  não tirar isso).
- **Mercado Livre (17/10/2026, pesquisado)**: `/sites/MLB/search` e `/products/search` dão 403 sem token (testado). Programa
  "Afiliados e Criadores": CPF, até 16% venda direta / 8% indireta, saque no Mercado Pago a partir de R$ 30 (3 compradores),
  validação até 60 dias; blogs divergem na janela (24 h x 30 dias). Próximo, se ele quiser: inscrever-se + criar app em
  developers.mercadolivre.com.br + chaves no Cloudflare → Claude testar `/products/search` e `/highlights` com token; senão curadoria.
- **Auditoria das buscas (17/10/2026, 6ª sessão, pergunta do Giovanni: "buscas 100% equilibradas?")**: ~70 buscas reais
  baixadas do site e conferidas. Corrigido (cache v=47): (1) **sem acento as lojas traziam resultados piores** ("fogao": Lomadee
  0 fogões x 36; Shopee só 75 iguais) → `ACENTUADAS` em `lib/vocabulario.js` (~360 palavras dos títulos reais) põe o acento antes
  de buscar, sem aviso; vale também no `exato=1`. (2) `termoNasLojas`: "tv"/"televisão" pesquisa "smart tv" (vinha cabo, TV Stick,
  livro) e "impressora" pesquisa "impressora multifuncional" (vinha peça de impressora 3D); o site mostra o digitado.
  (3) `PECAS_SEMPRE` (síncrono, extrusora, hotend, nozzle) + "tubo interno" e `DEPOIS` + coletor; preço como prova vale também no
  nível 2 abaixo de 8% (`PARTE_DO_PRECO_TIPICO`). (4) Lomadee com preço < R$ 2 fora (PCYES manda R$ 1). (5) `VARIANTES` (mini,
  portátil, camping, veicular, idoso, infantil, caneta, resfriador, usado, stick, colecionável) recuam 0,25 se a busca não pede:
  "geladeira" agora abre com geladeiras de verdade, "celular" sem os de idoso no topo, "ar condicionado" com splits.
  "Pé" é peça só como 1ª palavra (`PECAS_NA_FRENTE`; "Meias de pé" é produto). (6) `semRepetidos` junta mesmo título da mesma loja com preço até 15% diferente. Casos novos no `testes/busca.mjs` (ORDEM, etc.).
  ✅ **Categoria "Eletrodomésticos" 🧊 (pedido dele)**: geladeira, fogão, micro-ondas, máquina de lavar, secadora, lava-louças, ar,
  smart TV…; vitrine com 6 buscas (geladeira frost free, máquina de lavar, smart tv, ar split, micro-ondas, fogão 4 bocas; mín. R$ 300),
  conferida no ar: só eletrodomésticos de verdade. Agora são 38 categorias. **Fixa em 1º no menu** (pedido dele; campo `fixa: true`
  em `lib/categorias.js`, em A–Z segue a ordem alfabética desde 21/10/2026; em-alta v=4). "Secadora de roupas" saiu de Cabelo. ✅ **"máquina de lavar" = a de roupa** (pedido dele): `OUTRO_PRODUTO` em
  `lib/relevancia.js` manda "sapatos/louças/alta pressão" para o fim, a não ser que a busca peça ("máquina de lavar sapato"). Cache v=48.
  ✅ **"Menor preço" misturava peças (print "ar condicionado", 17/10/2026)**: servidor marca `variante` e `foraDoTipo` (de carro:
  `CARROS`/`ehDeCarro` em `lib/categorias.js`; carros saem de Eletrodomésticos e vão para Automotivo); `PECAS` + comando, blower,
  evaporador; `PECAS_SEMPRE` + tester, testador, expansor. No site (`filtrar`/`precoTipico` no `app.js`), ordem por preço/desconto
  = 1º principal de verdade com preço ≥ 30% do típico (mediana dos principais, 5+), depois variante/carro/barato demais, depois o
  resto, acessórios no fim; selo "Menor preço" idem. Conferido no ar: "ar condicionado" em Menor preço começa em splits/janela de
  R$ 1.641; "geladeira" em geladeiras de R$ 1.346. Cache v=49.
  ✅ **REGRA DA ORDEM (Giovanni, 17/10/2026)**: **sem busca** ("Ofertas do dia") a ordem escolhida vale para todas as ofertas
  (puro preço/desconto/vendidos); **com busca**, qualquer ordem (inclusive "Mais relevantes") segue a categoria do que foi buscado:
  `categoriasDaBusca()` no `app.js` = categorias (`secao`, "" = sem) com mais de 20% dos produtos `principal` (5+), tiradas dos
  próprios resultados ("colchão" = Cama e banho + Móveis); esses vêm primeiro, os de outras categorias depois. Conferido no ar
  com as 5 ordens em "ar condicionado", "colchão", "vestido", "geladeira" e sem busca.
  ✅ **Lojas no card de resultados (pedido dele, 17/10/2026)**: na busca, "Lojas com ofertas:" com botões por loja (cor, nome,
  quantidade) dentro do card roxo; clicar liga/desliga; "Limpar" desliga todas e "Marcar todas" volta (`lojasNoResumo` no `app.js`,
  `.chip-loja` no CSS). A caixa "Lojas nesta lista" da barra lateral (`#caixa-lojas`) agora só aparece nas "Ofertas do dia".
  Testado no ar (computador e celular). "Ver mais resultados" e "Ver também N acessórios e peças" (botão continua existindo, de
  propósito) seguem as lojas marcadas: contam só lojas ligadas e somem com todas desligadas.
  ✅ **Busca de acessório (17/10/2026)**: já funciona sozinha (nada escondido, acessórios na frente: cabo flat monitor, película,
  carregador, pneu bicicleta, forma air fryer…). Ajustes: nível 2 vale +0,6 (nível 1 +0,4); na busca de acessório, outro acessório
  na frente do título (peça/genérica ou `DE_OUTRO_ACESSORIO`: base, apoio, dock, estojo, case, chaveiro…) = "acessório do acessório",
  recua 1 ("controle ps5" abre com controles, não suportes); "visor" virou peça. Cache v=50.
  ✅ **Preço com cupom (17/10/2026, print Invictus: Shopee R$ 676 "no Pix com cupom" x site R$ 759,90)**: a API de afiliados só
  manda o preço sem cupom; cupom/Pix varia por produto, campanha e conta. Ler a página = proibido. Feito (pedido dele, sem poluir o
  cartão): `AVISO_CUPOM` "💸 Produtos que têm cupom na loja podem sair ainda mais baratos." (texto do Giovanni) uma vez só, no card de
  resultados e na faixa das "Ofertas do dia". Ideias éticas sugeridas e não feitas: perguntar ao suporte de Afiliados da Shopee se
  a API tem cupons; cupons oficiais da Lomadee ("Cupons") e Awin ("Minhas Ofertas"); curadoria manual; "Achei mais barato" no futuro.
  ✅ **"bateria para carro", "kindle", "protetor solar" (17/10/2026, 7ª sessão, print do Giovanni)**: a API da Shopee não acha
  bateria de carro pelo nome comum (traz testador/terminal). `PRODUTOS_NAS_LOJAS`/`buscaNasLojas` em `lib/vocabulario.js`: a busca
  vira várias consultas (bateria automotiva moura, bateria 60ah/50ah/40ah, eletran, zetta; kindle paperwhite, leitor kindle, kindle),
  1 página cada, e `precoMin` (R$ 250 bateria, R$ 300 Kindle) marca o mais barato como acessório (`separarAcessorios(…, { precoMin })`).
  Para outro produto assim: acrescentar na lista e um caso no `testes/busca.mjs`. "protetor solar": para-brisa/carro/painel em
  `OUTRO_PRODUTO` (vai para o fim). Conferido no ar: bateria = 35 baterias de verdade; Kindle = só 3–4 (a Shopee tem poucos). Cache v=51.
  ✅ **UP Kids da Lomadee com link quebrado (17/10/2026, print)**: todos os produtos apontam para vestis.com.br, que manda para
  upkids.com.br com o mesmo endereço = 404 (12 de 12 testados). `SITES_QUEBRADOS` em `lib/fontes/lomadee.js` tira esses produtos;
  conferir de vez em quando se a UP Kids corrigiu (abrir um link vestis) e tirar da lista. Cache v=52.
  ✅ **"controle para video game" (17/10/2026, print)**: "controle" é genérica (acessório do ar/videogame), então a busca
  virava "busca de acessório" e nada era escondido (suporte, porta-controle, adesivo no meio). Agora, se a busca começa por
  "controle" e tem cara de videogame (`DE_JOGO`: video game, ps4, xbox, pc, console…), é busca de produto com o controle como
  alvo (`controleDeJogo` em `lib/relevancia.js`); "controle remoto"/"controle ar condicionado" seguem como antes.
  Joystick/gamepad = controle (`SINONIMOS`), e `variantesDeJogo` (`lib/vocabulario.js`) pesquisa também "joystick …"
  (ou "controle … video game" quando digitam joystick). "Porta" entrou em `DE_OUTRO_ACESSORIO` ("Porta Controle", "Case Fone",
  "Base Controle" logo antes do produto = acessório; não vale se a busca tem a palavra: "base líquida"). Cache v=53.
  ✅ **Busca de outra categoria com categoria aberta (19/10/2026, print "air fryer mondial" em Cabelo = só secadores)**: se
  `categoriaDoProduto(q)` é outra categoria, `buscar.js` busca em todas e responde `foraDaCategoria` (site avisa). Cache v=54.
  ✅ **Marca x produto (19/10/2026, ideia do Giovanni)**: `lib/relevancia.js` separa a marca (lista `MARCAS` do vocabulario.js,
  com sinônimos) do produto (`produtoDaBusca`/`produtoPrimeiro`): o nível do título usa só o produto e pula a marca no começo do
  título ("Mondial Air Fryer…" = nível 2); a frase também vale na ordem produto+marca. "mondial air fryer": 0 → 77 produtos
  principais; "britania liquidificador" esconde copos de reposição; buscas sem marca não mudaram (conferido em 23 buscas). Cache v=55.
  `citaAlgumaPalavra` (filtro da AliExpress e "faltando uma" da Awin) exige palavra do produto, não só a marca
  (secador Mondial saía em "air fryer mondial"). Cache v=56. Marca nova que aparecer nas buscas → acrescentar em `MARCAS`.
  ✅ **Regra geral do AliExpress (19/10/2026, pedido do Giovanni: "vale para todas as marcas")**: `tituloDaBusca` em
  `lib/fontes/aliexpress.js` = cita o produto E (tem todas as palavras soltas, `citaTodasAsPalavras`, OU não é de outra
  categoria pelo título). Pega marca fora da lista. Simulado em 23 buscas reais: só sai lixo (secador em air fryer, capa de
  celular em smart tv, calça "com bolsos" em bolsa feminina, peça de motorhome em geladeira). `MARCAS` foi de 202 para 318.
  Sinônimo sneakers = tênis. Cache v=57.
- **"joystick" e "ventilador philco" (19/10/2026, 8ª sessão)**: "joystick"/"gamepad" sozinhos viraram entrada de
  `PRODUTOS_NAS_LOJAS` (pesquisa "joystick gamer", "controle video game", "controle gamer"); em busca de controle de jogo
  (`JOGO_NA_BUSCA` em `OUTRO_PRODUTO`) escavadeira, guindaste, industrial, cadeira (de rodas), keycap, teclado, aviação, drone
  vão para o fim. Ventilador, climatizador e aquecedor elétrico entraram em Eletrodomésticos (cooler/gabinete de PC não).
  Conferido no ar. Cache v=59.
  Print "Babuche Masculino" (com Automotivo aberto mostrava só 1 bandana): "babuche" não era palavra de Calçados, e os babuches
  "Carros" (desenho) caíam em Automotivo. Calçados + babuche, pantufa, tamanco, mocassim, sapatilha, alpargata, galocha, mule,
  scarpin. Agora a busca sai da categoria (`foraDaCategoria`) e mostra 141 calçados. Cache v=60.
  "baduche" (erro comum) → "babuche" em `ERROS` (sem isso só 1 oferta). Cache v=61.
  "babuche masculino" trazia bandana/boné "masculino" do AliExpress: `citaAlgumaPalavra` ignora palavras de público
  (`PARA_QUEM`: masculino, feminino, infantil, unissex, adulto, kids, menino…) quando há outra palavra. Agora só Calçados. Cache v=62.
  ⭐ **Regra das 2+ palavras (ideia do Giovanni, 19/10/2026)**: em busca de produto com 2+ palavras, se 10+ produtos têm TODAS as
  palavras (`citaTodasFlexivel`: qualquer lugar, plural e masculino/feminino pela raiz, "airfryer" junto), os outros viram
  `acessorio + parecido` e vão para o botão "Ver também N acessórios e produtos parecidos". Busca de acessório e de 1 palavra não mudam.
  Conferido no ar: babuche masculino 124 só Calçados; tênis feminino 213 só Calçados; cadeira gamer 141 em Móveis. Cache v=63.
  Print "placa de video" (Eletrodomésticos/Decoração/Automotivo): `ANTES_DE_TUDO` em `lib/categorias.js` (vale antes da ordem da
  lista) põe placa de vídeo, placa mãe, GPU, GeForce, Radeon, RTX/GTX/RX, memória RAM, Ryzen, water cooler… em Informática.
  ⭐ **Busca normal começa só com as categorias do que foi buscado** (`categoriasDaBusca()` vira `secoesSo` no `buscar()` do
  app.js); as outras ficam desmarcadas em "Categorias nos resultados". Conferido: placa de video = só Informática (230);
  invictus = Perfumes + Outros; celular = Celulares. Cache v=64.
  Print "notebook gamer" (mousepad em Calçados): o vendedor pôs na categoria errada da Shopee e o `catMapa` vencia. Agora
  `marcarSecoes(ofertas, cat, daBusca)`: se o título é da categoria da busca, ele vence o catMapa. Calçados sumiu. Cache v=65.
- ⭐ **Conferência das categorias (19/10/2026, print "pipoqueira eletrica" em Informática/Limpeza/Cozinha)**: `marcarSecoes(…, buscado)`
  com `produtoBuscado(q)` (`lib/relevancia.js`: não acessório e `principal`, ou 2+ palavras todas no título): todos os produtos
  buscados ficam na MESMA categoria = a da busca (`categoriaDoProduto(q)`), senão a da maioria (60%+ dos classificados, que
  são 40%+), senão nenhuma ("Outros"). Informática ganhou `nao` (mickey/minnie mouse, monitor de bebê/cardíaco/pressão);
  Eletroportáteis + pipoqueira elétrica, máquina de pipoca, torradeira, waffle, panela de arroz… Cache v=66.
- **Quadro "Aqui você encontra milhões…" (17/10/2026, pedido do Giovanni)**: usa o mesmo card roxo (gradiente, letra branca) do
  card de resultados da busca (`.numeros-inicio` no `estilo.css`). Padrão: quadros de destaque = esse card roxo.
- **Visitas**: o site não guarda IP. Sugerido ligar Cloudflare Web Analytics (Workers & Pages > vaiprocarrinho > Metrics >
  Web Analytics > Enable); o CSP já libera cloudflareinsights. Aguardando ele.
- **Sempre tema claro (16/10/2026, pedido do Giovanni)**: removido o modo escuro automático do `estilo.css` (`color-scheme: light`).

## Análise crítica e bugs (16/10/2026, 3 revisões automáticas + conferência do Claude)
Corrigido na hora: "Ver detalhes" quebrado (`listaOutrasLojas` apagada junto com o agrupamento por gtin).
**16/10/2026: Giovanni pediu "corrija todos em ordem de gravidade".** ✅ **Segurança da conta: TODOS corrigidos e publicados**
(exceto PBKDF2: falta Giovanni testar login com e-mail+senha no site). ✅ **Site: TODOS corrigidos e publicados** (teste
Playwright com 51 verificações). ✅ **Servidor/busca: TODOS corrigidos e publicados (16/10/2026)**, testados com Shopee/AliExpress simuladas e D1 falso
(`node:sqlite`): classificação/acessórios (28 casos), histórico ao vivo das duas lojas (grava no máx. 60 por busca),
"em alta" conta 1 vez por pessoa (IP vira código curto de 6 letras, tabela `buscas_marcas`, apagado no dia seguinte;
citado na Política), robô guarda o último preço antes dos 180 dias, coleta de preços não roda 2x e usa os mais buscados
até ontem, `/api/em-alta` guarda só 5 min se a Shopee falhar, retry do shopType sem corrida. CPU da busca ~40% menor.
Branch `wip/correcoes-busca-servidor` já foi juntada (pode ser apagada).
Lista original (as seções "Segurança" e "Site" já estão resolvidas):
- **Segurança da conta**: (1) cadastro com e-mail+senha não confirma o e-mail; quem cadastrar o e-mail de outra pessoa
  continua com acesso depois que o dono entra com Google (`cadastrar.js` + `google/retorno.js`; apagar senha não confirmada e
  sessões ao entrar com Google, ou confirmar e-mail no cadastro). (2) `DELETE FROM limites WHERE chave LIKE '%:'||email` em
  `conta/index.js` aceita `%`/`_` no e-mail e zera limites de todos. (3) limite de tentativas não é atômico (`dentroDoLimite`).
  (4) 10 tentativas com o e-mail de alguém bloqueiam o login dele por 1h. (5) dá para descobrir quais e-mails têm conta.
  (6) PBKDF2 100k pode passar do limite de CPU do plano grátis (testar login no site). (7) sem cabeçalhos de segurança.
  (8) Política de Privacidade não cita IP/e-mail na tabela `limites`, cookie `vpc_google` e localStorage.
- **Servidor/busca**: (1) CPU: `categoriaDoProduto` chamado muitas vezes por busca de categoria (guardar resultado por título).
  (2) `/api/buscar` aberto: cada busca nova grava ~290 linhas no D1 (inclui acessórios) e qualquer um pode encher o limite
  diário (100 mil) ou forçar termos no "Em alta" com repetição. (3) Ordem das categorias classifica errado ("Tapete de Yoga"
  → Decoração, "Whey … Pote" → Cozinha, "Babá Eletrônica … Monitor" → Informática, "… com Carregador" → Carregadores),
  esvaziando vitrines (Suplementos quase vazia). (4) Detector de acessórios esconde produtos reais: "… com Case", "com Grelha",
  "com Tampa", "Kit", "Compatível com", "Carregador Portátil Power Bank", "Robô Aspirador … Limpador", "Mordedor Silicone".
  (5) `bate` exige "de/do" ("Jogo Panelas" não bate "jogo de panelas"). (6) robô apaga histórico com +180 dias e perde o preço
  base de produto estável (`robo/awin.mjs`). (7) Awin consultada 3x por termo (`paginas` em `consultar`). (8) Corrida no
  retry do `shopType` (só importa se a Shopee recusar o campo). (9) `/api/em-alta` guarda 1h resposta vazia se a Shopee falhar.
  (10) `coletar-precos`: parte pode rodar 2x em paralelo; partes mudam durante o dia (mais buscados).
- **Site**: (1) voltar/logo durante busca carregando põe resultados da busca nas "Ofertas do dia" (`mostrarInicio` não faz
  `estado.pedido++`). (2) janela de histórico pode mostrar/linkar outro produto (resposta atrasada). (3) item tirado do
  "Meu carrinho" volta em outro aparelho (`juntarCarrinho` em todo carregamento). (4) loop infinito GET/PUT se salvar o carrinho
  falhar. (5) resultados antigos aparecem durante nova busca (botão de acessórios da busca anterior). (6) digitar "perfume",
  "fone de ouvido" etc. vira a vitrine da categoria e apaga a caixa (fallback de `categoriaAtual`). (7) título com botão não
  corta em 2 linhas (Awin). (8) Voltar no celular deixa a gaveta de filtros aberta. (9) filtro de preço lê "1.000" como 1.
  (10) contagem de lojas inclui acessórios escondidos. (11) selos cobrem a foto no celular. (12) acessibilidade da gaveta/carrinho.

## ▶️ Robô religado (16/10/2026, pedido do Giovanni)
Pausa encerrada. Robô de preços volta a rodar sozinho **todo dia às 02:30 de Cuiabá** (cron `30 6 * * *` UTC no `robo-precos.yml`).
Selo "Desconto real" (21 dias de histórico) deve começar a aparecer por volta de 07/11/2026, antes da Black Friday (27/11).
Depois da pausa (16/10/2026, pedido dele): bandeira 🇧🇷 virou desenho (`.bandeira-br` no `estilo.css`, SVG embutido) porque o
Windows mostra o emoji só como "BR" (filtro "Nacional" e selo "Envio do Brasil"). Publicado.

## Próximos passos (atualizado 27/10/2026, 17ª sessão)
- **17ª sessão (27/10/2026)**: corrigidos os 4 detalhes de busca (ver "Qualidade das buscas"). Giovanni: conferir geladeira,
  máquina de lavar, ps5 e ventilador no site.
- ⭐ **Auditoria da busca toda madrugada (27/10/2026, pedido do Giovanni)**: job `auditoria` no `robo-precos.yml` (depois do
  `prontas`; Run workflow `so_auditoria` roda só ela) → `node robo/auditoria.mjs 150`: abre no site as 150 primeiras de
  `termosParaSugestoes` (buscas prontas, ~2 ao mesmo tempo) e `lib/auditoria.js` (`listaVisivel` imita o site: sem acessórios, só as
  categorias da busca) lista no resumo da execução os suspeitos do topo 20: palavra suspeita (`SUSPEITAS`: brinquedo, capa, adesivo,
  reposição, enfeite…; boneca/brinquedo normal em busca de brinquedo ou sem categoria), preço < 10% do típico, "não começa pelo
  produto" no topo 10. **Não muda nada no site**: Claude lê o log (GitHub MCP `get_job_logs` do job `auditoria`) e corrige as regras.
  Correção das regras = permanente (vale para os produtos que entrarem depois). 1ª rodada (60 buscas) achou: **"kit" fazia a busca
  virar "de acessório"** (nada escondido, maquiagem de brinquedo em "kit maquiagem") → "kit" saiu de `GENERICAS` e da regra das 2+
  palavras; "skin care" = skincare; palavra de acessório que é pedaço da buscada não conta ("Baba Skin" em "kit skincare"). Cache v=85.
  Ajustes (cache v=86): pausa de 0,5 s (sem ela 66 de 150 buscas davam 429 no limite do Cloudflare), palavras só nas 8 primeiras do
  título, sem decoração/compatível/suporte/película/refil; VARIANTES + aquecedor, arrefecedor, pequeno(a). Testado subir o corte de
  preço do nível 2 para 10%: escondia tênis infantil de R$ 20 e mini geladeira de R$ 360 → desfeito (fica 8%).
  Execução #54 (150 buscas, 0 falhas, 18 suspeitos): reais = peças em "panela de pressão elétrica" (anel de vedação R$ 51, panela
  de arroz R$ 41), Echo Dot de R$ 48, chaveiro de pelúcia em "stanley", guarda-roupa de pano R$ 211; alarmes falsos = mesa de jantar
  (típico R$ 5.887 distorcido), cama pet R$ 14, perfume R$ 12,50, "com chaveiro"/"com capa" de brinde, pendrive chaveiro.
- **16ª sessão (27/10/2026) fez**: app instalado com nome na abertura (manifesto + ícones); cupons sem o código no título; Resend
  verificado (e-mails saem do domínio) + filtro do Gmail; Cobasi no site (8.966 produtos); robô passou a tirar fotos com 403 do S3;
  Lojas Benoit pausada (feed com fotos e preços errados). **Próximo**: conferir o robô da madrugada de 28/10 (job `prontas` refeito
  sem a Benoit; Monte Carlo segue com ~30% sem foto); Giovanni: 2FA, senha do Registro.br, UptimeRobot; decidir a seção "Outras
  lojas parceiras" (marcas da Lomadee sem produtos).
- ✅ **App instalado (27/10/2026, print do Giovanni: ao abrir aparecia só o ícone)**: `public/manifest.webmanifest` (nome "Vai pro Carrinho",
  fundo/tema `#6d28d9`, standalone; liberado em `PUBLICOS`). O Chrome mostra na abertura o ícone "any" e não deixa tirar essa tela: por
  isso os ícones "any" (`marca/app-nome-192/512.png`) são o logo COM o nome embaixo (fundo transparente); o ícone da tela inicial usa
  os "maskable" (`app-maskable-*.png`, sem nome) e o iPhone o `apple-touch-icon.png`. Uma 2ª tela de abertura feita no site foi
  testada e tirada (aparecia o logo duas vezes). Para ver a mudança: desinstalar e instalar de novo ("Instalar app" no Chrome).
- ✅ **Resend com o domínio (27/10/2026)**: Giovanni adicionou vaiprocarrinho.com.br no Resend (São Paulo, Return-Path `send`,
  "Auto configure" do Cloudflare: TXT `resend._domainkey` e `send` → forge.rmta.net, conferidos no DNS) e criou `EMAIL_REMETENTE`
  no Cloudflare. Site republicado. ✅ "Verified" no Resend e "Esqueci minha senha" chegou no Gmail dele. Gmail com filtro
  (from/to vaiprocarrinho.com.br → marcador VaiProCarrinho, fora da Caixa de entrada).
- ✅ **Cobasi BR aprovada na conta PJ da Awin (27/10/2026)**: execução #46 (Run workflow `so_awin`, disparada pelo Claude): feed 48117,
  8.967 produtos (1 sem foto), 8.982 novos no site; busca "ração" já traz 60 da Cobasi. Lojas Benoit também no feed (3.390; 1.483 sem
  foto, 638 com link 404; aprovada na conta PF → 1.263 no site). Banco 256 MB de 500 MB. 15 lojas da Awin, 39 no total.
  /api/lojas VERSAO=12 e numeros v=6 (lista "Lojas parceiras" fica 6 h guardada: trocar a versão quando entrar loja nova).
  **Fotos da Benoit (print do Giovanni: só ícone no lugar da foto)**: a CloudFront/S3 dela responde 403 (XML, server AmazonS3) para foto
  que não existe; o robô tratava 403 como "não sei" e mantinha. Agora `fotoAbre` conta 403 do S3 como quebrada, produtos tirados por
  foto também não contam na trava "feed caiu mais da metade" (`foraDeProposito`) e `VERSAO_FOTOS = 2` fez o robô testar de novo as
  111.932 fotos (#49, 18 min). Benoit: 3.072 sem foto + 107 com link 404 → **209 no site**, fotos conferidas (20 de 20 abrem).
  Texto avisando a Benoit (fotos e links) enviado por ele pela Awin.
  ⏸️ **Lojas Benoit FORA do site (27/10/2026, decisão do Giovanni)**: além das fotos, o preço do feed não bate com o site dela (forno
  R$ 8.699 no feed x ~R$ 10 mil na loja). `LOJAS_PAUSADAS` em robo/awin.mjs (nome normalizado; a loja é tratada como não aprovada e os
  produtos são apagados). #50 tirou; Run workflow `so_prontas` refez as buscas prontas. /api/lojas VERSAO=13, numeros v=7.
  **Religar quando o Giovanni avisar que a Benoit corrigiu**: tirar "lojas benoit" da lista, rodar `so_awin` e conferir fotos e preços.
- ✅ **Cupons com o código no título (27/10/2026, print do Giovanni: "CHAPEUDEVIAGEM", "AVENTURANDO")**: `semCodigo` em
  lib/cupons.js tira o código do título e da descrição (sem maiúsculas/acentos/espaços/símbolos; só código de 4+ letras e palavra
  inteira); título que fica vazio = "Cupom de desconto". /api/cupons VERSAO=5. Conferido no ar: 79 cupons, 0 com o código no texto.
- ✅ **15ª sessão (25/10/2026): chave do robô (`lib/robo.js`), publicada**. `/api/preparar-buscas`, `/api/coletar-precos`,
  `/api/conferir-alertas` e `/api/conferir-lojas` estavam abertos a qualquer um; agora exigem `Authorization: Bearer <chave>`.
  Secret **`CHAVE_ROBO`** no Cloudflare (Giovanni cadastrou com esse nome); no GitHub ele cadastrou como `ROBO_CHAVE` ou `CHAVE_ROBO`
  (o workflow aceita os dois). Sem a chave no Cloudflare = 503; chave errada = 401 (conferido no ar). Execução #37: robô entrou com a chave ✅. Robô falha visível (exit 1)
  se a chave for recusada. Trocar a chave = trocar nos dois lugares e publicar de novo (o Cloudflare só lê Secret novo em deploy novo).
- ✅ **15ª sessão (25/10/2026, itens 4, 6, 7 e 9 da lista de melhorias, pedido do Giovanni)**:
  (4) `.github/workflows/testes.yml`: a cada push roda `node --check` em todos os .js, `testes/modulos.mjs` (importa todos os
  arquivos de functions/ e lib/: pega import quebrado), `testes/busca.mjs` e o robô com o feed de exemplo. Falha = e-mail do GitHub
  (não segura a publicação do Cloudflare). 1ª execução ✅.
  (6) `lib/links.js` (`linkAbre`: true/false(404/410)/null; `lojaComLinksQuebrados`): robô da Awin abre 8 produtos de cada loja
  pelo endereço direto (`destino` = merchant_deep_link / link do formato Google / `ued`; nunca o link de afiliado = clique falso);
  5+ em 404 e 80%+ → loja fora do site naquele dia (linha "🔗 Links" no resumo). Lomadee: `conferirMarcas` abre 4 por marca (6 s),
  coluna `quebrado` em `marcas_lomadee`; marca quebrada sai de "Lojas parceiras" e da busca (`marcasQuebradas`); resposta do
  `/api/conferir-lojas` ganhou `linksQuebrados`. Testado com lojas simuladas; UP Kids real dá false (404).
  Execução #38 (1ª real): Elements 7/8 em 404 (saiu inteira, 45 produtos) e **Arno 6/8** (conferido à mão: 5 de 6 dão 404 no
  arno.com.br). Ajuste: loja da Awin com até 3 mil produtos (`TESTAR_TODOS_ATE`) e 2+ quebrados na amostra → testa TODOS os
  produtos (8 ao mesmo tempo, `linksQuebrados`) e tira só os quebrados; loja maior segue a regra da loja inteira.
  Sugerir ao Giovanni avisar Arno e Elements pela Awin (links do feed dão 404). Ponto de restauração #38 apareceu no log ✅.
  #39: Elements 39 de 45 quebrados (6 voltaram), Arno 50 de 87; mas a trava "feed caiu mais da metade" não deixou remover os da
  Arno → produtos tirados por link (`foraPorLink`) agora contam como presentes nessa trava. #40: "Removidos: 50" ✅ (Arno fica com 37,
  Elements com 6). Páginas da loja/buscas guardadas no cache mostram os antigos por até ~1 h. Monte Carlo: 2 de 8 quebrados na
  amostra (loja grande, 8 mil produtos: só a regra da loja inteira) — acompanhar.
  (7) D1 Time Travel (30 dias no plano pago): passo "Ponto de restauração do banco" no job `awin` anota o bookmark no resumo
  (API `/d1/database/<id>/time_travel/bookmark`); README "Cópia do banco (restaurar)" com o comando `wrangler d1 time-travel restore`.
  (9) `public/como-funciona.html` (+ `PUBLICOS` no middleware, link no topo, rodapé e na Política): o que é, de onde vêm os
  preços, selos (Desconto real, Baixou, Menor em 30 dias, termômetro, Internacional), links conferidos, alertas. Sem falar de
  comissão (decisão de 13/10). Sem contato (contato@ ainda não existe).
  Falta (com o Giovanni): 2FA nas contas, senha do Registro.br, UptimeRobot, contato@.
- ✅ **Teste de invasão (25/10/2026, pedido do Giovanni: "seja um agente externo e tente burlar o site")**. Sem problema: login
  (10 senhas erradas = bloqueio 1 h), cookies (HttpOnly/Secure/SameSite), proteção contra outro site agir pelo visitante (Origin
  em todo POST/PUT/DELETE), Google (state, aud, iss, email_verified), SQL (tudo com bind), XSS (el() só texto; CSP sem inline),
  arquivos internos (/.git, /functions, ../ = 404/400), cabeçalhos de segurança, CORS fechado. **Corrigido:**
  (1) **Alertas mandavam e-mail para quem não confirmou o e-mail**: qualquer um criava conta com o e-mail de outra pessoa e um
  alerta com título/link falsos, e o robô mandaria "📉 Baixou!" do nosso domínio com link de golpe (só não acontecia porque o
  Resend ainda não está verificado). Agora `emailConfirmado` (lib/conta.js; Google ou link aberto) é exigido em `conferirAlertas`;
  o 1º alerta de conta com senha manda "Confirme seu e-mail" (`enviarConfirmacao`, link `/#confirmar=<token>` 1 dia, tabela
  `redefinicoes`, máx. 3/h), `POST /api/conta/confirmar` ({token} ou {reenviar:true}), aviso amarelo em "Meus alertas" com
  "Mandar o link de novo". O botão do e-mail vai para `/?produto=<id>` (ou /api/ir), nunca para o link que veio do navegador.
  (2) **/api/ir aceitava qualquer endereço** (`u=https://site-falso` ia para o encurtador da Lomadee: possível redirecionamento
  com o nosso domínio + gasto do limite de 60/min). Agora os links da Lomadee levam assinatura `&s=` (HMAC derivado do
  LOMADEE_API_KEY, `assinaturaValida`/`comLinksAssinados` em lomadee.js); sem assinatura válida não gera link novo: só usa link
  já guardado ou manda para o site da própria marca, senão volta à página inicial. Cache v=80, /api/lojas VERSAO=7.
  (3) **/api/cupons mandava todos os códigos inteiros** (furava o "código escondido"): a lista agora manda `codigoMascara` e o
  código vem de `/api/cupons?codigo=<id>` só no clique em "Pegar cupom" (VERSAO=3). Quem chamar esse endereço à mão ainda vê o
  código de um cupom por vez (igual a clicar).
  ✅ **Limite de pedidos no Cloudflare (26/10/2026, Giovanni fez; conferido pelos prints)**: domínio > Security > Security rules >
  Rate limiting rules > "Limite API": URI Path starts with `/api/`, por IP, 60 pedidos em 10 s → Block 10 s (plano grátis: só 1
  regra; já usada). Não deu para testar o bloqueio daqui: a rede do Claude sai por vários IPs (160.79.106.x).
  O robô fica bem abaixo (2 buscas prontas ao mesmo tempo, ~5 s cada).
- ✅ **contato@vaiprocarrinho.com.br FUNCIONANDO (26/10/2026)**: Cloudflare Email Routing; Giovanni apagou à mão o MX nulo e o
  TXT `v=spf1 -all` (o Cloudflare não conseguia); MX route1/2/3.mx.cloudflare.net + SPF `include:_spf.mx.cloudflare.net ~all` +
  DKIM; regra `contato` → Gmail pessoal dele (verificado). Teste de outro e-mail chegou no Gmail. DMARC `_dmarc` (reject) mantido.
  Só RECEBE; responder como contato@ = depois (Gmail "Enviar e-mail como" + SMTP do Resend; o SPF precisará incluir o Resend).
- ⏳ **2FA (item 2, 26/10/2026)**: passos entregues (Google Authenticator; ordem: Gmail, Cloudflare, GitHub, Registro.br, Awin PF e PJ,
  Lomadee, Shopee, Resend; guardar códigos de recuperação fora do celular). Giovanni vai fazer "outra hora": lembrar de vez em quando.
  Ainda pendentes da lista: 3 (senha do Registro.br), 5 (UptimeRobot), responder como contato@ (opcional).
- ⏳ **UptimeRobot (item 5, 26/10/2026)**: passos entregues (monitor HTTP(s) da página + monitor Keyword em `/api/numeros` com a
  palavra `lojas`, 5 min, alerta por e-mail). Giovanni vai fazer "outra hora".
- **Qualidade das buscas (26/10/2026, fim da 15ª sessão, pedido do Giovanni)**: auditadas 20 buscas populares (air fryer, celular,
  fone, geladeira, smart tv, notebook, tênis, perfume, cadeira gamer, smartwatch, panelas, bicicleta, ventilador, máquina de lavar,
  colchão, mochila, whey, furadeira, vestido, ps5): resultados bons (150–540 produtos de verdade cada). Lento por 2 motivos:
  (1) cada troca de `VERSAO_CACHE` apaga as buscas prontas até a madrugada → Run workflow ganhou `so_prontas` (refaz só elas, ~18 min;
  **usar sempre depois de trocar a versão**); (2) Lomadee travava a busca até 8 s → `LIMITE_LOJA_LENTA_MS` = 5 s na busca ao vivo.
  Depois: buscas prontas 0,3–1,2 s; busca nova ~3–4 s (era 6–9 s).
  ✅ **Os 4 detalhes corrigidos (27/10/2026, 17ª sessão, cache v=84)** em `lib/relevancia.js`: palavras grudadas (`GRUDADA` em
  `comSinonimos`: "SUPORTEDECONTROLE" → "suporte de controle"); `MARCA_DE_BRINQUEDO` (Our Generation, Polly Pocket, Baby Alive…) e
  "boneca(s)" em `BRINQUEDO`; `OUTRO_PRODUTO` ventilador + lareira/lenha/fogão; preço como prova: produto comum comparado também com a
  mediana dos comuns (as mini lavadoras baixavam o típico), versão de nicho segue com a mediana de todos. Conferido em 28 buscas reais:
  só saíram coisas que não são o produto (raquete de tênis de mesa, desodorante "sem perfume", celular de mostruário, tigelas em
  "máquina de lavar", toppers de R$ 45 em "colchão"). Run workflow `so_prontas` disparado.
- PCYES (Lomadee): 1ª "foto" era a página do produto e a descrição vinha com HTML escapado e cortado → `ehFoto`/`semHtml` em
  lomadee.js (26/10). Cache v=83, /api/lojas VERSAO=10.
- **Lomadee: marcas que pagam mais (26/10/2026, pedido do Giovanni)**: lista tirada das 161 páginas públicas `lomadee.com.br/pt-br/marcas/<nome>`
  (comissão "até X%"): Laluna 18% (moda infantil), Kidy 17%, Lojas REDE 15%, Disney 15%, Coza 15%, Cá d'Oro 14%, Nautika 13%, Sawary/
  Catran/Esbelt/Sou Nuaá 12%. Shein = 0,4% (decidido: se usar, só no "Ir para a loja"). Giovanni disse que quase todas já estão
  liberadas. Execução #42 (Run workflow com a opção nova `so_lomadee`, que roda só a conferência das marcas; cache das marcas v3,
  /api/lojas VERSAO=8, numeros v=4): 105 marcas liberadas, **as mesmas 24 mandam produtos** (as que pagam mais não mandam catálogo
  pela API). Proposto: seção "Outras lojas parceiras" só com o botão "Ir para a loja" para marcas sem produtos. Aguardando decisão.
- **Categoria Celulares (26/10/2026, print do Giovanni: só 114 ofertas)**: vitrine ganhou "smartphone" e "celular"; site carrega
  sozinho até 200 produtos (`PRODUTOS_DESEJADOS`, era 100). Agora ~240 (Shopee + Kabum). AliExpress quase não tem celular ≥ R$ 500
  que entregue no BR (3–4 por lote; o resto é capinha). Cache v=81 (buscas prontas refeitas na madrugada).
- **Convites do Grupo Lunzo na Awin (26/10/2026)**: marketplace europeu (SK, RO, DE, HU, PL; entrega só no próprio país) → recusados.
- ⭐ **Pesquisa "como o cérebro decide uma compra" (26/10/2026, pedido do Giovanni) → itens 1, 2 e 3 feitos**: (1) **"✨ Escolha rápida"**
  (`escolhaRapida`/`desenharEscolhaRapida` no app.js, `#escolha-rapida` no index): na busca e na categoria, 3 cartões "💰 Mais barato",
  "🏆 Custo-benefício" (meio; mais vendido entre os abaixo da mediana) e "⭐ Mais bem avaliado" (nota ≥ 4,5 com 10+ vendas), cada um com o
  critério escrito; só com 6+ produtos comparáveis; base = `ofertasComparaveis` (busca) ou produtos da categoria (`semForaDaCurva`).
  (2) **"⭐ Bem avaliados (nota 4 ou mais)"** em "Mais opções" (`#bem-avaliados`, `NOTA_BOA`; só a Shopee manda nota; "Mais opções"
  agora aparece quando há frete OU nota). (3) **Centavos menores e no alto** (`.centavos`). Testado com dados reais (air fryer, fone,
  perfume, geladeira, Celulares). ✅ Itens 4 e 5 (26/10): foto "voa" até o carrinho do topo ao guardar (`voarAteCarrinho`, `.voando`,
  `.chegou`) e resumo no Meu carrinho ("N produtos · R$ total" + "💸 Você economiza R$ X"; item guarda `precoAntigo`, aceito também em
  `limparCarrinho` de lib/conta.js). Não feito: esqueleto de cartões (já existe `esqueletos(8)` na busca). Ajuste (print dele: "mais barato" trocava sozinho): o quadro só aparece depois dos lotes automáticos
  (`estado.completando`) e fica parado até mexer num filtro ou clicar em "Ver mais" (`chaveDaEscolha`). Base: Chernev 2015 (excesso de opções), Spiegel (nota 4,2–4,5), Thomas & Morwitz 2005, Simonson 1989, Deloitte 2020.
- **Awin sem lojas novas (26/10/2026, execução #41)**: as mesmas 13 (conta nova 10 "active", antiga 11): Monte Carlo, Kabum, Spicy,
  Elements, Casa Tema, Animale, Shark-Ninja, Karsten, Lauri, EINSTAR, Posthaus, Polishop, Arno. Pedidos pendentes/recusados só
  aparecem no painel da Awin (abas Pendente/Recusado): pedir print se ele quiser que o Claude analise.
- ✅ **Botão "Ir para a loja →" (26/10/2026, pedido do Giovanni: "comissão de quem visita a loja pelo site")**: na janela "Lojas
  parceiras", cada loja tem "Ver produtos" + "Ir para a loja →" (`.lp-botoes`/`.lp-ir`), link `/api/ir-loja?id=<loja>`
  (functions/api/ir-loja.js): Shopee `linkShopee` (mutation generateShortLink), AliExpress `linkAliExpress`
  (aliexpress.affiliate.link.generate, promotion_link_type 0), Awin `cread.php?awinmid=&awinaffid=` (afiliado tirado do link de
  um produto da loja: PF ou PJ), Lomadee `link` do canal liberado em `marcasAprovadas` (cache de marcas v2). Link guardado 7 dias
  no cache; sem link volta para `/?loja=<id>`. Conferido no ar: os 4 chegam à página inicial com utm/aff da conta dele.
  Explicado: comissão vale para qualquer compra dentro do prazo do cookie (último clique; mesmo aparelho/navegador). Conhecido e aceito: 10 senhas erradas com o e-mail de alguém bloqueiam o
  login dele por 1 h (ele ainda entra por Google ou "Esqueci minha senha"). Conferido no ar (commit 0374bd8): lista de cupons
  sem código inteiro, /api/ir com site falso volta à página inicial, link real assinado gera o lmdee.link. Buscas prontas
  voltam na madrugada (v=80); até lá a busca nova leva ~4 s.
- **14ª sessão (24–25/10/2026) fez**: carrinho da conta com produtos da Lomadee; tirado o filtro "Com desconto"; lojas com menos
  de 5 produtos fora da janela "Lojas parceiras" (37 lojas); **cupons** (81 de 45 lojas, código escondido até "Pegar cupom");
  **filtro por marca**; **página /black-friday** (3.523 ofertas no 1º enchimento: 458 "baixou", 3.065 "desconto da loja");
  regra nova do "📉 Baixou X%" (`caiuDeVerdade`).
- **Conferir na próxima conversa**: (1) log do robô da madrugada de 25/10: job `prontas` deve mostrar `"blackFriday": N` em cada
  parte; (2) `/api/black-friday` com ofertas e sem "baixou" estranho (ver histórico dos primeiros com `/api/historico?id=`);
  (3) por volta de 07/11 começam os "✅ Desconto real" (21 dias de histórico).
- **Giovanni**: conferir no site a Black Friday, os cupons e o filtro de marcas (mandar print do que estiver estranho);
  verificar o domínio no Resend (alertas de preço por e-mail); pedir Posthaus, Polishop, EINSTAR e Arno também na conta PJ da Awin.

### Antes (atualizado 22/10/2026, 13ª sessão: lojas parceiras, limite de leituras do D1, só lojas com produtos)
- **Meu personagem ampliado (23/10/2026, pedido do Giovanni: "faça todos")**: cabelos coque/black/trança/moicano/boné; cores de
  cabelo rosa/azul/roxo; rostos rindo/língua/estrela/óculos escuros/bigode/sardas; carrinhos cestinha/corrida (chamas `.anim-chama`)/
  foguete (fumaça `.anim-fumaca`)/presentes/blackfriday (`grade()` reaproveitada, `PRESENTES`/`ETIQUETAS` caem no lugar dos produtos);
  campos novos `acessorio` (nenhum/fone/mochila/sacola/gorro) e `jeito` (andando/correndo/patins; classes `.anim-correndo`/`.anim-patins`);
  botão "🎲 Sortear" (`sortearPersonagem`); prévia com o personagem parado no meio (antes atravessava e aparecia cortado).
  Personagem salvo antes vale (`PERSONAGEM_PADRAO` no app.js / `PADRAO_PERSONAGEM` em lib/conta.js). Opções nos DOIS arquivos.
  No computador o editor abre largo (classe `janela-larga`, prévia à esquerda e opções em 2 colunas), sem rolar.
- ⭐ **Alerta de preço + "Vale a pena comprar agora?" (23/10/2026, itens 1 e 2 da 2ª análise de concorrentes, pedido do Giovanni)**:
  🔔 em cada cartão (e nas janelas de histórico/detalhes) → janela na conta (etapa "alerta"; sem conta pede para entrar e volta ao
  alerta): "Quando o preço baixar" (2%+) ou "Quando chegar a R$ X". "🔔 Meus alertas de preço" na conta. `lib/alertas.js`, tabela
  `alertas` (em lib/conta.js; apagada com a conta; some em 180 dias; máx. 50 por pessoa), API `/api/conta/alertas`. Robô: passo
  "Conferir alertas de preço" no job `awin` chama `/api/conferir-alertas?parte=N` (Awin do banco; Shopee `ofertaShopeePorId` e
  AliExpress `ofertasAliExpressPorIds` (productdetail.get) — ✅ testados no ar; Lomadee = último preço em `precos`); 1 e-mail por pessoa
  via Resend, só avisa de novo se baixar mais; link "Parar este alerta" (`/api/alertas/parar`, GET mostra botão, POST para).
  Termômetro (`momentoDeCompra` no app.js, 14+ dias de histórico; `resumirHistorico` ganhou dias/menor30/maior30): 🟢 desconto real ou
  menor em 30 dias, 🔴 5%+ acima do preço de costume, 🟡 estável/normal; antes de 14 dias "⏳ …". Política cita os alertas. Cache v=79.
  ❗ **Para o e-mail chegar aos visitantes falta verificar o domínio no Resend** (resend.com > Domains; registros DNS no Cloudflare)
  e criar a variável `EMAIL_REMETENTE`; até lá o Resend só entrega para o e-mail dono da conta Resend.
  ✅ 24/10/2026: `limparCarrinho` aceita o link `/api/ir?…` (produtos da Lomadee agora salvam no carrinho da conta).
- ⭐ **WhatsApp + Comparar (24/10/2026, itens 3 e 4 da 2ª análise de concorrentes, pedido do Giovanni)**: botão redondo verde do
  WhatsApp no cartão (grupo `.botoes-oferta` com 🔔 e carrinho) e "Enviar no WhatsApp" na janela de detalhes (`compartilharWhatsApp`,
  wa.me). Link = `vaiprocarrinho.com.br/?produto=<código>` (`lib/produto.js` + `/api/produto`: Awin do banco, Shopee/AliExpress pela API;
  Lomadee manda link de busca pelo nome); o site abre a janela "Ver detalhes" (`abrirProdutoDoLink`) e o `_middleware.js`
  (`comPreviaDoProduto`) troca título e tags og: (foto, nome, preço) para a prévia do WhatsApp; `index.html` ganhou og: padrão.
  "⚖️ Comparar" no canto de baixo da foto (`.oferta-topo`): até 4 (`MAX_COMPARAR`), barra fixa no rodapé (`#barra-comparar`) e
  janela `#janela-comparar` com tabela (loja, preço com menor em verde, desconto, vale a pena?, avaliação, vendidos, envio, Comprar).
  Shopee pelo código: o número vai escrito na consulta (`ofertaShopeePorId`; como variável Int64 a Shopee dava "wrong type" — isso
  também fazia os alertas da Shopee usarem só o último preço visto até 24/10). Conferido no ar: links de Shopee, AliExpress e Awin.
- **Lojas por conta da Awin (23/10/2026, execução #33)**: conta PJ = Casa Tema, Shark-Ninja, Kabum, Monte Carlo, Spicy, Karsten,
  **Animale (nova, 10.665 produtos)**, Elements, Lauri. Só na conta PF (faltam pedir na PJ): **Posthaus, Polishop, EINSTAR**.
  Total: 12 lojas, 91.516 produtos nos feeds; banco 115 MB.
  24/10: **Arno** aprovada na conta PF (feed 100096, 124 produtos; 37 sem foto que abre → 87 no site). Pedir também na PJ.
  13 lojas da Awin, 39 lojas no total; banco 121 MB.
- ⭐ **Cupons + filtro por marca (24/10/2026, itens 3 e 5 da lista de ideias, pedido do Giovanni)**: `lib/cupons.js` + `/api/cupons`
  (Lomadee `GET /affiliate/campaigns?types=GenericCoupon,PersonalCoupon&status=onTime`, 20 por página, até 10 páginas; link = shortUrl
  do canal liberado; só marcas aprovadas; guardado 3 h, não guarda se alguma página falhar; VERSAO=2). No ar: 81 cupons de 45 lojas.
  Site: janela `#janela-cupons` (código + "Copiar", validade, "Ir para a loja"), botão "🎟️ Ver N cupons" no card roxo da página inicial,
  link "🎟️ Cupons de desconto" na faixa do topo, selo "🎟️ Cupom" no cartão/detalhes/janela de lojas das lojas com cupom (`botaoCupom`).
  **Código escondido** (pedido do Giovanni: quem copiasse e fosse direto à loja compraria sem o link): mostra só "BRI•••" e o botão
  "🎟️ Pegar cupom e ir para a loja" (link de afiliado) revela, copia e abre a loja (`itemCupom`/`codigoEscondido`). Testado: abre com lmdeeTracking.
  Awin ("Minhas Ofertas") não entrou: a API de promoções da Awin pede outro token (OAuth). **Filtro "Marcas"** (`#caixa-marcas`,
  `marcaDe`/`desenharFiltroMarcas` no app.js): marca tirada do título pela lista `MARCAS` (vem de `/api/vocabulario`), com apelidos
  (iphone→Apple, galaxy→Samsung, redmi/poco→Xiaomi) e `MARCAS_AMBIGUAS` (golden, estrela, reserva, hp… só nas 3 primeiras palavras);
  10 visíveis + "Ver todas"; zera junto com as categorias (`zerarSecoes`). Marca nova → acrescentar em `MARCAS` (lib/vocabulario.js).
  Ajuste (print do Giovanni: só 3 marcas na página inicial): o filtro some nas "Ofertas do dia" (quase tudo sem marca no nome) e
  só aparece na busca/categoria/página de loja; `LOJAS_QUE_SAO_MARCA` (Karsten, Polishop, Monte Carlo, Animale, Shark-Ninja→Ninja,
  Arno, Malwee, Brinox, Rovitex) dá a marca da loja ao produto sem marca no título. `/api/vocabulario` v=2 (trocar ao mudar MARCAS).
- ⭐ **Black Friday de verdade (24/10/2026, item 1 da lista de ideias, pedido do Giovanni)**: `vaiprocarrinho.com.br/black-friday`
  (`_middleware.js` serve a página principal com título/og: próprios; o `app.js` abre como uma "loja" de id `BLACK_FRIDAY` em
  `mostrarLoja`, resumo em `desenharResumoBlackFriday` com contagem até 27/11 e legenda). Dados: `lib/blackfriday.js`, tabela D1
  `bf_ofertas`, preenchida por `/api/preparar-buscas` (cada busca pronta guarda os seus produtos com desconto e tira os que perderam).
  Níveis: 1 = ✅ desconto real (21+ dias de histórico), 2 = 📉 baixou (caiu nos últimos 7 dias vs. habitual), 3 = desconto da loja
  10–75% sem histórico suficiente (máx. 8 por busca); com 21+ dias e sem desconto real NUNCA entra (preço subido antes). Sem acessórios.
  Some quem nenhuma busca viu em 36 h. `/api/black-friday?pagina=N` (48 por página, guardada 15 min, lista vazia não é guardada).
  Entradas: link "🖤 Black Friday" no topo, chip preto 1º dos "em alta", botão preto no card roxo da página inicial.
  Links internos agora usam "/?q=" e "/?loja=" (para sair da /black-friday). "Limpar filtros" na Black Friday só limpa os filtros.
  1º enchimento (24/10, Claude rodou as 448 buscas à mão) mostrou "baixou" falso: Smart TV 32 R$ 2.500 por 1 semana → R$ 907
  ("baixou 64%"), lençol 36 → 119 → 36 ("69%"). Corrigido em `caiuDeVerdade` (lib/ofertas.js, vale para o selo "📉 Baixou X%" do site
  todo): 7+ dias de histórico, preço de hoje = o menor já visto, queda até 50%. Nível 3 (desconto da loja) só até 60%. `REGRAS_DESDE`
  em lib/blackfriday.js esconde o que foi guardado antes da regra nova. `/api/black-friday` v=3.
- **Lojas pequenas fora da janela (24/10/2026, pedido do Giovanni: Ferramentas Kennedy com 1 produto)**: loja com menos de 5
  produtos contados (`MIN_PRODUTOS_LOJA`/`lojaPequena` em lib/ofertas.js) não aparece em "Lojas parceiras" nem conta em `/api/numeros`;
  os produtos continuam nas buscas. Saíram Ferramentas Kennedy e Hunter Fan (1 cada): 39 → 37 lojas. `/api/lojas` VERSAO=6, numeros v=3.
- ✅ **Amakha Paris tem só 10 produtos mesmo** (24/10/2026: pedindo 48 a Lomadee manda 10; Malwee/Friopeças/Toymania mandam 48).
  **Quantidade nas lojas da Lomadee** (pergunta do Giovanni: "por que umas mostram e outras não?"): o `count` da Lomadee é só o da
  página (não há total). `conferirMarcas` pede 1 página de 100 (`CONTAGEM`) e guarda em `marcas_lomadee` (`produtos` + coluna nova
  `mais`); a janela mostra "N produtos" ou "Mais de 100 produtos" (`produtosMais`). Contagens antes de `CONTA_TOTAL_DESDE` (24/10 12:20 UTC)
  não aparecem. Job `lomadee` com curl de até 300 s por parte. `/api/lojas` VERSAO=5.
- **Frete (23/10/2026, print do Giovanni: filtro "Frete grátis" deixava a lista vazia)**: nenhuma loja informa frete (Shopee,
  AliExpress, Lomadee não mandam; 10 lojas da Awin conferidas, ~1.200 produtos, 0 com frete grátis — os feeds vêm sem
  delivery_cost/shipping). A opção da barra lateral agora só aparece se algum produto da lista tiver `freteGratis`
  (`desenharBotaoFrete` no app.js). Volta sozinha quando uma loja mandar frete no feed.
- ⭐ **Oferta de verdade (23/10/2026, pedido do Giovanni: "se é oferta, trazer a informação real")**: `ehOfertaDeVerdade` e
  `semDescontoFalso` em `lib/ofertas.js`. "Ofertas do dia" só com desconto da loja de 5% a 75%; produto com 21+ dias de histórico
  (`historico.verificavel`) só entra com `descontoReal` (esses primeiro). Awin `destaques`: até 3 por loja (índice loja+desconto),
  10–75% (antes eram 16 da Posthaus com 76–90%). Cartão (busca e loja): com 21+ dias, desconto que o histórico desmente some (selo,
  riscado, economia; fica em `descontoDaLoja`); confirmado com outro número, vale o nosso (preço "de" = `historico.habitual`).
  No ar: 83 ofertas (Shopee 44, AliExpress 24, Karsten/Monte Carlo/Polishop/Posthaus/Spicy 3 cada), todas entre 5% e 75%.
  "categoriasAprendidas" agora 618 (o 500 de antes era coincidência).
- ⭐ **Otimizações com o Workers Paid (23/10/2026, pedido do Giovanni: "faça todos na ordem")**: (1) busca: 1ª resposta com 3
  páginas por loja (`PRIMEIRO_LOTE`, ~4 s como antes; com 6 a AliExpress deixava a 1ª tela ~2 s mais lenta), as seguintes com 6
  (`PAGINAS_POR_LOTE`; 2ª chamada traz +300–400 produtos em 2–4 s); AliExpress até a 6ª página (`MAX_PAGINAS`), páginas 4–6 só com
  a consulta principal (`PAGINAS_COM_EXTRAS = 3`); Lomadee 1 consulta por 6 páginas (`PAGINAS_POR_CONSULTA`; 2 ao mesmo tempo passavam
  de 8 s); vitrine 2 páginas por chamada (`PAGINAS_VITRINE`). Cache v=78. (2) histórico ao vivo grava o preço de TODOS os produtos
  da busca que mudaram (era 60). (3) buscas prontas até 1000 (`MAX_PRONTAS`; + tudo de `termosParaSugestoes` + 600 buscados no mês);
  job `prontas` faz 2 ao mesmo tempo (xargs -P 2; mais que isso passa do limite da Lomadee). (4) mapa de categorias volta a aprender
  com as buscas dos visitantes. (5) senha: PBKDF2 em 6 rodadas encadeadas de 100 mil (o Cloudflare não aceita mais de 100 mil por
  chamada em nenhum plano), formato `pbkdf2x$100000$6$sal$hash`; senhas antigas (`pbkdf2$…`) valem e são regravadas no próximo login
  (`senhaPrecisaAtualizar` em lib/conta.js). Testado: login falso 401 em ~0,8 s no ar.
  Execução #33: **446 buscas prontas em 18 min** (eram 300 em ~28 min), todas guardadas; Awin com o cache das fotos em 2 min.
  Curiosidade a conferir: "categoriasAprendidas" sempre 500 (em #27 e #33) — ver se há algum limite escondido no mapa.
- **Fotos quebradas da Awin (23/10/2026, print "anel prata")**: algumas lojas mandam fotos que não existem (404 no site delas).
  `conferirFotos` em `robo/awin.mjs`: testa a foto principal (HEAD, 64 ao mesmo tempo; 403/erro de rede = "não sei", não tira),
  troca pela 1ª extra que abre ou deixa o produto de fora. Resultado em `.cache/fotos.json` (cache do GitHub Actions, salvo mesmo se
  falhar; boas refeitas a cada ~14 dias com dia sorteado, ruins a cada 3). 1ª vez (#32): 83 mil fotos em 11 min; **fora: Monte Carlo
  2.454 (~30%!), Lauri 314, Karsten 11**; conferido: as 17 que saíram de "anel prata" dão 404 e as 43 que ficaram abrem.
  Job `awin` com `concurrency: robo-awin` (uma por vez) e limite de 60 min. Sugerir ao Giovanni avisar a Monte Carlo pela Awin.
- **13ª sessão, 23/10/2026**: botão "✕ Limpar filtros" no card roxo (categoria/loja aberta → volta ao início, como o logo; busca dentro
  de categoria → busca em todas); ícone do carrinho saiu de cima da foto e foi para a linha acima do "Comprar" (`.acoes-oferta`).
  Workers Paid assinado; execução #27 (disparada pelo Claude): índice `ofertas_loja_desconto` criado, **lojas novas: Monte Carlo
  Jóias 8.254, Casa Tema 7.748, Elements 45, Polishop 187** (Polishop ficou entre os 11.316 pendentes → entra na próxima), Posthaus
  47.552; 54 mil gravados em 245 s; banco 123 MB. Conferência da Lomadee falhou em 3 partes (limite 60/min) e as marcas não vistas
  sumiam (33 → 22 lojas): corrigido (não vistas valem pela lista de 22/10; robô espera 60 s entre partes) e partes refeitas à mão:
  24 marcas com produtos. Total esperado ~36 lojas ("mais de 30") quando o cache de 6 h de `/api/numeros` vencer.
- **13ª sessão (22/10/2026): limites do D1 conferidos no painel** (Storage & databases > D1 SQL database; o painel lateral mostra
  o uso do dia; clicar no banco > aba **Queries** ordena por Rows read/written). Em 22/10: **5,78 M leituras (limite 5 M) e 144 mil
  gravações (limite 100 mil)**. Culpados e correções (publicado): (1) cada produto do robô = ~5 linhas gravadas (produto + índices + FTS):
  `LIMITE` do robô 20 mil → **8 mil/dia** (Posthaus restante entra em ~5 madrugadas); (2) `cat_loja_votos` gravava 16 mil/dia: agora só
  as buscas do robô (`preparar`) ensinam o mapa e o 1º nível da categoria da loja não vota; (3) `SELECT … FROM cat_loja_votos` leu 3,2 M
  (520 vezes): mapa pronto numa linha da tabela `resumos` (`lib/resumos.js`, refeito a cada 3 h); (4) `maisBuscados`/`termosBuscados`
  leram 1,8 M (2.600 vezes, chamados a cada busca preparada): também em `resumos`, refeitos a cada 1 h. **Conferir em 23/10 à noite**
  (print do painel D1) se ficou abaixo dos dois limites. Próximos da lista se precisar: `precos WHERE oferta_id IN` (231 mil).
  (5) Pedido do Giovanni: índice `ofertas_loja_desconto` (loja, desconto) no lugar do `ofertas_gtin` (não usado) → página da loja
  (`/api/lojas`, consulta com `+fonte`) lê só a página. O robô cria na madrugada de 23/10 e desconta do limite do dia (~48 mil linhas
  para montar = ~9,6 mil produtos → **nesse dia o robô quase não grava produtos**; normal). Conferir no log "Índice … criado".
- **12ª sessão (22/10/2026) — conferir na próxima conversa:**
  (1) Log do robô da madrugada de 23/10: Casa Tema, Monte Carlo Jóias e Polishop (aprovada na conta PF) entraram? Posthaus restante
  (~38 mil) entrando; job novo `lomadee` (conferência das marcas) rodou e quantas têm produtos; tamanho do banco.
  (2) Giovanni mandar print de Cloudflare > D1 > vaiprocarrinho > **Metrics (Rows read)** para ver se as correções seguraram as
  leituras abaixo de 5 milhões/dia. Se ainda alto: reduzir `MAX_PRONTAS` (300 buscas prontas/noite) e/ou o limite do robô.
  (3) `/api/numeros` deve dar 33 lojas ("mais de 30") com o banco no ar; conferir a janela "Lojas parceiras" e a página das lojas
  da Awin (`?loja=awin:karsten`), que deram erro só por causa do limite do banco.
  (4) Giovanni: pedir a Polishop também na conta PJ da Awin. Decisão: **sem gastar** (nada de plano pago nem Oracle por enquanto).
- **Pendente da 10ª sessão**: (1) Giovanni mandar prints da Shopee (celular, air fryer, geladeira, fone bluetooth, tênis masculino,
  smartwatch, ordem "Relevância") → Claude comparar com `/api/buscar` (só Shopee) e ajustar como foi feito na AliExpress.
  (2) Conferir o log do job `prontas` da madrugada (300 buscas, timeout 80 min; ver se termina e quantas `"guardada":true`).
  (3) Giovanni conferir no site: Karsten (toalha, jogo de cama, fronha), boné, celular (AliExpress ~47), geladeira/smart tv,
  "Ver detalhes" na Shopee e a busca adiantada ao digitar. (4) Giovanni pedindo novas afiliações na Awin (texto entregue).
- **Posthaus aprovada na Awin (conta PF, 22/10/2026)**: feed 79509 com 59.045 produtos. 1º problema: robô estourou a memória
  (lia o feed inteiro) → agora lê aos pedaços (`criarLeitorCsv`/`pedacosDeTexto` em `robo/awin.mjs`) + Node com 6 GB.
  2º problema: **banco D1 cheio (500 MB, "Exceeded maximum DB size")** — travava gravações (login, carrinho). Causa: tabela
  `buscas_prontas` em texto puro, sem limpeza, acumulando cada versão do cache. Agora `buscas_prontas_gz` (gzip, só a versão
  atual, apaga >7 dias; a antiga foi apagada em `criarTabelaProntas`). Banco caiu para **45 MB**. Robô mostra "Tamanho do banco"
  no resumo: conferir de vez em quando. 20 mil produtos da Posthaus entraram; os outros ~39 mil entram nas 2 próximas madrugadas.
- **Lojas parceiras (22/10/2026, pedido do Giovanni)**: botão "🏬 Ver lojas parceiras" na caixa "Lojas nesta lista" (e link no card
  roxo da busca) abre a janela `#janela-lojas` com todas as lojas (`/api/lojas`: Shopee, AliExpress, lojas da Awin com nº de produtos,
  marcas da Lomadee; campo "Procurar loja…"). "Ver produtos" abre `?loja=<id>` (`mostrarLoja` no app.js; `/api/lojas?id=&pagina=`):
  Shopee/AliExpress = mais vendidos; Awin = do banco, desconto primeiro; Lomadee = produtos da marca (`produtosDaMarca`). Conferido no
  ar: Shopee 48, AliExpress 24, Anhanguera Ferramentas 48. **Só lojas com produtos aparecem e contam** (pedido do Giovanni: "site
  fidedigno"): das 105 marcas da Lomadee só 24 mandam produtos (as outras 80 nem na busca normal aparecem). `marcasComProdutos`
  (lomadee.js) usa a tabela D1 `marcas_lomadee`, preenchida pelo job `lomadee` do robô (`/api/conferir-lojas?parte=N`, 20 marcas por
  parte); sem tabela, vale a lista `COM_PRODUTOS_EM_22_10`. Total real: 2 marketplaces + 24 Lomadee + 7 Awin = 33 ("mais de 30 lojas").
- ⚠️ **D1 estourou o limite grátis de LEITURAS (5 milhões de linhas/dia) em 22/10/2026** (com a Posthaus o banco foi para 48 mil ofertas;
  volta à meia-noite UTC = 20h de Cuiabá). Até lá falham Awin na busca, histórico, login, carrinho. Corrigido: busca da Awin lê até 400
  candidatos sem `ORDER BY rank` (`num IN (SELECT rowid … LIMIT 400)`), tabela-resumo `lojas_awin` (refeita pelo robô) no lugar de
  `COUNT(DISTINCT loja)`, mapa de categorias no cache do Cloudflare. **Pedir ao Giovanni print de Cloudflare > D1 > vaiprocarrinho > Metrics
  (Rows read) e aba de consultas mais pesadas, para confirmar.** Cuidado também com o limite de 100 mil GRAVAÇÕES/dia (robô grava 20 mil
  ofertas + índice de busca). Antes de criar índice novo em `ofertas`: cada índice = +1 gravação por produto.
- **Conta PJ da Awin (print 22/10/2026)**: 6 lojas aprovadas = Shark-Ninja, Casa Tema, Monte Carlo Jóias, Spicy, Karsten, Lauri.
  Execução #26 (22/10): a lista de feeds da conta nova só mostrava 2 como "active" (Karsten, Lauri); Casa Tema e Monte Carlo
  ainda não aparecem (a Awin demora a atualizar a lista) → devem entrar sozinhas numa próxima madrugada. Conferir no log.
  #26 gravou 20 mil novos (Posthaus), ficaram 38.768 para os próximos dias; banco 45 MB.
- **Karsten aprovada na Awin (21/10/2026)**: robô da madrugada já gravou 1.900 produtos (feed 102256). Cor `#1d3557` nos filtros.
  Conferência das categorias (Karsten, Kabum, Lauri, Spicy, ~95 buscas reais): Cama e banho + toalha banhão/rosto/piso/lavabo,
  fronha, porta-travesseiro, peseira, protetor/saia de colchão, pillow top (Móveis `nao` colchão de roupa de cama); Mesa posta + pano
  de prato/trilho; Cozinha + luva térmica/avental; **categoria nova "Bonés e chapéus" 🧢** (39 categorias); "Caixa de Som…" sempre em
  Caixas de som (`ANTES_DE_TUDO`); LED `nao` monitor/microfone/projetor; Moda fitness + top academia/esportivo.
  Busca: "boné" não acha "Boneco" (`OUTRA_PALAVRA` em relevancia.js); "2 Peças" = quantidade, não peça de reposição.
  `marcarSecoes`: busca com 2+ categorias fortes (25%+) mantém as duas ("toalha" = Mesa posta + Cama e banho; antes tudo em Outros).
  **Mapa de categorias ignora o 1º nível da loja** (Shopee "Acessórios de moda" 100009 tinha virado Óculos e levava luvas e bonés).
  Awin agora manda a categoria da loja em `catsLoja` (ensina o mapa). Cache v=69, em-alta v=5. Giovanni: conferir no site.
- **"Ver detalhes" em todos os produtos (21/10/2026, pedido dele)**: `temDetalhes` sempre verdadeiro; na Shopee a janela usa a foto
  original (sem `_tn`). **Busca "celular"**: celular de botão (Caterpillar, Nok'a, teclado, idoso…) vira `variante` e vai depois dos
  smartphones (`VARIANTES_DA_CATEGORIA` em relevancia.js; não vale se a busca pede: "celular de botão"). "Menor preço" põe primeiro
  o produto comum com preço ≥30% do típico; celular de R$ 219 vem depois dos smartphones de propósito. Cache v=70.
- **AliExpress "celular" só trazia 1 produto (21/10/2026, print)**: a busca da API por "celular" devolve ~140 capinhas/suportes
  (escondidos como acessórios). Agora `aliexpress.buscar` faz uma 3ª consulta com `category_ids` = categorias da AliExpress que o mapa
  aprendeu para a categoria buscada (`catsDaLoja` em mapaCategorias.js) + `CATS_ALIEXPRESS` em buscar.js (Celulares = 5090301),
  com `keywords` = resto da busca sem o nome da categoria ("celular" = categoria toda; "celular samsung" = "samsung"). Esses vêm primeiro.
  Resultado: celular 1 → 13 por lote; celular samsung 60; iphone 116. Parâmetro undefined não entra na assinatura. Cache v=73.
- **Buscas mais rápidas (21/10/2026, pedido dele, itens 1-2-3)**: (1) resposta fica 1 dia no cache do Cloudflare com `X-Criado`;
  passou de 1 h (`FRESCO_MS`) é mostrada na hora e refeita por trás (`refazerPorTras`, `env.__ATUALIZAR`); busca pronta vale até
  7 dias do mesmo jeito; navegador guarda 10 min. (2) `/api/preparar-buscas` até 300 (`MAX_PRONTAS`: categorias, populares, mais
  buscadas, `termosBuscados` 30 dias, vitrines); robô: seq 0 320, sleep 1, timeout 80 min (cuidado com os 2.000 min/mês do GitHub).
  (3) `adiantarBusca` no app.js: 600 ms após parar de digitar (1ª sugestão), mouse na sugestão ou setas; até 8 por visita, com
  `atalho=1`; ao buscar usa a adiantada e manda `contar=1` (servidor só conta, 204). Testado no ar com Playwright: resultados em
  0,15 s após o Enter; busca repetida 0,3 s (nova ~5 s). Cache v=74 (`VERSAO_BUSCA` no app.js e `VERSAO_CACHE` no buscar.js).
- **AliExpress na categoria (21/10/2026, print "celular" = 13)**: teste real: na categoria Celulares (5090301) a API devolve só
  4–7 produtos por página que entregam no BR, mas há 30+ páginas (~66 celulares nas 17 páginas testadas). `PAGINAS_DA_CATEGORIA = 4`
  em aliexpress.js: cada página da busca pede 4 páginas da categoria em paralelo (3 x 4 = 12). Celular: 13 → 47. Cache v=75.
- ⭐ **Busca espelhando o site das lojas (21/10/2026, pedido do Giovanni: "nossa busca = o usuário buscando dentro da loja")**:
  **AliExpress**: o site dela descobre a CATEGORIA da busca e mostra os produtos dela (a página de busca traz o código: celular →
  5090301, geladeira → 60203, smart tv → 200005125…); a API só procura a palavra no título. Levantado com Playwright (cookie
  `aep_usuc_f=site=bra&c_tp=BRL&region=BR&b_locale=pt_BR`, 78 buscas = 2 por categoria), 110 códigos conferidos na API e
  escolhidos os certos: `CATS_ALIEXPRESS` em buscar.js (31 categorias; roupas/decoração/organização/suplementos/bonés/games de
  fora porque misturam). Consultas extras com prazo de 5,5 s (`noPrazo`) e 1 nova tentativa no erro. Resultado (produtos AliExpress):
  geladeira 0→275, smart tv 0→196, tênis nike 0→448, máquina de lavar 30→165, caixa de som 45→159, mouse 32→84, smartwatch 31→127.
  Cache v=77. **Shopee**: o site pede login para robô (bloqueado) → Giovanni vai mandar prints de 6 buscas (celular, air fryer,
  geladeira, fone bluetooth, tênis masculino, smartwatch) em "Relevância" para comparar. Lomadee: busca da própria Lomadee
  (cada marca tem seu site); Awin: busca nossa no banco (não há site para espelhar).
- 9ª sessão (19–20/10) fez: conferência das categorias (pipoqueira), Kabum no ar (4.885 produtos), MEI aberto, conta nova da
  Awin como MEI, robô lendo as 2 contas (Lauri Esporte 1.514 produtos), botão Comprar com cor única. Giovanni está pedindo
  afiliação às lojas na conta nova (primeiro as que recusaram). Próximo: ver aprovações/recusas (print da aba Pendente/Recusado),
  pedir o suporte sobre o imposto de empresa fora de SP, e conferir no site "pipoqueira eletrica" e "tênis puma up".
- **Botão "Comprar" com cor única (20/10/2026, decisão do Giovanni: muitas lojas = "salada de frutas")**: `.botao-oferta` usa
  `--gradiente` do site para todas as lojas; a loja aparece em destaque no selo `.loja-tag` (pílula roxo-claro, letra roxa forte)
  acima do nome do produto. A cor de cada loja (`LOJAS`/`CORES_POR_NOME` no app.js) só vale na bolinha e nos botões de filtro.
- **Conta NOVA da Awin como PJ/MEI ativada (20/10/2026)**: o suporte disse que não dá para trocar PF→PJ (campo CNPJ travado);
  Giovanni criou outra conta (e-mail diferente). **Conta antiga (PF, ID 3124296) continua aberta** até a nova ter as lojas.
  Próximo: pedir afiliação às lojas na conta nova (Kabum, Spicy, Shark-Ninja + Central Ar, Dufrio e as do Grupo 1/2/3);
  quando a 1ª aprovar, Giovanni troca o Secret `AWIN_FEED_KEY` no GitHub pelo link da "Lista de Feed" da conta nova e Claude
  roda o robô (o awinaffid sai do link sozinho). Talvez a Awin peça verificação do site de novo (código novo na meta tag/arquivo).
  Logo com fundo branco (a transparente aparecia preta na Awin) foi enviada a ele.
  ✅ **Robô lê as 2 contas** (20/10/2026): Secret `AWIN_FEED_KEY` = conta antiga, `AWIN_FEED_KEY_PJ` = conta nova; loja aprovada
  nas duas vem da nova (link com o afiliado novo). 1ª aprovação na conta nova: **Lauri Esporte** (feed Sim). Secret PJ cadastrado; execução #20 (20/10): Lauri 1.514
  produtos (conta nova) + Kabum 4.885, Spicy 350, Shark-Ninja 18, EINSTAR 31 (conta antiga) = 6.798 no total. Quando todas as
  lojas estiverem na nova, apagar o Secret antigo. Não excluir a conta antiga antes de receber as comissões dela.
- **MEI aberto (20/10/2026)**: Giovanni virou MEI (ocupação principal "Promotor(a) de vendas independente"; número do CNPJ NÃO
  guardar aqui). Próximo: emitir CCMEI, pagar o DAS todo mês, trocar a conta da Awin de PF para PJ (ele vai mandar print da tela
  de conta/pagamento), depois pedir de novo às lojas que recusam PF (Central Ar, Dufrio…). Texto de apresentação entregue.
- **Kabum BR aprovada na Awin (print 20/10/2026)**: inscritas = Shark-Ninja, Kabum, Spicy, EINSTAR. Robô de 20/10 gravou **4.899 produtos
  da Kabum** (feed 46967; total Awin 5.298). Aparecem nas buscas (notebook 36, placa de vídeo 60, monitor 60). Botão "Promover" da Awin = gerar links/banners à mão; não precisa (robô faz).
- Giovanni: conferir "pipoqueira eletrica" (agora só Eletroportáteis) e mandar print de outra busca com categoria errada.
- 8ª sessão: corrigidos "joystick" (só controles no topo) e "ventilador philco" (agora em Eletrodomésticos). Giovanni: conferir no site.
- 7ª sessão (17–19/10) fez: bateria/kindle/protetor solar, card roxo padrão, texto do cupom, cabelo cacheado do personagem,
  UP Kids fora (link 404), caixa de busca curta no celular, controle de videogame/joystick, busca de outra categoria com
  categoria aberta, marca x produto, regra geral do AliExpress (+116 marcas). Cache v=57.
- Giovanni: avisar a Lomadee/UP Kids que os links da UP Kids dão 404 (opcional); conferir "controle para video game",
  "mondial air fryer", "air fryer mondial" e outras buscas com marca.
- Giovanni: conferir "bateria para carro", "kindle" e "protetor solar" no site.
- Giovanni: conferir a categoria "Eletrodomésticos" (1ª do menu).
- Opcional (sugerido na 6ª sessão): perguntar ao suporte de Afiliados da Shopee se a API tem cupons; ligar cupons oficiais da Lomadee/Awin.
- Giovanni: ligar o Web Analytics do Cloudflare (ver "Visitas"); decidir sobre o Mercado Livre (inscrição + app de desenvolvedor).
- Giovanni: testar no site a correção de digitação, as sugestões da busca, o aviso "não está à venda" e o botão "Comprar / na loja" no celular.
- Ideia pendente: alerta de preço por e-mail; contar cliques em "Comprar" por loja quando houver visitas.
- Giovanni: conferir no site as buscas de produto (microondas, geladeira, notebook, capacete…) e de acessório (prato microondas,
  reparo capacete, viseira capacete…); cada print de erro vira caso novo no `testes/busca.mjs`.
- Giovanni: acompanhar pedidos na Awin (Karsten, adidas: ~31 mil produtos, entram em ~2 madrugadas pelo limite de 20 mil/dia) e na
  Lomadee (Mondial: "Solicitar permissão"; NutriBullet já liberada; Xiaomi NÃO aceita comparador). Shein: procurar na Awin.
- Ideia futura (não feita): usar a categoria da loja dominante entre os `principal` para "resgatar" produtos de título estranho.
0. ✅ **Lomadee ligada no site (16/10/2026)**. Próximo: Giovanni pedir afiliação em mais marcas no menu "Marcas" (Magalu etc.) e conferir no site.
   Giovanni também ia mandar print de "Minha carteira" da Lomadee (regras de saque: mínimo, prazo, impostos PF).
0b. ✅ 16/10/2026 (4ª sessão): as 91 buscas prontas foram guardadas (busca popular responde em ~0,3 s). A execução #15 do robô
   tinha sido cancelada por tempo (Lomadee travando 25 s + erros 1102 do Cloudflare): limite do job `prontas` subiu para 45 min.
   Conferir na madrugada seguinte se o job `prontas` termina. (Antigo) Conferir as buscas prontas: `curl -D - .../api/buscar?v=32&q=notebook` deve ter `X-Pronta: 1` (se cache de 1h não estiver na frente);
   ver o log do job `prontas` da madrugada (quantas `"guardada":true`). Se o robô do GitHub seguir com a Lomadee travando,
   ok: as buscas são guardadas sem ela.
1. Giovanni: reenviar pedidos às lojas que recusaram (texto acima) e acompanhar aprovações na Awin; recusar convites
   fora do perfil. A cada loja nova: Claude pode disparar o robô (GitHub MCP `actions_run_trigger`, workflow
   `robo-precos.yml`, ref `claude/inspiring-hamilton-wafagr`) e ler o log; se o nome da loja vier como empresa,
   acrescentar em `NOMES_LOJAS` (`lib/ofertas.js`, ex.: SHINING 3D → EINSTAR).
1b. Giovanni conferir no site (15/10/2026): busca "air fryer oster" sem motor/botão; "ar condicionado" sem fogões da
   Spicy; botão "Ver mais resultados"; categorias A–Z; atalhos sem "Roupas"; fotos mais rápidas. Pendente: e-mail
   contato@ (passos já entregues).
2. ✅ AliExpress ligada (16/10/2026), inclusive nas "Ofertas do dia". Opcional: pedir "Advanced API" no App Console (lista oficial de produtos em alta).
3. Giovanni testar o site no celular e opinar sobre o visual; testar cadastro com e-mail + senha.
4. Quando houver visitantes: alerta de preço por e-mail (item 3 da análise de concorrentes); depois cupons e desconto
   verificado pelo histórico.
5. ✅ Shopee ligada (15/10/2026). Ideia futura: guardar preços da Shopee no histórico (robô consultando os mais buscados).
6. Lançamento: ver "Para lançar o site" no README (esperar ter várias lojas BR). Antes: verificar o domínio no Resend
   (+ `EMAIL_REMETENTE`) e criar `contato@vaiprocarrinho.com.br` (Cloudflare Email Routing; exige trocar o MX nulo).
7. Pendências do Giovanni: trocar a senha do Registro.br; INPI (pagar GRU antes de ~21/01/2027).

## Decisões do Giovanni
- ✅ **23/10/2026: Workers Paid (US$ 5/mês) ASSINADO** (limites D1: 25 bi leituras e 50 mi gravações/mês). `LIMITE` do robô → **300 mil (trava de segurança; grava tudo de uma vez)**. Run workflow tem a opção `so_awin` (roda só a gravação dos produtos). Execução #28: entraram os 11.316 que faltavam (Polishop e resto da Posthaus); **83.615 produtos da Awin no site, 11 lojas**; banco 140 MB.
- (Antes) **Ficar no plano grátis do Cloudflare por enquanto** (22/10/2026: sem reserva financeira). Hospedar no computador dele foi
  desaconselhado (queda de luz/internet, segurança, reescrever o site). Manter o D1 dentro dos limites grátis; Workers Paid (US$ 5/mês) só quando der.
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
