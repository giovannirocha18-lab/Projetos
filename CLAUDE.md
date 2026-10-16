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
- Testar local: `npx wrangler pages dev .` (rodar **de dentro do repositório**) e abrir a página principal.
- A rede do ambiente do Claude bloqueia `*.pages.dev`, API e docs do Mercado Livre e DNS externo.

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

## Situação atual (atualizado em 15/10/2026, fim da sessão)
| Item | Situação |
|---|---|
| Site publicado em `vaiprocarrinho.pages.dev` | ✅ |
| Comparador com produtos reais (Shopee + Awin) | ✅ |
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
| Robô de preços (Awin → D1, GitHub Actions 04:17) | ✅ funcionando. Execução #10 (15/10/2026, disparada pelo Claude): 398 produtos (Spicy 349, Shark-Ninja 18, EINSTAR 31) |
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
- **"Menor preço" respeita a busca (16/10/2026, pedido do Giovanni)**: servidor marca `bate: true` quando o título tem
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
- **Busca dentro da categoria refeita (16/10/2026, pedido do Giovanni)**: "capacete" em Automotivo virava "capacete acessórios
  para carro" (lixo). Agora pesquisa o que foi digitado e, só se a categoria tiver `chave` (ex.: Perfumes = "perfume"),
  também "invictus perfume"; junta, tira o que é de outra categoria e põe primeiro o que é da categoria
  (`ordenarNaCategoria`). Perfumes ganhou "eau de"/"toilette".
- **~100 resultados por busca (16/10/2026, pedido do Giovanni)**: busca digitada pede um "lote" de 3 páginas da Shopee
  (`PAGINAS_POR_LOTE` em `buscar.js`, 3 x 48 = 144 brutos); "Ver mais resultados" (`pagina=N`) pede o lote seguinte.
  Vitrine e "Ofertas do dia" continuam 1 página. Teste com Shopee simulada: `fetch` falso + `onRequestGet` direto no Node.
- **F5 volta ao começo (16/10/2026, pedido do Giovanni)**: atualizar a página tira busca/categoria do endereço, zera filtros e
  ordem e volta ao topo (`performance.getEntriesByType("navigation")[0].type === "reload"`). Link com `?q=` aberto direto continua funcionando.
- **Sempre tema claro (16/10/2026, pedido do Giovanni)**: removido o modo escuro automático do `estilo.css` (`color-scheme: light`).

## Próximos passos
1. Giovanni: reenviar pedidos às lojas que recusaram (texto acima) e acompanhar aprovações na Awin; recusar convites
   fora do perfil. A cada loja nova: Claude pode disparar o robô (GitHub MCP `actions_run_trigger`, workflow
   `robo-precos.yml`, ref `claude/inspiring-hamilton-wafagr`) e ler o log; se o nome da loja vier como empresa,
   acrescentar em `NOMES_LOJAS` (`lib/ofertas.js`, ex.: SHINING 3D → EINSTAR).
1b. Giovanni conferir no site (15/10/2026): busca "air fryer oster" sem motor/botão; "ar condicionado" sem fogões da
   Spicy; botão "Ver mais resultados"; categorias A–Z; atalhos sem "Roupas"; fotos mais rápidas. Pendente: e-mail
   contato@ (passos já entregues).
2. AliExpress: quando aprovar, cadastro no openservice.aliexpress.com, chaves como Secrets no Cloudflare, Claude escreve
   `lib/fontes/aliexpress.js`.
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
