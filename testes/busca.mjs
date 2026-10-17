// Teste da busca: termos que o povo mais procura + casos que o Giovanni já mandou em prints.
// Rodar antes de publicar qualquer mudança na busca:   node testes/busca.mjs
// Cada caso: busca -> títulos (no estilo da Shopee/AliExpress) e o que se espera de cada um:
//   E = é o produto buscado (tem que "bater" e não ser acessório)
//   A = acessório ou peça (fica escondido)
//   N = não é o produto (não pode "bater"; pode aparecer no fim da lista)
// Além disso, todo E tem que vir antes de todo N/A na ordem de "Mais relevantes".
// Fontes dos termos (pesquisa de 16/10/2026): MELI Trends 2025 (Mercado Livre), "Os Mais Desejados do Ano"
// 2025 (Google), balanço 2025 e Mapa Shopee 2026 (Shopee), Black Friday 2025 (Google).
import { citaAlgumaPalavra, separarAcessorios } from "../lib/relevancia.js";
import { categoriaDoProduto } from "../lib/categorias.js";
import { corrigirBusca, termoNasLojas } from "../lib/vocabulario.js";

const CASOS = {
  // ---- Prints do Giovanni ----
  "mini pc": {
    E: ["Mini Pc Itautec Infoway Atom 4gb 120gb Ssd Preto", "Mini PC OKI Brasil Intel Celeron J1800 8GB", "Mini Pc Dell Wyse | AMD 1.4Ghz | 8gb", "Mini PC Gamer N100 16GB 512GB Windows 11"],
    N: ["1-5 unidades de Microfone Lavalier Mini USB Portátil Clip-on para PC", "Microfone de lapela portátil USB mini com clipe de metal para PC", "NOVO Microfone de Lapela Mini de 0,5mm para PC, Laptop"],
  },
  "invictus": {
    E: ["Perfume Invictus Paco Rabanne 100ml Eau de Toilette", "Body Splash Man Invictus OldWolf 200ml Perfume"],
  },
  "air fryer oster": {
    E: ["Fritadeira Elétrica Air Fryer Oster 4,6L Preta", "Oster Fritadeira Air Fryer Digital 3,2L", "Airfryer Oster 3L 127V"],
    A: ["Motor 127v Fritadeira Oster Air Fryer", "Botão Knob para Air Fryer Oster", "Tapete de Silicone para Air Fryer Oster", "Cesto Air Fryer Oster Reposição"],
  },
  "air fryer": {
    E: ["Fritadeira a Ar Dupla Ninja Mais Vendida para Casa", "Fritadeira Elétrica Air Fryer Mondial 4L", "Airfryer Philco 5,5L Antiaderente", "Fritadeira Air Fryer Britânia BFR38 com Grelha"],
    A: ["Papel Descartável para Fritadeira de Ar, Forro Antiaderente", "Forma de Papel Descartável para Air Fryer 50un", "Tapete Silicone Air Fryer Redondo", "Crisping Plate for Ninja Air Fryer", "Espumagic Limpador para Air Fryer", "Air Fryer Liners Paper 100pcs"],
    N: ["Airfryer de Brinquedo Infantil Cozinha", "Jaqueta Alpinestars Viper V3 Air Preto Vermelho", "Capacete ASX City Air Square", "Compressor Smart Air 1,5Hp 220V Pressure"],
  },
  "capa iphone": {
    E: ["Capa para iPhone 15 Pro Silicone", "Kit 2 Capas para iPhone 13 Transparente", "Capinha iPhone 14 Anti Impacto"],
  },
  // Print de 17/10/2026: nenhuma loja tinha a máquina, só peças (o site avisa "não encontrado nas lojas parceiras")
  "maquina de lavar eletrolux": {
    E: ["Máquina de Lavar Electrolux 13kg LED13", "Lavadora Eletrolux 12kg Essential Care", "Máquina de Lavar Roupas Eletrolux 8,5kg Branca"],
    A: ["Eletrobomba máquina de lavar, Brastemp, Consul, Eletrolux de 8 a 15 kg, 127V", "Kit 4 Pé Nivelador Anti Vibração Máquina de Lavar Eletrolux Pezinho Alto",
      "Embreagem Maquina De Lavar Eletrolux Lbu15 Ltp15", "Pezinho Nivelador Máquina De Lavar Eletrolux", "Agitador Eletrolux Com 4 Pé Para Máquina De Lavar Lm08"],
  },
  "fone celular": { E: ["Fone de Ouvido para Celular P2 com Microfone"] },
  // Print de 17/10/2026: "microondas" misturava peças de conserto com os aparelhos
  "microondas": {
    E: ["Microondas 110v 32L Painel Digital Branco", "Micro-ondas Electrolux 20L cor Inox Espelhado com Função Tira Odor", "Micro-Ondas Mondial 1200W MO-01-21-E"],
    A: ["Kit 10 Filamento Microondas Reparo Magnetron Reparo Microondas Todos os modelos", "Capacitor Microondas Alta Qualidade 0,80uf 2000v",
      "Forno de microondas pé almofada forno microondas alta Base", "Display Microondas Pme31 Micro-ondas", "Prato de Microondas com Rodizio para Micro Ondas Brastemp",
      "Forno de microondas Universal dedicado placa de vidro forno de microondas bandeja", "Capacitor de Microondas 90uf + Diodo + Fusível de alta - Reparo de microondas",
      "Novo forno de microondas EM7KCGW3-NR forno de microondas filme interruptor botão painel", "Membrana Teclado Microondas Electrolux Mef41"],
  },
  // Print de 17/10/2026: "ps5" mostrava adesivo, enfeite e skin no topo e o console só em "Maior preço"
  "ps5": {
    E: ["Console PS5 Slim 825GB Digital Edition + 2 Jogos", "PS5 SLIM BUNDLE 1TB FISICO", "Console PlayStation PS5 Bundle Edição Digital", "playstation 5 825gb", "Console PlayStation 5 Slim 1TB", "Sony PS5 Pro Digital"],
    A: ["Controle DualSense para PS5", "Capa Skin Adesivo PS5", "2026 Novo produto PS5 SLIM Elite Version pro Handle Silicone Capa protetora", "2026 Novo produto Heroes PS5 pro Adesivo de corpo", "Skin PS5 Fat Playstation 5 Adesivo - Personalizada", "Decoração PlayStation PS5 | Enfeite de Mesa"],
  },
  "jogo de panelas": { E: ["Jogo Panelas Tramontina Antiaderente 5 peças", "Jogo de Panelas Cerâmica 10 Peças Kit Cozinha"] },
  "tapete yoga": { E: ["Tapete de Yoga Antiderrapante 6mm"] },
  "ar condicionado": {
    E: ["Ar Condicionado Split 12000 Btus Inverter", "Ar-Condicionado Portátil 9000 BTUs"],
    A: ["Controle Remoto para Ar Condicionado Universal", "Adequado para Volvo XC90 painel de saída de ar condicionado"],
  },

  // ---- Mercado Livre: mais buscados 2025 ----
  "celular": { E: ["Celular Samsung Galaxy A06 128GB", "Smartphone Xiaomi Redmi 14C 256GB"], A: ["Capinha Celular Samsung A06", "Película para Celular 3D"] },
  "celular samsung": { E: ["Smartphone Samsung Galaxy A06 128GB 4GB RAM", "Celular Samsung Galaxy A16 5G"] },
  "tenis feminino": { E: ["Tênis Feminino Casual Branco Plataforma", "Tenis Feminino Esportivo Academia"] },
  "ventilador": { E: ["Ventilador de Mesa Mondial 40cm Turbo", "Ventilador Coluna Arno 6 Pás"], A: ["Hélice Ventilador Arno 40cm Reposição"] },
  "iphone 15": { E: ["Apple iPhone 15 128GB Preto", "iPhone 15 Pro Max 256GB Vitrine"], A: ["Capa para iPhone 15 Magsafe", "Película iPhone 15 Vidro 3D"] },
  "geladeira": { E: ["Geladeira Frost Free Brastemp 375L", "Refrigerador Geladeira Consul 300 Litros"], A: ["Borracha Gaxeta para Geladeira Consul"] },
  "camiseta dry fit": { E: ["Camiseta Dry Fit Masculina Academia", "Kit 3 Camisetas Dry Fit Esporte"] },
  "creatina": { E: ["Creatina Monohidratada 300g Growth", "Creatina Max Titanium 100% Pura 150g"] },
  "caixa de som boombox": { E: ["Caixa de Som JBL Boombox 3 Bluetooth", "Caixa Som Boombox Portátil Bluetooth 40W"] },

  // ---- Google: mais desejados 2025 ----
  "labubu": { E: ["Boneco Labubu Pop Mart Original Série Macarron", "Labubu Chaveiro Pelúcia"] },
  "poco x7 pro": { E: ["Xiaomi Poco X7 Pro 5G 256GB 8GB", "Smartphone POCO X7 Pro 512GB"], A: ["Capa para Poco X7 Pro Anti Impacto", "Película Poco X7 Pro 3D"] },
  "bobbie goods": { E: ["Canetas Bobbie Goods Kit 24 Cores", "Livro de Colorir Bobbie Goods"] },
  "iphone 17": { E: ["Apple iPhone 17 256GB Lavanda", "iPhone 17 Pro Max 512GB"] },
  "tenis corre 4": { E: ["Tênis Olympikus Corre 4 Masculino", "Tenis Corre 4 Olympikus Feminino Corrida"] },
  "perfume arabe": { E: ["Perfume Árabe Lattafa Yara 100ml", "Perfume Arabe Asad Lattafa Masculino"] },
  "smartwatch garmin": { E: ["Smartwatch Garmin Forerunner 265", "Relógio Smartwatch Garmin Venu 3"], A: ["Pulseira para Smartwatch Garmin 22mm", "Carregador Cabo USB Smartwatch Garmin"] },
  "tv 55 polegadas": { E: ["Smart TV 55 Polegadas Samsung 4K UHD", "Smart TV LED 55\" LG 4K ThinQ AI", "TV 55'' TCL QLED Google TV"], A: ["Suporte de Parede para TV 32 a 55 Polegadas"] },
  "galaxy s24": { E: ["Samsung Galaxy S24 256GB 5G", "Smartphone Samsung Galaxy S24 FE 128GB"], A: ["Capinha Galaxy S24 Silicone"] },

  // ---- Shopee: mais vendidos/buscados 2025–2026 ----
  "jogo de lencol casal": { E: ["Jogo de Lençol Casal 400 Fios 100% Algodão", "Jogo Lençol Casal Queen 4 Peças Microfibra"] },
  "projetor 4k": { E: ["Projetor 4K Portátil Android Wifi 5G", "Mini Projetor 4K Smart HY300"], A: ["Suporte de Teto para Projetor 4K"] },
  "bicicleta ergometrica": { E: ["Bicicleta Ergométrica Vertical Dream Fitness", "Bicicleta Ergometrica Spinning 13kg"] },
  "fone bluetooth": { E: ["Fone de Ouvido Bluetooth Sem Fio TWS", "Fone Bluetooth JBL Tune 520BT", "Fone de Ouvido Sem Fio Bluetooth 5.3 com Cancelamento de Ruído"], A: ["Case Capa para Fone Bluetooth AirPods"] },
  "carregador iphone": { E: ["Carregador iPhone 20W Turbo USB-C Original", "Carregador Rápido para iPhone 15 Cabo Lightning"] },
  "liquidificador": { E: ["Liquidificador Mondial Turbo 1200W 3L", "Liquidificador Oster Osterizer Clássico"], A: ["Copo de Liquidificador Arno Reposição", "Lâmina Faca para Liquidificador Britânia"] },
  "camera wifi": { E: ["Câmera Wifi Ip Smart 360 Full HD Visão Noturna", "Camera de Segurança Wifi Externa à Prova D'água"] },
  "areia para gatos": { E: ["Areia para Gatos Higiênica Pipicat 4kg", "Areia Sanitária para Gatos Biodegradável 12kg"] },
  "retrovisor moto": { E: ["Retrovisor Moto Honda CG 160 Par", "Par de Retrovisor para Moto Universal"] },
  "torneira cozinha": { E: ["Torneira Gourmet Cozinha Monocomando Inox", "Torneira de Cozinha Parede Bica Móvel"], A: ["Refil Filtro para Torneira de Cozinha"] },
  "notebook": { E: ["Notebook Lenovo IdeaPad 1 Ryzen 5 8GB", "Notebook Samsung Galaxy Book4 i5"], A: ["Carregador Fonte para Notebook Dell 65W", "Mochila para Notebook 15.6 Impermeável", "Suporte para Notebook Ajustável Alumínio"] },
  "smartwatch": { E: ["Smartwatch Xiaomi Redmi Watch 5 Active", "Relógio Smart Watch D20 Bluetooth"], A: ["Pulseira Silicone para Smartwatch 20mm"] },
  "smartphone": { E: ["Celular Motorola Moto G35 5G 128GB", "Smartphone Samsung Galaxy A16"], A: ["Suporte Celular Carro Magnético"] },
  "playstation 5": { E: ["Console Sony PS5 Slim Digital", "PlayStation 5 Pro 2TB"] },
  "televisao 50": { E: ["Smart TV 50 Polegadas Philco 4K", "Televisão 50\" Samsung Crystal UHD"] },
  "meia": { E: ["Meias de pé meio pé meias femininas verão", "Uemori meias de dedo do pé dividido meia"] },
  "stanley": { E: ["Copo Térmico Stanley 473ml Quencher", "Garrafa Stanley Classic 1L"] },
  // Conferência no site (17/10/2026): peças com o título começando pelo produto e brinquedo colecionável
  "bicicleta": {
    E: ["Bicicleta Aro 29 Caloi Explorer 21 Marchas", "Bicicleta Infantil Aro 16 Nathor"],
    A: ["20*1.75/47-406 bicicleta dobrável roda pequena bicicleta 67cm tubo interno tubo externo"],
  },
  "microondas": {
    E: ["Microondas 32L Electrolux Painel Digital", "Micro-ondas Midea 20L Branco 127V"],
    A: ["Forno de microondas motor síncrono forno de microondas plataforma giratória motor"],
  },
  "maquina de lavar": {
    E: ["Máquina de Lavar Electrolux 15kg Branca Essential Care", "Máquina de Lavar Consul 15Kg com Modo Eco Branca"],
    A: ["Máquina de lavar roupa coletor de pêlos de animais de estimação flutuante",
      "Pé Máquina De Lavar Nivelador Anti Vibração Resistente Moveis Máquinas Geladeira"],
  },
  "impressora 3d": {
    E: ["Impressora 3D Creality Ender 3 V3 SE", "Impressora 3D Bambu Lab A1 Mini"],
    A: ["Impressora 3D Anycubic vyper Conjunto de cabeça de extrusão quente E3D V5", "Impressora de extremidade quente da extrusora da impressora 3D"],
  },
  "geladeira": {
    E: ["Geladeira Frost Free Consul 340L", "Geladeira Portátil 40L Camping"],
  },
};

