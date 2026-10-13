// =====================================================================
// FONTE DE EXEMPLO — produtos fictícios para testar o site enquanto as
// APIs das lojas não estão liberadas. Os preços são inventados e os links
// levam para a página de busca da loja (ainda SEM código de afiliado).
// =====================================================================
import { normalizar, palavras } from "../texto.js";

const TIPOS = [
  { emoji: "🍟", categoria: "Casa e Cozinha", base: 349, termos: "air fryer airfryer fritadeira sem oleo cozinha",
    titulos: ["Fritadeira Air Fryer 4L Antiaderente", "Air Fryer Digital 5,5L 1500W", "Fritadeira Elétrica Sem Óleo 3,5L", "Air Fryer Oven 12L Forno 3 em 1"] },
  { emoji: "🎧", categoria: "Eletrônicos", base: 129, termos: "fone ouvido bluetooth headphone earbuds tws sem fio",
    titulos: ["Fone de Ouvido Bluetooth TWS com Case", "Fone Bluetooth com Cancelamento de Ruído", "Headphone Bluetooth Dobrável 40h de Bateria", "Fone Sem Fio Esportivo à Prova d'Água"] },
  { emoji: "⌚", categoria: "Eletrônicos", base: 199, termos: "smartwatch relogio inteligente pulseira fitness",
    titulos: ["Smartwatch com Monitor Cardíaco e GPS", "Relógio Inteligente Tela AMOLED 1,9\"", "Smartband Fitness à Prova d'Água", "Smartwatch Chamadas Bluetooth"] },
  { emoji: "👟", categoria: "Moda", base: 249, termos: "tenis corrida academia caminhada calcado esportivo",
    titulos: ["Tênis de Corrida Amortecimento Leve", "Tênis Esportivo Masculino Academia", "Tênis Feminino Caminhada Confort", "Tênis Casual Unissex Branco"] },
  { emoji: "🥤", categoria: "Esporte", base: 69, termos: "garrafa termica squeeze copo inox agua",
    titulos: ["Garrafa Térmica Inox 1L", "Garrafa Térmica 500ml Parede Dupla", "Copo Térmico com Tampa e Canudo 1,2L", "Squeeze Térmico Academia 750ml"] },
  { emoji: "🖱️", categoria: "Informática", base: 59, termos: "mouse sem fio wireless optico silencioso",
    titulos: ["Mouse Sem Fio Silencioso 1600 DPI", "Mouse Wireless Recarregável RGB", "Mouse Bluetooth Ergonômico", "Mouse Gamer 7200 DPI"] },
  { emoji: "⌨️", categoria: "Informática", base: 219, termos: "teclado mecanico gamer rgb switch",
    titulos: ["Teclado Mecânico Gamer RGB Switch Blue", "Teclado Mecânico Compacto 60%", "Teclado Sem Fio Bluetooth Multidispositivo", "Kit Teclado e Mouse Sem Fio"] },
  { emoji: "🔊", categoria: "Eletrônicos", base: 159, termos: "caixa de som bluetooth speaker portatil",
    titulos: ["Caixa de Som Bluetooth à Prova d'Água", "Caixa de Som Portátil 20W com Rádio", "Speaker Bluetooth com Luz RGB", "Caixa de Som Amplificada 100W"] },
  { emoji: "🤖", categoria: "Casa", base: 899, termos: "aspirador robo inteligente limpeza po",
    titulos: ["Robô Aspirador Inteligente com App", "Aspirador Robô 3 em 1 Passa Pano", "Robô Aspirador Bivolt Mapeamento"] },
  { emoji: "🔋", categoria: "Eletrônicos", base: 99, termos: "power bank carregador portatil bateria externa celular",
    titulos: ["Power Bank 20.000mAh Carregamento Rápido", "Carregador Portátil 10.000mAh Slim", "Bateria Externa Magnética sem Fio"] },
  { emoji: "🧴", categoria: "Beleza", base: 59, termos: "serum vitamina c skincare pele rosto facial",
    titulos: ["Sérum Facial Vitamina C 30ml", "Sérum Ácido Hialurônico Hidratante", "Kit Skincare Vitamina C + Niacinamida"] },
  { emoji: "💄", categoria: "Beleza", base: 89, termos: "maquiagem kit batom paleta sombra base",
    titulos: ["Kit Maquiagem Completo 24 Peças", "Paleta de Sombras 35 Cores", "Kit Batom Matte 6 Cores", "Kit Pincéis de Maquiagem 12 Peças"] },
  { emoji: "🎒", categoria: "Acessórios", base: 139, termos: "mochila notebook escolar viagem impermeavel",
    titulos: ["Mochila para Notebook 15,6\" Impermeável", "Mochila Antifurto com Entrada USB", "Mochila de Viagem Expansível 40L"] },
  { emoji: "👗", categoria: "Moda", base: 89, termos: "vestido feminino roupa moda verao",
    titulos: ["Vestido Midi Floral Manga Curta", "Vestido Longo Fenda Verão", "Vestido Tubinho Canelado", "Vestido Ciganinha Estampado"], lojas: ["shein", "shopee", "aliexpress", "mercadolivre"] },
  { emoji: "💡", categoria: "Casa", base: 49, termos: "luminaria led luz abajur mesa fita",
    titulos: ["Luminária de Mesa LED Recarregável", "Fita LED RGB 5m com Controle", "Luminária Abajur Touch 3 Tons"] },
  { emoji: "🪑", categoria: "Casa", base: 899, termos: "cadeira gamer escritorio ergonomica",
    titulos: ["Cadeira Gamer Reclinável com Almofadas", "Cadeira de Escritório Ergonômica Mesh", "Cadeira Gamer com Apoio para os Pés"] },
  { emoji: "☕", categoria: "Casa e Cozinha", base: 229, termos: "cafeteira cafe expresso capsula",
    titulos: ["Cafeteira Elétrica 30 Xícaras", "Cafeteira Expresso 15 Bar", "Cafeteira de Cápsulas Compacta"] },
  { emoji: "🧱", categoria: "Brinquedos", base: 79, termos: "brinquedo blocos montar infantil crianca lego",
    titulos: ["Blocos de Montar 500 Peças", "Kit Blocos de Montar Cidade", "Brinquedo Educativo Montessori"] },
  { emoji: "🍳", categoria: "Casa e Cozinha", base: 199, termos: "panela jogo antiaderente cozinha frigideira",
    titulos: ["Jogo de Panelas Antiaderente 10 Peças", "Frigideira Antiaderente 28cm", "Panela de Pressão Elétrica 5L"] },
  { emoji: "📱", categoria: "Eletrônicos", base: 49, termos: "capinha celular case pelicula suporte",
    titulos: ["Capinha Anti-Impacto com Película", "Suporte Veicular Magnético para Celular", "Case Transparente com Proteção de Câmera"] },
];

