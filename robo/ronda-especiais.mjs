// Ronda das Quedas de preço e da Black Friday (pedido do Giovanni, 25/11/2026, depois do cesto de golfe e da raquete de
// tênis de mesa em Quedas > Calçados). Essas duas páginas guardam a categoria que o produto tinha na busca em que foi
// achado; a ronda das categorias (robo/ronda-categorias.mjs) não passa por elas. Aqui: baixa as duas listas inteiras pelo
// site NO AR e acusa o produto cuja categoria ninguém confirma:
//   ✗ sem prova: o nome não é da categoria e a IA não disse que é (veio só do mapa aprendido da loja ou da busca);
//   ✗ contra: o nome e o mapa da loja dizem, os dois, OUTRA categoria.
// Uso: node robo/ronda-especiais.mjs            → as duas páginas (~5 min)
//      node robo/ronda-especiais.mjs quedas     → só as Quedas de preço
// É lista para LER (toda madrugada): o que for intruso de verdade ganha regra em NAO_E_DA_CATEGORIA (lib/categorias.js)
// com caso em testes/busca.mjs. Não conta visita (cookie vpc_nao_contar). Sai sempre com código 0.
import { categoriaDoProduto, categoriaPorNome } from "../lib/categorias.js";
import { normalizar } from "../lib/texto.js";
const SITE = process.env.SITE || "https://vaiprocarrinho.com.br";
const PAGINAS = { quedas: "/api/quedas", "black-friday": "/api/black-friday" };
const pedidas = process.argv.slice(2).filter((x) => PAGINAS[x]);
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function baixar(caminho) {
  const todas = [];
  for (let pagina = 1; pagina <= 220; pagina++) {
    let dados = null;
    for (let tentativa = 0; tentativa < 3 && !dados; tentativa++) {
      try {
        const r = await fetch(`${SITE}${caminho}?pagina=${pagina}`, { headers: { Cookie: "vpc_nao_contar=1" } });
        if (r.ok) dados = await r.json();
      } catch { /* tenta de novo */ }
      if (!dados) await espera(4000);
    }
    if (!dados) break;
    todas.push(...(dados.ofertas || []));
    if (!dados.temMais) break;
    await espera(1200); // a regra "Limite API" do Cloudflare barra rajada
  }
  return todas;
}

// O nome prova a categoria: a classificação pelo título dá a mesma, ou uma palavra da categoria está no nome
function nomeProva(titulo, nome) {
  if (categoriaDoProduto(titulo)?.nome === nome) return true;
  const t = ` ${normalizar(titulo)} `;
  return (categoriaPorNome(nome)?.palavras || []).some((p) => t.includes(` ${normalizar(p)}`));
}

// Nomes que são da categoria sem ter palavra dela (davam alarme falso na 1ª ronda, 25/11/2026)
const CONHECIDOS = {
  "Calçados": /chuteira/, "Móveis": /puff?s?\b|cama box|painel/, "Ferramentas": /pulverizador|pistola|esquadro|chaves? /,
  "Cama e banho": /colch(ao|oes)/, Automotivo: /tanque|carburador|motor/, Suplementos: /magnesio|melatonina/,
  "Eletrodomésticos": /suporte (universal )?(de |para )?tv/, Brinquedos: /funko|jogo da memoria|inflavel/,
};
const linhas = [];
for (const pagina of pedidas.length ? pedidas : Object.keys(PAGINAS)) {
  const ofertas = await baixar(PAGINAS[pagina]);
  const semProva = [], contra = [];
  let comSecao = 0;
  for (const o of ofertas) {
    if (!o.secao || o.loja === "mercadolivre" && !o.catMapa && !o.catIa) { if (o.secao) comSecao++; continue; }
    comSecao++;
    const peloNome = categoriaDoProduto(o.titulo || "")?.nome || "";
    const linha = `[${o.secao}] ${o.loja}: ${(o.titulo || "").slice(0, 80)}`;
    if (peloNome && peloNome !== o.secao && o.catMapa === peloNome && o.catIa !== o.secao) contra.push(`${linha} (nome e loja dizem ${peloNome})`);
    else if (o.catIa !== o.secao && !nomeProva(o.titulo || "", o.secao) && !CONHECIDOS[o.secao]?.test(normalizar(o.titulo || ""))) semProva.push(`${linha}${peloNome ? ` (pelo nome seria ${peloNome})` : ""}`);
  }
  linhas.push(`Ronda de ${pagina}: ${ofertas.length} produtos lidos, ${comSecao} com categoria.`,
    `  Categoria que ninguém confirma: ${semProva.length}`, ...semProva.slice(0, 80).map((x) => `    ✗ ${x}`),
    `  Nome e loja dizem outra categoria: ${contra.length}`, ...contra.slice(0, 40).map((x) => `    ✗ ${x}`));
}
console.log(linhas.join("\n"));