let falhas = 0;
let total = 0;
for (const [q, esperado] of Object.entries(CASOS)) {
  const titulos = Object.entries(esperado).flatMap(([tipo, lista]) => lista.map((titulo) => ({ titulo, tipo })));
  const saida = separarAcessorios(titulos.map(({ titulo }) => ({ titulo })), q);
  const tipoDe = new Map(titulos.map((t) => [t.titulo, t.tipo]));
  const erros = [];
  for (const o of saida) {
    const tipo = tipoDe.get(o.titulo);
    total++;
    const exato = o.bate && !o.acessorio;
    if ((q === "ps5" || q === "microondas") && tipo === "E" && !o.principal) erros.push(`deveria vir na frente (principal): ${o.titulo}`);
    if (tipo === "E" && !exato) erros.push(`deveria ser o produto: ${o.titulo} (${o.acessorio ? "marcado acessório" : "não bateu"})`);
    if (tipo === "A" && !o.acessorio) erros.push(`deveria ser acessório: ${o.titulo}`);
    if (tipo === "N" && exato) erros.push(`não é o produto, mas bateu: ${o.titulo}`);
  }
  const ultimoE = saida.map((o) => tipoDe.get(o.titulo)).lastIndexOf("E");
  const primeiroOutro = saida.findIndex((o) => tipoDe.get(o.titulo) !== "E");
  if (primeiroOutro >= 0 && ultimoE > primeiroOutro) erros.push(`ordem: "${saida[primeiroOutro].titulo}" veio antes de produto certo`);
  if (erros.length) {
    falhas += erros.length;
    console.log(`✗ ${q}`);
    for (const e of erros) console.log(`    ${e}`);
  }
}
// Preço como prova e busca de acessório (17/10/2026): [busca, [título, preço], esperado]
//   P = produto na frente (principal), A = acessório (escondido), N = aparece, mas não na frente
const geladeiras = [["Geladeira Frost Free 400L Electrolux", 2800], ["Geladeira Brastemp Duplex 375L", 2600], ["Geladeira Consul 300L", 1900],
  ["Geladeira Midea Inverse 410L", 3100], ["Geladeira Portátil 40L", 1700], ["Geladeira Panasonic 425L", 3300]];
