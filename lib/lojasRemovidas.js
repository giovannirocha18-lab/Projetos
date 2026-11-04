// Lojas tiradas do site por decisão do Giovanni. O robô já não grava os produtos delas (LOJAS_REMOVIDAS em robo/awin.mjs,
// FORA em lib/fontes/lomadee.js); isto tira também o que ficou guardado (buscas prontas e cache) e os cupons delas.
// Lauri Esporte (04/11/2026): fotos quebradas, cada numeração como um anúncio e produtos caros.
import { normalizar } from "./texto.js";

const REMOVIDAS = /\blauri\b/;
export const ehLojaRemovida = (nome) => REMOVIDAS.test(normalizar(String(nome || "")));
export const ofertaDeLojaRemovida = (o) => ehLojaRemovida(o?.lojaNome) || ehLojaRemovida(o?.loja);
