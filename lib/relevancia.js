// Separa o produto buscado dos acessórios e peças dele, e põe primeiro o que bate com a busca.
// Ex.: buscando "air fryer oster", "Oster Fritadeira Air Fryer 4,6L" é o produto;
// "Motor 127v Fritadeira Oster", "Tapete de Silicone para Air Fryer" e "Crisping Plate for Ninja Air Fryer"
// são acessórios. O site mostra os acessórios só se o visitante pedir (ou se só houver acessórios).
import { normalizar } from "./texto.js";
import { categoriaDoProduto } from "./categorias.js";

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

// Palavras de acessório logo DEPOIS do produto buscado (títulos em inglês: "Air Fryer Liners")
const DEPOIS = new Set(`
  accessories accessory basket case cover filter insert liner mat pan paper part parts plate rack
  replacement tray papel forro tapete forma kit acessorio capa capinha pelicula tampa
  grelha assadeira forminha bandeja silicone limpador oil drip
`.trim().split(/\s+/));

// Em qualquer lugar do título já indicam acessório: "Oil Drip Tray for Chefman", "Espumagic Limpador para Air Fryer"
const EM_QUALQUER_LUGAR = new Set(["for", "compativel", "compatible", "fits", "limpador", "desengordurante"]);

// Brinquedo que imita o produto ("Airfryer de Brinquedo"): escondido, a não ser que a busca seja de brinquedo
const BRINQUEDO = new Set(["brinquedo", "brinquedos", "miniatura"]);
// "for" de público não é acessório: "Perfume For Men"
const PUBLICO = new Set(["men", "man", "women", "woman", "him", "her", "kids"]);

// "para air fryer", "for air fryer", "compatível com air fryer", "p/ air fryer": vale até 8 palavras antes
// da 1ª vez que o termo aparece ("Adequado para Volvo XC90 2015-2024 painel de saída de ar condicionado")
const LIGACOES = new Set(["para", "pra", "p", "for", "compativel", "compatible", "fits", "adequado", "serve"]);

const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// A palavra e seus singulares possíveis: "tapetes" -> "tapete", "botoes" -> "botao", "vedacoes" -> "vedacao"
const formas = (p) => [p, p.replace(/s$/, ""), p.replace(/es$/, ""), p.replace(/oes$/, "ao")];
const temNa = (lista) => (p) => formas(p).some((f) => lista.has(f));
const ehPeca = temNa(PECAS);
const ehGenerica = temNa(GENERICAS);
// Palavras de verdade do começo do título (pula números, medidas e artigos: "2 Tapetes", "O Botão")
const IGNORAR = new Set(["o", "a", "os", "as", "de", "do", "da", "com", "e", "kit"]);
const comeco = (palavras) => palavras.filter((p) => !/\d/.test(p) && !IGNORAR.has(p)).slice(0, 2);

export function criarDetector(q) {
  const termos = normalizar(q).split(" ").filter(Boolean);
  if (!termos.length) return () => false;
  // "air fryer" também acha "airfryer" e vice-versa
  const frase = new RegExp(`(^| )${termos.map(escapar).join(" ?")}( |$)`);
  const buscouAcessorio = termos.some((t) => ehPeca(t) || ehGenerica(t) || DEPOIS.has(t) || EM_QUALQUER_LUGAR.has(t));
  const categoriaBuscada = categoriaDoProduto(q);
  const esconderBrinquedo = Boolean(categoriaBuscada) && categoriaBuscada.nome !== "Brinquedos" && categoriaBuscada.nome !== "Bebês"
    && !termos.some((t) => BRINQUEDO.has(t));
  // Genéricas só em buscas de 2+ palavras: numa busca só por marca ("stanley", "tramontina") são o produto
  const ehAcessorioPerto = (p) => ehPeca(p) || (termos.length > 1 && ehGenerica(p));

  return (titulo) => {
    if (buscouAcessorio) return false; // quem busca "capa iphone" quer a capa
    const t = normalizar(titulo).replace(new RegExp(`(^| )for (?=(${[...PUBLICO].join("|")})( |$))`, "g"), "$1");
    const palavras = t.split(" ").filter(Boolean);
    // Peça no começo do título: "Motor 127v ...", "Botão Knob ...", "Adequado para Volvo ..." ("Kit Tapete" pula o "kit")
    if (comeco(palavras).some((p) => ehPeca(p) || LIGACOES.has(p))) return true;
    if (palavras.some((p) => EM_QUALQUER_LUGAR.has(p))) return true;
    if (esconderBrinquedo && palavras.some((p) => BRINQUEDO.has(p))) return true;
    const achou = frase.exec(t);
    if (!achou) return false;
    const antes = t.slice(0, achou.index).split(" ").filter(Boolean);
    if (antes.slice(-9).some((p) => LIGACOES.has(p))) return true;
    if (antes.some(ehAcessorioPerto)) return true;
    // "Limpador para Air Fryer" depois da 1ª vez que o termo aparece: "para" logo antes de outra ocorrência
    const resto = t.slice(achou.index + achou[0].length);
    if (new RegExp(`(^| )(${[...LIGACOES].join("|")}) ${termos.map(escapar).join(" ?")}( |$)`).test(resto)) return true;
    const depois = resto.split(" ").filter(Boolean).slice(0, 5);
    return depois.some(temNa(DEPOIS));
  };
}

// Quantas palavras da busca o título tem ("airfryer" conta como "air" e "fryer")
function criarPontuacao(q) {
  const termos = normalizar(q).split(" ").filter(Boolean);
  const junto = termos.join("");
  return (titulo) => {
    const t = normalizar(titulo);
    const palavras = t.split(" ");
    const colado = t.replace(/ /g, "");
    if (termos.length > 1 && colado.includes(junto)) return termos.length;
    return termos.filter((termo) => palavras.some((p) => p === termo || (termo.length >= 3 && p.startsWith(termo)))).length;
  };
}

// Marca as ofertas que são acessórios e manda elas para o fim da lista. Entre os produtos,
// os que têm todas as palavras buscadas vêm antes (mantendo a ordem de cada loja no empate).
// bate: true = o título tem todas as palavras buscadas (o site usa no "Menor preço")
export function separarAcessorios(ofertas, q) {
  const ehAcessorio = criarDetector(q);
  const pontuar = criarPontuacao(q);
  const total = normalizar(q).split(" ").filter(Boolean).length;
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