const celulares = [["Celular Samsung Galaxy A06", 700], ["Celular Motorola Moto G24", 900], ["Celular Xiaomi Redmi 13", 1100],
  ["Smartphone Samsung Galaxy S24", 4000], ["iPhone 15 Celular Apple 128GB", 4500], ["Celular Realme C61", 800]];
const CASOS_PRECO = [
  ["geladeira", [...geladeiras, ["Imã de Geladeira Dragon Ball", 21]], { "Imã de Geladeira Dragon Ball": "A", "Geladeira Consul 300L": "P" }],
  ["geladeira", [...geladeiras, ["Toalha de Geladeira em PVC Rendada", 9]], { "Toalha de Geladeira em PVC Rendada": "A" }],
  ["celular", [...celulares, ["LG B220 Celular Simples Para Idosos 2G", 120]], { "LG B220 Celular Simples Para Idosos 2G": "P" }],
  ["celular", [...celulares, ["B220 CELULAR Simples Para Idosos Ou Rural 2G", 100]], { "B220 CELULAR Simples Para Idosos Ou Rural 2G": "P" }],
  ["prato microondas", [["Prato Para Microondas 27 cm Giratório", 44], ["Microondas Electrolux 20L com prato giratório", 600]],
    { "Prato Para Microondas 27 cm Giratório": "P", "Microondas Electrolux 20L com prato giratório": "N" }],
  ["reparo capacete", [["Kit Reparo Capacete San Marino", 17], ["Capacete Norisk Flow com kit reparo", 800]], { "Kit Reparo Capacete San Marino": "P", "Capacete Norisk Flow com kit reparo": "N" }],
  ["cabo flat monitor", [["Cabo Flat Monitor LG W2043S", 70], ["Monitor LG 24 Polegadas cabo flat", 900]], { "Cabo Flat Monitor LG W2043S": "P" }],
  ["air fryer", [["Fritadeira Elétrica Inteligente com Tela Sensível ao Toque Air Fryer", 188], ["Air Fryer Mondial 4L", 400]],
    { "Fritadeira Elétrica Inteligente com Tela Sensível ao Toque Air Fryer": "N" }],
  // Nível 2 com preço muito abaixo dos outros (17/10/2026): peça ou preço errado da loja
  ["tv 55 polegadas", [["Smart TV 55 Polegadas LG 4K", 3200], ["Smart TV TCL 55 Polegadas QLED", 2900], ["Smart TV 55 Polegadas Samsung", 3800],
    ["Smart TV 55 Polegadas Philips", 3100], ["Smart TV 55 Polegadas AOC", 2700], ["TV 55 Polegadas Capa Elástica Protetora", 33]],
    { "TV 55 Polegadas Capa Elástica Protetora": "A", "Smart TV 55 Polegadas AOC": "P" }],
  ["cadeira gamer", [["Cadeira Gamer PCYES Mad Racer", 950], ["Cadeira Gamer DT3 Elise", 1200], ["Cadeira Gamer ThunderX3", 900],
    ["Cadeira Gamer Husky", 700], ["Cadeira Gamer Kuromi Rosa", 600], ["Cadeira Gamer PCYES Prime Red", 1]], { "Cadeira Gamer PCYES Prime Red": "A" }],
  ["celular", [...celulares, ["Celular Usado Nokia 110 4G Dual Chip", 89]], { "Celular Usado Nokia 110 4G Dual Chip": "P" }],
];
for (const [q, itens, esperado] of CASOS_PRECO) {
  const saida = separarAcessorios(itens.map(([titulo, preco], i) => ({ id: String(i), titulo, preco })), q);
  for (const [titulo, tipo] of Object.entries(esperado)) {
    total++;
    const o = saida.find((x) => x.titulo === titulo);
    const obtido = o.acessorio ? "A" : o.principal ? "P" : "N";
    if (obtido !== tipo) { falhas++; console.log(`✗ preço/alvo "${q}": "${titulo}" deu ${obtido}, esperado ${tipo}`); }
  }
}

