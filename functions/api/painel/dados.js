// GET /api/painel/dados — números do painel do Giovanni (painel.vaiprocarrinho.com.br). Só responde nesse endereço e
// com o login do Cloudflare Access conferido (lib/painel.js; o _middleware.js confere antes, aqui confere de novo).
// Lê do banco o que o site já guarda (as mesmas contas do relatório "Números do site", robo/numeros-site.mjs), dos
// últimos 30 dias, as visitas do Web Analytics do Cloudflare (lib/visitas.js) e o resumo das execuções do robô
// (tabela robo_execucoes, gravada por robo/relatorio.mjs). As comissões vêm de /api/painel/comissoes.
import { ehPainel, quemEntrou } from "../../../lib/painel.js";
import { visitasDoSite } from "../../../lib/visitas.js";

const DIAS = 30;
const hoje = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const diasAtras = (dia, n) => new Date(Date.parse(dia) - n * 864e5).toISOString().slice(0, 10);

// Os 7 dias de [desde, ate] com o número de cada dia (dia sem nada = 0)
function serie(linhas, desde, ate) {
  const dias = [];
  for (let d = desde; d <= ate; d = diasAtras(d, -1)) dias.push(linhas.filter((l) => l.dia === d).reduce((s, l) => s + l.n, 0));
  return dias;
}

export async function onRequestGet({ request, env }) {
  const cabecalhos = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
  if (!ehPainel(request.url) || !(await quemEntrou(request, env))) {
    return Response.json({ erro: "acesso negado" }, { status: 403, headers: cabecalhos });
  }
  if (!env.DB) return Response.json({ erro: "sem banco" }, { status: 503, headers: cabecalhos });
  const dia = hoje();
  const desde = diasAtras(dia, DIAS - 1);
  const semana = diasAtras(dia, 6);
  const duasSemanas = diasAtras(dia, 13);
  const semanaMs = Date.now() - 7 * 864e5;
  // Tabela que ainda não existe conta como vazia
  const consulta = (sql, ...params) => env.DB.prepare(sql).bind(...params).all().then((r) => r.results).catch(() => []);
  const [
    buscasDia, topBuscas, cliquesDia, cliquesLoja, cliquesOnde, topProdutos, contas, alertas, carrinhos, prontas, lojasAwin, coletas, visitas,
    robo,
  ] = await Promise.all([
    consulta("SELECT dia, SUM(total) AS n FROM buscas WHERE dia >= ? GROUP BY dia ORDER BY dia", desde),
    consulta("SELECT termo, MAX(texto) AS nome, SUM(total) AS n FROM buscas WHERE dia >= ? GROUP BY termo ORDER BY n DESC LIMIT 15", semana),
    consulta("SELECT dia, SUM(total) AS n FROM cliques WHERE dia >= ? GROUP BY dia ORDER BY dia", desde),
    consulta("SELECT loja AS nome, dia, SUM(total) AS n FROM cliques WHERE dia >= ? GROUP BY loja, dia", duasSemanas),
    consulta("SELECT onde AS nome, SUM(total) AS n FROM cliques WHERE dia >= ? GROUP BY onde ORDER BY n DESC", semana),
    consulta(`SELECT MAX(titulo) AS nome, MAX(loja) AS loja, SUM(total) AS n FROM cliques_produtos WHERE dia >= ?
      GROUP BY oferta_id ORDER BY n DESC LIMIT 10`, semana),
    consulta("SELECT COUNT(*) AS total, SUM(criado_em >= ?) AS semana FROM usuarios", semanaMs),
    consulta("SELECT COUNT(*) AS total, SUM(criado_em >= ?) AS semana FROM alertas", semanaMs),
    consulta("SELECT COUNT(*) AS total FROM carrinhos WHERE itens NOT IN ('', '[]')"),
    consulta(`SELECT COUNT(*) AS total, MAX(criado) AS ultima, SUM(criado >= ?) AS recentes FROM buscas_prontas_gz
      WHERE versao = (SELECT MAX(versao) FROM buscas_prontas_gz)`, Date.now() - 30 * 36e5),
    consulta("SELECT nome, produtos AS n FROM lojas_awin ORDER BY produtos DESC"),
    consulta("SELECT MAX(dia) AS dia FROM coletas"),
    visitasDoSite(env, { desde, ate: dia, semana }),
    // Resumo das execuções do robô (robo/relatorio.mjs grava no fim de cada uma): aba Robô
    consulta("SELECT id, numero, evento, modo, inicio, fim, situacao, dados FROM robo_execucoes ORDER BY inicio DESC LIMIT 20"),
  ]);
  // Mais buscados: dia a dia das últimas 2 semanas (mini-gráfico e comparação com a semana anterior)
  const termos = topBuscas.map((t) => t.termo);
  const diasDosTermos = termos.length
    ? await consulta(`SELECT termo, dia, SUM(total) AS n FROM buscas WHERE dia >= ? AND termo IN (${termos.map(() => "?").join(",")})
        GROUP BY termo, dia`, duasSemanas, ...termos)
    : [];
  const emAlta = topBuscas.map(({ termo, nome, n }) => {
    const linhas = diasDosTermos.filter((l) => l.termo === termo);
    return { nome, n, antes: linhas.filter((l) => l.dia < semana).reduce((s, l) => s + l.n, 0), serie: serie(linhas, semana, dia) };
  });
  // Cliques por loja: total da semana, semana anterior e dia a dia
  const porLoja = new Map();
  for (const l of cliquesLoja) {
    if (!porLoja.has(l.nome)) porLoja.set(l.nome, []);
    porLoja.get(l.nome).push(l);
  }
  const lojas = [...porLoja].map(([nome, linhas]) => ({
    nome,
    n: linhas.filter((l) => l.dia >= semana).reduce((s, l) => s + l.n, 0),
    antes: linhas.filter((l) => l.dia < semana).reduce((s, l) => s + l.n, 0),
    serie: serie(linhas, semana, dia),
  })).filter((l) => l.n || l.antes).sort((a, b) => b.n - a.n || b.antes - a.antes).slice(0, 15);
  return Response.json({
    hoje: dia,
    desde,
    buscasDia,
    topBuscas: emAlta,
    cliquesDia,
    cliquesLoja: lojas,
    cliquesOnde,
    topProdutos,
    contas: { total: contas[0]?.total || 0, semana: contas[0]?.semana || 0 },
    alertas: { total: alertas[0]?.total || 0, semana: alertas[0]?.semana || 0 },
    carrinhos: carrinhos[0]?.total || 0,
    prontas: { total: prontas[0]?.total || 0, recentes: prontas[0]?.recentes || 0, ultima: prontas[0]?.ultima || null },
    lojasAwin,
    ultimaColeta: coletas[0]?.dia || null,
    visitas,
    robo: robo.map(({ dados, ...r }) => ({ ...r, ...(() => { try { return JSON.parse(dados); } catch { return {}; } })() })),
  }, { headers: cabecalhos });
}
