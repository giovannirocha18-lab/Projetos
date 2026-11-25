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
  ["Pets", "mascota, mascotas, pet, pets, pet shop, petshop, veterinario, veterinarios, animais de estimacao, animal de estimacao, animales, cachorro, cachorros, caes, cao, gato, gatos, racao, racoes, aquario, aquarismo, passaros, roedores, petiscos"],
  ["Bebês", "bebe, bebes, berco, bercos, enxoval, maternidade, fraldas, fralda, bebes y ninos, baby"],
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
  ["Moda íntima", "moda intima, intimates, lingerie, cueca, cuecas, calcinha, calcinhas, sutia, pijama, pijamas, ropa interior"],
  ["Moda fitness", "moda fitness, roupa fitness, legging, leggings"],
  ["Celulares", "celular, celulares, smartphone, smartphones, telefonia movil"],
  ["Fones de ouvido", "fone, fones, fone de ouvido, fones de ouvido, headset, headsets, auriculares"],
  ["Caixas de som", "caixa de som, caixas de som, soundbar, altavoces"],
  ["Games", "games, videogame, videogames, consoles, console, jogos eletronicos"],
  ["Informática", "informatica, computador, computadores, notebook, notebooks, pc, perifericos, hardware, monitor, monitores, impressora, impressoras, computadoras"],
  ["Eletroportáteis", "eletroportatil, eletroportateis, portateis, panela eletrica, panelas eletricas, air fryer, fritadeira, liquidificador, cafeteira, cafeteiras, batedeira"],
  ["Eletrodomésticos", "eletrodomestico, eletrodomesticos, climatizacao, ar condicionado, ar condicionados, geladeira, geladeiras, refrigerador, fogao, fogoes, cooktop, lavadora, lavadoras, maquina de lavar, lava loucas, tv, tvs, televisor, televisores, electrodomesticos, micro ondas, microondas, forno"],
  // Móveis com nome de cômodo ou de cama: "Cozinha Completa" é armário, "Cama Box" é móvel (a roupa de cama vem acima)
  ["Móveis", "cozinha completa, cozinha modulada, cozinhas moduladas, armario, armarios, armario multiuso, paneleiro, paneleiros, balcao, balcoes, gabinete de banheiro, beliche, beliches, bicama, bicamas, cama box, cama solteiro, cama casal, cama infantil, cama montessoriana, camas, rack, racks, estante, estantes, comoda, comodas, penteadeira, escrivaninha, sapateira, cristaleira, cristaleiras, buffet, aparador, banqueta, banquetas, mesa de jantar, mesa de centro, mesa de cabeceira, mesas de cabeceira, mesa de escritorio, mesa lateral, mesa de canto, mesa gamer, mesas gamer, mesa office, mesa para computador, cadeira, cadeiras"],
  ["Mesa posta", "mesa posta, toalha de mesa, jogo americano, sousplat"],
  ["Cama e banho", "banho, cama e banho, jogo de cama, jogos de cama, roupa de cama, colcha, colchas, cobre leito, manta, mantas, cobertor, cobertores, fronha, fronhas, toalha, toalhas, lencol, lencois, edredom, edredons, travesseiro, travesseiros, ropa de cama"],
  ["Cozinha", "cozinha, utensilios, panela, panelas, cocina, menaje"],
  ["Móveis", "moveis, movel, mobiliario, muebles, sofa, sofas, poltrona, poltronas, colchao, colchoes, guarda roupa"],
  ["Iluminação LED", "iluminacao, luminaria, luminarias, lampada, lampadas, iluminacion"],
  ["Decoração", "decoracao, decoracion, quadros, vasos, tapetes"],
  ["Organização", "organizacao, organizadores, organizador"],
  ["Limpeza", "limpeza, limpieza, lavanderia"],
  ["Brinquedos", "brinquedo, brinquedos, juguetes, juguete, bonecas, pelucias"],
  ["Esporte e fitness", "esporte, esportes, deporte, deportes, fitness, academia, ciclismo, camping, pesca, futebol, natacao"],
  ["Ferramentas", "ferramenta, ferramentas, herramientas, construcao, jardinagem"],
  ["Automotivo", "automotivo, automotivos, automotiva, veiculo, veiculos, auto pecas, autopecas, vehiculos, carro, carros, motocicleta, motocicletas, moto pecas, motopecas"],
];