// "máquina de lavar" é a de roupa; a de sapatos/louças só vem na frente quando a busca pede (pedido do Giovanni)
for (const [q, titulos, primeiro, naoBate] of [
  ["maquina de lavar", ["Máquina de lavar sapatos doméstica de parede", "Máquina de Lavar Consul 15Kg"], "Máquina de Lavar Consul 15Kg", "Máquina de lavar sapatos doméstica de parede"],
  ["máquina de lavar sapato", ["Máquina de Lavar Consul 15Kg", "Máquina de lavar sapatos doméstica de parede"], "Máquina de lavar sapatos doméstica de parede", null],
  ["maquina de lavar", ["Máquina de Lavar Louças Brastemp 8 Serviços", "Lavadora Electrolux 12kg"], "Lavadora Electrolux 12kg", "Máquina de Lavar Louças Brastemp 8 Serviços"],
  ["maquina de lavar louça", ["Máquina de Lavar Consul 15Kg", "Máquina de Lavar Louças Brastemp 8 Serviços"], "Máquina de Lavar Louças Brastemp 8 Serviços", null],
]) {
  total++;
  const saida = separarAcessorios(titulos.map((titulo, i) => ({ id: String(i), titulo, preco: 1000 })), q);
  const outro = naoBate && saida.find((o) => o.titulo === naoBate);
  if (saida[0].titulo !== primeiro || outro?.bate || outro?.principal) {
    falhas++; console.log(`✗ outro produto "${q}": ${saida.map((o) => `${o.titulo}${o.bate ? " (bate)" : ""}`).join(" | ")}`);
  }
}

