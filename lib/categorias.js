// =====================================================================
// CATEGORIAS — descobre o tipo de produto pelo nome
// ("Shorts Masculino Tactel Praia" -> "Moda masculina").
// Usado nos "em alta": em vez de repetir os produtos mais vendidos,
// mostra as categorias que estão vendendo mais.
//
// A ordem importa: a primeira categoria que combinar vence (por isso
// "brinquedo de gato" cai em Pets antes de Brinquedos).
// palavras = começo de palavra, sem acento ("calc" pega calça e calçado); "de/do/da…" no meio são opcionais
// ("caixa de som" também pega "Caixa Som JBL")
// nao = palavras que tiram o produto da categoria ("Pijama Feminino Gato" não é Pets)
// inicio = as palavras só valem nas N primeiras palavras do título ("Parafusadeira … Carregador" não é Carregadores)
// chave = palavra juntada a uma busca feita dentro da categoria ("invictus" em Perfumes -> "invictus perfume");
// sem chave, busca só o que foi digitado ("capacete" em Automotivo)
// vitrine = o que aparece ao abrir a categoria: os produtos em alta no mercado (cada busca ordenada
// pelos mais vendidos da Shopee), sem acessórios, sem preço abaixo de precoMin e sem palavras de excluir
// =====================================================================
import { normalizar } from "./texto.js";
import { categoriaDoCaminho, padraoDaLoja } from "./caminhos.js";

// Marcas e modelos de carro: "Comando Ar Condicionado Ford Fiesta", "Blower Ar Condicionado Sandero" são peça de carro,
// não eletrodoméstico (print do Giovanni, 17/10/2026). Só nomes que não confundem ("polo", "gol", "uno" ficam de fora daqui)
const CARROS = ["volkswagen", "chevrolet", "renault", "toyota", "hyundai", "peugeot", "citroen", "nissan", "mitsubishi", "fiat",
  "ford", "jeep", "lexus", "fiesta", "sandero", "onix", "hb20", "corolla", "saveiro", "strada", "kombi", "logan", "duster",
  "clio", "palio", "celta", "corsa", "civic", "virtus", "trator", "caminhao", "motorhome", "caravana"];

const RE_CARROS = new RegExp(`(^| )(${CARROS.join("|")}|automotivo|automotiva|veicular)( |$)`);
// Peça ou versão de carro, pelo título: "Ar Condicionado Volkswagen Polo … Comando", "Geladeira … 12v Caminhão"
export const ehDeCarro = (titulo) => RE_CARROS.test(normalizar(titulo)) || categoriaDoProduto(titulo)?.nome === "Automotivo";

