// Resumo de cada execução do robô para o painel do Giovanni (aba "Robô"; pedido de 03/11/2026).
// Roda no último job do robo-precos.yml ("relatorio"), depois de todos os outros, mesmo se algum falhar. Junta:
//   - o que cada passo anotou com paraPainel() (robo/painel.mjs), que chega aqui pelas saídas dos jobs (NEEDS);
//   - se cada job deu certo, e quando começou/terminou (API do GitHub, com o GITHUB_TOKEN da própria execução);
// e grava uma linha na tabela robo_execucoes do banco (guarda as 90 mais novas). O painel lê em /api/painel/dados.
// Uso (só no GitHub Actions): node robo/relatorio.mjs
//   (precisa de NEEDS, ENTRADAS, GITHUB_TOKEN, CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID e D1_DATABASE_ID)

// [job, chave da saída, título no painel], na ordem em que aparecem
export const PARTES = [
  ["awin", "awin", "Preços das lojas (Awin)"],
  ["awin", "alertas", "Alertas de preço"],
  ["shopee", "shopee", "Preços da Shopee"],
  ["mercadolivre", "ml", "Preços do Mercado Livre"],
  ["prontas", "prontas", "Buscas prontas"],
  ["lomadee", "lomadee", "Marcas da Lomadee"],
  ["ia", "ia", "IA: categorias dos produtos"],
  ["ia", "marcas", "Sugestões produto + marca"],
  ["auditoria", "auditoria", "Auditoria da busca"],
  ["auditoria", "lojas", "Lojas nas buscas"],
  ["auditoria", "ia_buscas", "IA conferindo as buscas"],
  ["auditoria", "caminhos", "Categorias das lojas"],
  ["auditoria", "variacoes", "Tamanhos repetidos (variações)"],
];
const PESO = { ok: 0, aviso: 1, erro: 2 };
const lerJson = (texto, padrao) => { try { return JSON.parse(texto); } catch { return padrao; } };

// needs = { awin: { result, outputs: { awin: "{…}", awin_ok: "success" } }, … }
export function montarPartes(needs, jobs = []) {
  const partes = [];
  for (const [job, chave, titulo] of PARTES) {
    const j = needs[job];
    if (!j || j.result === "skipped") continue;
    const saida = lerJson(j.outputs?.[chave], null);
    const passo = j.outputs?.[`${chave}_ok`] || ""; // success / failure / skipped / cancelled ("" = não chegou a rodar)
    const avisos = [...(saida?.avisos || [])];
    let situacao = "ok";
    if (passo === "failure" || (!passo && j.result === "failure")) {
      situacao = "erro";
      avisos.unshift("Deu erro (ver o resumo no GitHub)");
    } else if (j.result === "cancelled" || passo === "cancelled") {
      situacao = "erro";
      avisos.unshift("Parou no meio (passou do tempo ou foi cancelado)");
    } else if (passo === "skipped" || (!passo && j.result !== "success")) {
      situacao = "erro";
      avisos.unshift("Não rodou (um passo anterior deu erro)");
    } else if (avisos.length) situacao = "aviso";
    const info = jobs.find((x) => x.name === job);
    partes.push({
      chave, titulo, situacao,
      linhas: saida?.linhas?.length ? saida.linhas : situacao === "ok" ? ["Rodou (sem resumo)"] : [],
      avisos,
      minutos: info?.started_at && info?.completed_at ? Math.round((Date.parse(info.completed_at) - Date.parse(info.started_at)) / 6e4) : null,
    });
  }
  return partes;
}

// Modo da execução: "madrugada" (agendada), o "so_…" escolhido no Run workflow, ou "completo" (Run workflow sem nada marcado)
export function modoDa(evento, entradas) {
  if (evento === "schedule") return "madrugada";
  const so = Object.entries(entradas || {}).filter(([k, v]) => k.startsWith("so_") && (v === true || v === "true")).map(([k]) => k);
  return so.join(",") || "completo";
}

async function main() {
  const env = process.env;
  const needs = lerJson(env.NEEDS, {});
  const entradas = lerJson(env.ENTRADAS, {});
  const api = `https://api.github.com/repos/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`;
  const github = async (url) => {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json" } });
    if (!r.ok) throw new Error(`GitHub respondeu ${r.status}`);
    return r.json();
  };
  let execucao = {};
  let jobs = [];
  try {
    [execucao, { jobs }] = await Promise.all([github(api), github(`${api}/jobs?per_page=50`)]);
  } catch (e) {
    console.log(`Não deu para ler os horários no GitHub: ${e.message}`);
  }
  const partes = montarPartes(needs, jobs);
  const situacao = partes.reduce((pior, p) => (PESO[p.situacao] > PESO[pior] ? p.situacao : pior), "ok");
  const inicio = Date.parse(execucao.run_started_at || execucao.created_at) || Date.now();
  // Atraso do GitHub: o robô está marcado para 04:30 UTC (01:30 de Brasília); o GitHub costuma começar horas depois
  const criado = Date.parse(execucao.created_at) || inicio;
  const marcado = new Date(criado).setUTCHours(4, 30, 0, 0);
  const evento = env.GITHUB_EVENT_NAME || execucao.event || "";
  const dados = {
    partes,
    atrasoMin: evento === "schedule" ? Math.max(0, Math.round((criado - marcado) / 6e4)) : null,
    link: `${env.GITHUB_SERVER_URL || "https://github.com"}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`,
  };
  const linha = [Number(env.GITHUB_RUN_ID) || Date.now(), Number(execucao.run_number || env.GITHUB_RUN_NUMBER) || 0, evento,
    modoDa(evento, entradas), inicio, Date.now(), situacao, JSON.stringify(dados)];
  console.log(JSON.stringify({ situacao, modo: linha[3], partes: partes.map((p) => `${p.titulo}: ${p.situacao}`) }, null, 1));

  const { CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: conta, D1_DATABASE_ID: banco } = env;
  if (!token || !conta || !banco) {
    console.log("Faltam os segredos do Cloudflare: resumo não gravado");
    return;
  }
  const d1 = async (sql, params = []) => {
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${conta}/d1/database/${banco}/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ sql, params }),
    });
    const json = await r.json().catch(() => ({}));
    if (!r.ok || !json.success) throw new Error(`D1 respondeu ${r.status}: ${JSON.stringify(json.errors || json).slice(0, 300)}`);
  };
  await d1(`CREATE TABLE IF NOT EXISTS robo_execucoes (id INTEGER PRIMARY KEY, numero INTEGER, evento TEXT, modo TEXT,
    inicio INTEGER, fim INTEGER, situacao TEXT, dados TEXT)`);
  await d1("INSERT OR REPLACE INTO robo_execucoes (id, numero, evento, modo, inicio, fim, situacao, dados) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", linha);
  await d1("DELETE FROM robo_execucoes WHERE id NOT IN (SELECT id FROM robo_execucoes ORDER BY inicio DESC LIMIT 90)");
  console.log("Resumo gravado no banco (aparece no painel, aba Robô)");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(`ERRO: ${e.message}`);
    process.exit(1);
  });
}
