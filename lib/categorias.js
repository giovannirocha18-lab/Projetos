// =====================================================================
// CATEGORIAS — descobre o tipo de produto pelo nome
// ("Shorts Masculino Tactel Praia" -> "Moda masculina").
// Usado nos "em alta": em vez de repetir os produtos mais vendidos,
// mostra as categorias que estão vendendo mais.
//
// A ordem importa: a primeira categoria que combinar vence (por isso
// "brinquedo de gato" cai em Pets antes de Brinquedos).
// palavras = começo de palavra, sem acento ("calc" pega calça e calçado)
// =====================================================================
import { normalizar } from "./texto.js";

const CATEGORIAS = [
  { nome: "Pets", emoji: "🐶", busca: "pet", palavras: ["pet", "cachorro", "gato", "racao", "coleira", "arranhador", "comedouro", "petisco"] },
  { nome: "Bebês", emoji: "🍼", busca: "bebê", palavras: ["bebe", "fralda", "mamadeira", "chupeta", "body infantil"] },
  { nome: "Perfumes", emoji: "🌸", busca: "perfume", palavras: ["perfume", "colonia", "body splash", "parfum", "fragrancia"] },
  { nome: "Maquiagem", emoji: "💄", busca: "maquiagem", palavras: ["maquiagem", "batom", "rimel", "delineador", "paleta de sombra", "po compacto", "corretivo", "pincel de maquiagem", "gloss"] },
  { nome: "Skincare", emoji: "🧴", busca: "skincare", palavras: ["serum", "hidratante", "protetor solar", "creme facial", "sabonete facial", "skincare", "acido hialuronico", "vitamina c"] },
  { nome: "Cabelo", emoji: "💇", busca: "cabelo", palavras: ["shampoo", "condicionador", "mascara capilar", "escova secadora", "chapinha", "prancha", "secador", "babyliss", "cabelo"] },
  { nome: "Fones de ouvido", emoji: "🎧", busca: "fone de ouvido", palavras: ["fone", "headphone", "headset", "earbud", "airpod"] },
  { nome: "Carregadores", emoji: "🔌", busca: "carregador", palavras: ["carregador", "power bank", "powerbank", "cabo usb", "cabo tipo c", "fonte usb"] },
  { nome: "Acessórios de celular", emoji: "📱", busca: "capinha celular", palavras: ["capinha", "capa celular", "capa para celular", "pelicula", "suporte celular", "suporte veicular", "anel celular"] },
  { nome: "Smartwatches", emoji: "⌚", busca: "smartwatch", palavras: ["smartwatch", "relogio inteligente", "smartband", "smart watch"] },
  { nome: "Relógios", emoji: "🕰️", busca: "relógio", palavras: ["relogio"] },
  { nome: "Joias e bijuterias", emoji: "💍", busca: "bijuteria", palavras: ["colar", "brinco", "pulseira", "anel", "bijuteria", "pingente", "tornozeleira"] },
  { nome: "Óculos", emoji: "🕶️", busca: "óculos", palavras: ["oculos"] },
  { nome: "Calçados", emoji: "👟", busca: "tênis", palavras: ["tenis", "calcado", "sandalia", "chinelo", "sapato", "bota", "rasteirinha", "sapatenis", "crocs", "papete"] },
  { nome: "Bolsas e mochilas", emoji: "👜", busca: "bolsa", palavras: ["bolsa", "mochila", "carteira", "necessaire", "mala de viagem", "pochete"] },
  { nome: "Moda íntima", emoji: "🩲", busca: "moda íntima", palavras: ["cueca", "calcinha", "sutia", "lingerie", "pijama", "meia"] },
  { nome: "Moda fitness", emoji: "🧘", busca: "roupa academia", palavras: ["legging", "top fitness", "conjunto fitness", "roupa academia", "short academia"] },
  // Roupas antes de "Esporte": "Shorts Masculino … Academia" é roupa, não equipamento.
  // Não existe "Roupas" genérico: na Shopee a busca "roupas" traz guarda-roupas e cabides
  { nome: "Moda masculina", emoji: "👕", busca: "roupa masculina", roupa: "masculin" },
  { nome: "Moda feminina", emoji: "👗", busca: "roupa feminina", roupa: "feminin" },
  { nome: "Eletroportáteis", emoji: "🍟", busca: "eletroportáteis", palavras: ["air fryer", "airfryer", "fritadeira", "liquidificador", "espremedor", "mixer", "cafeteira", "sanduicheira", "panela eletrica", "batedeira", "processador de alimentos", "chaleira eletrica", "grill"] },
  { nome: "Mesa posta", emoji: "🍽️", busca: "sousplat", palavras: ["sousplat", "jogo americano", "toalha de mesa", "guardanapo", "porta guardanapo", "caminho de mesa"] },
  { nome: "Móveis", emoji: "🛋️", busca: "móveis", palavras: ["guarda roupa", "guarda-roupa", "roupeiro", "armario", "comoda", "rack", "estante", "sofa", "colchao", "escrivaninha", "penteadeira", "cabideiro", "cadeira", "poltrona", "criado mudo", "mesa de jantar", "mesa de centro"] },
  { nome: "Cozinha", emoji: "🍳", busca: "utensílios de cozinha", palavras: ["panela", "frigideira", "faqueiro", "talher", "pote", "garrafa", "copo", "xicara", "caneca", "utensilio", "tabua", "escorredor", "forma de bolo"] },
  { nome: "Cama e banho", emoji: "🛏️", busca: "cama e banho", palavras: ["lencol", "edredom", "travesseiro", "toalha de banho", "roupao", "cobertor", "manta", "jogo de cama", "colcha"] },
  { nome: "Decoração", emoji: "🪴", busca: "decoração", palavras: ["espelho", "quadro", "vaso", "luminaria", "abajur", "enfeite", "natal", "natalino", "decoracao", "tapete", "cortina", "almofada", "vela aromatica"] },
  { nome: "Organização", emoji: "🗂️", busca: "organizador", palavras: ["organizador", "caixa organizadora", "cabide", "prateleira", "sapateira", "porta tempero"] },
  { nome: "Limpeza", emoji: "🧹", busca: "limpeza", palavras: ["mop", "vassoura", "aspirador", "rodo", "limpeza", "pano de chao"] },
  { nome: "Brinquedos", emoji: "🧸", busca: "brinquedo", palavras: ["brinquedo", "boneca", "boneco", "carrinho de controle", "lego", "pelucia", "slime", "quebra cabeca", "massinha", "fidget"] },
  { nome: "Informática", emoji: "💻", busca: "informática", palavras: ["mouse", "teclado", "notebook", "webcam", "pendrive", "pen drive", "ssd", "monitor", "hub usb"] },
  { nome: "Games", emoji: "🎮", busca: "games", palavras: ["controle", "joystick", "ps5", "ps4", "xbox", "nintendo", "gamer"] },
  { nome: "Caixas de som", emoji: "🔊", busca: "caixa de som", palavras: ["caixa de som", "speaker", "soundbar"] },
  { nome: "Iluminação LED", emoji: "💡", busca: "led", palavras: ["fita led", "lampada", "led", "refletor"] },
  { nome: "Esporte e fitness", emoji: "🏋️", busca: "academia", palavras: ["academia", "treino", "halter", "yoga", "elastico extensor", "corda de pular", "bicicleta", "corrida"] },
  { nome: "Suplementos", emoji: "💪", busca: "suplemento", palavras: ["whey", "creatina", "suplemento", "colageno", "pre treino"] },
  { nome: "Ferramentas", emoji: "🛠️", busca: "ferramentas", palavras: ["ferramenta", "furadeira", "parafusadeira", "alicate", "trena", "jogo de chave", "maleta de ferramenta"] },
  { nome: "Automotivo", emoji: "🚗", busca: "acessórios para carro", palavras: ["carro", "automotivo", "moto", "capacete", "volante"] },
  { nome: "Celulares", emoji: "📲", busca: "celular", palavras: ["celular", "smartphone", "iphone", "galaxy", "redmi"] },
];

