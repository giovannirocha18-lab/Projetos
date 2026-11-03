// Comissões das 4 redes para o painel do Giovanni (aba Comissões, 03/11/2026). Tudo pelas APIs OFICIAIS, com as chaves
// que o site já usa (nada de raspar painel):
//   Shopee     — GraphQL conversionReport (SHOPEE_APP_ID / SHOPEE_SECRET)
//   AliExpress — aliexpress.affiliate.order.list (ALIEXPRESS_APP_KEY / ALIEXPRESS_APP_SECRET); valores em dólar
//   Awin       — GET /publishers/{conta}/transactions (AWIN_API_TOKEN, o mesmo dos cupons; todas as contas de publisher)
//   Lomadee    — GET /affiliate/orders (LOMADEE_API_KEY; a chave precisa do escopo orders:read)
// Cada rede devolve os pedidos do período num formato só: { rede, id, dia, loja, produto, venda, comissao, moeda, status }
// com status "aprovada" | "pendente" | "cancelada". Se uma rede falhar, as outras aparecem e o erro vai escrito no painel.
import { chamarShopee } from "./fontes/shopee.js";
import { chamar as chamarAliExpress } from "./fontes/aliexpress.js";
import { pedirAwin } from "./cupons.js";
import { pedirLomadee } from "./fontes/lomadee.js";

const FUSO = "America/Sao_Paulo";
const diaBr = (quando) => new Date(quando).toLocaleDateString("sv-SE", { timeZone: FUSO });
const numero = (v) => Number(String(v ?? "").replace(",", ".")) || 0;
const texto = (v, max = 140) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

// Mês "2026-11" -> início e fim em horário de Brasília (o fim nunca passa de agora)
export function periodoDoMes(mes) {
  const [ano, m] = mes.split("-").map(Number);
  const inicio = new Date(`${mes}-01T00:00:00-03:00`);
  const proximo = new Date(`${m === 12 ? ano + 1 : ano}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01T00:00:00-03:00`);
  const fim = new Date(Math.min(proximo.getTime() - 1000, Date.now()));
  return { inicio, fim };
}

// Divide o período em pedaços de até `dias` dias (algumas APIs limitam o intervalo)
function pedacos({ inicio, fim }, dias) {
  const lista = [];
  for (let a = inicio.getTime(); a <= fim.getTime(); a += dias * 864e5) {
    lista.push({ inicio: new Date(a), fim: new Date(Math.min(a + dias * 864e5 - 1000, fim.getTime())) });
  }
  return lista;
}
// "2026-11-03 14:05:00" no horário de Brasília
const dataHoraBr = (d) => d.toLocaleString("sv-SE", { timeZone: FUSO }).replace("T", " ");

// ---------------- Shopee ----------------
function statusShopee(s) {
  const v = String(s || "").toUpperCase();
  if (/CANCEL|INVALID|FAIL|REJECT/.test(v)) return "cancelada";
  if (/COMPLETE|SETTLED|PAID|APPROVED|VALID/.test(v) && !/UNPAID/.test(v)) return "aprovada";
  return "pendente";
}
async function shopee(env, periodo) {
  if (!env.SHOPEE_APP_ID || !env.SHOPEE_SECRET) throw new Error("faltam as chaves da Shopee");
  const ini = Math.floor(periodo.inicio.getTime() / 1000);
  const fim = Math.floor(periodo.fim.getTime() / 1000);
  const pedidos = [];
  let scroll = "";
  for (let pagina = 0; pagina < 20; pagina++) {
    const query = `{ conversionReport(purchaseTimeStart: ${ini}, purchaseTimeEnd: ${fim}, limit: 500${scroll ? `, scrollId: "${scroll}"` : ""}) {
      nodes { purchaseTime conversionId totalCommission
        orders { orderId orderStatus items { shopName itemName itemPrice qty itemTotalCommission displayItemStatus } } }
      pageInfo { hasNextPage scrollId } } }`;
    const dados = (await chamarShopee(env, query)).conversionReport;
    for (const c of dados?.nodes || []) {
      for (const o of c.orders || []) {
        const itens = o.items || [];
        pedidos.push({
          rede: "Shopee",
          id: `shopee-${o.orderId || c.conversionId}`,
          dia: diaBr(Number(c.purchaseTime) * 1000),
          loja: texto(itens[0]?.shopName, 60) || "Shopee",
          produto: texto(itens.map((i) => i.itemName).filter(Boolean).join(" + ")),
          venda: itens.reduce((s, i) => s + numero(i.itemPrice) * (Number(i.qty) || 1), 0),
          comissao: itens.reduce((s, i) => s + numero(i.itemTotalCommission), 0) || (o === c.orders[0] ? numero(c.totalCommission) : 0),
          moeda: "BRL",
          status: statusShopee(o.orderStatus || itens[0]?.displayItemStatus),
        });
      }
    }
    if (!dados?.pageInfo?.hasNextPage || !dados.pageInfo.scrollId) break;
    scroll = dados.pageInfo.scrollId;
  }
  return pedidos;
}

