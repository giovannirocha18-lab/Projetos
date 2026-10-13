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
| `_headers` | Pede aos buscadores para não indexar o site enquanto ele está em construção |

## Lojas
- **Exemplo**: usada automaticamente enquanto nenhuma API real estiver ligada.
- **Shopee** (`lib/fontes/shopee.js`): liga sozinha quando as variáveis `SHOPEE_APP_ID` e
  `SHOPEE_SECRET` forem cadastradas no Cloudflare (projeto > Settings > Variables and Secrets).
- Para adicionar outra loja: criar `lib/fontes/<loja>.js` e incluir em `functions/api/buscar.js`.

## Testar no computador
```
npx wrangler pages dev .
```
e abrir http://localhost:8788/previa

## Para lançar o site
1. Apagar `index.html` e renomear `previa.html` para `index.html`.
2. Apagar o arquivo `_headers` e a linha `<meta name="robots" ...>` do novo `index.html`.
