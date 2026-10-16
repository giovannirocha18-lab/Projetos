// GET /api/coletar-precos?parte=0 -> guarda o preço de hoje dos produtos da Shopee mais vistos
//
// A Shopee é consultada ao vivo (não passa pelo robô da Awin). Para o histórico de preço e o selo
// "Desconto real" não dependerem só das visitas, o robô do GitHub (robo-precos.yml) chama este
// endereço todo dia, parte por parte (cada chamada faz poucas consultas, dentro do limite do Cloudflare).
// Busca: as das vitrines das categorias (mais vendidos) + as mais buscadas no site.
// Cada parte roda no máximo uma vez por dia, então chamar de novo não gasta nada.
import { shopee } from "../../lib/fontes/shopee.js";
import { buscasDasVitrines } from "../../lib/categorias.js";
import { maisBuscados } from "../../lib/buscas.js";
import { historicoAoVivo } from "../../lib/ofertas.js";

const BUSCAS_POR_PARTE = 5; // poucas por chamada: o plano grátis do Cloudflare limita o tempo de cada uma

const responder = (dados, status = 200) => new Response(JSON.stringify(dados), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
});

export async function onRequestGet({ request, env }) {
  if (!env.DB || !shopee.ativa(env)) return responder({ erro: "Shopee ou banco não configurados" }, 503);
  const parte = Math.max(parseInt(new URL(request.url).searchParams.get("parte"), 10) || 0, 0);

  const vitrines = buscasDasVitrines().map((termo) => ({ termo, maisVendidos: true }));
  const buscados = (await maisBuscados(env, { ateOntem: true }).catch(() => [])).map((termo) => ({ termo, maisVendidos: false }));
  const todas = [...vitrines, ...buscados];
  const partes = Math.ceil(todas.length / BUSCAS_POR_PARTE);
  const fim = parte + 1 >= partes;
  if (parte >= partes) return responder({ parte, partes, fim: true, gravados: 0 });

  const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS coletas (parte INTEGER NOT NULL, dia TEXT NOT NULL, PRIMARY KEY (parte, dia))").run();
  // Marca a parte antes de começar: se a mesma parte for chamada 2 vezes ao mesmo tempo, só uma roda
  const minha = await env.DB.prepare("INSERT OR IGNORE INTO coletas (parte, dia) VALUES (?, ?) RETURNING parte")
    .bind(parte, hoje).first();
  if (!minha) return responder({ parte, partes, fim, jaFeita: true, gravados: 0 });

  const lote = todas.slice(parte * BUSCAS_POR_PARTE, (parte + 1) * BUSCAS_POR_PARTE);
  const erros = [];
  const listas = await Promise.all(lote.map(({ termo, maisVendidos }) =>
    shopee.buscar(termo, env, 1, { maisVendidos }).catch((e) => { erros.push(`${termo}: ${e.message || e}`); return []; })));
  // Se a Shopee não respondeu nenhuma, desmarca a parte: a próxima chamada tenta de novo
  if (erros.length === lote.length) {
    await env.DB.prepare("DELETE FROM coletas WHERE parte = ? AND dia = ?").bind(parte, hoje).run();
    return responder({ parte, partes, fim, buscas: lote.length, produtos: 0, gravados: 0, erros });
  }
  let gravados;
  try {
    gravados = await (await historicoAoVivo(env.DB, listas.flat())).gravar();
  } catch (erro) {
    await env.DB.prepare("DELETE FROM coletas WHERE parte = ? AND dia = ?").bind(parte, hoje).run().catch(() => {});
    throw erro;
  }
  return responder({ parte, partes, fim, buscas: lote.length, produtos: listas.flat().length, gravados, erros });
}
