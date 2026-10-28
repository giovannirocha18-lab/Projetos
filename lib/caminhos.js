// Categoria da própria loja (pedido do Giovanni, 28/10/2026: "trava" automática para todas as categorias, sem IA paga).
// As lojas da Awin mandam no feed o caminho da categoria do produto ("Productos para mascotas y animales > …",
// "Banho - Produto - Toalha de Banho", "Climatização > Ar Condicionado"). Esse caminho é mais confiável que o título:
// "Perfume Deo Colônia Fêmea Procão" é de pet, "Charm Perfume em Prata 925" é joia, "Perfume para Ar Condicionado" não é perfume.
// Quando o caminho diz claramente a categoria, ela vale para o produto em qualquer busca ou categoria aberta.
// Caminho que não bate com nenhuma regra: tenta o nome da categoria da loja com as regras do título (lib/categorias.js);
// nada claro = null (vale o título, como antes). O robô lista toda madrugada os caminhos sem categoria (robo/caminhos.mjs).
import { normalizar } from "./texto.js";

// Ordem importa: o primeiro que bate vence. Português, espanhol e inglês (taxonomia do Google nos feeds), sem acento
const REGRAS = [
  ["Pets", "mascota, mascotas, pet, pets, pet shop, animais de estimacao, animal de estimacao, animales, cachorro, cachorros, caes, cao, gato, gatos, racao, racoes, aquario, aquarismo, passaros, roedores, petiscos"],
  ["Bebês", "bebe, bebes, enxoval, maternidade, fraldas, fralda, bebes y ninos, baby"],
  ["Perfumes", "perfume, perfumes, perfumaria, perfumeria, fragrancia, fragrancias, colonia, colonias"],
  ["Maquiagem", "maquiagem, maquillaje, make up, makeup"],
  ["Skincare", "skincare, skin care, cuidados com a pele, cuidado de la piel, dermocosmeticos, protetor solar, protecao solar"],
  ["Cabelo", "cabelo, cabelos, capilar, cabello, shampoo, condicionador"],
  ["Suplementos", "suplemento, suplementos, suplementacao, nutricao esportiva, vitaminas, whey"],
  ["Smartwatches", "smartwatch, smartwatches, relogio inteligente, relogios inteligentes"],
  ["Relógios", "relogio, relogios, relojes, reloj"],
  ["Joias e bijuterias", "joia, joias, joyas, joyeria, bijuteria, bijuterias, semijoias, semijoia, aneis, anel, brincos, brinco, colares, colar, pulseiras, pingentes, amuletos, berloques, charms"],
  ["Óculos", "oculos, gafas"],
  ["Bonés e chapéus", "bone, bones, chapeu, chapeus, gorras, gorra"],
  ["Calçados", "calcado, calcados, calzado, tenis, sapato, sapatos, sandalia, sandalias, chinelo, chinelos, bota, botas, sapatilha"],
  ["Bolsas e mochilas", "bolsa, bolsas, mochila, mochilas, malas, equipaje, carteiras"],
  ["Moda íntima", "moda intima, lingerie, cueca, cuecas, calcinha, calcinhas, sutia, pijama, pijamas, ropa interior"],
  ["Moda fitness", "moda fitness, roupa fitness, legging, leggings"],
  ["Celulares", "celular, celulares, smartphone, smartphones, telefonia movil"],
  ["Fones de ouvido", "fone, fones, fone de ouvido, fones de ouvido, headset, headsets, auriculares"],
  ["Caixas de som", "caixa de som, caixas de som, soundbar, altavoces"],
  ["Games", "games, videogame, videogames, consoles, console, jogos eletronicos"],
  ["Informática", "informatica, computador, computadores, notebook, notebooks, pc, perifericos, hardware, monitor, monitores, impressora, impressoras, computadoras"],
  ["Eletroportáteis", "eletroportatil, eletroportateis, portateis, air fryer, fritadeira, liquidificador, cafeteira, cafeteiras, batedeira"],
  ["Eletrodomésticos", "eletrodomestico, eletrodomesticos, climatizacao, ar condicionado, ar condicionados, geladeira, geladeiras, refrigerador, fogao, fogoes, cooktop, lavadora, lavadoras, maquina de lavar, lava loucas, tv, tvs, televisor, televisores, electrodomesticos, micro ondas, microondas, forno"],
  ["Mesa posta", "mesa posta, toalha de mesa, jogo americano, sousplat"],
  ["Cama e banho", "cama, banho, cama e banho, toalha, toalhas, lencol, lencois, edredom, edredons, travesseiro, travesseiros, ropa de cama"],
  ["Cozinha", "cozinha, utensilios, panela, panelas, cocina, menaje"],
  ["Móveis", "moveis, movel, mobiliario, muebles, sofa, sofas, poltrona, poltronas, colchao, colchoes, guarda roupa"],
  ["Iluminação LED", "iluminacao, luminaria, luminarias, lampada, lampadas, iluminacion"],
  ["Decoração", "decoracao, decoracion, quadros, vasos, tapetes"],
  ["Organização", "organizacao, organizadores, organizador"],
  ["Limpeza", "limpeza, limpieza, lavanderia"],
  ["Brinquedos", "brinquedo, brinquedos, juguetes, juguete, bonecas, pelucias"],
  ["Esporte e fitness", "esporte, esportes, deporte, deportes, fitness, academia, ciclismo, camping, pesca, futebol, natacao"],
  ["Ferramentas", "ferramenta, ferramentas, herramientas, construcao, jardinagem"],
  ["Automotivo", "automotivo, automotivos, automotiva, veiculo, veiculos, auto pecas, autopecas, vehiculos, carro, carros, moto, motos"],
];

const compiladas = REGRAS.map(([nome, frases]) => {
  const lista = frases.split(", ").sort((a, b) => b.length - a.length);
  return [nome, new RegExp(`(^| )(${lista.join("|")})( |$)`)];
});
const RE_PET = compiladas[0][1];

// "Banho - Produto - Toalha de Banho", "Climatização &gt; Ar Condicionado" → partes normalizadas
const partes = (caminho) => String(caminho || "").replace(/&gt;/gi, ">").split(/\s*(?:>|\/|\||\s-\s)\s*/).map(normalizar).filter(Boolean);

const memoria = new Map();
// Nome da nossa categoria para o caminho da loja, ou null. classificarTitulo = categoriaDoProduto (vem de fora
// para não criar import circular com lib/categorias.js)
export function categoriaDoCaminho(caminho, classificarTitulo) {
  const chave = String(caminho || "");
  if (!chave) return null;
  if (memoria.has(chave)) return memoria.get(chave);
  const pedacos = partes(chave);
  let nome = null;
  // Do pedaço mais específico (o último) para o mais geral: "Supermercado > Higiene > Perfume" é perfume
  for (const pedaco of [...pedacos].reverse()) {
    nome = compiladas.find(([, re]) => re.test(pedaco))?.[0] || classificarTitulo?.(pedaco)?.nome || null;
    if (nome) break;
  }
  // Pet manda no caminho inteiro: "Productos para mascotas > Higiene > Perfume" é de pet
  if (nome !== "Pets" && pedacos.some((p) => RE_PET.test(p))) nome = "Pets";
  if (memoria.size > 5000) memoria.clear();
  memoria.set(chave, nome);
  return nome;
}
