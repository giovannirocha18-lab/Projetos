// GET /api/preparar-ml?parte=0&horas=44 -> robô da madrugada (job "mercadolivre" do robo-precos.yml, 04/11/2026).
// O Mercado Livre dá "429 local_rate_limited" depois de poucas consultas seguidas, então a busca do site trazia poucos
// produtos dele. O robô passa devagar (uma busca por chamada, um preço por vez) pelas mesmas buscas das buscas prontas e
// guarda no banco o catálogo e os preços (ml_catalogo e ml_ofertas, ver lib/fontes/mercadolivre.js). Roda antes do job
// "prontas", que então monta as buscas prontas com o Mercado Livre lendo do banco.
// horas = só renova o que tiver mais que isso (1ª volta 44 h: começa pelo que a madrugada anterior não alcançou;
// 2ª volta 20 h, se sobrar tempo). limite: true = o Mercado Livre recusou (o robô espera 1 minuto e repete a parte).
import { listaDasProntas } from "./preparar-buscas.js";
import { mercadolivre, tendenciasML } from "../../lib/fontes/mercadolivre.js";
import { corrigirBusca } from "../../lib/vocabulario.js";
import { recusarSeNaoForRobo } from "../../lib/robo.js";

export async function onRequestGet({ request, env }) {
  const recusa = await recusarSeNaoForRobo(request, env);
  if (recusa) return recusa;
  const params = new URL(request.url).searchParams;
  const parte = Math.max(parseInt(params.get("parte"), 10) || 0, 0);
  const horas = Math.min(Math.max(Number(params.get("horas")) || 20, 1), 96);
  const semCache = { headers: { "Cache-Control": "no-store" } };
  if (!mercadolivre.ativa(env)) return Response.json({ erro: "Mercado Livre sem chaves (ML_CLIENT_ID/ML_CLIENT_SECRET)", fim: true }, semCache);
  // ?destaques=N: mais vendidos da N-ésima categoria do Mercado Livre (Ofertas do dia e vitrines; 05/11/2026)
  if (params.has("destaques")) {
    const n = Math.max(parseInt(params.get("destaques"), 10) || 0, 0);
    const inicio = Date.now();
    return Response.json({ destaques: n, ...(await mercadolivre.prepararDestaques(env, n)), segundos: (Date.now() - inicio) / 1000 }, semCache);
  }
  // Só as buscas com termo (as "Ofertas do dia" não têm Mercado Livre)
  // + as tendências do Mercado Livre (o que mais se busca lá; 05/11/2026), no fim da lista
  const [prontas, tendencias] = await Promise.all([listaDasProntas(env), tendenciasML(env).catch(() => [])]);
  const termos = [...new Set([...prontas.map((b) => corrigirBusca(b.q).q), ...tendencias.map((t) => corrigirBusca(t).q)].filter(Boolean))];
  if (parte >= termos.length) return Response.json({ parte, partes: termos.length, fim: true }, semCache);
  const inicio = Date.now();
  const r = await mercadolivre.preparar(termos[parte], env, horas);
  return Response.json({ parte, partes: termos.length, fim: parte + 1 >= termos.length, busca: termos[parte], ...r,
    segundos: (Date.now() - inicio) / 1000 }, semCache);
}
