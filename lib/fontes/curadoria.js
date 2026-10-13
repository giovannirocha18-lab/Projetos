// =====================================================================
// FONTE CURADORIA — produtos escolhidos à mão, com o link de afiliado
// gerado no portal da loja (ex.: Shopee > Oferta > Link personalizado).
// Serve enquanto as APIs não estão liberadas e, depois, para as lojas
// sem API (Mercado Livre, por exemplo).
//
// Para incluir um produto, copiar um bloco { ... } da lista abaixo.
// Obrigatórios: loja, titulo, preco, link.
// Opcionais: precoAntigo, imagem, categoria, emoji, termos, freteGratis,
//            avaliacao, vendidos.
//   loja      -> shopee, mercadolivre, amazon, aliexpress, magalu ou shein
//   termos    -> outras palavras que a pessoa pode buscar (sinônimos)
//   categoria -> uma das categorias da página inicial (ex.: "Eletrônicos")
// Preços: com ponto, sem "R$" (ex.: 89.90). Conferir de tempos em tempos,
// porque as lojas mudam os preços.
// =====================================================================
import { normalizar, buscarNoCatalogo, limpar } from "../texto.js";

const PRODUTOS = [
  // Modelo (apagar as duas barras do começo de cada linha para usar):
  // {
  //   loja: "shopee",
  //   titulo: "Fone de Ouvido Bluetooth TWS com Case",
  //   preco: 59.90,
  //   precoAntigo: 99.90,
  //   link: "https://s.shopee.com.br/XXXXXXX",
  //   imagem: "",
  //   categoria: "Eletrônicos",
  //   emoji: "🎧",
  //   termos: "fone sem fio earbuds",
  //   freteGratis: true,
  // },
];

const CATALOGO = PRODUTOS.map((p, i) => {
  const preco = Number(p.preco);
  const precoAntigo = Number(p.precoAntigo) > preco ? Number(p.precoAntigo) : null;
  return {
    id: `cur-${p.loja}-${i}`,
    loja: p.loja,
    titulo: p.titulo,
    preco,
    precoAntigo,
    desconto: precoAntigo ? Math.round((1 - preco / precoAntigo) * 100) : null,
    imagem: p.imagem || null,
    emoji: p.emoji || null,
    categoria: p.categoria || null,
    avaliacao: Number(p.avaliacao) || null,
    vendidos: Number(p.vendidos) || null,
    freteGratis: Boolean(p.freteGratis),
    link: p.link,
    _busca: normalizar(`${p.titulo} ${p.termos || ""} ${p.categoria || ""}`),
  };
});

export const curadoria = {
  nome: "curadoria",
  ativa: () => CATALOGO.length > 0,

  async buscar(q) {
    return buscarNoCatalogo(CATALOGO, q).map(limpar);
  },

  async destaques() {
    // Primeiro os de maior desconto
    return [...CATALOGO]
      .sort((a, b) => (b.desconto || 0) - (a.desconto || 0))
      .slice(0, 16)
      .map(limpar);
  },
};
