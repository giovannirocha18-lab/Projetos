// A IA confere as buscas (pedido do Giovanni, 30/10/2026; print "jogo de ferramentas" com jogo de chá e jogo de tabuleiro
// em Cozinha/Brinquedos). Toda madrugada o robô (robo/conferir-buscas.mjs) abre as buscas sugeridas na caixa de busca,
// separa os produtos que aparecem como "o produto buscado" mas estão em outra categoria e pergunta ao Claude Haiku se
// cada um é mesmo o que a pessoa procura. Os que não são ficam na tabela ia_busca e o site os manda para o botão
// "Ver também … produtos parecidos" daquela busca (não some nada do site: só sai do meio dos resultados).
import { normalizar } from "./texto.js";
import { chaveIa } from "./ia.js";
import { ofertaDeLojaRemovida, semPrecoAbsurdo, marcarUsados } from "./lojasRemovidas.js";
import { fotosErradas, fotoErrada } from "./iaFotos.js";
import { categoriaDoProduto } from "./categorias.js";

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
    // ok: 1 = é o produto; 0 = não tem a ver com a busca; 2 = peça/acessório DELE (16/11/2026: a IA confere a lista inteira)
    const { results } = await db.prepare("SELECT chave, ok FROM ia_busca WHERE termo = ? AND ok != 1").bind(termo).all();
    chaves = results.length ? new Map(results.map((r) => [r.chave, r.ok])) : null;
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
  const acessorios = []; // a IA disse que é peça/acessório do produto buscado: fica com os acessórios (não some)
  for (const o of ofertas) {
    const veredito = chaves.get(chaveIa(o.titulo || ""));
    if (veredito === 2) { if (o.acessorio) ficam.push(o); else acessorios.push({ ...o, acessorio: true, principal: false }); }
    else if (veredito !== undefined) saem.push(o.naoBuscado ? o : { ...o, acessorio: true, parecido: true, principal: false, naoBuscado: true });
    else ficam.push(o);
  }
  return saem.length || acessorios.length ? [...ficam, ...acessorios, ...saem] : ofertas;
}

// Regra do Giovanni (16/11/2026): "se na busca não tiver a palavra brinquedo, na tela não deve exibir nada que tenha
// brinquedo descrito" (geladeira, notebook e fogão de brinquedo no meio dos de verdade). Sai da lista (vira "parecido",
// que o site esconde). Só nas buscas de produto "sério" (palavras dele: "geladeira, fogão, televisão, celular,
// micro-ondas etc."; em "piscina" o de brinquedo pode aparecer): a busca é de uma das categorias abaixo, ou a categoria
// com mais produtos na resposta é uma delas
// 17/11/2026: "infantil" sozinho NÃO entra (tablet, smartwatch, fone e escova elétrica infantis são produto de verdade);
// entram só os nomes que são sempre brinquedo: laptop/notebook infantil ou educativo, minigame, Mini Brands, Barbie, cozinha infantil
const E_BRINQUEDO = /\bbrinquedos?\b|\bcookeez\b|\bfaz de conta\b|\bde mentirinha\b|\bminigame\b|\bmini brands\b|\bbarbie\b|\bcozinha infantil\b|\b(laptop|notebook)\b.{0,25}\b(infantil|infantis|educativo|bilingue)\b|\b(infantil|educativo)\b.{0,15}\b(laptop|notebook)\b/;
const BUSCA_DE_BRINQUEDO = /brinqued|cookeez|infantil|crianca|bebe|boneca|boneco|pelucia|lego|faz de conta|barbie|minigame|mini brands|educativo/;
const CATEGORIAS_SERIAS = new Set(["Eletrodomésticos", "Eletroportáteis", "Celulares", "Informática", "Ferramentas", "Smartwatches",
  "Fones de ouvido", "Caixas de som"]);
function buscaSeria(ofertas, q) {
  if (BUSCA_DE_BRINQUEDO.test(normalizar(q))) return false;
  const daBusca = categoriaDoProduto(q)?.nome;
  if (daBusca) return CATEGORIAS_SERIAS.has(daBusca);
  const conta = new Map();
  for (const o of ofertas) if (!o.acessorio && o.secao) conta.set(o.secao, (conta.get(o.secao) || 0) + 1);
  const maior = [...conta].sort((x, y) => y[1] - x[1])[0]?.[0];
  return CATEGORIAS_SERIAS.has(maior);
}
export function semBrinquedos(ofertas, q) {
  if (!q || !ofertas?.length || !buscaSeria(ofertas, q)) return ofertas;
  const ficam = [];
  const saem = [];
  for (const o of ofertas) {
    if (o.naoBuscado) saem.push(o);
    else if (E_BRINQUEDO.test(normalizar(o.titulo || ""))) saem.push({ ...o, acessorio: true, parecido: true, principal: false, naoBuscado: true });
    else ficam.push(o);
  }
  return saem.some((o, i) => o !== ofertas[ficam.length + i]) || saem.length && ofertas.slice(0, ficam.length).some((o, i) => o !== ficam[i]) ? [...ficam, ...saem] : ofertas;
}

// Resposta guardada (cache ou busca pronta): vale na hora o que a IA decidiu depois de ela ser guardada
// Tira também os produtos de lojas removidas do site que ainda estejam nas respostas guardadas (lib/lojasRemovidas.js)
export async function respostaSemNaoBuscados(db, q, resposta) {
  // As duas consultas juntas (11/11/2026: do Brasil cada ida ao banco custa caro)
  const [chaves, erradas] = await Promise.all([naoSaoDaBusca(db, q), fotosErradas(db)]); // erradas = foto que não é do produto (lib/iaFotos.js)
  try {
    const dados = JSON.parse(await resposta.clone().text());
    const antes = dados.ofertas || [];
    const semRemovidas = marcarUsados(semPrecoAbsurdo(antes.filter((o) => !ofertaDeLojaRemovida(o) && !fotoErrada(o, erradas))), q);
    const ofertas = semBrinquedos(chaves ? semNaoBuscados(semRemovidas, chaves) : semRemovidas, q);
    if (ofertas.length === antes.length && ofertas.every((o, i) => o === antes[i])) return resposta;
    return new Response(JSON.stringify({ ...dados, ofertas }), resposta);
  } catch {
    return resposta;
  }
}
