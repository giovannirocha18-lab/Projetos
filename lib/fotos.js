// Fotos que não abrem nos produtos da Lomadee (print do Giovanni, 27/10/2026: Candide com o desenho no lugar da foto).
// A loja troca as fotos e a Lomadee segue mandando os endereços antigos (404), às vezes todos os do produto. Os produtos
// vêm na hora da busca (o robô da madrugada só confere as fotos da Awin), então:
//  1) a busca consulta no banco as fotos já testadas: fica a 1ª que abre; com todas quebradas, o produto sai;
//  2) as ainda não testadas vão como vieram e são testadas depois da resposta (não atrasa a busca);
//  3) nas buscas prontas do robô o teste é feito antes de guardar, então as buscas comuns já saem limpas.
// Testar dentro da busca não deu certo: a Lomadee sozinha já leva 3–5 s e passando de 5 s a loja inteira saía da busca.
import { fotoAbre } from "./links.js";

const TABELA = `CREATE TABLE IF NOT EXISTS fotos_testadas (url TEXT PRIMARY KEY, ok INTEGER NOT NULL, quando INTEGER NOT NULL)`;
const VALIDADE_BOA = 14 * 864e5; // foto boa é testada de novo a cada 2 semanas
const VALIDADE_RUIM = 3 * 864e5; // a ruim, a cada 3 dias (a loja pode ter corrigido)
const MAX_TESTES = 80; // por busca
const AO_MESMO_TEMPO = 16;
const daLomadee = (o) => o.fonte === "lomadee";
const fotosDe = (o) => o.imagens || (o.imagem ? [o.imagem] : []);

let tabelaPronta = false;
async function criarTabela(db) {
  if (tabelaPronta) return;
  await db.prepare(TABELA).run();
  tabelaPronta = true;
}

async function conhecidas(db, urls) {
  const mapa = new Map();
  const agora = Date.now();
  for (let i = 0; i < urls.length; i += 90) {
    const parte = urls.slice(i, i + 90);
    const { results } = await db.prepare(`SELECT url, ok, quando FROM fotos_testadas WHERE url IN (${parte.map(() => "?").join(",")})`)
      .bind(...parte).all();
    for (const r of results) {
      if (agora - r.quando < (r.ok ? VALIDADE_BOA : VALIDADE_RUIM)) mapa.set(r.url, Boolean(r.ok));
    }
  }
  return mapa;
}

// Testa as fotos ainda não conhecidas (a 1ª de cada produto; se quebrada, a seguinte) e guarda no banco
async function testar(db, ofertas, mapa) {
  const fila = [];
  for (const o of ofertas) {
    const url = fotosDe(o).find((u) => mapa.get(u) !== false);
    if (url && !mapa.has(url) && !fila.includes(url)) fila.push(url);
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

function aplicar(ofertas, mapa) {
  return ofertas.flatMap((o) => {
    if (!daLomadee(o)) return [o];
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
    if (esperar) {
      // Robô: achou foto quebrada, testa a próxima do mesmo produto (até 5 rodadas)
      for (let rodada = 0; rodada < 5 && (await testar(db, daLoja, mapa).catch(() => false)); rodada++);
    } else waitUntil?.(testar(db, daLoja, mapa).catch(() => false));
    return aplicar(ofertas, mapa);
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
