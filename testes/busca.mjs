// Teste da busca: termos que o povo mais procura + casos que o Giovanni já mandou em prints.
// Rodar antes de publicar qualquer mudança na busca:   node testes/busca.mjs
// Cada caso: busca -> títulos (no estilo da Shopee/AliExpress) e o que se espera de cada um:
//   E = é o produto buscado (tem que "bater" e não ser acessório)
//   A = acessório ou peça (fica escondido)
//   N = não é o produto (não pode "bater"; pode aparecer no fim da lista)
// Além disso, todo E tem que vir antes de todo N/A na ordem de "Mais relevantes".
// Fontes dos termos (pesquisa de 16/10/2026): MELI Trends 2025 (Mercado Livre), "Os Mais Desejados do Ano"
// 2025 (Google), balanço 2025 e Mapa Shopee 2026 (Shopee), Black Friday 2025 (Google).
import { separarAcessorios, produtoBuscado, temTodasAsPalavras, citaAlgumaPalavra } from "../lib/relevancia.js";
import { tituloDaBusca } from "../lib/fontes/aliexpress.js";
import { categoriaDoProduto, categoriaPorNome, marcarSecoes, montarVitrine } from "../lib/categorias.js";
import { corrigirBusca, termoNasLojas, buscaNasLojas } from "../lib/vocabulario.js";
import { semProdutoAVenda } from "../lib/buscas.js";

