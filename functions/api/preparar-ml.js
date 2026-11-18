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
import { mercadolivre, amostraItensML, espiarCatalogoML, montarArvoreML, prepararTendenciasML, testarNotasML, tendenciasDasCategorias, tendenciasML } from "../../lib/fontes/mercadolivre.js";
import { tendenciaAceitavel, termosBuscados } from "../../lib/buscas.js";
import { listaDasFundas, FICHAS_FUNDAS, proximaFunda, estadoDasFundas, anotarFunda } from "../../lib/mlFundas.js";
import { corrigirBusca } from "../../lib/vocabulario.js";
import { recusarSeNaoForRobo } from "../../lib/robo.js";
import { filaML } from "../../lib/mlFila.js";

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
  // ?testarNotas=1: o que as avaliações do Mercado Livre respondem (teste para a Escolha rápida; 05/11/2026)
  if (params.has("testarNotas")) return Response.json(await testarNotasML(env).catch((e) => ({ erro: String(e.message || e) })), semCache);
  // ?amostraItens=1: campos dos anúncios (Full, parcelas) para os selos novos (10/11/2026)
  if (params.has("amostraItens")) return Response.json(await amostraItensML(env).catch((e) => ({ erro: String(e.message || e) })), semCache);
  // ?espiar=<busca>: o que o catálogo devolve (ficha pai/variações, vendedores) — teste de 17/11/2026
  if (params.get("espiar")) return Response.json(await espiarCatalogoML(env, params.get("espiar")).catch((e) => ({ erro: String(e.message || e) })), semCache);
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
  // ?fundo=<busca>&fichas=240: busca funda de um termo só (17/11/2026, teste "celular samsung"): mais páginas do catálogo e
  // preço de todas as fichas. Chamar de novo enquanto vier limite (o que já foi perguntado fica guardado e é pulado)
  if (params.get("fundo")) {
    const inicio = Date.now();
    const q = corrigirBusca(params.get("fundo")).q;
    const fichas = Math.min(Math.max(parseInt(params.get("fichas"), 10) || 240, 96), 480);
    return Response.json({ fundo: q, ...(await mercadolivre.preparar(q, env, horas, fichas)), segundos: (Date.now() - inicio) / 1000 }, semCache);
  }
  // ?fundas=1: a próxima busca funda (lib/mlFundas.js; fase "fundas" do robô da noite): a que está há mais tempo sem passar.
  // Uma busca por chamada, 60 preços por vez: enquanto vier "continua" a mesma busca é escolhida de novo (só é anotada
  // quando termina). fim = todas em dia (passaram há menos de 20 h) ou de fora por renderem pouco
  if (params.has("fundas")) {
    const inicio = Date.now();
    const [buscadas, prontas, estado] = await Promise.all([termosBuscados(env, 80).catch(() => []), listaDasProntas(env).catch(() => []),
      estadoDasFundas(env.DB)]);
    const termos = listaDasFundas([...buscadas, ...prontas.map((b) => b.q)], (t) => corrigirBusca(t).q, tendenciaAceitavel);
    // &emdia=N: rodada de dia forçada (18/11/2026): conta como "em dia" só a que passou há menos de N horas (padrão 20)
    const emDia = Math.min(Math.max(Number(params.get("emdia")) || 20, 1), 48);
    const { busca, faltam, fracas } = proximaFunda(termos, estado, Date.now(), emDia * 3600e3);
    if (!busca) return Response.json({ fundas: true, partes: termos.length, faltam: 0, fracas, fim: true }, semCache);
    const r = await mercadolivre.preparar(busca, env, horas, FICHAS_FUNDAS);
    const completa = !r.limite && !r.continua;
    if (completa) await anotarFunda(env.DB, busca, r.erro ? null : r.produtos);
    return Response.json({ fundas: true, busca, completa, partes: termos.length, faltam: faltam - (completa ? 1 : 0), fracas,
      fim: completa && faltam <= 1, ...r, segundos: (Date.now() - inicio) / 1000 }, semCache);
  }
  // Só as buscas com termo (as "Ofertas do dia" não têm Mercado Livre)
  // + as tendências do Mercado Livre (o que mais se busca lá; 05/11/2026), no fim da lista: as gerais e as de cada categoria
  // (até 1.500, o 1º de cada categoria primeiro; o que não der tempo fica para a madrugada seguinte)
  // Primeiro a fila: buscas de visitantes em que o ML não veio completo (lib/mlFila.js, 08/11/2026)
  const [fila, prontas, tendencias, dasCategorias] = await Promise.all([filaML(env.DB), listaDasProntas(env), tendenciasML(env).catch(() => []),
    tendenciasDasCategorias(env, 1500)]);
  const termos = [...new Set([...fila.map((t) => corrigirBusca(t).q), ...prontas.map((b) => corrigirBusca(b.q).q),
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
  return Response.json({ parte: i, proxima: i + 1, puladas, partes: termos.length, ...(parte === 0 && { fila: fila.length }),
    fim: i + 1 >= termos.length, busca: termos[i], ...r,
    segundos: (Date.now() - inicio) / 1000 }, semCache);
}