// Versões de nicho vêm depois das comuns, a não ser que a busca peça: [busca, títulos, o que tem que vir primeiro]
const ORDEM = [
  ["geladeira", ["Geladeira Portátil 40L Camping Veicular", "Geladeira Frost Free Consul 340L"], "Geladeira Frost Free Consul 340L"],
  ["celular", ["Celular Nokia 150 4G Para Idoso", "Celular Samsung Galaxy A06"], "Celular Samsung Galaxy A06"],
  ["geladeira", ["Mini Geladeira Mini Brands Com 2 Bolas Surpresa Colecionável", "Geladeira Brastemp Duplex 375L"], "Geladeira Brastemp Duplex 375L"],
  ["tv", ["TV Stick Android 4K", "TV Samsung 50 Polegadas 4K"], "TV Samsung 50 Polegadas 4K"],
  ["geladeira portatil", ["Geladeira Frost Free Consul 340L", "Geladeira Portátil 40L Camping"], "Geladeira Portátil 40L Camping"],
  ["mini geladeira", ["Mini Geladeira Frigobar 45L", "Geladeira Mini Bar Consul"], "Mini Geladeira Frigobar 45L"],
];
for (const [q, titulos, primeiro] of ORDEM) {
  total++;
  const saida = separarAcessorios(titulos.map((titulo, i) => ({ id: String(i), titulo, preco: 1000 })), q);
  if (saida[0].titulo !== primeiro) { falhas++; console.log(`✗ ordem "${q}": veio "${saida[0].titulo}" antes de "${primeiro}"`); }
}

