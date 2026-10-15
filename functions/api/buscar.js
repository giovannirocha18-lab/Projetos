// GET /api/buscar?q=air+fryer  -> ofertas de todas as lojas ligadas
// GET /api/buscar               -> ofertas em destaque
//
// Roda nos servidores do Cloudflare (Pages Functions). É aqui que ficam as
// chaves das APIs, sem nunca chegarem ao navegador do visitante.
import { exemplo } from "../../lib/fontes/exemplo.js";
import { curadoria } from "../../lib/fontes/curadoria.js";
import { shopee } from "../../lib/fontes/shopee.js";
import { awin } from "../../lib/fontes/awin.js";
import { registrarBusca } from "../../lib/buscas.js";

// Para ligar uma loja nova: criar lib/fontes/<loja>.js e incluir aqui.
const FONTES_REAIS = [curadoria, shopee, awin];

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

export async function onRequestGet({ request, env, waitUntil }) {
  const inicio = Date.now();
  const q = (new URL(request.url).searchParams.get("q") || "").trim().slice(0, 100);

  // Conta a busca para os "em alta" da semana, sem atrasar a resposta
  const contar = (resposta) => {
    if (q && Number(resposta.headers.get("X-Total-Ofertas")) > 0) {
      waitUntil(registrarBusca(env, q).catch(() => {}));
    }
    return resposta;
  };

  // Guarda as respostas por 1 hora para não gastar o limite das APIs
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const chave = new Request(new URL(`/api/buscar?q=${encodeURIComponent(q.toLowerCase())}`, request.url));
  const guardada = cache && (await cache.match(chave));
  if (guardada) return contar(guardada);

  const ligadas = await Promise.all(FONTES_REAIS.map((f) => f.ativa(env)));
  const reais = FONTES_REAIS.filter((_, i) => ligadas[i]);
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

  const ofertas = resultados.flat();
  const resposta = responder({
    q,
    exemplo: !reais.length,
    ofertas,
    lojas,
    tempoMs: Date.now() - inicio,
  });
  // Produtos de exemplo não contam como busca em alta
  resposta.headers.set("X-Total-Ofertas", reais.length ? String(ofertas.length) : "0");
  if (cache && Object.values(lojas).every((l) => l.ok)) await cache.put(chave, resposta.clone());
  return contar(resposta);
}
