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

## O site
**vaiprocarrinho.com.br** — comparador de preços com links de afiliado. Fontes: Shopee (API), AliExpress (API), Lomadee (API,
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
  ao trocar, rodar o robô com `so_prontas`. `/api/vocabulario?v=7`, `/api/lojas` VERSAO e `/api/numeros?v=` também têm versão.
- Testar local: `npx wrangler pages dev public`; Playwright: Chromium em `/opt/pw-browsers/chromium`,
  import de `/opt/node22/lib/node_modules/playwright/index.mjs`. **Teste no site no ar: cookie `vpc_nao_contar=1`**
  (`ctx.addCookies`) senão as visitas do teste entram no painel (04/11: ~dezenas de visitas de teste).

## Robô (GitHub Actions `robo-precos.yml`, 01:30 de Brasília; o GitHub atrasa ~6 h)
Jobs: `awin` (feeds → D1, fotos/links quebrados, alertas de preço), `shopee` (histórico), `lomadee` (marcas/páginas),
`prontas` (buscas prontas), `ia` (Haiku 5.5 classifica categorias em lote + `robo/marcas.mjs` sugestões produto+marca),
`auditoria` (suspeitos no topo + IA conferindo buscas `robo/conferir-buscas.mjs` + relatório de categorias das lojas).
Run workflow com `so_awin`, `so_prontas`, `so_lomadee`, `so_auditoria`, `so_ia`, `so_numeros` (só o relatório, ~30 s). Disparar: GitHub MCP `actions_run_trigger`.
Log grande: `get_job_logs` sem return_content dá um link → baixar com curl. Custo da IA ~US$ 0,07/noite (saldo ~US$ 0,80).

## Situação (03/11/2026, 22ª sessão)
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
- Elements pausada (`LOJAS_PAUSADAS`, conferida toda noite ⏸️); Lojas Benoit removida de vez (`LOJAS_REMOVIDAS`, 04/11) — robo/awin.mjs.
- 04/11: Lauri Esporte só pela Awin (marca da Lomadee com nome de loja da Awin sai: `marcasNaAwin` em lomadee.js; fotos
  antigas 404 e repetidos); China in Box, DeÔnibus, Zupper, Bauducco, Jolimont e eles.® fora (não são loja de produtos, `FORA` em lomadee.js; cupons v13); robô: foto boa testada a
  cada 7 dias + amostra de 20 fotos por loja (🔄 = loja trocou as fotos, testa tudo de novo).
  Busca pelo nome de loja parceira: faixa com atalho; se vier vazia, abre a loja (`lojaDoNome` em app.js).
  Cupons só de lojas com produtos no site (`lojasComProdutos` em functions/api/cupons.js): 42 cupons de 17 lojas.
  Robô 04/11 (#104, 7h51 de atraso): **466 de 484 prontas** ✅; 🆕 **TEKA** (Awin, 920, cama/mesa/banho, feed sem categoria) →
  `PADRAO_DA_LOJA` forte "Cama e banho" (loja forte vale acima da IA); banco 372 MB (limite do plano pago: 10 GB).
  "Não contar minhas visitas": cookie `vpc_nao_contar` (`/?nao-contar=1`/`0`, link no quadro Visitas do painel) tira o aparelho
  das visitas (CSP sem Web Analytics), buscas e cliques (`lib/naoContar.js`). IP: não mostramos (LGPD).

## Pendências
- **Giovanni**: pedir mais lojas na Awin (texto do convite já entregue); 2FA nas contas; trocar a senha do Registro.br;
  UptimeRobot; INPI (GRU 389, R$ 440, antes de ~21/01/2027); decidir cron-job.org para o atraso
  do robô; decidir Mercado Livre.
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
