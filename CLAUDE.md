# Memória do projeto — Vai pro Carrinho (versão curta)

> Lido sozinho no início de cada conversa: **manter curto** (pedido do Giovanni, 31/10/2026: a versão longa gastava ~15%
> do contexto). Histórico detalhado de tudo o que foi feito: `docs/memoria-historico.md` (ler só a parte que precisar,
> com grep). Ao terminar algo importante: 1–2 linhas aqui em "Situação" e o detalhe no histórico.
> **Nunca** pôr aqui senhas, Secrets, App IDs, CPF/CNPJ ou dados bancários.

## Jeito de trabalhar
- Giovanni não é programador. Responder **sempre em português**, **curto**, passo a passo, com os nomes dos botões como
  aparecem na tela. Ele manda prints. Pedir que nunca mande senhas/chaves no chat.
- Conversa longa (~20% do contexto): atualizar esta memória, commit/push com `[skip ci]` e avisar "Abra uma conversa nova e
  cole o comando de recomeço". Não resumir/compactar.
- **Todo print de erro de busca vira caso novo em `testes/busca.mjs`** (de sugestão, em `testes/sugestoes.mjs`);
  `node testes/busca.mjs`, `sugestoes.mjs` e `modulos.mjs` têm que passar antes de publicar mudança na busca.
- Regras fixas: nunca raspar páginas das lojas (só APIs/feeds oficiais); nada de urgência/escassez falsa; sem aviso de
  afiliado visível (só `rel="sponsored"`); sempre tema claro.
- **Regra do Giovanni (05/11): toda busca tem que trazer produtos ATUAIS/modernos, qualquer que seja o termo** ("celular"
  na loja ML trazia 1 aparelho antigo). Ao mexer em busca/fonte: mais vendidos e produtos com venda/vendedor primeiro; modelo
  velho/sem vendedor nunca no topo. ML: mais vendidos (`ml_destaques`) que batem com a busca vêm antes do catálogo.

## O site
**vaiprocarrinho.com.br** — comparador de preços com links de afiliado. Fontes: Shopee (API), AliExpress (API), **Mercado Livre (API, 04/11)**, Lomadee (API,
~24 marcas com produtos), Awin (feeds de ~17 lojas, **só a conta PJ/MEI**, Secret `AWIN_FEED_KEY_PJ`), cupons (Awin + Lomadee).
Ainda escondido do Google (noindex) até o lançamento.

## Técnica (ver README.md)
- Cloudflare Pages + Functions, sem build. Publicado só o que está em `public/` (nunca pôr nada interno lá).
- **Branch de produção e padrão = `claude/inspiring-hamilton-wafagr`**. Push = publica.
- Commit só de memória leva `[skip ci]`; fazer push do código ANTES (o Cloudflare olha só o último commit do push).
- Principais: `public/index.html`, `public/assets/app.js` (site), `public/assets/estilo.css`, `functions/api/buscar.js`
  (busca), `lib/relevancia.js` (produto x acessório, marca), `lib/categorias.js` (40 categorias), `lib/vocabulario.js`
  (marcas, erros, sugestões), `lib/fontes/*.js` (lojas), `functions/_middleware.js` (lista do que pode abrir).
- Banco D1 (`DB`), plano Workers Paid. Versões de cache: `VERSAO_CACHE` (buscar.js) = `VERSAO_BUSCA` (app.js), hoje **108**;
  ao trocar, rodar o robô com `so_prontas`. `/api/vocabulario?v=12`, `/api/lojas` VERSAO e `/api/numeros?v=` também têm versão.
- Testar local: `npx wrangler pages dev public`; Playwright: Chromium em `/opt/pw-browsers/chromium`,
  import de `/opt/node22/lib/node_modules/playwright/index.mjs`. **Teste no site no ar: cookie `vpc_nao_contar=1`**
  (`ctx.addCookies`) senão as visitas do teste entram no painel (04/11: ~dezenas de visitas de teste).

