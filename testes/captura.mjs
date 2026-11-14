// Teste da leitura do botão "Enviar ao painel" (public/assets/painel-captura.js): node testes/captura.mjs
import { readFileSync } from "node:fs";
import vm from "node:vm";
vm.runInThisContext(readFileSync(new URL("../public/assets/painel-captura.js", import.meta.url), "utf8"));
const ler = globalThis.lerCaptura;
let falhas = 0;
function confere(nome, obtido, esperado) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) { falhas++; console.log(`✕ ${nome}\n   esperado ${JSON.stringify(esperado)}\n   veio     ${JSON.stringify(obtido)}`); }
  else console.log(`✓ ${nome}`);
}
const casos = [
  ["ML: rótulo e depois o valor", "www.mercadolivre.com.br\nMétricas\nCliques\n152\nOrdens\n3\nVendas\nR$ 1.234,56\nGanho estimado\nR$ 45,67\nTaxa de conversão 1,97%",
    { rede: "mercadolivre", achados: { pendente: 45.67, pedidos: 3 } }],
  ["ML: valor antes do rótulo", "mercadolivre.com.br\nR$ 12,30\nGanhos estimados\n7\nOrdens",
    { rede: "mercadolivre", achados: { pendente: 12.3, pedidos: 7 } }],
  ["ML: sem vendas", "www.mercadolivre.com.br\nGanho estimado R$ 0 Ordens 0 Cliques 31",
    { rede: "mercadolivre", achados: { pendente: 0, pedidos: 0 } }],
  ["Shein: pendente e pedidos", "br.shein.com\nRegistro de ganhos\nPendente\nR$ 8,90\nRenda\nR$ 20,00\nEste Mês\nPedidos\n2\nCliques 40",
    { rede: "shein", achados: { pendente: 8.9, pedidos: 2 } }],
  ["Site desconhecido", "painel.vaiprocarrinho.com.br\nComissões R$ 0,99", { rede: null, achados: {} }],
  ["Página sem os números", "www.mercadolivre.com.br\nEntre na sua conta", { rede: "mercadolivre", achados: {} }],
];
for (const [nome, texto, esperado] of casos) {
  const r = ler(texto);
  confere(nome, { rede: r.rede, achados: r.achados }, esperado);
}
console.log(falhas ? `\n${falhas} falha(s)` : "\nTudo certo");
process.exit(falhas ? 1 : 0);
