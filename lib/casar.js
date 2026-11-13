// =====================================================================
// ROBÔ DE CASAR PRODUTOS (11/11/2026, pedido do Giovanni): a IA diz se dois anúncios de lojas diferentes são o MESMO
// produto, e o veredito fica guardado para o Modo comparação do site (app.js) mostrar só o que foi conferido.
// Roda no Cloudflare, na trilha "lojas" do robô da noite (lib/roboNoite.js, fase "casar", depois das buscas prontas): a
// chave da IA é o Secret ANTHROPIC_API_KEY do site. Para cada busca pronta:
//   1) junta os anúncios como o Modo comparação junta (mesma marca + mesmo código de modelo; a mais barata de cada loja);
//   2) pergunta à IA só os pares que ainda não têm veredito (tabela "casados", chave = os ids dos 2 anúncios);
//   3) anota quais pares são daquela busca (tabela "casados_buscas"), que é o que o site lê em /api/casados?q=.
// Uma pergunta por par (a conferência de fotos mostrou que várias de uma vez confunde a IA). A voltagem NÃO é decidida
// pela IA (ela errava quando só um anúncio dizia a voltagem): "igual_outra_voltagem" vale como igual e o site mostra a
// voltagem de cada anúncio lendo o nome. Celular, smartwatch, console… (sem código no nome) são juntados pelo nome: ver nomeDoModelo.
// =====================================================================
import { MARCAS } from "./vocabulario.js";
import { MARCA_APELIDOS } from "./marcas.js";

