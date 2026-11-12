// =====================================================================
// BUSCAS EM ALTA — conta quantas vezes cada termo foi buscado por dia
// (só o termo e o total; nada sobre quem buscou) e devolve os mais
// buscados da semana para os atalhos abaixo da busca.
// Cada pessoa conta 1 vez por termo por dia: repetir a mesma busca 100 vezes
// não põe um termo nos "em alta" (ver registrarBusca).
// =====================================================================
import { normalizar } from "./texto.js";
import { resumo } from "./resumos.js";

const DIAS_SEMANA = 7;
const GUARDAR_DIAS = 30;
const MINIMO_BUSCAS = 3; // um termo só entra em alta depois de buscado por algumas pessoas
const QUANTIDADE = 8;

// Termos que nunca aparecem nos atalhos, mesmo que muito buscados
export const BLOQUEADOS = /\b(sexo|sexy|sex shop|porn\w*|nudes?|erotic\w*|xxx|vibrador\w*|camisinhas?|preservativos?|armas?|drogas?|maconha|vapes?|pods?|cigarros?)\b/;

// Tendências do Mercado Livre (05/11/2026): além dos BLOQUEADOS, remédios de receita, anabolizantes e "peptídeos"
// injetáveis, sex shop, fumo/vape, jogos de azar, armas/explosivos, bebidas, réplicas/falsificados e pirataria, que aparecem
// entre os mais buscados de lá e não devem virar sugestão nem busca pronta no site (conferido na 1ª lista, 05/11/2026)
const BLOQUEADOS_TENDENCIAS = new RegExp(String.raw`\b(masteron|tesamorelin\w*|peptide\w*|peptideo\w*|anaboliz\w*|testosteron\w*|oxandrolon\w*|durateston|stanozolol|trembolon\w*|injetave(l|is)|ozempic|mounjaro|tirzepatid\w*|semaglutid\w*|retatrutid\w*|sildenafil\w*|tadalafil\w*|viagra|lubrificantes? intimo\w*|ltda|pistolas?|espingardas?|revolver\w*|municao|municoes|simulacros?` + String.raw`|sex\w*shop\w*|sexy\w*|consolos?|penian\w*|penis|masturb\w*|anal|poppers|lubrificante\w*|vaper\w*|narguil\w*|tabacos?|fumos?|sedas?|bongs?|canabidiol|cbd|kratom|cassinos?|apostas?|explosiv\w*|arminhas?|bombinhas?|rojao|rojoes|fogos de artificio|seringas?|anabol\w*|hormonios?|emagrecedor\w*|sibutramina|bebidas?|replica\w*|primeira linha|falsos?|falsas?|desbloquead\w*|essencias?|iptv|playboy|onlyfans|sensua\w*|eroti\w*` + String.raw`|cervejas?|chopp?s?|whisk(?:y|ey|ies)|vodkas?|gin|cachacas?|fernet|tequilas?|licor(?:es)?|espumantes?|champagnes?|conhaques?|absinto|jagermeister|catuaba|campari|aperol|saque|vinhos? (?:tinto|branco|rose|suave|seco|seleção|selecao)\w*|kit vinhos?`
  // 06/11/2026 (robô #123: "videos paola oliveira nua", "filhote de mico", "insetos vivos" e "airsoft" viraram buscas prontas):
  // nudez, animais vivos, réplicas de arma e bloqueador de sinal (proibido pela Anatel)
  // Para bloquear outro termo: acrescentar aqui (palavra inteira, sem acento) e um caso em testes/sugestoes.mjs
  + String.raw`|nua|nuas|pelad[ao]s?|pornografi\w*|filhotes?|insetos? vivos?|animais vivos?|airsoft|airgun|bloqueador(?:es)? (?:de )?(?:sinal|bluetooth|celular|gps)|jamm?er)\b`);
// Termos soltos demais para virar sugestão
const GENERICOS = new Set(["produtos", "produto", "ofertas", "oferta", "promocao", "promocoes", "mercado livre", "mercadolivre",
  "frete gratis", "shopee", "amazon", "magalu", "presente", "presentes", "kit", "novo", "usado"]);
export function tendenciaAceitavel(texto) {
  const t = normalizar(texto);
  return t.length >= 3 && t.length <= 40 && /[a-z]{3}/.test(t) && !GENERICOS.has(t) && !BLOQUEADOS.test(t) && !BLOQUEADOS_TENDENCIAS.test(t);
}

