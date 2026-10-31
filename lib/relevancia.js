// Separa o produto buscado dos acessórios e peças dele, e põe primeiro o que bate com a busca.
// Ex.: buscando "air fryer oster", "Oster Fritadeira Air Fryer 4,6L" é o produto;
// "Motor 127v Fritadeira Oster", "Tapete de Silicone para Air Fryer" e "Crisping Plate for Ninja Air Fryer"
// são acessórios. O site mostra os acessórios só se o visitante pedir (ou se só houver acessórios).
import { normalizar } from "./texto.js";
import { categoriaDoProduto, ehDeCarro, PALAVRAS_VAZIAS } from "./categorias.js";
import { MARCAS } from "./vocabulario.js";

// Peças/acessórios "certeiros": no começo do título já indicam que não é o produto
// ("Motor 127v Fritadeira Oster", "Botão Knob para Liquidificador Oster")
const PECAS = new Set(`
  acessorio adaptador adesivo borracha botao cabo capa capinha carregador conector correia engrenagem filtro forro
  fusivel gaxeta helice interruptor knob lamina mangueira mola motor peca pelicula placa protetor puxador refil
  reparo resistencia rodizio suporte tampa tapete termostato vedacao ventoinha
  skin sticker enfeite
  filamento magnetron capacitor diodo display membrana lampada valvula temporizador prato detector
  evaporadora evaporador condensador condensadora radiador difusor compressor ima comando blower
  viseira visor palmilha cadarco
  eletrobomba bomba agitador embreagem atuador pressostato nivelador pezinho rolamento dosador tirante carcaca
  bateria bit broca carvao mandril ponteira soquete
  limpa limpador desengordurante espuma
  accessories accessory adapter button case charger cover filter gasket knob liner part parts protector
  replacement seal spare
`.trim().split(/\s+/));

// Genéricas: só contam logo antes do produto buscado ("Cesto Air Fryer"), porque sozinhas podem ser
// o próprio produto numa busca por marca ("Copo Stanley", "Assadeira Tramontina")
const GENERICAS = new Set(`
  alca anel assadeira bandeja cesto cobertura controle descanso divisoria estojo forma forminha grade grelha jarra
  luva mochila organizador painel papel pegador pinca saco sensor travessa
  copo teclado cooler pneu camara selim pedal tela fonte
  basket holder mat pan paper plate rack skin stand tray
`.trim().split(/\s+/));

// Palavras de acessório logo DEPOIS do produto buscado (títulos em inglês: "Air Fryer Liners").
// Sem "kit" nem "tampa": "Jogo de Panelas … Kit Cozinha", "Body Bebê Kit 5" e "Pote Hermético … Tampa Bambu" são o produto
const DEPOIS = new Set(`
  accessories accessory basket case cover filter insert liner mat pan paper part parts plate rack
  replacement tray papel forro tapete forma acessorio capa capinha pelicula
  grelha assadeira forminha bandeja silicone limpador oil drip reposicao
  adesivo skin sticker enfeite suporte pe pes almofada frigideira coletor nivelador niveladores
  cabide cabides
`.trim().split(/\s+/));
// Material/óleo depois do termo só indica acessório em eletroportátil ("Air Fryer Silicone Pot");
// "Mordedor Bebê Silicone" e "Vassoura Mágica … Rodo de Silicone" são o produto
const SO_EM_APARELHOS = new Set(["silicone", "oil", "drip"]);
// Depois destas palavras vem o que acompanha o produto: "Air Fryer … com Grelha", "Garrafa … com Tampa"
const ACOMPANHA = new Set(["com", "c", "e", "acompanha", "with", "inclui"]);
// Com brinde, capinha e película são presente: "Celular Samsung … Capinha e Película de Brinde"
const BRINDE = /(^| )(brindes?|gratis)( |$)/;

// Em qualquer lugar do título já indicam acessório: "Oil Drip Tray for Chefman", "Espumagic Limpador para Air Fryer"
// (menos quando o título começa pelo produto buscado: "Fone Bluetooth … Compatível com iPhone", "Smart Watch for Android")
const EM_QUALQUER_LUGAR = new Set(["for", "compativel", "compatible", "fits", "limpador", "desengordurante", "protetor", "protetora",
  // Peças e conserto ("Kit 10 Filamento Microondas Reparo Magnetron"); "dedicado" = "próprio para", tradução da AliExpress
  "reparo", "conserto", "substituicao", "reposicao", "dedicado", "dedicada", "magnetron", "capacitor", "filamento", "diodo",
  "membrana", "interruptor", "placa"]);

// Peças que nunca são o produto, mesmo com o título começando por ele (17/10/2026, buscas reais):
// "Forno de microondas motor síncrono", "Impressora 3D … cabeça de extrusão", "… bicicleta 67cm tubo interno"
const PECAS_SEMPRE = new Set(["sincrono", "extrusora", "extrusao", "hotend", "nozzle", "tester", "testador", "expansor"]);
const FRASES_DE_PECA = /(^| )tubos? (interno|internos|externo|externos)( |$)/;
// "Midea panela de pressão elétrica anel de borracha anel de vedação" (R$ 51, auditoria de 27/10/2026); depois de "com" é o
// que vem junto ("Panela de Pressão … com anel de vedação extra")
const PECA_SEM_COM = /(^| )(anel|aneis|borracha|borrachas|kit) de vedacao( |$)/;
// Peça só quando é a 1ª palavra: "Pé Máquina De Lavar Nivelador" (em "Meias de pé" e "dedo do pé" é o produto);
// "Chaveiro de Pelúcia … Stanley" na busca "stanley" (em "Labubu Chaveiro Pelúcia" é o produto)
const PECAS_NA_FRENTE = new Set(["pe", "pes", "chaveiro", "chaveiros"]);

