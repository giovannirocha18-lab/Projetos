// Trava da categoria aberta (22/11/2026: "Vestidos" em Moda feminina mostrou livros com "vestido" no nome).
// Confere a função do site (public/assets/app.js, entre os marcadores) e que os caminhos que juntam produto a uma
// categoria aberta passam por ela. Rodar antes de publicar: node testes/categoria.mjs
import fs from "node:fs";
const app = fs.readFileSync(new URL("../public/assets/app.js", import.meta.url), "utf8");
const a = app.indexOf("// >>> trava da categoria"), b = app.indexOf("// <<< trava da categoria");
if (a < 0 || b < 0) { console.error("✗ marcadores da trava não encontrados em app.js"); process.exit(1); }
const [entra, guardarRegras] = new Function(app.slice(a, b) + "; return [entraNaCategoriaAberta, guardarRegrasDoServidor];")();
// As regras do servidor chegam ao site pela lista de categorias (/api/em-alta, campo "fora")
const { todasCategorias } = await import("../lib/categorias.js");
guardarRegras(todasCategorias([]));
const casos = [
  [{ titulo: "Vestido Longo Feminino Festa", secao: "Moda feminina" }, "Moda feminina", false, true],
  [{ titulo: "Livro - Um Crocodilo De Vestido" }, "Moda feminina", false, false],
  [{ titulo: "Vestido bebê com body raposinha" }, "Moda feminina", false, false],
  [{ titulo: "Vestido Pet Cachorro", secao: "Pets" }, "Moda feminina", false, false],
  [{ titulo: "Vestido Infantil Menina", secao: "Moda infantil" }, "Moda feminina", true, false],
  [{ titulo: "Vestido usado", secao: "Moda feminina", usado: true }, "Moda feminina", false, false],
  [{ titulo: "Vestido", secao: "Moda feminina", naoBuscado: true }, "Moda feminina", false, false],
  [{ titulo: "Jogo de Tabuleiro War" }, "Brinquedos", true, true],
  [{ titulo: "Livro Jogo de Tabuleiro" }, "Brinquedos", true, false],
  [{ titulo: "Jogo adulto para casal" }, "Brinquedos", true, false],
  [{ titulo: "Jogo de bebida drink" }, "Brinquedos", true, false],
  [{ titulo: "Freezer Horizontal Consul", secao: "Eletrodomésticos" }, "Eletrodomésticos", false, true],
  [{ titulo: "Freezer de brinquedo", secao: "Brinquedos" }, "Eletrodomésticos", false, false],
  // 23/11/2026: coisa de carro/moto só em Automotivo
  [{ titulo: "Fita de LED para Porta-Malas de Carro 4M, Luz RGB", secao: "Iluminação LED" }, "Iluminação LED", false, false],
  [{ titulo: "Espelho Auxiliar Convexo Moto Carro Elimina Ponto Cego", secao: "Decoração" }, "Decoração", false, false],
  [{ titulo: "Fita LED 5 Metros RGB Com Controle", secao: "Iluminação LED" }, "Iluminação LED", false, true],
  [{ titulo: "Quadro Decorativo 3D Carro Red 2023", secao: "Decoração" }, "Decoração", false, true],
  [{ titulo: "Carregador Veicular Turbo 3 USB", secao: "Carregadores" }, "Carregadores", false, true],
  [{ titulo: "Central Multimídia Automotiva Android", secao: "Automotivo" }, "Automotivo", false, true],
  [{ titulo: "Vestido Curto de Verão em Algodão com Decote Quadrado e Halter", secao: "Esporte e fitness" }, "Esporte e fitness", false, false],
  [{ titulo: "Halter Emborrachado 6kg Preto", secao: "Esporte e fitness" }, "Esporte e fitness", false, true],
  // 23/11/2026 (varredura): a trava usa a regra do servidor
  [{ titulo: "Mixer de Áudio FIFINE SC8 com Iluminação RGB", secao: "Eletroportáteis" }, "Eletroportáteis", false, false],
  [{ titulo: "Mixer Philips Walita Daily 400W", secao: "Eletroportáteis" }, "Eletroportáteis", false, true],
  [{ titulo: "Touca de banho impermeável", secao: "Bonés e chapéus" }, "Bonés e chapéus", false, false],
  [{ titulo: "Escova de Limpeza para Tubulação de Secadora", secao: "Cabelo" }, "Cabelo", false, false],
];
let erros = 0;
for (const [o, cat, sem, esperado] of casos) {
  const veio = entra(o, cat, sem);
  if (veio !== esperado) { erros++; console.error(`✗ "${o.titulo}" em ${cat}: esperado ${esperado}, veio ${veio}`); }
}
// Todo lugar que junta produto buscado por trás a uma categoria aberta tem que usar a trava
for (const nome of ["completarTipoDaCategoria", "juntarDaMarca"]) {
  const i = app.indexOf(`function ${nome}(`);
  const corpo = app.slice(i, app.indexOf("\n}\n", i));
  if (i < 0 || !corpo.includes("entraNaCategoriaAberta(")) { erros++; console.error(`✗ ${nome} não passa pela trava da categoria`); }
}
// Tipo que aceita produto sem categoria (4º item true) é exceção: tem que estar nesta lista, de propósito
const permitidos = new Set(["Brinquedos|Jogos"]);
const t0 = app.indexOf("const TIPOS_DAS_CATEGORIAS = {"), t1 = app.indexOf("const BUSCAS_DE_GAMES");
const TIPOS = new Function(app.slice(t0, t1) + "; return TIPOS_DAS_CATEGORIAS;")();
for (const [cat, lista] of Object.entries(TIPOS)) for (const [nome, re, busca, sem] of lista) {
  if (!(re instanceof RegExp) || !busca) { erros++; console.error(`✗ tipo mal escrito: ${cat} → ${nome}`); }
  if (sem && !permitidos.has(`${cat}|${nome}`)) { erros++; console.error(`✗ ${cat} → ${nome} aceita produto sem categoria sem estar na lista de exceções do teste`); }
}
if (erros) process.exit(1);
console.log(`✓ Trava da categoria certa (${casos.length} casos, ${Object.keys(TIPOS).length} categorias com tipos)`);
