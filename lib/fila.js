// Fila das consultas às lojas num mesmo pedido (16/11/2026). O Cloudflare só deixa 6 conexões abertas por pedido; a
// AliExpress abria até 18 consultas de uma vez (3 páginas x principal + envio do Brasil + 4 da categoria) e a consulta
// do catálogo do Mercado Livre ficava 1 a 2,5 s esperando vaga (medido: sozinho o ML responde em ~0,6 s; com as outras
// lojas, 1 a 3 s). Shopee, AliExpress e Lomadee passam por esta fila (no máximo VAGAS ao mesmo tempo); o ML não passa,
// então sempre sobram vagas para ele. urgente = consulta principal da loja: passa na frente das extras.
export const VAGAS_DAS_OUTRAS_LOJAS = 4;
export function criarFila(vagas = VAGAS_DAS_OUTRAS_LOJAS) {
  let ocupadas = 0;
  const urgentes = [];
  const comuns = [];
  const proxima = () => {
    while (ocupadas < vagas && (urgentes.length || comuns.length)) {
      const { tarefa, ok, erro } = urgentes.length ? urgentes.shift() : comuns.shift();
      ocupadas++;
      Promise.resolve().then(tarefa).then(ok, erro).finally(() => { ocupadas--; proxima(); });
    }
  };
  return (tarefa, urgente = false) => new Promise((ok, erro) => {
    (urgente ? urgentes : comuns).push({ tarefa, ok, erro });
    proxima();
  });
}
// Sem fila (robô, testes, chamadas fora da busca): roda na hora
export const semFila = (tarefa) => tarefa();
