// GET /api/painel/dados — números do painel do Giovanni (painel.vaiprocarrinho.com.br). Só responde nesse endereço e
// com o login do Cloudflare Access conferido (lib/painel.js; o _middleware.js confere antes, aqui confere de novo).
// Lê do banco o que o site já guarda (as mesmas contas do relatório "Números do site", robo/numeros-site.mjs), dos
// últimos 30 dias. Visitas (Web Analytics) e comissões entram depois.
import { ehPainel, quemEntrou } from "../../../lib/painel.js";

const DIAS = 30;
const hoje = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const diasAtras = (dia, n) => new Date(Date.parse(dia) - n * 864e5).toISOString().slice(0, 10);

export async function onRequestGet({ request, env }) {
  const cabecalhos = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
  if (!ehPainel(request.url) || !(await quemEntrou(request, env))) {
    return Response.json({ erro: "acesso negado" }, { status: 403, headers: cabecalhos });
  }
  if (!env.DB) return Response.json({ erro: "sem banco" }, { status: 503, headers: cabecalhos });
  const dia = hoje();
  const desde = diasAtras(dia, DIAS - 1);
  const semana = diasAtras(dia, 6);
  const semanaMs = Date.now() - 7 * 864e5;
  // Tabela que ainda não existe conta como vazia
  const consulta = (sql, ...params) => env.DB.prepare(sql).bind(...params).all().then((r) => r.results).catch(() => []);
  const [
    buscasDia, topBuscas, cliquesDia, cliquesLoja, cliquesOnde, topProdutos, contas, alertas, carrinhos, prontas, lojasAwin, coletas,
  ] = await Promise.all([
    consulta("SELECT dia, SUM(total) AS n FROM buscas WHERE dia >= ? GROUP BY dia ORDER BY dia", desde),
    consulta("SELECT MAX(texto) AS nome, SUM(total) AS n FROM buscas WHERE dia >= ? GROUP BY termo ORDER BY n DESC LIMIT 15", semana),
    consulta("SELECT dia, SUM(total) AS n FROM cliques WHERE dia >= ? GROUP BY dia ORDER BY dia", desde),
    consulta("SELECT loja AS nome, SUM(total) AS n FROM cliques WHERE dia >= ? GROUP BY loja ORDER BY n DESC LIMIT 15", semana),
    consulta("SELECT onde AS nome, SUM(total) AS n FROM cliques WHERE dia >= ? GROUP BY onde ORDER BY n DESC", semana),
    consulta(`SELECT MAX(titulo) AS nome, MAX(loja) AS loja, SUM(total) AS n FROM cliques_produtos WHERE dia >= ?
      GROUP BY oferta_id ORDER BY n DESC LIMIT 10`, semana),
    consulta("SELECT COUNT(*) AS total, SUM(criado_em >= ?) AS semana FROM usuarios", semanaMs),
    consulta("SELECT COUNT(*) AS total, SUM(criado_em >= ?) AS semana FROM alertas", semanaMs),
    consulta("SELECT COUNT(*) AS total FROM carrinhos WHERE itens NOT IN ('', '[]')"),
    consulta(`SELECT COUNT(*) AS total, MAX(criado) AS ultima FROM buscas_prontas_gz
      WHERE versao = (SELECT MAX(versao) FROM buscas_prontas_gz)`),
    consulta("SELECT nome, produtos AS n FROM lojas_awin ORDER BY produtos DESC"),
    consulta("SELECT MAX(dia) AS dia FROM coletas"),
  ]);
  return Response.json({
    hoje: dia,
    desde,
    buscasDia,
    topBuscas,
    cliquesDia,
    cliquesLoja,
    cliquesOnde,
    topProdutos,
    contas: { total: contas[0]?.total || 0, semana: contas[0]?.semana || 0 },
    alertas: { total: alertas[0]?.total || 0, semana: alertas[0]?.semana || 0 },
    carrinhos: carrinhos[0]?.total || 0,
    prontas: { total: prontas[0]?.total || 0, ultima: prontas[0]?.ultima || null },
    lojasAwin,
    ultimaColeta: coletas[0]?.dia || null,
  }, { headers: cabecalhos });
}
