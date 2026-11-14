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
  // Pets (30/10/2026, print da categoria Pets com só "3M" e "Apple" no filtro de marcas)
  "fábrica pet", "furacão pet", "newpet", "purina", "premier pet", "special dog",
  "special cat", "magnus", "guabi natural", "biofresh", "fórmula natural", "gran plus", "farmina", "quatree", "nexgard",
  "bravecto", "simparic", "frontline", "seresto", "dog chow", "cat chow", "friskies", "pipicat", "chalesco", "zee.dog",
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
  // Mais marcas (19/10/2026): com a marca reconhecida, a busca separa marca e produto ("mondial air fryer").
  // Fora palavras comuns que também são produto ou termo (cat, echo, switch, multi, seda, dove…)
  "britania", "eletrolux", "hamilton beach", "mueller", "dako", "fogatti", "venax", "gelopar", "metalfrio", "fujitsu",
  "daikin", "carrier", "komeco", "hitachi", "rayovac", "duracell", "energizer", "osram", "irwin", "starrett", "worx",
  "einhell", "ryobi", "milwaukee", "schulz", "lavor", "pirelli", "michelin", "goodyear", "bridgestone", "moura",
  "heliar", "zetta", "eletran", "pioneiro", "castrol", "3m", "vonixx", "meguiars", "pioneer", "positron", "brinox",
  "oxo", "zwilling", "le creuset", "rojemac", "hercules", "estrela", "mattel", "hasbro", "nerf", "playmobil", "funko",
  "skala", "salon line", "inoar", "haskell", "elseve", "rexona", "granado", "phebo", "vizzela", "mari maria",
  "bruna tavares", "quem disse berenice", "adcos", "principia", "skinceuticals", "eucerin", "boticario", "jequiti",
  "racco", "dudalina", "aramis", "zara", "shein", "renner", "riachuelo", "malwee", "rovitex", "up baby", "carters",
  "tip top", "lilica ripilica", "pimpolho", "kyly", "democrata", "ferracini", "pegada", "via marte", "beira rio",
  "moleca", "piccadilly", "usaflex", "melissa", "ipanema", "grendene", "west coast", "timberland", "skechers",
  "reebok", "umbro", "penalty", "topper", "diadora", "everlast", "kappa", "speedo", "msi", "gigabyte", "corsair",
  "fortrek", "c3tech", "pcyes", "philips hue", "roku",
  // Lojas que são a própria marca e marcas vistas nas "Ofertas do dia" (24/10/2026, filtro "Marcas")
  "karsten", "polishop", "luminarc", "dark lab", "nakasaki", "monte carlo", "animale", "nadir", "marinex",
];

