// GET /api/preparar-buscas?parte=0 -> faz de novo, nas lojas, as "Ofertas do dia" e as buscas mais populares e guarda as respostas
// no banco (tabela buscas_prontas). Quem buscar esses termos recebe a resposta na hora, sem esperar as lojas.
// O robô do GitHub (robo-precos.yml) chama parte por parte toda madrugada: uma busca por chamada, porque cada
// busca consulta várias lojas e o plano grátis do Cloudflare limita as consultas de cada chamada.
import { onRequestGet as buscar } from "./buscar.js";
import { categoriasParaPreparar, buscasDasVitrines } from "../../lib/categorias.js";
import { maisBuscados, termosBuscados } from "../../lib/buscas.js";
import { carregarMapa } from "../../lib/mapaCategorias.js";
import { POPULARES } from "../../lib/vocabulario.js";

// Busca as categorias, os mais procurados no Brasil (POPULARES em lib/vocabulario.js), os atalhos "em alta", o que mais
// gente buscou no site em 30 dias e as buscas das vitrines das categorias ("smart tv", "lattafa"…), nessa ordem.
// Eram ~90; desde 21/10/2026 (pedido do Giovanni) até MAX_PRONTAS. Cada uma leva ~5 s no robô do GitHub.
const MAX_PRONTAS = 300;

export async function onRequestGet({ request, env, waitUntil }) {
  const parte = Math.max(parseInt(new URL(request.url).searchParams.get("parte"), 10) || 0, 0);
  const [buscados, doMes] = await Promise.all([
    maisBuscados(env, { ateOntem: true }).catch(() => []),
    termosBuscados(env, 200).catch(() => []),
  ]);
  const vistos = new Set();
  const lista = [
    { q: "" }, // "Ofertas do dia" da página inicial
    ...categoriasParaPreparar().map((c) => ({ q: c.busca, cat: c.nome })),
    ...[...POPULARES, ...buscados, ...doMes, ...buscasDasVitrines()].map((q) => ({ q })),
  ].filter((b) => {
    const chave = `${b.q.toLowerCase()}|${b.cat || ""}`;
    return !vistos.has(chave) && vistos.add(chave);
  }).slice(0, MAX_PRONTAS);
  const fim = parte + 1 >= lista.length;
  if (parte >= lista.length) return Response.json({ parte, partes: lista.length, fim: true });

  const { q, cat } = lista[parte];
  const url = new URL("/api/buscar", request.url);
  url.searchParams.set("q", q);
  if (cat) url.searchParams.set("cat", cat);
  const inicio = Date.now();
  const resposta = await buscar({ request: new Request(url), env: { ...env, __PREPARAR: true }, waitUntil });
  const dados = await resposta.json().catch(() => ({}));
  const falhou = Object.entries(dados.lojas || {}).filter(([, l]) => !l.ok).map(([nome, l]) => `${nome}: ${l.erro}`);
  return Response.json({
    parte, partes: lista.length, fim, busca: cat ? `${cat} (${q})` : q || "Ofertas do dia",
    produtos: dados.ofertas?.length || 0, guardada: Boolean(dados.lojas?.shopee?.ok && dados.ofertas?.length), falhou,
    segundos: (Date.now() - inicio) / 1000, categoriasAprendidas: (await carregarMapa(env)).size,
  }, { headers: { "Cache-Control": "no-store" } });
}
