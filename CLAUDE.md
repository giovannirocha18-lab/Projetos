# Memória do projeto — Vai pro Carrinho (versão curta)

> Lido sozinho no início de cada conversa: **manter curto** (pedido do Giovanni, 31/10/2026: a versão longa gastava ~15%
> do contexto). Histórico detalhado de tudo o que foi feito: `docs/memoria-historico.md` (ler só a parte que precisar,
> com grep). Ao terminar algo importante: 1–2 linhas aqui em "Situação" e o detalhe no histórico.
> **Nunca** pôr aqui senhas, Secrets, App IDs, CPF/CNPJ ou dados bancários.

## Jeito de trabalhar
- **Horário do Giovanni: 1 hora atrás de Brasília (UTC-4).** Dizer os horários no horário dele.
- Giovanni não é programador. Responder **sempre em português**, **curto**, passo a passo, com os nomes dos botões como
  aparecem na tela. Ele manda prints. Pedir que nunca mande senhas/chaves no chat.
- Conversa longa (~20% do contexto): atualizar esta memória, commit/push com `[skip ci]` e avisar "Abra uma conversa nova e
  cole o comando de recomeço". Não resumir/compactar.
- **Regra do Giovanni (09/11): mudanças vão direto para a produção**; a branch `teste` (prévia https://teste.vaiprocarrinho.pages.dev,
  /api e /ir vão para o site real) só quando ele pedir.
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

## Robô da noite no Cloudflare (09/11, minutos do GitHub acabaram)
Laços longos (ML, mais vendidos, prontas, Shopee, Lomadee) rodam em `lib/roboNoite.js` (trilhas `ml` e `lojas`, um passo por
chamada de `/api/robo-noite?trilha=`; estado na tabela `robo_noite`; janela 04:45–10:00 UTC). Quem chama: Worker
**relogio-vaiprocarrinho** (código em `robo/relogio-worker.js`, colado pelo Giovanni no dashboard; Cron `*/15 4-9 * * *`; não
precisa mexer nele para mudar o robô). Estado/rodada manual: `painel…/api/painel/robo-noite` (`?comecar=1` abre 3 h, `?parar=1`).
Resumo entra na execução do GitHub da noite (aba Robô) ou numa linha própria (`robo-noite`). Teste: `node testes/robo-noite.mjs`.
No GitHub a rodada completa faz só awin, shopeelista, ia, auditoria e relatorio (~25 min); laços só à mão (so_ml, so_prontas, so_lomadee).

**11/11: categorias da manhã no Cloudflare** (Giovanni: o agendado do GitHub atrasava 1 h+): trilha `lojas` ganhou as fases
`manha` (espera 09:30 UTC = 05:30 do Giovanni) → `categorias` → `categorias2` (abre as 40 pela rota interna `abrir-categoria` em
robo-noite.js; resumo "Categorias abertas pela manhã" na aba Robô). No GitHub (`conferir-fotos.yml`, 09:50 UTC) ficou só a IA das
fotos (atraso não importa); `robo/abrir-categorias.mjs` só à mão (input `categorias`). **Conferir em 12/11 após 10:00 UTC.**
Teste só desse passo: Giovanni cola no navegador `painel…/api/painel/robo-noite?comecar=categorias` (30 min) e alguém chama
`/api/robo-noite?trilha=lojas` até `fim` (a resposta traz `categorias`: abertas e lentas). 11/11 ✅: 40 de 40 em 40 s, 0 lentas.

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
  /api/clique só com Origin do site. Limite por IP no Cloudflare: a regra "Limite API" (26/10, `/api/`, 60 em 10 s) já existia;
  07/11 Giovanni acrescentou `OR URI Path equals /` (cobre ?produto=). "Em alta" aceita termo com só 3 pessoas.
  Varredura do site no ar (17 páginas, PC e celular): sem erros de JS.
- **07/11: Black Friday conferida** (PC e celular, sem erro): desconto real >60% na Shopee/AliExpress só com 10+ vendas
  (`semProvaDeVenda` em lib/blackfriday.js; bicicleta de 1 venda "-64%" e tênis Polo sem venda saíram); resumo diz "Mais de
  9.500 ofertas" (dizia 216, as carregadas); /api/black-friday v=8. Desconto real sem "de/por" da loja agora mostra o
  habitual riscado e -X% (`semDescontoFalso` em lib/ofertas.js; vale também nas buscas). Selos "Desconto real" ✅ (1.143 na página).
- **07/11: bug Frete grátis + Bem avaliados** (print do Giovanni): juntas = 0 (frete só ML, nota só Shopee) e a opção dizia 224;
  ficava "Carregando…". Agora cada contagem considera a outra (`desenharBotaoFrete`), a opção some com 0, tela vazia com
  "✕ Limpar filtros" e a rolagem infinita para após 3 páginas sem nada (`estado.qtdFiltrada`).
