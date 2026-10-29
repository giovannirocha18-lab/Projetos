// Categoria dada pela IA (Claude Haiku 5.5) a cada título de produto (pedido do Giovanni, 29/10/2026).
// O robô (robo/ia.mjs) classifica em lote toda madrugada e guarda na tabela ia_categorias; a chave é o título
// normalizado, então vale para qualquer loja (Awin, Shopee, AliExpress, Lomadee) que mande o mesmo título.
import { normalizar } from "./texto.js";

// Trocar quando mudar o pedido feito à IA (lista de categorias, regras): o robô classifica tudo de novo
export const VERSAO_IA = 1;
export const SEM_CATEGORIA = "Outros";
export const chaveIa = (titulo) => normalizar(titulo).slice(0, 160);

export const TABELAS_IA = [
  `CREATE TABLE IF NOT EXISTS ia_categorias (chave TEXT PRIMARY KEY, categoria TEXT NOT NULL, versao INTEGER NOT NULL, quando INTEGER NOT NULL)`,
  // Lote enviado e ainda não lido (o lote leva de minutos a horas; a madrugada seguinte lê o resultado)
  `CREATE TABLE IF NOT EXISTS ia_lotes (id TEXT PRIMARY KEY, criado INTEGER NOT NULL, aberto INTEGER NOT NULL, titulos INTEGER NOT NULL)`,
  // Títulos de cada pedido do lote, na ordem em que foram numerados para a IA
  `CREATE TABLE IF NOT EXISTS ia_pedidos (lote TEXT NOT NULL, pedido TEXT NOT NULL, titulos TEXT NOT NULL, PRIMARY KEY (lote, pedido))`,
];
