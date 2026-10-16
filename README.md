# Projetos
Site vaiprocarrinho.com.br: comparador de preços com links de afiliado.

## Como está organizado
| Caminho | O que é |
|---|---|
| `index.html` | O comparador (página principal). O antigo endereço `/previa` leva para cá |
| `assets/` | Visual (`estilo.css`) e funcionamento da página (`app.js`) |
| `functions/api/buscar.js` | A busca: roda no Cloudflare, consulta as lojas e junta os resultados |
| `lib/fontes/` | Uma "fonte" por loja. `exemplo.js` tem produtos fictícios para testes |
| `robo/` | Robô de preços: baixa os catálogos das lojas (Awin) para o banco do site |
| `marca/` | Logo e ícone do Vai pro Carrinho |
| `lib/buscas.js` + `functions/api/em-alta.js` | Conta as buscas e mostra os termos mais buscados da semana abaixo da busca |
| `functions/api/conta/` + `lib/conta.js` | Cadastro (Google ou e-mail + senha, com "Esqueci minha senha") e "Meu carrinho" salvo na conta |
| `privacidade.html` | Política de Privacidade (LGPD) |
| `_headers` | Pede aos buscadores para não indexar o site enquanto ele está em construção |

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

## Robô de preços (Awin)
`robo/awin.mjs` roda todo dia às 04:17 pelo GitHub (`.github/workflows/robo-precos.yml`). Ele baixa o
catálogo de todas as lojas da Awin em que a conta foi aprovada e atualiza a tabela `ofertas` do banco D1:
produto novo entra, preço que mudou é atualizado (e guardado na tabela `precos`, o histórico), produto
que saiu da loja é removido. Grava no máximo 20 mil produtos por dia (limite do plano grátis do D1);
o resto fica para o dia seguinte.

Lojas de fora do Brasil também entram, marcadas como **"🌎 Internacional"** no site. Preços em outra moeda
são convertidos para reais pela cotação do dia (AwesomeAPI) e regravados quando o câmbio muda mais de ~3%.
Se a loja tem feed em português, usa esse; senão, um só feed (EUA/inglês primeiro) para não repetir produto.
Para aceitar só algumas regiões: variável `ROBO_REGIOES` (ex.: `BR`).

Precisa destes segredos em GitHub > Settings > Secrets and variables > Actions:
| Segredo | De onde vem |
|---|---|
| `AWIN_FEED_KEY` | Awin > Ferramentas > Crie um Feed: o código depois de `/apikey/` no link gerado |
| `CLOUDFLARE_API_TOKEN` | Cloudflare > My Profile > API Tokens > Create Token, com permissão **Account > D1 > Edit** |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare > Workers & Pages (aparece como "Account ID") |
| `D1_DATABASE_ID` | Cloudflare > Storage & Databases > D1 > o banco ligado ao site > "Database ID" |

O GitHub só agenda robôs da branch principal (default branch) do repositório.
Para rodar na hora: aba **Actions > Robô de preços > Run workflow**.

Teste no computador, com um feed de exemplo e um banco local:
```
node robo/awin.mjs --feed robo/exemplo-awin.csv --sqlite /tmp/teste.sqlite
```

## Testar no computador
```
npx wrangler pages dev . --d1 DB=teste
```
e abrir http://localhost:8788 (no computador, o link de "Esqueci minha senha" aparece no terminal).

## Para lançar o site
O comparador já é a página principal desde 15/10/2026. Para aparecer no Google, falta:
apagar o arquivo `_headers` e a linha `<meta name="robots" ...>` do `index.html`.