// Brinquedo que imita o produto ("Airfryer de Brinquedo", "Mini Geladeira Mini Brands … Colecionável"):
// escondido, a não ser que a busca seja de brinquedo
const BRINQUEDO = new Set(["brinquedo", "brinquedos", "miniatura", "colecionavel", "colecionaveis", "boneca", "bonecas"]);
// Marcas de brinquedo: "Geladeira Our Generation Perfectly Fresh" é geladeira de boneca (Candide, print "geladeira", 27/10/2026)
const MARCA_DE_BRINQUEDO = /(^| )(our generation|polly pocket|baby alive|sylvanian|mini brands|playmobil|hot wheels)( |$)/;
// "for" de público não é acessório: "Perfume For Men", "For Unisex"
const PUBLICO = new Set(["men", "man", "women", "woman", "him", "her", "kids", "unisex"]);
const RE_PUBLICO = new RegExp(`(^| )for (?=(${[...PUBLICO].join("|")})( |$))`, "g");

// "para air fryer", "for air fryer", "compatível com air fryer", "p/ air fryer": vale até 8 palavras antes
// da 1ª vez que o termo aparece ("Adequado para Volvo XC90 2015-2024 painel de saída de ar condicionado")
const LIGACOES = new Set(["para", "pra", "p", "for", "compativel", "compatible", "fits", "adequado", "serve"]);

const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const VAZIAS = [...PALAVRAS_VAZIAS].join("|");
// A palavra e seus singulares possíveis: "tapetes" -> "tapete", "botoes" -> "botao", "vedacoes" -> "vedacao"
const formas = (p) => [p, p.replace(/s$/, ""), p.replace(/es$/, ""), p.replace(/oes$/, "ao")];
const temNa = (lista) => (p) => formas(p).some((f) => lista.has(f));
const ehPeca = temNa(PECAS);
const ehGenerica = temNa(GENERICAS);
const ehDepois = temNa(DEPOIS);
// Palavras de verdade do começo do título (pula números, medidas e artigos: "2 Tapetes", "O Botão")
const IGNORAR = new Set(["o", "a", "os", "as", "de", "do", "da", "com", "e", "kit"]);
const comeco = (palavras) => palavras.filter((p) => !/\d/.test(p) && !IGNORAR.has(p)).slice(0, 2);

// Jeitos diferentes de escrever a mesma coisa (pesquisa dos termos mais buscados, 16/10/2026).
// Vale só para comparar busca e título: "celular samsung" acha "Smartphone Samsung Galaxy A06",
// "ps5" acha "Console PlayStation 5", "tv 55 polegadas" acha "Smart TV 55\" LG"
const SINONIMOS = [
  [/(^| )smart ?phones?( |$)/g, "$1celular$2"],
  [/(^| )celulares( |$)/g, "$1celular$2"],
  [/(^| )capinhas?( |$)/g, "$1capa$2"],
  [/(^| )capas( |$)/g, "$1capa$2"],
  [/(^| )smart ?watch(es)?( |$)/g, "$1smartwatch$3"],
  [/(^| )relogio inteligente( |$)/g, "$1smartwatch$2"],
  [/(^| )play ?station ?5( |$)/g, "$1ps5$2"],
  [/(^| )ps 5( |$)/g, "$1ps5$2"],
  [/(^| )(televisao|televisor|televisores)( |$)/g, "$1tv$3"],
  [/(^| )refrigerador(es)?( |$)/g, "$1geladeira$3"],
  [/(^| )laptops?( |$)/g, "$1notebook$2"],
  [/(^| )micro ondas( |$)/g, "$1microondas$2"],
  // "Lavadora Eletrolux 12kg" é máquina de lavar; "Lavadora de Alta Pressão" e "Lava-louças" não
  [/(^| )lavadoras?(?: de roupas?)?(?! (?:de |a )?(?:alta|pressao|louca|loucas|piso|carro|extratora|ultrassonica))( |$)/g, "$1maquina de lavar$2"],
  // "Joystick" e "Gamepad" são o controle do videogame (pedido do Giovanni, 17/10/2026)
  [/(^| )(joysticks?|gamepads?|controles)( |$)/g, "$1controle$3"],
  // "Kit Skin Care" é skincare ("skin" sozinho é adesivo de console)
  [/(^| )skin ?care( |$)/g, "$1skincare$2"],
  [/(^| )sneakers?( |$)/g, "$1tenis$2"], // títulos traduzidos da AliExpress ("Adidas Superstar … Sneakers")
  [/(^| )electrolux( |$)/g, "$1eletrolux$2"], // muita gente escreve "eletrolux" (print de 17/10/2026)
  [/(^| )(\d+) ?(polegadas?|pol)( |$)/g, "$1$2$4"],
  // Títulos traduzidos da AliExpress (17/10/2026)
  [/(^| )fritadeiras?( eletricas?)?( digital| inteligente)? (a|de|sem) (ar|oleo)( |$)/g, "$1air fryer$6"],
  [/(^| )(baterias? (portatil|portateis|externas?)|carregador(es)? portat(il|eis))( |$)/g, "$1power bank$6"],
];
// Palavras grudadas pelo vendedor: "SUPORTEDECONTROLE-PS5" vira "suporte de controle ps5" (print "ps5", 27/10/2026).
// Só peça/genérica + de/do/da/para + 4 letras ou mais ("Capadocia" e "Formadora" ficam como estão)
const GRUDADA = new RegExp(`(^| )(${[...PECAS, ...GENERICAS].filter((p) => p.length >= 4).join("|")})(de|do|da|para|pra)([a-z0-9]{4,})(?= |$)`, "g");
export function comSinonimos(texto) {
  let t = normalizar(texto).replace(GRUDADA, "$1$2 $3 $4");
  for (const [re, troca] of SINONIMOS) t = t.replace(re, troca).replace(re, troca);
  return t;
}