// Categoria pelo título (print de 17/10/2026: vara de pesca caía em Óculos)
const CATEGORIAS_ESPERADAS = [
  ["Vara de Pesca Telescópica Carbono 2,1m", "Esporte e fitness"],
  ["Molinete de Pesca 5000 Rolamentos", "Esporte e fitness"],
  ["Óculos de Sol Polarizado para Pesca", "Óculos"],
  // Eletrodomésticos (17/10/2026)
  ["Geladeira Electrolux Frost Free 432L", "Eletrodomésticos"], ["Fogão Itatiaia 4 Bocas", "Eletrodomésticos"],
  ["Micro-ondas Midea 20L", "Eletrodomésticos"], ["Máquina de Lavar Consul 15kg", "Eletrodomésticos"],
  ["Ar Condicionado Split 12000 BTUs", "Eletrodomésticos"], ["Smart TV 55 Polegadas LG", "Eletrodomésticos"],
  ["Secadora de Roupas Electrolux 11kg", "Eletrodomésticos"], ["Secador de Cabelo Taiff", "Cabelo"],
  ["Lavadora de Alta Pressão Wap", "Ferramentas"], ["Ar condicionado automotivo 12v", "Automotivo"],
  ["Air Fryer / Forno Elétrico 3 em 1", "Eletroportáteis"],
];
for (const [titulo, esperada] of CATEGORIAS_ESPERADAS) {
  total++;
  const obtida = categoriaDoProduto(titulo)?.nome;
  if (obtida !== esperada) { falhas++; console.log(`✗ categoria de "${titulo}": ${obtida || "nenhuma"} (esperado ${esperada})`); }
}

