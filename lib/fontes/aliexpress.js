// =====================================================================
// FONTE ALIEXPRESS — API oficial de afiliados (Open Platform, "Affiliates API").
// Só é usada quando ALIEXPRESS_APP_KEY e ALIEXPRESS_APP_SECRET estiverem
// cadastradas no Cloudflare (Settings > Variables and Secrets).
// ALIEXPRESS_TRACKING_ID é opcional (padrão: "vaiprocarrinho", criado no Portals).
// Preço já vem em reais (target_currency=BRL), com entrega para o Brasil.
// =====================================================================

import { buscasDasVitrines, categoriaDoProduto } from "../categorias.js";
import { citaAlgumaPalavra, citaTodasAsPalavras, separarAcessorios } from "../relevancia.js";

const ENDPOINT = "https://api-sg.aliexpress.com/sync";
const TRACKING_PADRAO = "vaiprocarrinho";
// Só as primeiras páginas: 150 produtos por busca bastam e cada página é uma consulta a mais
// (o plano grátis do Cloudflare permite 50 consultas externas por visita)
const MAX_PAGINAS = 3;
const DIAS_NACIONAL = 5; // prazo de entrega que só o envio de dentro do Brasil cumpre
// "Ofertas do dia" sem a Advanced API: mais vendidos de 4 buscas das vitrines por página (mudam todo dia),
// só os com desconto, até 6 de cada, intercalados
const BUSCAS_POR_PAGINA_DESTAQUE = 4;
const POR_BUSCA_DESTAQUE = 6;
// Fica falso depois que a Advanced API recusar (vale enquanto o servidor estiver de pé)
let avancadaLiberada = true;

const CAMPOS = [
  "product_id", "product_title", "product_main_image_url", "product_small_image_urls",
  "target_sale_price", "target_original_price", "discount", "lastest_volume",
  "promotion_link", "shop_name", "first_level_category_id", "first_level_category_name",
  "second_level_category_id", "second_level_category_name",
].join(",");

async function assinar(segredo, params) {
  // Assinatura da Open Platform: HMAC-SHA256 dos parâmetros em ordem alfabética (nome + valor, tudo junto)
  const texto = Object.keys(params).sort().map((k) => `${k}${params[k]}`).join("");
  const chave = await crypto.subtle.importKey("raw", new TextEncoder().encode(segredo),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const assinatura = await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(texto));
  return [...new Uint8Array(assinatura)].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

async function consultar(env, metodo, extras) {
  const params = {
    app_key: env.ALIEXPRESS_APP_KEY,
    method: metodo,
    sign_method: "sha256",
    timestamp: String(Date.now()),
    ...extras,
  };
  // Parâmetro sem valor (ex.: busca só pela categoria, sem palavra) não vai: entraria na assinatura como "undefined"
  for (const k of Object.keys(params)) if (params[k] === undefined) delete params[k];
  params.sign = await assinar(env.ALIEXPRESS_APP_SECRET, params);
  const resp = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
    body: new URLSearchParams(params),
  });
  const json = await resp.json();
  if (json.error_response) throw new Error(`AliExpress: ${json.error_response.msg || json.error_response.code}`);
  const resultado = json[`${metodo.replace(/\./g, "_")}_response`]?.resp_result;
  // 405 = nenhum produto encontrado (não é erro)
  if (resultado?.resp_code === 405) return [];
  if (!resultado || resultado.resp_code !== 200) throw new Error(`AliExpress: ${resultado?.resp_msg || "resposta inesperada"}`);
  return resultado.result?.products?.product || [];
}

const numero = (v) => Number(String(v ?? "").replace(",", ".")) || null;

function converter(p) {
  const preco = numero(p.target_sale_price);
  const original = numero(p.target_original_price);
  const fotos = [p.product_main_image_url, ...(p.product_small_image_urls?.string || [])].filter(Boolean);
  return {
    id: `aliexpress-${p.product_id}`,
    loja: "aliexpress",
    titulo: p.product_title,
    preco,
    precoAntigo: original > preco ? original : null,
    desconto: parseInt(p.discount, 10) || null,
    imagem: fotos[0] || null,
    imagens: fotos.length > 1 ? [...new Set(fotos)].slice(0, 5) : undefined,
    vendidos: Number(p.lastest_volume) || null,
    vendedor: p.shop_name || null,
    // Categorias da própria AliExpress (código e nome, do geral ao específico)
    catsLoja: [p.first_level_category_id, p.second_level_category_id].filter(Boolean).map(String),
    catLojaNome: p.second_level_category_name || p.first_level_category_name || undefined,
    // Vem do exterior na maior parte das vezes (o site avisa que pode haver impostos de importação);
    // buscar() desmarca os que saem de armazém no Brasil
    internacional: true,
    link: p.promotion_link, // link já com o código de afiliado
  };
}

const parametrosBrasil = (env) => ({
  target_currency: "BRL",
  target_language: "PT",
  ship_to_country: "BR",
  tracking_id: env.ALIEXPRESS_TRACKING_ID || TRACKING_PADRAO,
});
const valido = (o) => o.preco > 0 && o.link && o.titulo;

// A busca da AliExpress traz qualquer coisa: fica só o título que cita o produto buscado (com marca, só a marca não
// basta) e, sem todas as palavras, não é de outra categoria. A 2ª regra vale para qualquer marca, mesmo fora da lista
// MARCAS ("air fryer mondial" trazia "Secador de Cabelo Mondial"; print do Giovanni, 19/10/2026)
export function tituloDaBusca(q) {
  const cita = citaAlgumaPalavra(q);
  const temTodas = citaTodasAsPalavras(q);
  const categoria = categoriaDoProduto(q);
  return (titulo) => {
    if (!cita(titulo)) return false;
    if (!categoria || temTodas(titulo)) return true;
    const c = categoriaDoProduto(titulo);
    return !c || c.nome === categoria.nome;
  };
}

