# Auditoria antes de liberar o site ao público — 19/11/2026

Pedido do Giovanni: auditoria detalhada, com foco nas buscas, para decidir se libera. **Nada foi alterado no site.**
Feito no site no ar, com o cookie `vpc_nao_contar` (não entra em visitas, poucas nem fila do ML).

## O que foi medido
- 178 buscas pela API (populares, com marca/modelo, cauda longa, moda, erros de digitação, lixo), cada uma 2 vezes.
- 14 buscas novas à parte: 4 sozinhas e 10 ao mesmo tempo (repetidas 15 s depois).
- 12 páginas no computador e no celular (Playwright): erros de JS, fotos, rolagem, tempos.
- Uso real: sugestões, Enter, Escolha rápida, Ver detalhes, Histórico, marca, Comparador, ordenações, Voltar.
- Links de compra de cada rede, textos que o Google lê, sitemap, robots, cabeçalhos, texto malicioso, limite de pedidos.
- Testes do código: os 8 passam.

## Números
- 79 das 178 já estavam guardadas: 0,1–0,7 s (meio 0,2 s).
- 99 eram novas: meio 4,1 s, 1 em cada 10 acima de 6,4 s, pior 11,7 s; 32 passaram de 5 s.
- Repetindo a busca nova logo depois: 93 de 99 continuaram lentas (> 2 s). Só 5 ficaram rápidas.
- Nas 99 novas: Shopee falhou em 95 ("demorou demais"/erro 10000), ML não terminou no prazo em 63 (segue por trás),
  Lomadee 9, AliExpress 1. AliExpress responde em 3,5–5,5 s (é quem segura a resposta quando o resto dá certo).
- A resposta demora 1,5–2 s a mais que a loja mais lenta (ex.: lojas 4,6 s, resposta 6,4 s): causa não investigada.
- 33 de 178 com menos de 30 produtos à vista; 4 buscas de modelo vieram na 1ª visita SEM NENHUM produto, só acessórios
  (iphone 16 pro max 256gb, moto g85, airpods pro 2, lego technic); na 2ª visita o produto do ML aparece.

## Problemas, por gravidade

### Graves (pesam na decisão de liberar)
**Corrigidos em 19/11 (no ar): 1, 2, 4, 5 e 6.** Busca nova: 1ª tela em 2,6–3,8 s (era 4–8), 2ª visita em 0,15–0,6 s (era 3–7),
o que faltou entra sozinho em ~8 s. O 3 mudou de figura: a Shopee responde, mas em 3–6 s (fora do prazo da 1ª tela); entra pelo
complemento. Detalhe no CLAUDE.md (19/11, noite).

1. **Busca nova lenta: 4–8 s.** Vale para toda busca que ninguém fez antes (maioria, com público novo).
2. **Busca nova não fica guardada enquanto uma loja falha** (hoje a Shopee falha em quase todas): a 2ª, 3ª… visita
   refaz tudo (3–7 s de novo) e cada uma gasta consultas na Shopee/AliExpress/ML. Com público, isso multiplica a carga.
3. **Shopee fora na busca por palavra** (95 de 99). O site depende das cópias guardadas e da lista baixada.
4. **1ª visita de busca de modelo pode vir só com acessórios** (o ML ainda não respondeu) e some o produto principal.
5. **Erro de digitação comum não é corrigido**: "gelaeira" = 0 ofertas (só corrige o que está na lista: iphne, samsumg,
   notbook, playsation funcionam).
6. **Palavra a mais derruba a busca**: "celular barato" = 7 itens de lixo (pingente, antena, bolsa);
   "ventilador de teto com controle" abre com controles remotos, não ventiladores.

### Médios (qualidade do topo da lista)
**Corrigidos em 19/11 (no ar):** itens 7 a 12 (regras em lib/relevancia.js, casos em testes/busca.mjs). O 13 não é defeito: a ordem
"Maior desconto" põe primeiro o desconto conferido pelo histórico, de propósito. Sobra do 7: "mochila" (almofada de bebê) e
"playstation 5 pro" ("Hyper-5" de R$ 400); do 8: "tv lg oled 65" (as lojas não trouxeram nenhuma OLED).

