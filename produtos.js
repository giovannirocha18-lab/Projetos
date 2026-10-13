// =====================================================================
// CONFIGURAÇÃO DO SITE — edite à vontade
// =====================================================================
const SITE = {
  nome: "Vai pro Carrinho",
  slogan: "Achados que valem cada centavo. Gostou? Vai pro carrinho!",
  instagram: "", // ex: "https://instagram.com/seuperfil"  (deixe vazio para esconder)
  whatsapp: "",  // ex: "https://chat.whatsapp.com/SEU_GRUPO"
};

// =====================================================================
// PRODUTOS — para adicionar um produto, copie um bloco { ... } e edite.
//
// titulo      Nome do produto (obrigatório)
// categoria   Usada nos filtros do topo (obrigatório)
// link        SEU LINK DE AFILIADO, gerado no painel de afiliados (obrigatório)
// imagem      URL da foto: no anúncio, botão direito na foto > "Copiar endereço da imagem"
// preco       Preço atual (opcional — preços mudam, revise com frequência)
// precoAntigo Preço "de" para mostrar desconto (opcional)
// descricao   Por que você recomenda (é o que faz a pessoa clicar!)
// destaque    true = aparece primeiro com selo "Destaque"
// =====================================================================
const PRODUTOS = [
  {
    titulo: "Fone de Ouvido Bluetooth com Cancelamento de Ruído",
    categoria: "Eletrônicos",
    link: "https://www.mercadolivre.com.br/",
    imagem: "",
    preco: 189.9,
    precoAntigo: 259.9,
    descricao: "Bateria de 30h e cancelamento de ruído que funciona de verdade no ônibus.",
    destaque: true,
  },
  {
    titulo: "Air Fryer 4L Antiaderente",
    categoria: "Casa e Cozinha",
    link: "https://www.mercadolivre.com.br/",
    imagem: "",
    preco: 299.0,
    precoAntigo: 399.0,
    descricao: "Tamanho ideal para 2 a 3 pessoas e fácil de limpar.",
    destaque: true,
  },
  {
    titulo: "Kit Organizador de Gaveta (6 peças)",
    categoria: "Casa e Cozinha",
    link: "https://www.mercadolivre.com.br/",
    imagem: "",
    preco: 39.9,
    descricao: "Barato e muda a cara da cozinha. Encaixa em gavetas padrão.",
  },
  {
    titulo: "Sérum Facial Vitamina C 30ml",
    categoria: "Beleza",
    link: "https://www.mercadolivre.com.br/",
    imagem: "",
    preco: 59.9,
    precoAntigo: 79.9,
    descricao: "Textura leve, não deixa a pele oleosa. Um dos mais bem avaliados.",
  },
  {
    titulo: "Mouse Sem Fio Silencioso",
    categoria: "Eletrônicos",
    link: "https://www.mercadolivre.com.br/",
    imagem: "",
    preco: 49.9,
    descricao: "Clique silencioso, ótimo para escritório e para quem trabalha de madrugada.",
  },
  {
    titulo: "Garrafa Térmica Inox 1L",
    categoria: "Esporte",
    link: "https://www.mercadolivre.com.br/",
    imagem: "",
    preco: 79.9,
    descricao: "Mantém gelado por 24h. Não vaza dentro da mochila.",
  },
];