// Termos que saíram dos atalhos (contados quando cliques em atalhos antigos ainda viravam busca)
const FORA_DOS_ATALHOS = new Set(["roupas", "roupa", "attracione men", "boneca"]); // boneca: buscas de teste (30/10/2026)

const TABELA = `CREATE TABLE IF NOT EXISTS buscas (
  termo TEXT NOT NULL,
  dia TEXT NOT NULL,
  total INTEGER NOT NULL,
  texto TEXT NOT NULL,
  PRIMARY KEY (termo, dia)) WITHOUT ROWID`;

// Quem já contou cada termo hoje: só uma marca curta (dia + 6 letras de um resumo de IP+termo+dia).
// O IP não é guardado e a marca não volta a ele (6 letras = 16 milhões de valores, muitos IPs dão a mesma);
// as marcas de ontem são apagadas.
const TABELA_MARCAS = "CREATE TABLE IF NOT EXISTS buscas_marcas (marca TEXT PRIMARY KEY) WITHOUT ROWID";

let tabelaPronta = false;
async function banco(env) {
  if (!env.DB) return null;
  if (!tabelaPronta) {
    await env.DB.batch([env.DB.prepare(TABELA), env.DB.prepare(TABELA_MARCAS)]);
    tabelaPronta = true;
  }
  return env.DB;
}

