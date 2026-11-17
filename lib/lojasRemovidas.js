// Lojas tiradas do site por decisão do Giovanni. O robô já não grava os produtos delas (LOJAS_REMOVIDAS em robo/awin.mjs,
// FORA em lib/fontes/lomadee.js); isto tira também o que ficou guardado (buscas prontas e cache) e os cupons delas.
// Lauri Esporte (04/11/2026): fotos quebradas, cada numeração como um anúncio e produtos caros.
import { normalizar } from "./texto.js";

const REMOVIDAS = /\blauri\b/;
export const ehLojaRemovida = (nome) => REMOVIDAS.test(normalizar(String(nome || "")));
// Preço impossível (auditoria de 13/11/2026: ar-condicionado da Central Ar por R$ 16.004.370.000.000.000, erro do feed da
// loja, em 2º lugar na busca "ar condicionado"): sai junto, em todo lugar que já tira as lojas removidas
export const PRECO_TETO = 1_000_000;
export const ofertaDeLojaRemovida = (o) => ehLojaRemovida(o?.lojaNome) || ehLojaRemovida(o?.loja) || o?.preco > PRECO_TETO;

// Preço absurdo dentro de uma busca (17/11/2026, print do Giovanni: "Smartphone Samsung Galaxy A16" do Mercado Livre por
// R$ 750.000, erro do vendedor no anúncio): sai da lista o que custa mais de R$ 10.000 E mais de 40 vezes o preço do meio
// dos produtos da busca (pelo menos 8 com preço). Os dois limites juntos: joia de R$ 2.000 em "anel" e notebook de
// R$ 30.000 em "notebook" ficam
const VEZES_O_DO_MEIO = 40;
const MINIMO_ABSURDO = 10_000;
export function semPrecoAbsurdo(ofertas) {
  const precos = (lista) => lista.map((o) => Number(o?.preco)).filter((p) => p > 0).sort((a, b) => a - b);
  let base = precos(ofertas.filter((o) => o?.bate && !o?.acessorio));
  if (base.length < 8) base = precos(ofertas);
  if (base.length < 8) return ofertas;
  const teto = Math.max(MINIMO_ABSURDO, base[Math.floor(base.length / 2)] * VEZES_O_DO_MEIO);
  return ofertas.some((o) => o?.preco > teto) ? ofertas.filter((o) => !(o?.preco > teto)) : ofertas;
}