- **08/11: botão Frete grátis das Ofertas do dia** (print do Giovanni: abria com 41): mostra o total (3.318, ofertas do dia do ML
  com frete) e, marcado, traz de 48 em 48 (`/api/frete-gratis`, `mercadolivre.ofertasFreteGratis`; coluna `frete` em ml_destaques,
  gravada pelo robô, calculada por SQL nos antigos; app.js `freteInicio`/`pedirFreteGratis`; total guardado no aparelho
  `vpc_frete_total`, sem número até saber: atualizando mostrava 49 → 3318). Testado no ar (celular) ✅.
- **08/11: lista oficial da Shopee** (Feed de produto > "Shopee Oficial BR", Secret `SHOPEE_FEED_OFICIAL`, 1 link, ~100 mil
  produtos nota 4+, sem vendas): job `shopeelista` (robo/shopee-lista.mjs, ~5 min, antes das prontas; `so_shopee_lista`) →
  tabela `shopee_lista` + FTS + precos; busca soma na pág. 1 depois da Shopee ao vivo (`buscarNaListaShopee`, lib/shopeeLista.js;
  se a API recusar, vão como `erro.parciais`). Link curto da lista NÃO tem an_… → "Comprar" = `/ir/shopee/<loja>/<item>` que
  gera o link de afiliado no clique (`destinoShopee`, cache 30 dias; conferido: utm_source=an_183…). 1ª carga 99.942, banco 632 MB.
  Teste: +3 a +29 produtos da Shopee por busca nova. Teste do feed à parte: workflow teste-feed-shopee.yml.
- **08/11: Shein** só com "Ir para a loja" (lib/shein.js: link da campanha "500 mais quentes"; sem feed/API para afiliado BR;
  Centro de Afiliados com Instagram do site); Lojas parceiras `soLink`, /api/lojas v40. Faixa "Ofertas da Shein" = `CAMPANHAS_SHEIN`
  (lib/shein.js; Giovanni manda nome + link do botão "Ganhe" + dias; cartão some na data `ate`).
- **08/11: ML não fica mais guardado vazio** (429 nos preços = erro com parciais, busca refeita por trás) e **fila do ML**
  (`lib/mlFila.js`, tabela `ml_fila`): busca de visitante com ML incompleto (<8 ou erro) entra; /api/preparar-ml prepara a fila
  primeiro (até 400, 14 dias; resposta da parte 0 traz `fila`). Conferir na madrugada de 09/11+ o tamanho da fila.
- **09/11: painel aba Parâmetros**: comissões da Shein e do ML digitadas (pelo Claude in Chrome no navegador do Giovanni ou à
  mão), somadas na aba Comissões (`lib/comissoesManuais.js`, `/api/painel/parametros`). Nada de senha guardada.
- **09/11: teste de dia do robô da noite (rodada manual) ✅**: as 2 trilhas chegaram ao fim sem erro; ML 50 min de buscas;
  prontas pararam aos 70 min (~450 de 627) → limite subiu para 120 min. Buscas no ar ok (air fryer 793, celular ML 24).
