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
  { nome: "Pets", busca: "pet", palavras: ["pet", "cachorro", "gato", "racao", "coleira", "arranhador", "comedouro", "petisco"] },
  { nome: "Bebês", busca: "bebê", palavras: ["bebe", "fralda", "mamadeira", "chupeta", "body infantil"] },
  { nome: "Perfumes", busca: "perfume", palavras: ["perfume", "colonia", "body splash", "parfum", "fragrancia"] },
  { nome: "Maquiagem", busca: "maquiagem", palavras: ["maquiagem", "batom", "rimel", "delineador", "paleta de sombra", "po compacto", "corretivo", "pincel de maquiagem", "gloss"] },
  { nome: "Skincare", busca: "skincare", palavras: ["serum", "hidratante", "protetor solar", "creme facial", "sabonete facial", "skincare", "acido hialuronico", "vitamina c"] },
  { nome: "Cabelo", busca: "cabelo", palavras: ["shampoo", "condicionador", "mascara capilar", "escova secadora", "chapinha", "prancha", "secador", "babyliss", "cabelo"] },
  { nome: "Fones de ouvido", busca: "fone de ouvido", palavras: ["fone", "headphone", "headset", "earbud", "airpod"] },
  { nome: "Carregadores", busca: "carregador", palavras: ["carregador", "power bank", "powerbank", "cabo usb", "cabo tipo c", "fonte usb"] },
  { nome: "Acessórios de celular", busca: "capinha celular", palavras: ["capinha", "capa celular", "capa para celular", "pelicula", "suporte celular", "suporte veicular", "anel celular"] },
  { nome: "Smartwatches", busca: "smartwatch", palavras: ["smartwatch", "relogio inteligente", "smartband", "smart watch"] },
  { nome: "Relógios", busca: "relógio", palavras: ["relogio"] },
  { nome: "Joias e bijuterias", busca: "bijuteria", palavras: ["colar", "brinco", "pulseira", "anel", "bijuteria", "pingente", "tornozeleira"] },
  { nome: "Óculos", busca: "óculos", palavras: ["oculos"] },
  { nome: "Calçados", busca: "tênis", palavras: ["tenis", "calcado", "sandalia", "chinelo", "sapato", "bota", "rasteirinha", "sapatenis", "crocs", "papete"] },
  { nome: "Bolsas e mochilas", busca: "bolsa", palavras: ["bolsa", "mochila", "carteira", "necessaire", "mala de viagem", "pochete"] },
  { nome: "Moda íntima", busca: "moda íntima", palavras: ["cueca", "calcinha", "sutia", "lingerie", "pijama", "meia"] },
  { nome: "Moda fitness", busca: "roupa academia", palavras: ["legging", "top fitness", "conjunto fitness", "roupa academia", "short academia"] },
  // Roupas antes de "Esporte": "Shorts Masculino … Academia" é roupa, não equipamento
  { nome: "Moda masculina", busca: "roupa masculina", roupa: "masculin" },
  { nome: "Moda feminina", busca: "roupa feminina", roupa: "feminin" },
  { nome: "Roupas", busca: "roupas", roupa: "" },
  { nome: "Eletroportáteis", busca: "eletroportáteis", palavras: ["air fryer", "airfryer", "fritadeira", "liquidificador", "espremedor", "mixer", "cafeteira", "sanduicheira", "panela eletrica", "batedeira", "processador de alimentos", "chaleira eletrica", "grill"] },
  { nome: "Mesa posta", busca: "sousplat", palavras: ["sousplat", "jogo americano", "toalha de mesa", "guardanapo", "porta guardanapo", "caminho de mesa"] },
  { nome: "Cozinha", busca: "utensílios de cozinha", palavras: ["panela", "frigideira", "faqueiro", "talher", "pote", "garrafa", "copo", "xicara", "caneca", "utensilio", "tabua", "escorredor", "forma de bolo"] },
  { nome: "Cama e banho", busca: "cama e banho", palavras: ["lencol", "edredom", "travesseiro", "toalha de banho", "roupao", "cobertor", "manta", "jogo de cama", "colcha"] },
  { nome: "Decoração", busca: "decoração", palavras: ["espelho", "quadro", "vaso", "luminaria", "abajur", "enfeite", "natal", "natalino", "decoracao", "tapete", "cortina", "almofada", "vela aromatica"] },
  { nome: "Organização", busca: "organizador", palavras: ["organizador", "caixa organizadora", "cabide", "prateleira", "sapateira", "porta tempero"] },
  { nome: "Limpeza", busca: "limpeza", palavras: ["mop", "vassoura", "aspirador", "rodo", "limpeza", "pano de chao"] },
  { nome: "Brinquedos", busca: "brinquedo", palavras: ["brinquedo", "boneca", "boneco", "carrinho de controle", "lego", "pelucia", "slime", "quebra cabeca", "massinha", "fidget"] },
  { nome: "Informática", busca: "informática", palavras: ["mouse", "teclado", "notebook", "webcam", "pendrive", "pen drive", "ssd", "monitor", "hub usb"] },
  { nome: "Games", busca: "games", palavras: ["controle", "joystick", "ps5", "ps4", "xbox", "nintendo", "gamer"] },
  { nome: "Caixas de som", busca: "caixa de som", palavras: ["caixa de som", "speaker", "soundbar"] },
  { nome: "Iluminação LED", busca: "led", palavras: ["fita led", "lampada", "led", "refletor"] },
  { nome: "Esporte e fitness", busca: "academia", palavras: ["academia", "treino", "halter", "yoga", "elastico extensor", "corda de pular", "bicicleta", "corrida"] },
  { nome: "Suplementos", busca: "suplemento", palavras: ["whey", "creatina", "suplemento", "colageno", "pre treino"] },
  { nome: "Ferramentas", busca: "ferramentas", palavras: ["ferramenta", "furadeira", "parafusadeira", "alicate", "trena", "jogo de chave", "maleta de ferramenta"] },
  { nome: "Automotivo", busca: "acessórios para carro", palavras: ["carro", "automotivo", "moto", "capacete", "volante"] },
  { nome: "Celulares", busca: "celular", palavras: ["celular", "smartphone", "iphone", "galaxy", "redmi"] },
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

// Produtos mais vendidos -> categorias que mais aparecem entre eles
export function categoriasEmAlta(produtos, quantidade = 8) {
  const placar = new Map();
  produtos.forEach((p, posicao) => {
    const c = categoriaDoProduto(p.nome);
    if (!c) return;
    const atual = placar.get(c.nome) || { nome: c.nome, busca: c.busca, pontos: 0 };
    // Quanto mais no topo da lista de mais vendidos, mais pontos
    atual.pontos += 1 + (produtos.length - posicao) / produtos.length;
    placar.set(c.nome, atual);
  });
  return [...placar.values()].sort((a, b) => b.pontos - a.pontos).slice(0, quantidade)
    .map(({ nome, busca }) => ({ nome, busca }));
}