const compiladas = REGRAS.map(([nome, frases]) => {
  const lista = frases.split(", ").sort((a, b) => b.length - a.length);
  return [nome, new RegExp(`(^| )(${lista.join("|")})( |$)`)];
});
const RE_PET = compiladas[0][1];
const GENERO = [["Moda masculina", /(^| )(masculino|masculina|homem|homens|men)( |$)/], ["Moda feminina", /(^| )(feminino|feminina|mulher|mulheres|women)( |$)/]];

// "Banho - Produto - Toalha de Banho", "Climatização &gt; Ar Condicionado" → partes normalizadas
const partes = (caminho) => String(caminho || "").replace(/&gt;/gi, ">").split(/\s*(?:>|\/|\||\s-\s)\s*/).map(normalizar).filter(Boolean);

// Loja de um tipo só, quando o caminho não diz a categoria ("Animale | NEW COLLECTION - BLUSA", "Casa Tema | Cama").
// forte = vale mesmo que o título aponte outra (a Casa Tema só vende móveis: "Cama Solteiro" é móvel, não roupa de cama);
// fraca = só quando o título também não diz nada (na Animale "Bolsa Térmica" fica em Bolsas)
// aceita = categorias do caminho que a loja forte também vende (Casa Tema: quarto de bebê); o resto vira a dela
// ("Cozinha" e "Organização" na Casa Tema são armários)
const PADRAO_DA_LOJA = {
  // 24/11/2026, auditoria das lojas (Giovanni: "identifique os produtos que elas vendem e veja como estão categorizadas"):
  // 33 mil cartões lidos. Loja de um ramo só fica "forte": o que o título mandaria para categoria que a loja não vende
  // ("Vestido Decote Halter" em Esporte, "Onça Batom" em Maquiagem, "Rasteira Tratorada" em Automotivo, "Relógio
  // Comparador" em Relógios, "Meia Pata" em Moda íntima) fica na categoria da loja
  "animale": { nome: "Moda feminina", forte: true, aceita: ["Bolsas e mochilas", "Moda íntima", "Calçados", "Joias e bijuterias", "Bonés e chapéus", "Moda fitness", "Cozinha", "Óculos"] },
  "cobasi": { nome: "Pets", forte: true },
  "karsten": { nome: "Cama e banho", forte: true, aceita: ["Mesa posta", "Decoração", "Bolsas e mochilas"] },
  "motorola": { nome: "Acessórios de celular", forte: true, comeca: [/^(kit com \d+ )?moto tags?\b/i, "Acessórios de celular"], aceita: ["Celulares", "Carregadores", "Fones de ouvido", "Smartwatches", "Bebês", "Caixas de som"] },
  "oboticario": { nome: "Skincare", forte: true, aceita: ["Perfumes", "Maquiagem", "Cabelo", "Bolsas e mochilas", "Decoração", "Bebês", "Pets", "Cama e banho", "Moda infantil", "Brinquedos"] },
  "spicy": { nome: "Cozinha", forte: true, aceita: ["Eletroportáteis", "Organização", "Limpeza", "Eletrodomésticos", "Cabelo", "Mesa posta"] },
  "polishop": { nome: "Eletroportáteis", forte: true, comeca: [/^(barbeador|aparador)\b/i, "Cabelo"],
    aceita: ["Cozinha", "Cabelo", "Informática", "Esporte e fitness", "Maquiagem", "Limpeza", "Moda íntima", "Suplementos", "Eletrodomésticos", "Skincare"] },
  "kabum": { nome: "Informática", forte: true, semPet: true, comeca: [[/^(cadeira|mesa)\b/i, "Móveis"], [/^fechadura\b/i, "Ferramentas"],
      // 25/11/2026: os relógios vêm na categoria "Celular & Smartphone > Wearables" da loja e caíam em Celulares (Smartwatches 114 → 63)
      [/^(apple watch|smart ?watch|galaxy watch|smart ?band|rel[oó]gio (inteligente|smart))\b/i, "Smartwatches"]],
    aceita: ["Games", "Móveis", "Fones de ouvido", "Caixas de som", "Celulares", "Eletrodomésticos", "Limpeza", "Smartwatches", "Carregadores", "Brinquedos",
      "Iluminação LED", "Óculos", "Bolsas e mochilas", "Acessórios de celular", "Moda masculina", "Bonés e chapéus"] },
  "anhanguera ferramentas": { nome: "Ferramentas", forte: true },
  "amakha paris": { nome: "Perfumes", forte: true, aceita: ["Cabelo", "Skincare", "Bolsas e mochilas"] },
  "brinox": { nome: "Cozinha", forte: true, aceita: ["Organização", "Eletroportáteis", "Mesa posta", "Eletrodomésticos"] },
  "candide": { nome: "Brinquedos", forte: true, semPet: true },
  "toymania": { nome: "Brinquedos", forte: true, semPet: true },
  "shopinfo": { nome: "Informática", forte: true, aceita: ["Fones de ouvido", "Caixas de som"] },
  "sofa na caixa": { nome: "Móveis", forte: true, semPet: true, aceita: ["Decoração"] },
  "soulier": { nome: "Calçados", forte: true, aceita: ["Bolsas e mochilas", "Óculos", "Bonés e chapéus"] },
  "einstar": { nome: "Informática", forte: true },
  "ferramentas kennedy": { nome: "Ferramentas", forte: true, aceita: ["Limpeza", "Iluminação LED", "Pets", "Bolsas e mochilas", "Móveis"] },
  "friopecas": { nome: "Eletrodomésticos", forte: true, aceita: ["Eletroportáteis", "Móveis", "Limpeza", "Cozinha", "Ferramentas", "Esporte e fitness"] },
  "hunter fan": { nome: "Eletrodomésticos", forte: true },
  "little duck": { nome: "Móveis", forte: true, semPet: true, aceita: ["Decoração", "Cama e banho", "Bebês"] },
  "mundo vem": { nome: "Cozinha", forte: true, aceita: ["Mesa posta"] },
  "nutribullet": { nome: "Eletroportáteis", forte: true, aceita: ["Cozinha"] },
  "pcyes": { nome: "Informática", forte: true, aceita: ["Games", "Móveis", "Carregadores", "Fones de ouvido", "Iluminação LED", "Organização"] },
  "lojao dos esportes": { nome: "Esporte e fitness", forte: true, comeca: [/^(chuteira|t[eê]nis(?! de mesa)|chinelo)\b/i, "Calçados"],
    aceita: ["Moda infantil", "Moda masculina", "Moda feminina", "Bolsas e mochilas", "Bonés e chapéus", "Moda fitness"] },
  "livrarias curitiba": { nome: "Livros", forte: true, semPet: true },
  // Farmácias: fralda, protetor solar, suplemento e shampoo seguem nas categorias deles; o resto (remédios) é Farmácia
  "drogasmil": { nome: "Farmácia", forte: true, semPet: true, aceita: ["Bebês", "Skincare", "Suplementos", "Cabelo", "Perfumes", "Maquiagem"] },
  "promofarma": { nome: "Farmácia", forte: true, semPet: true, aceita: ["Bebês", "Skincare", "Suplementos", "Cabelo", "Perfumes", "Maquiagem"] },
  "moto br": { nome: "Automotivo", forte: true, aceita: ["Moda masculina", "Moda feminina", "Bolsas e mochilas"] },
  "casa tema": { nome: "Móveis", forte: true, aceita: ["Bebês", "Decoração", "Iluminação LED"] },
  // Central Ar põe o nome do produto no caminho ("VRF_COMPONENTES > CONTROLE SEM FIO…" virava Games): tudo é ar-condicionado
  "central ar": { nome: "Eletrodomésticos", forte: true },
  // TEKA (Awin, 04/11/2026): cama, mesa e banho, feed sem categoria; toalha de mesa fica em Mesa posta, almofada em Decoração
  "teka": { nome: "Cama e banho", forte: true, aceita: ["Mesa posta", "Decoração", "Bebês"] },
  // Olympikus (Awin, 13/11/2026; Giovanni: "temos a categoria calçados, deixe a olympikus lá, assim fica padrão"): os tênis
  // saíam em Calçados e em Esporte e fitness ("corrida" no nome). Tênis e chinelo sempre em Calçados (`comeca`); roupa com
  // "masculina/feminina", meia, boné e mochila nas categorias de sempre; a roupa esportiva sem gênero, em Esporte e fitness
  "olympikus": { nome: "Esporte e fitness", forte: true, comeca: [/^(kit (\d+ )?)?(t[eê]nis|chinelo|sand[aá]lia|chuteira|sapatilha)\b/i, "Calçados"],
    aceita: ["Moda masculina", "Moda feminina", "Moda íntima", "Bonés e chapéus", "Bolsas e mochilas"] },
  // Monte Carlo Jóias (24/11/2026, print do Giovanni: a página da loja mostrava Perfumes, Pets, Óculos, Calçados…): eram
  // pingentes com o nome do desenho ("Charm Perfume", "Charm Cachorro", "Charm Bicicleta"). Tudo é joia; relógio e pulseira
  // de relógio em Relógios; necessaire/tag de mala em Bolsas. `semPet`: nem o "cachorro" do nome manda para Pets
  "monte carlo joias": { nome: "Joias e bijuterias", forte: true, semPet: true,
    sempre: /^(charm|pingente|berloque|brinco|anel|colar|corrente|pulseira(?! de rel[oó]gio)|piercing|alian[cç]a|gargantilha|tornozeleira|escapul[aá]rio)\b/i, comeca: [/^(rel[oó]gio|pulseira de rel[oó]gio)\b/i, "Relógios"],
    aceita: ["Relógios", "Smartwatches", "Bolsas e mochilas"] },
};
export const padraoDaLoja = (lojaNome) => PADRAO_DA_LOJA[normalizar(lojaNome || "")] || null;

