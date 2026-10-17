// =====================================================================
// VOCABULÁRIO DA BUSCA (17/10/2026, print do Giovanni: "maquina de lavar eletrolux" só trazia peças;
// o certo é "electrolux")
//  - corrigirBusca: troca erros comuns de digitação ("eletrolux" -> "electrolux") antes de buscar nas lojas
//    (lista ERROS, certeira) e sugere "Você quis dizer…?" quando a palavra parece uma marca escrita errado
//    (distância de 1 ou 2 letras), sem trocar sozinho.
//  - /api/vocabulario manda MARCAS, ERROS e os termos para as sugestões da caixa de busca (app.js).
// =====================================================================
import { normalizar } from "./texto.js";
import { buscasDasVitrines, categoriasParaPreparar } from "./categorias.js";

// Os mais procurados no Brasil (pesquisa de 16/10/2026: Mercado Livre, Google, Shopee); também preparados
// toda madrugada pelo robô (/api/preparar-buscas)
export const POPULARES = [
  "air fryer", "celular", "fone bluetooth", "fone de ouvido", "smartwatch", "tênis feminino", "tênis masculino",
  "tênis de corrida", "ventilador", "iphone", "iphone 15", "iphone 16", "iphone 17", "geladeira", "notebook",
  "ar condicionado", "smart tv", "tv 55 polegadas", "ps5", "camiseta dry fit", "creatina", "caixa de som bluetooth",
  "perfume árabe", "perfume masculino", "perfume feminino", "jogo de lençol casal", "projetor 4k",
  "bicicleta ergométrica", "liquidificador", "câmera wifi", "areia para gatos", "power bank", "garrafa térmica",
  "robô aspirador", "kit maquiagem", "labubu", "bobbie goods", "poco x7 pro", "galaxy s24", "stanley",
  "mochila", "capinha iphone", "carregador iphone", "panela de pressão", "jogo de panelas", "cafeteira",
  "micro-ondas", "máquina de lavar", "aspirador de pó", "secador de cabelo", "chapinha", "relógio masculino",
];

// Outros produtos comuns (só para as sugestões da caixa de busca)
const OUTROS_TERMOS = [
  "relógio inteligente", "mouse sem fio", "mouse gamer", "teclado mecânico", "carregador portátil", "sérum vitamina c",
  "paleta de sombras", "mochila notebook", "vestido", "vestido longo", "luminária led", "fita led", "cadeira gamer",
  "cadeira de escritório", "cafeteira expresso", "blocos de montar", "frigideira", "panela de pressão elétrica",
  "capinha celular", "suporte veicular", "fogão 4 bocas", "fogão 5 bocas", "lava e seca", "lava louças", "freezer",
  "forno elétrico", "batedeira", "batedeira planetária", "sanduicheira", "mixer", "processador de alimentos",
  "purificador de água", "bebedouro", "aspirador vertical", "ferro de passar", "secadora de roupas", "tanquinho",
  "monitor gamer", "headset gamer", "webcam", "impressora", "roteador wifi", "ssd", "pendrive", "tablet", "kindle",
  "echo dot", "smart tv 50 polegadas", "smart tv 65 polegadas", "soundbar", "videogame", "nintendo switch", "xbox",
  "controle ps5", "colchão casal", "colchão queen", "travesseiro", "edredom", "toalha de banho", "cortina",
  "tapete sala", "sofá", "guarda roupa", "cômoda", "escrivaninha", "rack para tv", "mesa de jantar",
  "furadeira", "parafusadeira", "jogo de ferramentas", "lavadora de alta pressão", "bicicleta aro 29", "patinete elétrico",
  "capacete", "whey protein", "pré treino", "colágeno", "tênis nike", "tênis adidas", "chinelo", "sandália",
  "bolsa feminina", "carteira masculina", "óculos de sol", "relógio feminino", "perfume importado", "body splash",
  "protetor solar", "hidratante", "shampoo", "secador", "escova secadora", "barbeador", "aparador de pelos",
  "cama pet", "ração", "arranhador gato", "fralda", "carrinho de bebê", "cadeirinha carro", "brinquedo",
  // Produto + marca (as sugestões completam "máquina de lavar " com estes)
  "máquina de lavar electrolux", "máquina de lavar brastemp", "máquina de lavar lg", "máquina de lavar samsung",
  "máquina de lavar consul", "máquina de lavar midea", "geladeira brastemp", "geladeira electrolux", "geladeira consul",
  "geladeira samsung", "geladeira lg", "geladeira midea", "fogão brastemp", "fogão electrolux", "fogão consul",
  "micro-ondas electrolux", "micro-ondas panasonic", "micro-ondas brastemp", "air fryer mondial", "air fryer philco",
  "air fryer britânia", "air fryer electrolux", "air fryer oster", "air fryer arno", "celular samsung", "celular motorola",
  "celular xiaomi", "fone bluetooth jbl", "fone bluetooth xiaomi", "caixa de som jbl", "smart tv samsung", "smart tv lg",
  "smart tv tcl", "notebook lenovo", "notebook dell", "notebook samsung", "notebook acer", "notebook asus",
  "ventilador mondial", "ventilador arno", "liquidificador oster", "liquidificador philips walita", "aspirador electrolux",
  "ar condicionado samsung", "ar condicionado lg", "ar condicionado midea", "ar condicionado electrolux",
  "tênis olympikus", "tênis mizuno", "tênis asics", "perfume lattafa", "garrafa stanley", "copo stanley",
];

