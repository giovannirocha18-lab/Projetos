// Fotos que não abrem nos produtos da Lomadee (print do Giovanni, 27/10/2026: Candide com o desenho no lugar da foto).
// A loja troca as fotos e a Lomadee segue mandando os endereços antigos (404), às vezes todos os do produto. Os produtos
// vêm na hora da busca (o robô da madrugada só confere as fotos da Awin), então:
//  1) a busca consulta no banco as fotos já testadas: fica a 1ª que abre; com todas quebradas, o produto sai;
//  2) as ainda não testadas vão como vieram e são testadas depois da resposta (não atrasa a busca);
//  3) nas buscas prontas do robô o teste é feito antes de guardar, então as buscas comuns já saem limpas.
// Testar dentro da busca não deu certo: a Lomadee sozinha já leva 3–5 s e passando de 5 s a loja inteira saía da busca.
// Desde 29/10/2026 o mesmo vale para a PÁGINA do produto (print do Giovanni: Little Duck com "página não encontrada"; a
// loja tirou o produto e a Lomadee segue mandando): tabela links_testados; a conferência das marcas do robô (job lomadee,
// conferirMarcas) testa todos os produtos de cada marca toda madrugada, e a busca testa os novos depois da resposta.
import { fotoAbre, linkAbre } from "./links.js";

const TABELA = `CREATE TABLE IF NOT EXISTS fotos_testadas (url TEXT PRIMARY KEY, ok INTEGER NOT NULL, quando INTEGER NOT NULL)`;
const VALIDADE_BOA = 14 * 864e5; // foto boa é testada de novo a cada 2 semanas
const VALIDADE_RUIM = 3 * 864e5; // a ruim, a cada 3 dias (a loja pode ter corrigido)
const MAX_TESTES = 200; // por busca (testados depois da resposta)
const AO_MESMO_TEMPO = 16;
const TABELA_LINKS = `CREATE TABLE IF NOT EXISTS links_testados (url TEXT PRIMARY KEY, ok INTEGER NOT NULL, quando INTEGER NOT NULL)`;
const LINK_VALIDADE_BOA = 7 * 864e5; // página que abre é testada de novo a cada semana
const MAX_LINKS_BUSCA = 60; // páginas testadas por busca (depois da resposta)
const daLomadee = (o) => o.fonte === "lomadee";
// Endereço da página do produto no site da marca (o "u" do link /api/ir; nunca o link de afiliado: contaria clique falso)
export const paginaDoProduto = (o) => {
  try {
    return new URL(o.link, "https://vaiprocarrinho.com.br").searchParams.get("u") || null;
  } catch {
    return null;
  }
};
const fotosDe = (o) => o.imagens || (o.imagem ? [o.imagem] : []);

let tabelaPronta = false;
async function criarTabela(db) {
  if (tabelaPronta) return;
  await db.batch([db.prepare(TABELA), db.prepare(TABELA_LINKS)]);
  tabelaPronta = true;
}

async function conhecidas(db, urls, tabela = "fotos_testadas", validadeBoa = VALIDADE_BOA) {
  const mapa = new Map();
  const agora = Date.now();
  for (let i = 0; i < urls.length; i += 90) {
    const parte = urls.slice(i, i + 90);
    const { results } = await db.prepare(`SELECT url, ok, quando FROM ${tabela} WHERE url IN (${parte.map(() => "?").join(",")})`)
      .bind(...parte).all();
    for (const r of results) {
      if (agora - r.quando < (r.ok ? validadeBoa : VALIDADE_RUIM)) mapa.set(r.url, Boolean(r.ok));
    }
  }
  return mapa;
}

// Páginas dos produtos: testa as ainda não conhecidas (no máximo "max") e guarda no banco. Só "página não encontrada"
// (404/410) conta como quebrada; loja que barra robô ou demora fica como está
async function testarPaginas(db, ofertas, mapa, max, ms = 6000) {
  const lista = [...new Set(ofertas.filter(daLomadee).map(paginaDoProduto).filter((u) => u && !mapa.has(u)))].slice(0, max);
  const resultados = [];
  await Promise.all(Array.from({ length: AO_MESMO_TEMPO }, async () => {
    while (lista.length) {
      const url = lista.shift();
      const ok = await linkAbre(url, ms);
      if (ok !== null) {
        mapa.set(url, ok);
        resultados.push([url, ok]);
      }
    }
  }));
  const agora = Date.now();
  for (let i = 0; i < resultados.length; i += 100) {
    await db.batch(resultados.slice(i, i + 100).map(([url, ok]) => db.prepare("INSERT OR REPLACE INTO links_testados (url, ok, quando) VALUES (?, ?, ?)")
      .bind(url, ok ? 1 : 0, agora)));
  }
  return resultados;
}

