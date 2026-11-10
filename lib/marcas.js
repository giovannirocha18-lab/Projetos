// Filtro de marca feito no servidor (10/11/2026, pedido do Giovanni depois do print "Brastemp" na Black Friday: o site
// ia baixando a página de 48 em 48 e separando a marca no aparelho; marca rara demorava e podia parar antes de achar tudo).
// Com ?marca=<nome> a Black Friday e as páginas de loja (Mercado Livre e lojas da Awin) devolvem de uma vez só os produtos
// que citam a marca no nome. A conferência fina continua no site (marcaDe em app.js: posição da marca no título, marca que
// também é palavra comum…); aqui é a peneira larga: o título cita a marca ou um apelido dela.
import { MARCAS } from "./vocabulario.js";
import { normalizar } from "./texto.js";

// CÓPIAS de MARCA_APELIDOS e LOJAS_QUE_SAO_MARCA de public/assets/app.js (o site não tem build e não importa de lib/).
// O teste testes/marcas.mjs confere que as duas continuam iguais
export const MARCA_APELIDOS = { iphone: "apple", ipad: "apple", macbook: "apple", airpods: "apple", galaxy: "samsung", redmi: "xiaomi",
  poco: "xiaomi", eletrolux: "electrolux", britania: "britânia", boticario: "o boticário", kindle: "amazon", alexa: "amazon",
  chromecast: "google" };
export const LOJAS_QUE_SAO_MARCA = { karsten: "Karsten", polishop: "Polishop", "monte carlo": "Monte Carlo", animale: "Animale",
  "shark ninja": "Ninja", arno: "Arno", malwee: "Malwee", brinox: "Brinox", rovitex: "Rovitex" };

export const MAX_DA_MARCA = 240; // produtos de uma marca numa resposta (5 páginas de 48)

const conhecidas = new Set([...MARCAS.map(normalizar), ...Object.values(MARCA_APELIDOS).map(normalizar),
  ...Object.values(LOJAS_QUE_SAO_MARCA).map(normalizar)]);

// ?marca= vem do site já sem acento e em minúsculas ("britania", "o boticario"). Só marca da nossa lista é aceita (o
// endereço entra na chave do cache: não pode ser texto livre). Devolve { n, cita(titulo, lojaNome) } ou null
export function filtroDeMarca(texto) {
  const n = normalizar(String(texto || "").slice(0, 60));
  if (!n || !conhecidas.has(n)) return null;
  const termos = [n, ...Object.entries(MARCA_APELIDOS).filter(([, dona]) => normalizar(dona) === n).map(([apelido]) => apelido)]
    .map((t) => ` ${t} `);
  const lojas = Object.entries(LOJAS_QUE_SAO_MARCA).filter(([, marca]) => normalizar(marca) === n).map(([loja]) => loja);
  return {
    n,
    cita(titulo, lojaNome) {
      const t = ` ${normalizar(titulo)} `;
      if (termos.some((termo) => t.includes(termo))) return true;
      if (!lojas.length || !lojaNome) return false;
      const l = normalizar(lojaNome);
      return lojas.some((k) => l === k || l.startsWith(`${k} `));
    },
  };
}