// Palavras da busca sem "de/do/para…": "jogo de panelas" -> jogo, panelas (se sobrar alguma)
function termosDaBusca(q) {
  const todos = normalizar(q).split(" ").filter(Boolean);
  const cheios = todos.filter((t) => !PALAVRAS_VAZIAS.has(t));
  return cheios.length ? cheios : todos;
}

// Marca e produto separados (ideia do Giovanni, 19/10/2026): em "mondial air fryer" o produto é "air fryer" e a marca
// só filtra. Sem isso, a busca com a marca na frente procurava títulos começando por "Mondial" (0 de 220 reconhecidos;
// "air fryer mondial" tinha 58). Busca só de marca ("mondial") continua como antes
// Com os sinônimos aplicados também ("electrolux" vira "eletrolux" na comparação)
const MARCA = new Set(MARCAS.flatMap((m) => [normalizar(m), comSinonimos(m)]).filter((m) => !m.includes(" ")));
const ehMarca = (p) => MARCA.has(p);
function produtoDaBusca(termos) {
  const produto = termos.filter((t) => !ehMarca(t));
  return produto.length ? produto : termos;
}
// Busca com marca (pedido do Giovanni, 31/10/2026: "smart tv lg" mostrava Samsung no filtro de marcas): produto em que
// OUTRA marca aparece antes da buscada é de outra marca ou é peça "para Samsung LG Philco…" e vai para "Ver também".
// Submarcas contam como a marca dona ("Galaxy" = Samsung, "iPhone" = Apple, "Walita" = Philips)
const DONO_DA_MARCA = { galaxy: "samsung", iphone: "apple", ipad: "apple", macbook: "apple", airpods: "apple", redmi: "xiaomi",
  poco: "xiaomi", walita: "philips", shark: "ninja" };
// Marca que também é palavra comum ou código ("Cômoda … HP" = medida): só vale nas 3 primeiras palavras
const MARCA_AMBIGUA = new Set(["golden", "premier", "growth", "fame", "gama", "atlas", "continental", "reserva", "tomate", "honor",
  "poco", "mac", "creamy", "estrela", "hercules", "pioneiro", "skala", "democrata", "pegada", "moleca", "ipanema", "melissa",
  "kappa", "oxo", "fischer", "darkness", "dux", "hp", "ninja", "fila", "positivo", "alexa", "galaxy"]);
const donoDa = (p) => DONO_DA_MARCA[p] || p;
// Marcas do título, na ordem: [{ marca (dona), i (posição), para (vem logo depois de "para/compatível…") }]
const ANTES_DE_COMPATIVEL = new Set(["para", "p", "compativel", "compatível", "for", "serve", "adequado", "adequada"]);
function marcasDoTitulo(titulo) {
  const palavras = comSinonimos(titulo).split(" ");
  const achadas = [];
  for (let i = 0; i < palavras.length; i++) {
    const p = palavras[i];
    if ((ehMarca(p) || DONO_DA_MARCA[p]) && (i < 3 || !MARCA_AMBIGUA.has(p))) {
      achadas.push({ marca: donoDa(p), i, para: ANTES_DE_COMPATIVEL.has(palavras[i - 1]) });
    }
  }
  return achadas;
}
// Produto de outra marca numa busca com marca. Três casos:
// 1) outra marca logo no começo ("Air Fryer Philco …" em "air fryer mondial")
// 2) a marca buscada nem aparece e outra aparece ("Fone … Lenovo" em "fone jbl")
// 3) na busca de produto, as marcas vêm depois de "para/compatível" ("TV … para Samsung LG Sony": não é uma TV LG)
// "Smartphone Edge 60 … Câmera Sony … Motorola" fica (a Sony vem no fim e a Motorola aparece)
function deOutraMarca(titulo, marcasDaBusca, buscaDeAcessorio) {
  const achadas = marcasDoTitulo(titulo);
  if (!achadas.length) return false;
  const primeira = achadas[0];
  if (!marcasDaBusca.has(primeira.marca) && primeira.i < 6) return true;
  if (!achadas.some((a) => marcasDaBusca.has(a.marca))) return true;
  return !buscaDeAcessorio && primeira.para;
}

// Produto primeiro, marca depois: "mondial air fryer" -> air, fryer, mondial
const produtoPrimeiro = (termos) => {
  const produto = produtoDaBusca(termos);
  return produto === termos ? termos : [...produto, ...termos.filter(ehMarca)];
};

