// /api/robo-noite?trilha=ml|lojas — um passo do robô da noite (lib/roboNoite.js). Chamado sem parar pelo Worker "relógio" do
// Cloudflare (robo/relogio-worker.js) durante a madrugada. Sem ?trilha: diz quais trilhas existem.
// Não tem chave: fora da janela da madrugada (ou de uma rodada manual pedida no painel) não faz nada, e dentro dela cada
// trilha anda um passo por vez (trava no banco) e respeita as esperas; chamar mais vezes não faz o robô gastar mais.
// Os passos chamam as mesmas rotas que o robô do GitHub chamava, aqui dentro, com a chave do robô (CHAVE_ROBO).
import { onRequestGet as prepararML } from "./preparar-ml.js";
import { onRequestGet as prepararBuscas } from "./preparar-buscas.js";
import { onRequestGet as coletarPrecos } from "./coletar-precos.js";
import { onRequestGet as conferirLojas } from "./conferir-lojas.js";
import { onRequestGet as buscar, VERSAO_CACHE } from "./buscar.js";
import { parteDoTeste } from "../../lib/casar.js";
import { TRILHAS, noiteAtual, estadoInicial, passo, gravarNoPainel, criarTabela, rodadaManual } from "../../lib/roboNoite.js";

// Abre uma categoria como o site faz quando o visitante toca nela (atalho=1 = não conta como busca): se a lista pronta
// não existir, a busca vai às lojas e guarda a pronta (buscar.js). Devolve o tempo e quantas ofertas vieram
async function abrirCategoria({ request, env, waitUntil }) {
  const de = new URL(request.url).searchParams;
  const url = new URL(`/api/buscar?v=${VERSAO_CACHE}&q=${encodeURIComponent(de.get("q") || "")}&cat=${encodeURIComponent(de.get("cat") || "")}&atalho=1`, request.url);
  const inicio = Date.now();
  const resposta = await buscar({ request: new Request(url), env, waitUntil });
  const dados = resposta.ok ? await resposta.json() : null;
  return Response.json({ ms: Date.now() - inicio, ofertas: dados?.ofertas?.length || 0, status: resposta.status });
}

// Teste da IA casando produtos (lib/casar.js): as ofertas vêm da própria busca do site (guardada), sem ir às lojas à toa
async function casarTeste({ request, env, waitUntil }) {
  const parte = Number(new URL(request.url).searchParams.get("parte")) || 0;
  const ofertasDaBusca = async (q) => {
    const url = new URL(`/api/buscar?v=${VERSAO_CACHE}&q=${encodeURIComponent(q)}&atalho=1`, request.url);
    const resposta = await buscar({ request: new Request(url), env, waitUntil });
    return resposta.ok ? (await resposta.json()).ofertas || [] : [];
  };
  return Response.json(await parteDoTeste(env, parte, ofertasDaBusca));
}

const ROTAS = { "abrir-categoria": abrirCategoria, "casar-teste": casarTeste, "preparar-ml": prepararML, "preparar-buscas": prepararBuscas, "coletar-precos": coletarPrecos, "conferir-lojas": conferirLojas };
// Trava de cada passo: se o pedido cair no meio (limite do Cloudflare), a trilha fica parada até a trava vencer
const TRAVA_MS = { ml: 150e3, lojas: 6 * 60e3 }; // um passo da Lomadee pode levar até 5 min; os do ML, até ~90 s
const semCache = { headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } };

// Como foram as categorias abertas (só nomes de categoria e tempos: nada reservado), para conferir uma rodada de fora do painel
const categoriasDe = (e) => ({
  ...(e?.c?.catAbertas ? { categorias: { abertas: e.c.catAbertas, total: e.c.catTotal, lentas: e.c.catLentas || [] } } : {}),
  // Teste da IA casando produtos: os pares do último passo (nomes e preços de anúncios públicos) e os totais
  ...(e?.c?.casarPares !== undefined || e?.c?.casarErro ? { casar: { pares: e.ultimosPares || [], respondidos: e.c.casarPares || 0, custoUS: e.c.casarCusto || 0,
    erros: e.c.casarErros || 0, erro: e.c.casarErro || e.c.casarUltimoErro || null } } : {}),
});
const lerEstado = (texto) => { try { return JSON.parse(texto); } catch { return null; } };

