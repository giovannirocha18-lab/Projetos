// Busca DENTRO da Black Friday e das Quedas de preço (pedido do Giovanni, 22/11/2026: "se eu clicar em queda de preço ou
// black friday e fizer uma busca, vai ser dentro deste filtro?"; antes a busca saía da página e ia para o site todo).
// O filtro tem a mesma forma do de marca (lib/marcas.js): { n, cita(titulo) } para a 1ª peneira (todas as palavras da
// busca no nome), mais escolher(lista), que usa as regras da busca do site (lib/relevancia.js) para tirar acessório e
// "parecido" ("ímã de geladeira" não entra em "geladeira")
import { normalizar } from "./texto.js";
import { separarAcessorios } from "./relevancia.js";
import { corrigirBusca, limparBusca, pluralDeUmaPalavra, singularDe } from "./vocabulario.js";

export const MAX_DA_BUSCA = 240; // como o filtro de marca: 5 páginas de 48 numa resposta
const VAZIAS = new Set(["de", "do", "da", "dos", "das", "para", "pra", "com", "sem", "e", "a", "o", "em", "no", "na"]);

export function filtroDeBusca(texto) {
  const limpa = limparBusca(String(texto || "").slice(0, 80));
  if (!limpa) return null;
  const corrigida = corrigirBusca(limpa);
  const certa = (corrigida && (corrigida.sugestao || corrigida.q)) || limpa;
  const q = pluralDeUmaPalavra(certa) || certa;
  const palavras = normalizar(q).split(" ").filter((p) => p && !VAZIAS.has(p)).map(singularDe);
  if (!palavras.length) return null;
  const n = normalizar(q);
  return {
    n,
    q,
    cita(titulo) {
      const tem = new Set(normalizar(titulo).split(" ").map(singularDe));
      return palavras.every((p) => tem.has(p));
    },
    // Fica o que é o produto buscado; se nada for (a busca é de um acessório raro, ou só há acessórios), fica o que bate
    escolher(lista) {
      const marcadas = separarAcessorios(lista.map((o) => ({ ...o })), q);
      const bons = marcadas.filter((o) => o.bate && !o.acessorio && !o.parecido && !o.noMeio);
      const ficam = new Set((bons.length ? bons : marcadas.filter((o) => o.bate)).map((o) => o.id));
      return lista.filter((o) => ficam.has(o.id)); // na ordem em que vieram (a da página)
    },
  };
}