export const aliexpress = {
  nome: "aliexpress",
  ativa: (env) => Boolean(env.ALIEXPRESS_APP_KEY && env.ALIEXPRESS_APP_SECRET),
  porPagina: 50, // o máximo que a API aceita

  async buscar(q, env, pagina = 1, { maisVendidos = false, catsDaLoja } = {}) {
    if (pagina > MAX_PAGINAS) return [];
    const pedir = (extras = {}) => consultar(env, "aliexpress.affiliate.product.query", {
      keywords: q,
      page_no: String(pagina),
      page_size: String(this.porPagina),
      fields: CAMPOS,
      // Sem "sort" = relevância; LAST_VOLUME_DESC = mais vendidos (vitrine das categorias)
      ...(maisVendidos && { sort: "LAST_VOLUME_DESC" }),
      ...parametrosBrasil(env),
      ...extras,
    });
    // A API não diz de onde o produto sai, mas filtra por prazo de entrega: o que chega no Brasil em até
    // DIAS_NACIONAL dias sai de armazém daqui ("Envio do Brasil"). Essa 2ª consulta nunca derruba a busca.
    // A busca da AliExpress por "celular" traz quase só capinhas (print do Giovanni, 21/10/2026): pede também dentro das
    // categorias dela que o mapa já sabe serem da categoria buscada (ver lib/mapaCategorias.js); esses vêm primeiro
    const cats = maisVendidos ? [] : [...new Set([...(catsDaLoja?.("aliexpress") || []), ...(catsDaLoja?.CONHECIDAS_ALIEXPRESS || [])])];
    const [todos, rapidos, naCategoria] = await Promise.all([
      pedir(),
      pedir({ delivery_days: String(DIAS_NACIONAL) }).catch(() => []),
      cats.length ? pedir({ category_ids: cats.join(","), keywords: catsDaLoja.resto || undefined }).catch(() => []) : [],
    ]);
    // Busca digitada: só o que cita as palavras buscadas (a da AliExpress traz qualquer coisa).
    // A vitrine (mais vendidos) já filtra pela categoria do produto.
    const daBusca = maisVendidos ? () => true : tituloDaBusca(q);
    const util = (o) => valido(o) && daBusca(o.titulo);
    // Dentro da categoria, basta citar o resto da busca ("samsung" em "celular samsung"); sem resto, vale a categoria toda
    const doResto = catsDaLoja?.resto ? tituloDaBusca(catsDaLoja.resto) : () => true;
    const vistos = new Set();
    const novo = (o) => !vistos.has(o.id) && vistos.add(o.id);
    const lista = [...naCategoria.map(converter).filter((o) => valido(o) && doResto(o.titulo) && novo(o)),
      ...todos.map(converter).filter((o) => util(o) && novo(o))];
    const nacionais = rapidos.map(converter).filter(util);
    // Se a API ignorar o filtro (devolve a mesma lista), não dá para saber: fica tudo como internacional
    const ignorou = nacionais.length === lista.length && nacionais.every((o, i) => o.id === lista[i]?.id);
    if (ignorou || !nacionais.length) return lista;
    const ids = new Set(nacionais.map((o) => o.id));
    const nacional = (o) => ({ ...o, internacional: false, envioNacional: true });
    // Os nacionais que não vieram na lista normal entram no fim
    return [...lista.map((o) => (ids.has(o.id) ? nacional(o) : o)),
      ...nacionais.filter((o) => !lista.some((l) => l.id === o.id)).map(nacional)];
  },

  // "Ofertas do dia": a lista de produtos em alta (hotproduct) é da "Advanced API". Enquanto ela não
  // estiver liberada, usa os mais vendidos com desconto de buscas das vitrines das categorias.
  // Nunca dá erro: a página inicial não pode depender da AliExpress.
  async destaques(env, pagina = 1) {
    if (avancadaLiberada) {
      try {
        const produtos = await consultar(env, "aliexpress.affiliate.hotproduct.query", {
          page_no: String(pagina),
          page_size: String(this.porPagina),
          fields: CAMPOS,
          sort: "LAST_VOLUME_DESC",
          ...parametrosBrasil(env),
        });
        const ofertas = produtos.map(converter).filter(valido);
        if (ofertas.length) return ofertas;
      } catch {
        avancadaLiberada = false;
      }
    }
    const buscas = buscasDasVitrines();
    const dia = Math.floor(Date.now() / 864e5);
    // As buscas vêm agrupadas por categoria: pula de um quarto em um quarto da lista para variar as categorias
    const passo = Math.max(1, Math.floor(buscas.length / BUSCAS_POR_PAGINA_DESTAQUE));
    const inicio = dia + (pagina - 1);
    const termos = Array.from({ length: BUSCAS_POR_PAGINA_DESTAQUE }, (_, i) => buscas[(inicio + i * passo) % buscas.length]);
    const listas = await Promise.all(termos.map((termo) => this.buscar(termo, env, 1, { maisVendidos: true })
      .then((lista) => separarAcessorios(lista, termo).filter((o) => !o.acessorio && o.desconto).slice(0, POR_BUSCA_DESTAQUE))
      .catch(() => [])));
    return Array.from({ length: POR_BUSCA_DESTAQUE }, (_, i) => listas.map((l) => l[i])).flat().filter(Boolean);
  },
};