const CATEGORIAS = [
  { nome: "Pets", emoji: "🐶", busca: "pet", chave: "pet", palavras: ["pet", "cachorro", "gato", "racao", "coleira", "arranhador", "comedouro", "petisco"],
    // "gato"/"cachorro" estampados em roupa e caneca de gente
    // "Máquina de Cachorro Quente", "Garrafa Pet", "Pote Hermético Cozinha … ração", "Perfume Gato Preto"
    nao: ["pijama", "camiseta", "camisa", "blusa", "moletom", "caneca", "pantufa", "chinelo", "meia", "estampa", "estampado", "estampada",
      "cachorro quente", "hot dog", "garrafa pet", "garrafas pet", "cozinha", "mantimentos", "perfume", "chaveiro", "chaveiros"],
    vitrine: { buscas: ["cama pet", "arranhador gato", "fonte bebedouro gato", "coleira cachorro"] } },
  { nome: "Bebês", emoji: "🍼", busca: "bebê", chave: "bebê", palavras: ["bebe", "fralda", "mamadeira", "chupeta", "body infantil", "baba eletronica"],
    vitrine: { buscas: ["body bebê", "mordedor bebê", "babá eletrônica", "fralda pampers"] } },
  { nome: "Perfumes", emoji: "🌸", busca: "perfume", chave: "perfume", palavras: ["perfume", "colonia", "body splash", "parfum", "fragrancia", "eau de", "toilette"],
    vitrine: { buscas: ["lattafa", "perfume árabe", "body splash", "perfume importado"] } },
  // Suplementos antes de Skincare, Cozinha e Esporte: "Whey … Pote", "Colágeno … Vitamina C", "Pré Treino"
  { nome: "Suplementos", emoji: "💪", busca: "suplemento", chave: "suplemento", palavras: ["whey", "creatina", "suplemento", "colageno", "pre treino"],
    nao: ["creme", "serum", "facial", "hidratante", "shampoo", "condicionador", "mascara", "sabonete", "locao", "capilar"],
    vitrine: { buscas: ["creatina", "whey protein", "pré treino", "colágeno"] } },
  { nome: "Maquiagem", emoji: "💄", busca: "maquiagem", chave: "maquiagem", palavras: ["maquiagem", "batom", "rimel", "delineador", "paleta de sombra", "po compacto", "corretivo", "pincel de maquiagem", "gloss"],
    nao: ["postural", "coluna"],
    vitrine: { buscas: ["gloss labial", "paleta de sombra", "base líquida", "ruby rose"] } },
  { nome: "Skincare", emoji: "🧴", busca: "skincare", palavras: ["serum", "hidratante", "protetor solar", "creme facial", "sabonete facial", "skincare", "acido hialuronico", "vitamina c"],
    vitrine: { buscas: ["sérum facial", "protetor solar facial", "hidratante facial", "principia"] } },
  { nome: "Cabelo", emoji: "💇", busca: "cabelo", chave: "cabelo", palavras: ["shampoo", "condicionador", "mascara capilar", "escova secadora", "chapinha", "prancha", "secador", "babyliss", "cabelo"],
    nao: ["roupa", "roupas", "lava e seca"], // "Secadora de Roupas" é eletrodoméstico
    vitrine: { buscas: ["escova secadora", "chapinha", "máscara capilar", "óleo capilar"] } },
  { nome: "Fones de ouvido", emoji: "🎧", busca: "fone de ouvido", chave: "fone", palavras: ["fone", "headphone", "headset", "earbud", "airpod"],
    vitrine: { buscas: ["fone bluetooth", "jbl tune", "airpods", "qcy"] } },
  // Só no começo do título: "Smartwatch … com Carregador" e "Parafusadeira … Carregador" não são carregadores
  { nome: "Carregadores", emoji: "🔌", busca: "carregador", chave: "carregador", inicio: 3, palavras: ["carregador", "power bank", "powerbank", "bateria externa", "cabo usb", "cabo tipo c", "fonte usb"],
    vitrine: { buscas: ["carregador turbo", "power bank", "carregador iphone", "cabo usb c"] } },
  // Só no começo: "Xiaomi Redmi Note 13 … Película Capinha" é celular (com brinde)
  { nome: "Acessórios de celular", emoji: "📱", busca: "capinha celular", inicio: 2, palavras: ["capinha", "capa celular", "capa para celular", "capa magsafe", "capa iphone", "capa samsung", "capa galaxy", "capa xiaomi", "capa redmi", "capa motorola", "pelicula", "suporte celular", "suporte veicular", "anel celular"],
    vitrine: { buscas: ["capinha iphone", "película 3d", "suporte celular veicular", "capa magsafe"] } },
  // Relógios antes de Smartwatches: "Relógio Masculino Casio Watch" é relógio; "Relógio Inteligente" não
  { nome: "Relógios", emoji: "🕰️", busca: "relógio", chave: "relógio", palavras: ["relogio"],
    nao: ["inteligente", "smart", "bluetooth", "amazfit", "apple watch", "galaxy watch", "mi band"],
    vitrine: { buscas: ["relógio masculino", "relógio feminino", "casio", "technos"] } },
  { nome: "Smartwatches", emoji: "⌚", busca: "smartwatch", chave: "smartwatch", palavras: ["smartwatch", "relogio inteligente", "smartband", "smart watch", "smart band", "watch", "mi band", "amazfit"],
    vitrine: { buscas: ["smartwatch", "apple watch", "galaxy watch", "amazfit", "xiaomi smart band"], precoMin: 80, excluir: ["pulseira", "capa", "pelicula", "carregador", "case"] } },
  { nome: "Joias e bijuterias", emoji: "💍", busca: "bijuteria", palavras: ["colar", "brinco", "pulseira", "anel", "bijuteria", "pingente", "tornozeleira"],
    vitrine: { buscas: ["colar feminino", "brinco prata", "pulseira feminina", "anel prata 925"] } },
  { nome: "Óculos", emoji: "🕶️", busca: "óculos", chave: "óculos", palavras: ["oculos"],
    vitrine: { buscas: ["óculos de sol", "óculos juliet", "óculos polarizado", "ray ban"] } },
  // Sem esta categoria, a Shopee ensinava "boné = Óculos" (a categoria dela junta os dois) (21/10/2026)
  { nome: "Bonés e chapéus", emoji: "🧢", busca: "boné", chave: "boné", palavras: ["bone", "chapeu", "bucket", "touca", "gorro", "balaclava"],
    nao: ["bone conduction", "osso"],
    vitrine: { buscas: ["boné", "boné trucker", "chapéu bucket", "touca"] } },
  { nome: "Calçados", emoji: "👟", busca: "tênis", palavras: ["tenis", "calcado", "sandalia", "chinelo", "sapato", "bota", "rasteirinha", "sapatenis", "crocs", "papete", "babuche", "babuches", "baduche", "pantufa", "tamanco", "mocassim", "sapatilha", "alpargata", "galocha", "mule", "scarpin"],
    vitrine: { buscas: ["tênis nike", "tênis adidas", "crocs", "tênis new balance"] } },
  { nome: "Bolsas e mochilas", emoji: "👜", busca: "bolsa", chave: "bolsa", palavras: ["bolsa", "mochila", "carteira", "necessaire", "mala de viagem", "pochete"],
    vitrine: { buscas: ["bolsa feminina", "mochila notebook", "bolsa transversal", "necessaire"] } },
  { nome: "Moda íntima", emoji: "🩲", busca: "moda íntima", palavras: ["cueca", "calcinha", "sutia", "lingerie", "pijama", "meia"],
    vitrine: { buscas: ["cueca boxer", "calcinha", "sutiã", "pijama feminino"] } },
  { nome: "Moda fitness", emoji: "🧘", busca: "roupa academia", chave: "fitness", palavras: ["legging", "top fitness", "conjunto fitness", "roupa academia", "short academia",
    "top academia", "top esportivo", "top sustentacao", "top nadador", "top com bojo", "top treino"],
    vitrine: { buscas: ["conjunto fitness", "legging", "top fitness", "short academia"] } },
  // Roupas antes de "Esporte": "Shorts Masculino … Academia" é roupa, não equipamento.
  // Não existe "Roupas" genérico: na Shopee a busca "roupas" traz guarda-roupas e cabides
  { nome: "Moda masculina", emoji: "👕", busca: "roupa masculina", chave: "masculina", roupa: "masculin",
    vitrine: { buscas: ["camiseta oversized", "bermuda masculina", "camisa polo", "calça cargo masculina"] } },
  { nome: "Moda feminina", emoji: "👗", busca: "roupa feminina", chave: "feminina", roupa: "feminin",
    vitrine: { buscas: ["vestido", "cropped", "conjunto feminino", "calça wide leg"] } },
  { nome: "Eletroportáteis", emoji: "🍟", busca: "eletroportáteis", palavras: ["air fryer", "airfryer", "fritadeira", "liquidificador", "espremedor", "mixer", "cafeteira", "sanduicheira", "panela eletrica", "batedeira", "processador de alimentos", "chaleira eletrica", "grill", "pipoqueira eletrica",
    "maquina de pipoca", "torradeira", "waffle", "panela de arroz", "panela de pressao eletrica", "multiprocessador"],
    vitrine: { buscas: ["air fryer", "liquidificador", "cafeteira", "mixer"], precoMin: 80 } },
  // Depois de Eletroportáteis: "Air Fryer / Forno Elétrico 3 em 1" é eletroportátil. "Lavadora de alta pressão" é ferramenta;
  // ar condicionado de carro é Automotivo; "Imã de Geladeira" não é geladeira
  // fixa = sempre a 1ª do menu da barra lateral, venda o que vender (pedido do Giovanni, 17/10/2026)
  { nome: "Eletrodomésticos", emoji: "🧊", busca: "eletrodomésticos", fixa: true, palavras: ["geladeira", "refrigerador", "freezer", "frigobar",
    "fogao", "cooktop", "microondas", "micro ondas", "forno de embutir", "maquina de lavar", "lavadora", "lava e seca", "lava loucas",
    "lava louca", "secadora", "ar condicionado", "ventilador", "climatizador", "aquecedor eletrico", "smart tv", "televis", "adega", "coifa", "depurador", "purificador de agua"],
    nao: ["alta pressao", "automotivo", "carro", "veicular", "ima", "imas", "adesivo", "brinquedo", "miniatura", "infantil",
      "tv box", "blower", "evaporador", "cooler", "gabinete", ...CARROS],
    vitrine: { buscas: ["geladeira frost free", "máquina de lavar", "smart tv", "ar condicionado split", "micro-ondas", "fogão 4 bocas"],
      precoMin: 300, excluir: ["portatil", "mini", "camping", "veicular", "sapato", "sapatos", "projetor", "tv box", "stick"] } },
  { nome: "Mesa posta", emoji: "🍽️", busca: "sousplat", palavras: ["sousplat", "jogo americano", "toalha de mesa", "guardanapo", "porta guardanapo", "caminho de mesa",
    "trilho de mesa", "pano de prato", "pano de copa"],
    vitrine: { buscas: ["sousplat", "jogo americano", "porta guardanapo", "toalha de mesa"] } },
  { nome: "Móveis", emoji: "🛋️", busca: "móveis", palavras: ["guarda roupa", "guarda-roupa", "roupeiro", "armario", "comoda", "rack", "estante", "sofa", "colchao", "escrivaninha", "penteadeira", "cabideiro", "cadeira", "poltrona", "criado mudo", "mesa de jantar", "mesa de centro"],
    // Roupa de cama da Karsten: "Protetor de Colchão" e "Saia para Colchão" são de Cama e banho
    nao: ["protetor de colchao", "saia para colchao", "saia de colchao", "capa de colchao"],
    vitrine: { buscas: ["guarda roupa", "rack para tv", "sofá", "escrivaninha"], precoMin: 100 } },
  { nome: "Cozinha", emoji: "🍳", busca: "utensílios de cozinha", palavras: ["panela", "frigideira", "faqueiro", "talher", "pote", "garrafa", "copo", "xicara", "caneca", "utensilio", "tabua", "escorredor", "forma de bolo",
    "luva termica", "avental", "pegador de panela"],
    vitrine: { buscas: ["stanley", "jogo de panelas", "pote hermético", "garrafa térmica"] } },
  { nome: "Cama e banho", emoji: "🛏️", busca: "cama e banho", palavras: ["lencol", "edredom", "travesseiro", "toalha de banho", "roupao", "cobertor", "manta", "jogo de cama", "colcha",
    // nomes da Karsten (21/10/2026)
    "toalha banhao", "banhao", "toalha de rosto", "toalha de piso", "toalha de lavabo", "toalha de visita", "toalha de praia",
    "jogo de banho", "jogo de toalha", "fronha", "porta travesseiro", "peseira", "cobre leito", "saia para colchao", "saia de colchao",
    "saia de cama", "protetor de colchao", "protetor de travesseiro", "duvet", "toalhas de banho", "toalhas de rosto", "toalhas de piso",
    "toalhas de lavabo", "toalhas de visita", "toalhas de praia", "jogo de toalhas", "pillow top"],
    vitrine: { buscas: ["jogo de cama", "edredom", "toalha de banho", "travesseiro"] } },
  // Esporte e LED antes de Decoração: "Tapete de Yoga" e "Luminária LED" não são enfeite
  { nome: "Esporte e fitness", emoji: "🏋️", busca: "academia", palavras: ["academia", "treino", "halter", "yoga", "pilates", "elastico extensor", "corda de pular", "bicicleta", "corrida", "vara de pesca", "molinete", "carretilha", "anzol", "isca artificial"],
    vitrine: { buscas: ["halter", "elástico extensor", "corda de pular", "tapete yoga"] } },
  { nome: "Iluminação LED", emoji: "💡", busca: "led", chave: "led", palavras: ["fita led", "lampada", "led", "refletor"],
    // "Monitor Gamer … Mini LED" e "Microfone … LED" não são iluminação (Kabum, 21/10/2026)
    nao: ["monitor", "microfone", "teclado", "mouse", "headset", "projetor"],
    vitrine: { buscas: ["fita led", "luminária led", "lâmpada inteligente", "refletor led"] } },
  { nome: "Decoração", emoji: "🪴", busca: "decoração", palavras: ["espelho", "quadro", "vaso", "luminaria", "abajur", "enfeite", "natal", "natalino", "decoracao", "tapete", "cortina", "almofada", "vela aromatica"],
    nao: ["retrovisor", "sanitario"],
    vitrine: { buscas: ["luminária", "espelho", "quadro decorativo", "vaso decorativo"] } },
  { nome: "Organização", emoji: "🗂️", busca: "organizador", palavras: ["organizador", "caixa organizadora", "cabide", "prateleira", "sapateira", "porta tempero"],
    vitrine: { buscas: ["caixa organizadora", "sapateira", "organizador de gaveta", "prateleira"] } },
  { nome: "Limpeza", emoji: "🧹", busca: "limpeza", palavras: ["mop", "vassoura", "aspirador", "rodo", "limpeza", "pano de chao", "limpador"],
    vitrine: { buscas: ["robô aspirador", "mop giratório", "aspirador de pó", "vassoura mágica"] } },
  { nome: "Brinquedos", emoji: "🧸", busca: "brinquedo", chave: "brinquedo", palavras: ["brinquedo", "boneca", "boneco", "carrinho de controle", "lego", "pelucia", "slime", "quebra cabeca", "massinha", "fidget", "educativo", "laptop infantil"],
    vitrine: { buscas: ["lego", "boneca", "carrinho de controle remoto", "pelúcia"] } },
  { nome: "Informática", emoji: "💻", busca: "informática", palavras: ["mouse", "teclado", "notebook", "webcam", "pendrive", "pen drive", "ssd", "monitor", "hub usb", "cabo hdmi"],
    // "Pipoqueira Mickey Mouse" não é mouse; "Monitor de bebê" / "monitor cardíaco" não são informática (print do Giovanni, 19/10/2026)
    nao: ["mickey mouse", "minnie mouse", "monitor de bebe", "baba eletronica", "monitor cardiaco", "monitor de pressao"],
    vitrine: { buscas: ["notebook lenovo", "mouse gamer", "teclado mecânico", "monitor gamer"],
      excluir: ["infantil", "educativo", "brinquedo", "pressao", "bebe", "kids"] } },
  { nome: "Games", emoji: "🎮", busca: "games", palavras: ["controle", "joystick", "ps5", "ps4", "xbox", "nintendo", "gamer", "playstation"],
    vitrine: { buscas: ["ps5", "nintendo switch", "controle xbox", "xbox series"] } },
  { nome: "Caixas de som", emoji: "🔊", busca: "caixa de som", palavras: ["caixa de som", "speaker", "soundbar", "partybox"],
    vitrine: { buscas: ["caixa de som jbl", "caixa de som bluetooth", "soundbar", "partybox"] } },
  { nome: "Ferramentas", emoji: "🛠️", busca: "ferramentas", palavras: ["ferramenta", "furadeira", "parafusadeira", "alicate", "trena", "jogo de chave", "maleta de ferramenta", "lavadora de alta pressao"],
    vitrine: { buscas: ["parafusadeira", "furadeira", "jogo de ferramentas", "lavadora de alta pressão"] } },
  // Celulares antes de Automotivo: "Motorola Moto G85" não é moto
  // A busca "celular" sozinha traz celular de botão para idoso
  { nome: "Celulares", emoji: "📲", busca: "celular", chave: "celular", palavras: ["celular", "smartphone", "iphone", "galaxy", "redmi", "motorola"],
    nao: ["multimidia", "carplay", "automotivo", "retrovisor", "smart tv", "tv box", "tablet", "galaxy tab"],
    // "smartphone" e "celular" (26/10/2026, print do Giovanni: só 114 ofertas): a AliExpress quase não vende iPhone/Galaxy
    // para o Brasil, mas tem celulares na categoria dela, que só entram pela busca "celular"
    vitrine: { buscas: ["smartphone", "iphone", "samsung galaxy", "xiaomi", "motorola", "celular"], precoMin: 500, excluir: ["idoso", "botao", "flip", "infantil", "brinquedo", "patinete", "smart tv", "tv box", "tablet"] } },
  { nome: "Automotivo", emoji: "🚗", busca: "acessórios para carro", palavras: ["carro", "automotivo", "moto", "capacete", "volante", "multimidia", "carplay", "retrovisor", "camera de re", ...CARROS],
    vitrine: { buscas: ["central multimídia", "capacete", "câmera de ré", "som automotivo"] } },
];

