// =====================================================================
// CUPONS — cupons oficiais das marcas da Lomadee (pedido do Giovanni, 24/10/2026)
// GET /affiliate/campaigns?types=GenericCoupon,PersonalCoupon&status=onTime (escopo campaigns:read, máx. 20 por página).
// Cada cupom vem com os canais do afiliado: o link com comissão é o shortUrl do canal liberado (sem "message").
// Só entram cupons de marcas aprovadas (as mesmas da busca) e que ainda valem. Nada é inventado: código, texto e
// validade são os que a marca cadastrou.
// =====================================================================
import { pedirLomadee, marcasAprovadas, chaveLoja } from "./fontes/lomadee.js";

const MAX_PAGINAS = 10; // 200 cupons; a Lomadee aceita 60 consultas por minuto
const semHtml = (s) => String(s || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

// Algumas marcas põem o código no título ("CHAPEUDEVIAGEM", "Use o cupom PHILCO50…"): o código fica escondido até o
// clique em "Pegar cupom" (link com comissão), então ele sai do texto. Compara sem maiúsculas, acentos, espaços e
// símbolos ("BEM VINDO" = BEMVINDO, "Desconto 10%OFF" = DESCONTO10OFF); título que fica vazio vira "Cupom de desconto".
const base = (ch) => ch.normalize("NFD")[0].toLowerCase();
export function semCodigo(texto, codigo) {
  const alvo = [...String(codigo || "")].map(base).filter((ch) => /[a-z0-9]/.test(ch)).join("");
  if (alvo.length < 4 || !texto) return texto;
  const letras = [...texto];
  let saida = "", tirou = false;
  for (let i = 0; i < letras.length; i++) {
    // Começa numa letra/número que não seja o meio de outra palavra e tenta casar o código inteiro
    let j = i, k = 0;
    if (!/[a-z0-9]/.test(base(letras[i])) || (i > 0 && /[a-z0-9]/.test(base(letras[i - 1])))) { saida += letras[i]; continue; }
    while (j < letras.length && k < alvo.length) {
      const ch = base(letras[j]);
      if (ch === alvo[k]) { j++; k++; } else if (k > 0 && !/[a-z0-9]/.test(ch)) j++; else break;
    }
    if (k === alvo.length && !(j < letras.length && /[a-z0-9]/.test(base(letras[j])))) { i = j - 1; tirou = true; continue; }
    saida += letras[i];
  }
  saida = saida.replace(/\s+/g, " ").replace(/^[\s\-–:|,.!]+|[\s\-–:|,+]+$/g, "").trim();
  // Sobrou só "Cupom" ou quase nada: o chamador põe "Cupom de desconto"
  if (!tirou) return texto;
  return saida.replace(/\bcupom\b/gi, "").replace(/[^\p{L}\p{N}]/gu, "").length < 4 ? "" : saida;
}

function converter(c, marca) {
  const canal = (c.channels || []).find((k) => (k.shortUrls || []).length && !k.message);
  const link = canal?.shortUrls?.[0] || "";
  if (!link.startsWith("https://")) return null;
  const ate = c.period?.endAt ? Date.parse(c.period.endAt) : null;
  if (ate && ate < Date.now()) return null;
  const codigo = semHtml(c.code).slice(0, 40);
  return {
    id: String(c.id),
    marcaId: c.organizationId,
    loja: chaveLoja(marca.nome),
    lojaNome: marca.nome,
    titulo: semCodigo(semHtml(c.name), codigo).slice(0, 140) || "Cupom de desconto",
    descricao: semCodigo(semHtml(c.description), codigo).slice(0, 400) || undefined,
    codigo: codigo || undefined,
    ate: ate ? new Date(ate).toISOString() : undefined,
    destaque: Boolean(c.isHighlight) || undefined,
    link,
  };
}

export async function cuponsLomadee(env) {
  if (!env.LOMADEE_API_KEY) return [];
  const marcas = await marcasAprovadas(env);
  const pagina = (n) => pedirLomadee(env, `/affiliate/campaigns?types=GenericCoupon,PersonalCoupon&status=onTime&page=${n}&limit=20`);
  const primeira = await pagina(1);
  const total = Math.min(primeira?.meta?.totalPages || primeira?.pagination?.totalPages || 1, MAX_PAGINAS);
  // Página que falhar derruba tudo: /api/cupons não guarda a lista pela metade (na 1ª vez vieram 18 de 81)
  const resto = await Promise.all(Array.from({ length: total - 1 }, (_, i) => pagina(i + 2)));
  const vistos = new Set();
  return [primeira, ...resto].flatMap((j) => j?.data || [])
    .filter((c) => c?.type !== "Offer" && marcas.has(c.organizationId))
    .map((c) => converter(c, marcas.get(c.organizationId)))
    .filter((c) => c && c.titulo && !vistos.has(c.id) && vistos.add(c.id))
    // Destaques primeiro, depois os que acabam antes; sem data de fim no fim
    .sort((a, b) => Boolean(b.destaque) - Boolean(a.destaque) || (Date.parse(a.ate) || Infinity) - (Date.parse(b.ate) || Infinity));
}
