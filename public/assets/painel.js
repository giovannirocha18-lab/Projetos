// Painel do Giovanni (public/painel.html): busca os números em /api/painel/dados e monta os painéis.
// Nada de número fica nesta página: sem o login do Cloudflare Access a API não responde.
(() => {
  const $ = (id) => document.getElementById(id);
  const SVG = "http://www.w3.org/2000/svg";
  const num = (n) => Number(n || 0).toLocaleString("pt-BR");
  const plural = (n, um, varios) => `${num(n)} ${n === 1 ? um : varios}`;
  const dataBr = (dia) => dia.split("-").reverse().slice(0, 2).join("/");
  const diasAtras = (dia, n) => new Date(Date.parse(dia) - n * 864e5).toISOString().slice(0, 10);
  const somaDesde = (lista, desde, ate = "9999") => (lista || []).filter((d) => d.dia >= desde && d.dia <= ate).reduce((s, d) => s + d.n, 0);
  const ONDE = {
    oferta: "Botão da oferta", foto: "Foto do produto", detalhes: "Detalhes do produto", historico: "Histórico de preço",
    comparar: "Comparar", carrinho: "Carrinho", alerta: "Alerta de preço", cupom: "Cupom", "loja-parceira": "Lojas parceiras",
  };
  // Cores dos aparelhos (identidade, ordem fixa)
  const CORES_APARELHO = { Celular: "#6d28d9", Computador: "#0891b2", Tablet: "#d97706" };

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
  function comDica(alvo, texto) {
    const mostrar = () => { const r = alvo.getBoundingClientRect(); mostrarDica(r.left + r.width / 2, r.top + r.height - (alvo.firstChild?.offsetHeight || r.height), texto); };
    alvo.addEventListener("mouseenter", mostrar);
    alvo.addEventListener("mouseleave", esconderDica);
    alvo.addEventListener("click", (e) => { e.stopPropagation(); mostrar(); });
  }
  document.addEventListener("click", esconderDica);

  // Mini-gráfico de 7 dias (verde se subiu em relação à semana anterior, vermelho se caiu)
  function minigrafico(serie, classe) {
    const s = svg("svg", { viewBox: "0 0 100 30", preserveAspectRatio: "none", "aria-hidden": "true" });
    const max = Math.max(1, ...serie);
    const pontos = serie.map((v, i) => `${(i / Math.max(1, serie.length - 1)) * 100},${28 - (v / max) * 26}`).join(" ");
    s.append(svg("polyline", { points: pontos, class: `linha ${classe}`, "vector-effect": "non-scaling-stroke" }));
    return s;
  }

  // Quadro: rótulo, número grande e ▲▼%
  function quadro(rotulo, valor, extra, nota) {
    const q = el("div", "quadro");
    const v = el("div", "valor");
    if (valor === null) v.append(el("span", "breve", "Em breve")); else v.append(el("strong", "", valor));
    if (extra) v.append(extra);
    q.append(el("div", "rotulo", rotulo), v);
    if (nota) q.append(el("div", "nota", nota));
    return q;
  }

  // ---------- Partes do painel ----------

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
      v.erro ? quadro("Visitas", "—", null, v.erro) : quadro("Visitas", num(visitas), variacao(visitas, somaDesde(v.porDia, p.antes, p.fimAntes))),
      quadro("Buscas", num(buscas), variacao(buscas, somaDesde(d.buscasDia, p.antes, p.fimAntes))),
      quadro("Cliques para as lojas", num(cliques), variacao(cliques, somaDesde(d.cliquesDia, p.antes, p.fimAntes)), "contados desde 03/11"),
      quadro("Comissões do mês", null, null, "Shopee, AliExpress, Awin e Lomadee"),
      quadro("Contas criadas", num(d.contas.total), null, `${plural(d.contas.semana, "nova", "novas")} na semana`),
      quadro("Alertas de preço", num(d.alertas.total), null, `${plural(d.alertas.semana, "novo", "novos")} na semana`),
    );
  }

  function emAlta(d) {
    const ol = $("em-alta");
    ol.replaceChildren();
    if (!d.topBuscas.length) { ol.append(el("li", "vazio", "Nenhuma busca nesta semana.")); return; }
    d.topBuscas.slice(0, 7).forEach((b, i) => {
      const li = el("li");
      const mini = el("span", "mini");
      mini.append(minigrafico(b.serie, tendencia(b.n, b.antes)));
      const nome = el("span", "nome", b.nome);
      nome.title = b.nome;
      li.append(el("span", "pos", i + 1), nome, mini, el("span", "n", num(b.n)), variacao(b.n, b.antes));
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
    const mini = (rotulo, valor) => { const x = el("div"); x.append(el("span", "sub", rotulo), el("strong", "", valor)); return x; };
    $("visitas-numeros").replaceChildren(
      mini("Visitas · 7 dias", num(visitas)),
      mini("Páginas vistas", num(paginas)),
      mini("No celular", totalAparelhos ? `${Math.round((celular / totalAparelhos) * 100)}%` : "—"),
    );
    // Barrinhas dos últimos 14 dias
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
    // A cada 100 visitas
    const por100 = (n) => (visitas ? num(Math.round((n / visitas) * 100)) : "—");
    $("visitas-taxas").replaceChildren(
      quadro("Buscas a cada 100 visitas", por100(somaDesde(d.buscasDia, p.semana))),
      quadro("Cliques a cada 100 visitas", por100(somaDesde(d.cliquesDia, p.semana))),
    );
  }

  // Gráfico grande de área, com abas (o quê) e período (7D/30D)
  const estado = { serie: "visitas", dias: 30, dados: null };
  function seriesDoGrafico(d) {
    return {
      visitas: { titulo: "Visitas", palavra: ["visita", "visitas"], lista: d.visitas?.erro ? null : d.visitas?.porDia || [] },
      buscas: { titulo: "Buscas", palavra: ["busca", "buscas"], lista: d.buscasDia },
      cliques: { titulo: "Cliques para as lojas", palavra: ["clique", "cliques"], lista: d.cliquesDia },
    };
  }
  function graficoGrande() {
    const d = estado.dados;
    if (!d) return;
    const s = seriesDoGrafico(d)[estado.serie];
    const area = $("grafico");
    area.replaceChildren();
    $("grafico-titulo").textContent = s.titulo;
    const dias = [];
    for (let i = estado.dias - 1; i >= 0; i--) dias.push(diasAtras(d.hoje, i));
    if (!s.lista) {
      $("grafico-total").replaceChildren();
      area.append(el("p", "vazio", "As visitas não foram lidas (veja o aviso no Resumo)."));
      return;
    }
    const mapa = new Map(s.lista.map((x) => [x.dia, x.n]));
    const valores = dias.map((x) => mapa.get(x) || 0);
    const total = valores.reduce((a, b) => a + b, 0);
    const antes = somaDesde(s.lista, diasAtras(d.hoje, estado.dias * 2 - 1), diasAtras(d.hoje, estado.dias));
    // Comparação só quando o período anterior inteiro está nos dados (o painel recebe 30 dias: dá para 7D, não para 30D)
    const comparar = estado.dias * 2 <= 30 ? variacao(total, antes) : el("span", "sub", "");
    $("grafico-total").replaceChildren(el("strong", "", num(total)), el("span", "sub", `em ${estado.dias} dias`), comparar);
    if (!total) { area.append(el("p", "vazio", "Ainda sem números neste período.")); return; }

    const L = area.clientWidth || 600;
    const A = area.clientHeight || 260;
    const m = { e: 6, d: 44, c: 10, b: 24 };
    const passo = Math.max(1, Math.ceil((Math.max(...valores) * 1.1) / 3));
    const topo = passo * 3;
    const x = (i) => m.e + (i / Math.max(1, dias.length - 1)) * (L - m.e - m.d);
    const y = (v) => m.c + (1 - v / topo) * (A - m.c - m.b);
    const g = svg("svg", { viewBox: `0 0 ${L} ${A}`, role: "img", "aria-label": `${s.titulo} por dia` });
    const defs = svg("defs");
    const grad = svg("linearGradient", { id: "preenche", x1: 0, y1: 0, x2: 0, y2: 1 });
    grad.append(svg("stop", { offset: "0%", "stop-color": "#6d28d9", "stop-opacity": ".22" }), svg("stop", { offset: "100%", "stop-color": "#6d28d9", "stop-opacity": "0" }));
    defs.append(grad);
    g.append(defs);
    // Grade com 4 linhas e os números à direita
    const grade = svg("g", { class: "grade" });
    for (let k = 0; k <= 3; k++) {
      grade.append(svg("line", { x1: m.e, x2: L - m.d, y1: y(passo * k), y2: y(passo * k) }));
      const t = svg("text", { x: L - m.d + 8, y: y(passo * k) + 4 });
      t.textContent = num(passo * k);
      grade.append(t);
    }
    g.append(grade);
    // Datas embaixo
    const eixo = svg("g", { class: "eixo" });
    const ultimo = dias.length - 1;
    // 7D: todos os dias (tela estreita: um sim, outro não); 30D: 4 datas
    const marcas = estado.dias <= 7 ? dias.map((_, i) => i).filter((i) => L >= 480 || i % 2 === ultimo % 2)
      : [0, Math.round(ultimo / 3), Math.round((ultimo * 2) / 3), ultimo];
    for (const i of marcas) {
      const t = svg("text", { x: x(i), y: A - 6, "text-anchor": i === 0 ? "start" : i === ultimo ? "end" : "middle" });
      t.textContent = i === ultimo ? "hoje" : dataBr(dias[i]);
      eixo.append(t);
    }
    g.append(eixo);
    const caminho = valores.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
    g.append(svg("path", { d: `${caminho} L${x(ultimo)},${y(0)} L${x(0)},${y(0)} Z`, fill: "url(#preenche)" }));
    g.append(svg("path", { d: caminho, class: "linha" }));
    // Mira + ponto ao passar o mouse (ou tocar)
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
      mostrarDica(r.left + (x(i) / L) * r.width, r.top + (y(valores[i]) / A) * r.height,
        `${dataBr(dias[i])}${i === ultimo ? " (até agora)" : ""}: ${plural(valores[i], ...s.palavra)}`);
    };
    const sair = () => { mira.setAttribute("visibility", "hidden"); ponto.setAttribute("visibility", "hidden"); esconderDica(); };
    alvo.addEventListener("pointermove", mover);
    alvo.addEventListener("pointerdown", mover);
    alvo.addEventListener("pointerleave", sair);
    area.append(g);
  }
  document.querySelectorAll("[data-serie]").forEach((b) => b.addEventListener("click", () => {
    estado.serie = b.dataset.serie;
    document.querySelectorAll("[data-serie]").forEach((o) => o.setAttribute("aria-selected", String(o === b)));
    graficoGrande();
  }));
  document.querySelectorAll("[data-dias]").forEach((b) => b.addEventListener("click", () => {
    estado.dias = Number(b.dataset.dias);
    document.querySelectorAll("[data-dias]").forEach((o) => o.setAttribute("aria-selected", String(o === b)));
    graficoGrande();
  }));
  let espera;
  window.addEventListener("resize", () => { clearTimeout(espera); espera = setTimeout(graficoGrande, 150); });

  function linhaDeTabela(celulas) {
    const tr = el("tr");
    for (const [conteudo, classe] of celulas) {
      const td = el("td", classe || "");
      if (conteudo instanceof Node) td.append(conteudo); else td.textContent = conteudo;
      if (classe?.includes("nome")) td.title = td.textContent;
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

  function tabelaBuscas(d) {
    const tbody = $("t-buscas");
    if (!d.topBuscas.length) return vazioNaTabela(tbody, 5, "Nenhuma busca nesta semana.");
    tbody.replaceChildren(...d.topBuscas.map((b, i) => linhaDeTabela([
      [i + 1], [b.nome, "nome"], [num(b.n), "num forte"], [variacao(b.n, b.antes), "num"], [mini(b.serie, b.n, b.antes), "num mini"],
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
      [i + 1], [l.nome, "nome"], [num(l.n), "num forte"], [variacao(l.n, l.antes), "num"],
      [l.produtos === null ? "—" : num(l.produtos), "num"], [l.serie ? mini(l.serie, l.n, l.antes) : el("span", "vazio", "—"), "num mini"],
    ])));
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
    const total = d.prontas.total;
    const recentes = d.prontas.recentes || 0;
    const pct = total ? Math.round((recentes / total) * 100) : 0;
    const [estadoTexto, cor] = pct >= 80 ? ["✓ Bom", "#15803d"] : pct >= 50 ? ["! Atenção", "#a16207"] : ["✕ Ruim", "#c81e2c"];
    const s = svg("svg", { viewBox: "0 0 180 104", role: "img", "aria-label": `${pct}% das buscas prontas renovadas` });
    const cx = 90, cy = 92, r = 74;
    const ponto = (frac) => [cx - r * Math.cos(Math.PI * frac), cy - r * Math.sin(Math.PI * frac)];
    const arco = (de, ate, corArco) => {
      const [x1, y1] = ponto(de);
      const [x2, y2] = ponto(ate);
      return svg("path", { d: `M${x1},${y1} A${r},${r} 0 0 1 ${x2},${y2}`, fill: "none", stroke: corArco, "stroke-width": 10, "stroke-linecap": "round" });
    };
    s.append(arco(0.02, 0.48, "#f3a1a8"), arco(0.52, 0.78, "#f5d77a"), arco(0.82, 0.98, "#86d9a5"));
    const [px, py] = ponto(Math.min(0.98, Math.max(0.02, pct / 100)));
    s.append(svg("circle", { cx: px, cy: py, r: 8, fill: "#fff", stroke: "#0d1421", "stroke-width": 3 }));
    const t = svg("text", { x: cx, y: cy - 12, "text-anchor": "middle", class: "valor-medidor" });
    t.textContent = `${pct}%`;
    s.append(t);
    const selo = el("span", "estado", estadoTexto);
    selo.style.background = cor;
    $("medidor").replaceChildren(
      el("div", "rotulo", "Buscas prontas renovadas na última noite"), s, selo,
      el("div", "nota", `${num(recentes)} de ${num(total)} guardadas (últimas 30 h)`),
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
    itens.push(["🤖", "Robô da madrugada", "o resumo de cada noite fica no GitHub (Actions → Robô de preços); em breve aqui"]);
    $("saude").replaceChildren(...itens.map(([icone, titulo, detalhe]) => {
      const li = el("li");
      const corpo = el("div", "", titulo);
      corpo.append(el("small", "", detalhe));
      li.append(el("span", "icone", icone), corpo);
      return li;
    }));
  }

  function montar(d) {
    const p = { hoje: d.hoje, semana: diasAtras(d.hoje, 6), antes: diasAtras(d.hoje, 13), fimAntes: diasAtras(d.hoje, 7) };
    estado.dados = d;
    faixa(d);
    resumo(d, p);
    emAlta(d);
    painelVisitas(d, p);
    graficoGrande();
    tabelaBuscas(d);
    tabelaLojas(d);
    lista($("l-origens"), d.visitas?.erro ? [] : d.visitas?.origens);
    aparelhos(d);
    lista($("l-produtos"), d.topProdutos, (i) => i.nome, (i) => `· ${i.loja}`);
    lista($("l-onde"), d.cliquesOnde, (i) => ONDE[i.nome] || i.nome);
    medidor(d);
    saude(d);
  }

  async function carregar() {
    $("erro").hidden = true;
    $("atualizado").textContent = "Carregando…";
    try {
      const r = await fetch("/api/painel/dados", { cache: "no-store", credentials: "same-origin" });
      if (r.status === 403 || r.redirected) throw new Error("O login expirou. Recarregue a página e entre de novo.");
      if (!r.ok) throw new Error(`O servidor respondeu ${r.status}. Tente de novo em instantes.`);
      montar(await r.json());
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