export function criarDetector(q) {
  const termos = termosDaBusca(comSinonimos(q));
  if (!termos.length) return () => false;
  const junto = termos.join("");
  // Em "controle para video game" o produto é o controle; o resto só diz de quê ("Suporte para Controle de PS5" é acessório)
  const doProduto = controleDeJogo(termos, q) ? termos.slice(0, 1) : termos;
  // Marca na frente ("mondial air fryer") também acha o título com o produto primeiro ("Air Fryer Mondial")
  const ordens = [doProduto, produtoPrimeiro(doProduto)].filter((o, i, l) => i === 0 || o !== l[0]);
  // "air fryer" também acha "airfryer" e vice-versa; "jogo de panelas" acha "Jogo Panelas"
  const frase = new RegExp(`(^| )(?:${ordens.map((o) => o.map(escapar).join(`(?: (?:${VAZIAS}))* ?`)).join("|")})( |$)`);
  const paraTermo = new RegExp(`(^| )(${[...LIGACOES].join("|")}) (?:${ordens.map((o) => o.map(escapar).join(" ?")).join("|")})( |$)`);
  const buscouAcessorio = buscaDeAcessorioEm(termos, q);
  const categoriaBuscada = categoriaDoProduto(q);
  const esconderBrinquedo = Boolean(categoriaBuscada) && categoriaBuscada.nome !== "Brinquedos" && categoriaBuscada.nome !== "Bebês"
    && !termos.some((t) => BRINQUEDO.has(t));
  const aparelho = categoriaBuscada?.nome === "Eletroportáteis";
  // Palavras que são o próprio tipo de produto buscado: em "power bank", "Carregador Portátil Power Bank"
  // e "Bateria Externa …" são o produto; em "robô aspirador", "Limpador" também
  const proprias = new Set((categoriaBuscada?.palavras || []).map((p) => normalizar(p).split(" ")[0]));
  const ehPropria = (p) => formas(p).some((f) => proprias.has(f));
  // Genéricas só em buscas de 2+ palavras: numa busca só por marca ("stanley", "tramontina") são o produto
  // O título começa pelo produto buscado ("Fone …", "Smart Watch …" para "smartwatch")
  const comecaPeloTermo = (palavras) => {
    let i = 0;
    while (i < palavras.length && (IGNORAR.has(palavras[i]) || /^\d+$/.test(palavras[i]))) i++;
    return ordens.some((o) => formas(palavras[i] || "").includes(o[0])) || palavras.slice(i, i + termos.length + 2).join("").startsWith(junto);
  };

  return (titulo) => {
    if (buscouAcessorio) return false; // quem busca "capa iphone" quer a capa
    // "Fronha 2 Peças", "Jogo de Banho 5 peças" = quantidade, não peça de reposição (Karsten, 21/10/2026)
    const t = comSinonimos(String(titulo || "").replace(/\+/g, " com ")).replace(RE_PUBLICO, "$1").replace(/(^| )\d+ pecas?(?= |$)/g, "$1");
    const palavras = t.split(" ").filter(Boolean);
    // Peça no começo do título: "Motor 127v ...", "Botão Knob ...", "Adequado para Volvo ..." ("Kit Tapete" pula o "kit")
    const inicio = comeco(palavras);
    const naFrente = PECAS_NA_FRENTE.has(inicio[0]) && !termos.some((t) => formas(t).some((f) => formas(inicio[0]).includes(f)));
    if (inicio.some((p) => ehPeca(p) && !ehPropria(p)) || LIGACOES.has(inicio[0]) || naFrente) return true;
    if (palavras.some((p) => PECAS_SEMPRE.has(p)) || FRASES_DE_PECA.test(t)) return true;
    const vedacao = PECA_SEM_COM.exec(t);
    if (vedacao && !t.slice(0, vedacao.index).split(" ").some((p) => ACOMPANHA.has(p))) return true;
    if (!comecaPeloTermo(palavras) && palavras.some((p) => EM_QUALQUER_LUGAR.has(p) && !ehPropria(p))) return true;
    if (esconderBrinquedo && (palavras.some((p) => BRINQUEDO.has(p)) || MARCA_DE_BRINQUEDO.test(t))) return true;
    const achou = frase.exec(t);
    if (!achou) return false;
    const antes = t.slice(0, achou.index).split(" ").filter(Boolean);
    if (antes.slice(-9).some((p) => LIGACOES.has(p))) return true;
    // Peça em qualquer lugar antes do produto ("Motor 127v Fritadeira Air Fryer"); genérica só logo antes ("Cesto Air Fryer"),
    // senão "Fritadeira … com Tela Sensível ao Toque Air Fryer" virava acessório
    const vazias = (l) => l.filter((p) => !PALAVRAS_VAZIAS.has(p));
    if (antes.some((p) => !ehPropria(p) && ehPeca(p))) return true;
    if (termos.length > 1 && vazias(antes).slice(-2).some((p) => !ehPropria(p) && ehGenerica(p))) return true;
    // Logo antes do produto: "Porta Controle", "Base Controle", "Case Fone" (suportes e estojos dele)
    if (vazias(antes).slice(-1).some((p) => !ehPropria(p) && ehDeOutroAcessorio(p) && !termos.includes(p))) return true;
    // "Limpador para Air Fryer" depois da 1ª vez que o termo aparece: "para" logo antes de outra ocorrência
    const resto = t.slice(achou.index + achou[0].length);
    if (paraTermo.test(resto)) return true;
    if (BRINDE.test(t)) return false;
    // Até 5 palavras depois do termo, parando no "com/e" (o que vem depois acompanha o produto)
    const depois = [];
    for (const p of resto.split(" ").filter(Boolean)) {
      if (ACOMPANHA.has(p) || depois.length >= 5) break;
      depois.push(p);
    }
    // Pedaço da palavra buscada não conta: "Kit Skincare Baba Skin" em "kit skincare"
    const daBusca = (p) => termos.some((t) => t !== p && t.startsWith(p));
    return depois.some((p) => ehDepois(p) && !ehPropria(p) && !daBusca(p) && (aparelho || !SO_EM_APARELHOS.has(p)));
  };
}

