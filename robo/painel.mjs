// Resumo do robô para o painel do Giovanni (03/11/2026). Cada passo do robô chama paraPainel() com 2 a 6 linhas curtas;
// isso vira uma "saída" do passo no GitHub Actions ($GITHUB_OUTPUT). No fim da execução, o job "relatorio" do
// robo-precos.yml junta as saídas de todos os passos e grava uma linha no banco (robo/relatorio.mjs, tabela
// robo_execucoes), que o painel mostra na aba "Robô". Fora do GitHub (teste local) não faz nada.
import { appendFileSync } from "node:fs";

const limpar = (s) => String(s ?? "").replace(/\*\*/g, "").replace(/^\s*-\s*/, "").trim().slice(0, 300);

// chave: nome da saída (letras e _); linhas: o que aconteceu; avisos: o que precisa de atenção (aparece em amarelo)
export function paraPainel(chave, { linhas = [], avisos = [] } = {}) {
  const dados = {
    linhas: linhas.filter(Boolean).map(limpar).filter(Boolean).slice(0, 8),
    avisos: avisos.filter(Boolean).map(limpar).filter(Boolean).slice(0, 15),
  };
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${chave}=${JSON.stringify(dados)}\n`);
  return dados;
}
