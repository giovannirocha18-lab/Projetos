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