// Quantas palavras da busca o título tem ("airfryer" conta como "air" e "fryer"; "de/do/para" não contam:
// "Aspirador Pó Vertical" tem tudo de "aspirador de pó")
// Pontos = palavras buscadas no título. Com todas as palavras (busca de 2+ palavras), conta também se estão perto:
// "Mini PC Dell …" vale mais que "Computador Mini … Intel … PC". Palavra logo depois de "para/for…" não conta,
// a não ser que o título comece pelo produto buscado: "Microfone Mini USB para PC" não é "mini pc",
// mas "Capa para iPhone" é "capa iphone".
// Frase inteira = total + 1; perto (até 4 palavras no meio, sem contar "de/para…") = total + 0,5;
// espalhadas = abaixo de total (não "bate")
const PALAVRAS_NO_MEIO = 4;
// Começam como outra palavra buscada, mas são outra coisa: "boné" achava "Boneco Funko Pop" (21/10/2026)
const OUTRA_PALAVRA = new Set(["boneco", "bonecos", "boneca", "bonecas"]);
function criarPontuacao(termos) {
  const junto = termos.join("");
  const total = termos.length;
  // "retrovisor moto" acha "Retrovisor para Moto", "jogo lencol" acha "Jogo de Lençol"
  const frase = new RegExp(`(^| )${termos.map(escapar).join(`(?: (?:${VAZIAS}))* ?`)}( |$)`);
  // "mondial air fryer" acha "Air Fryer Mondial" como frase inteira também
  const ordem = produtoPrimeiro(termos);
  const fraseProduto = ordem === termos ? frase : new RegExp(`(^| )${ordem.map(escapar).join(`(?: (?:${VAZIAS}))* ?`)}( |$)`);
  const juntoProduto = ordem.join("");
  const acha = (termo, p) => p === termo || (termo.length >= 3 && p.startsWith(termo) && !OUTRA_PALAVRA.has(p));
  return (titulo) => {
    const t = comSinonimos(titulo);
    const palavras = t.split(" ");
    if (total > 1 && (t.replace(/ /g, "").includes(junto) || frase.test(t))) return total + 1;
    if (total > 1 && (t.replace(/ /g, "").includes(juntoProduto) || fraseProduto.test(t))) return total + 1;
    const primeira = palavras.find((p) => p !== "kit" && p !== "novo" && !/^\d/.test(p)) || "";
    const comecaPeloProduto = acha(ordem[0], primeira);
    const vale = (p, i) => comecaPeloProduto || !LIGACOES.has(palavras[i - 1]);
    const posicoes = termos.map((termo) => palavras.flatMap((p, i) => (acha(termo, p) && vale(p, i) ? [i] : [])));
    const achados = posicoes.filter((l) => l.length).length;
    if (total < 2 || achados < total) return achados;
    // Menor trecho do título com todas as palavras ("de/para/com…" não contam como palavra no meio)
    const cheias = [0];
    palavras.forEach((p, i) => cheias.push(cheias[i] + (PALAVRAS_VAZIAS.has(p) ? 0 : 1)));
    let menor = Infinity;
    for (const inicio of posicoes.flat()) {
      const fins = posicoes.map((l) => l.find((i) => i >= inicio));
      if (fins.every((f) => f !== undefined)) menor = Math.min(menor, cheias[Math.max(...fins) + 1] - cheias[inicio]);
    }
    return menor <= total + PALAVRAS_NO_MEIO ? total + 0.5 : total - 0.25;
  };
}

// Marca as ofertas que são acessórios e manda elas para o fim da lista. Entre os produtos,
// os que têm todas as palavras buscadas vêm antes (mantendo a ordem de cada loja no empate).
// bate: true = o título tem todas as palavras buscadas, perto umas das outras (o site usa no "Menor preço")
// O título tem todas as palavras buscadas (perto ou não). Para lojas cuja busca é solta: na Lomadee,
// "air fryer" traz "Jaqueta Alpinestars … Air" e "Compressor Smart Air"
export function temTodasAsPalavras(q) {
  const termos = termosDaBusca(comSinonimos(q));
  const pontuar = criarPontuacao(termos);
  return (titulo) => pontuar(titulo) >= termos.length - 0.25;
}

// Todas as palavras buscadas aparecem no título, em qualquer ordem e distância ("Capa protetora para iPhone 18 17 … 13")
export function citaTodasAsPalavras(q) {
  const termos = termosDaBusca(comSinonimos(q));
  const acha = (termo, p) => p === termo || (termo.length >= 3 && p.startsWith(termo) && !OUTRA_PALAVRA.has(p));
  return (titulo) => {
    const palavras = comSinonimos(titulo).split(" ");
    return termos.every((termo) => palavras.some((p) => acha(termo, p)));
  };
}

// Busca de 2+ palavras: o título tem que ter TODAS, em qualquer lugar, aceitando plural e masculino/feminino
// ("babuche masculino" aceita "Babuche … Masculina"; "jogo de panelas" aceita "Jogo De Panela") (ideia do Giovanni, 19/10/2026)
const raiz = (p) => (p.length >= 4 ? p.replace(/oes$/, "ao").replace(/s$/, "").replace(/[oae]$/, "") : p);
export function citaTodasFlexivel(q) {
  const termos = termosDaBusca(comSinonimos(q));
  const raizes = termos.map(raiz);
  const junto = termos.join("");
  return (titulo) => {
    const t = comSinonimos(titulo);
    if (termos.length > 1 && t.replace(/ /g, "").includes(junto)) return true;
    const palavras = t.split(" ").map(raiz);
    return raizes.every((r) => palavras.some((p) => p === r || (r.length >= 3 && p.startsWith(r))));
  };
}
// É o produto buscado (não acessório): começa pelo que foi buscado, ou, em busca de 2+ palavras, tem todas elas.
// Usado na conferência das categorias (marcarSecoes): todos esses ficam na mesma categoria
export function produtoBuscado(q) {
  const cita = termosDaBusca(comSinonimos(q)).length >= 2 ? citaTodasFlexivel(q) : null;
  return (o) => !o.acessorio && (Boolean(o.principal) || Boolean(cita && cita(o.titulo || "")));
}
// Com pelo menos isso de produtos com todas as palavras, os outros vão para "Ver também"
const MINIMO_COM_TODAS = 10;

// O título cita alguma palavra buscada, em qualquer lugar (mesmo depois de "para"). Para a AliExpress, cuja busca é
// solta: "batedeira" trazia "Capacitor Automotivo" e "cabo jump start". Não exige todas porque os títulos dela são
// traduzidos ("Lona feminina … tênis"); o resto (acessórios, outra categoria) o separarAcessorios põe no fim.
// Para quem é o produto não é o produto: "babuche masculino" trazia bandana e boné "masculino" (print, 19/10/2026)
const PARA_QUEM = /^(masculin|feminin|infantil|infantis|unissex|unisex|adult|kids|menin|bebe$|bebes$|plus$)/;
export function citaAlgumaPalavra(q) {
  // Com marca e produto, tem que citar o produto: "air fryer mondial" trazia secador de cabelo Mondial (print, 19/10/2026)
  const doProduto = produtoDaBusca(termosDaBusca(comSinonimos(q)));
  const semPublico = doProduto.filter((t) => !PARA_QUEM.test(t));
  const termos = semPublico.length ? semPublico : doProduto;
  const junto = termos.join("");
  const acha = (termo, p) => p === termo || (termo.length >= 3 && p.startsWith(termo) && !OUTRA_PALAVRA.has(p));
  return (titulo) => {
    const t = comSinonimos(titulo);
    const palavras = t.split(" ");
    // Juntas só valem em 2+ palavras ("airfryer"): com uma só, "vibração" achava "ração" (massageador na busca "ração", 27/10/2026)
    return (termos.length > 1 && t.replace(/ /g, "").includes(junto)) || termos.some((termo) => palavras.some((p) => acha(termo, p)));
  };
}

