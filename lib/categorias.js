// =====================================================================
// CATEGORIAS — descobre o tipo de produto pelo nome
// ("Shorts Masculino Tactel Praia" -> "Moda masculina").
// Usado nos "em alta": em vez de repetir os produtos mais vendidos,
// mostra as categorias que estão vendendo mais.
//
// A ordem importa: a primeira categoria que combinar vence (por isso
// "brinquedo de gato" cai em Pets antes de Brinquedos).
// palavras = começo de palavra, sem acento ("calc" pega calça e calçado)
// chave = palavra juntada a uma busca feita dentro da categoria ("invictus" em Perfumes -> "invictus perfume");
// sem chave, busca só o que foi digitado ("capacete" em Automotivo)
// vitrine = o que aparece ao abrir a categoria: os produtos em alta no mercado (cada busca ordenada
// pelos mais vendidos da Shopee), sem acessórios, sem preço abaixo de precoMin e sem palavras de excluir
// =====================================================================
import { normalizar } from "./texto.js";

const CATEGORIAS = [
  { nome: "Pets", emoji: "🐶", busca: "pet", chave: "pet", palavras: ["pet", "cachorro", "gato", "racao", "coleira", "arranhador", "comedouro", "petisco"],
    vitrine: { buscas: ["cama pet", "arranhador gato", "fonte bebedouro gato", "coleira cachorro"] } },
  { nome: "Bebês", emoji: "🍼", busca: "bebê", chave: "bebê", palavras: ["bebe", "fralda", "mamadeira", "chupeta", "body infantil"],
    vitrine: { buscas: ["body bebê", "mordedor bebê", "babá eletrônica", "fralda pampers"] } },
  { nome: "Perfumes", emoji: "🌸", busca: "perfume", chave: "perfume", palavras: ["perfume", "colonia", "body splash", "parfum", "fragrancia", "eau de", "toilette"],
    vitrine: { buscas: ["lattafa", "perfume árabe", "body splash", "perfume importado"] } },
  { nome: "Maquiagem", emoji: "💄", busca: "maquiagem", chave: "maquiagem", palavras: ["maquiagem", "batom", "rimel", "delineador", "paleta de sombra", "po compacto", "corretivo", "pincel de maquiagem", "gloss"],
    vitrine: { buscas: ["gloss labial", "paleta de sombra", "base líquida", "ruby rose"] } },
  { nome: "Skincare", emoji: "🧴", busca: "skincare", palavras: ["serum", "hidratante", "protetor solar", "creme facial", "sabonete facial", "skincare", "acido hialuronico", "vitamina c"],
    vitrine: { buscas: ["sérum facial", "protetor solar facial", "hidratante facial", "principia"] } },
  { nome: "Cabelo", emoji: "💇", busca: "cabelo", chave: "cabelo", palavras: ["shampoo", "condicionador", "mascara capilar", "escova secadora", "chapinha", "prancha", "secador", "babyliss", "cabelo"],
    vitrine: { buscas: ["escova secadora", "chapinha", "máscara capilar", "óleo capilar"] } },
  { nome: "Fones de ouvido", emoji: "🎧", busca: "fone de ouvido", chave: "fone", palavras: ["fone", "headphone", "headset", "earbud", "airpod"],
    vitrine: { buscas: ["fone bluetooth", "jbl tune", "airpods", "qcy"] } },
  { nome: "Carregadores", emoji: "🔌", busca: "carregador", chave: "carregador", palavras: ["carregador", "power bank", "powerbank", "cabo usb", "cabo tipo c", "fonte usb"],
    vitrine: { buscas: ["carregador turbo", "power bank", "carregador iphone", "cabo usb c"] } },
  { nome: "Acessórios de celular", emoji: "📱", busca: "capinha celular", palavras: ["capinha", "capa celular", "capa para celular", "pelicula", "suporte celular", "suporte veicular", "anel celular"],
    vitrine: { buscas: ["capinha iphone", "película 3d", "suporte celular veicular", "capa magsafe"] } },
  { nome: "Smartwatches", emoji: "⌚", busca: "smartwatch", chave: "smartwatch", palavras: ["smartwatch", "relogio inteligente", "smartband", "smart watch", "watch", "mi band"],
    vitrine: { buscas: ["apple watch", "galaxy watch", "amazfit", "smart band"], precoMin: 150, excluir: ["pulseira", "capa", "pelicula"] } },
  { nome: "Relógios", emoji: "🕰️", busca: "relógio", chave: "relógio", palavras: ["relogio"],
    vitrine: { buscas: ["relógio masculino", "relógio feminino", "casio", "technos"] } },
  { nome: "Joias e bijuterias", emoji: "💍", busca: "bijuteria", palavras: ["colar", "brinco", "pulseira", "anel", "bijuteria", "pingente", "tornozeleira"],
    vitrine: { buscas: ["colar feminino", "brinco prata", "pulseira feminina", "anel prata 925"] } },
  { nome: "Óculos", emoji: "🕶️", busca: "óculos", chave: "óculos", palavras: ["oculos"],
    vitrine: { buscas: ["óculos de sol", "óculos juliet", "óculos polarizado", "ray ban"] } },
  { nome: "Calçados", emoji: "👟", busca: "tênis", palavras: ["tenis", "calcado", "sandalia", "chinelo", "sapato", "bota", "rasteirinha", "sapatenis", "crocs", "papete"],
    vitrine: { buscas: ["tênis nike", "tênis adidas", "crocs", "tênis new balance"] } },
  { nome: "Bolsas e mochilas", emoji: "👜", busca: "bolsa", chave: "bolsa", palavras: ["bolsa", "mochila", "carteira", "necessaire", "mala de viagem", "pochete"],
    vitrine: { buscas: ["bolsa feminina", "mochila notebook", "bolsa transversal", "necessaire"] } },
  { nome: "Moda íntima", emoji: "🩲", busca: "moda íntima", palavras: ["cueca", "calcinha", "sutia", "lingerie", "pijama", "meia"],
    vitrine: { buscas: ["cueca boxer", "calcinha", "sutiã", "pijama feminino"] } },
  { nome: "Moda fitness", emoji: "🧘", busca: "roupa academia", chave: "fitness", palavras: ["legging", "top fitness", "conjunto fitness", "roupa academia", "short academia"],
    vitrine: { buscas: ["conjunto fitness", "legging", "top fitness", "short academia"] } },
  // Roupas antes de "Esporte": "Shorts Masculino … Academia" é roupa, não equipamento.
  // Não existe "Roupas" genérico: na Shopee a busca "roupas" traz guarda-roupas e cabides
  { nome: "Moda masculina", emoji: "👕", busca: "roupa masculina", chave: "masculina", roupa: "masculin",
    vitrine: { buscas: ["camiseta oversized", "bermuda masculina", "camisa polo", "calça cargo masculina"] } },
  { nome: "Moda feminina", emoji: "👗", busca: "roupa feminina", chave: "feminina", roupa: "feminin",
    vitrine: { buscas: ["vestido", "cropped", "conjunto feminino", "calça wide leg"] } },
  { nome: "Eletroportáteis", emoji: "🍟", busca: "eletroportáteis", palavras: ["air fryer", "airfryer", "fritadeira", "liquidificador", "espremedor", "mixer", "cafeteira", "sanduicheira", "panela eletrica", "batedeira", "processador de alimentos", "chaleira eletrica", "grill"],
    vitrine: { buscas: ["air fryer", "liquidificador", "cafeteira", "mixer"], precoMin: 80 } },
  { nome: "Mesa posta", emoji: "🍽️", busca: "sousplat", palavras: ["sousplat", "jogo americano", "toalha de mesa", "guardanapo", "porta guardanapo", "caminho de mesa"],
    vitrine: { buscas: ["sousplat", "jogo americano", "porta guardanapo", "toalha de mesa"] } },
  { nome: "Móveis", emoji: "🛋️", busca: "móveis", palavras: ["guarda roupa", "guarda-roupa", "roupeiro", "armario", "comoda", "rack", "estante", "sofa", "colchao", "escrivaninha", "penteadeira", "cabideiro", "cadeira", "poltrona", "criado mudo", "mesa de jantar", "mesa de centro"],
    vitrine: { buscas: ["guarda roupa", "rack para tv", "sofá", "escrivaninha"], precoMin: 100 } },
  { nome: "Cozinha", emoji: "🍳", busca: "utensílios de cozinha", palavras: ["panela", "frigideira", "faqueiro", "talher", "pote", "garrafa", "copo", "xicara", "caneca", "utensilio", "tabua", "escorredor", "forma de bolo"],
    vitrine: { buscas: ["stanley", "jogo de panelas", "pote hermético", "garrafa térmica"] } },
  { nome: "Cama e banho", emoji: "🛏️", busca: "cama e banho", palavras: ["lencol", "edredom", "travesseiro", "toalha de banho", "roupao", "cobertor", "manta", "jogo de cama", "colcha"],
    vitrine: { buscas: ["jogo de cama", "edredom", "toalha de banho", "travesseiro"] } },
  { nome: "Decoração", emoji: "🪴", busca: "decoração", palavras: ["espelho", "quadro", "vaso", "luminaria", "abajur", "enfeite", "natal", "natalino", "decoracao", "tapete", "cortina", "almofada", "vela aromatica"],
    vitrine: { buscas: ["luminária", "espelho", "quadro decorativo", "vaso decorativo"] } },
  { nome: "Organização", emoji: "🗂️", busca: "organizador", palavras: ["organizador", "caixa organizadora", "cabide", "prateleira", "sapateira", "porta tempero"],
    vitrine: { buscas: ["caixa organizadora", "sapateira", "organizador de gaveta", "prateleira"] } },
  { nome: "Limpeza", emoji: "🧹", busca: "limpeza", palavras: ["mop", "vassoura", "aspirador", "rodo", "limpeza", "pano de chao"],
    vitrine: { buscas: ["robô aspirador", "mop giratório", "aspirador de pó", "vassoura mágica"] } },
  { nome: "Brinquedos", emoji: "🧸", busca: "brinquedo", chave: "brinquedo", palavras: ["brinquedo", "boneca", "boneco", "carrinho de controle", "lego", "pelucia", "slime", "quebra cabeca", "massinha", "fidget", "educativo", "laptop infantil"],
    vitrine: { buscas: ["lego", "boneca", "carrinho de controle remoto", "pelúcia"] } },
  { nome: "Informática", emoji: "💻", busca: "informática", palavras: ["mouse", "teclado", "notebook", "webcam", "pendrive", "pen drive", "ssd", "monitor", "hub usb"],
    vitrine: { buscas: ["notebook lenovo", "mouse gamer", "teclado mecânico", "monitor gamer"],
      excluir: ["infantil", "educativo", "brinquedo", "pressao", "bebe", "kids"] } },
  { nome: "Games", emoji: "🎮", busca: "games", palavras: ["controle", "joystick", "ps5", "ps4", "xbox", "nintendo", "gamer"],
    vitrine: { buscas: ["ps5", "nintendo switch", "controle xbox", "xbox series"] } },
  { nome: "Caixas de som", emoji: "🔊", busca: "caixa de som", palavras: ["caixa de som", "speaker", "soundbar"],
    vitrine: { buscas: ["caixa de som jbl", "caixa de som bluetooth", "soundbar", "partybox"] } },
  { nome: "Iluminação LED", emoji: "💡", busca: "led", chave: "led", palavras: ["fita led", "lampada", "led", "refletor"],
    vitrine: { buscas: ["fita led", "luminária led", "lâmpada inteligente", "refletor led"] } },
  { nome: "Esporte e fitness", emoji: "🏋️", busca: "academia", palavras: ["academia", "treino", "halter", "yoga", "elastico extensor", "corda de pular", "bicicleta", "corrida"],
    vitrine: { buscas: ["halter", "elástico extensor", "corda de pular", "tapete yoga"] } },
  { nome: "Suplementos", emoji: "💪", busca: "suplemento", chave: "suplemento", palavras: ["whey", "creatina", "suplemento", "colageno", "pre treino"],
    vitrine: { buscas: ["creatina", "whey protein", "pré treino", "colágeno"] } },
  { nome: "Ferramentas", emoji: "🛠️", busca: "ferramentas", palavras: ["ferramenta", "furadeira", "parafusadeira", "alicate", "trena", "jogo de chave", "maleta de ferramenta"],
    vitrine: { buscas: ["parafusadeira", "furadeira", "jogo de ferramentas", "lavadora de alta pressão"] } },
  // Celulares antes de Automotivo: "Motorola Moto G85" não é moto
  // A busca "celular" sozinha traz celular de botão para idoso
  { nome: "Celulares", emoji: "📲", busca: "celular", chave: "celular", palavras: ["celular", "smartphone", "iphone", "galaxy", "redmi", "motorola"],
    vitrine: { buscas: ["iphone", "samsung galaxy", "xiaomi", "motorola"], precoMin: 500, excluir: ["idoso", "botao", "flip", "infantil", "brinquedo", "patinete"] } },
  { nome: "Automotivo", emoji: "🚗", busca: "acessórios para carro", palavras: ["carro", "automotivo", "moto", "capacete", "volante"],
    vitrine: { buscas: ["central multimídia", "capacete", "câmera de ré", "som automotivo"] } },
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

// Busca dentro de uma categoria: além do que foi digitado, pesquisa também com a chave da categoria
// ("invictus" em Perfumes -> "invictus perfume"). Sem chave ou se a busca já tem a chave: nada a mais.
export function termoNaCategoria(q, categoria) {
  if (!categoria.chave) return null;
  const termo = normalizar(q);
  const chave = normalizar(categoria.chave);
  return termo.split(" ").includes(chave) || chave.startsWith(termo) ? null : `${q} ${categoria.chave}`;
}

// Tira o que é claramente de outra categoria ("Bolso Modular Invictus" em Perfumes)
export function daCategoria(ofertas, categoria) {
  const dela = ofertas.filter((o) => {
    const c = categoriaDoProduto(o.titulo || "");
    return !c || c === categoria;
  });
  return dela.length ? dela : ofertas;
}

// Busca na categoria: só o que não é de outra categoria; primeiro o que é dela com certeza,
// depois o que não deu para classificar, acessórios no fim (a ordem de relevância continua em cada grupo)
export function ordenarNaCategoria(ofertas, categoria) {
  const grupo = (o) => (o.acessorio ? 2 : categoriaDoProduto(o.titulo || "") === categoria ? 0 : 1);
  return ofertas
    .filter((o) => { const c = categoriaDoProduto(o.titulo || ""); return !c || c === categoria; })
    .map((o, i) => ({ o, i, g: grupo(o) }))
    .sort((a, b) => a.g - b.g || a.i - b.i)
    .map((x) => x.o);
}

// Vitrine da categoria: o visitante só abriu a categoria (não buscou nada dentro dela)
export function vitrineDaCategoria(q, categoria) {
  return categoria?.vitrine && normalizar(q) === normalizar(categoria.busca) ? categoria.vitrine : null;
}

// Uma lista por busca da vitrine -> produtos da categoria, sem acessórios, baratos demais ou palavras
// excluídas, intercalando as buscas (iPhone, Galaxy, Xiaomi, Motorola, iPhone…) e sem repetir
export function montarVitrine(listas, vitrine, categoria) {
  const limpas = listas.map((lista) => daCategoria(lista, categoria).filter((o) => !o.acessorio && o.bate
    && o.preco >= (vitrine.precoMin || 0)
    && !(vitrine.excluir || []).some((p) => temPalavra(normalizar(o.titulo || ""), p))));
  const vistos = new Set();
  const saida = [];
  for (let i = 0; i < Math.max(0, ...limpas.map((l) => l.length)); i++) {
    for (const lista of limpas) {
      const o = lista[i];
      if (o && !vistos.has(o.id)) { vistos.add(o.id); saida.push(o); }
    }
  }
  return saida;
}
