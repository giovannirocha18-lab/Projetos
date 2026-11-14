// Leitura do texto que o botão de favoritos "Enviar ao painel" traz do painel de afiliados do Mercado Livre ou da Shein
// (14/11/2026). O botão só copia o texto da tela (no navegador do Giovanni, já logado) e abre o painel com ele no endereço
// (#captura=); quem entende os números é este arquivo, para dar para ajustar sem trocar o favorito. Nenhuma senha passa aqui.
// Teste: node testes/captura.mjs
(function () {
  const VALOR = "(\\d{1,3}(?:\\.\\d{3})+(?:,\\d{1,2})?|\\d+(?:,\\d{1,2})?)";
  const DINHEIRO = new RegExp(`R\\$\\s*${VALOR}`, "g");
  const INTEIRO = /(?<![\d.,$]|R\$\s?)(\d{1,3}(?:\.\d{3})+|\d+)(?![\d.,]*\d|\s*%|[.,]\d)/g;
  const numero = (s) => Number(String(s).replace(/\./g, "").replace(",", "."));
  const PERTO = 90; // caracteres entre o nome do quadro e o número dele

  // O número do quadro: o primeiro DEPOIS do rótulo (o comum) ou, se não houver, o último ANTES dele
  function perto(texto, rotulos, padrao) {
    for (const rotulo of rotulos) {
      const acha = new RegExp(rotulo.source, "gi");
      for (let m; (m = acha.exec(texto)); ) {
        const depois = texto.slice(m.index + m[0].length, m.index + m[0].length + PERTO);
        const d = [...depois.matchAll(padrao)][0];
        if (d) return numero(d[1]);
      }
      acha.lastIndex = 0;
      for (let m; (m = acha.exec(texto)); ) {
        const antes = [...texto.slice(Math.max(0, m.index - PERTO), m.index).matchAll(padrao)].pop();
        if (antes) return numero(antes[1]);
      }
    }
    return undefined;
  }
  const semDinheiro = (texto) => texto.replace(DINHEIRO, " R$ ");

  const REDES = {
    mercadolivre: {
      nome: "Mercado Livre", host: /mercadoli[vb]re/i,
      // Afiliados → Métricas: o "ganho estimado" do período é o que ainda vai ser pago (pendente)
      pendente: [/ganhos?\s+estimados?/, /comiss(?:ão|ões)\s+estimadas?/, /ganhos?(?:\s+totais|\s+total)?/],
      aprovada: [/ganhos?\s+(?:confirmados?|aprovados?|liberados?)/, /dinheiro\s+dispon[ií]vel/],
      pedidos: [/ordens/, /vendas\s+(?:confirmadas|realizadas)/, /unidades\s+vendidas/, /pedidos/],
    },
    shein: {
      nome: "Shein", host: /shein/i,
      // Centro de Afiliados: "Pendente" (a "Renda" mistura bônus de boas-vindas: fica como está salva)
      pendente: [/pendente/],
      aprovada: [],
      pedidos: [/(?:n[úu]mero|total)\s+de\s+pedidos/, /pedidos/],
    },
  };

  // texto = "<endereço do site>\n<texto da tela>". Devolve { rede, nome, achados: { pendente?, aprovada?, pedidos? }, texto }
  function lerCaptura(bruto) {
    const tudo = String(bruto || "");
    const quebra = tudo.indexOf("\n");
    const host = (quebra < 0 ? tudo : tudo.slice(0, quebra)).trim().toLowerCase();
    const texto = quebra < 0 ? "" : tudo.slice(quebra + 1);
    const rede = Object.keys(REDES).find((r) => REDES[r].host.test(host));
    if (!rede) return { rede: null, host, achados: {}, texto };
    const regra = REDES[rede];
    const achados = {};
    for (const campo of ["pendente", "aprovada"]) {
      const v = perto(texto, regra[campo], DINHEIRO);
      if (v !== undefined && v < 1e7) achados[campo] = v;
    }
    const pedidos = perto(semDinheiro(texto), regra.pedidos, INTEIRO);
    if (pedidos !== undefined && pedidos < 1e6) achados.pedidos = pedidos;
    return { rede, nome: regra.nome, host, achados, texto };
  }

  globalThis.lerCaptura = lerCaptura;
})();