// =====================================================================
// PRODUTO x ACESSÓRIO (17/10/2026, pedido do Giovanni: "a busca deve vir exata ao que foi buscado")
// Mesmo princípio da patente do Google sobre o tema (US10354308): primeiro decide se a BUSCA é de produto
// ("microondas", "capacete") ou de acessório ("prato microondas", "reparo capacete"); depois mede cada título.
//  1) Alvo da busca: a palavra de acessório, se houver ("prato" em "prato microondas"); senão a 1ª palavra.
//  2) Nível do título: 2 = começa pelo alvo ("Geladeira Frost Free", "Console PS5 Slim"); 1 = alvo na 2ª palavra
//     sem "de/para" nem peça antes ("Electrolux Micro-ondas", "Sony PS5"); 0 = só cita ("Imã de Geladeira").
//  3) Preço como prova, só em busca de produto: comparado ao preço típico dos que começam pelo alvo (mediana do
//     nível 2, com 5 ou mais), é acessório o nível 0 abaixo de 20% e o nível 1 abaixo de 10%. Pega peças que nenhuma
//     lista conhece ("Imã de Geladeira" R$ 7 x geladeiras de R$ 1.700, "Chave de Máquina de Lavar" R$ 13) sem esconder
//     celular simples de R$ 100 ("LG B220 Celular": nível 1, preços de celular vão de R$ 100 a R$ 10 mil).
// =====================================================================

// Palavras que costumam vir antes do nome do produto e não contam ("Console PlayStation PS5", "Fritadeira Elétrica Air Fryer",
// "Mini Máquina de Lavar", "Forno Micro-ondas")
const ANTES_DO_NOME = new Set(["console", "consoles", "videogame", "video", "game", "aparelho", "novo", "nova", "original",
  "lancamento", "oficial", "sony", "playstation", "fritadeira", "eletrica", "eletrico", "forno", "mini", "smart", "portatil"]);
const ehPalavraDeAcessorio = (t) => ehPeca(t) || ehGenerica(t) || DEPOIS.has(t) || EM_QUALQUER_LUGAR.has(t);
// "Controle" é acessório do videogame ou do ar ("Controle Ar Condicionado" na busca "ar condicionado"), mas quem
// COMEÇA a busca por ele quer o controle: "controle para video game" mostrava suporte, porta-controle e adesivo
// no meio (print do Giovanni, 17/10/2026). Nesse caso é busca de produto e esses acessórios ficam escondidos
// Só com cara de videogame: em "controle remoto" e "controle ar condicionado" segue como antes (nada escondido)
const PRODUTO_QUANDO_PRIMEIRA = new Set(["controle"]);
const DE_JOGO = /(^| )(video ?games?|videogames?|games?|gamer|ps[1-5]|playstation|xbox|nintendo|switch|consoles?|pc|joysticks?|gamepads?)( |$)/;
const controleDeJogo = (termos, q) => PRODUTO_QUANDO_PRIMEIRA.has(termos[0]) && DE_JOGO.test(normalizar(q));
// "kit" é quantidade, não acessório: "kit maquiagem" virava busca de acessório e mostrava maquiagem de brinquedo (27/10/2026)
const buscaDeAcessorioEm = (termos, q) => !controleDeJogo(termos, q) && termos.some((t) => t !== "kit" && ehPalavraDeAcessorio(t));
// Nível 2 também (17/10/2026), bem mais baixo: "Forno de microondas motor" R$ 48 x micro-ondas de R$ 580,
// "Capa … TV 55" R$ 33 x TVs de R$ 3.500, "Cadeira Gamer" R$ 1 (preço errado da loja). Celular de R$ 88 continua
const PARTE_DO_PRECO_TIPICO = [0.2, 0.1, 0.08]; // nível 0, 1, 2

// Versões "de nicho" do produto: aparecem, mas depois das comuns, a não ser que a busca peça
// ("geladeira" abria com 7 geladeiras portáteis de camping; "celular", com celulares de botão para idoso;
// "ar condicionado", com mini ventiladores "resfriador"; "tv", com TV Stick)
const VARIANTES = new Set(["mini", "portatil", "portateis", "camping", "veicular", "idoso", "idosos", "infantil", "caneta",
  "resfriador", "climatizador", "usado", "usada", "stick", "colecionavel", "colecionaveis",
  // "Ar condicionado de parede … aquecedor e arrefecedor" de R$ 212 em 1º na busca "ar condicionado" (auditoria, 27/10/2026)
  "aquecedor", "arrefecedor", "pequeno", "pequena"]);
// Variantes de uma categoria só: na busca "celular", celular de botão (Caterpillar B30, "Nok'a 125", "Teclado Fácil")
// aparecia no topo no lugar dos smartphones (print do Giovanni, 21/10/2026). Só vale se a busca não pede a palavra.
const VARIANTES_DA_CATEGORIA = {
  // "Guarda-roupa simples pano" de R$ 211 no meio dos de madeira (auditoria, 27/10/2026)
  Móveis: new Set(["pano", "lona", "tnt"]), // "tecido" não: sofá de tecido é o comum
  Celulares: new Set(["caterpillar", "cartepillar", "cat", "teclado", "teclas", "botao", "botoes", "idoso", "idosos", "rural",
    "2g", "b220", "b220v", "noka", "nok", "basico", "lanterna"]),
};
const RECUO_VARIANTE = 0.25; // fica abaixo dos comuns que começam pelo produto, acima dos que só citam

