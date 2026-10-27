// Auditoria da busca (pedido do Giovanni, 27/10/2026): toda madrugada o robô olha o topo das buscas mais comuns,
// do jeito que o visitante vê, e lista o que parece não ser o produto buscado. Não esconde nada sozinho:
// a lista serve para corrigir as regras da busca (lib/relevancia.js) antes que alguém tropece no erro.
// Ex.: "Geladeira Our Generation" (de boneca, R$ 900) em 2º na busca "geladeira"; suporte de R$ 28 no meio dos PS5.
import { normalizar } from "./texto.js";

// Igual ao site (public/assets/app.js): categorias com mais de 20% dos produtos principais começam marcadas
const PARTE_DA_CATEGORIA = 0.2;
const TOPO = 20; // primeiros produtos que aparecem na tela
const BARATO_DEMAIS = 0.25; // abaixo de 25% do preço típico do produto
// Palavras que quase nunca estão no título do produto buscado (a não ser que a busca peça)
const SUSPEITAS = new Set(`
  brinquedo brinquedos boneca bonecas miniatura replica colecionavel reposicao refil adesivo adesivos capa capinha
  pelicula suporte compativel decorativo decoracao enfeite chaveiro poster quadro molde reparo conserto
`.trim().split(/\s+/));

const mediana = (v) => {
  const l = [...v].sort((a, b) => a - b);
  return l.length ? l[Math.floor(l.length / 2)] : 0;
};

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
  const pedidas = new Set(normalizar(q).split(" "));
  const visiveis = listaVisivel(ofertas);
  const tipicos = visiveis.filter((o) => o.principal && !o.variante && !o.foraDoTipo && o.preco > 0).map((o) => o.preco);
  const tipico = tipicos.length >= 5 ? mediana(tipicos) : 0;
  const suspeitos = [];
  visiveis.slice(0, TOPO).forEach((o, i) => {
    const motivos = [];
    const palavras = normalizar(o.titulo).split(" ");
    const suspeita = palavras.find((p) => SUSPEITAS.has(p) && !pedidas.has(p));
    if (suspeita) motivos.push(`palavra "${suspeita}"`);
    if (tipico && !o.variante && o.preco > 0 && o.preco < tipico * BARATO_DEMAIS) {
      motivos.push(`preço R$ ${Math.round(o.preco)} (típico R$ ${Math.round(tipico)})`);
    }
    if (i < 10 && !o.principal && !o.bate) motivos.push("não começa pelo produto");
    if (motivos.length) suspeitos.push({ posicao: i + 1, titulo: o.titulo, preco: o.preco, loja: o.lojaNome || o.loja, motivos });
  });
  return suspeitos;
}
