// Sugestões "produto + marca" (pedido do Giovanni, 31/10/2026: digitando "stanl" só apareciam garrafa e copo Stanley,
// mas a Stanley também tem parafusadeira, trena, jogo de soquetes…). O robô (robo/marcas.mjs) lê toda madrugada os
// títulos dos produtos que já passaram pelo site e conta, para cada marca, os produtos que mais aparecem com ela.
// Fica numa linha da tabela resumos; /api/vocabulario manda como termos ("parafusadeira stanley").
import { normalizar } from "./texto.js";
import { MARCAS, POPULARES, acentuarBusca } from "./vocabulario.js";
import { palavrasDeProduto, CARROS } from "./categorias.js";

export const CHAVE_RESUMO = "marcas-produtos";
const POR_MARCA = 6; // produtos sugeridos por marca
const MINIMO = 3; // vezes que o produto tem que aparecer com a marca
const PALAVRAS_OLHADAS = 6; // o produto costuma estar no começo do título
// Palavras das categorias que não são um produto sozinhas
const NAO_PRODUTO = new Set(`pet bebe eau de parfum toilette infantil masculino feminino gamer kids led smart mini
  kit conjunto jogo par unidade original novo nova premium profissional portatil eletrico eletrica sem fio ferramenta
  ferramentas acessorio acessorios peca pecas`.split(/\s+/).map(normalizar));

// Dicionário de produtos: palavras das categorias + termos populares (sem marca)
function dicionario() {
  const marcas = new Set([...MARCAS, ...CARROS].map(normalizar));
  const termos = [...palavrasDeProduto(), ...POPULARES].map(normalizar)
    .filter((t) => t.length >= 4 && !NAO_PRODUTO.has(t) && !t.split(" ").some((p) => marcas.has(p)));
  return [...new Set(termos)].sort((a, b) => b.split(" ").length - a.split(" ").length);
}

// titulos: títulos já normalizados. Devolve { stanley: ["garrafa termica", "parafusadeira", …], … } (mais vistos primeiro)
export function produtosPorMarca(titulos) {
  const marcas = [...new Set(MARCAS.map(normalizar))].filter((m) => m.length >= 3);
  const porPrimeira = new Map();
  for (const m of marcas) {
    const primeira = m.split(" ")[0];
    porPrimeira.set(primeira, [...(porPrimeira.get(primeira) || []), m]);
  }
  const produtos = dicionario();
  const conta = new Map();
  for (const t of titulos) {
    const palavras = t.split(" ");
    const texto = ` ${t} `;
    const achadas = new Set();
    for (const p of new Set(palavras)) for (const m of porPrimeira.get(p) || []) if (texto.includes(` ${m} `)) achadas.add(m);
    if (!achadas.size) continue;
    // Produto = o do dicionário que aparece primeiro nas primeiras palavras (o mais longo, se empatar)
    const comeco = ` ${palavras.slice(0, PALAVRAS_OLHADAS).join(" ")} `;
    let melhor = null;
    for (const d of produtos) {
      const i = comeco.indexOf(` ${d} `);
      if (i >= 0 && (!melhor || i < melhor.i)) melhor = { d, i };
    }
    if (!melhor) continue;
    // Outro produto logo depois ("Copo Liquidificador Mondial", "Anel de Vedação Panela…") = peça daquele produto: não conta
    const resto = ` ${comeco.slice(melhor.i + melhor.d.length + 2)} `;
    if (produtos.some((d) => d !== melhor.d && !melhor.d.includes(d) && resto.includes(` ${d} `))) continue;
    for (const m of achadas) {
      if (melhor.d.split(" ").includes(m)) continue;
      const porProduto = conta.get(m) || new Map();
      porProduto.set(melhor.d, (porProduto.get(melhor.d) || 0) + 1);
      conta.set(m, porProduto);
    }
  }
  const saida = {};
  for (const [m, porProduto] of conta) {
    // "garrafa" e "garrafa termica": fica só o mais visto dos dois
    const lista = [];
    for (const [d] of [...porProduto].filter(([, n]) => n >= MINIMO).sort((a, b) => b[1] - a[1])) {
      if (lista.length >= POR_MARCA) break;
      if (!lista.some((x) => ` ${x} `.includes(` ${d} `) || ` ${d} `.includes(` ${x} `))) lista.push(d);
    }
    if (lista.length) saida[m] = lista;
  }
  return saida;
}

// Termos para a caixa de busca: "parafusadeira stanley", com acento ("garrafa térmica stanley")
export function termosDeMarcas(porMarca) {
  const nomes = new Map(MARCAS.map((m) => [normalizar(m), m]));
  return Object.entries(porMarca || {}).flatMap(([m, lista]) => lista.map((d) => `${acentuarBusca(d)} ${nomes.get(m) || m}`));
}