// Busca que é um produto, mas o mesmo nome com outra palavra vira outro produto (pedido do Giovanni, 17/10/2026):
// "máquina de lavar" é a de roupa; "máquina de lavar sapatos" ou "louças" só quando a busca pedir.
// Esses vão para o fim da lista (depois de todos os produtos, antes dos acessórios) e não contam como o produto buscado
// Busca de controle de videogame: "joystick", "gamepad", "controle ps4", "controle para video game"
const JOGO_NA_BUSCA = { test: (b) => /(^| )(joysticks?|gamepads?)( |$)/.test(b) || (/(^| )controles?( |$)/.test(b) && DE_JOGO.test(b)) };
const OUTRO_PRODUTO = [
  // "Protetor Solar para Para-brisa de Carro" (AliExpress)
  [/(^| )protetor solar( |$)/, ["carro", "carros", "parabrisa", "brisa", "painel", "janela", "janelas", "veiculo", "automotivo", "dashmat", "rv"]],
  // "joystick"/"controle video game": alavanca de máquina, de cadeira de rodas e tecla de teclado (19/10/2026)
  [JOGO_NA_BUSCA, ["escavadeira", "escavadora", "guindaste", "guindastes", "industrial", "industriais", "empilhadeira", "trator",
    "cadeira", "neves", "elevatoria", "valvula", "keycap", "keycaps", "teclado", "teclas", "aviacao", "aeronaves", "aereo", "drone", "drones", "fpv", "gimbal"]],
  // "Ventilador de Fogão … para Lareira a Lenha" (AliExpress, 27/10/2026)
  [/(^| )ventilador(es)?( |$)/, ["lareira", "lareiras", "lenha", "fogao"]],
  [/(^| )maquina de lavar( |$)/, ["sapato", "sapatos", "tenis", "calcado", "calcados", "louca", "loucas", "pressao", "escovar"]],
];
const MINIMO_PARA_PRECO_TIPICO = 5;

// Suportes e estojos do produto: "Base controle PS5", "Porta Controle", "Case Fone", "Dock de carregamento" (logo antes do
// produto ou, na busca de acessório, na frente do título). Quem busca a própria palavra ("base líquida") não é afetado
const DE_OUTRO_ACESSORIO = new Set(["base", "apoio", "dock", "estacao", "organizador", "bolsa", "estojo", "case", "chaveiro", "porta"]);
const ehDeOutroAcessorio = temNa(DE_OUTRO_ACESSORIO);

function criarNivelDoTitulo(termos, buscaDeAcessorio) {
  const alvo = termos.find((t) => t !== "kit" && ehPalavraDeAcessorio(t)) || termos.find((t) => t !== "kit") || termos[0];
  const resto = termos.slice(termos.indexOf(alvo));
  const junto = resto.join("");
  const acha = (p) => p === alvo || (alvo.length >= 3 && p.startsWith(alvo));
  return (titulo) => {
    // Códigos de modelo não contam como palavra: "B220 CELULAR Simples", "LG B220 Celular"
    const todas = comSinonimos(titulo).split(" ").filter((p) => p && (!/\d/.test(p) || acha(p) || junto.startsWith(p)));
    let i = 0;
    // Pula também a marca no começo: "Mondial Air Fryer AFN-40" começa pelo produto
    while (i < todas.length && (IGNORAR.has(todas[i]) || ((ANTES_DO_NOME.has(todas[i]) || ehMarca(todas[i])) && !acha(todas[i])))) i++;
    const [p0 = "", p1 = ""] = todas.slice(i, i + 2);
    if (acha(p0) || todas.slice(i, i + resto.length + 1).join("").startsWith(junto)) return 2;
    // Na busca de acessório a peça pode vir antes ("Cabo Flat Monitor" para "flat monitor"); na de produto, não
    const pecaNaFrente = !buscaDeAcessorio && (ehPeca(p0) || ehGenerica(p0) || ehDeOutroAcessorio(p0));
    // Na busca de acessório, outro acessório na frente é acessório do acessório: "Suporte Controle PS5" em "controle ps5"
    // (-1 = vai para depois dos controles; não some)
    const outroAcessorio = buscaDeAcessorio && (ehPeca(p0) || ehGenerica(p0) || ehDeOutroAcessorio(p0))
      && !termos.some((t) => formas(t).some((f) => formas(p0).includes(f)));
    if (outroAcessorio) return -1;
    return acha(p1) && !LIGACOES.has(p0) && !IGNORAR.has(p0) && !pecaNaFrente ? 1 : 0;
  };
}

const mediana = (valores) => {
  const v = [...valores].sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : 0;
};

