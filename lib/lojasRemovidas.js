// Lojas tiradas do site por decisão do Giovanni. O robô já não grava os produtos delas (LOJAS_REMOVIDAS em robo/awin.mjs,
// FORA em lib/fontes/lomadee.js); isto tira também o que ficou guardado (buscas prontas e cache) e os cupons delas.
// Lauri Esporte (04/11/2026): fotos quebradas, cada numeração como um anúncio e produtos caros.
import { normalizar } from "./texto.js";

// Desconto Aqui (23/11/2026, Lomadee): papelaria de R$ 2–15; o Giovanni não reconheceu a loja e mandou tirar.
const REMOVIDAS = /\blauri\b|\bdesconto aqui\b/;
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

// Só produto novo (17/11/2026, print do Giovanni: "Coxin Motor Hb20" da Shopee vendido por "FERRO VELHO LEVE"; "tem que tirar
// esses termos, velho, usado, pegar só coisa nova"): sai da lista o anúncio com usado/seminovo/recondicionado… no nome ou
// vendido por ferro-velho, sucata, desmanche, brechó. Fica se a pessoa buscou por isso ("celular usado"). "Usado para/em/como"
// é modo de usar, não estado; "vitrine"/"mostruário" não entram (geladeira vitrine é um produto): só recuam (lib/relevancia.js)
const TITULO_USADO = /\b(usad[oa]s?(?! (para|em|como|por|no|na|nos|nas|com|pel[oa]s?)\b)|semi ?nov[oa]s?|recondicionad[oa]s?|reembalad[oa]s?|refurbished|open ?box|segunda mao|ferro velho|sucatas?|desmanche|(?<!(rende|dura|duram|para|ate|por|a cada) )\d+ (mes(es)?|anos?|dias?|semanas?) (de )?uso(?! (continu|diari|prolongad|intens))|pouco uso|pouco usad[oa]|com marcas de uso)\b/;
const VENDEDOR_USADO = /\b(ferro velho|sucat\w*|desmanche\w*|usad[oa]s?|semi ?nov[oa]s?|brecho\w*|recondicionad\w*)\b/;
const BUSCA_DE_USADO = /\b(usad|semi ?nov|recondicionad|reembalad|refurbished|open ?box|segunda mao|ferro velho|sucata|desmanche|brecho)/;
// 22/11/2026 (print "iphone 18 pro"): "Celular Apple iPhone 18 Pro 256GB 2 MESES USO" também é usado
export const ehUsado = (o) => TITULO_USADO.test(normalizar(String(o?.titulo || ""))) || VENDEDOR_USADO.test(normalizar(String(o?.vendedor || "")));
// 22/11/2026 (Giovanni: "em vez de esconder, faça eles aparecerem num filtro à parte"): na BUSCA o usado não sai mais,
// vai marcado (o.usado) e o site mostra só no filtro "Condição → Usados" (app.js, soDaCondicao). Quem busca "usado" vê
// tudo junto, sem marca. Página de loja, Black Friday e Quedas seguem sem usados (listaSoComNovos)
export function marcarUsados(ofertas, q = "") {
  if (BUSCA_DE_USADO.test(normalizar(String(q || ""))) || !ofertas.some((o) => !o.usado && ehUsado(o))) return ofertas;
  return ofertas.map((o) => (!o.usado && ehUsado(o) ? { ...o, usado: true } : o));
}
export function semUsados(ofertas, q = "") {
  if (BUSCA_DE_USADO.test(normalizar(String(q || "")))) return ofertas;
  return ofertas.some(ehUsado) ? ofertas.filter((o) => !ehUsado(o)) : ofertas;
}

// Listas SEM busca (página de loja, Black Friday, Quedas de preço; 18/11/2026): produtos de tudo quanto é tipo juntos, então o
// "preço do meio" é o de cada categoria do site (o.secao), com pelo menos 8 produtos com preço nela; categoria com menos fica
// como está (uma TV de R$ 12 mil no meio de capinhas não é preço errado). Usado/ferro-velho sai sempre
export function semPrecoAbsurdoPorSecao(ofertas) {
  const porSecao = new Map();
  for (const o of ofertas) { const s = o?.secao || ""; porSecao.set(s, [...(porSecao.get(s) || []), o]); }
  const fora = new Set();
  for (const lista of porSecao.values()) {
    const precos = lista.map((o) => Number(o?.preco)).filter((p) => p > 0).sort((a, b) => a - b);
    if (precos.length < 8) continue;
    const teto = Math.max(MINIMO_ABSURDO, precos[Math.floor(precos.length / 2)] * VEZES_O_DO_MEIO);
    for (const o of lista) if (o?.preco > teto) fora.add(o);
  }
  return fora.size ? ofertas.filter((o) => !fora.has(o)) : ofertas;
}
export const listaSoComNovos = (ofertas) => semPrecoAbsurdoPorSecao(semUsados(ofertas));