export const MODELO_IA = "claude-haiku-5-5";
const PRECO_ENTRADA = 0.1; // US$ por milhão de tokens (os mesmos números de robo/conferir-buscas.mjs)
const PRECO_SAIDA = 0.5;
export const custoDaIa = (entrada, saida) => (entrada * PRECO_ENTRADA + saida * PRECO_SAIDA) / 1e6;
export const TETO_DA_NOITE_US = 4; // gasto máximo por noite (Giovanni, 11/11/2026: "se conseguir fazer tudo hoje pode fazer completo"; era 0,50)
export const PARES_POR_PASSO = 40;
// Seções em que o robô procura o mesmo código de modelo em lojas diferentes. Nas duas primeiras o site junta pelo código
// mesmo sem conferência; nas outras (12/11/2026, Giovanni: "e outros produtos?") só mostra o que a IA confirmou, porque ali
// o "código" muitas vezes é o processador ou a memória, não o modelo
// 12/11/2026 (noite), decisão do Giovanni: foco nas 5 categorias "mais fáceis e mais procuradas"; Fones de ouvido, Caixas de
// som, Games, Smartwatches, Pets, Suplementos e Perfumes saíram do casamento (poucos cartões, muito produto genérico)
// "Consoles" não é categoria do site: é o que secaoDeComparar devolve para um console de videogame (13/11/2026)
export const SECOES_COMPARAVEIS = new Set(["Eletrodomésticos", "Eletroportáteis", "Informática", "Ferramentas", "Celulares", "Consoles"]);
// Buscas que o robô confere além das buscas prontas (12/11/2026: "smart tv 55" não estava na lista e ficou sem conferência).
// As que não são prontas vão às lojas nessa hora (uma por vez, depois das prontas)
const TELAS = [32, 40, 43, 50, 55, 58, 60, 65, 70, 75, 85];
export const BUSCAS_EXTRAS = [
  ...TELAS.map((t) => `smart tv ${t}`), ...TELAS.map((t) => `tv ${t} polegadas`), "smart tv", "tv",
  "geladeira", "geladeira frost free", "geladeira duplex", "geladeira inverse", "freezer", "frigobar", "adega climatizada",
  "máquina de lavar", "máquina de lavar 12kg", "máquina de lavar 15kg", "lavadora de roupas", "lava e seca", "secadora de roupas", "tanquinho",
  "fogão", "fogão 4 bocas", "fogão 5 bocas", "fogão 6 bocas", "cooktop", "cooktop de indução", "forno elétrico", "forno de embutir", "coifa", "depurador",
  "micro-ondas", "lava-louças", "purificador de água", "bebedouro", "ar condicionado", "ar condicionado split", "ar condicionado inverter",
  "ar condicionado 9000 btus", "ar condicionado 12000 btus", "ar condicionado portátil", "climatizador", "ventilador", "ventilador de teto",
  "aspirador de pó", "aspirador vertical", "robô aspirador", "air fryer", "liquidificador", "batedeira", "batedeira planetária", "cafeteira",
  "cafeteira expresso", "sanduicheira", "mixer", "processador de alimentos", "panela elétrica", "panela de pressão elétrica", "ferro de passar",
  "chaleira elétrica", "espremedor de frutas", "grill elétrico", "secador de cabelo", "escova secadora", "chapinha", "barbeador",
  "furadeira", "parafusadeira", "esmerilhadeira", "serra circular", "lavadora de alta pressão", "impressora", "monitor", "monitor gamer",
  "notebook", "tablet", "roteador wifi", "celular",
  // 12/11/2026: sem código no nome, juntados pelo nome (marca + modelo + armazenamento)
  "smartphone", "iphone", "iphone 17", "iphone 16", "iphone 15", "iphone 13", "samsung galaxy", "galaxy a", "galaxy s25", "motorola", "moto g",
  "motorola edge", "xiaomi", "redmi", "redmi note", "poco", "realme", "ipad", "tablet samsung", "kindle", "macbook",
  // 13/11/2026: consoles de videogame
  "xbox", "xbox series", "xbox series s", "xbox series x", "playstation", "playstation 5", "ps5", "ps5 slim", "ps5 pro", "ps4",
  "nintendo switch", "nintendo switch 2", "nintendo switch oled", "nintendo switch lite", "console", "videogame",
];
// ---------------------------------------------------------------------
// CATEGORIA INTEIRA (12/11/2026, Giovanni: "em vez de eu dar sugestões de nomes vamos por categoria; quando ela estiver
// toda feita me avise que escolho outra"). A categoria da vez vai PRIMEIRO na lista do robô: cada tipo de produto com as
// 3 primeiras páginas da busca juntas (anúncio de uma loja na página 1 casa com o de outra na página 3) e, depois,
// produto + marca. Para trocar de categoria: acrescentar em CATEGORIAS_PARA_CASAR e mudar CATEGORIA_DA_VEZ.
// ---------------------------------------------------------------------
const MARCAS_LINHA_BRANCA = ["brastemp", "consul", "electrolux", "samsung", "lg", "midea", "philco", "panasonic", "esmaltec", "britânia"];
const MARCAS_DE_TV = ["samsung", "lg", "tcl", "philco", "hisense", "aoc", "philips", "toshiba", "roku", "britânia", "multilaser", "semp"];
const MARCAS_DE_AR = ["midea", "elgin", "gree", "lg", "samsung", "philco", "springer", "consul", "electrolux", "tcl", "agratto", "hisense"];
export const CATEGORIAS_PARA_CASAR = {
  // Consoles de videogame (13/11/2026); "Consoles" não é categoria do site, é só a lista de buscas para o robô
  Consoles: {
    termos: ["videogame", "console", "xbox", "xbox series", "xbox series s", "xbox series x", "playstation", "playstation 5", "ps5", "ps5 slim", "ps5 pro",
      "ps4", "nintendo switch", "nintendo switch 2", "nintendo switch oled", "nintendo switch lite"],
    marcas: [],
  },
  Eletrodomésticos: {
    termos: ["geladeira", "geladeira frost free", "geladeira duplex", "geladeira inverse", "geladeira side by side", "refrigerador", "freezer",
      "freezer horizontal", "freezer vertical", "frigobar", "adega climatizada", "cervejeira", "fogão", "fogão 4 bocas", "fogão 5 bocas", "fogão 6 bocas",
      "fogão de piso", "fogão de embutir", "cooktop", "cooktop 4 bocas", "cooktop 5 bocas", "cooktop de indução", "forno de embutir", "forno elétrico de embutir",
      "micro-ondas", "micro-ondas de embutir", "coifa", "depurador", "máquina de lavar", "máquina de lavar 12kg", "máquina de lavar 15kg", "lavadora de roupas",
      "lava e seca", "secadora de roupas", "tanquinho", "centrífuga de roupas", "lava-louças", "purificador de água", "bebedouro", "ar condicionado",
      "ar condicionado split", "ar condicionado inverter", "ar condicionado 9000 btus", "ar condicionado 12000 btus", "ar condicionado 18000 btus",
      "ar condicionado janela", "ar condicionado portátil", "climatizador", "ventilador", "ventilador de coluna", "ventilador de mesa", "ventilador de parede",
      "ventilador de teto", "aquecedor elétrico", "smart tv", "tv", "televisão", ...TELAS.map((t) => `smart tv ${t}`), ...TELAS.map((t) => `tv ${t} polegadas`)],
    marcas: [
      [["geladeira", "freezer", "fogão", "cooktop", "micro-ondas", "máquina de lavar", "lava e seca", "lava-louças", "forno de embutir", "frigobar"], MARCAS_LINHA_BRANCA],
      [["smart tv"], MARCAS_DE_TV],
      [["ar condicionado"], MARCAS_DE_AR],
      [["ventilador"], ["arno", "mondial", "britânia", "ventisol", "philco", "mallory", "wap", "cadence"]],
      [["purificador de água"], ["electrolux", "consul", "ibbl", "europa", "lorenzetti"]],
      [["coifa", "depurador"], ["suggar", "fischer", "electrolux", "brastemp", "consul", "tramontina"]],
    ],
  },
  Eletroportáteis: {
    termos: ["air fryer", "fritadeira elétrica", "air fryer forno", "air fryer 12 litros", "liquidificador", "liquidificador 1400w", "batedeira", "batedeira planetária",
      "mixer", "processador de alimentos", "multiprocessador", "espremedor de frutas", "centrífuga de frutas", "cafeteira", "cafeteira elétrica", "cafeteira expresso",
      "cafeteira de cápsula", "moedor de café", "chaleira elétrica", "sanduicheira", "grill elétrico", "torradeira", "máquina de waffle", "pipoqueira elétrica",
      "panela elétrica", "panela de arroz elétrica", "panela de pressão elétrica", "forno elétrico", "forno elétrico de bancada", "fogão elétrico portátil", "cooktop portátil",
      "aspirador de pó", "aspirador vertical", "aspirador de pó sem fio", "robô aspirador", "extratora", "vaporizador de roupas", "ferro de passar", "ferro a vapor",
      "secador de cabelo", "escova secadora", "chapinha", "modelador de cachos", "barbeador elétrico", "aparador de pelos", "máquina de cortar cabelo", "depilador elétrico",
      "escova de dentes elétrica", "umidificador de ar", "purificador de ar", "desumidificador", "máquina de costura", "mop elétrico", "soprador térmico"],
    marcas: [
      [["air fryer", "liquidificador", "batedeira", "cafeteira", "sanduicheira", "mixer", "panela elétrica", "forno elétrico", "ferro de passar", "aspirador de pó"],
        ["mondial", "philco", "britânia", "arno", "oster", "electrolux", "cadence", "black+decker", "philips walita", "multilaser"]],
      [["cafeteira expresso"], ["nespresso", "dolce gusto", "três corações", "oster", "delonghi", "philco"]],
      [["robô aspirador", "aspirador vertical"], ["wap", "xiaomi", "electrolux", "philco", "mondial", "multilaser", "kabum"]],
      [["secador de cabelo", "chapinha", "escova secadora"], ["taiff", "gama", "philco", "mondial", "britânia", "lizz", "mq", "babyliss"]],
      [["barbeador elétrico", "aparador de pelos", "máquina de cortar cabelo"], ["philips", "wahl", "mondial", "braun", "gama", "kemei"]],
    ],
  },
  Ferramentas: {
    termos: ["furadeira", "furadeira de impacto", "furadeira e parafusadeira", "parafusadeira", "parafusadeira a bateria", "chave de impacto", "martelete", "martelo rompedor",
      "esmerilhadeira", "lixadeira", "lixadeira orbital", "politriz", "serra circular", "serra tico-tico", "serra mármore", "serra sabre", "serra de esquadria", "serra de bancada",
      "plaina elétrica", "tupia", "retífica", "micro retífica", "soprador térmico", "soprador de folhas", "aspirador de pó industrial", "lavadora de alta pressão",
      "compressor de ar", "pistola de pintura", "máquina de solda", "inversora de solda", "gerador de energia", "motosserra", "roçadeira", "cortador de grama",
      "aparador de grama", "podador de cerca viva", "pulverizador elétrico", "nível a laser", "trena a laser", "multímetro", "alicate amperímetro", "jogo de ferramentas",
      "kit de ferramentas", "jogo de chaves", "jogo de soquetes", "parafusadeira de impacto", "bomba de água", "motobomba", "betoneira", "esmeril de bancada", "furadeira de bancada",
      "pistola de cola quente", "grampeador elétrico", "pinador", "bateria para ferramentas"],
    marcas: [
      [["furadeira", "parafusadeira", "esmerilhadeira", "serra circular", "serra tico-tico", "martelete", "lixadeira", "chave de impacto"],
        ["bosch", "makita", "dewalt", "black+decker", "stanley", "vonder", "einhell", "wap", "philco", "tramontina", "mondial", "skil"]],
      [["lavadora de alta pressão"], ["wap", "karcher", "bosch", "electrolux", "tramontina", "vonder", "black+decker", "intech machine"]],
      [["compressor de ar", "inversora de solda", "roçadeira", "motosserra", "cortador de grama"], ["schulz", "vonder", "tekna", "toyama", "tramontina", "stihl", "husqvarna", "boxer", "chiaperini", "motomil"]],
    ],
  },
  Celulares: {
    termos: ["celular", "smartphone", "celular 5g", "celular 128gb", "celular 256gb", "celular 512gb", "iphone", "iphone 17", "iphone 17 pro", "iphone 17 pro max", "iphone 16",
      "iphone 16 pro", "iphone 16 pro max", "iphone 16e", "iphone 15", "iphone 15 pro", "iphone 14", "iphone 13", "iphone 12", "iphone 11", "samsung galaxy", "galaxy a",
      "galaxy a07", "galaxy a16", "galaxy a17", "galaxy a26", "galaxy a36", "galaxy a56", "galaxy s24", "galaxy s25", "galaxy s25 ultra", "galaxy s25 fe", "galaxy s26",
      "galaxy z flip", "galaxy z fold", "galaxy m", "motorola", "moto g", "moto g06", "moto g15", "moto g35", "moto g56", "moto g75", "moto g86", "motorola edge",
      "motorola edge 60", "motorola razr", "moto e", "xiaomi", "redmi", "redmi note", "redmi note 14", "redmi note 15", "redmi 15c", "redmi 14c", "redmi a5", "poco", "poco x7",
      "poco c85", "poco f7", "poco m7", "realme", "realme c71", "realme note", "infinix", "tecno", "honor", "oppo", "celular idoso", "celular positivo", "celular multilaser"],
    marcas: [[["celular", "smartphone"], ["samsung", "motorola", "xiaomi", "apple", "realme", "infinix", "honor", "oppo", "positivo", "tecno", "multilaser", "nokia"]]],
  },
  Informática: {
    termos: ["notebook", "notebook gamer", "notebook i5", "notebook i7", "notebook ryzen 5", "notebook ryzen 7", "notebook 16gb", "macbook", "macbook air", "macbook pro",
      "chromebook", "tablet", "tablet samsung", "galaxy tab", "ipad", "ipad air", "ipad pro", "ipad mini", "tablet xiaomi", "redmi pad", "tablet lenovo", "kindle",
      "computador", "pc gamer", "mini pc", "all in one", "monitor", "monitor gamer", "monitor 24", "monitor 27", "monitor 144hz", "monitor ultrawide", "impressora",
      "impressora multifuncional", "impressora tanque de tinta", "impressora laser", "impressora térmica", "roteador wifi", "roteador wifi 6", "roteador mesh", "repetidor wifi",
      "ssd", "ssd 1tb", "ssd nvme", "hd externo", "pen drive", "cartão de memória", "memória ram", "placa de vídeo", "processador", "placa mãe", "fonte atx", "gabinete gamer",
      "water cooler", "teclado", "teclado mecânico", "mouse", "mouse gamer", "mouse sem fio", "webcam", "nobreak", "estabilizador", "projetor", "leitor de código de barras",
      "mesa digitalizadora", "switch de rede", "hub usb"],
    marcas: [
      [["notebook"], ["dell", "lenovo", "acer", "asus", "samsung", "hp", "positivo", "vaio", "apple", "avell", "multilaser"]],
      [["monitor"], ["lg", "samsung", "aoc", "dell", "acer", "philips", "asus", "pichau", "husky", "redragon"]],
      [["impressora"], ["epson", "hp", "canon", "brother", "elgin"]],
      [["tablet"], ["samsung", "xiaomi", "lenovo", "apple", "positivo", "multilaser", "philco"]],
      [["roteador"], ["tp-link", "intelbras", "mercusys", "d-link", "xiaomi", "asus"]],
      [["ssd"], ["kingston", "sandisk", "crucial", "wd", "samsung", "adata", "lexar"]],
      [["placa de vídeo"], ["rtx 4060", "rtx 5060", "rtx 5070", "rx 7600", "rx 9060", "asus", "gigabyte", "msi", "galax"]],
      [["teclado", "mouse"], ["logitech", "redragon", "hyperx", "razer", "dell", "multilaser"]],
    ],
  },
};
// Feitas em 12/11/2026: Eletrodomésticos, Eletroportáteis e Ferramentas (saíram da lista da vez para não gastar a noite
// relendo: os vereditos valem 60 dias e as buscas comuns delas seguem em BUSCAS_EXTRAS e nas prontas)
// 12/11/2026: as 9 categorias abaixo de CATEGORIAS_PARA_CASAR foram feitas inteiras com 4 anúncios por loja (POR_LOJA).
// A lista da vez fica VAZIA para a noite não gastar o tempo relendo tudo (as buscas comuns delas seguem toda noite nas
// prontas e em BUSCAS_EXTRAS; veredito vale 60 dias). Para refazer uma ou fazer categoria nova: pôr o nome aqui
export const CATEGORIAS_DA_VEZ = [];
export const CATEGORIA_DA_VEZ = CATEGORIAS_DA_VEZ.join(" + ");
export const PAGINAS_DA_CATEGORIA = 3;
export function buscasDaCategoria(nome) {
  if (!nome) {
    const vistas = new Set();
    return CATEGORIAS_DA_VEZ.flatMap((n) => buscasDaCategoria(n)).filter((b) => !vistas.has(b.q) && vistas.add(b.q));
  }
  const c = CATEGORIAS_PARA_CASAR[nome];
  if (!c) return [];
  return [...c.termos.map((q) => ({ q, paginas: PAGINAS_DA_CATEGORIA })),
    ...c.marcas.flatMap(([produtos, marcas]) => produtos.flatMap((p) => marcas.map((m) => ({ q: `${p} ${m}` }))))];
}
const VALE_DIAS = 60; // veredito mais velho que isso é perguntado de novo (o anúncio pode ter mudado)