// ---------------- AliExpress ----------------
const STATUS_ALIEXPRESS = ["Payment Completed", "Buyer Confirmed Receipt", "Completed Settlement", "Invalid"];
const CAMPOS_ALIEXPRESS = "order_id,sub_order_id,parent_order_number,product_title,paid_amount,estimated_paid_commission," +
  "estimated_finished_commission,order_status,created_time,paid_time,settled_currency";
async function aliexpress(env, periodo) {
  if (!env.ALIEXPRESS_APP_KEY || !env.ALIEXPRESS_APP_SECRET) throw new Error("faltam as chaves do AliExpress");
  const vistos = new Map();
  for (const parte of pedacos(periodo, 15)) {
    for (const status of STATUS_ALIEXPRESS) {
      for (let pagina = 1; pagina <= 20; pagina++) {
        const r = await chamarAliExpress(env, "aliexpress.affiliate.order.list", {
          start_time: dataHoraBr(parte.inicio), end_time: dataHoraBr(parte.fim), status, fields: CAMPOS_ALIEXPRESS,
          page_no: String(pagina), page_size: "50", locale_site: "global",
        });
        if (r?.resp_code === 405 || !r?.result) break; // 405 = nenhum pedido
        if (r.resp_code !== 200) throw new Error(r.resp_msg || `código ${r.resp_code}`);
        const lista = r.result.orders?.order || [];
        for (const o of lista) {
          const id = `aliexpress-${o.sub_order_id || o.order_id}`;
          const fechada = /Settlement/i.test(o.order_status || status);
          vistos.set(id, {
            rede: "AliExpress",
            id,
            dia: String(o.paid_time || o.created_time || "").slice(0, 10) || diaBr(parte.inicio),
            loja: "AliExpress",
            produto: texto(o.product_title),
            venda: numero(o.paid_amount),
            comissao: numero(fechada ? o.estimated_finished_commission || o.estimated_paid_commission : o.estimated_paid_commission),
            moeda: o.settled_currency || "USD",
            status: /Invalid/i.test(o.order_status || status) ? "cancelada" : fechada ? "aprovada" : "pendente",
          });
        }
        if (lista.length < 50 || pagina >= Number(r.result.total_page_no || 1)) break;
      }
    }
  }
  return [...vistos.values()];
}

// ---------------- Awin ----------------
function statusAwin(s) {
  const v = String(s || "").toLowerCase();
  if (/declined|deleted|rejected/.test(v)) return "cancelada";
  if (/approved|paid/.test(v)) return "aprovada";
  return "pendente";
}
async function awin(env, periodo) {
  if (!env.AWIN_API_TOKEN) throw new Error("falta o AWIN_API_TOKEN");
  const contas = env.AWIN_PUBLISHER_ID
    ? [String(env.AWIN_PUBLISHER_ID)]
    : ((await pedirAwin(env, "/accounts?type=publisher")).accounts || []).map((a) => String(a.accountId)).filter(Boolean);
  if (!contas.length) throw new Error("nenhuma conta de publisher na Awin");
  const pedidos = [];
  for (const conta of contas) {
    const lojas = new Map(((await pedirAwin(env, `/publishers/${conta}/programmes?relationship=joined`).catch(() => [])) || [])
      .map((p) => [String(p.id), texto(p.name, 60).replace(/\s+BR$/i, "")]));
    for (const parte of pedacos(periodo, 30)) {
      const de = dataHoraBr(parte.inicio).replace(" ", "T");
      const ate = dataHoraBr(parte.fim).replace(" ", "T");
      const lista = await pedirAwin(env, `/publishers/${conta}/transactions/?startDate=${de}&endDate=${ate}&timezone=${encodeURIComponent(FUSO)}&dateType=transaction`);
      for (const t of Array.isArray(lista) ? lista : []) {
        pedidos.push({
          rede: "Awin",
          id: `awin-${t.id}`,
          dia: String(t.transactionDate || "").slice(0, 10),
          loja: lojas.get(String(t.advertiserId)) || `Loja ${t.advertiserId}`,
          produto: texto((t.transactionParts || []).map((p) => p.commissionGroupName).filter(Boolean).join(", ")),
          venda: numero(t.saleAmount?.amount),
          comissao: numero(t.commissionAmount?.amount),
          moeda: t.commissionAmount?.currency || "BRL",
          status: statusAwin(t.commissionStatus),
        });
      }
    }
  }
  return pedidos;
}