7. Brinquedo/peça/acessório como produto no topo: "geladeira" 4º = Geladeira Cookeez (brinquedo, R$ 499);
   "lavadora electrolux 13kg" com peça de R$ 78 e selo mecânico; "moto g85" 2º e 3º = gaveta de chip;
   "placa de vídeo rtx 4060" 4º = ventoinha; "câmera canon" 1 câmera e depois bolsas/controles;
   "playstation 5 pro" 3º = "Hyper-5" de R$ 399 e PS5 comuns; "mochila" 5º = almofada de proteção de bebê.
8. Modelo vizinho no lugar do pedido: "apple watch se" abre com Series 11; "fone jbl tune 520" 2º–4º outros JBL;
   "tv lg oled 65" sem nenhuma OLED (2 resultados); "iphone 16 pro max 256gb" traz iPhone 18 Pro Max.
9. Anúncio de vários modelos num só ("iPhone 15/15 Pro/15 Pro Max 128/256GB", SSD "1TB 512GB 256GB" com preço do
   menor): top 5 inteiro de "iphone 15" e 4 dos 5 de "ssd 1tb". Engana no "Menor preço".
10. Modelo velho no topo: "celular" 5º = Galaxy S21+ (2021); "notebook" por menor preço abre com
    "Notebook Pronto para estudos (já formado)" e Lenovo L440 de 4ª geração.
11. Termo de dois sentidos misturado: "monitor" (de áudio, de pressão), "cooler" (de processador x térmico),
    "home theater" (painel de móvel), "relógio" (despertador, kit de bijuteria), "furadeira" 1º = a gasolina para mourão.
12. Moda: "jaqueta couro" top 5 só Animale de R$ 3.599–8.998 (repetidas); "cueca boxer" abre com 3 geriátricas;
    "camisa polo" com polo do Goku e conjunto de bebê.
13. "Maior desconto (%)" não segue o % mostrado no cartão (iphone 16: -6%, -35%, -16%…).

### Menores
> **19/11 (noite): 14, 15 e 17 corrigidos e no ar.** 16: o teste daqui não serve (os pedidos saem por ~11 endereços
> diferentes, nunca passam de 60 em 10 s por endereço); falta o Giovanni conferir a regra no painel do Cloudflare.
14. Categoria aberta pelo endereço (`/?q=&cat=…`) sai com o título e o canônico da página inicial (ruim para o Google).
15. Sugestões estranhas na caixa: "shorts feminino que mostra a poupa", "o filme lançamentos em 2026",
    "remedio masterfitone", "farmadox 50".
16. Limite de pedidos: 90 pedidos seguidos a /api/vocabulario e 40 a /ir passaram todos (regra "Limite API" do
    Cloudflare não disparou no teste; pode ser por resposta guardada ou pelo caminho do teste — conferir no painel).
17. Página não encontrada é só um texto cru; /favicon.ico dá 404.
18. Ainda com `noindex` (index.html e _headers), como combinado: tirar só no lançamento.

## O que está bom
- Buscas guardadas: 0,1–0,7 s; páginas abrem o 1º cartão em 0,4–1 s (PC e celular).
- 0 erro de JavaScript, 0 foto quebrada, sem rolagem lateral, em 24 telas.
- Uso real todo funcionando (sugestões, detalhes, histórico, marcas, comparador, ordenar por preço, Voltar).
- Links de compra das 5 redes levam à loja com a marca de afiliado (ML, Awin, AliExpress, Shopee, Lomadee).
- Nenhuma oferta sem foto ou sem preço nas 178 buscas. Nenhum erro 500.
- Texto malicioso na busca não executa; redirecionamento para site de fora é recusado.
- Título/descrição por busca, sitemap (91 endereços), robots.txt e cabeçalhos de segurança certos.
- Populares com topo bom: geladeira (fora o brinquedo), fogão, smart tv, air fryer, máquina de lavar, ar condicionado,
  notebook, ps5, xbox, nintendo switch, galaxy s25, cooktop, lava-louças, freezer, purificador, pets, bebês, móveis.
- Os 8 testes do código passam.