## Robô (GitHub Actions `robo-precos.yml`)
**Desde 05/11: disparado ~01:14 de Brasília pela tarefa agendada do Claude "Robô da madrugada"** (trig_016Y47cQHQv6k3GSGjBSdQ82,
cai sempre na MESMA conversa "Robô da madrugada (vaiprocarrinho)", session_014TXWRCgvrUx31PBr3BG21C, que tem o repositório e o
GitHub; a 1ª versão, com sessão nova a cada noite, falhou em 05/11: sessão sem repositório nem GitHub): dispara, confere, **corrige e roda de novo o que falhar** (autorizado pelo Giovanni
05/11; limites: não remove/pausa loja, não sobe VERSAO_CACHE à toa, nada grande/arriscado), resumo; push no celular). O cron do GitHub (06:17) é só reserva: job `guarda`
só deixa rodar se nenhum workflow_dispatch foi criado desde 03:30 UTC. Se a tarefa
falhar, a reserva roda (e dá para recriar a tarefa ligada àquela conversa).
Jobs: `awin` (feeds → D1, fotos/links quebrados, alertas de preço), `shopee` (histórico), `lomadee` (marcas/páginas),
`prontas` (buscas prontas), `ia` (Haiku 5.5 classifica categorias em lote + `robo/marcas.mjs` sugestões produto+marca),
`auditoria` (suspeitos no topo + IA conferindo buscas `robo/conferir-buscas.mjs` + relatório de categorias das lojas + variações),
`mercadolivre` (preços do ML no D1, antes das prontas).
Run workflow com `so_awin`, `so_ml`, `so_prontas`, `so_lomadee`, `so_auditoria`, `so_ia`, `so_numeros` (só o relatório, ~30 s). Disparar: GitHub MCP `actions_run_trigger`.
Log grande: `get_job_logs` sem return_content dá um link → baixar com curl. Custo da IA ~US$ 0,07/noite (saldo ~US$ 0,80).

## Situação (06/11/2026, 27ª sessão)
- **27ª: "celular" e "smartphone" pesquisam os dois nomes** nas lojas e juntam (`variantesDeCelular` em lib/vocabulario.js;
  só quando o aparelho vem primeiro; "capa celular" fica 1 consulta). Vigia da madrugada de 06/11: send_later 01h45/04h15 + aviso às 6h.
- **27ª: Shopee no Android abre no app da Shopee** (`abrirNoAppShopee` em app.js: intent com package com.shopee.br e o mesmo
  link de afiliado; sem app → navegador). Motivo: no navegador do celular, mesmo logado, a descrição dava "Página indisponível".
  Giovanni conferiu: abre no app ✅; sem app, no navegador o "Compre Agora" funciona ✅ (só a descrição falha, é da Shopee).
  Falta: ver nos próximos dias se cliques/comissões da Shopee continuam contando.
- **26ª: ML com mais vendidos de TODAS as categorias** (27 + 389 + 2.740 sub-subcategorias; tabela `ml_categorias`, robô
  `?arvore=1` / `?proxima=1`, job novo `maisvendidos` até 75 min; busca lê só um índice leve). Run #120 (so_ml): árvore 2.740,
  as 2.740 sub-subcategorias em 42 min (1 espera), **loja ML 3.180 → 14.729 produtos**; buscas 0,7–1,9 s. Conferir a madrugada
  de 06/11 (job maisvendidos no painel). Detalhe no histórico ("TODAS as categorias").