async function marcaDoDia(ip, termo, dia) {
  // IPv6: a pessoa costuma ter um bloco inteiro (/64), então vale só o começo do endereço
  const rede = ip.includes(":") ? ip.split(":").slice(0, 4).join(":") : ip;
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${rede}|${termo}|${dia}`));
  return `${dia}:${[...new Uint8Array(hash).slice(0, 3)].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

const hoje = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const diasAtras = (n) => new Date(Date.parse(hoje()) - n * 864e5).toISOString().slice(0, 10);

// Só conta buscas que trouxeram ofertas, com tamanho de termo razoável, uma vez por pessoa (IP) por dia
export async function registrarBusca(env, q, ip) {
  const termo = normalizar(q); // sem acento, para "Tênis" e "tenis" contarem juntos
  const texto = q.trim().replace(/\s+/g, " ").toLowerCase(); // como a pessoa escreveu, para mostrar
  if (termo.length < 3 || termo.length > 40 || BLOQUEADOS.test(termo)) return;
  const db = await banco(env);
  if (!db) return;
  const dia = hoje();
  if (ip) {
    // RETURNING só devolve a linha se ela foi criada agora: se já existia, esta pessoa já contou hoje
    const nova = await db.prepare("INSERT OR IGNORE INTO buscas_marcas (marca) VALUES (?) RETURNING marca")
      .bind(await marcaDoDia(ip, termo, dia)).first();
    if (!nova) return;
  }
  await db.batch([
    db.prepare(
      `INSERT INTO buscas (termo, dia, total, texto) VALUES (?, ?, 1, ?)
       ON CONFLICT (termo, dia) DO UPDATE SET total = total + 1, texto = excluded.texto`,
    ).bind(termo, dia, texto),
    // Faxina de vez em quando: apaga o que tem mais de 30 dias e as marcas de dias anteriores
    ...(Math.random() < 0.01 ? [db.prepare("DELETE FROM buscas WHERE dia < ?").bind(diasAtras(GUARDAR_DIAS)),
      db.prepare("DELETE FROM buscas_marcas WHERE marca < ?").bind(dia)] : []),
  ]);
}

// ---------------------------------------------------------------------
// BUSCAS SEM O PRODUTO À VENDA (12/11/2026, print do Giovanni: o site sugeria "xiaomi 18 pro", tendência do Mercado Livre, e
// nenhuma loja vende o celular ainda; só capas). Quando uma busca traz ofertas mas nenhuma é o produto (só acessórios e
// parecidos), o termo fica anotado por 3 dias e /api/vocabulario não o sugere entre as tendências. Enquanto continuar sem o
// produto, cada busca nova (de visitante ou do robô das prontas) renova a anotação; quando uma loja passar a vender, ele
// deixa de ser anotado e volta às sugestões em até 3 dias.
// ---------------------------------------------------------------------
const TABELA_SEM_PRODUTO = "CREATE TABLE IF NOT EXISTS buscas_sem_produto (termo TEXT PRIMARY KEY, quando INTEGER NOT NULL) WITHOUT ROWID";
export const SEM_PRODUTO_MS = 3 * 864e5;
export const semProdutoAVenda = (ofertas) => ofertas.length >= 5 && !ofertas.some((o) => o.bate && !o.acessorio);
export async function anotarSemProduto(env, q, agora = Date.now()) {
  const termo = normalizar(q);
  if (!env.DB || termo.length < 3 || termo.length > 60) return;
  await env.DB.batch([
    env.DB.prepare(TABELA_SEM_PRODUTO),
    env.DB.prepare("INSERT INTO buscas_sem_produto (termo, quando) VALUES (?, ?) ON CONFLICT (termo) DO UPDATE SET quando = excluded.quando").bind(termo, agora),
    ...(Math.random() < 0.02 ? [env.DB.prepare("DELETE FROM buscas_sem_produto WHERE quando < ?").bind(agora - SEM_PRODUTO_MS)] : []),
  ]);
}
// Os termos anotados que ainda valem (normalizados)
export async function termosSemProduto(env, agora = Date.now()) {
  if (!env.DB) return new Set();
  try {
    const { results } = await env.DB.prepare("SELECT termo FROM buscas_sem_produto WHERE quando > ? LIMIT 5000").bind(agora - SEM_PRODUTO_MS).all();
    return new Set(results.map((r) => r.termo));
  } catch { return new Set(); } // a tabela nasce na 1ª anotação
}

// Os mais buscados dos últimos 7 dias (lista vazia se ainda não há dados).
// ateOntem = sem contar hoje: a lista fica igual o dia todo (a coleta de preços divide as buscas em partes)
// A conta fica pronta na tabela resumos por 1 hora: o robô pedia a lista a cada busca preparada e cada vez lia
// todas as buscas da semana (1,8 milhão de leituras num dia com a lista de 30 dias, 22/10/2026)
const VALIDADE_LISTA_MS = 3600 * 1000;

export async function maisBuscados(env, { ateOntem = false } = {}) {
  const db = await banco(env);
  if (!db) return [];
  const chave = `mais-buscados:${ateOntem ? hoje() : "hoje"}`;
  // Filtra de novo na leitura: a lista guardada (até 1 h) pode ser de antes de um termo entrar em FORA_DOS_ATALHOS
  const lista = await resumo(db, chave, VALIDADE_LISTA_MS, () => contarMaisBuscados(db, ateOntem));
  return lista.filter((t) => !FORA_DOS_ATALHOS.has(normalizar(t)));
}

async function contarMaisBuscados(db, ateOntem) {
  const { results } = await db.prepare(
    `SELECT termo, MAX(texto) AS texto, SUM(total) AS vezes FROM buscas WHERE dia >= ? AND dia < ?
     GROUP BY termo HAVING vezes >= ? ORDER BY vezes DESC, termo LIMIT ?`,
  ).bind(diasAtras(DIAS_SEMANA), ateOntem ? hoje() : "9999", MINIMO_BUSCAS, QUANTIDADE).all();
  return results.filter((r) => !BLOQUEADOS.test(r.termo) && !FORA_DOS_ATALHOS.has(r.termo)).map((r) => r.texto);
}

// Termos buscados no site nos últimos 30 dias, por pelo menos 2 pessoas (sugestões da caixa de busca)
export async function termosBuscados(env, limite = 300) {
  const db = await banco(env);
  if (!db) return [];
  return resumo(db, `termos-buscados:${limite}`, VALIDADE_LISTA_MS, () => contarTermosBuscados(db, limite));
}

async function contarTermosBuscados(db, limite) {
  const { results } = await db.prepare(
    `SELECT termo, MAX(texto) AS texto, SUM(total) AS vezes FROM buscas WHERE dia >= ?
     GROUP BY termo HAVING vezes >= 2 ORDER BY vezes DESC, termo LIMIT ?`,
  ).bind(diasAtras(GUARDAR_DIAS), limite).all();
  return results.filter((r) => !BLOQUEADOS.test(r.termo) && !FORA_DOS_ATALHOS.has(r.termo)).map((r) => r.texto);
}
