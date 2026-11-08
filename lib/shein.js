// Shein (08/11/2026): Giovanni é afiliado pelo Centro de Afiliados da Shein (programa de criadores, Instagram do site).
// Não há lista de produtos nem API para afiliados no Brasil (conferido em 08/11/2026): a Shein entra em "Lojas parceiras"
// só com o botão "Ir para a loja" (/api/ir-loja?id=shein), pelo link de afiliado dele. Esse link foi gerado no "Converter
// Link" do Centro de Afiliados. 08/11/2026: campanha "500 mais quentes da SHEIN" (campaign=bestsellers_campaign, id 1265),
// que abre a página dos mais vendidos (o 1º link abria um produto só; a página inicial não é aceita no conversor).
// A compra feita lá dentro do prazo do cookie conta para ele. Para trocar, mudar aqui.
export const LINK_SHEIN = "https://onelink.shein.com/59/67lf9sa5w8kb";
export const LOJA_SHEIN = { id: "shein", nome: "Shein", rede: "marketplace", soLink: true, internacional: true };

// Campanhas da Shein (08/11/2026, pedido do Giovanni): cartões "Ofertas da Shein" na página inicial, na Black Friday e na
// busca por "shein". Cada uma leva à campanha pelo link de afiliado dele (Centro de Afiliados > Campanha > "Ganhe").
// ate = último dia (AAAA-MM-DD, horário de Brasília; null = sem data): depois disso o cartão some sozinho. Para incluir ou
// trocar, editar esta lista (a ordem é a do site).
export const CAMPANHAS_SHEIN = [
  { titulo: "Os 500 mais vendidos da Shein", detalhe: "95% com avaliação 5 estrelas", emoji: "🔥", link: LINK_SHEIN, ate: null },
];

const hojeSP = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
export function campanhasSheinAtivas(hoje = hojeSP()) {
  return CAMPANHAS_SHEIN.filter((c) => /^https:\/\/onelink\.shein\.com\//.test(c.link) && (!c.ate || c.ate >= hoje))
    .map((c) => ({ ...c, diasRestantes: c.ate ? Math.round((Date.parse(c.ate) - Date.parse(hoje)) / 864e5) : null }));
}
