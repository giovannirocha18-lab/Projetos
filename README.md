# Projetos
Site vaiprocarrinho.com.br: comparador de preços com links de afiliado.

## Como está organizado
| Caminho | O que é |
|---|---|
| `public/` | **Única pasta publicada** (Cloudflare: Build output directory = `public`). Nunca guardar nada interno aqui |
| `public/index.html` | O comparador (página principal). O antigo endereço `/previa` leva para cá |
| `public/assets/` | Visual (`estilo.css`) e funcionamento da página (`app.js`) |
| `functions/api/buscar.js` | A busca: roda no Cloudflare, consulta as lojas e junta os resultados |
| `lib/fontes/` | Uma "fonte" por loja. `exemplo.js` tem produtos fictícios para testes |
| `robo/` | Robô de preços: baixa os catálogos das lojas (Awin) para o banco do site |
| `public/marca/` | Logo e ícone do Vai pro Carrinho |
| `lib/buscas.js` + `functions/api/em-alta.js` | Conta as buscas e mostra os termos mais buscados da semana abaixo da busca |
| `functions/api/conta/` + `lib/conta.js` | Cadastro (Google ou e-mail + senha, com "Esqueci minha senha") e "Meu carrinho" salvo na conta |
| `public/privacidade.html` | Política de Privacidade (LGPD) |
| `public/_headers` | Pede aos buscadores para não indexar o site enquanto ele está em construção |

## Lojas
- **Exemplo**: usada automaticamente enquanto nenhuma loja real estiver ligada.
- **Curadoria** (`lib/fontes/curadoria.js`): produtos escolhidos à mão, com o link de afiliado
  gerado no portal da loja. Liga sozinha quando a lista tiver pelo menos um produto.
- **Shopee** (`lib/fontes/shopee.js`): liga sozinha quando as variáveis `SHOPEE_APP_ID` e
  `SHOPEE_SECRET` forem cadastradas no Cloudflare (projeto > Settings > Variables and Secrets).
- **Awin** (`lib/fontes/awin.js`): lojas como Leveros, Efacil e Beleza na Web. Liga sozinha quando o
  robô de preços tiver colocado ofertas no banco (veja abaixo).
- **AliExpress** (`lib/fontes/aliexpress.js`): liga sozinha quando as variáveis `ALIEXPRESS_APP_KEY` e
  `ALIEXPRESS_APP_SECRET` forem cadastradas no Cloudflare (App Console do openservice.aliexpress.com).
  `ALIEXPRESS_TRACKING_ID` é opcional (padrão `vaiprocarrinho`). "Ofertas do dia" da AliExpress dependem da
  "Advanced API" (ainda não pedida).
- Para adicionar outra loja: criar `lib/fontes/<loja>.js` e incluir em `functions/api/buscar.js`.

## Cadastro e "Meu carrinho"
Liga quando o projeto no Cloudflare tiver (Settings):
- **Bindings** > D1 database com o nome de variável `DB` (as tabelas são criadas sozinhas);
- **Variables and Secrets** > `RESEND_API_KEY` (tipo Secret), chave do resend.com para enviar o link de "Esqueci minha senha".
- Opcional: `EMAIL_REMETENTE` (ex.: `Vai pro Carrinho <nao-responda@vaiprocarrinho.com.br>`), só depois
  de verificar o domínio no Resend. Sem isso, o Resend só entrega para o e-mail dono da conta Resend.

**Entrar com Google** (opcional): o botão aparece quando existirem `GOOGLE_CLIENT_ID` (variável) e
`GOOGLE_CLIENT_SECRET` (Secret). Criados em console.cloud.google.com > APIs e serviços > Credenciais >
ID do cliente OAuth (Aplicativo da Web), com estes "URIs de redirecionamento autorizados":
`https://vaiprocarrinho.com.br/api/conta/google/retorno`, `https://www.vaiprocarrinho.com.br/api/conta/google/retorno`
e `https://vaiprocarrinho.pages.dev/api/conta/google/retorno`.

Sem o banco, o botão de entrar some e o carrinho fica só no aparelho.

**Alertas de preço** ("🔔 Me avise quando baixar", `lib/alertas.js`): quem tem conta escolhe um produto e, se quiser,
um preço. Todo dia, depois da Awin, o robô chama `/api/conferir-alertas?parte=N` (preço de hoje: Awin do banco,
Shopee e AliExpress pela API, Lomadee pelo último preço visto) e manda um e-mail por pessoa pelo Resend (mesmas chaves
acima; para chegar ao e-mail dos visitantes, o domínio precisa estar verificado no Resend). O link "Parar este alerta"
do e-mail abre `/api/alertas/parar`. A janela do alerta, a do histórico e a de detalhes mostram também o
"Vale a pena comprar agora?" (🟢/🟡/🔴, com 14+ dias de histórico de preço).

