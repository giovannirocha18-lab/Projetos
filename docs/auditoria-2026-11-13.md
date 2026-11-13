# Auditoria do site — 13/11/2026 (pedido do Giovanni)

Três frentes, só leitura: tela (PC e celular, Playwright), qualidade das buscas (67 buscas pela API) e código/servidor.
Corrigido na hora só as sugestões impróprias (regra dele de 05/11). O resto aguarda a decisão dele.
Os 7 testes (`testes/*.mjs`) passam. Nenhum erro de JavaScript, imagem quebrada, 4xx/5xx ou segredo no repositório.

## Já corrigido
- Sugestões impróprias ou que não são produto (pornô, armas de pressão, bebidas pelo nome, anestésico/insulina, curso, pdf,
  usado, "loja …"): `BLOQUEADOS_TENDENCIAS` em lib/buscas.js, casos em testes/sugestoes.mjs, vocabulário v=14 (3.530 → 3.460).

## Bugs (em ordem de gravidade)
1. **Preço absurdo**: "ar condicionado", 2ª posição, Central Ar (Awin, `awin-17608-35456293056`), R$ 16.004.370.000.000.000
   (vem assim do feed desde 28/10). Falta um teto de preço na carga da Awin/na busca. Outros preços "de enfeite" como produto:
   PS5 R$ 9.999 (sai como "Mais bem avaliado"), iPhone 17 R$ 20.000, cadeira gamer R$ 10.000, TV 55 R$ 69.956.
2. **Comparador preso em "Procurando o mesmo modelo…"**: modo já ligado + busca nova pela caixa (ex.: geladeira → "ração").
   `completarSozinho` (app.js, `finally`) redesenha só a Escolha rápida; falta `desenharComparacao(filtrar())`. Pelo mesmo
   motivo, às vezes as buscas por marca por trás não começam ("batedeira": 0 pedidos, 5 modelos).
3. **"Limpar filtros" em Quedas de preço, página de loja e categoria leva para o início** (`limparFiltros` só poupa a Black Friday).
4. **"xbox"**: topo com Xbox One/360 usados, jogos e HD com jogos; nenhum Series S/X. "xbox series s 1tb": SSDs e jogos digitais.
5. **Usado/vitrine/modelo antigo no topo**: "iphone 16" (2ª posição "VITRINE", é o "Mais barato"), "celular"/"smartphone"
   (Galaxy S21+ sem venda, M12, telefone de mesa), "notebook" (ThinkPad T480s de exposição), "ps5" (Fat seminovo). O filtro
   `USADO` do comparador não vale na lista nem na Escolha rápida.
6. **Produto de outro tipo como principal**: "bicicleta" (ergométrica em 1º), "colchão casal" (inflável em 1º), "fone bluetooth"
   (intercomunicador de capacete), "whey protein" (amostra 12 g), "sofá" (inflável), "cadeira gamer" (cadeira de jantar),
   "smart tv 55/65" (combos de duas TVs), "air fryer" (forno de embutir de R$ 11.193).
7. **"tênis nike" (busca pronta) só com a AliExpress** (426 ofertas; as outras lojas vieram com 0).
8. **Termo real pode sair das sugestões por 3 dias quando uma loja falha** (`anotarSemProduto` não olha se as lojas responderam).
9. **Quedas de preço**: 7 itens da 1ª página com "antes" = preço atual (sem queda); 1 com "antes" R$ 3.633 para vestido de R$ 51,99.
10. **Categoria errada**: "computador gamer led" (PCs em Iluminação LED), fralda geriátrica em Bebês, tablet/kindle sem categoria.
11. Pequenos de tela: início no celular rola 8 px de lado (`#chips-ml` margin -16px); dois atalhos "Cozinha" no cabeçalho;
    "7 dia(s)" nos detalhes e "8 dias" no histórico do mesmo produto; Voltar com janela aberta sai da página (só gaveta e
    carrinho usam `passoDeCamada`); textos cortados (selo "mais vendido da categor…", "Buscar em Eletrodoméstico");
    caixinha do Modo comparação menor na gaveta.
12. Robô de casar: erro da IA abandona o grupo até a noite seguinte (lib/casar.js, `catch … break`).
13. Cupons: 7 da KaBuM com texto de promoção passada; "R$ na Multifuncional…" sem valor; EINSTAR em inglês/dólar para afiliado.

## Melhorias sugeridas
- Total de ofertas muda na mesma busca (238 → 370 → 242); mostrar "238+" ou sem número parcial.
- Filtro ligado não aparece fora da gaveta (pílula "Consul ✕").
- Repetidos: mesma oferta em cores/tamanhos (Sofá na Caixa 11 de 25; Pampers 4 tamanhos na Black Friday); títulos-spam
  ("LEGO LEGO LEGO…") no topo.
- Busca sem resultado: 8–10 s e sem sugestão.
- Alvos de toque pequenos no celular (⚖️ do cartão, "Cupom", pílulas de loja).
- Shopee ao vivo falhou em 18 de 67 buscas (as não guardadas levam 5–9 s).
- Limpeza: `TERMO_NAO_MODELO` (app.js) x `TERMO` (lib/casar.js) diferentes; `pedirCasados` não tenta de novo se falhar; CSS
  morto dos blocos "TESTE" até ele decidir o layout; corrida rara em `completarComparacaoDaCategoria`; `rebaixarSemProduto`
  (site) mais largo que a regra do servidor; limitar o número de palavras da busca.

## Conferido e certo
Casos antigos: computador (sem balança), tv 55/65 (sem rack), "5 litros", dry fit, sapateira, geladeira brastemp, capa
celular, xiaomi 18 pro, micro-ondas (3 grafias), erros de digitação, Cozinha sem inversora. SQL com bind, sem XSS, rotas do
robô e painel protegidas, POST /api/casados limitado, 404 corretos, noindex presente. Tempo até o 1º cartão: 0,5–1,6 s.
