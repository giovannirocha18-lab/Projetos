// Separa o produto buscado dos acessórios dele.
// Ex.: buscando "air fryer", "Air Fryer 6,5L Forno Elétrico" é o produto;
// "Tapete de Silicone para Air Fryer" e "Crisping Plate for Ninja Air Fryer" são acessórios.
// O site mostra os acessórios só se o visitante pedir (ou se só houver acessórios).
import { normalizar } from "./texto.js";

// Palavras que indicam acessório/peça quando aparecem ANTES do produto buscado
const ANTES = new Set(`
  acessorio acessorios adesivo adesivos alca assadeira bandeja base bolsa cabo capa capinha carregador case
  cesto controle cobertura descanso divisoria estojo filtro filtros forma formas forminha forminhas forro forros
  grade grelha kit luva mochila organizador papel pecas peca pegador pelicula pinca protetor refil reparo
  resistencia saco suporte tampa tapete travessa
  accessories accessory adapter basket case charger cover filter holder liner liners mat mats pan paper parts
  plate protector rack replacement skin stand tray
`.trim().split(/\s+/));

// Palavras que indicam acessório logo DEPOIS do produto buscado (títulos em inglês: "Air Fryer Liners")
const DEPOIS = new Set(`
  accessories accessory basket baskets case cover filter insert liner liners mat mats pan paper parts plate rack
  replacement tray trays papel forro tapete forma formas kit acessorio acessorios capa capinha pelicula tampa
`.trim().split(/\s+/));

// "para air fryer", "for air fryer", "compativel com air fryer", "p/ air fryer"
const LIGACOES = ["para", "pra", "p", "for", "compativel com", "compativel", "compatible with", "fits"];

const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function criarDetector(q) {
  const termos = normalizar(q).split(" ").filter(Boolean);
  if (!termos.length) return () => false;
  // "air fryer" também acha "airfryer" e vice-versa
  const frase = new RegExp(`(^| )${termos.map(escapar).join(" ?")}( |$)`);
  const ligacao = new RegExp(`(^| )(${LIGACOES.join("|")}) (\\S+ ){0,3}?${termos.map(escapar).join(" ?")}( |$)`);
  const buscouAcessorio = termos.some((t) => ANTES.has(t) || DEPOIS.has(t));

  return (titulo) => {
    if (buscouAcessorio) return false; // quem busca "capa iphone" quer a capa
    const t = normalizar(titulo);
    const achou = frase.exec(t);
    if (!achou) return false;
    if (ligacao.test(t)) return true;
    const antes = t.slice(0, achou.index).split(" ").filter(Boolean);
    if (antes.some((p) => ANTES.has(p))) return true;
    const depois = t.slice(achou.index + achou[0].length).split(" ").filter(Boolean).slice(0, 3);
    return depois.some((p) => DEPOIS.has(p));
  };
}

// Marca as ofertas que são acessórios e manda elas para o fim da lista
export function separarAcessorios(ofertas, q) {
  const ehAcessorio = criarDetector(q);
  const marcadas = ofertas.map((o) => (ehAcessorio(o.titulo) ? { ...o, acessorio: true } : o));
  return [...marcadas.filter((o) => !o.acessorio), ...marcadas.filter((o) => o.acessorio)];
}