// Marcas, do jeito que aparecem nas sugestões (uma palavra com 7+ letras também entra no "Você quis dizer…?")
export const MARCAS = [
  // Eletrodomésticos e eletroportáteis
  "electrolux", "brastemp", "consul", "samsung", "lg", "philco", "britânia", "mondial", "arno", "oster", "walita",
  "philips", "panasonic", "midea", "gree", "elgin", "springer", "esmaltec", "atlas", "continental", "tramontina",
  "rochedo", "stanley", "wap", "bosch", "makita", "dewalt", "vonder", "black decker", "karcher", "mallory",
  "cadence", "agratto", "ventisol", "lenoxx", "nespresso", "dolce gusto", "fischer", "suggar", "fun kitchen",
  "taiff", "gama", "babyliss", "lizze", "multilaser", "intelbras", "positivo", "aiwa", "tcl", "aoc", "hisense",
  "semp", "toshiba", "ninja", "nutribullet", "kitchenaid", "cuisinart", "tefal", "rinnai", "lorenzetti", "fame",
  // Celulares, informática e games
  "apple", "iphone", "ipad", "macbook", "airpods", "xiaomi", "redmi", "poco", "motorola", "realme", "lenovo",
  "dell", "acer", "asus", "hp", "jbl", "sony", "edifier", "haylou", "qcy", "amazfit", "huawei", "honor", "oppo",
  "nokia", "logitech", "redragon", "hyperx", "razer", "nintendo", "playstation", "xbox", "kingston", "sandisk",
  "tp link", "mercusys", "epson", "canon", "brother", "gopro", "dji", "garmin", "kindle", "alexa", "chromecast",
  "galaxy", "infinix", "baseus", "anker", "ugreen", "havit", "lehmox", "knup", "kaidi", "tomate",
  // Moda, calçados e acessórios
  "nike", "adidas", "puma", "olympikus", "mizuno", "asics", "fila", "vans", "converse", "havaianas", "crocs",
  "lacoste", "calvin klein", "tommy hilfiger", "hering", "reserva", "colcci", "oakley", "ray ban", "chilli beans",
  "casio", "orient", "technos", "invicta", "mormaii", "kipling", "samsonite", "under armour", "new balance",
  // Beleza e perfumes
  "natura", "o boticário", "eudora", "avon", "maybelline", "ruby rose", "vult", "lattafa", "paco rabanne",
  "carolina herrera", "dior", "chanel", "hugo boss", "ralph lauren", "versace", "lancôme", "la roche posay",
  "cerave", "nivea", "loreal", "pantene", "wella", "truss", "kerastase", "creamy", "sallve",
  "bioderma", "neutrogena", "vichy", "mac", "benefit", "océane", "dailus", "boca rosa",
  // Suplementos
  "growth", "max titanium", "integralmedica", "probiótica", "dux", "black skull", "darkness",
  // Bebês, brinquedos e pets
  "lego", "barbie", "hot wheels", "fisher price", "chicco", "burigotto", "galzerano", "pampers", "huggies",
  "mamypoko", "pedigree", "whiskas", "golden", "premier", "royal canin", "labubu",
];

