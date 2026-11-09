// Comissões digitadas no painel (aba Parâmetros, 09/11/2026): Shein e Mercado Livre não têm API de ganhos para afiliados.
// O Giovanni (ou o Claude in Chrome, pelo navegador dele) olha o painel de afiliados de cada uma e digita o total do mês:
// aprovada, pendente e número de pedidos. A aba Comissões soma esses valores com os das redes lidas pela API (lib/comissoes.js).
// Nenhuma senha é guardada: só os números.
const TABELA = `CREATE TABLE IF NOT EXISTS comissoes_manuais (rede TEXT NOT NULL, mes TEXT NOT NULL,
  aprovada REAL NOT NULL DEFAULT 0, pendente REAL NOT NULL DEFAULT 0, pedidos INTEGER NOT NULL DEFAULT 0,
  atualizado INTEGER NOT NULL, PRIMARY KEY (rede, mes))`;
export const REDES_MANUAIS = { shein: "Shein", mercadolivre: "Mercado Livre" };
export const mesValido = (mes) => /^20\d\d-(0[1-9]|1[0-2])$/.test(String(mes || ""));

let pronta = false;
async function criar(db) {
  if (pronta) return;
  await db.prepare(TABELA).run();
  pronta = true;
}

export async function lerManuais(db, mes) {
  if (!db || !mesValido(mes)) return [];
  try {
    await criar(db);
    const { results } = await db.prepare("SELECT rede, mes, aprovada, pendente, pedidos, atualizado FROM comissoes_manuais WHERE mes = ?")
      .bind(mes).all();
    return (results || []).filter((r) => REDES_MANUAIS[r.rede]).map((r) => ({ ...r, nome: REDES_MANUAIS[r.rede] }));
  } catch {
    return [];
  }
}

const valor = (v) => {
  const n = Number(String(v ?? "").replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 && n < 1e7 ? Math.round(n * 100) / 100 : null;
};
export async function gravarManual(db, dados) {
  const rede = String(dados?.rede || "");
  const mes = String(dados?.mes || "");
  const aprovada = valor(dados?.aprovada);
  const pendente = valor(dados?.pendente);
  const pedidos = Math.round(valor(dados?.pedidos) ?? -1);
  if (!REDES_MANUAIS[rede] || !mesValido(mes) || aprovada === null || pendente === null || !(pedidos >= 0)) {
    throw new Error("Valores inválidos: confira a rede, o mês e os números (use só números, ex.: 12,50)");
  }
  await criar(db);
  const atualizado = Date.now();
  await db.prepare(`INSERT INTO comissoes_manuais (rede, mes, aprovada, pendente, pedidos, atualizado) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(rede, mes) DO UPDATE SET aprovada = excluded.aprovada, pendente = excluded.pendente, pedidos = excluded.pedidos,
    atualizado = excluded.atualizado`).bind(rede, mes, aprovada, pendente, pedidos, atualizado).run();
  return { rede, mes, aprovada, pendente, pedidos, atualizado, nome: REDES_MANUAIS[rede] };
}

// Valores digitados como "pedidos" da aba Comissões (um aprovado e um pendente por rede), marcados manual: true
export function comoPedidos(manuais) {
  const dia = (ms) => new Date(ms).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  return manuais.flatMap((m) => [["aprovada", m.aprovada], ["pendente", m.pendente]].filter(([, v]) => v > 0).map(([status, comissao]) => ({
    rede: m.nome, id: `manual-${m.rede}-${status}`, dia: dia(m.atualizado), loja: m.nome,
    produto: `Total do mês digitado no painel (${m.pedidos} ${m.pedidos === 1 ? "pedido" : "pedidos"})`,
    venda: 0, comissao, moeda: "BRL", status, manual: true,
  })));
}
