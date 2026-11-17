// Buscas fundas do Mercado Livre (17/11/2026, print do Giovanni: "smartphone samsung" com 24 produtos do ML; "pode aumentar;
// se necessário reestruture o robô do ML"). O ML só nos dá o catálogo (uma ficha por modelo) e cada preço custa uma consulta,
// então não cabe em todas as ~1.900 buscas da noite: nestas (as mais procuradas) o robô pede até FICHAS_FUNDAS fichas e o
// preço de TODAS (fase "fundas" da trilha ml em lib/roboNoite.js, /api/preparar-ml?fundas=1). As outras seguem com 96 fichas
// e 24 com preço. Ordem = prioridade (a fase para pelo relógio); depois da lista vêm as mais buscadas no site e as buscas prontas.
// Para incluir uma busca: pôr na lista.
export const FICHAS_FUNDAS = 240;
export const BUSCAS_FUNDAS = [
  "celular", "smartphone", "celular samsung", "smartphone samsung", "iphone", "celular motorola", "celular xiaomi",
  "notebook", "smart tv", "geladeira", "fogão", "máquina de lavar", "micro-ondas", "air fryer", "ar condicionado",
  "fone bluetooth", "smartwatch", "tablet", "monitor", "impressora", "ventilador", "aspirador de pó", "cafeteira",
  "liquidificador", "furadeira", "parafusadeira", "caixa de som", "ps5", "xbox", "nintendo switch", "tênis", "tênis nike",
  "perfume", "mochila", "cadeira gamer", "colchão", "sofá", "guarda-roupa", "bicicleta", "relógio", "smart tv 50",
  "smart tv 55", "notebook gamer", "samsung galaxy", "iphone 16", "iphone 15", "lava e seca", "freezer", "cooktop",
  "purificador de água", "panela de pressão", "ração", "whey protein", "creatina", "fralda", "carrinho de bebê",
];
// Tamanho da lista da noite (17/11/2026, Giovanni: "pode aumentar"; cada busca custa ~150 consultas ao ML, sem esperas)
export const TOTAL_DE_FUNDAS = 300;

// A lista da noite: as fixas, as mais buscadas no site e depois as buscas prontas, na ordem delas (sem repetir), até o total.
// corrigir = corrigirBusca(...).q; aceita = filtro das tendências
export function listaDasFundas(outras = [], corrigir = (t) => t, aceita = () => true, total = TOTAL_DE_FUNDAS) {
  const vistos = new Set();
  const lista = [];
  for (const t of [...BUSCAS_FUNDAS, ...outras.filter(aceita)]) {
    if (lista.length >= total) break;
    const q = corrigir(String(t || "").trim().toLowerCase());
    if (q.length < 3 || vistos.has(q)) continue;
    vistos.add(q);
    lista.push(q);
  }
  return lista;
}