const ROUPAS = ["camiseta", "camisa", "blusa", "moletom", "jaqueta", "casaco", "shorts", "short", "bermuda", "calca",
  "vestido", "saia", "cropped", "macacao", "regata", "polo", "jeans", "body", "kimono", "blazer", "colete"];

// Palavras que não mudam o sentido: "caixa de som" = "caixa som", "tapete de yoga" = "tapete yoga"
export const PALAVRAS_VAZIAS = new Set(["de", "do", "da", "dos", "das", "para", "com", "e", "a", "o"]);
const VAZIAS = [...PALAVRAS_VAZIAS].join("|");
const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Palavras curtas precisam bater inteiras (ou no plural): "bota" não pode pegar "botão"
const temPalavra = (texto, palavra) => (palavra.length <= 4
  ? ` ${texto} `.includes(` ${palavra} `) || ` ${texto} `.includes(` ${palavra}s `)
  : ` ${texto}`.includes(` ${palavra}`));

// Uma expressão só por lista (bem mais rápido que testar palavra por palavra, e o servidor tem 10 ms de CPU).
// Mesma regra de temPalavra; em "caixa de som" o "de" é opcional.
// noComeco = só se o título começar pela palavra ("Luminária LED …" começa por "luminária")
function compilar(lista, noComeco = false) {
  const partes = lista.map((p) => {
    const ps = normalizar(p).split(" ").filter((x) => !PALAVRAS_VAZIAS.has(x));
    const fim = ps.at(-1).length <= 4 && ps.length === 1 ? "s?(?= |$)" : "";
    return ps.map(escapar).join(`(?: (?:${VAZIAS}))* ?`) + fim;
  });
  return new RegExp(`${noComeco ? "^" : "(?:^| )"}(?:${partes.join("|")})`);
}
for (const c of CATEGORIAS) {
  c.re = c.palavras ? compilar(c.palavras) : null;
  c.reComeco = c.palavras ? compilar(c.palavras, true) : null;
  c.reNao = c.nao ? compilar(c.nao) : null;
}
const RE_ROUPAS = compilar(ROUPAS);
const reRoupa = new Map();

