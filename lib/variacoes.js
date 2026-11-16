// Variações do mesmo produto (04/11/2026). Algumas lojas da Awin mandam cada tamanho como um produto:
//   Lauri Esporte: "Tênis Olympikus Corre Grafeno 3 Azul 40", "… Azul 41", "… Azul 42"…
//   Cama In Box:   "Colchão Select - Casal", "- Queen", "- King"…
// modeloBase tira o tamanho do fim do título, para juntar as variações (página da loja e busca da Awin).
// Numeração só sai em calçado e roupa (o 1º nome do título, inteiro: "Sapateira" é móvel, não sapato; 05/11/2026):
// "Smart TV 50" e "Smart TV 65" são produtos diferentes.
import { normalizar } from "./texto.js";

export const CALCADO_ROUPA = /^(tenis|chuteiras?|sapatos?|sapatilhas?|sapatenis|botas?|botinas?|coturnos?|sandalias?|chinelos?|tamancos?|mocassins?|scarpins?|rasteiras?|papetes?|crocs|babuchas?|camisas?|camisetas?|camisolas?|regatas?|blusas?|blusoes?|blusao|jaquetas?|casacos?|moletons?|moletom|calcas?|bermudas?|shorts?|saias?|vestidos?|leggings?|tops?|meias?|cuecas?|calcinhas?|sutias?|maios?|biquinis?|body|bodies|macacoes?|macacao|agasalhos?|corta vento|coletes?|polos?|pijamas?)( |$)/;
const TAMANHO_ROUPA = /\s+(\d?(pp|p|m|g|gg|xg|xgg|eg|egg|exg)|xxs|xs|s|l|xl|xxl|xxxl|2xl|3xl|g[1-4]|u|un|unico|tam(anho)? \w+)$/;
const NUMERACAO = /\s+(n(um)?\s*)?\d{1,2}(\s*[\/ -]\s*\d{1,2})?( br)?$/; // "37/38" vira "37 38" no normalizar

// Olympikus (loja própria na Awin, 13/11/2026): a numeração vem ANTES da cor ("Tênis Olympikus Titanium 41 Bege", "… 42 Bege").
// Só nos títulos dela: em outras marcas o número ali é o modelo ("Pegasus 41 Preto")
const NUMERO_ANTES_DA_COR = /\s(2\d|3\d|4[0-8])([ \/-](2\d|3\d|4[0-8]))?(?=(\s[a-z\/-]+){1,4}$)/; // "41", "32" (infantil), "39-40"
export function modeloBase(titulo) {
  let t = normalizar(String(titulo || "").replace(/\s+-\s+[^-]*$/, "")).replace(/[^a-z0-9\/ -]+/g, " ").replace(/\s+/g, " ").trim();
  if (CALCADO_ROUPA.test(t) && /\bolympikus\b/.test(t) && NUMERO_ANTES_DA_COR.test(t)) return t.replace(NUMERO_ANTES_DA_COR, "").trim();
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
  // Olympikus: numeração antes da cor ("… Titanium 41 Bege" -> "… Titanium Bege")
  const antesDaCor = /\s(2\d|3\d|4[0-8])([ \/-](2\d|3\d|4[0-8]))?(?=(\s[A-Za-zÀ-ú\/-]+){1,4}$)/;
  if (/\bolympikus\b/i.test(t) && antesDaCor.test(t)) return t.replace(antesDaCor, "").trim();
  return (roupa.test(t) ? t.replace(roupa, "") : t.replace(numero, "")).trim() || t;
}


// Cores do mesmo produto (mesma loja e mesmo preço) que o site junta num cartão: CÓPIA de PALAVRA_DE_COR/soMudaACor de
// public/assets/app.js (semRepetidos). Usada pela auditoria robo/variacoes.mjs (15/11/2026: Olympikus aparecia com 887
// grupos "NÃO juntados" que eram só cores). Mudou lá? Mude aqui também.
export const PALAVRA_DE_COR = new Set(("preto preta branco branca cinza bege azul marinho verde musgo vermelho vermelha rosa roxo roxa lilas amarelo amarela "
  + "laranja marrom linho grafite chumbo prata prateado dourado dourada off white cru crua castanho caramelo nude vinho bordo turquesa creme "
  + "claro clara escuro escura esquerda direita esquerdo direito boucle cotele veloure suede jatoba stain natural mel terracota fendi "
  + "areia gelo champagne cobre rose gold black blue red pink green grey gray silver cafe chocolate tabaco petroleo royal bic celeste "
  + "oliva militar mostarda salmao coral magenta violeta lavanda menta agua ceu neon fosco fosca brilho cor cores multicolor multicolorido multicolorida colorido colorida titanium").split(" "));
export function soMudaACor(a, b) {
  const pa = normalizar(a).split(/[^a-z0-9]+/).filter(Boolean), pb = normalizar(b).split(/[^a-z0-9]+/).filter(Boolean);
  if (pa.length < 3 || pb.length < 3 || pa[0] !== pb[0] || pa[1] !== pb[1]) return false;
  const sa = new Set(pa), sb = new Set(pb);
  const fora = [...pa.filter((p) => !sb.has(p)), ...pb.filter((p) => !sa.has(p))];
  return fora.length > 0 && fora.length <= 6 && fora.every((p) => PALAVRA_DE_COR.has(p));
}
