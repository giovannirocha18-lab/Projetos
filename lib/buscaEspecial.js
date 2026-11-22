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
    // soProdutos: sem a reserva (usado na 2ª fonte da página quando a 1ª já trouxe o produto: os mais vendidos do
    // Mercado Livre não tinham iPhone em oferta e a reserva punha controle e carregador "para iPhone" na lista)
    // contexto: anúncios já escolhidos de outra fonte, julgados JUNTO (a regra de acessório depende da lista: sozinhos,
    // sem nenhum iPhone por perto, controle e microfone "para iPhone" não eram marcados como acessório)
    escolher(lista, { soProdutos = false, contexto = [] } = {}) {
      const marcadas = separarAcessorios([...contexto, ...lista].map((o) => ({ ...o })), q);
      const semAcessorio = marcadas.filter((o) => o.bate && !o.acessorio && !o.parecido && !o.noMeio);
      // Com 5+ anúncios cujo nome COMEÇA pelo produto (principal), só eles: "Controle Gamepad … iPhone 15/16" e
      // "Microfone … iPhone 15" têm a palavra e não são acessório conhecido, mas não são o iPhone
      // (ou trazem a 1ª palavra da busca entre as 4 primeiras do nome: "Nike G.T. original Tênis de Basquete" fica)
      const perto = (o) => {
        const i = normalizar(o.titulo).split(" ").slice(0, 4).map(singularDe).indexOf(palavras[0]);
        return i === 0 || (i > 0 && !o.variante);
      };
      const principais = semAcessorio.filter((o) => (o.principal && !o.variante) || perto(o));
      const bons = principais.length >= 5 ? principais : semAcessorio;
      const ficam = new Set((bons.length || soProdutos ? bons : marcadas.filter((o) => o.bate)).map((o) => o.id));
      return lista.filter((o) => ficam.has(o.id)); // na ordem em que vieram (a da página)
    },
  };
}
