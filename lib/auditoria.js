// Auditoria da busca (pedido do Giovanni, 27/10/2026): toda madrugada o robô olha o topo das buscas mais comuns,
// do jeito que o visitante vê, e lista o que parece não ser o produto buscado. Não esconde nada sozinho:
// a lista serve para corrigir as regras da busca (lib/relevancia.js) antes que alguém tropece no erro.
// Ex.: "Geladeira Our Generation" (de boneca, R$ 900) em 2º na busca "geladeira"; suporte de R$ 28 no meio dos PS5.
import { comSinonimos } from "./relevancia.js";
import { categoriaDoProduto } from "./categorias.js";

// Igual ao site (public/assets/app.js): categorias com mais de 20% dos produtos principais começam marcadas
const PARTE_DA_CATEGORIA = 0.2;
const TOPO = 20; // primeiros produtos que aparecem na tela
// Abaixo de 10% do preço típico do produto (com 25% saíam perfumes de R$ 25 e robôs aspiradores de R$ 44, que existem mesmo).
// Típico = 1º quartil dos produtos (com a mediana, as mesas de jantar de R$ 480 apareciam porque metade custa mais de R$ 5 mil)
const BARATO_DEMAIS = 0.1;
const QUARTIL = 0.25;
// Palavras que quase nunca estão no título do produto buscado (a não ser que a busca peça). Ficaram de fora as que
// aparecem em produto de verdade: "Compatível com Alexa", "suporte para dois chips", "película de brinde", "creatina refil",
// "Fita LED … decoração". Só nas primeiras palavras do título (o fim costuma ser brinde: "… com Capa", "Capa Dura")
const PALAVRAS_OLHADAS = 8;
const SUSPEITAS = new Set(`
  brinquedo brinquedos miniatura replica colecionavel reposicao adesivo adesivos capa capinha
  enfeite chaveiro poster molde reparo conserto
`.trim().split(/\s+/));
const DE_BRINQUEDO = new Set(["boneca", "bonecas", "brinquedo", "brinquedos", "miniatura", "colecionavel"]);

const quartil = (v) => {
  const l = [...v].sort((a, b) => a - b);
  return l.length ? l[Math.floor(l.length * QUARTIL)] : 0;
};
// "com/+" antes da palavra = brinde ("Kit Maquiagem … com Chaveiro", "Colchão Inflável C/ Fole + Adesivo P Reparo")
const ACOMPANHA = new Set(["com", "c", "acompanha", "brinde", "brindes"]);

// O que o visitante vê primeiro: sem acessórios, só as categorias do que foi buscado, na ordem do servidor
export function listaVisivel(ofertas) {
  const produtos = ofertas.filter((o) => !o.acessorio);
  const base = produtos.filter((o) => o.principal && !o.variante && !o.foraDoTipo);
  if (base.length < 5) return produtos;
  const conta = new Map();
  for (const o of base) conta.set(o.secao || "", (conta.get(o.secao || "") || 0) + 1);
  const cats = new Set([...conta].filter(([, n]) => n > base.length * PARTE_DA_CATEGORIA).map(([c]) => c));
  return cats.size ? produtos.filter((o) => cats.has(o.secao || "")) : produtos;
}

// Suspeitos no topo de uma busca: [{ posicao, titulo, preco, loja, motivos }]
export function auditarBusca(q, ofertas) {
  const pedidas = new Set(comSinonimos(q).split(" "));
  // Labubu e Bobbie Goods são brinquedo: "boneca" no título é normal (igual ao site, que só esconde brinquedo
  // quando a busca é de outra categoria)
  const cat = categoriaDoProduto(q)?.nome;
  const brinquedoNormal = !cat || cat === "Brinquedos" || cat === "Bebês";
  const suspeitas = brinquedoNormal ? new Set([...SUSPEITAS].filter((p) => !DE_BRINQUEDO.has(p))) : new Set([...SUSPEITAS, "boneca", "bonecas"]);
  const visiveis = listaVisivel(ofertas);
  const tipicos = visiveis.filter((o) => o.principal && !o.variante && !o.foraDoTipo && o.preco > 0).map((o) => o.preco);
  const tipico = tipicos.length >= 5 ? quartil(tipicos) : 0;
  const termos = [...pedidas].filter((p) => p.length >= 3);
  const suspeitos = [];
  visiveis.slice(0, TOPO).forEach((o, i) => {
    const motivos = [];
    // Só antes do produto buscado: "Pendrive … Pendrive Chaveiro" é o pendrive; "Chaveiro … Stanley" é o chaveiro
    const todas = comSinonimos(o.titulo.replace(/\+/g, " com ")).split(" ");
    const produto = todas.findIndex((p) => termos.some((t) => p.startsWith(t)));
    const palavras = todas.slice(0, Math.min(PALAVRAS_OLHADAS, produto >= 0 ? produto : PALAVRAS_OLHADAS));
    const suspeita = palavras.find((p, j) => suspeitas.has(p) && !pedidas.has(p) && !palavras.slice(0, j).some((x) => ACOMPANHA.has(x)));
    if (suspeita) motivos.push(`palavra "${suspeita}"`);
    if (tipico && !o.variante && o.preco > 0 && o.preco < tipico * BARATO_DEMAIS) {
      motivos.push(`preço R$ ${Math.round(o.preco)} (típico R$ ${Math.round(tipico)})`);
    }
    if (i < 10 && !o.principal && !o.bate) motivos.push("não começa pelo produto");
    if (motivos.length) suspeitos.push({ posicao: i + 1, titulo: o.titulo, preco: o.preco, loja: o.lojaNome || o.loja, motivos });
  });
  return suspeitos;
}
