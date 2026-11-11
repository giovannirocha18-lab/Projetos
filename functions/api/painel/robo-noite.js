// GET /api/painel/robo-noite — como está o robô da noite no Cloudflare (lib/roboNoite.js): fase e números de cada trilha.
// ?comecar=1 abre uma rodada manual agora (vale 3 h; ?comecar=categorias = só abrir as 40 categorias, 30 min; o Worker "relógio" precisa estar ligado para andar), ?parar=1 fecha.
// Só no endereço do painel, com o login do Cloudflare Access (lib/painel.js).
import { ehPainel, quemEntrou } from "../../../lib/painel.js";
import { TRILHAS, SO_CATEGORIAS, SO_CASAR, criarTabela, rodadaManual, noiteAtual } from "../../../lib/roboNoite.js";

export async function onRequestGet({ request, env }) {
  const cabecalhos = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
  if (!ehPainel(request.url) || !(await quemEntrou(request, env))) return Response.json({ erro: "acesso negado" }, { status: 403, headers: cabecalhos });
  if (!env.DB) return Response.json({ erro: "sem banco" }, { status: 503, headers: cabecalhos });
  await criarTabela(env.DB);
  const params = new URL(request.url).searchParams;
  const agora = Date.now();
  // Começar/parar só com o endereço digitado (ou favorito) ou vindo do próprio painel (10/11/2026, revisão): um link em
  // outro site ou e-mail, aberto pelo Giovanni conectado, abria uma rodada de 3 h de dia. O navegador avisa a origem do clique
  const origemDoClique = request.headers.get("Sec-Fetch-Site");
  if ((params.has("comecar") || params.has("parar")) && origemDoClique && origemDoClique !== "none" && origemDoClique !== "same-origin") {
    return Response.json({ erro: "abra este endereço digitando-o no navegador (não por um link de outro site)" }, { status: 403, headers: cabecalhos });
  }
  // ?comecar=categorias: rodada curta (30 min) só do passo que abre as 40 categorias
  const soCategorias = params.get("comecar") === "categorias";
  // ?comecar=casar: rodada só do robô de casar produtos (lib/casar.js; 1 h, gasto máximo US$ 4)
  const soCasar = params.get("comecar") === "casar";
  if (params.has("comecar")) {
    await env.DB.prepare("INSERT OR REPLACE INTO robo_noite (trilha, noite, estado, ocupado_ate, atualizado) VALUES ('_manual', ?, '{}', ?, ?)")
      .bind(`${soCategorias ? SO_CATEGORIAS : soCasar ? SO_CASAR : "manual-"}${new Date(agora).toISOString().slice(0, 16)}`, agora + (soCategorias ? 0.5 : soCasar ? 1 : 3) * 3600e3, agora).run();
  }
  if (params.has("parar")) await env.DB.prepare("UPDATE robo_noite SET ocupado_ate = 0 WHERE trilha = '_manual'").run();
  const manual = await rodadaManual(env.DB);
  const linhas = (await env.DB.prepare("SELECT trilha, noite, estado, ocupado_ate, atualizado FROM robo_noite").all()).results || [];
  const trilhas = {};
  for (const l of linhas.filter((x) => TRILHAS.includes(x.trilha))) {
    let e = {};
    try { e = JSON.parse(l.estado); } catch { /* vazio */ }
    trilhas[l.trilha] = { noite: l.noite, fase: e.fase, numeros: e.c, ultimoErro: e.ultimoErro || null,
      atualizado: l.atualizado ? new Date(l.atualizado).toISOString() : null };
  }
  return Response.json({ agora: new Date(agora).toISOString(), noiteValendo: noiteAtual(agora, manual),
    manualAte: manual?.ate > agora ? new Date(manual.ate).toISOString() : null, trilhas }, { headers: cabecalhos });
}
