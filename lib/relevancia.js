// Separa o produto buscado dos acessórios e peças dele, e põe primeiro o que bate com a busca.
// Ex.: buscando "air fryer oster", "Oster Fritadeira Air Fryer 4,6L" é o produto;
// "Motor 127v Fritadeira Oster", "Tapete de Silicone para Air Fryer" e "Crisping Plate for Ninja Air Fryer"
// são acessórios. O site mostra os acessórios só se o visitante pedir (ou se só houver acessórios).
import { normalizar } from "./texto.js";
import { categoriaDoProduto, PALAVRAS_VAZIAS } from "./categorias.js";

// Peças/acessórios "certeiros": no começo do título já indicam que não é o produto
// ("Motor 127v Fritadeira Oster", "Botão Knob para Liquidificador Oster")
const PECAS = new Set(`
  acessorio adaptador adesivo borracha botao cabo capa capinha carregador conector correia engrenagem filtro forro
  fusivel gaxeta helice interruptor knob lamina mangueira mola motor peca pelicula placa protetor puxador refil
  reparo resistencia rodizio suporte tampa tapete termostato vedacao ventoinha
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
  basket holder mat pan paper plate rack skin stand tray
`.trim().split(/\s+/));

// Palavras de acessório logo DEPOIS do produto buscado (títulos em inglês: "Air Fryer Liners").
// Sem "kit" nem "tampa": "Jogo de Panelas … Kit Cozinha", "Body Bebê Kit 5" e "Pote Hermético … Tampa Bambu" são o produto
const DEPOIS = new Set(`
  accessories accessory basket case cover filter insert liner mat pan paper part parts plate rack
  replacement tray papel forro tapete forma acessorio capa capinha pelicula
  grelha assadeira forminha bandeja silicone limpador oil drip reposicao
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
const EM_QUALQUER_LUGAR = new Set(["for", "compativel", "compatible", "fits", "limpador", "desengordurante"]);

// Brinquedo que imita o produto ("Airfryer de Brinquedo"): escondido, a não ser que a busca seja de brinquedo
const BRINQUEDO = new Set(["brinquedo", "brinquedos", "miniatura"]);
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
  [/(^| )(\d+) ?(polegadas?|pol)( |$)/g, "$1$2$4"],
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
  const termos = termosDaBusca(q);
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
  const ehAcessorioPerto = (p) => !ehPropria(p) && (ehPeca(p) || (termos.length > 1 && ehGenerica(p)));
  // O título começa pelo produto buscado ("Fone …", "Smart Watch …" para "smartwatch")
  const comecaPeloTermo = (palavras) => {
    let i = 0;
    while (i < palavras.length && (IGNORAR.has(palavras[i]) || /^\d+$/.test(palavras[i]))) i++;
    return formas(palavras[i] || "").includes(termos[0]) || palavras.slice(i, i + termos.length + 2).join("").startsWith(junto);
  };

  return (titulo) => {
    if (buscouAcessorio) return false; // quem busca "capa iphone" quer a capa
    const t = normalizar(String(titulo || "").replace(/\+/g, " com ")).replace(RE_PUBLICO, "$1");
    const palavras = t.split(" ").filter(Boolean);
    // Peça no começo do título: "Motor 127v ...", "Botão Knob ...", "Adequado para Volvo ..." ("Kit Tapete" pula o "kit")
    const inicio = comeco(palavras);
    if (inicio.some((p) => ehPeca(p) && !ehPropria(p)) || LIGACOES.has(inicio[0])) return true;
    if (!comecaPeloTermo(palavras) && palavras.some((p) => EM_QUALQUER_LUGAR.has(p) && !ehPropria(p))) return true;
    if (esconderBrinquedo && palavras.some((p) => BRINQUEDO.has(p))) return true;
    const achou = frase.exec(t);
    if (!achou) return false;
    const antes = t.slice(0, achou.index).split(" ").filter(Boolean);
    if (antes.slice(-9).some((p) => LIGACOES.has(p))) return true;
    if (antes.some(ehAcessorioPerto)) return true;
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

export function separarAcessorios(ofertas, q) {
  const ehAcessorio = criarDetector(q);
  const termos = termosDaBusca(comSinonimos(q));
  const pontuar = criarPontuacao(termos);
  const total = termos.length;
  const marcadas = ofertas.map((o, i) => {
    const pontos = pontuar(o.titulo);
    const marcas = { ...(ehAcessorio(o.titulo) && { acessorio: true }), ...(pontos >= total && { bate: true }) };
    return { o: Object.keys(marcas).length ? { ...o, ...marcas } : o, pontos, i };
  });
  const ordenar = (a, b) => b.pontos - a.pontos || a.i - b.i;
  const produtos = marcadas.filter((m) => !m.o.acessorio).sort(ordenar);
  const acessorios = marcadas.filter((m) => m.o.acessorio).sort(ordenar);
  return [...produtos, ...acessorios].map((m) => m.o);
}