const norm = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
let marcas = null;
// Marcas que só o comparador precisa conhecer (13/11/2026, revisão de Eletrodomésticos, Eletroportáteis e Ferramentas: em
// 39 buscas reais, 3.068 anúncios ficavam sem modelo por "não ter marca"; estas aparecem em 2+ lojas). Não entram em MARCAS
// (lib/vocabulario.js) para não mexer no filtro de marcas nem nas sugestões da busca. Igual em app.js
export const MARCAS_DO_COMPARADOR = ["itatiaia", "ibbl", "roborock", "ecovacs", "irobot", "liectroux", "kemei", "vgr", "braun", "gallant", "gaabor", "sonifer", "biolomix", "vix",
  "eos", "skymsen", "skil", "fricon", "colormaq", "newmaq", "wanke", "praxis", "latina", "tekna", "toyama", "amvox", "braslar", "kian", "intech machine", "boxer", "delonghi",
  "chiaperini", "stihl", "husqvarna", "garthen", "wesco", "libell", "metvisa", "ventisol", "suggar", "fischer", "venax", "dako", "atlas", "mueller", "nespresso", "dolce gusto",
  "nutribullet", "ninja", "tres coracoes", "3 coracoes", "black+decker", "black & decker", "black decker", "einhell", "worx", "schulz", "lavor", "tramontina", "trapp", "songhe"];
const MEDIDA = /^\d+([.,]\d+)?(v|w|l|ml|kg|g|gb|tb|mb|mah|hz|khz|mhz|ghz|btus?|pol|k|p|cm|mm|m|un|pcs?|x|rpm|fps|mp|db|bar|psi|lm|kwh|cv|hp|dpi|ms|bits?|pecas?|em\d)$/;
const TERMO = new Set(["110v", "127v", "220v", "bivolt", "4k", "8k", "5g", "4g", "wifi6", "ipx4", "ipx5", "ipx7", "ip67", "ip68", "1080p", "720p", "2em1", "3em1", "4em1", "5em1", "mp3", "mp4", "hdr10", "hdmi2", "usb3", "usb2", "ddr4", "ddr5", "h264", "h265"]);
export function marcaDoTitulo(titulo) {
  marcas = marcas || [...new Set([...MARCAS, ...MARCAS_DO_COMPARADOR].map((m) => norm(m).replace(/[^a-z0-9]+/g, " ").trim()))].filter((m) => m.length > 1).sort((a, b) => b.length - a.length);
  const t = ` ${norm(titulo).replace(/[^a-z0-9]+/g, " ")} `;
  const m = marcas.find((x) => t.includes(` ${x} `));
  if (m) return m;
  for (const [apelido, dona] of Object.entries(MARCA_APELIDOS)) if (t.includes(` ${apelido} `)) return norm(dona);
  return null;
}
function codigosDoTitulo(titulo, comCurto = false) {
  const longos = codigosLongos(titulo);
  if (longos.length || !comCurto) return longos;
  const curto = codigoCurto(norm(titulo).replace(/[^a-z0-9+.\-/ ]/g, " "));
  return curto ? [curto] : [];
}
function codigosLongos(titulo) {
  const t = norm(titulo).replace(/[^a-z0-9+.\-/ ]/g, " ");
  return t.split(/\s+/).map((p) => p.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, ""))
    .filter((p) => p.length >= 4 && /[a-z]/.test(p) && /\d/.test(p) && !MEDIDA.test(p) && !TERMO.has(p) && !/^\d+x\d+/.test(p)
      && !/^\d+(gb|tb|w|v|l|ml|mah|hz|pol|btus?|kg|g|cm|mm|k|p)(\/|$)/.test(p))
    .map((p) => p.replace(/[^a-z0-9]/g, "")).filter((p) => p.length >= 4 && !NAO_E_CODIGO.test(p));
}
// A mesma chave do Modo comparação (modeloDe em app.js): combo/kit só se junta com o mesmo combo; TV leva o tamanho da tela
export function chaveDoModelo(titulo, comCurto = false) {
  const marca = marcaDoTitulo(titulo);
  if (!marca) return null;
  const t = norm(titulo).replace(/[^a-z0-9+.\-/ ]/g, " ");
  const codigos = codigosDoTitulo(titulo, comCurto);
  if (!codigos.length) return null;
  if (/\s\+\s|\b(kit|combo|conjunto)\b|\b[2-9]\s*(unidades|unid|un|pecas|pcs)\b|\b(2|duas|dois)\s+(smart\s+)?tvs?\b/.test(t)) {
    return `${marca}|combo|${[...new Set(codigos)].sort().join("+")}`;
  }
  const cod = [...codigos].sort((a, b) => b.length - a.length)[0];
  const tela = /\b(tv|televisor|televisao|monitor)\b/.test(t) ? (t.match(/\b(\d{2,3}) ?(pol\b|polegadas)/) || t.match(/\b(?:tv|televisor|led|qled|oled|miniled) (\d{2,3})\b/) || [])[1] || "" : "";
  return `${marca}|${cod}${tela ? `|${tela}` : ""}`;
}

