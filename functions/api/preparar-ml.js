// GET /api/preparar-ml?parte=0&horas=44 -> robô da madrugada (job "mercadolivre" do robo-precos.yml, 04/11/2026).
// O Mercado Livre dá "429 local_rate_limited" depois de poucas consultas seguidas, então a busca do site trazia poucos
// produtos dele. O robô passa devagar (uma busca por chamada, um preço por vez) pelas mesmas buscas das buscas prontas e
// guarda no banco o catálogo e os preços (ml_catalogo e ml_ofertas, ver lib/fontes/mercadolivre.js). Roda antes do job
// "prontas", que então monta as buscas prontas com o Mercado Livre lendo do banco.
// horas = só renova o que tiver mais que isso (1ª volta 44 h: começa pelo que a madrugada anterior não alcançou;
// 2ª volta 20 h, se sobrar tempo). limite: true = o Mercado Livre recusou (o robô espera 1 minuto e repete a parte).
// ?arvore=1 e ?proxima=1: mais vendidos de todas as categorias do Mercado Livre (05/11/2026, ver abaixo); ?tendencias=1: o que
// mais se busca em cada categoria. Resposta das buscas: proxima = a parte seguinte (as novas no banco são puladas juntas)
import { listaDasProntas } from "./preparar-buscas.js";
import { mercadolivre, montarArvoreML, prepararTendenciasML, tendenciasDasCategorias, tendenciasML } from "../../lib/fontes/mercadolivre.js";
import { tendenciaAceitavel } from "../../lib/buscas.js";
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
  // ?arvore=1: monta a árvore das categorias do Mercado Livre (ml_categorias; 05/11/2026). Chamar até "faltam" ser 0
  if (params.has("arvore")) {
    const inicio = Date.now();
    try {
      return Response.json({ arvore: true, ...(await montarArvoreML(env)), segundos: (Date.now() - inicio) / 1000 }, semCache);
    } catch (erro) {
      return Response.json({ arvore: true, erro: String(erro.message || erro), faltam: 0, limite: / 429\b/.test(erro.message) }, semCache);
    }
  }
  // ?tendencias=1: o que mais se busca no Mercado Livre em cada categoria (ml_tendencias). Chamar até "faltam" ser 0
  if (params.has("tendencias")) {
    const inicio = Date.now();
    try {
      return Response.json({ tendencias: true, ...(await prepararTendenciasML(env)), segundos: (Date.now() - inicio) / 1000 }, semCache);
    } catch (erro) {
      return Response.json({ tendencias: true, erro: String(erro.message || erro), faltam: 0, limite: / 429\b/.test(erro.message) }, semCache);
    }
  }
  // ?proxima=1[&nivel=2]: mais vendidos da próxima categoria da vez (Ofertas do dia, vitrines, buscas, página da loja ML)
  if (params.has("proxima")) {
    const nivel = params.get("nivel") === "2" ? 2 : 3;
    const inicio = Date.now();
    return Response.json({ ...(await mercadolivre.prepararProxima(env, nivel)), segundos: (Date.now() - inicio) / 1000 }, semCache);
  }
  // Só as buscas com termo (as "Ofertas do dia" não têm Mercado Livre)
  // + as tendências do Mercado Livre (o que mais se busca lá; 05/11/2026), no fim da lista: as gerais e as de cada categoria
  // (até 1.500, o 1º de cada categoria primeiro; o que não der tempo fica para a madrugada seguinte)
  const [prontas, tendencias, dasCategorias] = await Promise.all([listaDasProntas(env), tendenciasML(env).catch(() => []),
    tendenciasDasCategorias(env, 1500)]);
  const termos = [...new Set([...prontas.map((b) => corrigirBusca(b.q).q),
    ...[...tendencias, ...dasCategorias].filter(tendenciaAceitavel).map((t) => corrigirBusca(t).q)].filter(Boolean))];
  if (parte >= termos.length) return Response.json({ parte, partes: termos.length, fim: true }, semCache);
  const inicio = Date.now();
  // As que ainda estão novas no banco não custam nada: passa por várias numa chamada só (até 80 ou 15 s), para a lista
  // longa não gastar o tempo do robô só pulando
  let i = parte;
  let r;
  let puladas = 0;
  for (;;) {
    r = await mercadolivre.preparar(termos[i], env, horas);
    if (r.consultas || r.limite || r.erro || i + 1 >= termos.length || puladas >= 80 || Date.now() - inicio > 15000) break;
    puladas++;
    i++;
  }
  return Response.json({ parte: i, proxima: i + 1, puladas, partes: termos.length, fim: i + 1 >= termos.length, busca: termos[i], ...r,
    segundos: (Date.now() - inicio) / 1000 }, semCache);
}