// Filtro da AliExpress (busca solta): fica = passa no filtro; sai = tem que ser tirado
const FILTRO_ALIEXPRESS = {
  "batedeira": {
    fica: ["Batedeira Planetária Mondial 700W", "Gancho Espiral para Batedeiras KitchenAid", "Batedeiras Elétricas Portáteis"],
    sai: ["Capacitor Automotivo Farah 16V100F: Retificador Eletrônico", "Supernew para dewalt portátil jump start cabo carro auxiliar"],
  },
  "air fryer": { fica: ["Airfryer Philco 5,5L", "Fritadeira Air Fryer Mondial", "Fritadeira a Ar Dupla Ninja Mais Vendida para Casa"], sai: ["Ventilador de Ar Portátil USB"] },
  "power bank": { fica: ["Bateria Portátil Magnética Xiaomi 10000mAh", "Carregador Portátil 20000mAh"], sai: ["Lanterna LED recarregável com 5 modos"] },
  "smartwatch": { fica: ["Smart Watch Ultra 9 Pro Max", "Relógio Smartwatch D20"], sai: ["Pulseira de Silicone 22mm"] },
};
for (const [q, { fica, sai }] of Object.entries(FILTRO_ALIEXPRESS)) {
  const cita = citaAlgumaPalavra(q);
  for (const t of fica) { total++; if (!cita(t)) { falhas++; console.log(`✗ filtro AliExpress "${q}": tirou "${t}"`); } }
  for (const t of sai) { total++; if (cita(t)) { falhas++; console.log(`✗ filtro AliExpress "${q}": deixou "${t}"`); } }
}
// Correção de digitação (17/10/2026, print "maquina de lavar eletrolux"): [digitado, q buscado, "Você quis dizer"]
const CORRECOES = [
  ["maquina de lavar eletrolux", "máquina de lavar electrolux", null],
  // Acentos (17/10/2026): sem acento as lojas trazem resultados piores
  ["fogao", "fogão", null], ["Colchao casal", "colchão casal", null], ["tenis nike", "tênis nike", null], ["Fogão", "Fogão", null],
  ["aspirador de po", "aspirador de pó", null], ["media", "media", null],
  ["samsumg galaxy", "samsung galaxy", null],
  ["fone bluetoth", "fone bluetooth", null],
  ["electrolox", "electrolox", "electrolux"],
  // Palavras de verdade perto de marcas não mudam
  ["natural", "natural", null], ["nivel a laser", "nível a laser", null], ["cross", "cross", null],
  ["invictus", "invictus", null], ["conversor hdmi", "conversor hdmi", null], ["stranger things", "stranger things", null],
];
for (const [digitado, q, sugestao] of CORRECOES) {
  total++;
  const r = corrigirBusca(digitado);
  if (r.q !== q || r.sugestao !== sugestao) { falhas++; console.log(`✗ correção "${digitado}": ${JSON.stringify(r)}`); }
}
// Busca de uma palavra que nas lojas só traz acessório: pesquisa outro termo (o site mostra o digitado)
for (const [q, esperado] of [["tv", "smart tv"], ["Televisão", "smart tv"], ["impressora", "impressora multifuncional"],
  ["tv box", "tv box"], ["impressora térmica", "impressora térmica"]]) {
  total++;
  if (termoNasLojas(q) !== esperado) { falhas++; console.log(`✗ termo nas lojas "${q}": ${termoNasLojas(q)} (esperado ${esperado})`); }
}
console.log(falhas ? `\n${falhas} problema(s) em ${total} títulos` : `\n✓ Tudo certo (${Object.keys(CASOS).length} buscas, ${total} títulos)`);
process.exitCode = falhas ? 1 : 0;