// ---------------------------------------------------------------------
// PARES POR NOME (12/11/2026): celular, smartwatch, tablet, console… quase nunca trazem o código do fabricante no nome
// ("Samsung Galaxy A15 128GB"). Nessas seções a chave é marca + as "palavras de modelo" (as que têm número: a15, s24, 15,
// g54; e pro/max/plus/ultra…) + o armazenamento. É só para achar CANDIDATOS: quem decide é a IA, e o site só mostra
// nessas seções o que ela confirmou. Cópia em public/assets/app.js (nomeDoModelo); testes/casar.mjs confere as duas.
// ---------------------------------------------------------------------
export const SECOES_POR_NOME = new Set(["Celulares"]); // aqui o nome vale antes do código
export const SECOES_NOME_SE_FALTAR = new Set(["Informática"]); // aqui, só sem código
const MEDIDA_NAO_MODELO = MEDIDA;
const TERMO_NAO_MODELO = TERMO;
// >>> nomeDoModelo (igual em lib/casar.js e public/assets/app.js)
// Código curto (13/11/2026, revisão de Eletrodomésticos, Eletroportáteis e Ferramentas): eletroportátil costuma ter código de
// 3 caracteres, quase sempre com hífen ("Mondial L-99", "S-20", "Electrolux IB7", "Samsung Q5F"). Só vale nessas 3 seções e
// quando o anúncio não traz código maior nem dois curtos diferentes. Nunca medida (12v), rosca/bit (M14, T20, PH2), gás
// (R-32), soquete (E27) nem termo comum (mp3, 4k). t = título sem acento, só com letras, números e + . - /
const SECOES_COM_CODIGO_CURTO = new Set(["Eletrodomésticos", "Eletroportáteis", "Ferramentas"]);
const NAO_E_CURTO = /^(m\d\d|t\d\d|r\d\d|e\d\d|ph\d|pz\d|mp\d|ip\d|nr\d|no\d|em\d|aa\d|ps\d|\w\d[dkgvwlxp])$/;
function codigoCurto(t) {
  const achados = [...new Set(t.split(/\s+/).map((p) => p.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "")).filter((p) => /^([a-z]{1,2}-?\d{1,2}|[a-z]\d[a-z])$/.test(p))
    .map((p) => p.replace(/-/g, "")).filter((p) => p.length === 3 && !NAO_E_CURTO.test(p) && !MEDIDA_NAO_MODELO.test(p) && !TERMO_NAO_MODELO.has(p)))];
  return achados.length === 1 ? achados[0] : null;
}
const QUALIFICADOR = new Set(["pro", "max", "plus", "ultra", "lite", "fe", "mini", "note", "edge", "neo", "fold", "flip", "air", "se", "slim", "play", "power", "fusion", "razr"]);
const NAO_E_MODELO_ANTES = new Set(["ram", "camera", "cameras", "tela", "garantia", "memoria", "bateria", "ate", "com", "de", "e", "x", "em", "por", "android", "andoid", "and", "ios", "versao", "nfe", "nf", "windows", "win", "office", "wifi", "bluetooth",
  "interna", "externa", "glass", "shield", "hyperos", "miui", "ui", "lytia", "gen", "geracao", "ou", "ipados", "macos"]);
const DE_CAMERA = new Set(["camera", "cameras", "cam", "tripla", "dupla", "quadrupla", "tela", "display"]);
const NAO_E_MODELO_DEPOIS = new Set(["chips", "chip", "ano", "anos", "meses", "mes", "cores", "cor", "unidades", "unidade", "pecas", "camadas", "cameras", "camera", "polegadas", "pol", "mp", "gb", "tb", "mah", "hz", "w", "v", "mm", "cm", "dias", "nucleos", "em", "x", "jogos", "controles", "controle", "g",
  "ram", "gen", "geracao"]);
