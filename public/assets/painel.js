// Painel do Giovanni (public/painel.html): busca os números em /api/painel/dados e monta os cartões, gráficos e listas.
// Nada de número fica nesta página: sem o login do Cloudflare Access a API não responde.
(() => {
  const $ = (id) => document.getElementById(id);
  const num = (n) => Number(n || 0).toLocaleString("pt-BR");
  const novas = (n, um, varios) => `${num(n)} ${n === 1 ? um : varios}`;
  const dataBr = (dia) => dia.split("-").reverse().slice(0, 2).join("/");
  const somaDesde = (lista, desde, ate = "9999") => lista.filter((d) => d.dia >= desde && d.dia <= ate).reduce((s, d) => s + d.n, 0);
  const diasAtras = (dia, n) => new Date(Date.parse(dia) - n * 864e5).toISOString().slice(0, 10);
  const ONDE = {
    oferta: "Botão da oferta", foto: "Foto do produto", detalhes: "Detalhes do produto", historico: "Histórico de preço",
    comparar: "Comparar", carrinho: "Carrinho", alerta: "Alerta de preço", cupom: "Cupom", "loja-parceira": "Lojas parceiras",
  };

  function el(tag, classe, texto) {
    const e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto !== undefined) e.textContent = texto;
    return e;
  }

  // Cartão com o número da semana e a comparação com a semana anterior
  function cartao(rotulo, valor, comparacao, classe = "") {
    const c = el("div", `cartao ${classe}`);
    c.append(el("div", "rotulo", rotulo), el("div", "valor", valor));
    if (comparacao) {
      const p = el("div", "comparacao");
      if (comparacao instanceof Node) p.append(comparacao); else p.textContent = comparacao;
      c.append(p);
    }
    return c;
  }
  function variacao(agora, antes) {
    const s = el("span");
    if (!antes) { s.textContent = "semana anterior: 0"; return s; }
    const pct = Math.round(((agora - antes) / antes) * 100);
    const forte = el("span", pct >= 0 ? "sobe" : "desce", `${pct >= 0 ? "▲" : "▼"} ${Math.abs(pct)}%`);
    s.append(forte, ` · semana anterior: ${num(antes)}`);
    return s;
  }

  // Dica que aparece ao passar o mouse (ou tocar) numa barra
  const dica = $("dica");
  function mostrarDica(alvo, texto) {
    const r = alvo.getBoundingClientRect();
    dica.textContent = texto;
    dica.hidden = false;
    const x = Math.min(Math.max(r.left + r.width / 2, 70), window.innerWidth - 70);
    dica.style.left = `${x}px`;
    dica.style.top = `${r.top + Math.max(0, r.height - (alvo.firstChild?.offsetHeight || 0))}px`;
  }
  const esconderDica = () => { dica.hidden = true; document.querySelectorAll(".coluna.ativa").forEach((c) => c.classList.remove("ativa")); };
  document.addEventListener("scroll", esconderDica, { passive: true });
  document.addEventListener("click", (e) => { if (!e.target.closest(".coluna")) esconderDica(); });

  // Barras por dia, com todos os dias do período (dia sem nada = barra vazia)
  function graficoPorDia(alvo, lista, desde, hoje, palavra) {
    alvo.replaceChildren();
    const mapa = new Map(lista.map((d) => [d.dia, d.n]));
    const dias = [];
    for (let d = desde; d <= hoje; d = diasAtras(d, -1)) dias.push(d);
    const max = Math.max(0, ...dias.map((d) => mapa.get(d) || 0));
    if (!max) { alvo.append(el("p", "vazio", "Ainda sem números neste período.")); return; }
    const area = el("div", "area");
    const linha = el("div", "linha-max");
    linha.append(el("span", "", num(max)));
    area.append(linha);
    for (const d of dias) {
      const n = mapa.get(d) || 0;
      const coluna = el("div", `coluna${d === hoje ? " hoje" : ""}`);
      const barra = el("div", "barra");
      barra.style.height = `${(n / max) * 100}%`;
      coluna.append(barra);
      const texto = `${dataBr(d)}${d === hoje ? " (hoje, até agora)" : ""}: ${num(n)} ${palavra}`;
      coluna.setAttribute("aria-label", texto);
      coluna.addEventListener("mouseenter", () => mostrarDica(coluna, texto));
      coluna.addEventListener("mouseleave", esconderDica);
      coluna.addEventListener("click", () => { esconderDica(); coluna.classList.add("ativa"); mostrarDica(coluna, texto); });
      area.append(coluna);
    }
    const eixo = el("div", "eixo");
    eixo.append(el("span", "", dataBr(dias[0])), el("span", "", dataBr(dias[Math.floor(dias.length / 2)])), el("span", "", "hoje"));
    alvo.append(area, eixo);
  }

  // Lista "nome ........ número" com barrinha proporcional
  function lista(alvo, itens, nome = (i) => i.nome, extra = null) {
    alvo.replaceChildren();
    if (!itens.length) { alvo.append(el("li", "vazio", "Nada ainda.")); return; }
    const max = Math.max(...itens.map((i) => i.n));
    for (const i of itens) {
      const li = el("li");
      const n = el("span", "nome", nome(i));
      n.title = nome(i);
      if (extra) { n.append(" "); n.append(el("small", "", extra(i))); }
      const trilho = el("span", "trilho");
      const barra = el("i");
      barra.style.width = `${Math.max(2, (i.n / max) * 100)}%`;
      trilho.append(barra);
      li.append(n, el("span", "n", num(i.n)), trilho);
      alvo.append(li);
    }
  }

  function saude(d) {
    const itens = [];
    const horas = d.prontas.ultima ? Math.round((Date.now() - d.prontas.ultima) / 36e5) : null;
    itens.push([d.prontas.total >= 300 ? "✅" : "⚠️", `${num(d.prontas.total)} buscas prontas guardadas`,
      horas === null ? "nenhuma guardada ainda" : `a mais nova foi guardada há ${horas} h (o normal é ~450 depois do robô)`]);
    const ontem = diasAtras(d.hoje, 1);
    itens.push([d.ultimaColeta && d.ultimaColeta >= ontem ? "✅" : "⚠️", "Coleta de preços (histórico)",
      d.ultimaColeta ? `última: ${dataBr(d.ultimaColeta)}` : "sem registro"]);
    const produtos = d.lojasAwin.reduce((s, l) => s + l.n, 0);
    itens.push(["🏬", `${num(d.lojasAwin.length)} lojas da Awin no banco`, `${num(produtos)} produtos`]);
    itens.push(["🤖", "Robô da madrugada", "o resumo de cada noite fica no GitHub (Actions → Robô de preços); em breve aqui"]);
    const ul = $("saude");
    ul.replaceChildren();
    for (const [icone, titulo, detalhe] of itens) {
      const li = el("li");
      const corpo = el("div", "", titulo);
      corpo.append(el("small", "", detalhe));
      li.append(el("span", "icone", icone), corpo);
      ul.append(li);
    }
  }

  function montar(d) {
    const semana = diasAtras(d.hoje, 6);
    const antes = diasAtras(d.hoje, 13);
    const ontemAntes = diasAtras(d.hoje, 7);
    const buscas = somaDesde(d.buscasDia, semana);
    const cliques = somaDesde(d.cliquesDia, semana);
    $("cartoes").replaceChildren(
      cartao("Buscas · 7 dias", num(buscas), variacao(buscas, somaDesde(d.buscasDia, antes, ontemAntes))),
      cartao("Cliques para as lojas · 7 dias", num(cliques), variacao(cliques, somaDesde(d.cliquesDia, antes, ontemAntes))),
      cartao("Contas criadas", num(d.contas.total), `${novas(d.contas.semana, "nova", "novas")} na semana`),
      cartao("Alertas de preço", num(d.alertas.total), `${novas(d.alertas.semana, "novo", "novos")} · ${novas(d.carrinhos, "carrinho", "carrinhos")} com produto`),
      cartao("Visitas", "Em breve", "falta uma chave do Cloudflare", "breve"),
      cartao("Comissões do mês", "Em breve", "Shopee, AliExpress, Awin e Lomadee", "breve"),
    );
    graficoPorDia($("g-buscas"), d.buscasDia, d.desde, d.hoje, "buscas");
    graficoPorDia($("g-cliques"), d.cliquesDia, d.desde, d.hoje, "cliques");
    lista($("l-buscas"), d.topBuscas);
    lista($("l-lojas"), d.cliquesLoja);
    lista($("l-produtos"), d.topProdutos, (i) => i.nome, (i) => `· ${i.loja}`);
    lista($("l-onde"), d.cliquesOnde, (i) => ONDE[i.nome] || i.nome);
    lista($("l-awin"), d.lojasAwin);
    saude(d);
  }

  async function carregar() {
    $("erro").hidden = true;
    $("atualizado").textContent = "Carregando…";
    try {
      const r = await fetch("/api/painel/dados", { cache: "no-store", credentials: "same-origin" });
      if (r.status === 403 || r.redirected) throw new Error("O login expirou. Recarregue a página e entre de novo com o código do e-mail.");
      if (!r.ok) throw new Error(`O servidor respondeu ${r.status}. Tente de novo em instantes.`);
      const d = await r.json();
      montar(d);
      $("atualizado").textContent = `Atualizado às ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
    } catch (e) {
      $("erro").textContent = e instanceof SyntaxError ? "O login expirou. Recarregue a página e entre de novo." : e.message;
      $("erro").hidden = false;
      $("atualizado").textContent = "Não foi possível carregar";
    }
  }

  $("recarregar").addEventListener("click", carregar);
  carregar();
})();
