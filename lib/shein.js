// Shein (08/11/2026): Giovanni é afiliado pelo Centro de Afiliados da Shein (programa de criadores, Instagram do site).
// Não há lista de produtos nem API para afiliados no Brasil (conferido em 08/11/2026): a Shein entra em "Lojas parceiras"
// só com o botão "Ir para a loja" (/api/ir-loja?id=shein), pelo link de afiliado dele. Esse link foi gerado no "Converter
// Link" do Centro de Afiliados. 08/11/2026: campanha "500 mais quentes da SHEIN" (campaign=bestsellers_campaign, id 1265),
// que abre a página dos mais vendidos (o 1º link abria um produto só; a página inicial não é aceita no conversor).
// A compra feita lá dentro do prazo do cookie conta para ele. Para trocar, mudar aqui.
export const LINK_SHEIN = "https://onelink.shein.com/59/67lf9sa5w8kb";
export const LOJA_SHEIN = { id: "shein", nome: "Shein", rede: "marketplace", soLink: true, internacional: true };