- **26ª: tendências do ML por categoria** ("o que o público mais busca"): `?tendencias=1` → `ml_tendencias` (421 categorias,
  13.606 termos guardados no #122, 0 erros; ~2.400 viram sugestão); viram **sugestões da caixa de busca** (1.063 → ~3.440), **150 buscas prontas** (fim da lista) e até 1.500
  buscas preparadas com o ML (jobs mercadolivre + maisvendidos até 95 min; #122: lista do ML 1.918 buscas, job mercadolivre
  chegou na 725 em 50 min, 216 renovadas; maisvendidos continuou até a 1.339 (+606); cada busca nova custa até ~96 consultas ao ML). Filtro `tendenciaAceitavel` (lib/buscas.js: sex shop,
  vape, armas, bebidas (por nome também), réplicas…; **decisão do Giovanni 05/11: adulto e bebidas/seringas também ficam fora**); Giovanni pode mandar print de sugestão imprópria → completar BLOQUEADOS_TENDENCIAS.
- **26ª: palavras compostas** (micro-ondas, guarda-roupa, lava-louças, pré-treino…): junta/separada/hífen = mesma busca
  (`COMPOSTAS`/`comCompostas` em lib/vocabulario.js; para incluir outra, pôr na lista). Busca: marca depois de "para" é
  compatibilidade; nome colado de 4+ palavras aceita "todas menos uma". Auditoria do site 05/11: 0 erros (ver histórico).
- **26ª: ML na Escolha rápida** pelo ranking de mais vendidos (`rankML`, selo "🔥 Nº mais vendido da categoria", `pesoVendas`).
  Teste das notas do ML (06/11, #123): **não abriu** (/reviews/item 403 com token do app e da conta) → "Mais bem avaliado" sem ML.
- **06/11: Black Friday com o ML** (pedido do Giovanni): mais vendidos do ML com 10–60% de desconto, pela ordem do ranking
  (`mercadolivre.ofertasBlackFriday`), 1 a cada 3 cartões (`misturarML`, 24 por página); página reveza as lojas e tira repetidos
  (mesmos 45 primeiros caracteres do nome; SQL com ROW_NUMBER em `listarBlackFriday`); robô guarda até 3 "desconto da loja" por
  loja em cada busca (eram os 8 maiores, só Shopee/AliExpress); /api/black-friday v=6.
  Ofertas do dia do ML também pelo ranking de mais vendidos, 5–60% (`mercadolivre.destaques`; era maior desconto: 75% em
  maçarico/simulador de sutura). Aparece depois da madrugada de 07/11 (a resposta das Ofertas do dia fica guardada): conferir.
- **06/11: revisão de segurança** (pedido do Giovanni: "remover brecha ou bug"): nada grave (painel, contas, robô, SQL, XSS,
  redirecionamentos ok). Corrigido: limites por IP usam IPv6 /64 (`ipDe`), máx. 3 e-mails de confirmação/dia por endereço,
  /api/clique só com Origin do site. Falta (antes do lançamento): regra de limite por IP no Cloudflare (WAF → Rate limiting) em
  /api/buscar e ?produto= (alguém com script pode gastar o limite da Shopee/ML); "Em alta" aceita termo com só 3 pessoas.
  Varredura do site no ar (17 páginas, PC e celular): sem erros de JS.
- **Madrugada 06/11 (#123)**: tudo verde; 623/627 prontas; ML 227+358 buscas renovadas, 14.110 preços, 6 esperas de 429;
  mais vendidos 0 (normal: renovam só após 20 h e foram lidos na noite de 05/11); IA 7.368 títulos em lote; nada corrigido.
  Vigia (06/11 04h15): tendências impróprias viraram prontas ("videos … nua", filhote de mico, airsoft) → bloqueadas em
  BLOQUEADOS_TENDENCIAS (lib/buscas.js), teste em testes/sugestoes.mjs; vocabulário v12.
- **24ª: Mercado Livre ligado** (conta PJ; app no devcenter; `ML_CLIENT_ID`/`ML_CLIENT_SECRET`; afiliado etiqueta
  vaiprocarrinho). Catálogo (`/products/search`) + preço por produto; link pelo nosso `/ir/ml/<produto>/<anúncio>`; ML
  primeiro nas buscas. Teste: painel `/api/painel/ml-teste`. **Problema: 429 do ML → poucos produtos dele por busca.**
  Detalhe no histórico ("Mercado Livre ligado"). **04/11 (25ª)**: job `mercadolivre` no robô (`/api/preparar-ml`, `so_ml`):
  guarda catálogo+preços das prontas no D1 (`ml_catalogo`/`ml_ofertas`) antes do job `prontas`; a busca lê de lá (preço vale 48 h).
  1º teste (#108): 386 de 464 buscas em 30 min, 5.790 preços, só 3 esperas de 429. Conferir na madrugada de 05/11 se as prontas trazem ML.
  Selo do ML amarelo/azul (`tag: "loja-tag-ml"`; botão Comprar igual para todas as lojas, decisão do Giovanni). "Frete grátis"
  só ML (API) e Lauri Esporte (feed: frete 0 em tudo; Giovanni conferiu no site dela: grátis num de R$ 197 para RO ✅).
  Página da loja (Awin): um cartão por modelo (Lauri manda cada numeração como produto; `lib/variacoes.js` modeloBase/semTamanho)
  e os tipos se revezam (1ª palavra da categoria da loja); /api/lojas VERSAO 29. Busca da Awin e `semRepetidos` (app.js,
  cópia de semTamanho) juntam as numerações em todas as listas. Auditoria nova `robo/variacoes.mjs` (job auditoria, painel
  "Tamanhos repetidos"): grupos ≥3 com mesmo preço e nome tirando a última palavra; ⚠️ = o site ainda não junta → completar
  lib/variacoes.js + semTamanho em app.js. 1ª vez na madrugada de 05/11.
- Feito nesta sessão: IA conferindo as buscas (esconde o que não é o produto); filtro de Marcas no alto e categorias só em
  busca ambígua; celular no molde do app do Mercado Livre (abas, atalhos, barra de baixo, gaveta de filtros moderna);
  sugestões "produto + marca" (inclusive HP/LG); busca com marca mostra só a marca (`deOutraMarca`).
- 02/11: **Cama In Box** (Awin, ~3.200 produtos: sofás, colchões, camas box, puffs) entrou sozinha ~31/10 e não aparecia
  nas buscas → busca Awin agora pega candidatos de cada loja (`candidatosPorLoja`/`revezarLojas` em lib/fontes/awin.js);
  título sem "Cama inBox" (robo/awin.mjs); "Colchão de Molas" é produto. Gráfico do histórico novo; sugestões só com marca que
  tem o produto (`testes/sugestoes.mjs`).
- 03/11: robô ok; "smart tv 65/50" sem racks no topo ✅. Palavra de 3 letras só vale inteira/plural/com número
  (`achaPalavra` em lib/relevancia.js: "dry fit" achava fitas "Drykofita"); teste "filtro Awin" em testes/busca.mjs; v107.
  Print "lisinha" (0 ofertas p/ Giovanni, 143 p/ outro): Shopee dá "Rate limit exceeded" (10030) enquanto o robô roda →
  shopee.js tenta de novo (1,5 s e 3 s); busca sem oferta: 0 no navegador e 5 min no Cloudflare; loja em erro: 1 min; v108.
  Selo "Menor preço"/"Mais barato" na Shopee/AliExpress só com venda ou nota (`comProva` em app.js): o SIITO Lisinha sem
  vendas dava "O produto não existe" na Shopee, mas a API oficial ainda o manda (não há como conferir sem raspar).
  Elements: 39 de 45 links dão "página não encontrada" na loja; Monte Carlo: 2.454 sem foto (ficam fora sozinhos).
- Elements pausada (`LOJAS_PAUSADAS`, conferida toda noite ⏸️); Lojas Benoit e **Lauri Esporte** (04/11, decisão do Giovanni:
  fotos quebradas, numerações, caros) removidas de vez (`LOJAS_REMOVIDAS` em robo/awin.mjs, `FORA` em lomadee.js e
  `lib/lojasRemovidas.js`, que tira das respostas guardadas, cupons e Black Friday). 40 lojas no site.
- 04/11: Lauri Esporte só pela Awin (marca da Lomadee com nome de loja da Awin sai: `marcasNaAwin` em lomadee.js; fotos
  antigas 404 e repetidos); China in Box, DeÔnibus, Zupper, Bauducco, Jolimont e eles.® fora (não são loja de produtos, `FORA` em lomadee.js; cupons v13); robô: foto boa testada a
  cada 7 dias + amostra de 20 fotos por loja (🔄 = loja trocou as fotos, testa tudo de novo).
  Busca pelo nome de loja parceira: faixa com atalho; se vier vazia, abre a loja (`lojaDoNome` em app.js).
  Cupons só de lojas com produtos no site (`lojasComProdutos` em functions/api/cupons.js): 42 cupons de 17 lojas.
  Robô 04/11 (#104, 7h51 de atraso): **466 de 484 prontas** ✅; 🆕 **TEKA** (Awin, 920, cama/mesa/banho, feed sem categoria) →
  `PADRAO_DA_LOJA` forte "Cama e banho" (loja forte vale acima da IA); banco 372 MB (limite do plano pago: 10 GB).
  "Não contar minhas visitas": cookie `vpc_nao_contar` (`/?nao-contar=1`/`0`, link no quadro Visitas do painel) tira o aparelho
  das visitas (CSP sem Web Analytics), buscas e cliques (`lib/naoContar.js`). IP: não mostramos (LGPD).
  Botão "Zerar contadores" no painel (`lib/inicioPainel.js`, `/api/painel/zerar`): conta a partir do momento do zerar.
  Foto quebrada no cartão: tenta outras fotos e, na Awin, a foto de hoje (`fotoAtual` em app.js) — Giovanni confirmou ✅.

## Pendências
- **Mercado Livre (próximo)**: 1) ✅ cliques contam (painel de afiliados, Métricas → Período "Hoje": 3 cliques em 04/11);
  2) ✅ robô guardando preços; catálogo 48 → preço até 16 com vendedor; sem vendedor re-perguntado só após 4 dias (04/11,
  23h; robô refaz 1 vez os catálogos de 16, `CATALOGO_48_DESDE`); conta PJ do ML conectada (05/11, painel
  `/api/painel/ml-conta`, lib/mlConta.js, tokens cifrados em `ml_conta`): busca de anúncios e /items seguem 403; abrem
  highlights (mais vendidos), trends e preço das fichas → token da conta é reserva no 429. **Mais vendidos** (05/11):
  robô `?destaques=N` → `ml_destaques` (416 de 27 categorias, #113); Ofertas do dia = os com desconto; vitrine = os que batem
  primeiro. Busca: "5L" = "5 litros"; fichas que batem com a busca primeiro. #113: média 8,2 produtos do ML por busca,
  4,3 ofertas por ficha. Conferir 05/11 cedo se as prontas trazem ML; 3) ✅ **loja ML** (05/11): Lojas parceiras,
  página = mais vendidos (`produtosDaLojaML`), busca na loja, ir-loja com matt_*, "mercado livre" abre a loja, ?produto= e
  alertas aceitam "mercadolivre-" (`ofertaMLPorId`); /api/lojas VERSAO 33.
  **Máximo de produtos do ML (05/11, pedido do Giovanni: foco no ML)**: mais vendidos das subcategorias (até 400, lista em
  `ml_listas`, fichas em `ml_fichas` 14 dias), catálogo 2 páginas (96), 24 por busca, tendências (/trends/MLB) na lista do robô,
  job mercadolivre até 50 min (mais vendidos até 25 min). #114 (05/11): **3.798 mais vendidos** de 400 categorias, 504 buscas
  (com tendências), média 10 produtos do ML por busca. Loja até 80 páginas (VERSAO 34); mais vendidos: produto antes de acessório.
  05/11 07h: tarefa da madrugada falhou (sem GitHub) → robô completo disparado à mão (~07h25) e tarefa refeita (ver Robô).
  Run #115 (05/11, manual) ✅ tudo verde, 486 prontas; ML nas buscas comuns: Ofertas do dia 19, air fryer 12, geladeira 10,
  celular 16, smart tv 22, fone bluetooth 24. Variações: "Sapateira" (móvel) saía como calçado → regra só com o 1º nome
  inteiro de calçado/roupa (lib/variacoes.js + app.js); Animale 6.432 anúncios juntados em 1.551 cartões.
  Loja ML: total na lista ("Mostrando 600 de 3.180"), abre com ~600 (2,5x) e **atalhos de categoria** do ML (25, com contagem;
  `?mlcat=`, `arvoreML` em ml_listas id 3, `produtosDaLojaML(…, cat)`; celular/câmera antes de acessório); /api/lojas VERSAO 38.
  Painel Comissões: linha "Mercado Livre" com link (ML não tem API de ganhos de afiliado). **Rolagem infinita** (05/11,
  `rolagemInfinita` em app.js): perto do fim, "Ver mais" sozinho (busca, lojas, Ofertas do dia; máx. 40 seguidas);
  sem pulos: `desenharAosPoucos` mantém os cartões já na tela (`desenhados`), busca põe os novos depois, content-visibility. Celular sem
  rodapé (links Como funciona/Privacidade na janela Conta, `.links-legais`). 05/11: no fim da busca, se só sobra "Ver também N
  acessórios…" (`#ver-acessorios`), eles entram sozinhos (rolagemInfinita, 1 vez por busca).
- **Stanley** (Awin, aprovada 05/11, 122 produtos): TODAS as fotos do feed dão **410** (stanley.fbitsstatic.net) → fora do site
  sozinha (produto sem foto não entra). Robô agora aceita foto http→https e mostra "Foto da X não abre: status url" quando uma
  loja inteira falha. Entra sozinha quando a Stanley arrumar o feed (Giovanni pode avisá-la pela Awin).
- **App Android do painel (05/11)**: `app-android/` (WebView de painel.vaiprocarrinho.com.br, "Painel VPC"; `construir.sh` =
  aapt2+javac+d8+apksigner, SDK baixado com sdkmanager). Chave de assinatura NÃO guardada (bloqueado guardar no repo; Giovanni: "deixe
  assim"): versão nova = desinstalar e instalar. Layout do painel muda sozinho no app (ele só abre o site).
- **Giovanni**: pedir mais lojas na Awin (texto do convite já entregue); 2FA nas contas; trocar a senha do Registro.br;
  UptimeRobot; INPI (GRU 389, R$ 440, antes de ~21/01/2027).
- **Claude**: conferir o robô de cada madrugada (atraso, IA, auditoria — seção "Lojas nas buscas": 🆕 loja nova / ⚠️ invisível); quando loja nova aprovar: `so_awin`, ler o log,
  `so_auditoria` (categorias da loja → completar `REGRAS` em lib/caminhos.js), subir versões e `so_prontas`.
- **Shopee limitando (desde 02/11)**: buscas prontas salvas caíram de ~445 para ~35 por rodada (erro 10030). Feito em 03/11:
  2 páginas por busca, cache 6 h, reserva 7 dias, robô 1 por vez com espera (ver histórico "Limite da Shopee"). Giovanni vai
  pedir limite maior à Shopee (o formulário não tem campo de texto: desistiu). Run #94 (so_prontas, 03/11): **431 de 478**
  guardadas em 49 min (antes 29); robô de 04/11: 466 de 484 ✅. Evitar subir VERSAO_CACHE à toa
  (apaga as prontas).
- **Crédito da Anthropic**: acabou em 03/11, Giovanni recarregou no mesmo dia. IA conferindo as buscas agora também olha os 24
  primeiros de cada busca + 150 buscas reais do mês e **corrige a categoria sozinha** (ia_categorias) quando a busca é de produto
  com uma categoria só. 03/11 (#95/#97): 11.561 títulos novos classificados (US$ 0,12); 6.131 perguntados, 376 escondidos,
  **1.260 categorias corrigidas** (US$ 0,10). Números do site: 169 buscas na semana (geladeira, air fryer, ração…), 2 contas. Relatório novo "Números do site" (robo/numeros-site.mjs, fim da
  auditoria): buscas/dia, mais buscados, contas, alertas. Visitas: **Web Analytics ligado em 03/11** (beacon conferido com Playwright, sem erro de CSP). **Cliques para as lojas** contados
  desde 03/11 (`/api/clique`, tabelas cliques e cliques_produtos; links com `marcaClique()` em app.js) e no relatório.
- **Painel do Giovanni NO AR (03/11, 22ª sessão)**: `painel.vaiprocarrinho.com.br` (domínio no Pages + app "painel" no
  Cloudflare Access, política "Giovanni" com 2 e-mails, código por e-mail). Código: `lib/painel.js` (confere o passe do Access),
  `functions/_middleware.js` (`responderPainel`), `functions/api/painel/dados.js`, `public/painel.html` + `assets/painel.*`.
  Layout novo (03/11, inspirado em painel de mercado: quadros com ▲▼%, Em alta, gráfico de área com abas, tabelas com mini-gráfico,
  medidor das prontas renovadas). Visitas **funcionando** (`lib/visitas.js`, GraphQL Web Analytics; Pages: `CF_ANALYTICS_TOKEN` Secret + `CF_ACCOUNT_ID` Text).
  **Painel preto** com menu Métricas / Comissões (#comissoes). Comissões ao vivo pelas APIs oficiais (`lib/comissoes.js`,
  `/api/painel/comissoes?mes=`; cache 10 min): Shopee conversionReport, AliExpress order.list (US$), Awin transactions
  (AWIN_API_TOKEN dos cupons), Lomadee /affiliate/orders (precisa escopo orders:read). **Testado só com respostas simuladas:
  1º print real: Shopee/AliExpress/Lomadee lidas; Awin tinha chave vencida (trocada 03/11, cupons da Awin voltaram); as 4 redes ✓ lidas.**
  **Aba Robô no painel (03/11)**: cada passo anota linhas (`robo/painel.mjs` → saídas do Actions), job `relatorio` grava
  em `robo_execucoes` (`robo/relatorio.mjs`); painel mostra última madrugada, atraso, avisos, passo a passo, execuções.
- Pequenos: cupons da Lomadee davam erro 500 do lado deles.
- ~07/11: começam os selos "✅ Desconto real" (21 dias de histórico); Black Friday 27/11 (`/black-friday`).

## Comando de recomeço
> Continuando o vaiprocarrinho.com.br. Leia o CLAUDE.md da branch claude/inspiring-hamilton-wafagr, diga em poucas linhas
> onde paramos e continue nessa branch.