- **10/11 (noite): revisão geral do projeto** (pedido do Giovanni; 4 commits, tudo no ar; detalhe no histórico "Revisão geral de
  10/11"). Busca: números com vírgula/ponto ("5 litros" não aceita 3,5 L; 12.000 = 12000), estante/rack fora de "tv 55", jogo
  para baixar fora de "xbox", "Ver mais" não acaba cedo (`lista.temMais` na AliExpress e no ML), prazo por página. Tela: selos,
  filtros zerados em busca nova, Voltar do celular só fecha gaveta/carrinho (`passoDeCamada`). Proteção: limite por visitante em
  /ir, cliques e fila do ML; login por e-mail+aparelho; confirmação de e-mail só conectado. Lançamento: canônico, título por
  busca, robots.txt e sitemap.xml (`comDadosDaPagina` no _middleware.js). Depois, a pedido: **Voltar guarda o lugar**
  (`guardarLugar`/`restaurarLugar` em app.js: cartões, filtros e o produto que estava na tela; 10 min, 4 páginas), **fonte no
  próprio site** (`/assets/jakarta-*.woff2`, sem Google Fonts) e **banco em duas fases** (Awin e lista Shopee leem só o nome e
  depois os escolhidos; teste `node testes/banco.mjs`). **Ficou para depois**: cache em /api/produto; Giovanni: pôr `/ir/` na regra "Limite API" do Cloudflare.
- **10/11 (noite), print do Giovanni (marca "Brastemp" com 3 produtos e botão piscando "Carregando…")**: marcar uma marca na
  busca faz na hora a busca "produto + marca" e junta à lista (`completarMarca` em app.js); com filtro apertado o botão "Ver
  mais" fica com o aviso parado "Procurando mais ofertas com esse filtro…" e para após 8 páginas sem produto novo
  (`rolagemInfinita`, `botaoCarregando`/`botaoParado`). Enquanto busca a marca aparecem 4 cartões "carregando".
  **11/11: filtro de marca no servidor** na Black Friday e nas lojas ML e Awin (`?marca=`, `lib/marcas.js` `filtroDeMarca`, até
  240 de uma vez; `pedirMarcaDaLoja` em app.js; marca inteira → botão "Ver mais" some). No ar: Brastemp na Black Friday 2 → 46
  em 1 s. Shopee/AliExpress/Lomadee (loja) seguem página a página. Teste `node testes/marcas.mjs` (confere também as cópias
  de MARCA_APELIDOS/LOJAS_QUE_SAO_MARCA de app.js em lib/marcas.js).
  **Busca rápida `rapido=1`** (ideia do Giovanni: usar a lista baixada da Shopee): /api/buscar só com o nosso banco (lista da
  Shopee, Awin, ML `paginaDoBanco`; `FONTES_DO_BANCO`, opção `soBanco` nas fontes; chave de cache própria), 0,6–3 s, sem
  consultar loja. `completarMarca` pede a rápida (adiantada quando o mouse para na marca) e depois a completa: Philips em
  Eletroportáteis 9 → 116 em 2 s → 177. NÃO pré-carregar a busca completa de todas as marcas (a Shopee limita).
- **11/11: filtros sem o número de ofertas ao lado** (Marcas, Categorias, Lojas — barra lateral e botões do card — e "Bem
  avaliados"; pedido do Giovanni: dava a impressão de pouco produto). O botão "🚚 Frete grátis" também ficou sem número.
  A ordem (mais ofertas primeiro) não mudou. **Atalhos de categoria da loja ML (faixa no quadro roxo) removidos** (pedido do
  Giovanni: ficava feio; `?mlcat=` segue no servidor, sem uso). No lugar, **a categoria da lateral busca na loja ML inteira**
  (`/api/lojas?id=mercadolivre&secao=<categoria do site>`, até 240 mais vendidos; `produtosDaSecaoNaLojaML` em lojas.js,
  `completarSecao` em app.js): Pets 9 → 239 em ~2 s. Só na loja ML; lojas da Awin seguem filtrando o que já carregou.
  **"Lojas nesta lista" (barra lateral, página inicial/categoria) em lista de um toque** como as categorias: tocar mostra só
  a loja, "Todas" volta (`desenharLojasDaLista`, `estado.lojaSo`). Os botões de loja do card da busca ("Lojas com ofertas:")
  também: "Todas" + um toque por loja (`escolherLoja`, `lojasNoResumo`; saíram "Limpar"/"Marcar todas" e `alternarLoja`).
- **11/11, print "computador" com "Balança Computadora" no Mais barato**: `OUTRA_PALAVRA_DE.computador` em lib/relevancia.js
  (computadora/computadorizada não são computador); caso em testes/busca.mjs. No ar: balança fora ✅.
- **11/11, prints na categoria Cozinha (inversora de solda Stanley e livro de autor Stanley)**: a vitrine buscava só a marca
  "stanley" → agora "copo stanley"; inversora/esmerilhadeira/lixadeira… em Ferramentas (lib/categorias.js; casos em
  testes/busca.mjs). A lista guardada da categoria só muda quando o robô da madrugada refizer: **conferir em 11/11 cedo**
  (`/api/buscar?v=108&q=utensílios de cozinha&cat=Cozinha` sem "Inversora" nem "Livro Teologia").
- **11/11, print do histórico ("6% abaixo" ao lado de "Maior R$ 49,90")**: a conta estava certa (preço de costume = o que
  valeu mais dias em 30). Janela do histórico ganhou o quadro "De costume" (14+ dias), a explicação e o aviso de pico
  ("O maior preço durou só N dias", até 3 dias e 15%+ acima) (`abrirHistorico` em app.js, `.com-costume` no CSS). No ar ✅.
- **11/11: celular mais rápido** (pedido do Giovanni): o servidor põe na página um preload do 1º pedido de dados
  (`comDadosDaPagina` no _middleware.js: início, busca só com ?q=, loja, Black Friday; o endereço tem que ser IGUAL ao de
  `enderecoBusca`/`pedirLoja` do app.js) + preload de /api/lojas no index.html; `VERSAO_CACHE` exportada de buscar.js. Celular
  simulado (4G, CPU 4x): 1º cartão no início 2,8 s → ~1,6 s; busca 2,9 s → ~1,8 s. Toque em categoria (sem recarregar):
  1,2–1,8 s. Gargalo é rede, não CPU (tarefas longas ~0,5 s). Sobra: /api/lojas é pedida 2 vezes na busca.
- **11/11, "categorias demoram ~5 s a mais no celular" (Giovanni, no Wi-Fi)**: não era o aparelho (simulado: 1–1,8 s). As
  categorias quase nunca tinham busca pronta: a vitrine faz várias buscas na Shopee de uma vez, basta uma ser recusada para
  `lojas.shopee.ok` = false e a pronta só era guardada com a Shopee ok → sem cópia no ponto do Cloudflare do visitante, ia às
  lojas ao vivo (medido: Ferramentas 9 s, Calçados 9,5 s, Limpeza 7,6 s, Móveis 6 s, Bonés 7 s). Agora (buscar.js): a visita a
  uma categoria e a atualização por trás também guardam a pronta; sem a Shopee guarda se não houver pronta ou se tiver 20 h+
  (categoria) / 3 dias+ (busca). **Conferir após a madrugada**: `python3` medindo as 40 categorias (todas < 3 s) e perguntar
  ao Giovanni se melhorou. O cabeçalho X-Pronta fica na cópia do cache: não prova que a pronta existe no banco.
  Giovanni testou (10/11 à noite): 2ª abertura rápida ✅. Ideia dele: **robô que abre as 40 categorias toda manhã**
  (`robo/abrir-categorias.mjs`, 1º passo do workflow conferir-fotos.yml, 09:50 UTC = ~6h do horário do Giovanni, que está 1 h atrás de Brasília (UTC-4, confirmado por
  ele em 10/11; ao falar de horário, dizer no horário dele); sem IA; a lenta é montada e aberta de
  novo; resumo com os tempos). Teste: 39 prontas, 1 montada (Bebês 3,2 s → 0,8 s).
- **11/11, print "Buscando Brinquedos…" lento na 1ª vez no celular**: toda resposta guardada passava a cada visita por consultas
  ao banco (fotos quebradas da Lomadee + reprovados da IA): Brinquedos 1,2–2,8 s só nisso. Agora há a **cópia limpa** no cache do
  Cloudflare (`chaveLimpa` = chave + `&limpa=1`, `limpar`/`guardarLimpa`/`refazerLimpa` em buscar.js; conferida por trás a cada
  10 min) e a pronta da noite sai como veio do banco (limpeza por trás). Medido: Brinquedos 0,2 s. Medidor: cabeçalho
  `Server-Timing` e `&medir=2` (só lê a pronta do banco; mostra a cidade do Cloudflare e os ms de cada etapa; nunca vai às lojas).
  **Medidor na tela**: `/?tempos=1` liga (quadrinho preto: esperar/baixar/montar + etapas do servidor e cidade), `/?tempos=0`
  desliga (`mostrarTempos` em app.js). Giovanni (GRU, 11/11): "agora abriu rápido" ✅; Cozinha 1,57 s (aparelho só 0,2 s; 0,9 s
  era a limpeza de uma cópia de antes da correção). Banco visto de GRU: ~200–470 ms por consulta. Atalho instalado pelo Chrome
  não muda nada (só manifest, sem service worker).
- **11/11: preparo para o Google pronto, LANÇAMENTO SEGURADO** (Giovanni: "faça tudo, apenas segure o lançamento, não quero
  exibir no Google agora"): categorias (lateral, abas do celular), "em alta", cartões "Em alta no ML" e "Ver produtos" das lojas
  são `<a href>` (`linkInterno`/`enderecoDaBusca` em app.js; `:where(a.lk)` no CSS); tela igual, toque sem recarregar ✅.
  **Para lançar (só quando ele mandar)**: tirar `noindex` de public/index.html (meta robots) e de public/_headers (X-Robots-Tag
  da página); falta pôr as lojas no sitemap. Ideias que ele ouviu e ainda não pediu: canal
  Telegram/WhatsApp, mesmo produto lado a lado, aviso de preço no celular, "com o cupom sai por".
- **11/11: página "Quedas de preço"** (`/quedas-de-preco`, pedido do Giovanni): produtos conferidos (níveis 1 e 2 de
  `bf_ofertas`) cuja última mudança em `precos` foi para baixo nos últimos 7 dias; os de hoje primeiro, lojas se revezando
  (`listarQuedas` em lib/blackfriday.js, `/api/quedas?pagina=`, cache 15 min). No app é uma "loja especial" como a Black Friday
  (`QUEDAS`, `ESPECIAIS`, `naEspecial`, `desenharResumoQuedas`, selo `🕒 Caiu hoje/ontem/há N dias`). Atalhos: faixa do topo,
  chips "em alta", botão na página inicial e atalho do celular. No ar ✅: 2.512 caíram hoje, 4.051 na semana, 0,4 s.
  Filtro de marca ali é página a página (não tem `?marca=`).
- **11/11: teste "mesmo produto lado a lado" (sem mexer no site)**: 45 buscas de eletro/eletrônicos, 13.985 produtos; juntando
  por marca + código do modelo (letras+números, 4+ caracteres): 27% têm código, **293 modelos em 2+ lojas** (967 ofertas, 7%),
  52 em 3+; amostra de 22 grupos: ~20 certos. Forte: geladeira 29, freezer 31, lava e seca 17, liquidificador 19, micro-ondas
  14, impressora 10, TVs 7–8. Fraco: celular/iphone/tablet (modelo é nome, não código), fones, chapinha, câmera. Erros vistos:
  110V com 220V juntos, Bosch GSB x GSR "120-LI", kit com/sem bateria. Lojas dos grupos: Shopee, ML, AliExpress, eFácil, KaBuM.
  **1ª versão no ar para ele ver (11/11): "⚖️ Modo comparação"** em Mais opções (`#modo-comparacao`; NÃO fica guardado:
  atualizar a página volta desligado, pedido dele; cada cartão com uma cor de fundo, lojas em quadro branco): ligado, a busca mostra antes da lista o quadro "O mesmo produto em várias lojas" (`modeloDe`,
  `gruposDeModelos`, `cartaoModelo`, `desenharComparacao` em app.js, antes de `cartaoOferta`; `.comparacao`/`.modelo` no CSS):
  só seções Eletrodomésticos e Eletroportáteis (TVs caem em Eletrodomésticos), a mais barata de cada loja, preço fora de
  0,55–1,9x o do meio sai, voltagem mostrada na linha; 12 por vez. Feito no navegador com o que a busca trouxe (sem robô nem IA).
  No ar: geladeira 28 modelos, micro-ondas 14, celular 0 (mostra explicação). Página inicial com o modo ligado mostra aviso.
  Os cartões seguem o "Ordenar por" (preço = o da loja mais barata; desconto/economia = diferença entre as lojas do cartão).
  Giovanni: "ficou top".
  Print dele (combo "TV 50 M75h + TV 43 Q5f" de R$ 4.704 no cartão da M75H de R$ 2.759): anúncio com " + ", kit, combo,
  conjunto ou "N unidades" vira chave `marca|combo|códigos` e só se junta com o mesmo combo; TV leva o tamanho da tela na chave.
  Limite conhecido: combo cujo 2º item não tem código (3 letras, "Q5f") pode se juntar a outro combo da mesma TV principal.
  **Teste da IA casando produtos (11/11, GitHub, `robo/teste-casar.mjs`)**: 127 pares, 1 pergunta por par, Haiku 5.5, US$ 0,014
  (US$ 0,11 por mil pares), 0 erros. Por código (76): 67 iguais (32 "outra voltagem", muitos só porque um anúncio não dizia a
  voltagem), 4 diferentes, 5 não sei. Por nome (51): 20 iguais, 20 diferentes, 11 não sei. Conferi ~55 a olho: 2 erros (Philco
  PRF535I dado como diferente; Vaio Linux x Windows dado como igual) → ~96%. Pegou GSB x GSR, kit de 2 baterias, 5,5 L x 16 L.
  Anúncio da Shopee com "256/512GB" ou "Pro / Pro Max" no nome é ambíguo de verdade (IA diz "não sei", certo).
  **Versão no Cloudflare (o GitHub deixou o teste ~7 min na fila)**: Giovanni cadastrou o Secret `ANTHROPIC_API_KEY` no Pages;
  `lib/casar.js` (pares + pergunta por fetch), fase `casar` da trilha lojas, partida `painel…/api/painel/robo-noite?comecar=casar`
  (30 min, teto US$ 0,20), resposta de `/api/robo-noite?trilha=lojas` traz `casar` (pares do passo, custo, erro). Ainda só teste:
  não grava nada. **Rodou no Cloudflare 11/11 17h14 ✅ (chave funciona)**: 122 pares em ~2 min, US$ 0,015, 0 erros. Com as
  instruções ajustadas: Vaio Linux x Windows agora "diferente" ✅; Philco PRF535I segue "diferente" (errado); "outra voltagem"
  com voltagem só de um lado continua (a IA até escreve "só o anúncio 1 informa") → no robô decidir a voltagem por código
  (regex nos dois títulos), não pela IA. Próximo: robô de verdade (tabela de grupos conferidos + Modo comparação lendo dela);
  depois apagar `robo/teste-casar.mjs` e `teste-casar.yml` (versão do GitHub, repetida).
  **ROBÔ DE CASAR NO AR (11/11 à noite, falta ver a 1ª noite)**: fase `casar` da trilha `lojas`, depois das prontas e antes de
  `manha` (até 120 min, teto US$ 4/noite `TETO_DA_NOITE_US` — subiu de 0,50 a pedido do Giovanni para fazer a 1ª rodada inteira; depois de completa, pode voltar a 0,50 —, para às 09:30 UTC). `lib/casar.js` `passoDeCasar`: uma busca
  pronta por passo (rota interna `casar` em robo-noite.js), grupos = marca + código (mais barata de cada loja, só
  Eletrodomésticos/Eletroportáteis), pergunta só par sem veredito (`proximoPar`; vale 60 dias), grava em `casados` (par = ids)
  e `casados_buscas` (q → pares). Site: `/api/casados?q=` (cache 1 h) → `pedirCasados`/`separarConferidos` em app.js: quem a
  IA disse "diferente" sai do cartão, igual fica mesmo com preço longe, cartão todo conferido mostra "✓ conferido"; busca sem
  pares segue pela regra. "outra voltagem" = igual (voltagem é lida do nome). Painel aba Robô: "Mesmo produto em várias lojas
  (IA)". Rodada à mão: `painel…/api/painel/robo-noite?comecar=casar` (1 h). Testes: `node testes/casar.mjs` e robo-noite.mjs.
  Teste do GitHub apagado. **Conferir em 12/11**: pares/custo na aba Robô e `/api/casados?q=geladeira`. Limite visto: o
  navegador às vezes tem outro anúncio da mesma loja (não conferido → fica pela regra). Depois: ampliar para celular/notebook
  (pares por nome). Giovanni tem US$ 10 de saldo na Anthropic. PRF535I e PRF535ID são modelos diferentes (o site já separa).
- **Madrugada 12/11, 1ª noite do robô de casar ✅**: rodada inteira (589 buscas, 73 com grupos), 651 pares, 604 iguais, 47 não, 0 erros, US$ 0,08. No site: geladeira 17 de 27 cartões "✓ conferido", micro-ondas 12 de 14. Categorias da manhã 40 de 40, 0 lentas. Limite: só buscas da lista das prontas ("smart tv" tem 23 pares; "smart tv 55" e "tv 50" não estão na lista → 0, seguem pela regra); furadeira/notebook 0 grupos (seção fora). Teto segue US$ 4 (gasto real centavos; voltar a 0,50 se o Giovanni quiser).
- **12/11: comparador ampliado** (Giovanni: "busque por tamanho, e outros produtos?"): o site pede os conferidos pelos ANÚNCIOS da
  tela (`POST /api/casados {ids}`, `casadosDosIds`; `pedirCasados(ids)` em app.js) → veredito vale em qualquer busca (com/sem
  acento, com marca, com tamanho). No ar: geladeira brastemp 4/4, fogao 6/7, smart tv 55 2/2, maquina de lavar 3/3 conferidos.
  Robô confere também `BUSCAS_EXTRAS` (lib/casar.js: TVs por tamanho, ~90 eletros/ferramentas/informática; as que não são
  prontas vão às lojas na hora) e mais seções (Informática, Ferramentas, Celulares, Fones, Caixas de som, Games, Smartwatches):
  nessas o site só mostra o que a IA confirmou (`SECOES_SO_CONFERIDAS`). **Conferir em 13/11**: pares/custo/tempo da fase casar
  e se notebook/furadeira/celular ganharam cartões. **Falta (próximo)**: celular e outros SEM código no nome (pares por nome
  parecido) — **feito 12/11**: `nomeDoModelo` (lib/casar.js, cópia em app.js entre `// >>> nomeDoModelo`; teste confere as duas):
  marca + palavras de modelo (a15, 16, pro, max…) + armazenamento; Celulares/Smartwatches sempre pelo nome, Informática/Fones/
  Caixas/Games só sem código; +30 buscas de celular em `BUSCAS_EXTRAS`. Só aparece no site depois que o robô conferir
  (noite de 13/11 ou `painel…/api/painel/robo-noite?comecar=casar`). Teste com dados reais: iphone 10 grupos, celular 12.
- **12/11: casar por CATEGORIA INTEIRA** (Giovanni: "vamos por categoria; quando estiver toda feita me avise que escolho outra"):
  `CATEGORIAS_PARA_CASAR`/`CATEGORIA_DA_VEZ` em lib/casar.js = **Eletrodomésticos** (228 buscas: tipos de produto com 3 páginas
  juntas + produto+marca), vão PRIMEIRO na lista do robô (rota casar em robo-noite.js; resposta traz `categoria`). Rodada manual
  de casar agora 3 h (Giovanni cola `painel…/api/painel/robo-noite?comecar=casar`; o Claude chama `/api/robo-noite?trilha=lojas`
  em laço até `busca` passar de `buscasDaCategoria`). **Eletrodomésticos FEITA 12/11** (38 min): 228 buscas, 147 com grupos,
  511 pares (493 iguais, 18 diferentes), US$ 0,06, 0 erros. No site: geladeira 29 de 31 conferidos, freezer 31/33, lava e seca
  17/17, micro-ondas 14/14, smart tv 20/20. **Eletroportáteis e Ferramentas FEITAS 12/11** (lista
  `CATEGORIAS_DA_VEZ`, 652 buscas, 1h40, US$ 0,05, 0 erros; ferramentas: 94 pares). **Rodar categoria de dia fez o ML/Shopee limitarem
  o site** (print do Giovanni: "trident chiclete" sem ML) → categoria nova só de madrugada, ou com espera entre as buscas.
  Atenção: na madrugada as 652 buscas das categorias vêm antes das prontas na fase casar (limite 120 min): ver em 13/11 se coube;
  se não, tirar de CATEGORIAS_DA_VEZ as já feitas. **Giovanni escolhe a próxima categoria.**
- 11/11: cartão do Modo comparação abre "Ver detalhes" ao toque (`aoTocar` em `cartaoModelo`: foto/nome = oferta mais barata; linha da loja = a daquela loja; Comprar/Ver e cupom seguem iguais).
- 11/11: atalho "⚖️ Comparador" no celular (`#atalho-comparador`, 2º da fila `.atalhos-cel`): liga/desliga o Modo comparação, fica roxo ligado e leva à caixa de busca.
- 11/11: chip "🖤 Black Friday" saiu da linha dos atalhos "em alta" (pedido do Giovanni); segue na faixa de cima, no início e no celular.
- **11/11: boneco da animação de busca e "Meu personagem" removidos** (pedido do Giovanni): quadro "Buscando…" com barra de
  progresso (`.barra-buscando`, `desenharResumoBuscando`); saíram editor da conta, rota `/api/conta/personagem`, funções em
  lib/conta.js e o trecho da privacidade. Personagens guardados apagados (`DROP TABLE IF EXISTS personagens` em lib/conta.js,
  autorizado pelo Giovanni).
- **11/11, faixa "Em alta no ML" demorava a aparecer** (print): /api/em-alta levava ~4 s quando vencia (de hora em hora) →
  agora guardada 24 h, servida na hora e refeita por trás (`X-Vence`, `montar`); fotos `-V` (~20 KB; eram `-F`, 150–300 KB;
  `fotoPequenaML`); última faixa no aparelho (`vpc_em_alta_ml`); preload no index.html. No ar: 1ª visita 1,2–1,8 s, 2ª ~0,5 s.
  Depois (aprovado com print da comparação): cartões de produto do ML com foto `-O` (500 px; `fotoPequena` em app.js; a
  janela Ver detalhes segue com a `-F`). Página inicial: fotos do ML de ~8 MB para 0,7 MB (PC) / 0,4 MB (celular).
- **11/11: IA confere também os mais baratos de cada busca** (robo/conferir-buscas.mjs: 10 da busca + 3 por loja, repete até
  5 rodadas enquanto achar 3+ errados; candidatos ao "Mais barato" da Escolha rápida). #137/#138: 2.232 escondidos, US$ 0,13.
- **11/11: IA conferindo as FOTOS** (pedido do Giovanni): `robo/conferir-fotos.mjs` (foto reduzida a 384 px, 10 por pergunta,
  Haiku 5.5; teto de gasto por rodada, máx. US$ 4; ordem: Escolha rápida/Ofertas do dia → 24 primeiros → resto), tabela
  `ia_fotos`, `lib/iaFotos.js` (reprovada sai das buscas e Ofertas do dia enquanto tiver a mesma foto; lojas/Black Friday
  ainda não). Workflow próprio `conferir-fotos.yml` (toda manhã 09:50 UTC, teto US$ 0,50; à mão: teto e minutos). 1ª rodada grande (10/11): 63.433 fotos (toda a fila
  das 304 buscas), US$ 2,30 (US$ 0,036 por mil), 207 reprovadas — **mais da metade errada** (em perguntas de 10 fotos a IA
  trocava de produto). Corrigido: reprovação só vale se confirmada com a foto sozinha (`confirmaReprovacao`); modo
  `reconferir` (input do workflow) reolhou as 211: 149 voltaram, **62 ficaram** (34 "Imagem não disponível" da AliExpress,
  o resto "Out of stock"/foto de outra coisa; amostra conferida: ~26 de 28 certas). Gasto total com fotos: ~US$ 2,40.
  Aprovar foto à mão (Giovanni olhou e está certa): workflow com input `aprovar` = nome do produto (vários com "|"), sem IA.
  10/11: projetor portátil do ML aprovado à mão; bebedouro de beija-flor da Cobasi (foto só do bico) fica reprovado.
- **10/11 (noite): "Categorias" dos resultados em lista de um toque**, como no ML (pedido do Giovanni; eram caixinhas todas
  marcadas): tocar mostra só aquela, "Todas" volta, 8 + "Ver todas" (`desenharFiltroSecoes` em app.js, `.secao-item` no CSS;
  `estado.secoesSo` com 1 categoria; `secoesFora` não é mais usado pela tela).
- **10/11 (tarde)**: ML na busca passa de 24: páginas 2–10 vêm do banco (`paginaDoBanco`: mais vendidos que batem + catálogo
  guardado com preço; sem consulta ao ML). Link da AliExpress curto (`/ir/ali/<id>` → `destinoAli` gera o de afiliado no clique,
  cache 30 dias; era 40% da resposta, busca no celular mais lenta). Foto ruim no "Em alta no ML": pôr o id em `VITRINE_FORA`.
- **Madrugada 12/11 (#141 + robô da noite)**: tudo verde. Awin +248 (713 preços), lista Shopee sem mudança (99.936), IA 331 categorias (US$ 0,07), 16 lojas nas buscas. Robô de casar 1ª noite: 589 buscas, 651 pares (604 iguais, 47 diferentes), US$ 0,08, 0 erros. Categorias da manhã 40/40, 0 lentas (05h31 do Giovanni). Site: air fryer 765 (ML 18), celular ML 72.
- **Madrugada 11/11 (#139 + robô da noite)**: tudo verde. GitHub: Awin +566 novos (1.127 preços), lista Shopee 99.936, IA 324 categorias (US$ 0,03), 16 lojas nas buscas, sem loja nova. Cloudflare: ML fim ~02h58, lojas fim ~03h27 (horário do Giovanni). Site: air fryer 571 (ML 24, ⚡Full 7), celular ML 24 atuais. Cozinha renovada: 438, sem inversora/livro ✅.
- **Madrugada 10/11 (#135 + robô da noite)**: 1ª noite completa com GitHub público + Cloudflare ✅. GitHub 14 min (Awin +389/705
  preços, 673 MB; lista Shopee 99.921 (trocou 84 mil); IA 494 categorias corrigidas, US$ 0,01). Cloudflare: Worker chamou sozinho,
  ML fim 04h01, lojas (prontas) fim 04h31 de Brasília, antes do limite de 120 min. Site ok; ⚡ Full já em 4 do ML em "air fryer".
- **10/11: ML no site**: selo **"⚡ Full"** (`full` = shipping.logistic_type "fulfillment" da oferta mais barata; aparece conforme o
  robô renova os preços) e faixa **"Mais buscados no Mercado Livre"** na página inicial (/trends/MLB via /api/em-alta?v=11, campo
  `ml`, `desenharBuscadosML`). API do ML NÃO manda parcelas (installments null) → sem "12x sem juros"; manda garantia (dá para
  mostrar). Fila do ML: só 2 termos. Teste da API: workflow teste-ml.yml (`/api/preparar-ml?amostraItens=1`).
- **10/11: site com 1.200 px no meio** (depois 1.400 px a pedido do Giovanni; `.topo .container, .pagina` max-width 1440) e **"Em alta no Mercado Livre" em cartões (sem números: /trends não é ranking só de buscas)
  com foto e preço** (`vitrineTendencias` em lib/fontes/mercadolivre.js: mais vendidos que batem + catálogo guardado; só produto
  `principal` (começa pelo termo); foto e preço do MESMO produto; só lê o banco). Conferir: `/api/em-alta?depurar=<termo>`.
- **09/11: repositório PÚBLICO** (decisão do Giovanni, até resolver o limite do GitHub; minutos ilimitados; conferido antes:
  sem senha/chave/CPF no código nem no histórico). Voltar a privado: Settings → Danger Zone → Change visibility. Run #133 ✅
  (Awin +58/693 preços, lista Shopee 99.931). **Nunca pôr segredo no código/logs: tudo fica visível.**
- **Madrugada 09/11 (#132): ACABARAM OS MINUTOS DO GITHUB ACTIONS** (repositório privado; ~4 h de jobs por noite). auditoria e
  relatorio não começaram ("spending limit needs to be increased"); o resto ✅ (prontas 627 partes, site ok). Enquanto o Giovanni não
  liberar (GitHub → Settings → Billing and licensing → Budgets, ou repositório público), o robô não roda. Ideia: levar os laços
  de espera (mercadolivre/maisvendidos/prontas, ~3 h) para Cron Triggers do Cloudflare.
- **Madrugada 08/11 (#127)**: tudo verde; 624/627 prontas; ML 435+448 buscas renovadas, 5.864 preços, 4 esperas; mais vendidos
  3.809 + 15.212; Awin 73.279 (+248), banco 546 MB; IA lote de 11.433 títulos enviado (lido amanhã). Lomadee 18 marcas (parte 3
  sem resposta da Lomadee: ficam como estavam). Black Friday já com 48 "✅ Desconto real" na 1ª página. Nada corrigido.
- **Madrugada 07/11 (#125)**: tudo verde; 624/627 prontas; ML 293+203 buscas renovadas, 11.316 preços, 5 esperas de 429; mais vendidos
  3.808 + 15.276 (2.740 sub-subcategorias); Awin 73.349 produtos (+625), banco 529 MB; IA US$ 0,14. Ofertas do dia do ML pelo ranking ✅
  (5–49%, sem lixo de 75%). Nada corrigido.
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
- **Shein**: falta saber se existe feed/API (perguntar à Shein; Awin só UK/US/FR). Trocar o link por campanha de Black Friday.
- **08/11: 1ª compra do site** (Shopee, contou o Giovanni): conferir no painel Comissões (Shopee conversionReport).
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
