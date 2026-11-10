// A IA confere as buscas (pedido do Giovanni, 30/10/2026; print "jogo de ferramentas" com jogo de chá e jogo de tabuleiro
// em Cozinha/Brinquedos). Toda madrugada o robô (robo/conferir-buscas.mjs) abre as buscas sugeridas na caixa de busca,
// separa os produtos que aparecem como "o produto buscado" mas estão em outra categoria e pergunta ao Claude Haiku se
// cada um é mesmo o que a pessoa procura. Os que não são ficam na tabela ia_busca e o site os manda para o botão
// "Ver também … produtos parecidos" daquela busca (não some nada do site: só sai do meio dos resultados).
import { normalizar } from "./texto.js";
import { chaveIa } from "./ia.js";
import { ofertaDeLojaRemovida } from "./lojasRemovidas.js";
import { fotosErradas, fotoErrada } from "./iaFotos.js";

export const TABELA_IA_BUSCA = `CREATE TABLE IF NOT EXISTS ia_busca (termo TEXT NOT NULL, chave TEXT NOT NULL, ok INTEGER NOT NULL,
  quando INTEGER NOT NULL, PRIMARY KEY (termo, chave))`;
export const termoIa = (q) => normalizar(q).slice(0, 100);

// Igual ao site (public/assets/app.js, categoriasDaBusca): categorias com mais de 20% dos produtos principais
const PARTE_DA_CATEGORIA = 0.2;
export function categoriasDaBusca(ofertas) {
  const base = ofertas.filter((o) => !o.acessorio && o.principal && !o.variante && !o.foraDoTipo);
  if (base.length < 5) return null;
  const conta = new Map();
  for (const o of base) conta.set(o.secao || "", (conta.get(o.secao || "") || 0) + 1);
  return new Set([...conta].filter(([, n]) => n > base.length * PARTE_DA_CATEGORIA).map(([c]) => c));
}

// Produtos que o site mostra como buscados, mas fora das categorias da busca (os que a IA confere)
export function foraDasCategorias(ofertas) {
  const cats = categoriasDaBusca(ofertas);
  if (!cats?.size) return [];
  return ofertas.filter((o) => !o.acessorio && !cats.has(o.secao || ""));
}

// Títulos que a IA disse não serem da busca. Guardados na memória do servidor por 10 min (1 consulta pequena por busca)
const lidos = new Map();
const VALE_MS = 10 * 60 * 1000;
export async function naoSaoDaBusca(db, q) {
  const termo = termoIa(q);
  if (!db || !termo) return null;
  const guardado = lidos.get(termo);
  if (guardado && Date.now() - guardado.quando < VALE_MS) return guardado.chaves;
  let chaves = null;
  try {
    const { results } = await db.prepare("SELECT chave FROM ia_busca WHERE termo = ? AND ok = 0").bind(termo).all();
    chaves = results.length ? new Set(results.map((r) => r.chave)) : null;
  } catch {
    // tabela ainda não existe (o robô cria)
  }
  if (lidos.size > 5000) lidos.clear();
  lidos.set(termo, { chaves, quando: Date.now() });
  return chaves;
}

// Manda para o fim, junto com os acessórios e parecidos (o site esconde até clicar em "Ver também…")
export function semNaoBuscados(ofertas, chaves) {
  if (!chaves?.size || !ofertas?.length) return ofertas;
  const ficam = [];
  const saem = [];
  for (const o of ofertas) {
    if (chaves.has(chaveIa(o.titulo || ""))) saem.push(o.naoBuscado ? o : { ...o, acessorio: true, parecido: true, principal: false, naoBuscado: true });
    else ficam.push(o);
  }
  return saem.length ? [...ficam, ...saem] : ofertas;
}

// Resposta guardada (cache ou busca pronta): vale na hora o que a IA decidiu depois de ela ser guardada
// Tira também os produtos de lojas removidas do site que ainda estejam nas respostas guardadas (lib/lojasRemovidas.js)
export async function respostaSemNaoBuscados(db, q, resposta) {
  const chaves = await naoSaoDaBusca(db, q);
  const erradas = await fotosErradas(db); // foto que não é do produto (lib/iaFotos.js)
  try {
    const dados = JSON.parse(await resposta.clone().text());
    const antes = dados.ofertas || [];
    const semRemovidas = antes.filter((o) => !ofertaDeLojaRemovida(o) && !fotoErrada(o, erradas));
    const ofertas = chaves ? semNaoBuscados(semRemovidas, chaves) : semRemovidas;
    if (ofertas.length === antes.length && ofertas.every((o, i) => o === antes[i])) return resposta;
    return new Response(JSON.stringify({ ...dados, ofertas }), resposta);
  } catch {
    return resposta;
  }
}