const TODAS = ["shopee", "mercadolivre", "amazon", "aliexpress", "magalu"];

// Quanto cada loja costuma cobrar em relação ao preço base (só para o exemplo)
const FATOR = { shopee: 0.86, mercadolivre: 1, amazon: 1.03, aliexpress: 0.72, magalu: 1.06, shein: 0.78 };

function linkBusca(loja, titulo) {
  const t = encodeURIComponent(titulo);
  const slug = normalizar(titulo).replace(/ /g, "-");
  return {
    shopee: `https://shopee.com.br/search?keyword=${t}`,
    mercadolivre: `https://lista.mercadolivre.com.br/${slug}`,
    amazon: `https://www.amazon.com.br/s?k=${t}`,
    aliexpress: `https://pt.aliexpress.com/w/wholesale-${slug}.html`,
    magalu: `https://www.magazineluiza.com.br/busca/${t}/`,
    shein: `https://br.shein.com/pdsearch/${t}/`,
  }[loja];
}

// Gerador pseudoaleatório com semente: os mesmos produtos a cada busca
function sorteador(semente) {
  let h = 2166136261;
  for (const c of semente) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

const centavos = (v) => Math.floor(v) + 0.9;

function gerarCatalogo() {
  const ofertas = [];
  for (const tipo of TIPOS) {
    for (const loja of tipo.lojas || TODAS) {
      const r = sorteador(tipo.titulos[0] + loja);
      const qtd = 1 + Math.floor(r() * 2);
      const primeiro = Math.floor(r() * tipo.titulos.length);
      for (let i = 0; i < qtd; i++) {
        const titulo = tipo.titulos[(primeiro + i) % tipo.titulos.length];
        const preco = centavos(tipo.base * FATOR[loja] * (0.82 + r() * 0.36));
        const temDesconto = r() < 0.65;
        const desconto = temDesconto ? Math.round(10 + r() * 40) : null;
        ofertas.push({
          id: `ex-${loja}-${ofertas.length}`,
          loja,
          titulo,
          preco,
          precoAntigo: temDesconto ? centavos(preco / (1 - desconto / 100)) : null,
          desconto,
          imagem: null,
          emoji: tipo.emoji,
          categoria: tipo.categoria,
          avaliacao: Math.round((4 + r() * 0.9) * 10) / 10,
          vendidos: Math.round(r() ** 2 * 9000) + 12,
          freteGratis: r() < 0.55,
          link: linkBusca(loja, titulo),
          _busca: normalizar(`${titulo} ${tipo.termos} ${tipo.categoria}`),
        });
      }
    }
  }
  return ofertas;
}

const CATALOGO = gerarCatalogo();

const limpar = ({ _busca, ...oferta }) => oferta;

export const exemplo = {
  nome: "exemplo",
  exemplo: true,

  async buscar(q) {
    const termos = palavras(q);
    const pontuar = (o) => termos.filter((t) => o._busca.split(" ").some((p) => p.startsWith(t))).length;
    let achados = CATALOGO.map((o) => [pontuar(o), o]).filter(([p]) => p === termos.length);
    // Nenhum resultado com todas as palavras: aceita os que batem com alguma
    if (!achados.length) achados = CATALOGO.map((o) => [pontuar(o), o]).filter(([p]) => p > 0);
    return achados.sort((a, b) => b[0] - a[0] || b[1].vendidos - a[1].vendidos).map(([, o]) => limpar(o));
  },

  async destaques() {
    return CATALOGO.filter((o) => o.desconto >= 30)
      .sort((a, b) => b.desconto - a.desconto)
      .slice(0, 16)
      .map(limpar);
  },
};