// Submarcas: "Redmi Note 15" e "Xiaomi Redmi Note 15" são o mesmo aparelho (12/11/2026: ficavam em chaves diferentes)
const MARCA_MAE = { redmi: "xiaomi", poco: "xiaomi", galaxy: "samsung", moto: "motorola", apple: "iphone" };
// O que tem número no nome do anúncio e NÃO é o modelo (12/11/2026, medido em 2.258 anúncios de celular): processador
// ("Snapdragon 7s Gen 4", "Helio G99-Ultra", "Chip A18"), memória RAM ("8+256", "4GB RAM + 8GB RAM Boost", "256/8GB"),
// soma de câmeras ("50+12+10"), tela ('6, 9"') e frases com ultra/digital que não são do nome
// Código que não é do produto: processador (i5-1335U, 13420H, N4500), memória (DDR4, 512SSD, 256512GB), conexões.
// Em notebook virava a "chave" e juntava aparelhos diferentes com o mesmo processador (12/11/2026)
const NAO_E_CODIGO = /^(i[3579]\d{4,5}[a-z]{0,2}|[3579]\d{4}[a-z]{1,2}|\d{4,5}(u|h|hx|hs|hk|x|x3d|f|k|kf)|n\d{3,4}[a-z]?|l?p?ddr\d\w*|gddr\d|\d+(ssd|hd|hdd|nvme|emmc|ram)|\d+gb\w*|pcie\w*|sata\d|intelcore\w*|ryzen\d\w*|core\d\w*|ci[3579]\d+\w*|usb\d\w*|hdmi\d\w*|wifi\d\w*|win\d+\w*|windows\d+|w1[01]\w*)$/;
// Tablet e iPad chegam sem categoria ou como "Celulares", e impressora, Kindle e roteador muitas vezes sem categoria
// (12/11/2026: "ipad", "tablet" e "impressora" davam 0 grupos). Tablet é lido pelo nome, como celular
// Videogame (13/11/2026, Giovanni: "sim pode colocar videogame no comparador"): só o CONSOLE, não jogos nem acessórios (a
// seção Games tem os três). O anúncio tem que começar pelo console; a chave é família + modelo + edição (digital/disco) +
// armazenamento. Fica sem chave: pacote com jogo, controle a mais, "sem controle", kit. Só para achar candidatos: o site só
// mostra o que a IA confirmou. cod = o que aparece no cartão
function consoleDoTitulo(tituloNormalizado) {
  const t = tituloNormalizado.replace(/[^a-z0-9+ ]/g, " ").replace(/\s+/g, " ").trim();
  const m = t.match(/^(?:novo |nova )?(?:consoles? |video ?game )?(?:microsoft |sony |nintendo )?(?:consoles? )?(xbox series? [sx]|xbox one(?: [sx])?|xbox 360|(?:playstation|ps) ?[45]|nintendo switch)\b(.*)$/);
  if (!m) return null;
  const resto = m[2];
  if (/\+|\b(kit|pacote|bundle|combo|jogos?|games?|gamepass|controles?|headset|volante|meses|mes|limitada|limited|edicao especial|usado|seminovo|caixa|suporte|capa|skin|adesivo|base|cooler|carregador|fonte|cabo|placa|gabinete|carcaca|tampa)\b/.test(resto)) return null;
  let familia = m[1].replace(/^(playstation|ps) ?/, "ps").replace(/^xbox serie /, "xbox series ");
  if (familia.startsWith("ps")) familia += /\bpro\b/.test(resto) ? " pro" : /\bslim\b/.test(resto) ? " slim" : "";
  if (familia === "nintendo switch") familia += /^ 2\b/.test(resto) ? " 2" : /\boled\b/.test(resto) ? " oled" : /\blite\b/.test(resto) ? " lite" : "";
  // Series S é sempre digital; no PS5 e no Series X o digital e o com disco são produtos (e preços) diferentes
  const edicao = /^(ps5|xbox series x)/.test(familia) ? (/\bdigital\b/.test(resto) ? "digital" : /\b(disk|disco|disc|midia fisica|standard|leitor)\b/.test(resto) ? "disco" : "") : "";
  const tamanhos = [...new Set([...resto.matchAll(/\b(\d{2,4}) ?gb\b|\b([1-8]) ?tb\b/g)].map((x) => (x[1] ? `${x[1]}gb` : `${x[2]}tb`)))];
  if (tamanhos.length > 1) return null;
  // Sem a palavra "console" e sem armazenamento nem modelo, pode ser jogo ("Nintendo Switch Sports Resort")
  if (!/\b(consoles?|video ?game)\b/.test(t) && !tamanhos.length && !/ (2|oled|lite|pro|slim)$/.test(familia)) return null;
  const partes = [familia, edicao, tamanhos[0] || ""].filter(Boolean);
  return { chave: `console|${partes.join("|")}`, cod: partes.join(" ").toUpperCase(), marca: familia.startsWith("ps") ? "playstation" : familia.split(" ")[0] };
}
function secaoDeComparar(tituloNormalizado, secao) {
  if ((!secao || secao === "Games" || secao === "Informática") && consoleDoTitulo(tituloNormalizado)) return "Consoles";
  const inicio = tituloNormalizado.replace(/[^a-z0-9 ]/g, " ").trim().split(/\s+/).slice(0, 5).join(" ");
  if ((!secao || secao === "Celulares" || secao === "Informática") && /\b(tablet|ipad|galaxy tab|redmi pad|xiaomi pad)\b/.test(inicio)) return "Celulares";
  if (!secao && /\b(impressora|multifuncional|kindle|roteador|notebook|monitor)\b/.test(inicio)) return "Informática";
  // 13/11/2026: aspirador e robô aspirador chegam como "Limpeza" (o robô já buscava os dois e nunca achava grupo) e
  // ferramenta de jardim sem categoria
  if ((!secao || secao === "Limpeza") && /^(robo )?aspirador\b|^(mini |super )?aspirador\b|\brobo aspirador\b/.test(inicio)) return "Eletroportáteis";
  if (!secao && /^(rocadeira|soprador|aparador de grama|cortador de grama|motosserra|lavadora de alta pressao)\b/.test(inicio)) return "Ferramentas";
  return secao;
}
const PROCESSADOR = /\b(snapdragon|dimensity|helio|unisoc|mediatek|exynos|bionic|tensor|qualcomm)\b[^a-z0-9]*(?:(?!\d+ ?(?:gb|tb|mah|mp|hz|w)\b)(?:elite|gen|geracao|ultra|max|pro|plus|octa|core|4g|5g|[a-z]{0,2}\d\w*)\b[^a-z0-9]*)*/g;
function semRuidoDeFicha(t, marca) {
  // iPad e MacBook: o chip (M3, A16) faz parte do nome do modelo
  const comChip = marca === "ipad" || marca === "macbook" ? t.replace(/\bchip (m\d|a\d\d)\b/g, " $1 ") : t;
  let s = ` ${comChip} `
    .replace(PROCESSADOR, " ")
    // Notebook: do processador fica só a família (i5, r7); o número dele e a geração saem
    .replace(/\b(intel|amd)\b/g, " ")
    .replace(/\bcore[- ]?(ultra[- ]?)?i?([3579])\b[- ]?(\d{3,5}[a-z]{0,2}\b)?/g, " i$2 ")
    .replace(/\bi([3579])[- ]?\d{4,5}[a-z]{0,2}\b/g, " i$1 ")
    .replace(/\bryzen[- ]?(ai[- ]?)?([3579])\b[- ]?(\d{3,4}[a-z]{0,2}\b)?/g, " r$2 ")
    .replace(/\b(celeron|pentium|athlon)\b[^a-z0-9]*(n?\d{3,4}[a-z]?\b)?/g, " ")
    .replace(/\b\d{4,5}(u|h|hx|hs|hk)\b|\bn\d{4}[a-z]?\b|\bm\.2\b/g, " ")
    .replace(/\b\d{2}(\.\d)? ?("|''|”|pol\b|polegadas)/g, " ") // tela de 14", 15.6"
    .replace(/\b(chip|chipset|processador|cpu)\b [a-z]{0,2}\d\w*( pro\b| bionic\b)?/g, " ")
    .replace(/\b\d+a geracao\b( \d\b)?|\bgen \d\b|\b\d gen\b/g, " ")
    .replace(/\d+(\+\d+){2,}( ?mp)?|\d+\+\d+ ?mp/g, " ") // câmeras
    .replace(/\d+, ?\d+ ?("|''|”|pol)/g, " ") // tela 6, 9"
    .replace(/\b\d{1,2} ?(gb)? ?(de )?(ram)? ?\+ ?\d{1,2} ?gb( de)? ?ram( boost)?/g, " ") // 4GB RAM + 8GB RAM Boost
    .replace(/\(\d{1,2} ?\+ ?\d{1,2}\)/g, " ") // 16gb Ram(8+8)
    .replace(/\b\d{1,2} ?(?:gb)? ?(?:de )?(?:ram )?[+/] ?(\d{2,4}) ?(?:gb)?(?![\d/])/g, " $1gb ") // 8+256, 8GB+256GB, 8/256GB
    .replace(/\b(\d{2,4}) ?(?:gb)? ?[+/] ?\d{1,2} ?gb( de)?( ram)?\b/g, " $1gb ") // 256GB+8GB, 256/8GB RAM
    .replace(/\b(\d{2,4}) ?\/ ?(\d{2,4}) ?gb\b/g, " $1gb $2gb ") // 256/512GB: dois tamanhos no mesmo anúncio
    .replace(/\b\d{1,2} ?gb( de)? ram( boost)?\b|\bram( de)? \d{1,2} ?gb\b|\b\d{1,2} ?(gb)?ram\b/g, " ")
    .replace(/\bultra[- ]?(fino|fina|rapid[oa]|brilhante|wide|grande angular|resistente)\b|\bimpressao digital\b/g, " ")
    .replace(/\s\+\s(?=selfie|frontal|camera|cam\b)/g, " ");
  if (marca === "iphone") s = s.replace(/\ba1\d\b( pro\b| bionic\b)?/g, " ");
  return s;
}
function nomeDoModelo(tituloNormalizado, marcaDoAnuncio) {
  // "Apple iPad…" e "iPad…" são a mesma marca para a chave (o mesmo com MacBook)
  const marca = /\bipad\b/.test(tituloNormalizado) ? "ipad" : /\bmacbook\b/.test(tituloNormalizado) ? "macbook" : MARCA_MAE[marcaDoAnuncio] || marcaDoAnuncio;
  if (!marca) return null;
  const t = semRuidoDeFicha(tituloNormalizado, marca);
  // Kit, combo e celular com brinde de valor (relógio, fone) não se comparam com o aparelho sozinho
  if (/\s\+\s|\b(kit|combo|conjunto)\b|\b[2-9]\s*(unidades|unid|un|pecas|pcs)\b|\bgalaxy (fit|buds|watch)|\b(e|com) (fone|smartwatch|relogio)\b/.test(t)) return null;
  // Fora: números com vírgula/ponto (tela 6,7"); "S26+" vira "s26 plus"
  const palavras = t.replace(/\d+[.,]\d+\S*/g, " ").replace(/([a-z0-9])\+(?=\s|$)/g, "$1 plus")
    .replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  const modelo = [];
  for (let i = 0; i < palavras.length; i++) {
    const p = palavras[i];
    if (QUALIFICADOR.has(p)) { if (!DE_CAMERA.has(palavras[i - 1]) && !DE_CAMERA.has(palavras[i - 2])) modelo.push(p); continue; }
    if (!/\d/.test(p) || p.length > 8 || /^(ipx?\d+|\d+atm|\d+anos?|\d+d|\d+[ao]|w(in)?\d+\w*|l?p?ddr\d\w*|gddr\d|usb\d\w*|hdmi\d\w*|wifi\d)$/.test(p) || (MEDIDA_NAO_MODELO.test(p) && !(/^\d\dx$/.test(p) && palavras[i - 1] === "note")) || TERMO_NAO_MODELO.has(p) || /^(19|20)\d\d$/.test(p) || /^\d+x\d+$/.test(p) || /^\dx$/.test(p) || (/^\d+x$/.test(p) && palavras[i - 1] === "zoom") || /^\d{3,}$/.test(p)
      || /^[a-z]+\d{3,}[a-z]+$/.test(p) || /^[a-z]{1,3}\d{4,}[a-z]*$/.test(p) || /^[a-z][a-z0-9]{3,5}bz$/.test(p)) continue; // por último: código do fabricante ("SM-A155M", "XT2503", "MD4D4BZ/A" da Apple)
    if (/^\d+$/.test(p) && (NAO_E_MODELO_ANTES.has(palavras[i - 1]) || NAO_E_MODELO_DEPOIS.has(palavras[i + 1]))) continue;
    modelo.push(p);
  }
  if (!modelo.some((p) => /\d/.test(p))) return null;
  // Armazenamento: "NNN GB" a partir de 32 ou "N TB". Anúncio que lista vários ("128GB / 256GB") não diz qual está à
  // venda por aquele preço: fica sem chave
  const gbs = [...new Set([...t.matchAll(/\b(\d{2,4}) ?gb?\b/g)].map((m) => +m[1]).filter((n) => [32, 64, 128, 256, 512, 1024].includes(n)))];
  const tbs = [...new Set([...t.matchAll(/\b([1-4]) ?tb\b/g)].map((m) => m[1]))];
  if (tbs.length + gbs.length > 1) return null;
  const guarda = tbs.length ? `${tbs[0]}tb` : gbs.length ? `${gbs[0]}gb` : "";
  const unicas = [...new Set(modelo)];
  return { chave: `${marca}|nome|${[...unicas].sort().join("+")}${guarda ? `|${guarda}` : ""}`, cod: [...unicas, guarda].filter(Boolean).join(" ").toUpperCase() };
}
// <<< nomeDoModelo
export { nomeDoModelo, secaoDeComparar, consoleDoTitulo };
// A chave de um anúncio conforme a seção: código do fabricante e/ou nome
export function chaveDaOferta(o) {
  const porNome = () => nomeDoModelo(norm(o.titulo), marcaDoTitulo(o.titulo))?.chave || null;
  const secao = secaoDeComparar(norm(o.titulo), o.secao);
  if (secao === "Consoles") return consoleDoTitulo(norm(o.titulo)).chave;
  if (SECOES_POR_NOME.has(secao)) return porNome();
  return chaveDoModelo(o.titulo, SECOES_COM_CODIGO_CURTO.has(secao)) || (SECOES_NOME_SE_FALTAR.has(secao) ? porNome() : null);
}

// ---------------------------------------------------------------------
// PRODUTOS DE CONSUMO (12/11/2026, Giovanni: "pode fazer essas 3": Pets, Suplementos e Perfumes). Ração, whey e perfume não
// têm código de modelo e a marca muitas vezes nem está na nossa lista. Aqui os candidatos são: mesmo peso/volume no nome +
// nomes parecidos (as palavras RARAS da busca em comum: numa busca de "ração golden", "golden" não diz nada; "fórmula",
// "seleção", "castrados" dizem). Quem decide é a IA. O site não repete esta conta: nessas seções ele junta só pelos
// vereditos "igual" entre os anúncios que tem na tela (SECOES_POR_VEREDITO em app.js).
// ---------------------------------------------------------------------
// DESLIGADO em 12/11/2026 (noite): feita a 1ª rodada (765 pares iguais), o Giovanni preferiu o foco nas 5 categorias
// principais. Para religar uma seção: pôr o nome aqui e em SECOES_POR_VEREDITO (app.js)
export const SECOES_DE_CONSUMO = new Set();
const VARIOS = /\s\+\s|\b(kit|combo|conjunto)\b|\b[2-9]\d*\s?x\b|\bx\s?[2-9]\b|\b([2-9]|\d\d+)\s*(unidades|unid|un|pecas|pcs|frascos|potes|pacotes|sacos|latas|caixas)\b/;
const QUANTIDADE = /(\d+(?:[.,]\d+)?)\s?(kg|quilos?|gramas?|gr|g|mg|ml|litros?|l|capsulas?|caps|comprimidos?|comp|tabletes?|pastilhas?|pipetas?)\b/g;
// O tamanho do produto tirado do nome: o maior peso (em gramas); sem peso, o maior volume (ml); sem os dois, as cápsulas
export function tamanhoDoTitulo(tituloNormalizado) {
  let gramas = 0, ml = 0, caps = 0;
  for (const [, numero, unidade] of tituloNormalizado.matchAll(QUANTIDADE)) {
    const n = Number(numero.replace(",", "."));
    if (!(n > 0)) continue;
    if (/^(kg|quilo)/.test(unidade)) gramas = Math.max(gramas, Math.round(n * 1000));
    else if (/^g/.test(unidade)) gramas = Math.max(gramas, Math.round(n));
    else if (unidade === "ml") ml = Math.max(ml, Math.round(n));
    else if (/^l/.test(unidade)) ml = Math.max(ml, Math.round(n * 1000));
    else if (unidade !== "mg") caps = Math.max(caps, Math.round(n));
  }
  return gramas ? `${gramas}g` : ml ? `${ml}ml` : caps ? `${caps}un` : null;
}
const SEM_PESO = new Set(["de", "da", "do", "das", "dos", "para", "pra", "com", "sem", "em", "por", "ao", "no", "na", "sabor", "un", "the", "of", "for", "by", "eau"]);
const MESMA_PALAVRA = { caes: "cao", cachorro: "cao", cachorros: "cao", dog: "cao", dogs: "cao", gatos: "gato", cat: "gato", cats: "gato", felinos: "gato", felino: "gato",
  filhotes: "filhote", puppy: "filhote", kitten: "filhote", junior: "filhote", idosos: "senior", idoso: "senior", men: "masculino", man: "masculino", homme: "masculino",
  masc: "masculino", women: "feminino", woman: "feminino", femme: "feminino", fem: "feminino", her: "feminino", parfum: "edp", toilette: "edt", cologne: "colonia",
  isolate: "isolado", isolada: "isolado", concentrada: "concentrado", hidrolisada: "hidrolisado", workout: "treino" };
export function palavrasDoTitulo(tituloNormalizado) {
  const t = tituloNormalizado.replace(/\beau de parfum\b/g, " edp ").replace(/\beau de toilette\b/g, " edt ").replace(QUANTIDADE, " ").replace(/[^a-z0-9 ]/g, " ");
  return new Set(t.split(/\s+/).filter((p) => p.length >= 2 && !SEM_PESO.has(p)).map((p) => MESMA_PALAVRA[p] || (p.length > 4 && /[a-z]s$/.test(p) ? p.slice(0, -1) : p)));
}
// Grupos de candidatos de uma seção de consumo: mesmo tamanho e, das palavras raras, pelo menos metade das do nome mais curto
const PARECIDO = 0.5;
export function gruposDeConsumo(ofertas) {
  const validas = ofertas.map((o) => { const t = norm(o.titulo); return VARIOS.test(t) ? null : { o, tamanho: tamanhoDoTitulo(t), palavras: palavrasDoTitulo(t) }; })
    .filter((x) => x && x.tamanho);
  // Palavra que está em mais de 30% dos anúncios da busca não distingue um produto do outro
  const vezes = new Map();
  for (const x of validas) for (const p of x.palavras) vezes.set(p, (vezes.get(p) || 0) + 1);
  const comum = validas.length >= 10 ? validas.length * 0.3 : Infinity;
  for (const x of validas) x.raras = new Set([...x.palavras].filter((p) => vezes.get(p) <= comum));
  const grupos = [];
  for (const x of validas.filter((v) => v.raras.size).sort((a, b) => a.raras.size - b.raras.size || a.o.preco - b.o.preco)) {
    let melhor = null, nota = 0;
    for (const g of grupos) {
      if (g.tamanho !== x.tamanho) continue;
      const juntas = [...g.raras].filter((p) => x.raras.has(p)).length;
      const parecido = juntas / Math.min(g.raras.size, x.raras.size);
      if (juntas && parecido >= PARECIDO && parecido > nota) { melhor = g; nota = parecido; }
    }
    if (melhor) melhor.ofertas.push(x.o); else grupos.push({ tamanho: x.tamanho, raras: x.raras, ofertas: [x.o] });
  }
  return grupos.map((g) => g.ofertas);
}

export const idDoPar = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
export const ehIgual = (veredito) => veredito === "igual" || veredito === "igual_outra_voltagem";

// Usado/recondicionado não entra (print do Giovanni, 12/11/2026, "galaxy s24": o mais barato da Shopee era "Usado: Galaxy S24…
// Trocafy", a IA dizia "diferente" do novo do ML e o S24 novo da própria Shopee nem chegava a ser comparado). Igual em app.js
export const USADO = /\b(usad[oa]s?|seminov[oa]s?|semi nov[oa]s?|recondicionad[oa]s?|reembalad[oa]s?|open box|mostruario|refurbished|trocafy)\b/;
// Grupos de 2+ lojas com o mesmo modelo. De cada loja entram os anúncios mais baratos (até POR_LOJA), não só o mais barato
// (Giovanni, 12/11/2026: "não é se apegar só ao produto mais barato, tem que pegar geral"): se o mais barato de uma loja for
// outra coisa, o seguinte ainda casa. Do mais barato para o mais caro
export const POR_LOJA = 4;
export const MAX_DO_GRUPO = 16;
export function gruposDaBusca(ofertas) {
  const grupos = new Map();
  const deConsumo = new Map();
  for (const o of ofertas) {
    if (!o.bate || o.acessorio || o.parecido || !(o.preco > 0) || !o.id || USADO.test(norm(o.titulo))) continue;
    if (SECOES_DE_CONSUMO.has(o.secao)) { deConsumo.set(o.secao, [...(deConsumo.get(o.secao) || []), o]); continue; }
    if (!SECOES_COMPARAVEIS.has(secaoDeComparar(norm(o.titulo), o.secao))) continue;
    const chave = chaveDaOferta(o);
    if (!chave) continue;
    const g = grupos.get(chave) || new Map();
    g.set(o.loja, [...(g.get(o.loja) || []), o]);
    grupos.set(chave, g);
  }
  // Seções de consumo: os grupos vêm prontos (gruposDeConsumo); daqui em diante é igual (2+ lojas, mais baratos de cada loja)
  let n = 0;
  for (const daSecao of deConsumo.values()) for (const g of gruposDeConsumo(daSecao)) {
    const porLoja = new Map();
    for (const o of g) porLoja.set(o.loja, [...(porLoja.get(o.loja) || []), o]);
    grupos.set(`consumo|${n++}`, porLoja);
  }
  return [...grupos.values()].filter((g) => g.size >= 2)
    .map((g) => [...g.values()].flatMap((daLoja) => daLoja.sort((a, b) => a.preco - b.preco).slice(0, POR_LOJA)).sort((a, b) => a.preco - b.preco).slice(0, MAX_DO_GRUPO));
}

// Próximo par do grupo que ainda precisa de pergunta. Os "iguais" formam conjuntos; não pergunta dois anúncios que já
// estão no mesmo conjunto nem dois de conjuntos que já têm um "diferente"/"não sei" entre si, nem dois da mesma loja
export function proximoPar(grupo, vereditos) {
  const dono = new Map(grupo.map((o) => [o.id, o.id]));
  const raiz = (id) => { while (dono.get(id) !== id) id = dono.get(id); return id; };
  const pares = [];
  for (let i = 0; i < grupo.length; i++) for (let j = i + 1; j < grupo.length; j++) pares.push([grupo[i], grupo[j], vereditos.get(idDoPar(grupo[i].id, grupo[j].id))]);
  for (const [a, b, v] of pares) if (ehIgual(v)) dono.set(raiz(a.id), raiz(b.id));
  const separados = new Set();
  for (const [a, b, v] of pares) if (v && !ehIgual(v)) separados.add(idDoPar(raiz(a.id), raiz(b.id)));
  for (const [a, b, v] of pares) if (!v && a.loja !== b.loja && raiz(a.id) !== raiz(b.id) && !separados.has(idDoPar(raiz(a.id), raiz(b.id)))) return { a, b };
  return null;
}

const INSTRUCOES = `Você confere anúncios de lojas brasileiras para um comparador de preços. Recebe dois anúncios (nome e preço) de lojas diferentes e diz se são EXATAMENTE o mesmo produto, de modo que comparar o preço dos dois seja justo.
- "igual": mesma marca, mesmo modelo, mesma capacidade/tamanho/armazenamento/memória e mesmo conteúdo (não é kit de um lado e peça avulsa do outro). Cor diferente ainda é "igual".
- "igual_outra_voltagem": tudo igual, mas um anúncio diz 110/127V e o outro diz 220V. Se só um informa a voltagem (ou nenhum), é "igual".
- "diferente": modelo, tamanho, capacidade, armazenamento, geração, processador, sistema operacional (Linux contra Windows) ou conteúdo diferentes; kit/combo contra unidade; acessório ou peça contra o produto; produto recondicionado/usado contra novo.
- "nao_sei": os nomes não dão informação suficiente para decidir.
Ração, suplemento, perfume, remédio veterinário e outros produtos de consumo: é "igual" só com a mesma marca, a mesma linha, o mesmo peso/volume/quantidade de doses, a mesma indicação (filhote ou adulto, porte, cães ou gatos, faixa de peso do animal, masculino ou feminino) e a mesma concentração (colônia, eau de toilette, eau de parfum). Sabor ou fragrância de um mesmo suplemento/ração conta como cor: ainda é "igual". Perfume "inspirado em", contratipo ou similar contra o original é "diferente". Se um dos anúncios lista vários tamanhos ou não diz o tamanho, é "nao_sei".
Quando os dois trazem o mesmo código de modelo do fabricante, palavras diferentes para descrever o formato não fazem o produto ser outro. Preço muito diferente é um sinal de produto diferente, mas não decide sozinho. Responda só com o JSON pedido; "motivo" em até 12 palavras.`;
const ESQUEMA = { type: "object", additionalProperties: false, required: ["veredito", "motivo"],
  properties: { veredito: { type: "string", enum: ["igual", "igual_outra_voltagem", "diferente", "nao_sei"] }, motivo: { type: "string" } } };

// Pergunta um par à IA (API da Anthropic direto, sem biblioteca: é só um pedido HTTPS)
export async function perguntarPar(chave, par, pedir = fetch) {
  const r = await pedir("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": chave, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODELO_IA, max_tokens: 300,
      output_config: { effort: "low", format: { type: "json_schema", schema: ESQUEMA } },
      system: INSTRUCOES,
      messages: [{ role: "user", content: `Anúncio 1 (${par.a.lojaNome || par.a.loja}), R$ ${par.a.preco}: ${String(par.a.titulo).slice(0, 220)}\nAnúncio 2 (${par.b.lojaNome || par.b.loja}), R$ ${par.b.preco}: ${String(par.b.titulo).slice(0, 220)}` }],
    }),
  });
  if (!r.ok) throw new Error(`IA respondeu ${r.status}: ${(await r.text()).slice(0, 160)}`);
  const msg = await r.json();
  const texto = (msg.content || []).find((b) => b.type === "text")?.text || "{}";
  const { veredito, motivo } = JSON.parse(texto);
  return { veredito, motivo: String(motivo || "").slice(0, 120), entrada: msg.usage?.input_tokens || 0, saida: msg.usage?.output_tokens || 0 };
}

export async function criarTabelas(db) {
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS casados (par TEXT PRIMARY KEY, a TEXT NOT NULL, b TEXT NOT NULL, veredito TEXT NOT NULL, motivo TEXT, quando INTEGER NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS casados_buscas (q TEXT NOT NULL, par TEXT NOT NULL, PRIMARY KEY (q, par)) WITHOUT ROWID"),
    db.prepare("CREATE INDEX IF NOT EXISTS casados_a ON casados (a)"),
  ]);
}
export const chaveDaBusca = (q) => String(q || "").toLowerCase().trim().replace(/\s+/g, " ").slice(0, 100);
const emPartes = (lista, n) => Array.from({ length: Math.ceil(lista.length / n) }, (_, i) => lista.slice(i * n, i * n + n));