// As N primeiras palavras de verdade do título (pula números e "kit")
const primeiras = (texto, n) => texto.split(" ").filter((p) => p && !/\d/.test(p) && p !== "kit").slice(0, n).join(" ");

// O título tem as palavras da categoria (sem olhar as outras categorias)?
function combina(texto, c) {
  if (c.reNao && c.reNao.test(texto)) return false;
  if (c.re) return c.re.test(c.inicio ? primeiras(texto, c.inicio) : texto);
  if (c.roupa === undefined || !RE_ROUPAS.test(texto)) return false;
  if (!c.roupa) return true;
  if (!reRoupa.has(c.roupa)) reRoupa.set(c.roupa, compilar([c.roupa]));
  return reRoupa.get(c.roupa).test(texto);
}

// Vale antes da ordem da lista: "Ventilador … placa de vídeo" não é eletrodoméstico, "Quadro K3000" não é decoração
// (print "placa de video", 19/10/2026)
const ANTES_DE_TUDO = [
  // "Caixa de Som Gamer …" não é de Games, "Caixa de Som … LED" não é de Iluminação LED (Kabum, 21/10/2026)
  [/^(kit )?(caixas? de som|soundbar|partybox)( |$)/, "Caixas de som"],
  [/(^| )(placas? de video|placas? mae|placa grafica|gpu|geforce|radeon|[rg]tx ?\d{3,4}|rx ?\d{3,4}|memoria ram|ddr[345] |processador (amd|intel)|ryzen|intel core|water cooler|fonte atx|ssd nvme)( |$)/, "Informática"],
];
// Pets é exclusiva (pedido do Giovanni, 28/10/2026): produto para bicho (ração, perfume, shampoo, cama, roupinha…) fica só em
// Pets, em qualquer busca ou categoria aberta e mesmo que a loja diga outra coisa. Só palavras fortes: "Perfume Gato Preto"
// é de gente, "Pijama de Gatos", "Chaveiro de Cachorrinhos", "Coleira Anti-perda Infantil", "Pote Hermético Cozinha … Ração"
// e "Máquina de Cachorro Quente" não são de pet, "Garrafa Pet" é de plástico (conferido em ~40 buscas reais)
const RE_PET = /(^| )(pet|pets|caes|cachorro|cachorros|cachorrinho|gatos|gatinhos|felino|felinos|canino|caninos|filhote de cao|para cao|para gato|racao|petisco|petiscos|coleira|arranhador|comedouro|areia sanitaria|tapete higienico|antipulgas|vermifugo|animais de estimacao|animal de estimacao)( |$)/;
const RE_NAO_PET = /(^| )(cachorro quente|hot dog|garrafa pet|garrafas pet|pijama|camiseta|camisa|blusa|moletom|caneca|pantufa|chinelo|meia|meias|estampa|estampado|estampada|pelucia|quebra cabeca|livro|adesivo|adesivos|desenho|desenhos|quadro|poster|chaveiro|chaveiros|desenho animado|fantasia|vestido|infantil|crianca|criancas|bebe|bebes|cozinha|mantimentos|dente de cachorro|dentes de cachorro)( |$)/;
const ehDePet = (texto) => RE_PET.test(texto) && !RE_NAO_PET.test(texto);
let pets;
const categoriaPets = () => (pets ||= CATEGORIAS.find((c) => c.nome === "Pets"));
export const EXCLUSIVA = "Pets";
export const exclusivo = (titulo) => analisar(titulo).pet;