export async function onRequest({ request, env, waitUntil }) {
  const agora = Date.now();
  const trilha = new URL(request.url).searchParams.get("trilha");
  if (!env.DB) return Response.json({ erro: "sem banco", fim: true }, semCache);
  await criarTabela(env.DB);
  const noite = noiteAtual(agora, await rodadaManual(env.DB));
  if (!trilha) return Response.json({ trilhas: TRILHAS, noite }, semCache);
  if (!TRILHAS.includes(trilha)) return Response.json({ erro: "trilha desconhecida", fim: true }, { status: 404, ...semCache });
  if (!noite) return Response.json({ trilha, foraDaJanela: true, fim: true }, semCache);
  if (!env.CHAVE_ROBO) return Response.json({ erro: "CHAVE_ROBO não configurada", fim: true }, semCache);

  // Trava: só um passo por trilha de cada vez
  await env.DB.prepare("INSERT OR IGNORE INTO robo_noite (trilha) VALUES (?)").bind(trilha).run();
  const trava = await env.DB.prepare("UPDATE robo_noite SET ocupado_ate = ? WHERE trilha = ? AND ocupado_ate < ?")
    .bind(agora + TRAVA_MS[trilha], trilha, agora).run();
  if (!trava.meta?.changes) return Response.json({ trilha, ocupado: true, esperar: 5 }, semCache);

  const linha = await env.DB.prepare("SELECT noite, estado FROM robo_noite WHERE trilha = ?").bind(trilha).first();
  let e = linha?.noite === noite ? lerEstado(linha.estado) : null;
  const nova = !e;
  if (!e) e = estadoInicial(trilha, agora, noite);
  const salvar = () => env.DB.prepare("UPDATE robo_noite SET noite = ?, estado = ?, ocupado_ate = 0, atualizado = ? WHERE trilha = ?")
    .bind(noite, JSON.stringify(e), Date.now(), trilha).run();

  if (e.fase === "fim" || e.esperaAte > agora) {
    if (nova) await salvar(); else await env.DB.prepare("UPDATE robo_noite SET ocupado_ate = 0 WHERE trilha = ?").bind(trilha).run();
    return Response.json({ trilha, fase: e.fase, fim: e.fase === "fim", esperar: Math.ceil(Math.max(0, e.esperaAte - agora) / 1000), ...categoriasDe(e) }, semCache);
  }

  const outroNome = TRILHAS.find((t) => t !== trilha);
  const outraLinha = await env.DB.prepare("SELECT noite, estado FROM robo_noite WHERE trilha = ?").bind(outroNome).first();
  const outra = outraLinha?.noite === noite ? lerEstado(outraLinha.estado) : null;

  const chamar = async (rota, params) => {
    const url = new URL(`/api/${rota}`, request.url);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
    try {
      const resposta = await ROTAS[rota]({ request: new Request(url, { headers: { Authorization: `Bearer ${env.CHAVE_ROBO}` } }), env, waitUntil });
      return await resposta.json();
    } catch (erro) {
      return { falhou: true, erro: String(erro?.message || erro).slice(0, 200) };
    }
  };

  const faseAntes = e.fase;
  let esperar = 0;
  try {
    esperar = await passo(trilha, e, chamar, agora, outra);
    e.erros = 0;
  } catch (erro) {
    e.erros = (e.erros || 0) + 1;
    e.ultimoErro = String(erro?.message || erro).slice(0, 200);
    esperar = 10;
    // Erro em todo passo: desiste desta noite (o resumo do painel mostra onde parou)
    if (e.erros >= 20) { e.c.parou = `parou: erro 20 vezes seguidas (${e.ultimoErro})`; e.fase = "fim"; }
  }
  e.esperaAte = Date.now() + esperar * 1000;
  // Banco ocupado: tenta de novo (sem gravar, a trava ficaria presa e o passo seria repetido)
  await salvar().catch(() => new Promise((ok) => setTimeout(ok, 1000)).then(salvar));
  // Mudou de fase (ou terminou): atualiza o resumo do painel
  if (e.fase !== faseAntes) {
    const [ml, lojas] = trilha === "ml" ? [e, outra] : [outra, e];
    await gravarNoPainel(env.DB, noite, ml, lojas, Date.now()).catch(() => {});
  }
  return Response.json({ trilha, fase: e.fase, fim: e.fase === "fim", esperar, ...categoriasDe(e) }, semCache);
}
