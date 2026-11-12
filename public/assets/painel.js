// Painel do Giovanni (public/painel.html). Três seções no menu do topo: Métricas (/api/painel/dados), Comissões
// (/api/painel/comissoes?mes=AAAA-MM) e Robô (o resumo de cada execução do robô, que também vem em /api/painel/dados). Nada de número fica nesta página: sem o login do Cloudflare Access a API não responde.
(() => {
  const $ = (id) => document.getElementById(id);
  const SVG = "http://www.w3.org/2000/svg";
  const num = (n) => Number(n || 0).toLocaleString("pt-BR");
  const plural = (n, um, varios) => `${num(n)} ${n === 1 ? um : varios}`;
  const dataBr = (dia) => dia.split("-").reverse().slice(0, 2).join("/");
  const diasAtras = (dia, n) => new Date(Date.parse(dia) - n * 864e5).toISOString().slice(0, 10);
  const somaDesde = (lista, desde, ate = "9999") => (lista || []).filter((d) => d.dia >= desde && d.dia <= ate).reduce((s, d) => s + d.n, 0);
  const hojeBr = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  const dinheiro = (v, moeda = "BRL") => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: moeda });
  const ONDE = {
    oferta: "Botão da oferta", foto: "Foto do produto", detalhes: "Detalhes do produto", historico: "Histórico de preço",
    comparar: "Comparar", carrinho: "Carrinho", alerta: "Alerta de preço", cupom: "Cupom", "loja-parceira": "Lojas parceiras",
  };
  const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  // Cores dos aparelhos (identidade, ordem fixa; legíveis no fundo preto)
  const CORES_APARELHO = { Celular: "#8b5cf6", Computador: "#22d3ee", Tablet: "#f59e0b" };
  const SITUACAO = { aprovada: "Aprovada", pendente: "Pendente", cancelada: "Cancelada" };

  function el(tag, classe, texto) {
    const e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto !== undefined && texto !== null) e.textContent = texto;
    return e;
  }
  function svg(tag, atributos = {}) {
    const e = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(atributos)) e.setAttribute(k, v);
    return e;
  }

  // ▲ 12% / ▼ 5% / novo / —
  function variacao(agora, antes) {
    if (!antes && !agora) return el("span", "var igual", "—");
    if (!antes) return el("span", "var sobe", "▲ novo");
    const pct = Math.round(((agora - antes) / antes) * 100);
    if (pct === 0) return el("span", "var igual", "0%");
    return el("span", `var ${pct > 0 ? "sobe" : "desce"}`, `${pct > 0 ? "▲" : "▼"} ${Math.abs(pct)}%`);
  }
  const tendencia = (agora, antes) => (agora > antes ? "sobe" : agora < antes ? "desce" : "igual");

  // Dica que aparece ao passar o mouse (ou tocar)
  const dica = $("dica");
  function mostrarDica(x, y, texto) {
    dica.textContent = texto;
    dica.hidden = false;
    dica.style.left = `${Math.min(Math.max(x, 80), window.innerWidth - 80)}px`;
    dica.style.top = `${y}px`;
  }
  const esconderDica = () => { dica.hidden = true; };
  document.addEventListener("scroll", esconderDica, { passive: true });
  document.addEventListener("click", esconderDica);
  function comDica(alvo, texto) {
    const mostrar = () => { const r = alvo.getBoundingClientRect(); mostrarDica(r.left + r.width / 2, r.top + r.height - (alvo.firstChild?.offsetHeight || r.height), texto); };
    alvo.addEventListener("mouseenter", mostrar);
    alvo.addEventListener("mouseleave", esconderDica);
    alvo.addEventListener("click", (e) => { e.stopPropagation(); mostrar(); });
  }

  // Mini-gráfico de 7 dias (verde se subiu em relação à semana anterior, vermelho se caiu)
  function minigrafico(serie, classe) {
    const s = svg("svg", { viewBox: "0 0 100 30", preserveAspectRatio: "none", "aria-hidden": "true" });
    const max = Math.max(1, ...serie);
    const pontos = serie.map((v, i) => `${(i / Math.max(1, serie.length - 1)) * 100},${28 - (v / max) * 26}`).join(" ");
    s.append(svg("polyline", { points: pontos, class: `linha ${classe}`, "vector-effect": "non-scaling-stroke" }));
    return s;
  }

  // Quadro: rótulo, número grande e ▲▼%
  function quadro(rotulo, valor, extra, nota, classe = "") {
    const q = el("div", `quadro ${classe}`);
    const v = el("div", "valor");
    if (valor === null) v.append(el("span", "breve", "Em breve")); else v.append(el("strong", "", valor));
    if (extra) v.append(extra);
    q.append(el("div", "rotulo", rotulo), v);
    if (nota) q.append(el("div", "nota", nota));
    return q;
  }

  // Gráfico de área (linha + preenchimento), com mira e dica. dias = ["2026-11-01", …], valores = números
  function graficoDeArea(area, dias, valores, textoDica, formatarEixo = num) {
    area.replaceChildren();
    const L = area.clientWidth || 600;
    const A = area.clientHeight || 260;
    const m = { e: 6, d: 56, c: 10, b: 24 };
    const maior = Math.max(...valores);
    const passo = maior >= 3 ? Math.ceil((maior * 1.1) / 3) : Math.max(0.01, (maior * 1.1) / 3);
    const topo = passo * 3;
    const ultimo = dias.length - 1;
    const x = (i) => m.e + (i / Math.max(1, ultimo)) * (L - m.e - m.d);
    const y = (v) => m.c + (1 - v / topo) * (A - m.c - m.b);
    const g = svg("svg", { viewBox: `0 0 ${L} ${A}`, role: "img", "aria-label": "Gráfico por dia" });
    const id = `preenche-${area.id}`;
    const defs = svg("defs");
    const grad = svg("linearGradient", { id, x1: 0, y1: 0, x2: 0, y2: 1 });
    grad.append(svg("stop", { offset: "0%", "stop-color": "#8b5cf6", "stop-opacity": ".35" }), svg("stop", { offset: "100%", "stop-color": "#8b5cf6", "stop-opacity": "0" }));
    defs.append(grad);
    g.append(defs);
    const grade = svg("g", { class: "grade" });
    for (let k = 0; k <= 3; k++) {
      grade.append(svg("line", { x1: m.e, x2: L - m.d, y1: y(passo * k), y2: y(passo * k) }));
      const t = svg("text", { x: L - m.d + 8, y: y(passo * k) + 4 });
      t.textContent = formatarEixo(passo * k);
      grade.append(t);
    }
    g.append(grade);
    const eixo = svg("g", { class: "eixo" });
    // Até 7 dias: todos (tela estreita: um sim, outro não); mais que isso: 4 datas
    const marcas = dias.length <= 7 ? dias.map((_, i) => i).filter((i) => L >= 480 || i % 2 === ultimo % 2)
      : [0, Math.round(ultimo / 3), Math.round((ultimo * 2) / 3), ultimo];
    for (const i of marcas) {
      const t = svg("text", { x: x(i), y: A - 6, "text-anchor": i === 0 ? "start" : i === ultimo ? "end" : "middle" });
      t.textContent = dias[i] === hojeBr() ? "hoje" : dataBr(dias[i]);
      eixo.append(t);
    }
    g.append(eixo);
    const caminho = valores.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
    g.append(svg("path", { d: `${caminho} L${x(ultimo)},${y(0)} L${x(0)},${y(0)} Z`, fill: `url(#${id})` }));
    g.append(svg("path", { d: caminho, class: "linha" }));
    const mira = svg("line", { class: "mira", y1: m.c, y2: y(0), visibility: "hidden" });
    const ponto = svg("circle", { class: "ponto", r: 5, visibility: "hidden" });
    const alvo = svg("rect", { x: 0, y: 0, width: L, height: A, fill: "transparent" });
    g.append(mira, ponto, alvo);
    const mover = (evento) => {
      const r = g.getBoundingClientRect();
      const px = ((evento.clientX - r.left) / r.width) * L;
      const i = Math.max(0, Math.min(ultimo, Math.round(((px - m.e) / (L - m.e - m.d)) * ultimo)));
      for (const [k, v] of [["x1", x(i)], ["x2", x(i)], ["visibility", "visible"]]) mira.setAttribute(k, v);
      for (const [k, v] of [["cx", x(i)], ["cy", y(valores[i])], ["visibility", "visible"]]) ponto.setAttribute(k, v);
      mostrarDica(r.left + (x(i) / L) * r.width, r.top + (y(valores[i]) / A) * r.height, textoDica(i));
    };
    const sair = () => { mira.setAttribute("visibility", "hidden"); ponto.setAttribute("visibility", "hidden"); esconderDica(); };
    alvo.addEventListener("pointermove", mover);
    alvo.addEventListener("pointerdown", mover);
    alvo.addEventListener("pointerleave", sair);
    area.append(g);
  }

  function linhaDeTabela(celulas) {
    const tr = el("tr");
    for (const [conteudo, classe] of celulas) {
      const td = el("td", classe || "");
      if (conteudo instanceof Node) td.append(conteudo); else td.textContent = conteudo;
      if (/nome|produto/.test(classe || "")) td.title = td.textContent;
      tr.append(td);
    }
    return tr;
  }
  function vazioNaTabela(tbody, colunas, texto) {
    const td = el("td", "vazio", texto);
    td.colSpan = colunas;
    const tr = el("tr");
    tr.append(td);
    tbody.replaceChildren(tr);
  }
  function mini(serie, agora, antes) {
    const s = el("span");
    s.append(minigrafico(serie, tendencia(agora, antes)));
    return s;
  }
  function lista(alvo, itens, nome = (i) => i.nome, extra = null) {
    alvo.replaceChildren();
    if (!itens || !itens.length) { alvo.append(el("li", "vazio", "Nada ainda.")); return; }
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

  // =================================== MÉTRICAS ===================================

  function faixa(d) {
    const produtos = d.lojasAwin.reduce((s, l) => s + l.n, 0);
    const itens = [
      ["Lojas da Awin", num(d.lojasAwin.length)], ["Produtos da Awin", num(produtos)], ["Buscas prontas", num(d.prontas.total)],
      ["Contas", num(d.contas.total)], ["Alertas de preço", num(d.alertas.total)], ["Carrinhos", num(d.carrinhos)],
      ["Última coleta de preços", d.ultimaColeta ? dataBr(d.ultimaColeta) : "—"],
    ];
    $("faixa").replaceChildren(...itens.map(([k, v]) => { const s = el("span", "", `${k}: `); s.append(el("b", "", v)); return s; }));
  }

  function resumo(d, p) {
    const v = d.visitas || {};
    const buscas = somaDesde(d.buscasDia, p.semana);
    const cliques = somaDesde(d.cliquesDia, p.semana);
    const visitas = somaDesde(v.porDia, p.semana);
    $("resumo").replaceChildren(
      v.erro ? quadro("Visitas", "—", null, v.erro, "cor-azul") : quadro("Visitas", num(visitas), variacao(visitas, somaDesde(v.porDia, p.antes, p.fimAntes)), null, "cor-azul"),
      quadro("Buscas", num(buscas), variacao(buscas, somaDesde(d.buscasDia, p.antes, p.fimAntes)), null, "cor-roxo"),
      quadro("Cliques para as lojas", num(cliques), variacao(cliques, somaDesde(d.cliquesDia, p.antes, p.fimAntes)), "contados desde 03/11", "cor-ciano"),
      quadroDaComissao(),
      quadro("Contas criadas", num(d.contas.total), null, `${plural(d.contas.semana, "nova", "novas")} na semana`, "cor-amarelo"),
      quadro("Alertas de preço", num(d.alertas.total), null, `${plural(d.alertas.semana, "novo", "novos")} na semana`, "cor-vermelho"),
    );
  }

  function emAlta(d) {
    const ol = $("em-alta");
    ol.replaceChildren();
    if (!d.topBuscas.length) { ol.append(el("li", "vazio", "Nenhuma busca nesta semana.")); return; }
    d.topBuscas.slice(0, 7).forEach((b, i) => {
      const li = el("li");
      const m = el("span", "mini");
      m.append(minigrafico(b.serie, tendencia(b.n, b.antes)));
      const nome = el("span", "nome", b.nome);
      nome.title = b.nome;
      li.append(el("span", "pos", i + 1), nome, m, el("span", "n", num(b.n)), variacao(b.n, b.antes));
      ol.append(li);
    });
  }

  function painelVisitas(d, p) {
    const v = d.visitas || {};
    if (v.erro) {
      $("visitas-numeros").replaceChildren(el("p", "vazio", `Não deu para ler as visitas: ${v.erro}.`));
      $("visitas-barras").replaceChildren();
      $("visitas-taxas").replaceChildren();
      return;
    }
    const visitas = somaDesde(v.porDia, p.semana);
    const paginas = (v.porDia || []).filter((x) => x.dia >= p.semana).reduce((s, x) => s + x.paginas, 0);
    const totalAparelhos = (v.aparelhos || []).reduce((s, a) => s + a.n, 0);
    const celular = (v.aparelhos || []).find((a) => a.nome === "Celular")?.n || 0;
    const miniNumero = (rotulo, valor) => { const x = el("div"); x.append(el("span", "sub", rotulo), el("strong", "", valor)); return x; };
    $("visitas-numeros").replaceChildren(
      miniNumero("Visitas · 7 dias", num(visitas)),
      miniNumero("Páginas vistas", num(paginas)),
      miniNumero("No celular", totalAparelhos ? `${Math.round((celular / totalAparelhos) * 100)}%` : "—"),
    );
    const mapa = new Map((v.porDia || []).map((x) => [x.dia, x]));
    const dias = [];
    for (let i = 13; i >= 0; i--) dias.push(diasAtras(p.hoje, i));
    const max = Math.max(1, ...dias.map((x) => mapa.get(x)?.n || 0));
    const barras = $("visitas-barras");
    barras.replaceChildren();
    for (const dia of dias) {
      const linha = mapa.get(dia);
      const col = el("div", `coluna${dia === p.hoje ? " hoje" : ""}`);
      const barra = el("div", "barra");
      barra.style.height = `${((linha?.n || 0) / max) * 100}%`;
      col.append(barra);
      comDica(col, `${dataBr(dia)}${dia === p.hoje ? " (até agora)" : ""}: ${plural(linha?.n || 0, "visita", "visitas")} · ${plural(linha?.paginas || 0, "página", "páginas")}`);
      barras.append(col);
    }
    const por100 = (n) => (visitas ? num(Math.round((n / visitas) * 100)) : "—");
    $("visitas-taxas").replaceChildren(
      quadro("Buscas a cada 100 visitas", por100(somaDesde(d.buscasDia, p.semana))),
      quadro("Cliques a cada 100 visitas", por100(somaDesde(d.cliquesDia, p.semana))),
    );
  }

  // Gráfico grande das Métricas, com abas (o quê) e período (7D/30D)
  const estado = { serie: "visitas", dias: 30, dados: null };
  function graficoMetricas() {
    const d = estado.dados;
    if (!d) return;
    const series = {
      visitas: { titulo: "Visitas", palavra: ["visita", "visitas"], lista: d.visitas?.erro ? null : d.visitas?.porDia || [] },
      buscas: { titulo: "Buscas", palavra: ["busca", "buscas"], lista: d.buscasDia },
      cliques: { titulo: "Cliques para as lojas", palavra: ["clique", "cliques"], lista: d.cliquesDia },
    };
    const s = series[estado.serie];
    const area = $("grafico");
    $("grafico-titulo").textContent = s.titulo;
    if (!s.lista) {
      $("grafico-total").replaceChildren();
      area.replaceChildren(el("p", "vazio", "As visitas não foram lidas (veja o aviso no Resumo)."));
      return;
    }
    const dias = [];
    for (let i = estado.dias - 1; i >= 0; i--) dias.push(diasAtras(d.hoje, i));
    const mapa = new Map(s.lista.map((x) => [x.dia, x.n]));
    const valores = dias.map((x) => mapa.get(x) || 0);
    const total = valores.reduce((a, b) => a + b, 0);
    const antes = somaDesde(s.lista, diasAtras(d.hoje, estado.dias * 2 - 1), diasAtras(d.hoje, estado.dias));
    // Comparação só quando o período anterior inteiro está nos dados (a API manda 30 dias: dá para 7D, não para 30D)
    const comparar = estado.dias * 2 <= 30 ? variacao(total, antes) : el("span", "sub", "");
    $("grafico-total").replaceChildren(el("strong", "", num(total)), el("span", "sub", `em ${estado.dias} dias`), comparar);
    if (!total) { area.replaceChildren(el("p", "vazio", "Ainda sem números neste período.")); return; }
    graficoDeArea(area, dias, valores, (i) => `${dataBr(dias[i])}${i === dias.length - 1 ? " (até agora)" : ""}: ${plural(valores[i], ...s.palavra)}`);
  }
  document.querySelectorAll("[data-serie]").forEach((b) => b.addEventListener("click", () => {
    estado.serie = b.dataset.serie;
    document.querySelectorAll("[data-serie]").forEach((o) => o.setAttribute("aria-selected", String(o === b)));
    graficoMetricas();
  }));
  document.querySelectorAll("[data-dias]").forEach((b) => b.addEventListener("click", () => {
    estado.dias = Number(b.dataset.dias);
    document.querySelectorAll("[data-dias]").forEach((o) => o.setAttribute("aria-selected", String(o === b)));
    graficoMetricas();
  }));

  function tabelaBuscas(d) {
    const tbody = $("t-buscas");
    if (!d.topBuscas.length) return vazioNaTabela(tbody, 5, "Nenhuma busca nesta semana.");
    tbody.replaceChildren(...d.topBuscas.map((b, i) => linhaDeTabela([
      [i + 1, "pos"], [b.nome, "nome"], [num(b.n), "num forte"], [variacao(b.n, b.antes), "num"], [mini(b.serie, b.n, b.antes), "num mini"],
    ])));
  }

  // Lojas: as que tiveram clique + as da Awin com produtos no banco
  function tabelaLojas(d) {
    const tbody = $("t-lojas");
    const chave = (nome) => String(nome || "").toLowerCase().replace(/\s+/g, " ").trim();
    const mapa = new Map();
    for (const l of d.cliquesLoja) mapa.set(chave(l.nome), { nome: l.nome, n: l.n, antes: l.antes, serie: l.serie, produtos: null });
    for (const l of d.lojasAwin) {
      const x = mapa.get(chave(l.nome));
      if (x) x.produtos = l.n; else mapa.set(chave(l.nome), { nome: l.nome, n: 0, antes: 0, serie: null, produtos: l.n });
    }
    const lojas = [...mapa.values()].sort((a, b) => b.n - a.n || b.antes - a.antes || (b.produtos || 0) - (a.produtos || 0));
    if (!lojas.length) return vazioNaTabela(tbody, 6, "Nada ainda.");
    tbody.replaceChildren(...lojas.map((l, i) => linhaDeTabela([
      [i + 1, "pos"], [l.nome, "nome"], [num(l.n), "num forte"], [variacao(l.n, l.antes), "num"],
      [l.produtos === null ? "—" : num(l.produtos), "num"], [l.serie ? mini(l.serie, l.n, l.antes) : el("span", "vazio", "—"), "num mini"],
    ])));
  }

  function aparelhos(d) {
    const alvo = $("aparelhos");
    const v = d.visitas || {};
    if (v.erro || !v.aparelhos?.length) { alvo.replaceChildren(el("p", "vazio", v.erro ? "Sem as visitas do Cloudflare." : "Nada ainda.")); return; }
    const total = v.aparelhos.reduce((s, a) => s + a.n, 0);
    const barra = el("div", "dividida");
    const legenda = el("ul", "legenda");
    for (const a of v.aparelhos) {
      const cor = CORES_APARELHO[a.nome] || "#94a3b8";
      const pct = Math.round((a.n / total) * 100);
      const parte = el("i");
      parte.style.width = `${(a.n / total) * 100}%`;
      parte.style.background = cor;
      comDica(parte, `${a.nome}: ${pct}%`);
      barra.append(parte);
      const li = el("li");
      const quadradinho = el("span", "cor");
      quadradinho.style.background = cor;
      li.append(quadradinho, el("span", "", a.nome), el("span", "n", `${pct}% · ${num(a.n)}`));
      legenda.append(li);
    }
    alvo.replaceChildren(barra, legenda);
  }

  // Medidor em semicírculo: buscas prontas renovadas na última noite
  function medidor(d) {
    // Conta sobre a lista que o robô renova (as guardadas incluem reservas antigas, fora da lista)
    const total = d.prontas.lista || d.prontas.total;
    const recentes = Math.min(d.prontas.recentes || 0, total);
    const pct = total ? Math.round((recentes / total) * 100) : 0;
    const [estadoTexto, classe] = pct >= 80 ? ["✓ Bom", "ok"] : pct >= 50 ? ["! Atenção", "pendente"] : ["✕ Ruim", "erro"];
    const s = svg("svg", { viewBox: "0 0 180 104", role: "img", "aria-label": `${pct}% das buscas prontas renovadas` });
    const cx = 90, cy = 92, r = 74;
    const ponto = (frac) => [cx - r * Math.cos(Math.PI * frac), cy - r * Math.sin(Math.PI * frac)];
    const arco = (de, ate, cor) => {
      const [x1, y1] = ponto(de);
      const [x2, y2] = ponto(ate);
      return svg("path", { d: `M${x1},${y1} A${r},${r} 0 0 1 ${x2},${y2}`, fill: "none", stroke: cor, "stroke-width": 10, "stroke-linecap": "round" });
    };
    s.append(arco(0.02, 0.48, "#ea3943"), arco(0.52, 0.78, "#f5b014"), arco(0.82, 0.98, "#16c784"));
    const [px, py] = ponto(Math.min(0.98, Math.max(0.02, pct / 100)));
    s.append(svg("circle", { cx: px, cy: py, r: 8, fill: "#121826", stroke: "#eef1f7", "stroke-width": 3 }));
    const t = svg("text", { x: cx, y: cy - 12, "text-anchor": "middle", class: "valor-medidor" });
    t.textContent = `${pct}%`;
    s.append(t);
    $("medidor").replaceChildren(
      el("div", "rotulo", "Buscas prontas renovadas na última noite"), s, el("span", `selo ${classe}`, estadoTexto),
      el("div", "nota", `${num(recentes)} de ${num(total)} da lista do robô (últimas 30 h)`),
    );
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
    itens.push([d.visitas?.erro ? "⚠️" : "✅", "Visitas (Cloudflare Web Analytics)", d.visitas?.erro || "lidas normalmente"]);
    const ultima = (d.robo || []).length ? ultimaMadrugada(d.robo) : null;
    itens.push(ultima ? [ICONE_SITUACAO[ultima.situacao] || "🤖", `Robô: ${TEXTO_SITUACAO[ultima.situacao] || ultima.situacao}`,
      `${ultima.evento === "schedule" ? "última madrugada" : "última execução"}: ${quando(ultima.inicio)} · detalhes na aba Robô`]
      : ["🤖", "Robô da madrugada", "o resumo aparece aqui (aba Robô) depois da próxima execução"]);
    $("saude").replaceChildren(...itens.map(([icone, titulo, detalhe]) => {
      const li = el("li");
      const corpo = el("div", "", titulo);
      corpo.append(el("small", "", detalhe));
      li.append(el("span", "icone", icone), corpo);
      return li;
    }));
  }

  function montarMetricas(d) {
    const p = { hoje: d.hoje, semana: diasAtras(d.hoje, 6), antes: diasAtras(d.hoje, 13), fimAntes: diasAtras(d.hoje, 7) };
    estado.dados = d;
    faixa(d);
    resumo(d, p);
    emAlta(d);
    painelVisitas(d, p);
    graficoMetricas();
    tabelaBuscas(d);
    tabelaLojas(d);
    lista($("l-origens"), d.visitas?.erro ? [] : d.visitas?.origens);
    aparelhos(d);
    lista($("l-produtos"), d.topProdutos, (i) => i.nome, (i) => `· ${i.loja}`);
    lista($("l-onde"), d.cliquesOnde, (i) => ONDE[i.nome] || i.nome);
    // País: o Cloudflare manda a sigla ("BR"); aqui vira o nome em português
    const nomesPaises = typeof Intl.DisplayNames === "function" ? new Intl.DisplayNames(["pt-BR"], { type: "region" }) : null;
    const pais = (sigla) => { try { return (sigla && sigla.length === 2 && nomesPaises?.of(sigla)) || sigla; } catch { return sigla; } };
    lista($("l-paises"), d.visitas?.erro ? [] : d.visitas?.paises, (i) => pais(i.nome));
    // Navegador automático (testes, robôs) aparece com o nome dele: "HeadlessChrome" não é gente
    lista($("l-navegadores"), d.visitas?.erro ? [] : d.visitas?.navegadores, (i) => (/headless/i.test(i.nome) ? `${i.nome} (robô/teste)` : i.nome));
    if (d.visitas?.erroExtras) {
      for (const id of ["l-paises", "l-navegadores"]) $(id).replaceChildren(el("li", "vazio", `O Cloudflare não mandou: ${d.visitas.erroExtras}`));
    }
    medidor(d);
    saude(d);
    desenharInicio(d);
    montarRobo();
  }

  // =================================== COMISSÕES ===================================

  const comissoes = { mes: hojeBr().slice(0, 7), dados: {}, carregando: null };

  // Soma por moeda: { BRL: 12.3, USD: 0.4 } -> "R$ 12,30 + US$ 0,40"
  function somaPorMoeda(pedidos, campo = "comissao") {
    const t = {};
    for (const p of pedidos) t[p.moeda] = (t[p.moeda] || 0) + p[campo];
    return t;
  }
  function textoMoedas(t) {
    const partes = Object.entries(t).filter(([, v]) => v).sort(([a], [b]) => (a === "BRL" ? -1 : b === "BRL" ? 1 : a.localeCompare(b)));
    return partes.length ? partes.map(([m, v]) => dinheiro(v, m)).join(" + ") : dinheiro(0);
  }
  const validos = (pedidos) => pedidos.filter((p) => p.status !== "cancelada");

  // Quadro "Comissões do mês" das Métricas (com o que já foi lido do mês atual)
  function quadroDaComissao() {
    const atual = comissoes.dados[hojeBr().slice(0, 7)];
    if (!atual) return quadro("Comissões do mês", "…", null, "carregando", "cor-verde");
    const v = validos(atual.pedidos);
    const falhas = atual.redes.filter((r) => !r.ok).map((r) => r.rede);
    return quadro("Comissões do mês", textoMoedas(somaPorMoeda(v)), null,
      falhas.length ? `sem ${falhas.join(", ")} (ver Comissões)` : `${plural(v.length, "pedido", "pedidos")} · ver Comissões`, "cor-verde");
  }
  function atualizarQuadroDaComissao() {
    const antigo = document.querySelector("#resumo .quadro:nth-child(4)");
    if (antigo) antigo.replaceWith(quadroDaComissao());
  }

  function nomeDoMes(mes) {
    const [a, m] = mes.split("-").map(Number);
    return `${MESES[m - 1][0].toUpperCase()}${MESES[m - 1].slice(1)} de ${a}`;
  }
  function mudarMes(delta) {
    const [a, m] = comissoes.mes.split("-").map(Number);
    const d = new Date(Date.UTC(a, m - 1 + delta, 1));
    const novo = d.toISOString().slice(0, 7);
    if (novo > hojeBr().slice(0, 7)) return;
    comissoes.mes = novo;
    carregarComissoes();
  }
  $("mes-anterior").addEventListener("click", () => mudarMes(-1));
  $("mes-seguinte").addEventListener("click", () => mudarMes(1));

  function montarComissoes() {
    const mes = comissoes.mes;
    $("mes-nome").textContent = nomeDoMes(mes);
    $("mes-seguinte").disabled = mes >= hojeBr().slice(0, 7);
    const d = comissoes.dados[mes];
    if (!d) {
      $("c-resumo").replaceChildren(quadro("Comissão do mês", "…", null, "buscando nas redes (pode levar alguns segundos)"));
      for (const id of ["c-grafico", "c-grafico-total"]) $(id).replaceChildren();
      for (const id of ["c-redes", "c-lojas"]) $(id).replaceChildren(el("li", "vazio", "Carregando…"));
      vazioNaTabela($("c-pedidos"), 7, "Carregando…");
      return;
    }
    const pedidos = d.pedidos;
    const v = validos(pedidos);
    // Bolinha com a cor de cada rede antes do nome
    const CORES_REDE = { shopee: "#ee4d2d", aliexpress: "#ff4747", awin: "#4f8cff", lomadee: "#a77bff", "mercado livre": "#ffe600", shein: "#f472b6" };
    const comCor = (texto) => {
      const s = el("span", "nome");
      const b = el("i", "bolinha");
      b.style.background = CORES_REDE[String(texto).toLowerCase()] || "#22c3d6";
      s.append(b, texto);
      return s;
    };
    const por = (status) => pedidos.filter((p) => p.status === status);
    // Avisos das redes que falharam
    const falhas = d.redes.filter((r) => !r.ok);
    $("erro-redes").hidden = !falhas.length;
    $("erro-redes").textContent = falhas.length ? `Não deu para ler: ${falhas.map((r) => `${r.rede} (${r.erro})`).join(" · ")}` : "";

    $("c-resumo").replaceChildren(
      quadro("Comissão do mês", textoMoedas(somaPorMoeda(v)), null, "aprovada + pendente", "cor-azul"),
      quadro("Aprovada", textoMoedas(somaPorMoeda(por("aprovada"))), null, plural(por("aprovada").length, "pedido", "pedidos"), "cor-verde"),
      quadro("Pendente", textoMoedas(somaPorMoeda(por("pendente"))), null, `${plural(por("pendente").length, "pedido", "pedidos")} · ainda pode cair`, "cor-amarelo"),
      quadro("Cancelada", textoMoedas(somaPorMoeda(por("cancelada"))), null, plural(por("cancelada").length, "pedido", "pedidos"), "cor-vermelho"),
      quadro("Vendas geradas", textoMoedas(somaPorMoeda(v, "venda")), null, "valor das compras (sem canceladas)", "cor-roxo"),
      quadro("Pedidos", num(v.filter((p) => !p.manual).length + (d.manuais || []).reduce((s, m) => s + m.pedidos, 0)), null,
        `${num(new Set(v.map((p) => p.loja)).size)} lojas`, "cor-ciano"),
    );

    // Comissão por dia (em reais; AliExpress em dólar fica de fora do gráfico e aparece no total)
    const [a, m] = mes.split("-").map(Number);
    const ultimoDia = mes === hojeBr().slice(0, 7) ? Number(hojeBr().slice(8)) : new Date(Date.UTC(a, m, 0)).getUTCDate();
    const dias = Array.from({ length: ultimoDia }, (_, i) => `${mes}-${String(i + 1).padStart(2, "0")}`);
    const emReais = v.filter((p) => p.moeda === "BRL" && !p.manual); // Shein/ML digitados (total do mês) ficam fora do gráfico por dia
    const valores = dias.map((dia) => emReais.filter((p) => p.dia === dia).reduce((s, p) => s + p.comissao, 0));
    const total = valores.reduce((s, x) => s + x, 0);
    const temDolar = v.some((p) => p.moeda !== "BRL");
    $("c-grafico-total").replaceChildren(el("strong", "", dinheiro(total)), el("span", "sub", temDolar ? "em reais (AliExpress, em dólar, fora do gráfico)" : "no mês"));
    if (!total) $("c-grafico").replaceChildren(el("p", "vazio", "Nenhuma comissão em reais neste mês ainda."));
    else {
      graficoDeArea($("c-grafico"), dias, valores, (i) => {
        const doDia = emReais.filter((p) => p.dia === dias[i]);
        return `${dataBr(dias[i])}: ${dinheiro(valores[i])} · ${plural(doDia.length, "pedido", "pedidos")}`;
      }, (x) => dinheiro(x).replace(/,00$/, ""));
    }

    // Redes sem API de ganhos para apps: a linha leva ao painel de afiliados de cada uma
    // Mercado Livre (05/11/2026): Afiliados → Métricas (cliques, vendas e ganhos)
    // Shein (09/11/2026): Centro de Afiliados (na Shein, buscar "Afiliado"; comissão "Pendente" em até 24 h, saldo após 45 dias)
    function linhaSemApi(nome, href, rotulo, detalhe) {
      const li = el("li");
      const link = el("a", "selo", rotulo);
      link.href = href;
      link.target = "_blank";
      link.rel = "noopener";
      li.append(comCor(nome), el("span", "n", "—"), link, el("span", "detalhe", detalhe));
      return li;
    }
    // Com valor digitado na aba Parâmetros: mostra o total e quando foi digitado
    const manual = (rede) => (d.manuais || []).find((m) => m.rede === rede);
    function linhaManual(m) {
      const li = el("li");
      const quando = new Date(m.atualizado).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
      const editar = el("a", "selo digitado", "✎ digitado");
      editar.href = "#parametros";
      li.append(comCor(m.nome), el("span", "n", dinheiro(m.aprovada + m.pendente)), editar,
        el("span", "detalhe", `${plural(m.pedidos, "pedido", "pedidos")} · aprovada ${dinheiro(m.aprovada)} · pendente ${dinheiro(m.pendente)} · em ${quando}`));
      return li;
    }
    const linhaMercadoLivre = () => (manual("mercadolivre") ? linhaManual(manual("mercadolivre"))
      : linhaSemApi("Mercado Livre", "https://www.mercadolivre.com.br/afiliados", "Ver no ML ↗",
        "o ML não envia os ganhos por API: veja em Afiliados → Métricas e digite em Parâmetros"));
    const linhaShein = () => (manual("shein") ? linhaManual(manual("shein"))
      : linhaSemApi("Shein", "https://br.shein.com/", "Ver na Shein ↗",
        "a Shein não envia os ganhos por API: busque “Afiliado” na Shein e digite em Parâmetros"));

    // Por rede (card do topo): comissão, pedidos e se a rede foi lida (o erro vem escrito)
    $("c-redes").replaceChildren(...d.redes.map((r) => {
      const daRede = validos(pedidos.filter((p) => p.rede === r.rede));
      const li = el("li");
      const nome = comCor(r.rede);
      const valor = el("span", "n", textoMoedas(somaPorMoeda(daRede)));
      const situacao = r.ok ? el("span", "selo ok", "✓ lida") : el("span", "selo erro", "✕ erro");
      li.append(nome, valor, situacao);
      li.append(r.ok
        ? el("span", "detalhe", `${plural(daRede.length, "pedido", "pedidos")} · vendas ${textoMoedas(somaPorMoeda(daRede, "venda"))}`)
        : el("span", "detalhe erro", r.erro));
      return li;
    }), linhaMercadoLivre(), linhaShein());

    // Lojas que mais pagaram (card do topo)
    const lojas = new Map();
    for (const p of v) {
      const k = `${p.rede}|${p.loja}`;
      const x = lojas.get(k) || { loja: p.loja, rede: p.rede, pedidos: [] };
      x.pedidos.push(p);
      lojas.set(k, x);
    }
    const ordenadas = [...lojas.values()].map((x) => ({ ...x, total: x.pedidos.reduce((s, p) => s + p.comissao, 0) })).sort((a, b) => b.total - a.total);
    if (!ordenadas.length) $("c-lojas").replaceChildren(el("li", "vazio", "Nenhuma venda neste mês ainda."));
    else {
      $("c-lojas").replaceChildren(...ordenadas.slice(0, 7).map((x, i) => {
        const li = el("li");
        const nome = el("span", "nome", x.loja);
        nome.title = x.loja;
        nome.append(el("span", "rede-da-loja", `${x.rede} · ${plural(x.pedidos.length, "pedido", "pedidos")}`));
        li.append(el("span", "pos", i + 1), nome, el("span", "n", textoMoedas(somaPorMoeda(x.pedidos))));
        return li;
      }));
    }

    // Pedidos (mais novos primeiro)
    $("c-pedidos-sub").textContent = pedidos.length ? `${num(pedidos.length)} no mês` : "";
    if (!pedidos.length) vazioNaTabela($("c-pedidos"), 7, "Nenhum pedido neste mês ainda. Quando alguém comprar pelos seus links, aparece aqui.");
    else {
      $("c-pedidos").replaceChildren(...pedidos.slice(0, 300).map((p) => linhaDeTabela([
        [dataBr(p.dia)], [p.rede], [p.loja, "nome"], [p.produto || "—", "produto"], [dinheiro(p.venda, p.moeda), "num"],
        [dinheiro(p.comissao, p.moeda), "num forte"], [el("span", `selo ${p.status}`, SITUACAO[p.status] || p.status), "num"],
      ])));
    }
  }

  const pedindo = new Map(); // mês -> pedido em andamento (não pede o mesmo mês duas vezes ao mesmo tempo)
  function carregarComissoes(novo = false) {
    const mes = comissoes.mes;
    montarComissoes();
    if (comissoes.dados[mes] && !novo) return Promise.resolve();
    if (!pedindo.has(mes)) pedindo.set(mes, buscarComissoes(mes, novo).finally(() => pedindo.delete(mes)));
    return pedindo.get(mes);
  }
  async function buscarComissoes(mes, novo) {
    try {
      const r = await fetch(`/api/painel/comissoes?mes=${mes}${novo ? "&novo=1" : ""}`, { cache: "no-store", credentials: "same-origin" });
      if (r.status === 403 || r.redirected) throw new Error("O login expirou. Recarregue a página e entre de novo.");
      if (!r.ok) throw new Error(`O servidor respondeu ${r.status} nas comissões.`);
      comissoes.dados[mes] = await r.json();
    } catch (e) {
      comissoes.dados[mes] = { mes, redes: [{ rede: "Todas", ok: false, erro: e instanceof SyntaxError ? "login expirado" : e.message }], pedidos: [] };
    }
    if (comissoes.mes === mes) montarComissoes();
    atualizarQuadroDaComissao();
  }

  // =================================== ROBÔ ===================================
  // Cada execução (robo/relatorio.mjs): { id, numero, evento, modo, inicio, fim, situacao, partes: [{ titulo, situacao,
  // linhas, avisos, minutos }], atrasoMin, link }

  const ICONE_SITUACAO = { ok: "✅", aviso: "⚠️", erro: "❌" };
  const TEXTO_SITUACAO = { ok: "tudo certo", aviso: "rodou, com avisos", erro: "deu erro" };
  const SELO_SITUACAO = { ok: "✓ Tudo certo", aviso: "! Avisos", erro: "✕ Erro" };
  const MODOS = {
    madrugada: "Madrugada", completo: "Manual (completo)", so_awin: "Manual: só Awin", so_prontas: "Manual: só buscas prontas",
    so_lomadee: "Manual: só Lomadee", so_auditoria: "Manual: só auditoria", so_ia: "Manual: só IA", so_numeros: "Manual: só números",
    "robo-noite": "Robô da noite (Cloudflare)",
  };
  const tipoDaExecucao = (modo) => MODOS[modo] || `Manual: ${modo}`;
  const hora = (ms) => new Date(ms).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
  const diaDe = (ms) => new Date(ms).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  function quando(ms) {
    const dia = diaDe(ms);
    const hoje = hojeBr();
    return `${dia === hoje ? "hoje" : dia === diasAtras(hoje, 1) ? "ontem" : dataBr(dia)} às ${hora(ms)}`;
  }
  function duracao(min) {
    if (min === null || min === undefined) return "—";
    if (min < 60) return `${min} min`;
    return `${Math.floor(min / 60)} h${min % 60 ? ` ${String(min % 60).padStart(2, "0")}` : ""}`;
  }
  // Um número de dentro das linhas de um passo (ex.: "431 de 478 buscas guardadas")
  function achar(ex, chave, regex) {
    const parte = (ex.partes || []).find((p) => p.chave === chave);
    for (const l of parte?.linhas || []) { const m = l.match(regex); if (m) return m; }
    return null;
  }

  const robo = { escolhida: null };
  const ultimaMadrugada = (lista) => lista.find((e) => e.evento === "schedule") || lista[0];
  function montarRobo() {
    const lista = estado.dados?.robo || [];
    if (!lista.length) {
      const nada = "Ainda sem resumo: aparece aqui depois da próxima execução do robô (a da madrugada ou um Run workflow).";
      $("r-resumo").replaceChildren(el("p", "vazio", nada));
      $("r-numeros").replaceChildren();
      $("r-atencao").replaceChildren();
      $("r-partes").replaceChildren();
      vazioNaTabela($("r-execucoes"), 7, "Nenhuma execução registrada ainda.");
      return;
    }
    // Sem escolha: a última madrugada (é a que importa todo dia); as manuais ficam na tabela
    const ex = lista.find((e) => e.id === robo.escolhida) || ultimaMadrugada(lista);

    // Resumo
    $("r-titulo").textContent = ex === ultimaMadrugada(lista) && !robo.escolhida
      ? (ex.evento === "schedule" ? "Última madrugada" : "Última execução") : "Execução escolhida";
    const minutos = ex.fim && ex.inicio ? Math.round((ex.fim - ex.inicio) / 6e4) : null;
    $("r-resumo").replaceChildren(
      quadro("Situação", null, el("span", `selo ${ex.situacao}`, SELO_SITUACAO[ex.situacao] || ex.situacao), tipoDaExecucao(ex.modo)),
      quadro("Começou", quando(ex.inicio), null, `nº ${ex.numero || "—"}`),
      quadro("Atraso do GitHub", ex.atrasoMin === null || ex.atrasoMin === undefined ? "—" : duracao(ex.atrasoMin), null,
        ex.evento === "schedule" ? "marcado para 01:30" : "rodou na hora (manual)"),
      quadro("Duração", duracao(minutos), null, ex.fim ? `terminou ${hora(ex.fim)}` : ""),
    );
    // O quadro "Situação" não tem número: tira o "Em breve" que o quadro() põe quando o valor é null
    $("r-resumo").querySelector(".breve")?.remove();

    // Números da execução (só os que existem nela)
    const numeros = [];
    const prontas = achar(ex, "prontas", /(\d+) de (\d+) buscas guardadas/);
    if (prontas) numeros.push(quadro("Buscas prontas guardadas", `${num(prontas[1])} de ${num(prontas[2])}`, null,
      `${Math.round((prontas[1] / Math.max(1, prontas[2])) * 100)}% (o bom é 80% ou mais)`));
    const produtos = achar(ex, "awin", /Produtos nos feeds: ([\d.]+)/);
    const novos = achar(ex, "awin", /Novos no site: ([\d.]+)/);
    const removidos = achar(ex, "awin", /Removidos: ([\d.]+)/);
    if (produtos) numeros.push(quadro("Produtos da Awin", num(Number(produtos[1].replace(/\./g, ""))), null,
      `${novos ? `+${num(Number(novos[1].replace(/\./g, "")))} novos` : ""}${removidos ? ` · −${num(Number(removidos[1].replace(/\./g, "")))} removidos` : ""}`));
    const escondidos = achar(ex, "ia_buscas", /Escondidos[^:]*: (\d+)/);
    const corrigidas = achar(ex, "ia_buscas", /Categorias corrigidas sozinhas: (\d+)/);
    if (escondidos) numeros.push(quadro("IA: escondidos nas buscas", num(escondidos[1]), null, corrigidas ? `${num(corrigidas[1])} categorias corrigidas` : ""));
    const custos = (ex.partes || []).flatMap((p) => p.linhas.map((l) => l.match(/US\$ ([\d.]+)/)).filter(Boolean)).map((m) => Number(m[1]));
    if (custos.length) numeros.push(quadro("Custo da IA", dinheiro(custos.reduce((a, b) => a + b, 0), "USD"), null, "Anthropic (Claude Haiku)"));
    const emails = achar(ex, "alertas", /(\d+) e-mails/);
    if (emails) numeros.push(quadro("E-mails \"Baixou!\"", num(emails[1]), null, "alertas de preço"));
    $("r-numeros").replaceChildren(...(numeros.length ? numeros.slice(0, 4) : [el("p", "vazio", "Esta execução não teve esses passos.")]));

    // Precisa de atenção: todos os avisos, com o passo
    const avisos = (ex.partes || []).flatMap((p) => p.avisos.map((a) => [p, a]));
    $("r-atencao").replaceChildren(...(avisos.length ? avisos.slice(0, 12).map(([p, a]) => {
      const li = el("li");
      const corpo = el("div", "", p.titulo);
      corpo.append(el("small", "", a));
      li.append(el("span", "icone", p.situacao === "erro" ? "❌" : "⚠️"), corpo);
      return li;
    }) : [(() => { const li = el("li"); const c = el("div", "", "Nada"); c.append(el("small", "", "Todos os passos rodaram sem aviso.")); li.append(el("span", "icone", "✅"), c); return li; })()]));
    if (avisos.length > 12) $("r-atencao").append(el("li", "vazio", `… e mais ${avisos.length - 12} (no passo a passo)`));

    // Passo a passo
    $("r-qual").textContent = `${tipoDaExecucao(ex.modo)} · ${quando(ex.inicio)}`;
    $("r-partes").replaceChildren(...(ex.partes || []).map((p) => {
      const li = el("li");
      const detalhes = el("ul", "detalhes");
      for (const l of p.linhas) detalhes.append(el("li", "", l));
      for (const a of p.avisos) detalhes.append(el("li", p.situacao === "erro" ? "falha" : "alerta", /^[\p{L}\p{N}]/u.test(a) ? `${p.situacao === "erro" ? "✕" : "!"} ${a}` : a));
      li.append(el("span", "icone", ICONE_SITUACAO[p.situacao] || "•"), el("span", "titulo-passo", p.titulo),
        el("span", "tempo", p.minutos === null || p.minutos === undefined ? "" : duracao(p.minutos)), detalhes);
      return li;
    }));
    if (!(ex.partes || []).length) $("r-partes").append(el("li", "vazio", "Sem passos registrados."));

    // Execuções recentes
    $("r-execucoes").replaceChildren(...lista.map((e) => {
      const link = el("a", "", "Abrir");
      link.href = e.link || "#";
      link.target = "_blank";
      link.rel = "noopener";
      link.addEventListener("click", (evento) => evento.stopPropagation());
      const tr = linhaDeTabela([
        [dataBr(diaDe(e.inicio))], [tipoDaExecucao(e.modo), "nome"], [hora(e.inicio), "num"],
        [e.atrasoMin === null || e.atrasoMin === undefined ? "—" : duracao(e.atrasoMin), "num"],
        [duracao(e.fim ? Math.round((e.fim - e.inicio) / 6e4) : null), "num"],
        [el("span", `selo ${e.situacao}`, SELO_SITUACAO[e.situacao] || e.situacao), "num"], [link, "num"],
      ]);
      if (e === ex) tr.classList.add("escolhida");
      tr.addEventListener("click", () => { robo.escolhida = e.id; montarRobo(); window.scrollTo({ top: 0, behavior: "smooth" }); });
      return tr;
    }));
  }

  // "Não contar minhas visitas" (pedido do Giovanni, 04/11/2026): o link abre o site com ?nao-contar=1, que grava o cookie
  // vpc_nao_contar no domínio vaiprocarrinho.com.br (o painel também enxerga); com ele o aparelho não entra nas contas
  function desenharNaoContar() {
    const fora = /(?:^|;\s*)vpc_nao_contar=1(?:;|$)/.test(document.cookie);
    const link = el("a", "", fora ? "Voltar a contar" : "Não contar minhas visitas neste aparelho");
    link.href = `https://vaiprocarrinho.com.br/?nao-contar=${fora ? 0 : 1}`;
    link.target = "_blank";
    link.rel = "noopener";
    $("nao-contar").replaceChildren(fora ? "✅ Este aparelho não entra nas contas · " : "Este aparelho entra nas contas · ", link);
  }
  desenharNaoContar();
  window.addEventListener("focus", desenharNaoContar);

  // "Zerar contadores" (pedido do Giovanni, 04/11/2026): visitas, buscas e cliques começam do zero a partir de agora
  // (functions/api/painel/zerar.js, lib/inicioPainel.js). Contas, alertas e carrinhos continuam
  function desenharInicio(d) {
    const quando = d.inicio
      ? `Contando desde ${new Date(d.inicio).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).replace(",", " às")}`
      : "Contando desde o começo do site";
    const botao = el("button", "botao-link", d.inicio ? "Zerar de novo" : "Zerar contadores");
    botao.type = "button";
    botao.addEventListener("click", zerar);
    $("inicio-contagem").replaceChildren(`${quando} · `, botao);
    if (d.visitas?.avisoInicio) $("inicio-contagem").append(el("small", "", " (visitas contadas desde o começo do dia)"));
  }
  async function zerar() {
    const ok = confirm("Zerar os contadores?\n\nVisitas, buscas e cliques começam do zero a partir de agora (os números de antes saem do painel). Contas, alertas de preço e carrinhos continuam.");
    if (!ok) return;
    try {
      const r = await fetch("/api/painel/zerar", { method: "POST", headers: { "X-Painel": "1" }, credentials: "same-origin" });
      if (!r.ok) throw new Error(`O servidor respondeu ${r.status}`);
      await carregarTudo(true);
    } catch (e) {
      alert(`Não deu para zerar agora: ${e.message}`);
    }
  }

  // =================================== PARÂMETROS ===================================
  // Comissões da Shein e do Mercado Livre digitadas à mão (/api/painel/parametros, lib/comissoesManuais.js; 09/11/2026)
  const REDES_PARAM = ["shein", "mercadolivre"];
  const virgula = (n) => (Number(n) || 0).toFixed(2).replace(".", ",");
  if (!$("param-mes").value) $("param-mes").value = hojeBr().slice(0, 7);
  $("param-mes").max = hojeBr().slice(0, 7);
  async function carregarParametros() {
    const mes = $("param-mes").value || hojeBr().slice(0, 7);
    for (const r of REDES_PARAM) $(`${r}-situacao`).textContent = "Carregando…";
    try {
      const resp = await fetch(`/api/painel/parametros?mes=${mes}`, { cache: "no-store", credentials: "same-origin" });
      if (resp.status === 403 || resp.redirected) throw new Error("O login expirou. Recarregue a página e entre de novo.");
      const dados = await resp.json();
      for (const r of REDES_PARAM) {
        const v = (dados.valores || []).find((x) => x.rede === r);
        $(`${r}-aprovada`).value = v ? virgula(v.aprovada) : "";
        $(`${r}-pendente`).value = v ? virgula(v.pendente) : "";
        $(`${r}-pedidos`).value = v ? String(v.pedidos) : "";
        $(`${r}-situacao`).textContent = v
          ? `Salvo em ${new Date(v.atualizado).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`
          : `Nada salvo para ${nomeDoMes(mes)}.`;
      }
    } catch (e) {
      for (const r of REDES_PARAM) $(`${r}-situacao`).textContent = e.message;
    }
  }
  async function salvarParametros(rede) {
    const mes = $("param-mes").value || hojeBr().slice(0, 7);
    const situacao = $(`${rede}-situacao`);
    situacao.textContent = "Salvando…";
    try {
      const resp = await fetch("/api/painel/parametros", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", "X-Painel": "1" },
        body: JSON.stringify({ rede, mes, aprovada: $(`${rede}-aprovada`).value || "0", pendente: $(`${rede}-pendente`).value || "0",
          pedidos: $(`${rede}-pedidos`).value || "0" }),
      });
      const dados = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(dados.erro || `O servidor respondeu ${resp.status}.`);
      situacao.textContent = `✓ Salvo em ${new Date(dados.salvo.atualizado).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`;
      delete comissoes.dados[mes]; // a aba Comissões busca de novo com o valor novo
    } catch (e) {
      situacao.textContent = `✕ ${e.message}`;
    }
  }
  for (const r of REDES_PARAM) $(`salvar-${r}`).addEventListener("click", () => salvarParametros(r));
  $("copiar-pedido").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText($("pedido-claude").textContent.trim()); $("copiar-pedido-ok").textContent = "✓ Copiado"; }
    catch { $("copiar-pedido-ok").textContent = "Selecione o texto e copie"; }
  });
  $("param-mes").addEventListener("change", carregarParametros);

  // =================================== MENU E CARGA ===================================

  const VISTAS = ["metricas", "comissoes", "robo", "parametros"];
  function vistaAtual() { const v = location.hash.slice(1); return VISTAS.includes(v) ? v : "metricas"; }
  function mostrarVista() {
    const vista = vistaAtual();
    for (const v of VISTAS) $(`vista-${v}`).hidden = vista !== v;
    document.querySelectorAll("[data-vista]").forEach((a) => {
      if (a.dataset.vista === vista) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    if (vista === "comissoes") carregarComissoes();
    else if (vista === "parametros") carregarParametros();
    else if (vista === "metricas") graficoMetricas();
    esconderDica();
  }
  window.addEventListener("hashchange", mostrarVista);

  let espera;
  window.addEventListener("resize", () => {
    clearTimeout(espera);
    espera = setTimeout(() => { if (vistaAtual() === "metricas") graficoMetricas(); else if (vistaAtual() === "comissoes") montarComissoes(); }, 150);
  });

  async function carregarMetricas() {
    const r = await fetch("/api/painel/dados", { cache: "no-store", credentials: "same-origin" });
    if (r.status === 403 || r.redirected) throw new Error("O login expirou. Recarregue a página e entre de novo.");
    if (!r.ok) throw new Error(`O servidor respondeu ${r.status}. Tente de novo em instantes.`);
    montarMetricas(await r.json());
  }

  async function carregarTudo(novo = false) {
    $("erro").hidden = true;
    $("atualizado").textContent = "Carregando…";
    if (novo) comissoes.dados = {};
    try {
      // As comissões do mês atual vêm junto (o quadro das Métricas usa); a aba Comissões mostra o mês escolhido
      if (vistaAtual() !== "comissoes") comissoes.mes = hojeBr().slice(0, 7);
      const pedidoComissoes = carregarComissoes(novo);
      await carregarMetricas();
      await pedidoComissoes;
      $("atualizado").textContent = `Atualizado às ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })}`;
    } catch (e) {
      $("erro").textContent = e instanceof SyntaxError ? "O login expirou. Recarregue a página e entre de novo." : e.message;
      $("erro").hidden = false;
      $("atualizado").textContent = "Não foi possível carregar";
    }
  }

  $("recarregar").addEventListener("click", () => carregarTudo(true));
  mostrarVista();
  carregarTudo();
})();
