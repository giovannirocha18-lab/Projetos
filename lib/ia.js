// Categoria dada pela IA (Claude Haiku 5.5) a cada título de produto (pedido do Giovanni, 29/10/2026).
// O robô (robo/ia.mjs) classifica em lote toda madrugada e guarda na tabela ia_categorias; a chave é o título
// normalizado, então vale para qualquer loja (Awin, Shopee, AliExpress, Lomadee) que mande o mesmo título.
import { normalizar } from "./texto.js";

// Trocar quando mudar o pedido feito à IA (lista de categorias, regras): o robô classifica tudo de novo
export const VERSAO_IA = 2;
export const SEM_CATEGORIA = "Outros";
export const chaveIa = (titulo) => normalizar(titulo).slice(0, 160);

export const TABELAS_IA = [
  `CREATE TABLE IF NOT EXISTS ia_categorias (chave TEXT PRIMARY KEY, categoria TEXT NOT NULL, versao INTEGER NOT NULL, quando INTEGER NOT NULL)`,
  // Lote enviado e ainda não lido (o lote leva de minutos a horas; a madrugada seguinte lê o resultado)
  `CREATE TABLE IF NOT EXISTS ia_lotes (id TEXT PRIMARY KEY, criado INTEGER NOT NULL, aberto INTEGER NOT NULL, titulos INTEGER NOT NULL)`,
  // Títulos de cada pedido do lote, na ordem em que foram numerados para a IA
  `CREATE TABLE IF NOT EXISTS ia_pedidos (lote TEXT NOT NULL, pedido TEXT NOT NULL, titulos TEXT NOT NULL, PRIMARY KEY (lote, pedido))`,
];

// Junta a categoria da IA em cada oferta (campo catIa; categoriaTravada em lib/categorias.js usa). Guarda na memória do
// servidor o que já leu do banco. Sem tabela ou banco fora do ar: as ofertas seguem sem catIa (valem as regras)
const lidas = new Map();
const MAX_NA_MEMORIA = 50000;
export async function comCategoriaDaIa(db, ofertas) {
  if (!db || !ofertas?.length) return ofertas;
  const chaves = ofertas.map((o) => chaveIa(o.titulo || ""));
  const faltam = [...new Set(chaves.filter((c) => c && !lidas.has(c)))];
  try {
    for (let i = 0; i < faltam.length; i += 90) {
      const parte = faltam.slice(i, i + 90);
      const { results } = await db.prepare(`SELECT chave, categoria FROM ia_categorias WHERE versao = ? AND chave IN (${parte.map(() => "?").join(",")})`)
        .bind(VERSAO_IA, ...parte).all();
      const achadas = new Map(results.map((r) => [r.chave, r.categoria]));
      if (lidas.size + parte.length > MAX_NA_MEMORIA) lidas.clear();
      for (const c of parte) lidas.set(c, achadas.get(c) || null);
    }
  } catch {
    return ofertas;
  }
  return ofertas.map((o, i) => {
    const catIa = lidas.get(chaves[i]);
    return catIa && catIa !== SEM_CATEGORIA ? { ...o, catIa } : o;
  });
}