const CASOS = {
  // 11/11/2026 (print do Giovanni, "computador" na loja Mercado Livre): balança computadora no "Mais barato"
  "computador": {
    E: ["Computador Completo Intel Core i5 4570 (4ª Geração), 16GB, SSD 256GB, Monitor 20", "Computador Desktop Dell Optiplex i7 16GB SSD 480GB",
      "Computadores Gamer Completo Ryzen 5 16GB SSD 512GB"],
    N: ["Balança Computadora Urano Us Pop-s Serial DB9 Peso Máximo 30kg", "Balança Eletrônica Computadora 40kg Bivolt",
      "Máquina de Bordar Computadorizada Brother PE910L"],
  },
  // 10/11/2026 (print do Giovanni, "moto eletrica" pelo Em alta no ML): motosserra e motor não são moto
  "moto eletrica": {
    E: ["Moto Elétrica Infantil Mini 3 Rodas Frente/Ré Maxi Toys", "Mini Moto Elétrica Infantil 6V Preto Triciclo 3 Rodas", "Moto Cross Elétrica 6V Rosa"],
    N: ["Motosserra Elétrica Brushless 16 Polegadas 2 Bateria 3600w", "Mini Motosserra Elétrica Portátil 6 Pol. Duas Baterias 1800w",
      "Motor Elétrico Trifásico 1cv 4 Polos", "Moto Serra Elétrica 12 Polegadas 2 Baterias 48v Portátil"],
  },
  // 05/11/2026 (print do Giovanni, "air fryer 5 litros"): o Mercado Livre escreve "de 5L"; 4L e 25L não são 5 litros
  "air fryer 5 litros": {
    E: ["Air fryer Mondial Air Fryer AFN-50-BI de 5L preto 127V", "Fritadeira Elétrica Air Fryer 5 Litros Sem Óleo", "Air Fryer Britânia 5 L Preta"],
    // 10/11/2026 (revisão, visto no site): 6,5L, 9,5 Litros, 3.5L e 5,5 Litros passavam como 5 litros
    N: ["Air fryer Bak Air Fryer BK-ARFYM110 de 4L preto", "Air fryer Mondial Air Fryer AFO-25L-BI de 25L preto 127V",
      "Air Fryer Philco 6,5L Visor Glass e Redstone 1700W PAF65A", "Air Fryer Britânia 9,5 Litros Painel Digital 1800W BAF95A 127v",
      "Air fryer Xiaomi Mi Smart Air Fryer de 3.5L branco", "Fritadeira Air Fryer Mallory Digital Premium 5,5 Litros 1500W Preto"],
  },
  // 10/11/2026 (revisão): "12.000 BTUs" não batia com "12000 btus"
  "ar condicionado 12000 btus": {
    E: ["Ar Condicionado Split 12.000 BTUs Inverter LG Dual Voice", "Ar Condicionado 12000 Btus Split Hi Wall Inverter TCL Frio Elite GV 220V"],
    N: ["Ar Condicionado Split 9.000 BTUs Inverter Midea Frio"],
  },
  // 10/11/2026 (visto no site): estantes da TV vinham no meio das TVs
  "tv 55": {
    E: ["Smart TV 55\" LCD LED LG 55UT8050PSA - 4K UHD, ThinQ AI", "Smart TV 55 Polegadas 4K QLED Samsung"],
    A: ["Estante TV 55\" com Espelho Denver Multimoveis V3148", "Rack TV 55 Polegadas Madeira Maciça 4 Gavetas"],
  },
  // 10/11/2026 (visto no site): jogos para baixar e cartão presente marcados como o console
  "xbox": {
    E: ["Xbox Series S 512GB Branco Console Microsoft", "Console Xbox Series X 1TB Preto"],
    A: ["Série Xbox Xbox Xbox Série X|S Exclusivo Jogo de Próxima Geração Minecraft Versão de Download Digital",
      "Xbox Game Pass Ultimate assinatura 1 mês (Digital)", "Xbox Cartão Presente R$ 100 Gift card (Digital)"],
  },
  "samsung galaxy s24": {
    E: ["Samsung Galaxy S24 Galaxy Ai 256GB Preto 8GB RAM", "Celular Samsung Galaxy S24 Fe 128gb preto", "Smartphone Samsung Galaxy S24 256GB 5G"],
    A: ["Pelicula para Samsung Galaxy S24 Ultra - Privacidade Hydrogel - Gshield"],
  },
  // 04/11/2026 (print do Giovanni, "pc gamer" na AliExpress): ventoinha, mouse, teclas e mouse pad apareciam como o produto
  "pc gamer": {
    E: ["PC Gamer Mini TA NK 03 M1A com Intel Core I9 12900H, RTX 3080, 16G DDR4", "Pc Gamer Completo Ryzen 7 5700G, Memoria Ram 16GB, SSD 1TB",
      "Computador intel I7-4700S pc gamer completo desktop 8/16gb 24 Polegadas", "PC Gamer Completo Intel i5 16GB RAM SSD 480GB Monitor Teclado e Mouse",
      "PC Gamer Neologic Ryzen 3 3200G 8GB (RX 580 8GB) 1TB HD 1TB"],
    A: ["Thermalright TL-C14CW/14C-S 14cm ventilador de refrigeração 5v 3pin argb pc gamer",
      "ID-COOLING XF-120-K simplicidade eficiência pc gamer computador caso ventilador",
      "Atk z1v2 mouse para jogos sem fio final duplo 8k paw3950ultra eletrônico pc gamer",
      "Teclas RGB de Resina Artesanal Mountain And Sea para Teclado Mecânico pc gamer",
      "90x40cm mouse pad gamer grande computador pc gamer mesa",
      "Led mouse pad dragon ball backlight acessórios de jogos pc computador teclado gamer rgb tapete de mesa alfombrilla xxl hd anime mousepad",
      "Ruix invólucro ventiladores RX-134 pc caso ventilador 120mm gabinete ventiladores fixo rgb jogos 12v molex computador gamer"],
  },
  // 21/10/2026 (Karsten): "2 Peças" é quantidade; "boné" achava "Boneco Funko Pop"
  "fronha": {
    E: ["Fronha 2 Peças 100% Algodão Tesso Bege", "Fronha Avulsa 200 Fios Ivy Branco"],
  },
  "boné": {
    E: ["Boné Trucker Aba Curva Preto", "Boné KaBuM! Esports Aba Reta"],
    N: ["Boneco Funko Pop! Pokemon - Squirtle"],
  },
  // 27/10/2026 (auditoria da busca): "kit" fazia a busca virar "de acessório" e nada era escondido (maquiagem de brinquedo)
  "kit maquiagem": {
    E: ["Kit Maquiagem Completo Pincéis e Sombra", "Kit de Maquiagem Profissional Paleta de Sombras"],
    A: ["Kits de Maquiagem de Brinquedo, Kits de Maquiagem de Faz de Conta para Presente"],
  },
  "kit skincare": { E: ["Kit 6 Kit Skin Care Baba Skin Com 24 Itens Rhenuks Cosméticos", "Kit Skincare Rosa Mosqueta Sabonete Facial"] },
  "kit churrasco": { E: ["Kit Churrasco Brinox Precision 3 Peças Faca Garfo e Chaira"] },
  // 27/10/2026 (auditoria da busca, execução #54)
  "stanley": { E: ["Copo Térmico Stanley Quencher 1,18L"], A: ["Chaveiro de Pelúcia Anime Dr. Stone: Senku, Gen, Ryusui, Xeno, Stanley, Chibi"] },
  "chaveiro": { E: ["Chaveiro de Pelúcia Labubu", "Chaveiro Personalizado Couro"] },
  "guarda roupa": {
    E: ["Guarda-Roupa Casal 6 Portas Cabideiro Araplac", "Guarda-Roupa Solteiro 3 Portas com Cabide"],
    A: ["Guarda-roupa guarda-roupa cabide embutido cabide de secagem Pull-out Rack Slide ferroviário"],
  },
  "panela de pressão elétrica": {
    E: ["Panela de Pressão Elétrica Mondial 5L com anel de vedação extra"],
    A: ["Midea panela de pressão elétrica anel de borracha anel de vedação panela elétrica de alta pressão"],
  },
  // 03/11/2026 (auditoria): palavra de 3 letras é começo de outra ("dry" em "Drykofita", "fit" em "Fita")
  "camiseta dry fit": {
    E: ["Camiseta Dry Fit Masculina Academia", "Kit 3 Camisetas Dry Fit Esporte", "Camiseta Dryfit Feminina Corrida"],
    N: ["Drykofita Fita Aluminizada Impermeabilizante Dryko 10cmx10m", "Vedatudo Fita Aluminizada Impermeabilizante Dryko 5cmx10m"],
  },
  // ---- Prints do Giovanni ----
  // 17/10/2026: suporte, porta-controle e adesivo apareciam no meio; joystick e gamepad são o próprio controle
  "controle para video game": {
    E: ["Controle De Xbox 360 Com Fio Para Video Game e PC", "Joystick Para Video Game Ps3 USB Com Fio", "Gamepad Sem Fio Para Video Game e PC"],
    A: ["Porta Controle Polvo Gamer Decorativo Organizador para Controle de Videogame PS5", "Suporte para Controle de Video Game Universal",
      "Grip Extensor Gamer Botão Analógico Protetor Controle Para Xbox Ps4 Ps5", "Máscara Oni - Suporte para Controle de PS5 / suporte mascara para game"],
  },
  // 19/10/2026 (ideia do Giovanni): marca na frente. "mondial air fryer" não achava nenhum produto principal
  "mondial air fryer": {
    E: ["Air Fryer Mondial 4L AFN-40 Preta", "Fritadeira Air Fryer Mondial Family 5L"],
    A: ["Cesto Air Fryer Mondial AFN-40 Original"],
  },
  "britania liquidificador": {
    E: ["Liquidificador Britânia Diamante 900W 5 Velocidades"],
    A: ["Copo Liquidificador Britânia Diamante 800 900w Preto 1,5L"],
  },
  "joystick": {
    E: ["Controle Joystick Com Fio USB Para PC Notebook", "Joystick Sem Fio Para PS4 Bluetooth"],
    A: ["Suporte para Joystick PS5 Base de Mesa", "Capa de Silicone para Controle PS4"],
  },
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
    A: ["Controle DualSense para PS5", "Capa Skin Adesivo PS5", "2026 Novo produto PS5 SLIM Elite Version pro Handle Silicone Capa protetora", "2026 Novo produto Heroes PS5 pro Adesivo de corpo", "Skin PS5 Fat Playstation 5 Adesivo - Personalizada", "Decoração PlayStation PS5 | Enfeite de Mesa",
      "SUPORTEDECONTROLE-PS5-3D-PLA-LG3DSTORE"], // 27/10/2026: palavras grudadas pelo vendedor
  },
  "jogo de panelas": { E: ["Jogo Panelas Tramontina Antiaderente 5 peças", "Jogo de Panelas Cerâmica 10 Peças Kit Cozinha"] },
  "tapete yoga": { E: ["Tapete de Yoga Antiderrapante 6mm"] },
  "ar condicionado": {
    E: ["Ar Condicionado Split 12000 Btus Inverter", "Ar-Condicionado Portátil 9000 BTUs"],
    A: ["Controle Remoto para Ar Condicionado Universal", "Adequado para Volvo XC90 painel de saída de ar condicionado",
      // Print de 17/10/2026 (ordem "Menor preço")
      "***Comando Ar C/ Moldura Central Ar Condicionado Ford Fiesta 2009/14", "Comando Ar Condicionado com ar Clio 2000 2001 a 2012",
      "BLOWER AR CONDICIONADO SANDERO 1.0 2013 ATE 2017", "Evaporador de Ar Condicionado Trator Série 5000"],
  },

  // ---- Mercado Livre: mais buscados 2025 ----
  "celular": { E: ["Celular Samsung Galaxy A06 128GB", "Smartphone Xiaomi Redmi 14C 256GB"], A: ["Capinha Celular Samsung A06", "Película para Celular 3D"] },
  "celular samsung": { E: ["Smartphone Samsung Galaxy A06 128GB 4GB RAM", "Celular Samsung Galaxy A16 5G"] },
  "tenis feminino": { E: ["Tênis Feminino Casual Branco Plataforma", "Tenis Feminino Esportivo Academia"] },
  "ventilador": { E: ["Ventilador de Mesa Mondial 40cm Turbo", "Ventilador Coluna Arno 6 Pás"], A: ["Hélice Ventilador Arno 40cm Reposição"] },
  "iphone 15": { E: ["Apple iPhone 15 128GB Preto", "iPhone 15 Pro Max 256GB Vitrine"], A: ["Capa para iPhone 15 Magsafe", "Película iPhone 15 Vidro 3D"] },
  "geladeira": { E: ["Geladeira Frost Free Brastemp 375L", "Refrigerador Geladeira Consul 300 Litros"], A: ["Borracha Gaxeta para Geladeira Consul"] },
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
  // 02/11/2026 (Cama In Box): "Colchão de Molas" é o colchão (molas = do que é feito), não peça; o robô tira o
  // "Cama inBox" do título, senão o puff e o sofá dela apareciam em "cama"
  "colchão": {
    E: ["Colchão de Molas Ensacadas Select Euro Soft - Casal", "Colchão de Molas"],
    A: ["Mola de Colchão Ensacada"],
  },
  "cama": {
    E: ["Cama Box Colchão Select + Box de Molas Ensacadas D33 com Pillow TOP - Casal"],
    N: ["Puff Aluna Retangular com Pés em Madeira Maciça Tecido Suede - Bege"],
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
  // 05/11/2026 (print do Giovanni): nome de produto colado; nenhuma loja escreve "bidirecional" e o site dizia "não está à venda"
  ["Hub de Carregamento Bidirecional para DJI Mini", [["Hub De Carregamento Dji Mini 5 Pro", 700], ["Hub de carregamento DJI (Mini 2/2 SE/SE) BR - DJI1034", 400],
    ["Hub de Carregamento Startrc para 4 Baterias Drone DJI Mini 3 Pro", 250], ["Hub De Carregamento Dji Avata 360", 500],
    ["Drone DJI Neo com 3 baterias e o hub de carregamento! Sem controle Cor: cinza", 2000], ["Hub Carregamento Rápido 10a - 6 Usbs P/ Celulares E Gadgets", 90]],
    { "Hub De Carregamento Dji Mini 5 Pro": "P", "Hub de carregamento DJI (Mini 2/2 SE/SE) BR - DJI1034": "P", "Hub De Carregamento Dji Avata 360": "N",
      "Hub Carregamento Rápido 10a - 6 Usbs P/ Celulares E Gadgets": "N" }],
  // Mesma busca: "para DJI" é compatibilidade, não a marca desejada; os hubs de outras marcas feitos para DJI Mini são o produto
  ["Hub de Carregamento Bidirecional para DJI Mini", [["Hub de carregamento bidirecional para DJI Mini 4 Pro/mini 3 Series", 400],
    ["Hub De Carregamento Bidirecional Para DJI Mini 2 SE/4K Bateria Carregador", 150], ["Hub De Carregamento Dji Mini 5 Pro", 386]],
    { "Hub de carregamento bidirecional para DJI Mini 4 Pro/mini 3 Series": "P", "Hub De Carregamento Bidirecional Para DJI Mini 2 SE/4K Bateria Carregador": "P" }],
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
  ["mondial air fryer", [["Mondial Air Fryer AFN-40 4L", 350], ["Air Fryer Mondial Family 5L", 420]], { "Mondial Air Fryer AFN-40 4L": "P", "Air Fryer Mondial Family 5L": "P" }],
  ["philco ventilador", [["Ventilador Philco PVT40 40cm", 180]], { "Ventilador Philco PVT40 40cm": "P" }],
  // 27/10/2026: as mini lavadoras baixavam o preço típico e a "turbina para meias" de R$ 48 passava; a mini continua
  ["maquina de lavar", [["Máquina de Lavar Consul 15Kg", 1900], ["Máquina de Lavar Electrolux 13Kg", 2100], ["Máquina de Lavar Brastemp 12Kg", 1800],
    ["Máquina de Lavar Midea 11Kg", 1700], ["Máquina de Lavar Philco 12Kg", 1600],
    ...Array.from({ length: 8 }, (_, i) => [`Mini Máquina de Lavar Portátil Dobrável ${i + 8}L`, 100 + i]),
    ["Máquina de Lavar com Turbina Rotativa e Bolhas para Meias e Roupas Íntimas", 48]],
    { "Máquina de Lavar com Turbina Rotativa e Bolhas para Meias e Roupas Íntimas": "A", "Mini Máquina de Lavar Portátil Dobrável 8L": "P" }],
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

// 12/11/2026 (print do Giovanni, "xiaomi 18 pro", sugerido pelo próprio site): o celular não está à venda, só capas e películas.
// Liquidificador Xiaomi, patinete "6 Pro" e tinta "Super Pro 18 Litros" não podem aparecer como o produto
{
  const capas = ["Capa para Xiaomi 18 Pro/18 Pro Max, nova capa de silicone com proteção magnética", "Película protetora para Xiaomi 18 Pro/18 Pro Max/17T",
    "Capa Rígida Antichoque de PC para Xiaomi 18 Pro Max 18 Pro 18 17 Pro Max", "4 unidades de vidro temperado HD para Xiaomi 18 Pro Max, Xiaomi 18 Pro",
    "Capa de Kevlar com Textura de Couro para Xiaomi 18 Pro Max 18 Pro", "Capa magnética militar à prova de choque para Xiaomi 18 Pro Max 18 Pro"];
  const outros = ["Liquidificador Xiaomi Blender Pro branco", "Patinete Xiaomi 6 Pro", "Xiaomi TV A Pro 65 2026",
    "Tinta Acrílica Eucatex Standard Super Pro Gelo Ártico 18 Litros", "Escapamento CRF 250F 18/25 Curva + Ponteira Belparts Pro Short"];
  const saida = separarAcessorios([...outros, ...capas].map((titulo, i) => ({ id: String(i), titulo, preco: 100 + i })), "xiaomi 18 pro");
  const erradas = saida.filter((o) => outros.includes(o.titulo) && !(o.acessorio && o.parecido));
  const ordem = saida.findIndex((o) => outros.includes(o.titulo)) > saida.findLastIndex((o) => capas.includes(o.titulo));
  if (erradas.length || !ordem || saida.some((o) => !o.acessorio)) { falhas++; console.log(`✗ "xiaomi 18 pro": sem o celular, o resto é "parecido" e vem depois das capas (${erradas.map((o) => o.titulo).join(" | ")}; ordem ${ordem})`); }
  // Com o celular à venda nada muda: ele é o produto
  const comCelular = separarAcessorios([{ id: "c", titulo: "Smartphone Xiaomi 18 Pro 512GB 16GB RAM", preco: 6000 }, ...[...outros, ...capas].map((titulo, i) => ({ id: String(i), titulo, preco: 100 + i }))], "xiaomi 18 pro");
  // E o termo sai das sugestões de tendência: a busca sem o celular conta como "sem produto à venda"; com ele, não
  if (!semProdutoAVenda(saida) || semProdutoAVenda(comCelular) || semProdutoAVenda([])) { falhas++; console.log("✗ semProdutoAVenda: só capas = sem produto; com o celular (ou lista vazia) = não anota"); }
  if (comCelular[0].id !== "c" || comCelular[0].acessorio) { falhas++; console.log("✗ \"xiaomi 18 pro\" com o celular à venda: ele tem que ser o 1º produto"); }
}

// Busca de 2+ palavras: só os que têm todas ficam visíveis; os outros vão para "Ver também" (ideia do Giovanni, 19/10/2026)
{
  const fica = ["Babuche Masculina Forrada Pelúcia", "Sandália Babuche Nuvem Masculino e Feminino", "Babuche Masculino Adulto",
    "Babuche Masculino Leve", "Babuche Masculino EVA", "Babuche Masculino Preto", "Babuche Masculino Branco", "Babuche Masculino Azul",
    "Babuche Masculino Cinza", "Babuche Masculino Verde"];
  const sai = ["Babuche Unissex Plataforma", "Chinelo Slide Masculino Nuvem"];
  const saida = separarAcessorios([...fica, ...sai].map((titulo, i) => ({ id: String(i), titulo, preco: 50 })), "babuche masculino");
  for (const o of saida) {
    total++;
    if (fica.includes(o.titulo) === Boolean(o.acessorio)) { falhas++; console.log(`✗ todas as palavras: "${o.titulo}" ${o.acessorio ? "escondido" : "visível"}`); }
  }
  total++;
  const fones = separarAcessorios(Array.from({ length: 10 }, (_, i) => ({ id: String(i), titulo: `Fone Bluetooth Modelo ${i}`, preco: 80 }))
    .concat({ id: "x", titulo: "Fones de Ouvido Sem Fio Bluetooth 5.3", preco: 80 }), "fone bluetooth");
  if (fones.find((o) => o.id === "x").acessorio) { falhas++; console.log("✗ todas as palavras: plural \"Fones\" escondido"); }
}

// Busca com marca: produto de outra marca vai para "Ver também" (print "smart tv lg" com Samsung no filtro, 31/10/2026)
// [busca, título, fica?]
for (const [busca, titulo, fica] of [
  ["smart tv lg", "Smart TV LG 50 Polegadas 4K UHD ThinQ AI", true],
  ["smart tv lg", "Smart TV 43 Polegadas Samsung Crystal UHD", false],
  ["smart tv lg", "TV LCD LED Smart Android de 65 Polegadas 4K UHD para Samsung LG Sony TCL", false],
  ["air fryer mondial", "Air Fryer Philco Redstone PAF16A Preta com Timer 5,5L", false],
  ["air fryer mondial", "Fritadeira Air Fryer Mondial AFN-40 Preta", true],
  ["tenis nike", "Tênis de corrida para trilhos Nike Pegasus Trail 5", true],
  ["celular motorola", "Smartphone Edge 60 Pro 5G 512GB Câmera Sony LYTIA 700C 50MP Motorola", true],
  ["iphone 15", "Apple iPhone 15 128GB Preto", true],
  ["galaxy s24", "Samsung Galaxy S24 256GB", true],
  ["fone jbl", "Fones de Ouvido Bluetooth V5.3 Lenovo LP75 Originais", false],
]) {
  total++;
  const [o] = separarAcessorios([{ id: "1", titulo, preco: 1000 }], busca);
  if (fica === Boolean(o.outraMarca)) { falhas++; console.log(`✗ marca: "${busca}" -> "${titulo}" ${o.outraMarca ? "escondido" : "visível"}`); }
}

// Versões de nicho vêm depois das comuns, a não ser que a busca peça: [busca, títulos, o que tem que vir primeiro]
const ORDEM = [
  ["geladeira", ["Geladeira Portátil 40L Camping Veicular", "Geladeira Frost Free Consul 340L"], "Geladeira Frost Free Consul 340L"],
  ["celular", ["Celular Nokia 150 4G Para Idoso", "Celular Samsung Galaxy A06"], "Celular Samsung Galaxy A06"],
  // 21/10/2026 (print): celular de botão no topo da busca "celular"
  ["celular", ["Celular Caterpillar B30 Dual Chip 4G IP67 Celular Robusto", "Celular Xiaomi Redmi 15C 256GB"], "Celular Xiaomi Redmi 15C 256GB"],
  ["celular", ["Celular Nok'a 125 4G Dual Chip | Teclado Fácil", "Celular Samsung Galaxy A07 128GB"], "Celular Samsung Galaxy A07 128GB"],
  ["celular de botão", ["Celular Samsung Galaxy A07 128GB", "Celular Caterpillar B30 de Botão 4G"], "Celular Caterpillar B30 de Botão 4G"],
  ["geladeira", ["Mini Geladeira Mini Brands Com 2 Bolas Surpresa Colecionável", "Geladeira Brastemp Duplex 375L"], "Geladeira Brastemp Duplex 375L"],
  ["ar condicionado", ["Ar Condicionado Volkswagen Polo 2009 a 2014 Comando Controle do Ar Digital", "Ar Condicionado Split Philco 12000 BTUs"], "Ar Condicionado Split Philco 12000 BTUs"],
  ["ar condicionado", ["Ar Condicionado Oribreeze, Resfriador de Ar Portátil", "Ar Condicionado Split Vix 9000 BTUs"], "Ar Condicionado Split Vix 9000 BTUs"],
  // Busca de acessório: o próprio acessório antes do acessório dele (17/10/2026)
  ["controle ps5", ["Suporte Controle PS5 DualSense Base para Controle", "Controle Sem Fio DualSense PS5 Branco"], "Controle Sem Fio DualSense PS5 Branco"],
  ["controle ps5", ["Base controle PS5 PS4 Suporte para controle Gamer", "Controle PS5 DualSense Midnight Black"], "Controle PS5 DualSense Midnight Black"],
  ["capa iphone 13", ["Película 3D Capa iPhone 13 Kit", "Capa iPhone 13 Silicone Aveludada"], "Capa iPhone 13 Silicone Aveludada"],
  ["tv", ["TV Stick Android 4K", "TV Samsung 50 Polegadas 4K"], "TV Samsung 50 Polegadas 4K"],
  ["geladeira portatil", ["Geladeira Frost Free Consul 340L", "Geladeira Portátil 40L Camping"], "Geladeira Portátil 40L Camping"],
  ["mini geladeira", ["Mini Geladeira Frigobar 45L", "Geladeira Mini Bar Consul"], "Mini Geladeira Frigobar 45L"],
  // Alavanca de máquina e tecla de teclado não são joystick de videogame (19/10/2026)
  ["joystick", ["Controle de Joystick para Plataforma Elevatória Genie 78903GT", "Joystick Gamer Controle Sem Fio USB para Xbox 360 e PC"], "Joystick Gamer Controle Sem Fio USB para Xbox 360 e PC"],
  ["joystick", ["SJ02 Novo Joystick de Alavanca de Controle de Guindaste para Máquinas Pesadas", "Controle Joystick Gamer para PS4 Pc Bluetooth"], "Controle Joystick Gamer para PS4 Pc Bluetooth"],
  ["joystick", ["Joystick Keycap para Teclado Mecânico - Controle Analógico Gamer 3D", "Controle Joystick USB para PC Computador PS2 Gamepad"], "Controle Joystick USB para PC Computador PS2 Gamepad"],
  ["controle para video game", ["Joystick Industrial de Controle Remoto Hall", "Controle De Xbox 360 Com Fio Para Video Game e PC"], "Controle De Xbox 360 Com Fio Para Video Game e PC"],
  // Guarda-roupa de pano depois dos de madeira (auditoria, 27/10/2026)
  ["guarda roupa", ["Guarda-roupa simples pano guarda-roupa moda dos desenhos animados", "Guarda-Roupa Casal 6 Portas Araplac"], "Guarda-Roupa Casal 6 Portas Araplac"],
  // Protetor de para-brisa não é protetor solar de pele (17/10/2026)
  ["protetor solar", ["Protetor Solar para Para-brisa de Carro Estiloso", "Protetor Solar Facial FPS 50 Neutrogena"], "Protetor Solar Facial FPS 50 Neutrogena"],
  // 27/10/2026 (auditoria das buscas): geladeira de boneca e ventilador de lareira no topo
  ["geladeira", ["Geladeira Our Generation Perfectly Fresh", "Geladeira Brastemp Frost Free 375L"], "Geladeira Brastemp Frost Free 375L"],
  ["ventilador", ["Ventilador de Fogão Preto com 6 Lâminas, Movido a Calor, para Lareira a Lenha", "Ventilador Arno Xtreme Force Coluna 50cm"], "Ventilador Arno Xtreme Force Coluna 50cm"],
  ["protetor solar", ["Protetor Solar Personalizado para Carro com Qualquer Design", "Protetor Solar Corporal FPS 30 Sundown"], "Protetor Solar Corporal FPS 30 Sundown"],
];
for (const [q, titulos, primeiro] of ORDEM) {
  total++;
  const saida = separarAcessorios(titulos.map((titulo, i) => ({ id: String(i), titulo, preco: 1000 })), q);
  if (saida[0].titulo !== primeiro) { falhas++; console.log(`✗ ordem "${q}": veio "${saida[0].titulo}" antes de "${primeiro}"`); }
}

// Categoria pelo título (print de 17/10/2026: vara de pesca caía em Óculos)
const CATEGORIAS_ESPERADAS = [
  // 11/11/2026 (print do Giovanni: inversora de solda da Stanley na categoria Cozinha)
  ["Kit Inversora Solda 100A 220V KLISL-145 Stanley", "Ferramentas"], ["Esmerilhadeira Angular 4 1/2 850W Bosch", "Ferramentas"],
  ["Copo Térmico Stanley 473ml", "Cozinha"],
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
  // Ventilador ficava sem categoria (19/10/2026, "ventilador philco"); cooler de PC não é ventilador de casa
  ["Ventilador Philco 2 em 1 Maxx Force 150W PVT41A", "Eletrodomésticos"], ["Ventilador de Teto Philco Silencioso 145W", "Eletrodomésticos"],
  ["Climatizador de Ar Mondial 3 em 1", "Eletrodomésticos"],
  // Placa de vídeo caía em Eletrodomésticos ("Ventilador"), Decoração ("Quadro K3000"), Games ("Gamer") (print, 19/10/2026)
  ["Placa de vídeo Ventilador de refrigeração GPU NVIDIA GeForce RTX 2080", "Informática"], ["Placa de Vídeo Quadro K3000 GDDR5", "Informática"],
  ["Placa De Vídeo Gamer Rtx 3070 8GB", "Informática"], ["Processador AMD Ryzen 5 5600", "Informática"],
  // Babuche com estampa "Carros" caía em Automotivo (print do Giovanni, 19/10/2026)
  ["Babuche Masculino Infantil Carros Promoção Menino", "Calçados"], ["Pantufa Feminina Pelúcia", "Calçados"], ["Ventilador Automotivo 12v Duplo Carro", "Automotivo"],
  // Karsten (21/10/2026): toalha banhão/rosto/piso e fronha ficavam sem categoria, protetor de colchão ia para Móveis
  ["Toalha Banhão 100% Algodão Theo Branco", "Cama e banho"], ["Toalha de Rosto Provence Branco", "Cama e banho"],
  ["Kit 2 Toalhas de Piso Metrópole Avelã", "Cama e banho"], ["Fronha 2 Peças 200 Fios 100% Algodão Ayla", "Cama e banho"],
  ["Porta-travesseiro Avulso 200 Fios 100% Algodão Ivy Branco", "Cama e banho"], ["Protetor de Colchão Casal Impermeável Essence Branco", "Cama e banho"],
  ["Peseira Karsten 180 Fios Percal 100% Algodão Thom", "Cama e banho"], ["Colchão Ortobom Casal Molas", "Móveis"],
  ["Pano de Prato Felpudo Bistrô Bege", "Mesa posta"], ["Trilho de Mesa/Caminho de Mesa Karsten Veríssimo Granizo", "Mesa posta"],
  // Kabum (21/10/2026): "Caixa de Som Gamer" ia para Games, "Monitor … Mini LED" para Iluminação LED; boné caía em Óculos
  ["Caixa de Som Gamer Rise Mode Aura Sound S6, RGB", "Caixas de som"], ["Caixa de Som Portátil JBL Wind 3, para Bicicleta", "Caixas de som"],
  ["Monitor Gamer TCL Mini LED 25\", 300Hz", "Informática"], ["Fita LED 5m RGB", "Iluminação LED"], ["Projetor LED Full HD Husky", undefined],
  ["Top sustentação feminino top academia", "Moda fitness"], ["Top com bojo removível esportivo", "Moda fitness"],
  ["Boné Trucker Aba Curva", "Bonés e chapéus"], ["Chapéu Bucket Preto", "Bonés e chapéus"], ["Boneco Funko Pop! Pokemon - Squirtle", "Brinquedos"],
];
// 11/11/2026 (prints do Giovanni na categoria Cozinha): a vitrine buscava só a marca "stanley" e trazia inversora de solda
// da Stanley e livro de autor chamado Stanley
{
  const cozinha = categoriaPorNome("Cozinha");
  const lista = ["Livro Teologia Sistemática Pentecostal | Stanley M. Horton", "Kit Inversora Solda 100A 220V KLISL-145 Stanley",
    "Copo Térmico Stanley Quencher 1,18L", "Copo Stanley Original 473ml Com Tampa"].map((titulo, id) => ({ id, titulo, preco: 100, bate: true }));
  const ficaram = montarVitrine([lista], cozinha.vitrine, cozinha).map((o) => o.id).join();
  if (ficaram !== "2,3") { falhas++; console.log(`✗ vitrine da Cozinha: deviam ficar só os copos Stanley (ficaram ${ficaram})`); }
}
for (const [titulo, esperada] of CATEGORIAS_ESPERADAS) {
  total++;
  const obtida = categoriaDoProduto(titulo)?.nome;
  if (obtida !== esperada) { falhas++; console.log(`✗ categoria de "${titulo}": ${obtida || "nenhuma"} (esperado ${esperada})`); }
}

// Categoria da loja errada perde para o título quando o título é do que foi buscado (print "notebook gamer", 19/10/2026)
{
  total++;
  const [o] = marcarSecoes([{ titulo: "Deskpad Mousepad Gamer 80x30 Para Jogos Notebook", catMapa: "Calçados" }], null, categoriaDoProduto("notebook gamer"));
  if (o.secao !== "Informática") { falhas++; console.log(`✗ categoria da loja: mousepad ficou em ${o.secao}`); }
}

// Conferência das categorias: todo produto buscado fica na mesma categoria (print "pipoqueira eletrica" em Informática
// pelo "Mickey Mouse" e em Limpeza/Cozinha pela categoria da loja, 19/10/2026)
{
  const q = "pipoqueira eletrica";
  const titulos = ["Pipoqueira Elétrica Mallory Mickey Mouse 1200 W Sem Óleo", "Pipoqueira Elétrica Sem Óleo Ar Quente 1200w",
    "Pipoqueira Elétrica Amvox APC 027 1200W", "PIPOQUEIRA ELETRICA COM COPO MEDIDOR MALLORY TOY STORY"];
  const ofertas = separarAcessorios(titulos.map((titulo, i) => ({ titulo, preco: 150, ...(i === 1 && { catMapa: "Limpeza" }) })), q);
  for (const o of marcarSecoes(ofertas, null, categoriaDoProduto(q), produtoBuscado(q))) {
    total++;
    if (o.secao !== "Eletroportáteis") { falhas++; console.log(`✗ conferência: "${o.titulo}" ficou em ${o.secao || "Outros"}`); }
  }
  total++;
  if (categoriaDoProduto("Mouse Gamer RGB 7200 DPI")?.nome !== "Informática") { falhas++; console.log("✗ mouse gamer saiu de Informática"); }
}

// Produto buscado para pet/carro fica em Pets/Automotivo (print "perfume": Xô Chulé Pet Clean da Cobasi em Perfumes, 28/10/2026)
{
  const titulos = { "Perfume Spray Xô Chulé Pet Clean - 120 ml": "Pets", "Colônia Body Splash Forest Soul Pet Society - 60 ml": "Pets",
    "Perfume Automotivo Aromatizante Carro": "Automotivo", "Perfume Gato Preto Feminino 50ml": "Perfumes", "Perfume Ferrari Black Masculino": "Perfumes" };
  const lista = Object.keys(titulos);
  const q = "perfume";
  const pelaBusca = marcarSecoes(separarAcessorios(lista.map((titulo) => ({ titulo, preco: 100 })), q), null, categoriaDoProduto(q), produtoBuscado(q));
  const pelaCategoria = marcarSecoes(lista.map((titulo) => ({ titulo })), categoriaDoProduto("perfume"));
  for (const o of [...pelaBusca, ...pelaCategoria]) {
    total++;
    if (o.secao !== titulos[o.titulo]) { falhas++; console.log(`✗ outro uso: "${o.titulo}" ficou em ${o.secao || "Outros"}`); }
  }
}

// Pets é exclusiva (pedido do Giovanni, 28/10/2026): produto de bicho fica só em Pets, em qualquer busca ou categoria
{
  const casos = {
    "Shampoo Antipulgas Previn Coveli - 500 ml": "Pets", "Tapete Higiênico MyHug 80x60cm - 30 unidades": "Pets",
    "Suplemento Aminocão 300g para Cães com Vitaminas": "Pets", "Lenço Umedecido Cães e Gatos MyHug": "Pets",
    "Capa de Chuva para Cachorro Azul Bichinho Chic": "Pets", "Fonte bebedouro para gatos pet elétrica automática": "Pets",
    "Pijama Feminino Estampa Gatos": null, "Máquina de Cachorro Quente Elétrica": null, "10 chaveiros fofos de cachorrinhos": null,
    "Mochila Infantil com Coleira Anti-Perda": null, "Pote Hermético Cozinha 4 Litros para arroz feijão ração": null,
    "Garrafa Pet 2 Litros Transparente": null, "Perfume Gato Preto Feminino 50ml": null,
  };
  for (const [titulo, esperado] of Object.entries(casos)) {
    for (const [q, cat] of [["perfume", null], ["shampoo", null], ["", categoriaPorNome("Perfumes")], ["", categoriaPorNome("Bebês")]]) {
      total++;
      const [o] = marcarSecoes([{ titulo, preco: 50, principal: true }], cat, q ? categoriaDoProduto(q) : null, q ? produtoBuscado(q) : null);
      const pet = o.secao === "Pets";
      if (pet !== (esperado === "Pets")) { falhas++; console.log(`✗ Pets exclusiva: "${titulo}" ficou em ${o.secao || "Outros"} (${q || cat.nome})`); }
    }
  }
}

// Categoria travada pela categoria que a loja manda no feed (lib/caminhos.js, 28/10/2026)
{
  const casos = [
    [{ titulo: "Perfume Deo Colônia Fêmea Procão - 120 ml", lojaNome: "Cobasi", catsLoja: ["Productos para mascotas y animales > Productos para mascotas"] }, "Pets"],
    [{ titulo: "Charm Perfume em Prata 925", lojaNome: "Monte Carlo Jóias", catsLoja: ["Vestuário e acessórios > Joias > Amuletos e pingentes"] }, "Joias e bijuterias"],
    [{ titulo: "Perfume para Ar Condicionado Garden 60ml", lojaNome: "Efacil", catsLoja: ["Climatização &gt; Ar Condicionado"] }, "Eletrodomésticos"],
    [{ titulo: "Jogo de Cama Casal Karsten 4 Peças", lojaNome: "Karsten", catsLoja: ["Cama - Produto - Jogo de Cama"] }, "Cama e banho"],
    [{ titulo: "Cama Solteiro Montessoriana Branco", lojaNome: "Casa Tema", catsLoja: ["Cama"] }, "Móveis"],
    [{ titulo: "Cozinha Compacta 6 Portas Branco", lojaNome: "Efacil", catsLoja: ["Móveis &gt; Cozinha Completa"] }, "Móveis"],
    [{ titulo: "Panela Elétrica de Arroz Mondial", lojaNome: "Efacil", catsLoja: ["Eletroportáteis &gt; Panela Elétrica"] }, "Eletroportáteis"],
    [{ titulo: "Blusa Babado Estampada - 34", lojaNome: "Animale", catsLoja: ["NEW COLLECTION - BLUSA"] }, "Moda feminina"],
    [{ titulo: "Perfume Árabe Lattafa Asad 100ml", lojaNome: "shopee", catsLoja: ["100630", "100661"] }, "Perfumes"],
  ];
  for (const q of ["perfume", ""]) {
    const ofertas = casos.map(([o]) => ({ ...o, preco: 100, principal: true }));
    const marcadas = q ? marcarSecoes(separarAcessorios(ofertas, q), null, categoriaDoProduto(q), produtoBuscado(q)) : marcarSecoes(ofertas, categoriaPorNome("Perfumes"));
    for (const o of marcadas) {
      const esperada = casos.find(([c]) => c.titulo === o.titulo)[1];
      total++;
      if (o.secao !== esperada) { falhas++; console.log(`✗ categoria da loja: "${o.titulo}" ficou em ${o.secao || "Outros"} (esperado ${esperada}, ${q || "Perfumes aberta"})`); }
    }
  }
}

// Filtro da AliExpress (busca solta): fica = passa no filtro; sai = tem que ser tirado
const FILTRO_ALIEXPRESS = {
  // 27/10/2026 (print): "vibração" contém "ração"; o massageador aparecia na busca "ração"
  "ração": { fica: ["Ração para Peixes Ornamentais SUNSUN Koi", "Ração Golden Cães Adultos 15kg"],
    sai: ["Máquina de massagem para pescoço com 4 cabeças, aquecimento, vibração, compressa quente"] },
  "batedeira": {
    fica: ["Batedeira Planetária Mondial 700W", "Gancho Espiral para Batedeiras KitchenAid", "Batedeiras Elétricas Portáteis"],
    sai: ["Capacitor Automotivo Farah 16V100F: Retificador Eletrônico", "Supernew para dewalt portátil jump start cabo carro auxiliar"],
  },
  "babuche masculino": { fica: ["Babuche Masculino Adulto Chinelo Sandália 2 em 1"], sai: ["Lenço Bandana Masculino para Ciclismo", "Boné de malha clássico masculino com logotipo"] },
  "air fryer": { fica: ["Airfryer Philco 5,5L", "Fritadeira Air Fryer Mondial", "Fritadeira a Ar Dupla Ninja Mais Vendida para Casa"], sai: ["Ventilador de Ar Portátil USB"] },
  "power bank": { fica: ["Bateria Portátil Magnética Xiaomi 10000mAh", "Carregador Portátil 20000mAh"], sai: ["Lanterna LED recarregável com 5 modos"] },
  "smartwatch": { fica: ["Smart Watch Ultra 9 Pro Max", "Relógio Smartwatch D20"], sai: ["Pulseira de Silicone 22mm"] },
  // Com marca e produto, só a marca não basta (print de 19/10/2026)
  "air fryer mondial": { fica: ["Fritadeira Elétrica sem Óleo/Air Fryer Mondial - 110V", "Air Fryer Philco 5L"], sai: ["Secador de Cabelo Mondial Tourmaline Íon Preto - 110V"] },
  // Sem todas as palavras e de outra categoria (vale para marca fora da lista)
  "air fryer marcaqualquer": { fica: ["Air Fryer Marcaqualquer 5L"], sai: ["Secador de Cabelo Marcaqualquer 2000W"] },
  "bolsa feminina": { fica: ["Bolsa Feminina Transversal Couro", "Bolsa Tiracolo Pequena Feminina"], sai: ["Calças Cargo Femininas de Cintura Alta com Bolsos"] },
  "capinha iphone 13": { fica: ["Elegante capa protetora para iPhone 18 17 16 15 14 13 12 11 Pro Max"], sai: [] },
  "tenis adidas": { fica: ["Adidas genuíno Superstar Unissex Minimalista Chunky Sneakers JS3027"], sai: [] },
  "mondial": { fica: ["Secador de Cabelo Mondial Tourmaline", "Air Fryer Mondial 4L"], sai: ["Air Fryer Philco 5L"] },
};
for (const [q, { fica, sai }] of Object.entries(FILTRO_ALIEXPRESS)) {
  const cita = tituloDaBusca(q);
  for (const t of fica) { total++; if (!cita(t)) { falhas++; console.log(`✗ filtro AliExpress "${q}": tirou "${t}"`); } }
  for (const t of sai) { total++; if (cita(t)) { falhas++; console.log(`✗ filtro AliExpress "${q}": deixou "${t}"`); } }
}
// Filtro da Awin (lib/fontes/awin.js): título com todas as palavras, ou (3+ palavras) citando alguma do produto
// 03/11/2026 (auditoria): "dry" achava "Drykofita" e "fit" achava "Fita" (fitas impermeabilizantes da Efacil)
const FILTRO_AWIN = {
  "camiseta dry fit": { fica: ["Camiseta Dry Fit Masculina Academia", "Camiseta Dryfit Feminina"],
    sai: ["Drykofita Fita Aluminizada Impermeabilizante Dryko 10cmx10m", "Drykoprimer Acqua Emulsão Asfáltica Para Aderencia De Fitas 1L"] },
};
for (const [q, { fica, sai }] of Object.entries(FILTRO_AWIN)) {
  const todas = temTodasAsPalavras(q), cita = citaAlgumaPalavra(q);
  const passa = (t) => todas(t) || cita(t);
  for (const t of fica) { total++; if (!passa(t)) { falhas++; console.log(`✗ filtro Awin "${q}": tirou "${t}"`); } }
  for (const t of sai) { total++; if (passa(t)) { falhas++; console.log(`✗ filtro Awin "${q}": deixou "${t}"`); } }
}
// Correção de digitação (17/10/2026, print "maquina de lavar eletrolux"): [digitado, q buscado, "Você quis dizer"]
const CORRECOES = [
  ["maquina de lavar eletrolux", "máquina de lavar electrolux", null],
  // Acentos (17/10/2026): sem acento as lojas trazem resultados piores
  ["fogao", "fogão", null], ["Colchao casal", "colchão casal", null], ["tenis nike", "tênis nike", null], ["Fogão", "Fogão", null],
  ["aspirador de po", "aspirador de pó", null], ["media", "media", null],
  ["samsumg galaxy", "samsung galaxy", null],
  ["fone bluetoth", "fone bluetooth", null],
  ["baduche masculino", "babuche masculino", null],
  ["electrolox", "electrolox", "electrolux"],
  // Palavras de verdade perto de marcas não mudam
  ["natural", "natural", null], ["nivel a laser", "nível a laser", null], ["cross", "cross", null],
  ["invictus", "invictus", null], ["conversor hdmi", "conversor hdmi", null], ["stranger things", "stranger things", null],
];
// Palavras compostas (05/11/2026, Giovanni: "microondas" trazia 36 produtos e "micro-ondas" 95): qualquer grafia vira a com
// hífen, então as buscas coincidem; "óculos para sol", "usb-c" e "wi-fi" ficam como estão
for (const [digitado, esperado] of [["microondas", "micro-ondas"], ["micro ondas", "micro-ondas"], ["Micro-Ondas", "micro-ondas"],
  ["Microondas Electrolux 20L", "micro-ondas Electrolux 20L"], ["forno microondas", "forno micro-ondas"], ["guarda roupa casal", "guarda-roupa casal"],
  ["guardaroupa", "guarda-roupa"], ["lava loucas", "lava-louças"], ["pretreino", "pré-treino"], ["alto falante bluetooth", "alto-falante bluetooth"],
  ["oculos para sol", "óculos para sol"], ["usb-c", "usb-c"], ["wi-fi", "wi-fi"]]) {
  total++;
  const r = corrigirBusca(digitado);
  if (r.q !== esperado) { falhas++; console.log(`✗ composta "${digitado}": ${r.q} (esperado ${esperado})`); }
}
// E a palavra composta escrita junta, separada ou com hífen no título continua sendo o produto
for (const [q, titulo] of [["micro-ondas", "Microondas Electrolux 20L"], ["micro-ondas", "Micro Ondas Philco 25L"], ["guarda-roupa", "Guardaroupa Casal 6 Portas"],
  ["guarda-roupa", "Guarda Roupa Solteiro 3 Portas"], ["lava-louças", "Lava Louças Brastemp 8 Serviços"], ["pré-treino", "Pre Treino Horus 300g"]]) {
  total++;
  if (!temTodasAsPalavras(q)(titulo)) { falhas++; console.log(`✗ composta no título "${q}": ${titulo}`); }
}
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
// Produto que a loja só acha com marca/amperagem, com preço mínimo (print "bateria para carro", 17/10/2026)
for (const [q, buscaEsperada, itens, esperado] of [
  ["bateria para carro", "bateria 60ah",
    [["Bateria Automotiva Moura M60AD 60Ah 12V", 717], ["Bateria Zetta 12V 45AH Polo Positivo", 499], ["Bateria Moura Moto 5ah Titan Biz", 183]],
    { "Bateria Automotiva Moura M60AD 60Ah 12V": "P", "Bateria Zetta 12V 45AH Polo Positivo": "P", "Bateria Moura Moto 5ah Titan Biz": "A" }],
  ["controle para vídeo game", "joystick para video game", [["Controle Xbox 360 Com Fio Para Video Game", 60]], { "Controle Xbox 360 Com Fio Para Video Game": "P" }],
  ["joystick", "controle video game", [["Joystick Sem Fio Para PS4", 90]], { "Joystick Sem Fio Para PS4": "P" }],
  // Os dois nomes do mesmo aparelho pesquisam os dois (print "smartphone" x "celular", 06/11/2026)
  ["smartphone", "celular", [["Celular Samsung Galaxy A17 256gb", 1299]], { "Celular Samsung Galaxy A17 256gb": "P" }],
  ["celular", "smartphone", [["Smartphone Motorola Moto G06 128GB", 699]], { "Smartphone Motorola Moto G06 128GB": "P" }],
  ["Smartphone Xiaomi", "celular xiaomi", [["Celular Xiaomi Redmi 15C 256GB", 999]], { "Celular Xiaomi Redmi 15C 256GB": "P" }],
  ["celular samsung", "smartphone samsung", [["Smartphone Samsung Galaxy A07 128GB", 799]], { "Smartphone Samsung Galaxy A07 128GB": "P" }],
  ["Kindle", "kindle paperwhite",
    [["Kindle Paperwhite 12ª geração 16GB", 1399], ["Kindle kit 2 unidades Card para Capinha de Kindle", 12], ["Kindle Charm Pingente Anti Poeira", 17]],
    { "Kindle Paperwhite 12ª geração 16GB": "P", "Kindle kit 2 unidades Card para Capinha de Kindle": "A", "Kindle Charm Pingente Anti Poeira": "A" }],
]) {
  const { buscas, termo, precoMin } = buscaNasLojas(q);
  total++;
  if (!buscas.includes(buscaEsperada)) { falhas++; console.log(`✗ buscas nas lojas "${q}": ${buscas.join(", ")}`); }
  const saida = separarAcessorios(itens.map(([titulo, preco], i) => ({ id: String(i), titulo, preco })), termo, { precoMin });
  for (const [titulo, tipo] of Object.entries(esperado)) {
    total++;
    const o = saida.find((x) => x.titulo === titulo);
    const obtido = o.acessorio ? "A" : o.principal ? "P" : "N";
    if (obtido !== tipo) { falhas++; console.log(`✗ produto nas lojas "${q}": "${titulo}" deu ${obtido}, esperado ${tipo}`); }
  }
}
console.log(falhas ? `\n${falhas} problema(s) em ${total} títulos` : `\n✓ Tudo certo (${Object.keys(CASOS).length} buscas, ${total} títulos)`);
process.exitCode = falhas ? 1 : 0;