## Robô de preços (Awin)
`robo/awin.mjs` roda todo dia às 02:30 (horário de Cuiabá) pelo GitHub (`.github/workflows/robo-precos.yml`). Ele baixa o
catálogo de todas as lojas da Awin em que a conta foi aprovada e atualiza a tabela `ofertas` do banco D1:
produto novo entra, preço que mudou é atualizado (e guardado na tabela `precos`, o histórico), produto
que saiu da loja é removido. Grava até 300 mil produtos por vez (trava de segurança; cada um = ~5 linhas no D1; plano Workers Paid);
o resto fica para o dia seguinte.

Lojas de fora do Brasil também entram, marcadas como **"🌎 Internacional"** no site. Preços em outra moeda
são convertidos para reais pela cotação do dia (AwesomeAPI) e regravados quando o câmbio muda mais de ~3%.
Se a loja tem feed em português, usa esse; senão, um só feed (EUA/inglês primeiro) para não repetir produto.
Para aceitar só algumas regiões: variável `ROBO_REGIOES` (ex.: `BR`).

Precisa destes segredos em GitHub > Settings > Secrets and variables > Actions:
| Segredo | De onde vem |
|---|---|
| `AWIN_FEED_KEY` | Awin > Ferramentas > Crie um Feed: o código depois de `/apikey/` no link gerado |
| `AWIN_FEED_KEY_PJ` | O mesmo link da conta nova da Awin (empresa/MEI). Loja aprovada nas duas contas usa esta |
| `CLOUDFLARE_API_TOKEN` | Cloudflare > My Profile > API Tokens > Create Token, com permissão **Account > D1 > Edit** |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare > Workers & Pages (aparece como "Account ID") |
| `D1_DATABASE_ID` | Cloudflare > Storage & Databases > D1 > o banco ligado ao site > "Database ID" |

O GitHub só agenda robôs da branch principal (default branch) do repositório.
Para rodar na hora: aba **Actions > Robô de preços > Run workflow**.

Teste no computador, com um feed de exemplo e um banco local:
```
node robo/awin.mjs --feed robo/exemplo-awin.csv --sqlite /tmp/teste.sqlite
```

`CHAVE_ROBO` (no GitHub e no Cloudflare, o mesmo valor) é a chave que o robô manda para os endereços que só ele pode
chamar (`/api/preparar-buscas`, `/api/coletar-precos`, `/api/conferir-alertas`, `/api/conferir-lojas`; ver `lib/robo.js`).

**Links "Comprar"**: toda madrugada o robô abre 8 produtos de cada loja da Awin direto no site da loja (sem o rastreio
da Awin), e a conferência da Lomadee abre 4 de cada marca. Loja em que quase todos dão "página não encontrada" sai do
site até voltar a abrir (`lib/links.js`). O resultado aparece no resumo do robô (🔗 Links) e em `linksQuebrados`.

## Cópia do banco (restaurar)
O Cloudflare guarda o banco D1 minuto a minuto por 30 dias (Time Travel; 7 dias no plano grátis). Toda madrugada o
robô anota no resumo da execução o **ponto de restauração** de antes de gravar. Para voltar o banco a um ponto
(apaga tudo o que mudou depois, inclusive contas e carrinhos novos; o próprio comando mostra o ponto para desfazer):
```
CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... npx wrangler d1 time-travel restore vaiprocarrinho --bookmark=<ponto>
```
ou `--timestamp=2026-10-25T06:00:00Z` no lugar de `--bookmark`. Para ver o ponto de agora: `npx wrangler d1 time-travel info vaiprocarrinho`.

## Testes automáticos
A cada envio ao GitHub, `.github/workflows/testes.yml` confere: todos os `.js` sem erro de escrita, todos os arquivos do
servidor abrindo (`testes/modulos.mjs`), o teste da busca (`testes/busca.mjs`) e o robô com o feed de exemplo. Se falhar,
o GitHub manda e-mail (o Cloudflare publica do mesmo jeito).

## Testar no computador
```
npx wrangler pages dev public --d1 DB=teste
```
e abrir http://localhost:8788 (no computador, o link de "Esqueci minha senha" aparece no terminal).

## Para lançar o site
O comparador já é a página principal desde 15/10/2026. Para aparecer no Google, falta:
apagar a regra `/*` do `public/_headers` e a linha `<meta name="robots" ...>` do `public/index.html`.
