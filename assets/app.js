// =====================================================================
// Vai pro Carrinho — comparador de preços
// =====================================================================

const LOJAS = {
  shopee: { nome: "Shopee", em: "na", cor: "#ee4d2d", texto: "#fff" },
  mercadolivre: { nome: "Mercado Livre", em: "no", cor: "#ffe600", texto: "#2d3277" },
  amazon: { nome: "Amazon", em: "na", cor: "#ff9900", texto: "#131921" },
  aliexpress: { nome: "AliExpress", em: "no", cor: "#e62e04", texto: "#fff" },
  magalu: { nome: "Magalu", em: "na", cor: "#0086ff", texto: "#fff" },
  shein: { nome: "Shein", em: "na", cor: "#222222", texto: "#fff" },
};

const CATEGORIAS = [
  { nome: "Eletrônicos", emoji: "🎧", fundo: "linear-gradient(135deg,#dbeafe,#e0e7ff)" },
  { nome: "Casa e Cozinha", emoji: "🍳", fundo: "linear-gradient(135deg,#ffedd5,#fef3c7)" },
  { nome: "Moda", emoji: "👗", fundo: "linear-gradient(135deg,#fce7f3,#fae8ff)" },
  { nome: "Beleza", emoji: "💄", fundo: "linear-gradient(135deg,#ffe4e6,#fce7f3)" },
  { nome: "Informática", emoji: "⌨️", fundo: "linear-gradient(135deg,#e0f2fe,#dbeafe)" },
  { nome: "Esporte", emoji: "🏃", fundo: "linear-gradient(135deg,#dcfce7,#d1fae5)" },
  { nome: "Casa", emoji: "🏠", fundo: "linear-gradient(135deg,#fef9c3,#ecfccb)" },
  { nome: "Brinquedos", emoji: "🧸", fundo: "linear-gradient(135deg,#ede9fe,#fae8ff)" },
  { nome: "Acessórios", emoji: "🎒", fundo: "linear-gradient(135deg,#f5f5f4,#e7e5e4)" },
];
const FUNDO_CATEGORIA = Object.fromEntries(CATEGORIAS.map((c) => [c.nome, c.fundo]));

const EM_ALTA = ["Air fryer", "Fone bluetooth", "Smartwatch", "Tênis de corrida", "Power bank", "Kit maquiagem"];

const SUGESTOES = [
  "air fryer", "fone bluetooth", "fone de ouvido", "smartwatch", "relógio inteligente", "tênis de corrida",
  "tênis feminino", "garrafa térmica", "mouse sem fio", "mouse gamer", "teclado mecânico", "caixa de som bluetooth",
  "aspirador robô", "power bank", "carregador portátil", "sérum vitamina c", "kit maquiagem", "paleta de sombras",
  "mochila notebook", "vestido", "vestido longo", "luminária led", "fita led", "cadeira gamer", "cadeira de escritório",
  "cafeteira", "cafeteira expresso", "blocos de montar", "jogo de panelas", "frigideira", "panela de pressão elétrica",
  "capinha celular", "suporte veicular",
];

const brl = (v) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const $ = (sel, raiz = document) => raiz.querySelector(sel);

function el(tag, attrs = {}, ...filhos) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "style") node.style.cssText = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? "" : v);
  }
  for (const f of filhos.flat()) if (f != null && f !== false) node.append(f);
  return node;
}

const ICONE_CORACAO = () => {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "20");
  svg.setAttribute("height", "20");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = '<path d="M12 21s-7.5-4.6-9.5-9.3C1.1 8.3 3.3 4.5 7 4.5c2.1 0 3.6 1.2 5 3 1.4-1.8 2.9-3 5-3 3.7 0 5.9 3.8 4.5 7.2C19.5 16.4 12 21 12 21Z" fill="currentColor"/>';
  return svg;
};

// ---------------------------------------------------------------------
// Avisos rápidos
// ---------------------------------------------------------------------
let timerToast;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("visivel");
  clearTimeout(timerToast);
  timerToast = setTimeout(() => t.classList.remove("visivel"), 2600);
}

// ---------------------------------------------------------------------
// Favoritos (ficam salvos só neste navegador)
// ---------------------------------------------------------------------
const CHAVE_FAV = "vpc-favoritos";
let favoritos = [];
try { favoritos = JSON.parse(localStorage.getItem(CHAVE_FAV)) || []; } catch { favoritos = []; }

function salvarFavoritos() {
  try { localStorage.setItem(CHAVE_FAV, JSON.stringify(favoritos)); } catch { /* navegador sem armazenamento */ }
}