// Erros comuns de digitação (sem acento, minúsculas) -> certo. Troca na hora, antes de buscar
export const ERROS = {
  eletrolux: "electrolux", eletrolucs: "electrolux", electrolucs: "electrolux", eletrolx: "electrolux",
  eletrolus: "electrolux", electrolus: "electrolux", eletrolix: "electrolux", eletrulux: "electrolux",
  samsumg: "samsung", sansung: "samsung", samsug: "samsung", sansumg: "samsung", samsun: "samsung", sanssung: "samsung",
  samsong: "samsung", sansong: "samsung",
  xiaome: "xiaomi", xiomi: "xiaomi", xaomi: "xiaomi", xiaumi: "xiaomi", xiomy: "xiaomi", chaomi: "xiaomi", xioami: "xiaomi",
  xiami: "xiaomi", xiaomy: "xiaomi", shaomi: "xiaomi", xiome: "xiaomi", xaiomi: "xiaomi",
  motorolla: "motorola", motorla: "motorola", motorolo: "motorola", motorol: "motorola",
  iphoni: "iphone", ifone: "iphone", aifone: "iphone", iphne: "iphone", ipone: "iphone", iphome: "iphone", iphon: "iphone",
  phillips: "philips", philipis: "philips", filips: "philips", phillps: "philips",
  brastem: "brastemp", brastenp: "brastemp", bratemp: "brastemp", brastep: "brastemp",
  britannia: "britania", britanea: "britania",
  addidas: "adidas", adiddas: "adidas", adidass: "adidas", adida: "adidas",
  pleistation: "playstation", playstetion: "playstation", playstacion: "playstation", plestation: "playstation",
  airfryer: "air fryer", airfrayer: "air fryer", airfraier: "air fryer", airfrier: "air fryer", airfrai: "air fryer",
  arfryer: "air fryer", airfryier: "air fryer",
  frayer: "fryer", fraier: "fryer", frier: "fryer", fryier: "fryer",
  bluetoth: "bluetooth", bluetoot: "bluetooth", blutooth: "bluetooth", bluetooh: "bluetooth", blutufi: "bluetooth",
  bluetuf: "bluetooth", blutuf: "bluetooth", bluetoof: "bluetooth", blututh: "bluetooth",
  smartwhatch: "smartwatch", smartwach: "smartwatch", smarthwatch: "smartwatch", smatwatch: "smartwatch",
  smartwath: "smartwatch", smartwatc: "smartwatch", smartiwatch: "smartwatch", whatch: "watch", wach: "watch",
  lenovu: "lenovo", multilazer: "multilaser", intelbraz: "intelbras", tramontinha: "tramontina", tramontna: "tramontina",
  lataffa: "lattafa", latafa: "lattafa", lattaffa: "lattafa", lattafah: "lattafa",
  panassonic: "panasonic", panasonik: "panasonic", positvo: "positivo", nespreso: "nespresso", dolcegusto: "dolce gusto",
  geladera: "geladeira", jeladeira: "geladeira", geladiera: "geladeira",
  notbook: "notebook", noteboock: "notebook", notebok: "notebook", notbuk: "notebook", notebuk: "notebook", notbok: "notebook",
  maquiagen: "maquiagem", maquiage: "maquiagem", maqiagem: "maquiagem",
  cafetera: "cafeteira", stanlei: "stanley", stenley: "stanley", stanly: "stanley", estanley: "stanley",
  olimpikus: "olympikus", olympicus: "olympikus", olimpicus: "olympikus", misuno: "mizuno", assics: "asics",
  redimi: "redmi", galaxi: "galaxy", galax: "galaxy", laboobu: "labubu", labubo: "labubu", lambubu: "labubu",
  havainas: "havaianas", nikke: "nike", reebook: "reebok", invicts: "invictus", invitus: "invictus",
  liquidificado: "liquidificador", liquidifcador: "liquidificador", ventilado: "ventilador",
  maquna: "maquina", maqina: "maquina", travaseiro: "travesseiro", traveseiro: "travesseiro",
};