// O que o site lê: os pares conferidos de uma busca, [idA, idB, 1 = mesmo produto | 0 = não]
export async function casadosDaBusca(db, q) {
  const r = await db.prepare("SELECT c.a, c.b, c.veredito FROM casados_buscas b JOIN casados c ON c.par = b.par WHERE b.q = ? LIMIT 2000").bind(chaveDaBusca(q)).all();
  return (r.results || []).map((l) => [l.a, l.b, ehIgual(l.veredito) ? 1 : 0]);
}

// O que o site lê desde 12/11/2026: os pares conferidos ENTRE os anúncios que ele tem na tela (ids), venham da busca que
// vierem (o veredito de "smart tv" vale em "smart tv 55" e em "tv samsung"; busca com ou sem acento dá no mesmo)
export async function casadosDosIds(db, ids) {
  const lista = [...new Set(ids.map(String))].filter((id) => id && id.length <= 80 && !id.includes("|")).slice(0, 1000);
  if (lista.length < 2) return [];
  const tem = new Set(lista);
  const respostas = await db.batch(emPartes(lista, 90).map((p) => db.prepare(`SELECT a, b, veredito FROM casados WHERE a IN (${p.map(() => "?").join(",")})`).bind(...p)));
  return respostas.flatMap((r) => r.results || []).filter((l) => tem.has(l.b)).map((l) => [l.a, l.b, ehIgual(l.veredito) ? 1 : 0]);
}