const ehFavorito = (id) => favoritos.some((f) => f.id === id);

function alternarFavorito(oferta) {
  if (ehFavorito(oferta.id)) {
    favoritos = favoritos.filter((f) => f.id !== oferta.id);
    toast("Removido dos favoritos");
  } else {
    const { id, titulo, preco, loja, link, imagem, emoji, categoria } = oferta;
    favoritos.unshift({ id, titulo, preco, loja, link, imagem, emoji, categoria });
    toast("❤️ Salvo nos favoritos");
  }
  salvarFavoritos();
  atualizarFavoritos(true);
}

function atualizarFavoritos(animar = false) {
  const c = $("#contador-favoritos");
  c.textContent = favoritos.length;
  c.hidden = !favoritos.length;
  if (animar) { c.classList.remove("pulo"); void c.offsetWidth; c.classList.add("pulo"); }
  document.querySelectorAll(".favoritar").forEach((b) => b.setAttribute("aria-pressed", ehFavorito(b.dataset.id)));
  if (!$("#painel-favoritos").hidden) desenharFavoritos();
}

function desenharFavoritos() {
  const lista = $("#lista-favoritos");
  if (!favoritos.length) {
    lista.replaceChildren(el("div", { class: "fav-vazio" },
      el("span", {}, "🤍"), el("p", {}, "Toque no coração de uma oferta para guardar aqui.")));
    return;
  }
  lista.replaceChildren(...favoritos.map((f) => {
    const loja = LOJAS[f.loja] || { nome: f.loja };
    return el("div", { class: "fav-item" },
      el("div", { class: "fav-foto", style: `--fundo-cat:${FUNDO_CATEGORIA[f.categoria] || "var(--bg)"}` },
        f.imagem ? el("img", { src: f.imagem, alt: "" }) : f.emoji || "🛍️"),
      el("div", {},
        el("a", { href: f.link, target: "_blank", rel: "sponsored noopener" }, f.titulo),
        el("strong", {}, `R$ ${brl(f.preco)}`),
        el("span", { class: "loja-tag", style: `--cor-loja:${loja.cor}` }, el("span", { class: "loja-ponto" }), loja.nome)),
      el("button", { class: "fechar", type: "button", "aria-label": "Remover", onclick: () => alternarFavorito(f) }, "✕"));
  }));
}

function abrirPainel(abrir) {
  $("#painel-favoritos").hidden = !abrir;
  $("#painel-fundo").hidden = !abrir && !$("#filtros").classList.contains("aberto");
  if (abrir) desenharFavoritos();
}

// ---------------------------------------------------------------------
// Cartão de oferta
// ---------------------------------------------------------------------
function estrelas(nota) {
  const cheias = Math.round(nota);
  return "★".repeat(cheias) + "☆".repeat(5 - cheias);
}

function vendidosTexto(n) {
  if (!n) return null;
  return n >= 1000 ? `${(n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil vendidos` : `${n} vendidos`;
}

function cartaoOferta(o, { melhor = false } = {}) {
  const loja = LOJAS[o.loja] || { nome: o.loja, em: "na", cor: "#6d28d9", texto: "#fff" };
  const [inteiro, decimal] = brl(o.preco).split(",");

  const abrir = () => toast(`Abrindo a oferta ${loja.em} ${loja.nome}… 🛒`);

  return el("article", {
    class: `oferta${melhor ? " melhor" : ""}`,
    style: `--cor-loja:${loja.cor};--texto-loja:${loja.texto};--fundo-cat:${FUNDO_CATEGORIA[o.categoria] || "linear-gradient(135deg,#ede9fe,#fce7f3)"}`,
  },
    el("a", { class: "oferta-foto", href: o.link, target: "_blank", rel: "sponsored noopener", tabindex: "-1", "aria-hidden": "true", onclick: abrir },
      o.imagem ? el("img", { src: o.imagem, alt: "", loading: "lazy" }) : el("span", { class: "foto-emoji" }, o.emoji || "🛍️"),
      el("div", { class: "selos" },
        melhor && el("span", { class: "selo selo-melhor" }, "🏆 Menor preço"),
        o.desconto && el("span", { class: "selo selo-desconto" }, `-${o.desconto}%`))),
    el("button", {
      class: "favoritar", type: "button", "data-id": o.id, "aria-pressed": ehFavorito(o.id),
      "aria-label": "Salvar nos favoritos", onclick: () => alternarFavorito(o),
    }, ICONE_CORACAO()),
    el("div", { class: "oferta-corpo" },
      el("span", { class: "loja-tag" }, el("span", { class: "loja-ponto" }), loja.nome),
      el("h3", { class: "oferta-titulo", title: o.titulo }, o.titulo),
      (o.avaliacao || o.vendidos) && el("div", { class: "nota" },
        o.avaliacao && el("span", { class: "estrelas", "aria-label": `Nota ${o.avaliacao}` }, estrelas(o.avaliacao)),
        o.avaliacao && el("span", {}, String(o.avaliacao).replace(".", ",")),
        o.vendidos && el("span", {}, vendidosTexto(o.vendidos))),
      el("div", { class: "precos" },
        o.precoAntigo && el("span", { class: "preco-antigo" }, `R$ ${brl(o.precoAntigo)}`),
        el("span", { class: "preco" }, el("small", {}, "R$"), inteiro, el("small", {}, `,${decimal}`))),
      o.freteGratis && el("span", { class: "frete" }, "🚚 Frete grátis"),
      el("a", { class: "botao-oferta", href: o.link, target: "_blank", rel: "sponsored noopener", onclick: abrir },
        "Ver oferta", el("span", { class: "flecha", "aria-hidden": "true" }, "→"))));
}

