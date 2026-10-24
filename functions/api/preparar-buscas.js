// GET /api/preparar-buscas?parte=0 -> faz de novo, nas lojas, as "Ofertas do dia" e as buscas mais populares e guarda as respostas
// no banco (tabela buscas_prontas_gz, compactada). Quem buscar esses termos recebe a resposta na hora, sem esperar as lojas.
// O robô do GitHub (robo-precos.yml) chama parte por parte toda madrugada (duas ao mesmo tempo): uma busca por chamada.
import { onRequestGet as buscar } from "./buscar.js";
import { categoriasParaPreparar, buscasDasVitrines } from "../../lib/categorias.js";
import { maisBuscados, termosBuscados } from "../../lib/buscas.js";
import { carregarMapa } from "../../lib/mapaCategorias.js";
import { POPULARES, termosParaSugestoes } from "../../lib/vocabulario.js";
import { guardarDaBusca } from "../../lib/blackfriday.js";

// Busca as categorias, os mais procurados no Brasil (POPULARES em lib/vocabulario.js), os atalhos "em alta", o que mais
// gente buscou no site em 30 dias e tudo o que a caixa de busca sugere (vitrines das categorias, produto + marca…),
// nessa ordem. Eram ~90; 300 desde 21/10/2026; até 1000 desde 23/10/2026 (Workers Paid). Cada uma leva ~5 s.
const MAX_PRONTAS = 1000;
const BUSCADOS_NO_MES = 600;

export async function onRequestGet({ request, env, waitUntil }) {
  const parte = Math.max(parseInt(new URL(request.url).searchParams.get("parte"), 10) || 0, 0);
  const [buscados, doMes] = await Promise.all([
    maisBuscados(env, { ateOntem: true }).catch(() => []),
    termosBuscados(env, BUSCADOS_NO_MES).catch(() => []),
  ]);
  const vistos = new Set();
  const lista = [
    { q: "" }, // "Ofertas do dia" da página inicial
    ...categoriasParaPreparar().map((c) => ({ q: c.busca, cat: c.nome })),
    ...[...POPULARES, ...buscados, ...doMes, ...buscasDasVitrines(), ...termosParaSugestoes()].map((q) => ({ q })),
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
  // Página da Black Friday: guarda os produtos desta busca com desconto que dá para conferir (lib/blackfriday.js)
  const blackFriday = await guardarDaBusca(env.DB, dados.ofertas).catch(() => 0);
  return Response.json({
    parte, partes: lista.length, fim, busca: cat ? `${cat} (${q})` : q || "Ofertas do dia",
    produtos: dados.ofertas?.length || 0, guardada: Boolean(dados.lojas?.shopee?.ok && dados.ofertas?.length), falhou,
    blackFriday, segundos: (Date.now() - inicio) / 1000, categoriasAprendidas: (await carregarMapa(env)).size,
  }, { headers: { "Cache-Control": "no-store" } });
}
