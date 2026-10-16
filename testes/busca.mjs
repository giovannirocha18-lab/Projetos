// Teste da busca: termos que o povo mais procura + casos que o Giovanni já mandou em prints.
// Rodar antes de publicar qualquer mudança na busca:   node testes/busca.mjs
// Cada caso: busca -> títulos (no estilo da Shopee/AliExpress) e o que se espera de cada um:
//   E = é o produto buscado (tem que "bater" e não ser acessório)
//   A = acessório ou peça (fica escondido)
//   N = não é o produto (não pode "bater"; pode aparecer no fim da lista)
// Além disso, todo E tem que vir antes de todo N/A na ordem de "Mais relevantes".
// Fontes dos termos (pesquisa de 16/10/2026): MELI Trends 2025 (Mercado Livre), "Os Mais Desejados do Ano"
// 2025 (Google), balanço 2025 e Mapa Shopee 2026 (Shopee), Black Friday 2025 (Google).
import { separarAcessorios } from "../lib/relevancia.js";

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
    E: ["Fritadeira Elétrica Air Fryer Mondial 4L", "Airfryer Philco 5,5L Antiaderente", "Fritadeira Air Fryer Britânia BFR38 com Grelha"],
    A: ["Forma de Papel Descartável para Air Fryer 50un", "Tapete Silicone Air Fryer Redondo", "Crisping Plate for Ninja Air Fryer", "Espumagic Limpador para Air Fryer", "Air Fryer Liners Paper 100pcs"],
    N: ["Airfryer de Brinquedo Infantil Cozinha", "Jaqueta Alpinestars Viper V3 Air Preto Vermelho", "Capacete ASX City Air Square", "Compressor Smart Air 1,5Hp 220V Pressure"],
  },
  "capa iphone": {
    E: ["Capa para iPhone 15 Pro Silicone", "Kit 2 Capas para iPhone 13 Transparente", "Capinha iPhone 14 Anti Impacto"],
  },
  "fone celular": { E: ["Fone de Ouvido para Celular P2 com Microfone"] },
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
  "ps5": { E: ["Console PlayStation 5 Slim 1TB", "Sony PS5 Pro Digital"], A: ["Controle DualSense para PS5", "Capa Skin Adesivo PS5"] },
  "notebook": { E: ["Notebook Lenovo IdeaPad 1 Ryzen 5 8GB", "Notebook Samsung Galaxy Book4 i5"], A: ["Carregador Fonte para Notebook Dell 65W", "Mochila para Notebook 15.6 Impermeável", "Suporte para Notebook Ajustável Alumínio"] },
  "smartwatch": { E: ["Smartwatch Xiaomi Redmi Watch 5 Active", "Relógio Smart Watch D20 Bluetooth"], A: ["Pulseira Silicone para Smartwatch 20mm"] },
  "smartphone": { E: ["Celular Motorola Moto G35 5G 128GB", "Smartphone Samsung Galaxy A16"], A: ["Suporte Celular Carro Magnético"] },
  "playstation 5": { E: ["Console Sony PS5 Slim Digital", "PlayStation 5 Pro 2TB"] },
  "televisao 50": { E: ["Smart TV 50 Polegadas Philco 4K", "Televisão 50\" Samsung Crystal UHD"] },
  "stanley": { E: ["Copo Térmico Stanley 473ml Quencher", "Garrafa Stanley Classic 1L"] },
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
console.log(falhas ? `\n${falhas} problema(s) em ${total} títulos` : `\n✓ Tudo certo (${Object.keys(CASOS).length} buscas, ${total} títulos)`);
process.exitCode = falhas ? 1 : 0;