export function separarAcessorios(ofertas, q, { precoMin } = {}) {
  const ehAcessorio = criarDetector(q);
  const termos = termosDaBusca(comSinonimos(q));
  const pontuar = criarPontuacao(termos);
  const buscaDeAcessorio = buscaDeAcessorioEm(termos, q);
  const nivelDoTitulo = termos.length ? criarNivelDoTitulo(produtoDaBusca(termos), buscaDeAcessorio) : () => 0;
  const total = termos.length;
  const pedidas = new Set(normalizar(q).split(" "));
  const catBusca = categoriaDoProduto(q);
  // "celular de botão"/"celular para idoso" pede esse tipo: aí nenhum deles recua
  const variantesDaBusca = catBusca && VARIANTES_DA_CATEGORIA[catBusca.nome];
  const usarVariantesDaBusca = variantesDaBusca && ![...pedidas].some((p) => variantesDaBusca.has(p)) ? variantesDaBusca : null;
  const buscaComSinonimos = comSinonimos(q);
  // "sapato" na busca libera "sapatos" no título (e vice-versa)
  const pedida = (p) => [...pedidas].some((x) => formas(x).some((f) => formas(p).includes(f)));
  const outras = OUTRO_PRODUTO.filter(([re]) => re.test(buscaComSinonimos) || re.test(normalizar(q))).flatMap(([, palavras]) => palavras)
    .filter((p) => !pedida(p));
  const ehOutroProduto = (titulo) => outras.length > 0 && normalizar(titulo).split(" ").some((p) => outras.includes(p));
  const marcadas = ofertas.map((o, i) => {
    const outro = ehOutroProduto(o.titulo);
    let pontos = outro ? -1 : pontuar(o.titulo);
    const marcas = { ...(ehAcessorio(o.titulo) && { acessorio: true }), ...(pontos >= total && { bate: true }) };
    // Desempate dentro do mesmo nível de palavras: quem começa pelo alvo sobe (não muda o "bate").
    // principal: o site põe esses primeiro também quando junta os próximos lotes da busca
    let nivel = marcas.bate ? nivelDoTitulo(o.titulo) : 0;
    if (nivel === -1) { pontos -= 1; nivel = 0; }
    if (nivel) pontos += nivel === 2 ? 0.6 : 0.4;
    if (nivel && !marcas.acessorio) marcas.principal = true;
    // variante: versão de nicho ("Ar Condicionado Portátil … Resfriador"); foraDoTipo: é de carro
    // ("Ar Condicionado Volkswagen Polo … Comando"). Os dois recuam e, no "Menor preço", vêm depois dos produtos
    if (!marcas.acessorio && normalizar(o.titulo).split(" ").some((p) => (VARIANTES.has(p) || usarVariantesDaBusca?.has(p)) && !pedidas.has(p))) marcas.variante = true;
    // Só peça/versão de carro: a classificação pelo título erra em outros casos ("Capacete … meia face" cairia em Moda íntima)
    if (!marcas.acessorio && marcas.bate && catBusca && catBusca.nome !== "Automotivo" && ehDeCarro(o.titulo)) marcas.foraDoTipo = true;
    if (marcas.variante || marcas.foraDoTipo) pontos -= RECUO_VARIANTE;
    return { o: Object.keys(marcas).length ? { ...o, ...marcas } : o, pontos, i, nivel };
  });
  // Preço mínimo do produto (ver buscaNasLojas): "Card para Capinha de Kindle" de R$ 12 não é Kindle
  if (precoMin) {
    for (const m of marcadas) {
      if (!m.o.acessorio && m.o.preco > 0 && m.o.preco < precoMin) {
        const { principal, ...resto } = m.o;
        m.o = { ...resto, acessorio: true };
      }
    }
  }
  // Preço como prova (só em busca de produto)
  if (!buscaDeAcessorio) {
    const nivel2 = marcadas.filter((m) => m.nivel === 2 && !m.o.acessorio && m.o.preco > 0);
    if (nivel2.length >= MINIMO_PARA_PRECO_TIPICO) {
      const tipico = mediana(nivel2.map((m) => m.o.preco));
      // Os comuns comparados também com o preço das outras comuns: em "máquina de lavar" as 180 mini lavadoras de R$ 100
      // baixavam a mediana e a "Máquina de Lavar com Turbina … para Meias" de R$ 48 passava como produto (27/10/2026).
      // A versão de nicho segue com a mediana de todos (mini lavadora e celular de idoso custam bem menos e são o produto)
      const comuns = nivel2.filter((m) => !m.o.variante).map((m) => m.o.preco);
      const tipicoComum = comuns.length >= MINIMO_PARA_PRECO_TIPICO ? Math.max(tipico, mediana(comuns)) : tipico;
      for (const m of marcadas) {
        const base = m.o.variante ? tipico : tipicoComum;
        if (!m.o.acessorio && m.o.preco > 0 && m.o.preco < base * PARTE_DO_PRECO_TIPICO[m.nivel]) {
          const { principal, ...resto } = m.o;
          m.o = { ...resto, acessorio: true };
        }
      }
    }
  }
  // Busca com marca: produto de outra marca (a outra aparece antes da buscada no título) vai para "Ver também"
  const marcasDaBusca = new Set(termos.filter((t) => ehMarca(t) || DONO_DA_MARCA[t]).map(donoDa));
  if (marcasDaBusca.size) {
    for (const m of marcadas) {
      if (m.o.acessorio) continue;
      if (deOutraMarca(m.o.titulo, marcasDaBusca, buscaDeAcessorio)) {
        const { principal, ...resto } = m.o;
        m.o = { ...resto, acessorio: true, parecido: true, outraMarca: true };
      }
    }
  }
  // Busca de 2+ palavras com produtos suficientes que têm todas: os que não têm vão para "Ver também"
  // "kit" não conta: em "kit skincare", "Conjunto de Cuidados com a Pele" também é o produto
  const semKit = termos.filter((t) => t !== "kit");
  if (!buscaDeAcessorio && semKit.length >= 2) {
    const temTodas = citaTodasFlexivel(semKit.join(" "));
    const com = marcadas.filter((m) => !m.o.acessorio && temTodas(m.o.titulo));
    if (com.length >= MINIMO_COM_TODAS) {
      const ficam = new Set(com);
      for (const m of marcadas) {
        if (!m.o.acessorio && !ficam.has(m)) {
          const { principal, ...resto } = m.o;
          m.o = { ...resto, acessorio: true, parecido: true };
        }
      }
    }
  }
  const ordenar = (a, b) => b.pontos - a.pontos || a.i - b.i;
  const produtos = marcadas.filter((m) => !m.o.acessorio).sort(ordenar);
  const acessorios = marcadas.filter((m) => m.o.acessorio).sort(ordenar);
  return [...produtos, ...acessorios].map((m) => m.o);
}