// ---------------- Lomadee ----------------
function statusLomadee(s) {
  const v = String(s || "").toLowerCase();
  if (/reject|repproved|cancel/.test(v)) return "cancelada";
  if (/approved|paid/.test(v)) return "aprovada";
  return "pendente";
}
async function lomadee(env, periodo) {
  if (!env.LOMADEE_API_KEY) throw new Error("falta a LOMADEE_API_KEY");
  let marcas = new Map();
  try {
    const { results } = await env.DB.prepare("SELECT id, nome FROM marcas_lomadee").all();
    marcas = new Map(results.map((m) => [m.id, m.nome]));
  } catch { /* sem a tabela: mostra o código da marca */ }
  const de = diaBr(periodo.inicio);
  const ate = diaBr(periodo.fim);
  const pedidos = [];
  for (let pagina = 1; pagina <= 20; pagina++) {
    const j = await pedirLomadee(env, `/affiliate/orders?from=${de}&to=${ate}&limit=100&page=${pagina}`);
    for (const linha of j?.data || []) {
      const o = linha?.data && typeof linha.data === "object" && !Array.isArray(linha.data) ? linha.data : linha;
      const itens = o.items || o["items  "] || [];
      pedidos.push({
        rede: "Lomadee",
        id: `lomadee-${o.id || o.orderId}`,
        dia: o.createdAt ? diaBr(o.createdAt) : de,
        loja: marcas.get(o.organizationId) || "Lomadee",
        produto: texto(itens.map((i) => i.name).filter(Boolean).join(" + ")),
        venda: numero(o.value),
        comissao: numero(o.commission),
        moeda: "BRL",
        status: statusLomadee(o.commissionStatus || o.status),
      });
    }
    if (pagina >= Number(j?.meta?.totalPages || 1)) break;
  }
  return pedidos;
}

const REDES = [["Shopee", shopee], ["AliExpress", aliexpress], ["Awin", awin], ["Lomadee", lomadee]];

function comPrazo(promessa, ms, nome) {
  let relogio;
  return Promise.race([
    promessa.finally(() => clearTimeout(relogio)),
    new Promise((_, nao) => { relogio = setTimeout(() => nao(new Error(`${nome} demorou demais para responder`)), ms); }),
  ]);
}

// Junta as 4 redes: pedidos (mais novos primeiro) e o resumo de cada rede
export async function comissoesDoMes(env, mes) {
  const periodo = periodoDoMes(mes);
  if (periodo.fim < periodo.inicio) return { mes, redes: REDES.map(([rede]) => ({ rede, ok: true, pedidos: 0 })), pedidos: [] };
  const resultados = await Promise.allSettled(REDES.map(([nome, fn]) => comPrazo(fn(env, periodo), 25000, nome)));
  const pedidos = [];
  const redes = resultados.map((r, i) => {
    const rede = REDES[i][0];
    if (r.status === "rejected") {
      return { rede, ok: false, erro: texto(String(r.reason?.message || r.reason).replace(/^(Shopee|AliExpress|Awin|Lomadee):?\s*/i, ""), 200) };
    }
    pedidos.push(...r.value);
    return { rede, ok: true, pedidos: r.value.length };
  });
  pedidos.sort((a, b) => b.dia.localeCompare(a.dia));
  return { mes, redes, pedidos };
}
