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
- `index.html` = **o comparador (página principal) desde 15/10/2026**. A antiga página "Em breve" foi apagada e o
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
  (região BR) e atualiza o D1 pela API do Cloudflare (só grava o que mudou; limite 20 mil/dia; não apaga nada se o feed
  falhar ou encolher mais da metade). Roda pelo GitHub Actions (`.github/workflows/robo-precos.yml`, 02:30 de Cuiabá desde 16/10/2026).
  Teste local: `node robo/awin.mjs --feed robo/exemplo-awin.csv --sqlite /tmp/teste.sqlite`. Ver README.
- `privacidade.html` = Política de Privacidade. Cita `contato@vaiprocarrinho.com.br`, que **ainda não existe**.
- `_headers` + `<meta robots noindex>` escondem o site do Google até o lançamento.
- Testar local: `npx wrangler pages dev .` (rodar **de dentro do repositório**) e abrir a página principal.
- Rede do ambiente do Claude: **"Completo" desde 16/10/2026** (Giovanni trocou em Ambiente > Edit > Acesso à rede). Antes
  bloqueava docs/API da Lomadee, AliExpress, Mercado Livre, `*.pages.dev`. Vale em conversas novas.

## Hospedagem e domínio
- Cloudflare Pages, projeto **vaiprocarrinho** → `vaiprocarrinho.pages.dev`. Deploy automático.
  Desde 16/10/2026 `vaiprocarrinho.pages.dev` redireciona (301) para `vaiprocarrinho.com.br` (no `_middleware.js`;
  o Cloudflare não deixa desligar o endereço .pages.dev). Prévias de outras branches continuam abrindo.
- Commits que só mexem no `CLAUDE.md` (memória) levam **`[skip ci]`** na mensagem, para não gastar publicações
  do Cloudflare (limite de 500 por mês no plano grátis).
- **Production branch = `claude/inspiring-hamilton-wafagr`** (não é a `main`!). Desde 14/10/2026 ela também é a
  **branch padrão (default) do GitHub**. Se uma conversa
  nova trabalhar em outra branch, as mudanças não vão para o ar: trazer para essa branch, ou
  levar o site para a `main` por PR e trocar em Settings > Builds > Production branch.
- Domínio registrado no Registro.br; nameservers trocados para o Cloudflare.
- Cloudflare criou registros "sem e-mail" (MX nulo, SPF -all, DMARC reject). Trocar se um dia
  quiser e-mail no domínio.

## Situação atual (atualizado em 16/10/2026, fim da 3ª sessão)
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
| AliExpress Afiliados | ✅ **aprovado (16/10/2026)**. Cadastro de desenvolvedor no openservice.aliexpress.com ✅ aprovado (16/10/2026; "Affiliates (individual)", Brasil; Conformidade de Dados: Não/Não/Não/Não, local Brasil, Não/Não/Sim = **compromisso: apagar dados da AliExpress se a parceria acabar**). App "Vai pro Carrinho" criado (16/10/2026): categoria Affiliates API, status **Test**, 1000 chamadas/min, "Standard API for Publishers" ativa (Advanced API = hot products, inativa, opcional). Tracking ID `vaiprocarrinho` criado e posto como padrão (é o padrão no código). **`lib/fontes/aliexpress.js` pronto e publicado (16/10/2026)**: busca (até 3 páginas de 50, BRL, entrega BR, selo Internacional), vitrine por mais vendidos, histórico ao vivo como a Shopee, lojas intercaladas na lista; sem "Ofertas do dia" (precisa da Advanced API). Testado só com fetch falso (rede do Claude bloqueia api-sg.aliexpress.com). ✅ **FUNCIONANDO no site (16/10/2026)**: chaves no Cloudflare, teste `/api/buscar?q=mochila notebook` trouxe produtos da AliExpress intercalados com a Shopee (link s.click.aliexpress.com, fotos, preço em R$, vendedor). Vendidos da AliExpress costumam ser baixos (campo lastest_volume). **Filtro "Envio" (16/10/2026, pedido dele)**: barra lateral "Todos / 🇧🇷 Nacional / 🌎 Internacional" (campo `internacional`). A API da AliExpress não diz de onde sai o produto: `aliexpress.buscar` faz uma 2ª consulta com `delivery_days=5` (entrega no BR em até 5 dias = armazém no Brasil) e marca esses como nacionais com selo verde "🇧🇷 Envio do Brasil"; se a API recusar/ignorar o filtro, tudo fica internacional. **Não testado com a API real** (rede do Claude bloqueada): Giovanni conferir. Shopee conta como nacional (API não informa vendedor internacional). Cores dos botões (16/10/2026, pedido dele): **AliExpress roxo-azulado `#6d28d9`**, **Spicy vinho `#b0002a`** (`CORES_POR_NOME` no `app.js`, pelo começo do nome da loja da Awin); outras lojas da Awin roxas. **"Ofertas do dia" com AliExpress (16/10/2026, pedido dele)**: `destaques()` tenta a Advanced API (hotproduct.query); se recusar, usa 4 buscas das vitrines por página (mudam todo dia, espalhadas pelas categorias), mais vendidos com desconto e sem acessórios, 6 de cada, intercalados (24 por página). Próximo: Giovanni conferir no site; opcional pedir a "Advanced API" |
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
- **Mais opções no topo da barra lateral (16/10/2026, pedido do Giovanni)**: "Frete grátis / Com desconto / Mostrar acessórios e
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

## Próximos passos
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
