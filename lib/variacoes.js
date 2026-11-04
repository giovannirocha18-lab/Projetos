// Variações do mesmo produto (04/11/2026). Algumas lojas da Awin mandam cada tamanho como um produto:
//   Lauri Esporte: "Tênis Olympikus Corre Grafeno 3 Azul 40", "… Azul 41", "… Azul 42"…
//   Cama In Box:   "Colchão Select - Casal", "- Queen", "- King"…
// modeloBase tira o tamanho do fim do título, para juntar as variações (página da loja e busca da Awin).
// Numeração só sai em calçado e roupa: "Smart TV 50" e "Smart TV 65" são produtos diferentes.
import { normalizar } from "./texto.js";

export const CALCADO_ROUPA = /^(tenis|chuteira|sapat|bota|botina|coturno|sandalia|chinelo|tamanco|mocassim|sapatenis|scarpin|rasteira|papete|crocs|babuch|camis|camiseta|regata|blusa|jaqueta|casaco|moletom|calca|bermuda|short|saia|vestido|legging|top|meia|cueca|calcinha|sutia|maio|biquini|body|macacao|conjunto|agasalho|corta vento|colete|polo|pijama)/;
const TAMANHO_ROUPA = /\s+(\d?(pp|p|m|g|gg|xg|xgg|eg|egg|exg)|xxs|xs|s|l|xl|xxl|xxxl|2xl|3xl|g[1-4]|u|un|unico|tam(anho)? \w+)$/;
const NUMERACAO = /\s+(n(um)?\s*)?\d{1,2}(\s*[\/-]\s*\d{1,2})?( br)?$/;

export function modeloBase(titulo) {
  let t = normalizar(String(titulo || "").replace(/\s+-\s+[^-]*$/, "")).replace(/[^a-z0-9\/ -]+/g, " ").replace(/\s+/g, " ").trim();
  if (CALCADO_ROUPA.test(t)) {
    // Um só: "Jaqueta Columbia 2 G" perde o "G", não o "2" do modelo
    t = (TAMANHO_ROUPA.test(t) ? t.replace(TAMANHO_ROUPA, "") : t.replace(NUMERACAO, "")).trim();
  }
  return t;
}

// Grupo do produto para alternar tipos na página da loja: a 1ª palavra da categoria da loja
// ("Tênis para corrida" e "Tênis Casual" = tênis; "Jaqueta"; "Bota"…)
export function grupoDaCategoria(categoria) {
  const p = normalizar(String(categoria || "")).split(/[^a-z0-9]+/).find((x) => x.length > 2) || "";
  return p.replace(/(oes|aes)$/, "ao").replace(/s$/, "");
}

// Título sem o tamanho do fim, para o cartão que junta as variações ("… Azul 34" -> "… Azul"; o tamanho se escolhe na loja)
export function semTamanho(titulo) {
  const t = String(titulo || "").trim();
  if (!CALCADO_ROUPA.test(normalizar(t))) return t;
  const roupa = /\s+(\d?(PP|P|M|G|GG|XG|XGG|EG|EGG|EXG)|XXS|XS|S|L|XL|XXL|XXXL|2XL|3XL|G[1-4]|U|UN|[ÚU]NICO|Tam(anho)?\.? \w+)$/i;
  const numero = /\s+(N(º|o|um)?\.?\s*)?\d{1,2}(\s*[\/-]\s*\d{1,2})?( BR)?$/i;
  return (roupa.test(t) ? t.replace(roupa, "") : t.replace(numero, "")).trim() || t;
}