// Categoria travada (pedido do Giovanni, 28/10/2026): o produto fica só nela, em qualquer busca, categoria aberta ou
// vitrine. Produto de pet pelo título (acima) ou a categoria que a própria loja manda no feed (lib/caminhos.js: só a Awin
// manda em texto; Shopee e AliExpress mandam códigos, que seguem pelo mapa aprendido). Loja de um tipo só (Animale = moda
// feminina) vale quando nem o caminho nem o título dizem nada. Sem trava = null (vale o título, como antes)
export function categoriaTravada(o) {
  const titulo = o.titulo || "";
  if (exclusivo(titulo)) return EXCLUSIVA;
  // Categoria dada pela IA (robo/ia.mjs, lib/ia.js, 29/10/2026): vale acima da loja e das regras do título
  if (o.catIa) return o.catIa;
  const caminho = o.catsLoja?.length === 1 && /[a-z]/i.test(o.catsLoja[0]) ? o.catsLoja[0] : null;
  if (!caminho && !o.lojaNome) return null;
  const daLoja = padraoDaLoja(o.lojaNome);
  const peloCaminho = caminho && categoriaDoCaminho(caminho, categoriaDoProduto);
  if (daLoja?.forte) return daLoja.aceita?.includes(peloCaminho) ? peloCaminho : daLoja.nome;
  // Caminho que só diz o público ("Calvin Klein | Masculino"): o título vence ("Cueca …" é moda íntima)
  if (/^Moda (masculina|feminina)$/.test(peloCaminho || "") && categoriaDoProduto(titulo)) return null;
  return peloCaminho || (daLoja && !categoriaDoProduto(titulo) ? daLoja.nome : null);
}

