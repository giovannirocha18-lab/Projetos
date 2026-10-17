// Separa o produto buscado dos acessórios e peças dele, e põe primeiro o que bate com a busca.
// Ex.: buscando "air fryer oster", "Oster Fritadeira Air Fryer 4,6L" é o produto;
// "Motor 127v Fritadeira Oster", "Tapete de Silicone para Air Fryer" e "Crisping Plate for Ninja Air Fryer"
// são acessórios. O site mostra os acessórios só se o visitante pedir (ou se só houver acessórios).
import { normalizar } from "./texto.js";
import { categoriaDoProduto, ehDeCarro, PALAVRAS_VAZIAS } from "./categorias.js";

// Peças/acessórios "certeiros": no começo do título já indicam que não é o produto
// ("Motor 127v Fritadeira Oster", "Botão Knob para Liquidificador Oster")
const PECAS = new Set(`
  acessorio adaptador adesivo borracha botao cabo capa capinha carregador conector correia engrenagem filtro forro
  fusivel gaxeta helice interruptor knob lamina mangueira mola motor peca pelicula placa protetor puxador refil
  reparo resistencia rodizio suporte tampa tapete termostato vedacao ventoinha
  skin sticker enfeite
  filamento magnetron capacitor diodo display membrana lampada valvula temporizador prato detector
  evaporadora evaporador condensador condensadora radiador difusor compressor ima comando blower
  viseira palmilha cadarco
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
  kit luva mochila organizador painel papel pegador pinca saco sensor travessa
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
// Peça só quando é a 1ª palavra: "Pé Máquina De Lavar Nivelador" (em "Meias de pé" e "dedo do pé" é o produto)
const PECAS_NA_FRENTE = new Set(["pe", "pes"]);

// Brinquedo que imita o produto ("Airfryer de Brinquedo", "Mini Geladeira Mini Brands … Colecionável"):
// escondido, a não ser que a busca seja de brinquedo
const BRINQUEDO = new Set(["brinquedo", "brinquedos", "miniatura", "colecionavel", "colecionaveis"]);
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
  [/(^| )electrolux( |$)/g, "$1eletrolux$2"], // muita gente escreve "eletrolux" (print de 17/10/2026)
  [/(^| )(\d+) ?(polegadas?|pol)( |$)/g, "$1$2$4"],
  // Títulos traduzidos da AliExpress (17/10/2026)
  [/(^| )fritadeiras?( eletricas?)?( digital| inteligente)? (a|de|sem) (ar|oleo)( |$)/g, "$1air fryer$6"],
  [/(^| )(baterias? (portatil|portateis|externas?)|carregador(es)? portat(il|eis))( |$)/g, "$1power bank$6"],
];
export function comSinonimos(texto) {
  let t = normalizar(texto);
  for (const [re, troca] of SINONIMOS) t = t.replace(re, troca).replace(re, troca);
  return t;
}

// Palavras da busca sem "de/do/para…": "jogo de panelas" -> jogo, panelas (se sobrar alguma)
function termosDaBusca(q) {
  const todos = normalizar(q).split(" ").filter(Boolean);
  const cheios = todos.filter((t) => !PALAVRAS_VAZIAS.has(t));
  return cheios.length ? cheios : todos;
}

export function criarDetector(q) {
  const termos = termosDaBusca(comSinonimos(q));
  if (!termos.length) return () => false;
  const junto = termos.join("");
  // "air fryer" também acha "airfryer" e vice-versa; "jogo de panelas" acha "Jogo Panelas"
  const frase = new RegExp(`(^| )${termos.map(escapar).join(`(?: (?:${VAZIAS}))* ?`)}( |$)`);
  const paraTermo = new RegExp(`(^| )(${[...LIGACOES].join("|")}) ${termos.map(escapar).join(" ?")}( |$)`);
  const buscouAcessorio = termos.some((t) => ehPeca(t) || ehGenerica(t) || DEPOIS.has(t) || EM_QUALQUER_LUGAR.has(t));
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
    return formas(palavras[i] || "").includes(termos[0]) || palavras.slice(i, i + termos.length + 2).join("").startsWith(junto);
  };

  return (titulo) => {
    if (buscouAcessorio) return false; // quem busca "capa iphone" quer a capa
    const t = comSinonimos(String(titulo || "").replace(/\+/g, " com ")).replace(RE_PUBLICO, "$1");
    const palavras = t.split(" ").filter(Boolean);
    // Peça no começo do título: "Motor 127v ...", "Botão Knob ...", "Adequado para Volvo ..." ("Kit Tapete" pula o "kit")
    const inicio = comeco(palavras);
    if (inicio.some((p) => ehPeca(p) && !ehPropria(p)) || LIGACOES.has(inicio[0]) || PECAS_NA_FRENTE.has(inicio[0])) return true;
    if (palavras.some((p) => PECAS_SEMPRE.has(p)) || FRASES_DE_PECA.test(t)) return true;
    if (!comecaPeloTermo(palavras) && palavras.some((p) => EM_QUALQUER_LUGAR.has(p) && !ehPropria(p))) return true;
    if (esconderBrinquedo && palavras.some((p) => BRINQUEDO.has(p))) return true;
    const achou = frase.exec(t);
    if (!achou) return false;
    const antes = t.slice(0, achou.index).split(" ").filter(Boolean);
    if (antes.slice(-9).some((p) => LIGACOES.has(p))) return true;
    // Peça em qualquer lugar antes do produto ("Motor 127v Fritadeira Air Fryer"); genérica só logo antes ("Cesto Air Fryer"),
    // senão "Fritadeira … com Tela Sensível ao Toque Air Fryer" virava acessório
    const vazias = (l) => l.filter((p) => !PALAVRAS_VAZIAS.has(p));
    if (antes.some((p) => !ehPropria(p) && ehPeca(p))) return true;
    if (termos.length > 1 && vazias(antes).slice(-2).some((p) => !ehPropria(p) && ehGenerica(p))) return true;
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
    return depois.some((p) => ehDepois(p) && !ehPropria(p) && (aparelho || !SO_EM_APARELHOS.has(p)));
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
function criarPontuacao(termos) {
  const junto = termos.join("");
  const total = termos.length;
  // "retrovisor moto" acha "Retrovisor para Moto", "jogo lencol" acha "Jogo de Lençol"
  const frase = new RegExp(`(^| )${termos.map(escapar).join(`(?: (?:${VAZIAS}))* ?`)}( |$)`);
  const acha = (termo, p) => p === termo || (termo.length >= 3 && p.startsWith(termo));
  return (titulo) => {
    const t = comSinonimos(titulo);
    const palavras = t.split(" ");
    if (total > 1 && (t.replace(/ /g, "").includes(junto) || frase.test(t))) return total + 1;
    const primeira = palavras.find((p) => p !== "kit" && p !== "novo" && !/^\d/.test(p)) || "";
    const comecaPeloProduto = acha(termos[0], primeira);
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

// O título cita alguma palavra buscada, em qualquer lugar (mesmo depois de "para"). Para a AliExpress, cuja busca é
// solta: "batedeira" trazia "Capacitor Automotivo" e "cabo jump start". Não exige todas porque os títulos dela são
// traduzidos ("Lona feminina … tênis"); o resto (acessórios, outra categoria) o separarAcessorios põe no fim.
export function citaAlgumaPalavra(q) {
  const termos = termosDaBusca(comSinonimos(q));
  const junto = termos.join("");
  const acha = (termo, p) => p === termo || (termo.length >= 3 && p.startsWith(termo));
  return (titulo) => {
    const t = comSinonimos(titulo);
    const palavras = t.split(" ");
    return t.replace(/ /g, "").includes(junto) || termos.some((termo) => palavras.some((p) => acha(termo, p)));
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
// Nível 2 também (17/10/2026), bem mais baixo: "Forno de microondas motor" R$ 48 x micro-ondas de R$ 580,
// "Capa … TV 55" R$ 33 x TVs de R$ 3.500, "Cadeira Gamer" R$ 1 (preço errado da loja). Celular de R$ 88 continua
const PARTE_DO_PRECO_TIPICO = [0.2, 0.1, 0.08]; // nível 0, 1, 2

// Versões "de nicho" do produto: aparecem, mas depois das comuns, a não ser que a busca peça
// ("geladeira" abria com 7 geladeiras portáteis de camping; "celular", com celulares de botão para idoso;
// "ar condicionado", com mini ventiladores "resfriador"; "tv", com TV Stick)
const VARIANTES = new Set(["mini", "portatil", "portateis", "camping", "veicular", "idoso", "idosos", "infantil", "caneta",
  "resfriador", "climatizador", "usado", "usada", "stick", "colecionavel", "colecionaveis"]);
const RECUO_VARIANTE = 0.25; // fica abaixo dos comuns que começam pelo produto, acima dos que só citam

// Busca que é um produto, mas o mesmo nome com outra palavra vira outro produto (pedido do Giovanni, 17/10/2026):
// "máquina de lavar" é a de roupa; "máquina de lavar sapatos" ou "louças" só quando a busca pedir.
// Esses vão para o fim da lista (depois de todos os produtos, antes dos acessórios) e não contam como o produto buscado
const OUTRO_PRODUTO = [
  [/(^| )maquina de lavar( |$)/, ["sapato", "sapatos", "tenis", "calcado", "calcados", "louca", "loucas", "pressao", "escovar"]],
];
const MINIMO_PARA_PRECO_TIPICO = 5;

function criarNivelDoTitulo(termos, buscaDeAcessorio) {
  const alvo = termos.find(ehPalavraDeAcessorio) || termos[0];
  const resto = termos.slice(termos.indexOf(alvo));
  const junto = resto.join("");
  const acha = (p) => p === alvo || (alvo.length >= 3 && p.startsWith(alvo));
  return (titulo) => {
    // Códigos de modelo não contam como palavra: "B220 CELULAR Simples", "LG B220 Celular"
    const todas = comSinonimos(titulo).split(" ").filter((p) => p && (!/\d/.test(p) || acha(p) || junto.startsWith(p)));
    let i = 0;
    while (i < todas.length && (IGNORAR.has(todas[i]) || (ANTES_DO_NOME.has(todas[i]) && !acha(todas[i])))) i++;
    const [p0 = "", p1 = ""] = todas.slice(i, i + 2);
    if (acha(p0) || todas.slice(i, i + resto.length + 1).join("").startsWith(junto)) return 2;
    // Na busca de acessório a peça pode vir antes ("Cabo Flat Monitor" para "flat monitor"); na de produto, não
    const pecaNaFrente = !buscaDeAcessorio && (ehPeca(p0) || ehGenerica(p0));
    return acha(p1) && !LIGACOES.has(p0) && !IGNORAR.has(p0) && !pecaNaFrente ? 1 : 0;
  };
}

const mediana = (valores) => {
  const v = [...valores].sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : 0;
};

export function separarAcessorios(ofertas, q) {
  const ehAcessorio = criarDetector(q);
  const termos = termosDaBusca(comSinonimos(q));
  const pontuar = criarPontuacao(termos);
  const buscaDeAcessorio = termos.some(ehPalavraDeAcessorio);
  const nivelDoTitulo = termos.length ? criarNivelDoTitulo(termos, buscaDeAcessorio) : () => 0;
  const total = termos.length;
  const pedidas = new Set(normalizar(q).split(" "));
  const catBusca = categoriaDoProduto(q);
  const buscaComSinonimos = comSinonimos(q);
  // "sapato" na busca libera "sapatos" no título (e vice-versa)
  const pedida = (p) => [...pedidas].some((x) => formas(x).some((f) => formas(p).includes(f)));
  const outras = OUTRO_PRODUTO.filter(([re]) => re.test(buscaComSinonimos)).flatMap(([, palavras]) => palavras)
    .filter((p) => !pedida(p));
  const ehOutroProduto = (titulo) => outras.length > 0 && normalizar(titulo).split(" ").some((p) => outras.includes(p));
  const marcadas = ofertas.map((o, i) => {
    const outro = ehOutroProduto(o.titulo);
    let pontos = outro ? -1 : pontuar(o.titulo);
    const marcas = { ...(ehAcessorio(o.titulo) && { acessorio: true }), ...(pontos >= total && { bate: true }) };
    // Desempate dentro do mesmo nível de palavras: quem começa pelo alvo sobe (não muda o "bate").
    // principal: o site põe esses primeiro também quando junta os próximos lotes da busca
    const nivel = marcas.bate ? nivelDoTitulo(o.titulo) : 0;
    if (nivel) pontos += nivel === 2 ? 0.3 : 0.2;
    if (nivel && !marcas.acessorio) marcas.principal = true;
    // variante: versão de nicho ("Ar Condicionado Portátil … Resfriador"); foraDoTipo: é de carro
    // ("Ar Condicionado Volkswagen Polo … Comando"). Os dois recuam e, no "Menor preço", vêm depois dos produtos
    if (!marcas.acessorio && normalizar(o.titulo).split(" ").some((p) => VARIANTES.has(p) && !pedidas.has(p))) marcas.variante = true;
    // Só peça/versão de carro: a classificação pelo título erra em outros casos ("Capacete … meia face" cairia em Moda íntima)
    if (!marcas.acessorio && marcas.bate && catBusca && catBusca.nome !== "Automotivo" && ehDeCarro(o.titulo)) marcas.foraDoTipo = true;
    if (marcas.variante || marcas.foraDoTipo) pontos -= RECUO_VARIANTE;
    return { o: Object.keys(marcas).length ? { ...o, ...marcas } : o, pontos, i, nivel };
  });
  // Preço como prova (só em busca de produto)
  if (!buscaDeAcessorio) {
    const tipicos = marcadas.filter((m) => m.nivel === 2 && !m.o.acessorio && m.o.preco > 0).map((m) => m.o.preco);
    if (tipicos.length >= MINIMO_PARA_PRECO_TIPICO) {
      const tipico = mediana(tipicos);
      for (const m of marcadas) {
        if (!m.o.acessorio && m.o.preco > 0 && m.o.preco < tipico * PARTE_DO_PRECO_TIPICO[m.nivel]) {
          const { principal, ...resto } = m.o;
          m.o = { ...resto, acessorio: true };
        }
      }
    }
  }
  const ordenar = (a, b) => b.pontos - a.pontos || a.i - b.i;
  const produtos = marcadas.filter((m) => !m.o.acessorio).sort(ordenar);
  const acessorios = marcadas.filter((m) => m.o.acessorio).sort(ordenar);
  return [...produtos, ...acessorios].map((m) => m.o);
}
