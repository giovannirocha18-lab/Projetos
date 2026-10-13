// GET /api/buscar?q=air+fryer  -> ofertas de todas as lojas ligadas
// GET /api/buscar               -> ofertas em destaque
//
// Roda nos servidores do Cloudflare (Pages Functions). É aqui que ficam as
// chaves das APIs, sem nunca chegarem ao navegador do visitante.
import { exemplo } from "../../lib/fontes/exemplo.js";
import { shopee } from "../../lib/fontes/shopee.js";

// Para ligar uma loja nova: criar lib/fontes/<loja>.js e incluir aqui.
const FONTES_REAIS = [shopee];

const CACHE_SEGUNDOS = 60 * 60;

function responder(dados, status = 200) {
  return new Response(JSON.stringify(dados), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": `public, max-age=${status === 200 ? CACHE_SEGUNDOS : 0}`,
      "X-Robots-Tag": "noindex",
    },
  });
}

export async function onRequestGet({ request, env }) {
  const inicio = Date.now();
  const q = (new URL(request.url).searchParams.get("q") || "").trim().slice(0, 100);

  // Guarda as respostas por 1 hora para não gastar o limite das APIs
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const chave = new Request(new URL(`/api/buscar?q=${encodeURIComponent(q.toLowerCase())}`, request.url));
  const guardada = cache && (await cache.match(chave));
  if (guardada) return guardada;

  const reais = FONTES_REAIS.filter((f) => f.ativa(env));
  // Enquanto nenhuma API estiver ligada, usa os produtos de exemplo
  const fontes = reais.length ? reais : [exemplo];

  const lojas = {};
  const resultados = await Promise.all(
    fontes.map(async (fonte) => {
      try {
        const ofertas = q ? await fonte.buscar(q, env) : await fonte.destaques(env);
        lojas[fonte.nome] = { ok: true, total: ofertas.length };
        return ofertas;
      } catch (erro) {
        // Uma loja fora do ar não derruba a busca nas outras
        lojas[fonte.nome] = { ok: false, erro: String(erro.message || erro) };
        return [];
      }
    }),
  );

  const resposta = responder({
    q,
    exemplo: !reais.length,
    ofertas: resultados.flat(),
    lojas,
    tempoMs: Date.now() - inicio,
  });
  if (cache && Object.values(lojas).every((l) => l.ok)) await cache.put(chave, resposta.clone());
  return resposta;
}