// Erros comuns de digitação (sem acento, minúsculas) -> certo. Troca na hora, antes de buscar
export const ERROS = {
  baduche: "babuche", baduches: "babuches", babuxe: "babuche", babuxes: "babuches", babuch: "babuche",
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

// Acentos (17/10/2026): quem digita sem acento recebia resultados piores ("fogao": a Lomadee trazia 0 fogões em vez de 36
// e a Shopee só 75 dos mesmos produtos de "fogão"). Antes de buscar, a palavra sem acento ganha o acento que os títulos das
// lojas usam. Lista tirada de ~20 mil títulos reais (forma com acento em 80%+ das vezes); ficaram de fora as que também
// existem sem acento (media, maca, ele, pos, tranca…). Não aparece "Corrigimos" para o visitante (só muda o acento).
const ACENTUADAS = `
  absorção acessório acessórios acrílico adereços adorável ajustáveis ajustável alemão algodão aliança alimentação
  alimentício alumínio alça alças alívio amamentação analógico aniversário antiembaçante aquário armário armários
  arranhões arábica automática automático autêntico avião aço ação açúcar aérea babá balcão boné bonés baú bebê bebês berço
  berços biquíni botão botões braço britânia bíblia cabeça cabeças café cafés calendário calça calçados calças calção
  caminhão caminhões camurça cardíaca cartão cartões carvão caçarola centrífuga cerâmica chapéu chapéus chá chão
  clássica clássico clássicos colchão colchões colecionável coleção compatíveis compatível conexão confortáveis
  confortável construção conversão coração cordão cosméticos criança crianças crochê cronógrafo cápsula cápsulas
  câmara câmera câmeras cães cílios cômoda decoração decorações deformação descartáveis descartável desconexão diário
  dobradiça dobrável doméstica doméstico domésticos dormitório dragão duração duráveis durável econômica edição
  eletrodomésticos eletrônica eletrônico elástica elástico elétrica elétricas elétrico elétricos engraçado ergométrica
  ergonômica ergonômico escritório espaço espátula estação estações estimação estável estéreo estúdio exibição
  extensão fabricação família feijão fixação flexível fogão força fragrância frequência função fábrica fácil fêmea
  genuíno geração ginásio giratória giratório gravação grátis grãos gás holográfico iluminação impermeável impressão
  inclinação inclinável indução inflável inoxidável instalação japonês lançamento latão lavável laço lenço lençol
  lençóis louça louças loção luminária lápis lâmina lâminas lâmpada líquido lítio macacão macarrão maciça magnética
  magnéticas magnético maiô manutenção mecânico memória metálica metálico mobiliário monocromática moído máquina
  máquinas máscara mãe mão mãos médio móbile módulo móveis móvel música negócios numérico não níveis nível núcleo
  obstáculos organização padrão película pelúcia perfuração personalizável pescoço peça peças pincéis pistão
  planetária plástico poliéster portáteis portátil potência precisão preguiçoso pressão preço promoção proteção
  proteína prática prático pré pássaros pátio pão pés pó pôster ração recarregável reclinável recém redução reforçada
  reforçado refrigeração regulável relógio relógios removível remoção reparação reposição resistência respiráveis
  respirável retroiluminação retrátil reutilizáveis reutilizável robô rotação roupão rádio rápida rápido rígida salão
  sandália sandálias sapatênis saída saídas segurança sensível simulação sofá sofás substituição sucção sutiã série
  sérum sólida sólido taça taças tensão termogênico titânio tradução transferência transmissão transposição três tábua
  térmica térmico tênis ultrassônica universitários utensílios vedação ventilação versátil versão verão vestuário
  veículo veículos vibração violão visão vácuo válvula vários vídeo xícaras zíper água área áudio ângulo ímã ímãs
  íntima íntimas óculos óleo óptico ômega ônibus única único útil
`;
const ACENTOS = Object.fromEntries(ACENTUADAS.trim().split(/\s+/).map((p) => [normalizar(p), p]));
// Só troca palavra digitada toda sem acento ("Fogao" e "fogao"; "fogão" fica como está)
const acentuar = (p) => (p.toLowerCase() === normalizar(p) && ACENTOS[normalizar(p)]) || p;
// Usado também no "Buscar como digitei" (exato=1): não troca palavras, só põe os acentos
export const acentuarBusca = (texto) => comCompostas(String(texto || "").trim().split(/\s+/).filter(Boolean).map(acentuar).join(" "));

// Busca de uma palavra só que, nas lojas, traz quase só acessório ou outra coisa (conferido no site em 17/10/2026):
// "tv" = cabo, TV Stick e projetor; "televisão" = livro "Televisão é a nova televisão"; "impressora" = peça de impressora 3D.
// O site continua mostrando o que foi digitado; só a consulta às lojas usa o termo daqui
const NAS_LOJAS = {
  tv: "smart tv", televisao: "smart tv", televisor: "smart tv", televisores: "smart tv",
  impressora: "impressora multifuncional", impressoras: "impressora multifuncional",
};
export const termoNasLojas = (q) => NAS_LOJAS[normalizar(q)] || q;

// Produto que a API da loja quase não acha pelo nome comum (conferido no site em 17/10/2026, print do Giovanni):
// "bateria carro" trazia testador, terminal e capa; as baterias de verdade se chamam "Bateria Automotiva Moura
// 60Ah…" e só aparecem pesquisando marca ou amperagem. "kindle" trazia cartão de capinha e pingente.
// buscas = consultas às lojas (juntas); termo = o que conta como o produto; precoMin = abaixo disso é acessório
const PRODUTOS_NAS_LOJAS = [
  {
    chaves: ["bateria carro", "bateria de carro", "bateria para carro", "bateria do carro", "baterias de carro",
      "bateria automotiva", "baterias automotivas", "bateria automovel", "bateria veicular", "bateria 12v carro"],
    buscas: ["bateria automotiva moura", "bateria 60ah", "bateria 50ah", "bateria 40ah", "bateria eletran", "bateria zetta"],
    termo: "bateria", precoMin: 250,
  },
  // "joystick" sozinho trazia alavanca de escavadeira/guindaste e tecla de teclado (19/10/2026)
  { chaves: ["joystick", "joysticks", "gamepad", "gamepads"], buscas: ["joystick gamer", "controle video game", "controle gamer"], termo: "joystick" },
  { chaves: ["kindle", "kindles", "kindle amazon", "amazon kindle"], buscas: ["kindle paperwhite", "leitor kindle", "kindle"], termo: "kindle", precoMin: 300 },
  // Echo Dot de R$ 48 (falsificado ou golpe) entre os de ~R$ 400 (auditoria, 27/10/2026)
  { chaves: ["echo dot", "alexa echo dot", "echo dot alexa", "echo dot 5", "echo dot 5 geracao"], buscas: ["echo dot"], termo: "echo dot", precoMin: 200 },
];
const PRODUTO_POR_CHAVE = new Map(PRODUTOS_NAS_LOJAS.flatMap((p) => p.chaves.map((c) => [c, p])));
// { buscas, termo, precoMin } para a busca digitada; sem regra especial = uma consulta com termoNasLojas
export function buscaNasLojas(q) {
  const p = PRODUTO_POR_CHAVE.get(normalizar(q));
  if (p) return { buscas: p.buscas, termo: p.termo, precoMin: p.precoMin };
  const termo = termoNasLojas(q);
  return { buscas: [termo, ...variantesDeJogo(termo), ...variantesDeCelular(termo), ...variantesDeConsole(termo)], termo };
}

// Só o nome do console ("xbox"): as lojas devolviam Xbox One/360 usados e jogos, e nenhum console atual (auditoria de
// 13/11/2026). Pesquisa também a geração atual e junta; a ordem (lib/relevancia.js) põe os atuais na frente
const CONSOLE_ATUAL = { xbox: "console xbox series", playstation: "console playstation 5", nintendo: "console nintendo switch" };
// Console com o modelo ("xbox series", "xbox series s", "ps5", "playstation 5 slim", "nintendo switch 2"), print do Giovanni
// de 13/11/2026: o Mercado Livre vende o Xbox Series e na busca "xbox series" vinham só jogos, cabos e controles dele, porque
// o catálogo do ML só devolve o aparelho quando a busca diz "console". Pesquisa também com "console" na frente e junta
const SO_O_CONSOLE = /^(xbox (series( [sx])?|one( [sx])?|360)|(playstation|ps) ?[2-5]( slim| pro)?|nintendo switch( 2| oled| lite)?|switch (2|oled|lite))( digital| \d+ ?(gb|tb))*$/;
// Para functions/api/buscar.js: cópia guardada desta busca feita antes da regra acima é refeita por trás na 1ª visita
export const buscaSoDeConsole = (q) => SO_O_CONSOLE.test(normalizar(q));
function variantesDeConsole(q) {
  const n = normalizar(q);
  const atual = CONSOLE_ATUAL[n];
  if (atual) return [atual];
  if (!SO_O_CONSOLE.test(n)) return [];
  // "ps4": o catálogo do Mercado Livre escreve "PlayStation 4" (14/11/2026: a busca "ps4" trazia 1 console e "playstation 4", 8)
  const porExtenso = n.replace(/^ps ?([2-5])/, "playstation $1");
  return porExtenso === n ? [`console ${n}`] : [`console ${n}`, `console ${porExtenso}`];
}

// "Celular" e "smartphone" são o mesmo produto, mas as lojas acham coisas diferentes por cada nome ("smartphone" não
// trazia o Mercado Livre e "celular" trazia outras ofertas; print do Giovanni, 06/11/2026): pesquisa os dois e junta.
// Só quando o aparelho é o que se busca (a palavra vem primeiro): "capa celular" continua uma consulta só
const CELULAR = /^(celular|celulares|smart ?phones?)( |$)/;
function variantesDeCelular(q) {
  const n = normalizar(q);
  const m = n.match(CELULAR);
  if (!m) return [];
  return [n.replace(CELULAR, `${m[1].startsWith("celular") ? "smartphone" : "celular"}$2`)];
}

// Controle de videogame também se chama "joystick" nas lojas: pesquisa os dois nomes e junta (pedido do Giovanni,
// 17/10/2026). Só com cara de videogame: "controle remoto" e "controle portão" não viram joystick
const DE_JOGO = /(^| )(video ?games?|videogames?|games?|gamer|ps[1-5]|playstation|xbox|nintendo|switch|console|consoles|pc)( |$)/;
function variantesDeJogo(q) {
  const n = normalizar(q);
  if (/(^| )(joysticks?|gamepads?)( |$)/.test(n)) {
    const controle = n.replace(/(^| )(joysticks?|gamepads?)( |$)/, "$1controle$3");
    return [DE_JOGO.test(controle) ? controle : `${controle} video game`];
  }
  if (/(^| )controles?( |$)/.test(n) && DE_JOGO.test(n)) return [n.replace(/(^| )controles?( |$)/, "$1joystick$2")];
  return [];
}

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
// PALAVRAS COMPOSTAS (05/11/2026, Giovanni: "microondas" trazia 36 produtos e "micro-ondas", 95; "o ideal é as duas buscas
// coincidirem independente da grafia, isso vale para outros produtos que têm '-' no nome"): junta, separada ou com hífen,
// a busca vira sempre a forma com hífen, antes de tudo (mesma resposta guardada, mesma busca pronta, mesma consulta às
// lojas). "para-sol"/"para-choque" não: "óculos para sol" é outra coisa
export const COMPOSTAS = `micro-ondas guarda-roupa guarda-roupas guarda-chuva guarda-chuvas guarda-sol guarda-volumes porta-retrato
  porta-retratos porta-joias porta-copos porta-chaves porta-temperos porta-trecos porta-malas porta-escova porta-papel
  porta-sabonete porta-shampoo porta-controle porta-canetas lava-louças lava-louça lava-roupas lava-jato pré-treino pós-treino
  quebra-cabeça quebra-cabeças pula-pula pisca-pisca beija-flor abre-latas saca-rolhas alto-falante alto-falantes cata-vento
  mata-mosquito mata-mosquitos tira-manchas tira-pelos bate-estaca guarda-corpo`.trim().split(/\s+/);
const COMPOSTA_POR_JUNTA = new Map(COMPOSTAS.map((c) => [normalizar(c).replace(/ /g, ""), c]));
// "micro" + "ondas" -> "microondas" se for uma palavra composta (para achar também o título escrito junto)
export const juntaDeComposta = (a, b) => (COMPOSTA_POR_JUNTA.has(`${a}${b}`) ? `${a}${b}` : null);
export function comCompostas(texto) {
  const partes = String(texto || "").trim().split(/\s+/).filter(Boolean);
  const saida = [];
  for (let i = 0; i < partes.length; i++) {
    const uma = COMPOSTA_POR_JUNTA.get(normalizar(partes[i]).replace(/ /g, ""));
    const duas = i + 1 < partes.length && COMPOSTA_POR_JUNTA.get(normalizar(`${partes[i]}${partes[i + 1]}`).replace(/ /g, ""));
    if (uma) saida.push(uma);
    else if (duas) { saida.push(duas); i++; } else saida.push(partes[i]);
  }
  return saida.join(" ");
}

export function corrigirBusca(texto) {
  const original = String(texto || "").trim();
  const palavras = original.split(/\s+/).filter(Boolean);
  const corrigidas = palavras.map((p) => (ERROS[normalizar(p)] ? ERROS[normalizar(p)].split(" ").map(acentuar).join(" ") : acentuar(p)));
  const q = comCompostas(corrigidas.join(" "));
  const sugeridas = q.split(" ").map((p) => marcaParecida(p) || p);
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