const memoria = new Map();
// Nome da nossa categoria para o caminho da loja, ou null. classificarTitulo = categoriaDoProduto (vem de fora
// para não criar import circular com lib/categorias.js)
export function categoriaDoCaminho(caminho, classificarTitulo) {
  const chave = String(caminho || "");
  if (!chave) return null;
  if (memoria.has(chave)) return memoria.get(chave);
  const pedacos = partes(chave);
  let nome = null;
  // Do pedaço mais específico (o último) para o mais geral: "Supermercado > Higiene > Perfume" é perfume.
  // Primeiro só as regras daqui; as regras do título só no fim (em "Cadeiras Gamer > XT Racer" a marca "Racer"
  // virava Automotivo e "Alpha Gamer" virava Games)
  const invertidos = [...pedacos].reverse();
  for (const pedaco of invertidos) {
    nome = compiladas.find(([, re]) => re.test(pedaco))?.[0] || null;
    if (nome) break;
  }
  for (const pedaco of nome ? [] : invertidos) {
    nome = classificarTitulo?.(pedaco)?.nome || null;
    if (nome) break;
  }
  // Por último o público: "Calvin Klein | Masculino" é moda masculina, mas "Perfumes > Masculino" é perfume (acima)
  if (!nome) nome = invertidos.map((p) => GENERO.find(([, re]) => re.test(p))?.[0]).find(Boolean) || null;
  // Pet manda no caminho inteiro: "Productos para mascotas > Higiene > Perfume" é de pet
  if (nome !== "Pets" && pedacos.some((p) => RE_PET.test(p))) nome = "Pets";
  if (memoria.size > 5000) memoria.clear();
  memoria.set(chave, nome);
  return nome;
}
