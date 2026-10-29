// Conferência dos links "Comprar" (25/10/2026, pedido do Giovanni: site confiável). Abre a página do produto na loja
// (o endereço direto, nunca o link de afiliado, para não contar clique falso) e diz se ela existe.
// Usado pelo robô da Awin (robo/awin.mjs) e pela conferência das marcas da Lomadee (lib/fontes/lomadee.js).

const NAVEGADOR = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

// true = a página abre; false = a loja diz que não existe (404/410); null = não deu para saber (loja barrou robô,
// demorou, erro de rede). Só "false" conta como link quebrado: na dúvida, o produto fica
export async function linkAbre(url, ms = 10000) {
  try {
    const r = await fetch(url, {
      redirect: "follow", signal: AbortSignal.timeout(ms),
      headers: { "User-Agent": NAVEGADOR, Accept: "text/html,application/xhtml+xml", "Accept-Language": "pt-BR,pt;q=0.9" },
    });
    r.body?.cancel().catch(() => {});
    if (r.status === 404 || r.status === 410) return false;
    return r.ok ? true : null;
  } catch {
    return null;
  }
}

// Amostra de links de uma loja: quebrada só se quase todos os que responderam dizem "não existe" e respondeu o
// suficiente (uma loja que barra robôs, ou um produto que acabou de sair, não tira a loja inteira)
export async function lojaComLinksQuebrados(urls, { minimo = 3, ms } = {}) {
  const resultados = await Promise.all(urls.map((u) => linkAbre(u, ms)));
  const quebrados = resultados.filter((r) => r === false).length;
  const abrem = resultados.filter((r) => r === true).length;
  return { quebrada: quebrados >= minimo && quebrados >= 0.8 * (quebrados + abrem), quebrados, abrem, testados: urls.length };
}

// n endereços sorteados de uma lista (sem repetir)
export function sortear(lista, n) {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia.slice(0, n);
}

// Testa todos os endereços (poucos de cada vez, para não pesar no site da loja) e devolve os que dão "não existe"
export async function linksQuebrados(urls, { aoMesmoTempo = 8, ms } = {}) {
  const quebrados = new Set();
  let i = 0;
  await Promise.all(Array.from({ length: aoMesmoTempo }, async () => {
    while (i < urls.length) {
      const url = urls[i++];
      if ((await linkAbre(url, ms)) === false) quebrados.add(url);
    }
  }));
  return quebrados;
}

// A foto abre? true / false (404, 410, "não é imagem", 403 do Amazon S3) / null (não deu para saber).
// Usado pelo robô da Awin (robo/awin.mjs) e nas fotos da Lomadee (lib/fotos.js)
export async function fotoAbre(url, ms = 10000) {
  const pedir = (metodo) => fetch(url, {
    method: metodo, redirect: "follow", signal: AbortSignal.timeout(ms),
    headers: { "User-Agent": NAVEGADOR, ...(metodo === "GET" ? { Range: "bytes=0-1023" } : {}) },
  });
  try {
    let r = await pedir("HEAD");
    // Alguns servidores não aceitam HEAD: tenta um pedacinho com GET
    if ([403, 405, 501].includes(r.status)) r = await pedir("GET");
    if (r.body) r.body.cancel().catch(() => {});
    // 403 do Amazon S3 (erro em XML, direto ou pela CloudFront) = arquivo que não existe: o S3 responde "acesso negado"
    // no lugar de 404 (27/10/2026: ~95% das fotos da Lojas Benoit, que não abrem nem no navegador)
    if (r.status === 403 && (/AmazonS3/i.test(r.headers.get("server") || "") || /xml/.test(r.headers.get("content-type") || ""))) return false;
    // Outro 403: alguns servidores barram robôs mas abrem no navegador (o imgur dá 403 para o Node e 200 para o curl).
    // Só 404/410 e "não é imagem" contam como foto quebrada
    if (r.status >= 500 || r.status === 429 || r.status === 403 || r.status === 401) return null;
    const tipo = r.headers.get("content-type") || "";
    return r.ok && (!tipo || tipo.startsWith("image/"));
  } catch {
    return null;
  }
}

// Encurtador de uma rede de afiliados (lmdee.link da Lomadee) está redirecionando? Ele às vezes sai do ar e responde
// 500 para todas as marcas (29/10/2026). 3xx/2xx = sim; 4xx/5xx ou sem resposta = não. A situação de cada site vale
// 2 minutos (não testa a cada clique). Só para links da Lomadee: testar link da Shopee/AliExpress contaria clique falso
const situacaoDoSite = new Map();
export async function redirecionaBem(url, ms = 3000) {
  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    return false;
  }
  const visto = situacaoDoSite.get(host);
  if (visto && Date.now() < visto.ate) return visto.ok;
  let ok;
  try {
    const r = await fetch(url, { redirect: "manual", headers: { "User-Agent": NAVEGADOR }, signal: AbortSignal.timeout(ms) });
    r.body?.cancel().catch(() => {});
    ok = r.status >= 200 && r.status < 400;
  } catch {
    ok = false;
  }
  situacaoDoSite.set(host, { ok, ate: Date.now() + 2 * 60 * 1000 });
  return ok;
}
