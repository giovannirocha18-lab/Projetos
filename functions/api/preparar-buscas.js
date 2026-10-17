// GET /api/preparar-buscas?parte=0 -> faz de novo, nas lojas, as buscas mais populares e guarda as respostas
// no banco (tabela buscas_prontas). Quem buscar esses termos recebe a resposta na hora, sem esperar as lojas.
// O robô do GitHub (robo-precos.yml) chama parte por parte toda madrugada: uma busca por chamada, porque cada
// busca consulta várias lojas e o plano grátis do Cloudflare limita as consultas de cada chamada.
import { onRequestGet as buscar } from "./buscar.js";
import { categoriasParaPreparar } from "../../lib/categorias.js";
import { maisBuscados } from "../../lib/buscas.js";
import { carregarMapa } from "../../lib/mapaCategorias.js";

// Os mais procurados no Brasil (pesquisa de 16/10/2026: Mercado Livre, Google, Shopee) e os atalhos "em alta"
const POPULARES = [
  "air fryer", "celular", "fone bluetooth", "fone de ouvido", "smartwatch", "tênis feminino", "tênis masculino",
  "tênis de corrida", "ventilador", "iphone", "iphone 15", "iphone 16", "iphone 17", "geladeira", "notebook",
  "ar condicionado", "smart tv", "tv 55 polegadas", "ps5", "camiseta dry fit", "creatina", "caixa de som bluetooth",
  "perfume árabe", "perfume masculino", "perfume feminino", "jogo de lençol casal", "projetor 4k",
  "bicicleta ergométrica", "liquidificador", "câmera wifi", "areia para gatos", "power bank", "garrafa térmica",
  "robô aspirador", "kit maquiagem", "labubu", "bobbie goods", "poco x7 pro", "galaxy s24", "stanley",
  "mochila", "capinha iphone", "carregador iphone", "panela de pressão", "jogo de panelas", "cafeteira",
  "micro-ondas", "máquina de lavar", "aspirador de pó", "secador de cabelo", "chapinha", "relógio masculino",
];

export async function onRequestGet({ request, env, waitUntil }) {
  const parte = Math.max(parseInt(new URL(request.url).searchParams.get("parte"), 10) || 0, 0);
  const buscados = await maisBuscados(env, { ateOntem: true }).catch(() => []);
  const vistos = new Set();
  const lista = [
    ...categoriasParaPreparar().map((c) => ({ q: c.busca, cat: c.nome })),
    ...[...POPULARES, ...buscados].map((q) => ({ q })),
  ].filter((b) => {
    const chave = `${b.q.toLowerCase()}|${b.cat || ""}`;
    return !vistos.has(chave) && vistos.add(chave);
  });
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
    parte, partes: lista.length, fim, busca: cat ? `${cat} (${q})` : q,
    produtos: dados.ofertas?.length || 0, guardada: Boolean(dados.lojas?.shopee?.ok && dados.ofertas?.length), falhou,
    segundos: (Date.now() - inicio) / 1000, categoriasAprendidas: (await carregarMapa(env)).size,
  }, { headers: { "Cache-Control": "no-store" } });
}