// Palavras de verdade que ficam a 1 letra de uma marca: nunca viram "Você quis dizer…?"
const COMUNS = new Set(`natural naturais premium gamer digital original mundial social central positiva
  golden goldem gamma games gama prime super power smart basic basico basica fila filas vans honor tomates
  apples redes lego legal reserva reservas series serie tecno ninja ninjas ultra pro`.trim().split(/\s+/));

let conhecidas;
function palavrasConhecidas() {
  if (conhecidas) return conhecidas;
  const textos = [...POPULARES, ...OUTROS_TERMOS, ...buscasDasVitrines(), ...categoriasParaPreparar().flatMap((c) => [c.nome, c.busca])];
  conhecidas = new Set([...COMUNS, ...textos.flatMap((t) => normalizar(t).split(" "))]);
  return conhecidas;
}

// Distância entre palavras (letra trocada, faltando, sobrando ou duas letras invertidas = 1)
export function distancia(a, b, limite = 2) {
  if (Math.abs(a.length - b.length) > limite) return limite + 1;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + custo);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

// Quantas letras erradas aceitar, pelo tamanho da marca: marca curta não ("nivel" virava "nivea", "cross" virava
// "crocs", conferido com 3 mil palavras de títulos reais); 7 ou 8 letras, 1; 9 ou mais, 2
export const tolerancia = (marca) => (marca.length >= 9 ? 2 : marca.length >= 7 ? 1 : 0);

const MARCAS_SIMPLES = [...new Set(MARCAS.map(normalizar).filter((m) => !m.includes(" ") && tolerancia(m)))];
const ehMarca = new Set(MARCAS.map(normalizar));

// Marca mais parecida com a palavra (só uma, sem empate), ou null
export function marcaParecida(palavra) {
  const p = normalizar(palavra);
  if (p.length < 6 || ehMarca.has(p) || ehMarca.has(p.replace(/s$/, "")) || palavrasConhecidas().has(p) || /\d/.test(p)) return null;
  let melhor = null;
  let menor = Infinity;
  let empate = false;
  for (const m of MARCAS_SIMPLES) {
    if (m[0] !== p[0]) continue; // a 1ª letra quase nunca é o erro
    const d = distancia(p, m, tolerancia(m));
    if (d > tolerancia(m)) continue;
    if (d < menor) { melhor = m; menor = d; empate = false; } else if (d === menor) empate = true;
  }
  return melhor && !empate ? melhor : null;
}

// q digitado -> { q: com os erros certeiros trocados, sugestao: "Você quis dizer…?" (ou null) }
export function corrigirBusca(texto) {
  const original = String(texto || "").trim();
  const palavras = original.split(/\s+/).filter(Boolean);
  const corrigidas = palavras.map((p) => ERROS[normalizar(p)] || p);
  const q = corrigidas.join(" ");
  const sugeridas = corrigidas.map((p) => marcaParecida(p) || p);
  const sugestao = sugeridas.join(" ");
  return { q: palavras.length ? q : original, sugestao: sugestao !== q ? sugestao : null };
}

// Termos para as sugestões da caixa de busca (sem repetir; os mais buscados no site vêm primeiro)
export function termosParaSugestoes(buscadosNoSite = []) {
  const vistos = new Set();
  return [...buscadosNoSite, ...POPULARES, ...OUTROS_TERMOS, ...buscasDasVitrines()]
    .map((t) => String(t).toLowerCase().trim())
    .filter((t) => t && !vistos.has(normalizar(t)) && vistos.add(normalizar(t)));
}