const classificar = (texto) => {
  for (const [re, nome] of ANTES_DE_TUDO) if (re.test(texto)) return CATEGORIAS.find((c) => c.nome === nome);
  return CATEGORIAS.find((c) => combina(texto, c)) || null;
};

// O mesmo título aparece muitas vezes numa busca (contagem, ordem, vitrine): guarda o resultado
const memoria = new Map();
function analisar(nome) {
  const chave = String(nome || "");
  let r = memoria.get(chave);
  if (r) return r;
  const texto = normalizar(chave);
  // O que vem depois de "com"/"+"/"acompanha" é brinde ou detalhe: "Smartwatch … com Carregador" é smartwatch,
  // "Colágeno … com Ácido Hialurônico e Vitamina C" é suplemento. Se o começo não diz nada ("Kit com 3 Cuecas"), vale o título todo.
  const cabeca = normalizar(chave.split(/\s(?:com|c\/|acompanha|\+)\s/i)[0]);
  const pet = ehDePet(texto);
  r = { texto, cabeca, pet, categoria: pet ? categoriaPets() : (cabeca !== texto && classificar(cabeca)) || classificar(texto) };
  if (memoria.size > 5000) memoria.clear();
  memoria.set(chave, r);
  return r;
}

export function categoriaDoProduto(nome) {
  return analisar(nome).categoria;
}

// O produto é desta categoria, mesmo que outra categoria venha antes na lista: o título começa
// por uma palavra dela ("Luminária LED …" é de Iluminação LED, mas também serve na vitrine de Decoração).
// Só no começo: "Fone Motorola Moto Buds" tem "motorola", mas é fone, não celular
export function combinaCategoria(nome, categoria) {
  const r = analisar(nome);
  if (r.categoria === categoria) return true;
  if (r.pet) return false; // perfume de pet não serve na vitrine de Perfumes
  if (!categoria.reComeco || (categoria.reNao && categoria.reNao.test(r.texto))) return false;
  return categoria.reComeco.test(r.texto.replace(/^(?:(?:kit|\d\S*) )+/, ""));
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
  return [...CATEGORIAS].sort((a, b) => Boolean(b.fixa) - Boolean(a.fixa) || (pontos.get(b) || 0) - (pontos.get(a) || 0))
    .map(({ nome, emoji, busca, fixa }) => ({ nome, emoji, busca, ...(fixa && { fixa }) }));
}

