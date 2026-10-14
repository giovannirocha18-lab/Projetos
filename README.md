# Gerador-de-Riquezas
Site vaiprocarrinho.com.br: comparador de preços com links de afiliado.

## Como está organizado
| Caminho | O que é |
|---|---|
| `index.html` | Página "Em breve", que é o que o público vê enquanto o site está em construção |
| `previa.html` | O comparador de verdade. Teste em `vaiprocarrinho.pages.dev/previa` |
| `assets/` | Visual (`estilo.css`) e funcionamento da página (`app.js`) |
| `functions/api/buscar.js` | A busca: roda no Cloudflare, consulta as lojas e junta os resultados |
| `lib/fontes/` | Uma "fonte" por loja. `exemplo.js` tem produtos fictícios para testes |
| `functions/api/conta/` + `lib/conta.js` | Cadastro sem senha (nome + e-mail + código) e "Meu carrinho" salvo na conta |
| `privacidade.html` | Política de Privacidade (LGPD) |
| `_headers` | Pede aos buscadores para não indexar o site enquanto ele está em construção |

## Lojas
- **Exemplo**: usada automaticamente enquanto nenhuma loja real estiver ligada.
- **Curadoria** (`lib/fontes/curadoria.js`): produtos escolhidos à mão, com o link de afiliado
  gerado no portal da loja. Liga sozinha quando a lista tiver pelo menos um produto.
- **Shopee** (`lib/fontes/shopee.js`): liga sozinha quando as variáveis `SHOPEE_APP_ID` e
  `SHOPEE_SECRET` forem cadastradas no Cloudflare (projeto > Settings > Variables and Secrets).
- Para adicionar outra loja: criar `lib/fontes/<loja>.js` e incluir em `functions/api/buscar.js`.

## Cadastro e "Meu carrinho"
Liga quando o projeto no Cloudflare tiver (Settings):
- **Bindings** > D1 database com o nome de variável `DB` (as tabelas são criadas sozinhas);
- **Variables and Secrets** > `RESEND_API_KEY` (tipo Secret), chave do resend.com para enviar o código.
- Opcional: `EMAIL_REMETENTE` (ex.: `Vai pro Carrinho <nao-responda@vaiprocarrinho.com.br>`), só depois
  de verificar o domínio no Resend. Sem isso, o Resend só entrega para o e-mail dono da conta Resend.

**Entrar com Google** (opcional): o botão aparece quando existirem `GOOGLE_CLIENT_ID` (variável) e
`GOOGLE_CLIENT_SECRET` (Secret). Criados em console.cloud.google.com > APIs e serviços > Credenciais >
ID do cliente OAuth (Aplicativo da Web), com estes "URIs de redirecionamento autorizados":
`https://vaiprocarrinho.com.br/api/conta/google/retorno`, `https://www.vaiprocarrinho.com.br/api/conta/google/retorno`
e `https://vaiprocarrinho.pages.dev/api/conta/google/retorno`.

Sem o banco, o botão de entrar some e o carrinho fica só no aparelho.

## Testar no computador
```
npx wrangler pages dev . --d1 DB=teste
```
e abrir http://localhost:8788/previa (no computador, o código de acesso aparece no terminal).

## Para lançar o site
1. Apagar `index.html` e renomear `previa.html` para `index.html`.
2. Apagar o arquivo `_headers` e a linha `<meta name="robots" ...>` do novo `index.html`.