// Robô (conferência das marcas da Lomadee, toda madrugada): testa as páginas de todos os produtos da marca e devolve
// só os que abrem. max = limite de testes nesta chamada (o resto fica para a próxima noite)
export async function semPaginasQuebradas(db, ofertas, max) {
  if (!db || !ofertas.some(daLomadee)) return { ofertas, testadas: 0, quebradas: 0 };
  await criarTabela(db);
  const urls = [...new Set(ofertas.map(paginaDoProduto).filter(Boolean))];
  const mapa = await conhecidas(db, urls, "links_testados", LINK_VALIDADE_BOA);
  const testadas = await testarPaginas(db, ofertas, mapa, max);
  return {
    ofertas: ofertas.filter((o) => mapa.get(paginaDoProduto(o)) !== false),
    testadas: testadas.length,
    quebradas: urls.filter((u) => mapa.get(u) === false).length,
  };
}

// Testa as fotos ainda não conhecidas e guarda no banco: todas as do produto até a 1ª que já sabemos que abre
// (testando uma por vez, a Candide, com 5 fotos quebradas por produto, levava 5 visitas para limpar)
async function testar(db, ofertas, mapa) {
  const fila = [];
  for (const o of ofertas) {
    for (const url of fotosDe(o)) {
      if (mapa.get(url) === true) break;
      if (!mapa.has(url) && !fila.includes(url)) fila.push(url);
    }
  }
  const resultados = [];
  const lista = fila.slice(0, MAX_TESTES);
  await Promise.all(Array.from({ length: AO_MESMO_TEMPO }, async () => {
    while (lista.length) {
      const url = lista.shift();
      const ok = await fotoAbre(url);
      if (ok !== null) {
        mapa.set(url, ok);
        resultados.push([url, ok]);
      }
    }
  }));
  if (!resultados.length) return false;
  const agora = Date.now();
  await db.batch(resultados.map(([url, ok]) => db.prepare("INSERT OR REPLACE INTO fotos_testadas (url, ok, quando) VALUES (?, ?, ?)")
    .bind(url, ok ? 1 : 0, agora)));
  return resultados.some(([, ok]) => !ok);
}

function aplicar(ofertas, mapa, paginas) {
  return ofertas.flatMap((o) => {
    if (!daLomadee(o)) return [o];
    if (paginas.get(paginaDoProduto(o)) === false) return []; // a página do produto não existe mais na loja
    const fotos = fotosDe(o);
    if (!fotos.length) return [o];
    const boas = fotos.filter((u) => mapa.get(u) !== false);
    if (!boas.length) return []; // todas quebradas
    if (boas[0] === o.imagem && boas.length === fotos.length) return [o];
    return [{ ...o, imagem: boas[0], imagens: boas.length > 1 ? boas : undefined }];
  });
}

// esperar = true (robô) testa antes de devolver; senão testa depois, com waitUntil
export async function semFotosQuebradas(db, ofertas, { esperar = false, waitUntil } = {}) {
  if (!db || !ofertas.some(daLomadee)) return ofertas;
  try {
    await criarTabela(db);
    const urls = [...new Set(ofertas.filter(daLomadee).flatMap(fotosDe))];
    const mapa = await conhecidas(db, urls);
    const daLoja = ofertas.filter(daLomadee);
    const paginas = await conhecidas(db, [...new Set(daLoja.map(paginaDoProduto).filter(Boolean))], "links_testados", LINK_VALIDADE_BOA);
    if (esperar) {
      // Robô: achou foto quebrada, testa a próxima do mesmo produto (até 5 rodadas)
      for (let rodada = 0; rodada < 5 && (await testar(db, daLoja, mapa).catch(() => false)); rodada++);
      await testarPaginas(db, daLoja, paginas, MAX_LINKS_BUSCA).catch(() => []);
    } else {
      waitUntil?.(testar(db, daLoja, mapa).catch(() => false));
      waitUntil?.(testarPaginas(db, daLoja, paginas, MAX_LINKS_BUSCA).catch(() => []));
    }
    return aplicar(ofertas, mapa, paginas);
  } catch {
    return ofertas; // banco fora do ar: vai como veio
  }
}

// Resposta guardada (cache de 1 dia ou busca pronta) com produtos da Lomadee: tira na hora as fotos que já sabemos que
// não abrem. A cópia guardada pode ser de antes do teste e, com a Lomadee passando de 5 s, a busca refeita por trás
// não é regravada (28/10/2026: "boneca" seguia com 33 fotos quebradas da Candide)
export async function respostaSemFotosQuebradas(db, resposta, waitUntil) {
  if (!db) return resposta;
  try {
    const texto = await resposta.clone().text();
    if (!texto.includes('"fonte":"lomadee"')) return resposta;
    const dados = JSON.parse(texto);
    const antes = dados.ofertas || [];
    const ofertas = await semFotosQuebradas(db, antes, { waitUntil });
    if (ofertas.length === antes.length && ofertas.every((o, i) => o === antes[i])) return resposta;
    return new Response(JSON.stringify({ ...dados, ofertas }), resposta);
  } catch {
    return resposta;
  }
}