// Para a IA (robo/ia.mjs): o nome de cada categoria e algumas palavras de exemplo
export function categoriasParaIa() {
  return CATEGORIAS.map((c) => ({ nome: c.nome, exemplos: (c.palavras || []).slice(0, 8) }));
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

// Categoria de uma oferta: a da loja, se já foi aprendida (ver lib/mapaCategorias.js), senão a do título
export function categoriaDaOferta(o) {
  const travada = categoriaTravada(o);
  if (travada) return categoriaPorNome(travada);
  return (o.catMapa && categoriaPorNome(o.catMapa)) || categoriaDoProduto(o.titulo || "");
}

// Não é claramente de outra categoria ("Bolso Modular Invictus" em Perfumes é)
const naoEDeOutra = (o, categoria) => {
  const travada = categoriaTravada(o);
  if (travada) return travada === categoria.nome;
  if (o.catMapa) return o.catMapa === categoria.nome;
  const c = categoriaDoProduto(o.titulo || "");
  return !c || c === categoria || combinaCategoria(o.titulo || "", categoria);
};

// Tira o que é claramente de outra categoria
export function daCategoria(ofertas, categoria) {
  const dela = ofertas.filter((o) => naoEDeOutra(o, categoria));
  return dela.length ? dela : ofertas;
}

// Quantos produtos (sem acessórios) ficam na categoria: usado para saber se já tem o bastante
export function contarNaCategoria(ofertas, categoria) {
  return ofertas.reduce((n, o) => n + (!o.acessorio && naoEDeOutra(o, categoria) ? 1 : 0), 0);
}

// Seção de cada oferta (filtro "Categorias nos resultados" do site): a categoria do produto, ou a
// categoria aberta se o título combina com ela. Sem categoria = nada (o site mostra como "Outros").
// daBusca = categoria do que foi buscado ("notebook gamer" = Informática)
// Conferência antes de mostrar (pedido do Giovanni, 19/10/2026: "pipoqueira elétrica" aparecia em Informática por causa do
// "Mickey Mouse", e em Limpeza/Cozinha pela categoria da loja). O produto buscado é um produto só: todos os que são ele
// (buscado(o) = sem acessório e com o que foi buscado no título) ficam na MESMA categoria:
// 1) a categoria do que foi buscado, se o texto da busca diz ("pipoqueira elétrica" = Eletroportáteis);
// 2) senão, a categoria da maioria deles (60%+ dos que têm categoria, e esses são 40%+ do total);
// 3) senão, se a busca tem 2+ categorias fortes (cada uma com 25%+ dos classificados: "toalha" = Mesa posta e
//    Cama e banho, 21/10/2026), cada produto fica na sua, se for uma delas; os outros vão para "Outros";
// 4) senão (busca sem categoria clara), nenhum deles ganha categoria: aparecem juntos em "Outros",
//    em vez de espalhados por categorias erradas.
const MAIORIA = 0.6;
const COM_CATEGORIA = 0.4;
const FORTE = 0.25;
function categoriasDoBuscado(lista) {
  const conta = new Map();
  for (const o of lista) if (o.secao) conta.set(o.secao, (conta.get(o.secao) || 0) + 1);
  const ordem = [...conta].sort((a, b) => b[1] - a[1]);
  const comCategoria = [...conta.values()].reduce((a, b) => a + b, 0);
  if (!ordem.length || comCategoria < lista.length * COM_CATEGORIA) return [];
  const [nome, n] = ordem[0];
  if (n >= 3 && n >= comCategoria * MAIORIA) return [nome];
  return ordem.filter(([, q]) => q >= 3 && q >= comCategoria * FORTE).map(([c]) => c);
}

// O produto buscado, mas para carro, fica em Automotivo ("Perfume Automotivo" na busca "perfume"). Pets é tratada à parte
// (EXCLUSIVA, acima), em qualquer lugar
const PARA_OUTRO_USO = [
  [/(^| )(automotivo|automotiva|para carro|para carros)( |$)/, "Automotivo"],
];
const outroUso = (titulo) => PARA_OUTRO_USO.find(([re]) => re.test(normalizar(titulo)))?.[1];

export function marcarSecoes(ofertas, categoria = null, daBusca = null, buscado = null) {
  const nomeDaBusca = daBusca?.nome || categoria?.nome;
  const usoDe = new Map();
  const marcadas = marcarPorProduto(ofertas, categoria, daBusca).map((o) => {
    const uso = nomeDaBusca && !categoriaTravada(o) && outroUso(o.titulo || "");
    if (!uso || uso === nomeDaBusca || (o.secao !== nomeDaBusca && !buscado?.(o))) return o;
    const marcada = { ...o, secao: uso };
    usoDe.set(marcada, uso);
    return marcada;
  });
  if (!buscado) return marcadas;
  const dele = marcadas.filter((o) => !usoDe.has(o) && !categoriaTravada(o) && buscado(o));
  if (!dele.length) return marcadas;
  const nomes = daBusca ? [daBusca.nome] : categoriasDoBuscado(dele);
  const conferidas = new Set(dele);
  return marcadas.map((o) => {
    if (!conferidas.has(o) || nomes.includes(o.secao)) return o;
    const { secao, ...resto } = o;
    return nomes.length === 1 ? { ...resto, secao: nomes[0] } : resto;
  });
}

function marcarPorProduto(ofertas, categoria, daBusca) {
  return ofertas.map((o) => {
    const titulo = o.titulo || "";
    // A categoria da loja manda; sem ela, o título (puxando para a categoria aberta, se combinar).
    // Mas se o título é da categoria buscada, ele vence: vendedor da Shopee pôs "Mousepad Gamer … Notebook" em
    // calçados, e ele aparecia em Calçados na busca "notebook gamer" (print do Giovanni, 19/10/2026)
    const peloTitulo = categoriaDoProduto(titulo);
    const travada = categoriaTravada(o);
    if (travada) return { ...o, secao: travada };
    const secao = (daBusca && peloTitulo === daBusca && daBusca.nome) || o.catMapa
      || (categoria && combinaCategoria(titulo, categoria) ? categoria.nome : peloTitulo?.nome);
    return secao ? { ...o, secao } : o;
  });
}

// Busca na categoria: primeiro o que é dela com certeza, depois o que não deu para classificar,
// depois o que é de outra categoria, acessórios no fim (a ordem de relevância continua em cada grupo).
// Nada é tirado: o site mostra só a categoria aberta e deixa o visitante marcar as outras.
// naCategoria: true = é da categoria com certeza (o site usa ao ordenar por preço/desconto)
export function ordenarNaCategoria(ofertas, categoria) {
  return marcarSecoes(ofertas, categoria)
    .map((o, i) => ({ o, i, g: o.acessorio ? 3 : o.secao === categoria.nome ? 0 : o.secao ? 2 : 1 }))
    .sort((a, b) => a.g - b.g || a.i - b.i)
    .map((x) => (x.g === 0 ? { ...x.o, naCategoria: true } : x.o));
}

// Vitrine da categoria: o visitante só abriu a categoria (não buscou nada dentro dela)
export function vitrineDaCategoria(q, categoria) {
  return categoria?.vitrine && normalizar(q) === normalizar(categoria.busca) ? categoria.vitrine : null;
}

// O termo inteiro, na ordem, no título ("smart band" ou "smartband"; não "Smart TV … Dual Band").
// "de/do/para…" não contam: "tapete yoga" acha "Tapete de Yoga", "câmera de ré" acha "Câmera Ré"
const frases = new Map();
export function fraseFlexivel(termo) {
  let re = frases.get(termo);
  if (!re) {
    const ps = normalizar(termo).split(" ").filter((p) => p && !PALAVRAS_VAZIAS.has(p));
    re = new RegExp(`(^| )${ps.map(escapar).join(`(?: (?:${VAZIAS}))* ?`)}`);
    frases.set(termo, re);
  }
  return re;
}
const temFrase = (titulo, termo) => fraseFlexivel(termo).test(analisar(titulo).texto);

// Uma lista por busca da vitrine -> produtos da categoria, sem acessórios, baratos demais ou palavras
// excluídas, intercalando as buscas (iPhone, Galaxy, Xiaomi, Motorola, iPhone…) e sem repetir
export function montarVitrine(listas, vitrine, categoria) {
  const excluir = vitrine.excluir ? compilar(vitrine.excluir) : null;
  // Fica o que é da categoria com certeza; o resto só se tiver o termo buscado inteiro e
  // (não deu para classificar, ou as palavras da categoria também estão lá: "Luminária LED" na vitrine "luminária")
  const daVitrine = (o, i) => {
    const titulo = o.titulo || "";
    const c = categoriaDoProduto(titulo);
    const travada = categoriaTravada(o);
    if (travada) return travada === categoria.nome;
    if (categoria.nome === EXCLUSIVA) return c === categoria || (!c && o.catMapa === categoria.nome);
    if (o.catMapa) return o.catMapa === categoria.nome;
    return c === categoria || (temFrase(titulo, vitrine.buscas[i] || "") && (!c || combinaCategoria(titulo, categoria)));
  };
  const limpas = listas.map((lista, i) => lista.filter((o) => !o.acessorio && o.bate
    && o.preco >= (vitrine.precoMin || 0)
    // excluir vale só antes do "com": "Smartwatch … com Carregador" fica, "Carregador para Smartwatch" sai
    && !(excluir && excluir.test(analisar(o.titulo || "").cabeca))
    && daVitrine(o, i)));
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

// Todas as buscas das vitrines (usadas na coleta diária de preços da Shopee)
export function buscasDasVitrines() {
  return [...new Set(CATEGORIAS.flatMap((c) => c.vitrine?.buscas || []))];
}

// Todas as categorias com o que o site pesquisa ao abri-las (robô que prepara as buscas populares)
export function categoriasParaPreparar() {
  return CATEGORIAS.map(({ nome, busca }) => ({ nome, busca }));
}