const ROUPAS = ["camiseta", "camisa", "blusa", "moletom", "jaqueta", "casaco", "shorts", "short", "bermuda", "calca",
  "vestido", "saia", "cropped", "macacao", "regata", "polo", "jeans", "body", "kimono", "blazer", "colete"];

// Palavras curtas precisam bater inteiras (ou no plural): "bota" não pode pegar "botão"
const temPalavra = (texto, palavra) => (palavra.length <= 4
  ? ` ${texto} `.includes(` ${palavra} `) || ` ${texto} `.includes(` ${palavra}s `)
  : ` ${texto}`.includes(` ${palavra}`));

export function categoriaDoProduto(nome) {
  const texto = normalizar(nome);
  for (const c of CATEGORIAS) {
    if (c.palavras && c.palavras.some((p) => temPalavra(texto, p))) return c;
    if (c.roupa !== undefined && ROUPAS.some((p) => temPalavra(texto, p))
      && (!c.roupa || temPalavra(texto, c.roupa))) return c;
  }
  return null;
}

// Produtos mais vendidos -> pontos de cada categoria (mais no topo da lista = mais pontos)
function pontuar(produtos) {
  const pontos = new Map();
  produtos.forEach((p, posicao) => {
    const c = categoriaDoProduto(p.nome);
    if (c) pontos.set(c, (pontos.get(c) || 0) + 1 + (produtos.length - posicao) / produtos.length);
  });
  return pontos;
}

// As categorias que mais aparecem entre os mais vendidos (atalhos "em alta")
export function categoriasEmAlta(produtos, quantidade = 8) {
  const pontos = pontuar(produtos);
  return [...pontos.keys()].sort((a, b) => pontos.get(b) - pontos.get(a)).slice(0, quantidade)
    .map(({ nome, busca }) => ({ nome, busca }));
}

// Todas as categorias, as que mais vendem agora primeiro (menu da barra lateral)
export function todasCategorias(produtos) {
  const pontos = pontuar(produtos);
  return [...CATEGORIAS].sort((a, b) => (pontos.get(b) || 0) - (pontos.get(a) || 0))
    .map(({ nome, emoji, busca }) => ({ nome, emoji, busca }));
}

// Categoria escolhida no menu (pelo nome que aparece, ex.: "Perfumes")
export function categoriaPorNome(nome) {
  const n = normalizar(nome || "");
  return n ? CATEGORIAS.find((c) => normalizar(c.nome) === n) || null : null;
}

// Busca dentro de uma categoria: "invictus" em Perfumes -> pesquisa "invictus perfume"
// e tira os produtos que claramente são de outra categoria ("Bolso Modular Invictus").
export function termoNaCategoria(q, categoria) {
  const termo = normalizar(q);
  const busca = normalizar(categoria.busca);
  return termo.includes(busca) || busca.includes(termo) ? q : `${q} ${categoria.busca}`;
}

export function daCategoria(ofertas, categoria) {
  const dela = ofertas.filter((o) => {
    const c = categoriaDoProduto(o.titulo || "");
    return !c || c === categoria;
  });
  return dela.length ? dela : ofertas;
}
