// Abre todos os arquivos do servidor (functions/ e lib/) para achar import quebrado (nome errado, função que sumiu),
// que o "node --check" não pega e só apareceria no ar. Rodado pelo GitHub a cada envio (.github/workflows/testes.yml).
import { readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const raiz = resolve(import.meta.dirname, "..");
const arquivos = (pasta) => readdirSync(pasta).flatMap((nome) => {
  const caminho = join(pasta, nome);
  if (statSync(caminho).isDirectory()) return arquivos(caminho);
  return /\.(m?js)$/.test(nome) ? [caminho] : [];
});

let erros = 0;
const todos = [...arquivos(join(raiz, "functions")), ...arquivos(join(raiz, "lib"))];
for (const arquivo of todos) {
  try {
    await import(pathToFileURL(arquivo).href);
  } catch (erro) {
    erros++;
    console.log(`✗ ${arquivo.slice(raiz.length + 1)}: ${erro.message}`);
  }
}
console.log(erros ? `✗ ${erros} arquivo(s) com erro` : `✓ ${todos.length} arquivos do servidor abrem sem erro`);
process.exitCode = erros ? 1 : 0;