// Um passo do robô = uma busca: monta os grupos, pergunta os pares sem veredito (5 grupos por vez, até PARES_POR_PASSO
// e ~20 s) e grava. "resta" = a busca ainda tem par para perguntar (o robô chama de novo a mesma parte)
export async function passoDeCasar(env, busca, ofertasDaBusca, { teto = TETO_DA_NOITE_US, pedir = fetch, agora = Date.now() } = {}) {
  if (!env.ANTHROPIC_API_KEY) return { erro: "ANTHROPIC_API_KEY não está cadastrada no Cloudflare" };
  const grupos = gruposDaBusca(await ofertasDaBusca(busca.q));
  const saida = { q: busca.q, grupos: grupos.length, perguntados: 0, iguais: 0, diferentes: 0, entrada: 0, saida: 0, erros: 0, ultimoErro: "", resta: false };
  if (!grupos.length) return saida;
  await criarTabelas(env.DB);
  const ids = [...new Set(grupos.flatMap((g) => g.flatMap((a, i) => g.slice(i + 1).map((b) => idDoPar(a.id, b.id)))))];
  const vereditos = new Map();
  for (const parte of emPartes(ids, 90)) {
    const r = await env.DB.prepare(`SELECT par, veredito FROM casados WHERE quando > ? AND par IN (${parte.map(() => "?").join(",")})`)
      .bind(agora - VALE_DIAS * 864e5, ...parte).all();
    for (const l of r.results || []) vereditos.set(l.par, l.veredito);
  }
  const novos = [];
  const prazo = Date.now() + 20e3;
  const fila = [...grupos];
  const falhos = new Set();
  let seguidos = 0;
  await Promise.all(Array.from({ length: 5 }, async () => {
    for (let g = fila.shift(); g; g = fila.shift()) {
      for (let par = proximoPar(g, vereditos); par; par = proximoPar(g, vereditos)) {
        if (seguidos >= 2) break;
        if (saida.perguntados >= PARES_POR_PASSO || Date.now() > prazo || custoDaIa(saida.entrada, saida.saida) >= teto) { saida.resta = true; break; }
        saida.perguntados++;
        try {
          const r = await perguntarPar(env.ANTHROPIC_API_KEY, par, pedir);
          if (!["igual", "igual_outra_voltagem", "diferente", "nao_sei"].includes(r.veredito)) throw new Error("resposta da IA sem veredito");
          saida.entrada += r.entrada; saida.saida += r.saida;
          const id = idDoPar(par.a.id, par.b.id);
          vereditos.set(id, r.veredito);
          novos.push({ id, veredito: r.veredito, motivo: r.motivo });
          if (ehIgual(r.veredito)) saida.iguais++; else saida.diferentes++;
          seguidos = 0;
        } catch (erro) {
          // Erro num par (resposta cortada da IA): pula só ESTE par nesta rodada e segue o grupo (antes o grupo inteiro
          // ficava para a noite seguinte; auditoria de 13/11/2026). Não é gravado: volta a ser perguntado na próxima.
          // Com 2 erros seguidos (IA fora do ar) o passo para, para não gastar a rodada em erro
          saida.erros++; seguidos++; saida.ultimoErro = String(erro?.message || erro).slice(0, 200);
          const id = idDoPar(par.a.id, par.b.id);
          vereditos.set(id, "nao_sei"); falhos.add(id);
          if (seguidos >= 2) break;
        }
      }
    }
  }));
  const q = chaveDaBusca(busca.q);
  const comandos = [
    ...novos.map((n) => env.DB.prepare("INSERT OR REPLACE INTO casados (par, a, b, veredito, motivo, quando) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(n.id, ...n.id.split("|"), n.veredito, n.motivo, agora)),
    // Os pares desta busca: troca a lista toda (anúncio que saiu da busca não fica para trás)
    env.DB.prepare("DELETE FROM casados_buscas WHERE q = ?").bind(q),
    ...ids.filter((id) => vereditos.has(id) && !falhos.has(id)).map((id) => env.DB.prepare("INSERT OR IGNORE INTO casados_buscas (q, par) VALUES (?, ?)").bind(q, id)),
  ];
  for (const parte of emPartes(comandos, 80)) await env.DB.batch(parte);
  return saida;
}
