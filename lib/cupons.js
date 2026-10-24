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

function converter(c, marca) {
  const canal = (c.channels || []).find((k) => (k.shortUrls || []).length && !k.message);
  const link = canal?.shortUrls?.[0] || "";
  if (!link.startsWith("https://")) return null;
  const ate = c.period?.endAt ? Date.parse(c.period.endAt) : null;
  if (ate && ate < Date.now()) return null;
  return {
    id: String(c.id),
    marcaId: c.organizationId,
    loja: chaveLoja(marca.nome),
    lojaNome: marca.nome,
    titulo: semHtml(c.name).slice(0, 140),
    descricao: semHtml(c.description).slice(0, 400) || undefined,
    codigo: semHtml(c.code).slice(0, 40) || undefined,
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