function esqueletos(qtd) {
  return Array.from({ length: qtd }, () => el("article", { class: "oferta carregando", "aria-hidden": "true" },
    el("div", { class: "oferta-foto" }),
    el("div", { class: "oferta-corpo" },
      el("div", { class: "linha", style: "width:40%" }),
      el("div", { class: "linha" }),
      el("div", { class: "linha", style: "width:70%" }),
      el("div", { class: "linha", style: "width:50%;height:24px;margin-top:12px" }))));
}

// ---------------------------------------------------------------------
// Busca
// ---------------------------------------------------------------------
const estado = { q: "", ofertas: [], lojasDesmarcadas: new Set(), pedido: 0 };

async function consultarApi(q) {
  const resp = await fetch(`/api/buscar?q=${encodeURIComponent(q)}`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

function filtrar() {
  const min = parseFloat($("#preco-min").value);
  const max = parseFloat($("#preco-max").value);
  const frete = $("#so-frete").checked;
  const desconto = $("#so-desconto").checked;
  const lista = estado.ofertas.filter((o) =>
    !estado.lojasDesmarcadas.has(o.loja)
    && !(min >= 0 && o.preco < min)
    && !(max >= 0 && o.preco > max)
    && (!frete || o.freteGratis)
    && (!desconto || o.desconto));

  const ordem = $("#ordem").value;
  const ordenar = {
    menor: (a, b) => a.preco - b.preco,
    maior: (a, b) => b.preco - a.preco,
    desconto: (a, b) => (b.desconto || 0) - (a.desconto || 0),
    vendidos: (a, b) => (b.vendidos || 0) - (a.vendidos || 0),
  }[ordem];
  return ordenar ? [...lista].sort(ordenar) : lista;
}

function desenharFiltroLojas() {
  const contagem = {};
  for (const o of estado.ofertas) contagem[o.loja] = (contagem[o.loja] || 0) + 1;
  $("#filtro-lojas").replaceChildren(...Object.keys(contagem).map((id) => {
    const loja = LOJAS[id] || { nome: id, cor: "#888" };
    return el("label", { class: "opcao", style: `--cor-loja:${loja.cor}` },
      el("input", {
        type: "checkbox", checked: !estado.lojasDesmarcadas.has(id),
        onchange: (e) => { e.target.checked ? estado.lojasDesmarcadas.delete(id) : estado.lojasDesmarcadas.add(id); desenharResultados(); },
      }),
      el("span", { class: "loja-ponto" }), loja.nome,
      el("span", { class: "qtd" }, contagem[id]));
  }));
}

function desenharResumo(lista) {
  const qtdLojas = new Set(lista.map((o) => o.loja)).size;
  const titulo = el("div", {},
    el("h1", {}, el("span", {}, "Resultados para "), `“${estado.q}”`),
    el("p", {}, lista.length
      ? `${lista.length} ${lista.length === 1 ? "oferta" : "ofertas"} em ${qtdLojas} ${qtdLojas === 1 ? "loja" : "lojas"}`
      : "Nenhuma oferta com esses filtros"));

  if (lista.length < 2) return $("#resumo").replaceChildren(titulo);

  const precos = lista.map((o) => o.preco);
  const melhor = lista.reduce((a, b) => (b.preco < a.preco ? b : a));
  const economia = Math.max(...precos) - melhor.preco;
  const loja = LOJAS[melhor.loja] || { nome: melhor.loja, em: "na" };
  $("#resumo").replaceChildren(titulo,
    el("a", { class: "resumo-melhor", href: melhor.link, target: "_blank", rel: "sponsored noopener", onclick: () => toast(`Abrindo a oferta ${loja.em} ${loja.nome}… 🛒`) },
      el("span", { style: "font-size:2rem", "aria-hidden": "true" }, "🏆"),
      el("span", {},
        el("small", {}, `Menor preço · ${loja.nome}`),
        el("strong", {}, `R$ ${brl(melhor.preco)}`),
        economia > 1 && el("span", { class: "economia" }, `Economize até R$ ${brl(economia)}`))));
}

function desenharResultados() {
  const lista = filtrar();
  const idMelhor = lista.length > 1 ? lista.reduce((a, b) => (b.preco < a.preco ? b : a)).id : null;
  desenharResumo(lista);
  $("#total").textContent = `${lista.length} ${lista.length === 1 ? "oferta" : "ofertas"}`;
  $("#grade").replaceChildren(...lista.map((o, i) => {
    const c = cartaoOferta(o, { melhor: o.id === idMelhor });
    c.style.animationDelay = `${Math.min(i, 12) * 30}ms`;
    return c;
  }));
  $("#vazio").hidden = lista.length > 0;
}

async function buscar(q) {
  const pedido = ++estado.pedido;
  estado.q = q;
  estado.lojasDesmarcadas.clear();
  document.querySelectorAll("[data-busca] input").forEach((i) => { i.value = q; });
  document.title = `${q} — Vai pro Carrinho`;

  $("#resumo").replaceChildren(el("div", {}, el("h1", {}, el("span", {}, "Buscando "), `“${q}”…`), el("p", {}, "Comparando preços nas lojas")));
  $("#total").textContent = "";
  $("#filtro-lojas").replaceChildren();
  $("#vazio").hidden = true;
  $("#grade").replaceChildren(...esqueletos(8));

  try {
    const dados = await consultarApi(q);
    if (pedido !== estado.pedido) return; // chegou resposta de uma busca antiga
    $("#aviso-teste").hidden = !dados.exemplo;
    estado.ofertas = dados.ofertas;
    desenharFiltroLojas();
    desenharResultados();
  } catch (erro) {
    if (pedido !== estado.pedido) return;
    estado.ofertas = [];
    $("#grade").replaceChildren();
    $("#vazio").hidden = false;
    $("#resumo").replaceChildren(el("div", {}, el("h1", {}, "Ops! Não conseguimos buscar agora"), el("p", {}, "Verifique sua conexão e tente de novo.")));
  }
}

// ---------------------------------------------------------------------
// Página inicial
// ---------------------------------------------------------------------
async function carregarDestaques() {
  const carrossel = $("#destaques");
  carrossel.replaceChildren(...esqueletos(6));
  try {
    const dados = await consultarApi("");
    $("#aviso-teste").hidden = !dados.exemplo;
    carrossel.replaceChildren(...dados.ofertas.map(cartaoOferta));
  } catch {
    carrossel.replaceChildren(el("p", { class: "vazio" }, "Não foi possível carregar as ofertas agora."));
  }
}

function montarInicio() {
  $("#em-alta").replaceChildren(...EM_ALTA.map((t) =>
    el("button", { class: "chip-alta", type: "button", onclick: () => irPara(t) }, t)));

  $("#lojas-hero").replaceChildren(...Object.values(LOJAS).map((l) =>
    el("li", { style: `--cor-loja:${l.cor}` }, el("span", { class: "loja-ponto" }), l.nome)));

  $("#categorias").replaceChildren(...CATEGORIAS.map((c) =>
    el("button", { class: "categoria", type: "button", style: `--fundo-cat:${c.fundo}`, onclick: () => irPara(c.nome) },
      el("span", { class: "categoria-icone", "aria-hidden": "true" }, c.emoji), c.nome)));

  document.querySelectorAll("[data-rolar]").forEach((b) => b.addEventListener("click", () => {
    const c = $("#destaques");
    c.scrollBy({ left: Number(b.dataset.rolar) * c.clientWidth * 0.8, behavior: "smooth" });
  }));
}

// ---------------------------------------------------------------------
// Navegação: ?q=... na barra de endereço (o botão Voltar funciona)
// ---------------------------------------------------------------------
let destaquesCarregados = false;

function mostrar() {
  const q = (new URLSearchParams(location.search).get("q") || "").trim();
  const emBusca = Boolean(q);
  document.body.classList.toggle("modo-inicio", !emBusca);
  $("#inicio").hidden = emBusca;
  $("#resultados").hidden = !emBusca;
  if (emBusca) {
    buscar(q);
  } else {
    document.title = "Vai pro Carrinho — Compare preços e economize";
    document.querySelectorAll("[data-busca] input").forEach((i) => { i.value = ""; });
    if (!destaquesCarregados) { destaquesCarregados = true; carregarDestaques(); }
  }
}

function irPara(q) {
  q = (q || "").trim();
  const url = q ? `?q=${encodeURIComponent(q)}` : location.pathname;
  history.pushState(null, "", url);
  window.scrollTo({ top: 0, behavior: "smooth" });
  mostrar();
}

// ---------------------------------------------------------------------
// Caixa de busca com sugestões
// ---------------------------------------------------------------------
const normalizar = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function prepararBusca(form) {
  const input = $("input", form);
  const lista = $(".sugestoes", form);
  let itens = [];
  let ativo = -1;

  const fechar = () => { lista.hidden = true; ativo = -1; };

  const marcar = () => [...lista.children].forEach((li, i) => li.setAttribute("aria-selected", i === ativo));

  function desenhar() {
    const termo = normalizar(input.value.trim());
    itens = termo ? SUGESTOES.filter((s) => normalizar(s).includes(termo)).slice(0, 6) : [];
    if (!itens.length) return fechar();
    lista.replaceChildren(...itens.map((s) => {
      const i = normalizar(s).indexOf(termo);
      return el("li", {
        role: "option",
        onmousedown: (e) => { e.preventDefault(); input.value = s; fechar(); irPara(s); },
      }, el("span", {}, s.slice(0, i), el("mark", {}, s.slice(i, i + termo.length)), s.slice(i + termo.length)));
    }));
    ativo = -1;
    lista.hidden = false;
  }

  input.addEventListener("input", desenhar);
  input.addEventListener("blur", fechar);
  input.addEventListener("keydown", (e) => {
    if (lista.hidden) return;
    if (e.key === "ArrowDown") { ativo = (ativo + 1) % itens.length; marcar(); e.preventDefault(); }
    else if (e.key === "ArrowUp") { ativo = (ativo - 1 + itens.length) % itens.length; marcar(); e.preventDefault(); }
    else if (e.key === "Escape") fechar();
    else if (e.key === "Enter" && ativo >= 0) { input.value = itens[ativo]; }
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    fechar();
    if (!input.value.trim()) { input.focus(); return toast("Digite o nome de um produto 😉"); }
    input.blur();
    irPara(input.value);
  });
}

// ---------------------------------------------------------------------
// Filtros no celular (gaveta que sobe da parte de baixo)
// ---------------------------------------------------------------------
function abrirFiltros(abrir) {
  $("#filtros").classList.toggle("aberto", abrir);
  $("#painel-fundo").hidden = !abrir && $("#painel-favoritos").hidden;
}

// ---------------------------------------------------------------------
// Início
// ---------------------------------------------------------------------
document.querySelectorAll("[data-busca]").forEach(prepararBusca);
document.querySelectorAll("[data-inicio]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); irPara(""); }));

let timerPreco;
["#preco-min", "#preco-max"].forEach((s) => $(s).addEventListener("input", () => {
  clearTimeout(timerPreco);
  timerPreco = setTimeout(desenharResultados, 300);
}));
["#so-frete", "#so-desconto", "#ordem"].forEach((s) => $(s).addEventListener("change", desenharResultados));
$("#limpar-filtros").addEventListener("click", () => {
  $("#preco-min").value = "";
  $("#preco-max").value = "";
  $("#so-frete").checked = false;
  $("#so-desconto").checked = false;
  estado.lojasDesmarcadas.clear();
  desenharFiltroLojas();
  desenharResultados();
});

$("#abrir-filtros").addEventListener("click", () => abrirFiltros(true));
document.querySelectorAll("[data-fechar-filtros]").forEach((b) => b.addEventListener("click", () => abrirFiltros(false)));
$("#abrir-favoritos").addEventListener("click", () => abrirPainel(true));
$("#fechar-favoritos").addEventListener("click", () => abrirPainel(false));
$("#painel-fundo").addEventListener("click", () => { abrirPainel(false); abrirFiltros(false); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") { abrirPainel(false); abrirFiltros(false); } });

window.addEventListener("popstate", mostrar);
$("#ano").textContent = new Date().getFullYear();

montarInicio();
atualizarFavoritos();
mostrar();
