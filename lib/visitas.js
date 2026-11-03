// Visitas do site para o painel do Giovanni (03/11/2026). Vêm do Cloudflare Web Analytics (ligado em 03/11, sem cookie),
// pela API GraphQL do Cloudflare (conjunto rumPageloadEventsAdaptiveGroups). Precisa de:
//   CF_ANALYTICS_TOKEN (Secret do Pages): token com a permissão "Account → Account Analytics → Read"
//   CF_ACCOUNT_ID (variável Text do Pages): o Account ID da conta
// Conta só o endereço da loja (vaiprocarrinho.com.br), não o do painel. Datas em UTC (o Web Analytics agrupa assim).
const HOST_LOJA = "vaiprocarrinho.com.br";

const CONSULTA = `query ($conta: string!, $desde: Date!, $ate: Date!, $semana: Date!, $host: string!) {
  viewer {
    accounts(filter: { accountTag: $conta }) {
      porDia: rumPageloadEventsAdaptiveGroups(limit: 100, orderBy: [date_ASC],
        filter: { date_geq: $desde, date_leq: $ate, requestHost: $host }) {
        count
        sum { visits }
        dimensions { date }
      }
      origens: rumPageloadEventsAdaptiveGroups(limit: 10, orderBy: [sum_visits_DESC],
        filter: { date_geq: $semana, date_leq: $ate, requestHost: $host }) {
        sum { visits }
        dimensions { refererHost }
      }
      aparelhos: rumPageloadEventsAdaptiveGroups(limit: 5, orderBy: [sum_visits_DESC],
        filter: { date_geq: $semana, date_leq: $ate, requestHost: $host }) {
        sum { visits }
        dimensions { deviceType }
      }
    }
  }
}`;

const APARELHOS = { mobile: "Celular", desktop: "Computador", tablet: "Tablet" };

// Nome amigável de onde a pessoa veio
function origem(host) {
  const h = String(host || "").toLowerCase().replace(/^www\./, "");
  if (!h) return "Direto (digitou ou link salvo)";
  if (h === HOST_LOJA || h.endsWith(`.${HOST_LOJA}`)) return "O próprio site";
  if (/(^|\.)google\./.test(h)) return "Google";
  if (/whatsapp|wa\.me/.test(h)) return "WhatsApp";
  if (/instagram/.test(h)) return "Instagram";
  if (/facebook|fb\.com/.test(h)) return "Facebook";
  if (/(^|\.)bing\./.test(h)) return "Bing";
  if (/t\.co$|twitter|x\.com/.test(h)) return "X (Twitter)";
  if (/tiktok/.test(h)) return "TikTok";
  return h;
}

// Junta linhas que viraram o mesmo nome (ex.: google.com e google.com.br)
function somar(linhas, nome) {
  const mapa = new Map();
  for (const l of linhas) {
    const n = nome(l);
    mapa.set(n, (mapa.get(n) || 0) + (l.sum?.visits || 0));
  }
  return [...mapa].map(([nome, n]) => ({ nome, n })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n);
}

export async function visitasDoSite(env, { desde, ate, semana }) {
  if (!env.CF_ANALYTICS_TOKEN || !env.CF_ACCOUNT_ID) {
    return { erro: `falta ${[!env.CF_ANALYTICS_TOKEN && "CF_ANALYTICS_TOKEN", !env.CF_ACCOUNT_ID && "CF_ACCOUNT_ID"].filter(Boolean).join(" e ")} no Pages` };
  }
  try {
    const r = await fetch("https://api.cloudflare.com/client/v4/graphql", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.CF_ANALYTICS_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: CONSULTA, variables: { conta: env.CF_ACCOUNT_ID.trim(), desde, ate, semana, host: HOST_LOJA } }),
    });
    const json = await r.json().catch(() => ({}));
    if (!r.ok || json.errors?.length) {
      const msg = json.errors?.[0]?.message || `o Cloudflare respondeu ${r.status}`;
      return { erro: /auth|permission|not authorized|access/i.test(msg) ? `a chave não tem permissão (${msg})` : msg };
    }
    const conta = json.data?.viewer?.accounts?.[0];
    if (!conta) return { erro: "Account ID não encontrado (confira o CF_ACCOUNT_ID)" };
    return {
      porDia: (conta.porDia || []).map((l) => ({ dia: l.dimensions.date, n: l.sum?.visits || 0, paginas: l.count || 0 })),
      origens: somar(conta.origens || [], (l) => origem(l.dimensions.refererHost)).slice(0, 8),
      aparelhos: somar(conta.aparelhos || [], (l) => APARELHOS[l.dimensions.deviceType] || l.dimensions.deviceType || "Outro"),
    };
  } catch (e) {
    return { erro: `não foi possível falar com o Cloudflare (${e.message})` };
  }
}
