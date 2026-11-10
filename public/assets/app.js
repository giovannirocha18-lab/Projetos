// =====================================================================
// Vai pro Carrinho — comparador de preços
// =====================================================================

// "Ofertas do dia" pedidas antes de todo o resto (29/10/2026, Giovanni: na 1ª abertura ficava "Buscando…" sem
// nenhum produto): na página inicial o pedido sai já na 1ª linha; carregarDestaques usa esta resposta
const VERSAO_BUSCA = 108;
const ehPaginaInicial = location.pathname === "/" && !new URLSearchParams(location.search).has("q")
  && !new URLSearchParams(location.search).has("loja");
let inicioAdiantado = ehPaginaInicial
  ? fetch(`/api/buscar?v=${VERSAO_BUSCA}&q=`).then((r) => (r.ok ? r.json() : null)).catch(() => null)
  : null;

const LOJAS = {
  shopee: { nome: "Shopee", em: "na", cor: "#ee4d2d", texto: "#fff" },
  // tag: selo com as cores do site da loja (Mercado Livre: amarelo com azul-escuro; pedido do Giovanni, 04/11/2026)
  mercadolivre: { nome: "Mercado Livre", em: "no", cor: "#ffe600", texto: "#2d3277", tag: "loja-tag-ml" },
  amazon: { nome: "Amazon", em: "na", cor: "#ff9900", texto: "#131921" },
  aliexpress: { nome: "AliExpress", em: "no", cor: "#6d28d9", texto: "#fff" },
  magalu: { nome: "Magalu", em: "na", cor: "#0086ff", texto: "#fff" },
  shein: { nome: "Shein", em: "na", cor: "#222222", texto: "#fff" },
};

// Lojas fora da lista acima (as da Awin, por exemplo) chegam com o nome em lojaNome.
// Cor própria de algumas (o nome começa por: "spicy" vale "Spicy BR"); as outras ficam roxas
// Cor da marca de cada loja da Awin (Kabum = azul da marca, para não ficar igual ao AliExpress; pedido do Giovanni, 20/10/2026)
const CORES_POR_NOME = [["spicy", "#b0002a"], ["kabum", "#0060b1"], ["karsten", "#1d3557"]];
const corPorNome = (nome) => CORES_POR_NOME.find(([n]) => String(nome || "").toLowerCase().trim().startsWith(n))?.[1];
const infoLoja = (o) => LOJAS[o.loja] || { nome: o.lojaNome || o.loja, em: "na",
  cor: corPorNome(o.lojaNome) || "#6d28d9", texto: "#fff" };

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

// Atalhos abaixo da busca: vêm de /api/em-alta (mais buscados no site + categorias
// em alta na Shopee). Esta lista só aparece enquanto carrega ou se a API falhar
const EM_ALTA = ["Air fryer", "Fone bluetooth", "Smartwatch", "Tênis de corrida", "Power bank", "Garrafa térmica", "Robô aspirador", "Kit maquiagem"];

// Sugestões enquanto o vocabulário (/api/vocabulario) não chega
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

// Contagem dos cliques que levam às lojas (pedido do Giovanni, 03/11/2026; functions/api/clique.js): os links marcados
// com marcaClique() avisam o servidor com sendBeacon, sem atrasar a ida à loja. Vai só a loja, o lugar do site e o produto
const marcaClique = (onde, o = {}) => ({
  "data-clique": onde, "data-loja": infoLoja(o).nome || "", "data-id": o.id || "", "data-titulo": String(o.titulo || "").slice(0, 120),
});
function avisarClique(e) {
  if (e.type === "auxclick" && e.button !== 1) return; // botão do meio (abre em outra aba)
  const a = e.target.closest?.("a[data-clique]");
  if (!a || e.defaultPrevented) return; // a foto no celular abre os detalhes em vez da loja
  const corpo = JSON.stringify({ onde: a.dataset.clique, loja: a.dataset.loja, id: a.dataset.id, titulo: a.dataset.titulo });
  try {
    if (!navigator.sendBeacon?.("/api/clique", new Blob([corpo], { type: "application/json" }))) {
      fetch("/api/clique", { method: "POST", body: corpo, keepalive: true, headers: { "Content-Type": "application/json" } }).catch(() => {});
    }
  } catch { /* sem contagem, mas a pessoa vai para a loja do mesmo jeito */ }
}
document.addEventListener("click", avisarClique);
document.addEventListener("auxclick", avisarClique);

// Shopee no Android abre no aplicativo dela (print do Giovanni, 06/11/2026): no navegador do celular, mesmo logado, a Shopee
// abre o produto mas dá "Página indisponível" ao tocar na descrição. O link continua o de afiliado (s.shopee.com.br), só que
// entregue ao app da Shopee (com.shopee.br); sem o app instalado, o Chrome abre o mesmo link no navegador, como antes
const ANDROID = /Android/i.test(navigator.userAgent);
function abrirNoAppShopee(e) {
  if (!ANDROID || e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey) return;
  const a = e.target.closest?.("a[href]");
  let url;
  try { url = new URL(a?.href); } catch { return; }
  const abrirNoApp = (u) => {
    const resto = `${u.host}${u.pathname}${u.search}`;
    location.href = `intent://${resto}#Intent;scheme=https;package=com.shopee.br;S.browser_fallback_url=${encodeURIComponent(u.href)};end`;
  };
  // Produto da lista oficial da Shopee (08/11/2026): o link de afiliado é pedido no clique (/ir/shopee/…, _middleware.js)
  if (url.origin === location.origin && /^\/ir\/shopee\//.test(url.pathname)) {
    e.preventDefault();
    fetch(`${url.pathname}?json=1`).then((r) => r.json()).then((d) => {
      const destino = new URL(d.link);
      if (/(^|\.)shopee\.com\.br$/.test(destino.hostname)) abrirNoApp(destino);
      else location.href = destino.href;
    }).catch(() => { location.href = url.href; });
    return;
  }
  if (url.protocol !== "https:" || !/(^|\.)shopee\.com\.br$/.test(url.hostname)) return;
  e.preventDefault();
  abrirNoApp(url);
}
document.addEventListener("click", abrirNoAppShopee);

const ICONE_CARRINHO = () => {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "20");
  svg.setAttribute("height", "20");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = '<path d="M2.5 3.5h2.3l2.6 11a1.6 1.6 0 0 0 1.6 1.2h8.4a1.6 1.6 0 0 0 1.5-1.1L21 7.5H6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>'
    + '<circle cx="9.5" cy="20" r="1.6" fill="currentColor"/><circle cx="17" cy="20" r="1.6" fill="currentColor"/>'
    + '<path class="icone-mais" d="M13.3 9.4v4.4M11.1 11.6h4.4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
    + '<path class="icone-ok" d="m11.2 11.7 1.8 1.8 3.2-3.4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
  return svg;
};

// ---------------------------------------------------------------------
// Avisos rápidos
// ---------------------------------------------------------------------
let timerToast;
function toast(msg, ms = 2600) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("visivel");
  clearTimeout(timerToast);
  timerToast = setTimeout(() => t.classList.remove("visivel"), ms);
}

// A loja (ou a rede de afiliados dela) saiu do ar na hora do "Comprar"/"Ir para a loja": o servidor volta para cá com
// ?aviso=loja-instavel e o site explica que o problema não é nosso (pedido do Giovanni, 29/10/2026)
function avisoDeLojaInstavel() {
  const params = new URLSearchParams(location.search);
  if (params.get("aviso") !== "loja-instavel") return;
  const nome = (params.get("nome") || "").slice(0, 60) || (params.get("loja") ? nomeDaLoja(params.get("loja")) : "");
  params.delete("aviso");
  params.delete("nome");
  history.replaceState(null, "", `${location.pathname}${params.size ? `?${params}` : ""}`);
  const loja = nome && nome !== "loja" ? `da ${nome}` : "da loja";
  toast(`⚠️ O sistema ${loja} está instável no momento e não conseguimos abrir a página. Não é um problema do Vai pro Carrinho: tente de novo em alguns minutos.`, 12000);
}

// ---------------------------------------------------------------------
// Meu carrinho (no código ainda chamado de "favoritos"). Fica salvo neste
// navegador e, se a pessoa entrar na conta, também na conta.
// ---------------------------------------------------------------------
const CHAVE_FAV = "vpc-favoritos";
let favoritos = [];
try { favoritos = JSON.parse(localStorage.getItem(CHAVE_FAV)) || []; } catch { favoritos = []; }

function salvarFavoritos() {
  try { localStorage.setItem(CHAVE_FAV, JSON.stringify(favoritos)); } catch { /* navegador sem armazenamento */ }
}

const ehFavorito = (id) => favoritos.some((f) => f.id === id);

function alternarFavorito(oferta, origem) {
  // Guardar no carrinho exige conta (pedido do Giovanni, 30/10/2026): abre "Entrar" e, depois de entrar, guarda sozinho
  if (!ehFavorito(oferta.id) && conta.ativo && !conta.usuario) {
    conta.carrinhoOferta = oferta;
    conta.alertaOferta = null;
    conta.erro = "";
    conta.etapa = "entrar";
    desenharConta();
    const janela = $("#janela-conta");
    if (!janela.open) janela.showModal();
    $("input", janela)?.focus();
    return;
  }
  guardarOuTirar(oferta, origem);
}
function guardarOuTirar(oferta, origem) {
  if (ehFavorito(oferta.id)) {
    favoritos = favoritos.filter((f) => f.id !== oferta.id);
    toast("Removido do carrinho");
  } else {
    const { id, titulo, preco, loja, lojaNome, link, imagem, emoji, categoria } = oferta;
    // Preço "de" só quando o cartão mostra economia (o mesmo que aparece em "Você economiza"): soma no carrinho
    const precoAntigo = oferta.precoAntigo > preco + 1 ? oferta.precoAntigo : undefined;
    favoritos.unshift({ id, titulo, preco, precoAntigo, loja, lojaNome, link, imagem, emoji, categoria });
    toast("🛒 Guardado no seu carrinho");
    if (origem) voarAteCarrinho(origem);
  }
  salvarFavoritos();
  enviarCarrinho();
  atualizarFavoritos(true);
}

// A foto do produto "voa" até o carrinho do topo (26/10/2026, pesquisa: confirmação visível de que deu certo)
function voarAteCarrinho(origem) {
  const destino = [$("#abrir-favoritos"), $("[data-bb-carrinho]")].find((b) => b?.offsetParent) || $("#abrir-favoritos");
  const foto = origem.closest(".oferta")?.querySelector(".oferta-foto img, .oferta-foto .foto-emoji") || origem;
  const de = foto.getBoundingClientRect();
  const para = destino.getBoundingClientRect();
  if (!de.width || !para.width || !document.body.animate) return;
  const tamanho = Math.min(90, de.width, de.height || 90);
  const voando = foto.tagName === "IMG" ? el("img", { src: foto.src, alt: "" }) : el("span", {}, foto.textContent);
  voando.className = "voando";
  Object.assign(voando.style, { width: `${tamanho}px`, height: `${tamanho}px`,
    left: `${de.left + de.width / 2 - tamanho / 2}px`, top: `${de.top + (de.height || tamanho) / 2 - tamanho / 2}px` });
  document.body.append(voando);
  const dx = para.left + para.width / 2 - (de.left + de.width / 2);
  const dy = para.top + para.height / 2 - (de.top + (de.height || tamanho) / 2);
  voando.animate([
    { transform: "translate(0, 0) scale(1)", opacity: 1 },
    { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 60}px) scale(.6)`, opacity: 1, offset: 0.5 },
    { transform: `translate(${dx}px, ${dy}px) scale(.15)`, opacity: .3 },
  ], { duration: 750, easing: "cubic-bezier(.5, 0, .75, 1)" }).finished.then(() => {
    voando.remove();
    destino.classList.remove("chegou");
    void destino.offsetWidth;
    destino.classList.add("chegou");
  }, () => voando.remove());
}

function atualizarFavoritos(animar = false) {
  const c = $("#contador-favoritos");
  c.textContent = favoritos.length;
  c.hidden = !favoritos.length;
  const bb = $("[data-contador-bb]");
  if (bb) { bb.textContent = favoritos.length; bb.hidden = !favoritos.length; }
  if (animar) for (const x of [c, bb]) if (x) { x.classList.remove("pulo"); void x.offsetWidth; x.classList.add("pulo"); }
  document.querySelectorAll(".favoritar").forEach((b) => b.setAttribute("aria-pressed", ehFavorito(b.dataset.id)));
  if (!$("#painel-favoritos").hidden) desenharFavoritos();
}

function desenharFavoritos() {
  const lista = $("#lista-favoritos");
  if (!favoritos.length) {
    lista.replaceChildren(el("div", { class: "fav-vazio" },
      el("span", {}, "🛒"), el("p", {}, "Seu carrinho está vazio. Toque no carrinho de uma oferta para guardar e comprar depois.")));
    return;
  }
  // "Você economiza R$ X no seu carrinho" (26/10/2026): soma do "Você economiza" dos produtos guardados, com os preços de
  // quando foram guardados
  const total = favoritos.reduce((t, f) => t + f.preco, 0);
  const economia = favoritos.reduce((t, f) => t + (f.precoAntigo > f.preco ? f.precoAntigo - f.preco : 0), 0);
  const resumo = el("div", { class: "fav-resumo" },
    el("p", {}, `${favoritos.length} ${favoritos.length === 1 ? "produto" : "produtos"} · `, el("strong", {}, `R$ ${brl(total)}`)),
    economia >= 1 && el("p", { class: "fav-economia" }, "💸 Você economiza ", el("strong", {}, `R$ ${brl(economia)}`), " com as ofertas do seu carrinho"),
    el("small", {}, "Preços de quando você guardou; confira o valor na loja antes de pagar."));
  lista.replaceChildren(resumo, ...favoritos.map((f) => {
    const loja = infoLoja(f);
    return el("div", { class: "fav-item" },
      el("div", { class: "fav-foto", style: `--fundo-cat:${FUNDO_CATEGORIA[f.categoria] || "var(--bg)"}` },
        f.imagem ? el("img", { src: f.imagem, alt: "" }) : f.emoji || "🛍️"),
      el("div", {},
        el("a", { href: f.link, target: "_blank", rel: "sponsored noopener", ...marcaClique("carrinho", f) }, f.titulo),
        el("strong", {}, `R$ ${brl(f.preco)}`, f.precoAntigo > f.preco && el("s", { class: "fav-antigo" }, `R$ ${brl(f.precoAntigo)}`)),
        el("span", { class: `loja-tag ${loja.tag || ""}`, style: `--cor-loja:${loja.cor}` }, el("span", { class: "loja-ponto" }), loja.nome)),
      el("button", { class: "fechar", type: "button", "aria-label": "Remover", onclick: () => alternarFavorito(f) }, "✕"));
  }));
}

// Painel e gaveta funcionam como janelas: o foco entra no botão de fechar e,
// ao fechar, volta para o botão que abriu (quem usa teclado ou leitor de tela não se perde)
function focarAoAbrir(painel, botaoFechar) {
  painel.voltarFoco = document.activeElement;
  painel.setAttribute("role", "dialog");
  painel.setAttribute("aria-modal", "true");
  botaoFechar?.focus({ preventScroll: true });
}

function devolverFoco(painel) {
  painel.removeAttribute("role");
  painel.removeAttribute("aria-modal");
  const voltar = painel.voltarFoco;
  painel.voltarFoco = null;
  // Só devolve se o foco ainda estava no painel (ou se perdeu, ao clicar no fundo escuro)
  const focoAqui = painel.contains(document.activeElement) || document.activeElement === document.body;
  if (voltar?.isConnected && focoAqui) voltar.focus({ preventScroll: true });
}

function abrirPainel(abrir) {
  const painel = $("#painel-favoritos");
  const estavaAberto = !painel.hidden;
  painel.hidden = !abrir;
  $("#painel-fundo").hidden = !abrir && !$("#filtros").classList.contains("aberto");
  if (abrir) desenharFavoritos();
  if (abrir && !estavaAberto) focarAoAbrir(painel, $("#fechar-favoritos"));
  else if (!abrir && estavaAberto) devolverFoco(painel);
}

// ---------------------------------------------------------------------
// Conta: entrar com Google ou com e-mail e senha, e carrinho na conta
// ---------------------------------------------------------------------
const conta = { ativo: false, google: false, usuario: null, etapa: "entrar", email: "", nome: "", erro: "", token: "" };

async function chamarConta(metodo, caminho, corpo) {
  const resp = await fetch(`/api/conta${caminho}`, {
    method: metodo,
    headers: corpo ? { "Content-Type": "application/json" } : {},
    body: corpo ? JSON.stringify(corpo) : undefined,
    credentials: "same-origin",
  });
  let dados = {};
  try { dados = await resp.json(); } catch { /* resposta vazia */ }
  if (!resp.ok) throw new Error(dados.erro || "Algo deu errado. Tente de novo.");
  return dados;
}

// Junta o carrinho deste aparelho com o da conta (sem repetir itens). Só na hora de
// entrar na conta: depois disso, a conta manda (senão um item tirado em outro aparelho voltaria)
function juntarCarrinho(daConta = []) {
  const ids = new Set(favoritos.map((f) => f.id));
  const juntos = [...favoritos, ...daConta.filter((f) => !ids.has(f.id))];
  const mudouConta = juntos.length !== daConta.length;
  favoritos = juntos;
  salvarFavoritos();
  atualizarFavoritos();
  if (mudouConta) enviarCarrinho();
}

// Já entrou na conta antes (aparelho conectado): o carrinho da conta substitui o daqui
function usarCarrinhoDaConta(daConta = []) {
  favoritos = daConta;
  salvarFavoritos();
  atualizarFavoritos();
}

let timerEnvio;
function enviarCarrinho(tentativa = 0) {
  if (!conta.usuario) return;
  clearTimeout(timerEnvio);
  timerEnvio = setTimeout(async () => {
    try {
      await chamarConta("PUT", "/carrinho", { itens: favoritos });
    } catch {
      // Confere só a sessão (sem juntar nem reenviar o carrinho, para não virar um laço).
      // Sessão vencida: volta a guardar só no aparelho. Sessão boa: tenta de novo uma única vez.
      try { await lerSessao(); } catch { /* sem internet: fica como está */ }
      desenharContaTopo();
      if (!conta.usuario) return;
      if (tentativa < 1) enviarCarrinho(tentativa + 1);
      else toast("Não foi possível salvar o carrinho na sua conta agora");
    }
  }, tentativa ? 3000 : 600);
}

// Lê a sessão no servidor, sem mexer no carrinho
async function lerSessao() {
  const dados = await chamarConta("GET", "");
  conta.ativo = dados.ativo;
  conta.google = Boolean(dados.google);
  conta.usuario = dados.usuario || null;
  return dados;
}

// Marca "acabou de entrar com o Google" (a página recarrega na volta do Google)
const CHAVE_JUNTAR = "vpc-juntar-carrinho";

async function carregarConta() {
  let juntar = false;
  try { juntar = localStorage.getItem(CHAVE_JUNTAR) === "1"; localStorage.removeItem(CHAVE_JUNTAR); } catch { /* sem armazenamento */ }
  try {
    const dados = await lerSessao();
    if (conta.usuario) {
      (juntar ? juntarCarrinho : usarCarrinhoDaConta)(dados.carrinho);
      carregarAlertas();
    }
  } catch {
    conta.ativo = false;
  }
  desenharContaTopo();
  // Volta do Google com erro, ou link de nova senha do e-mail: abre a janela na etapa certa
  const hash = location.hash;
  if (hash !== "#erro-google" && !hash.startsWith("#nova-senha=") && !hash.startsWith("#confirmar=")) return;
  history.replaceState(null, "", location.pathname + location.search);
  if (!conta.ativo) return;
  if (hash.startsWith("#confirmar=")) return confirmarEmail(hash.slice("#confirmar=".length));
  if (hash.startsWith("#nova-senha=")) {
    conta.token = hash.slice("#nova-senha=".length);
    conta.usuario = null; // a nova senha vale para a conta do link, mesmo se outra estiver aberta aqui
    conta.etapa = "nova-senha";
    abrirConta();
  } else if (!conta.usuario) {
    abrirConta();
    conta.erro = "Não foi possível entrar com o Google. Tente de novo.";
    desenharConta();
  }
}

function entrarComGoogle() {
  // Na volta, o carrinho deste aparelho é juntado ao da conta (como no login com senha); o produto que a pessoa
  // ia guardar entra antes, para chegar junto
  if (conta.carrinhoOferta && !ehFavorito(conta.carrinhoOferta.id)) guardarOuTirar(conta.carrinhoOferta);
  try { localStorage.setItem(CHAVE_JUNTAR, "1"); } catch { /* sem armazenamento */ }
  location.href = `/api/conta/google?volta=${encodeURIComponent(location.pathname)}`;
}

function desenharContaTopo() {
  const botao = $("#abrir-conta");
  botao.hidden = !conta.ativo;
  $("[data-bb-conta]").hidden = !conta.ativo;
  const caixa = $("#painel-conta");
  caixa.hidden = !conta.ativo;
  if (!conta.ativo) return;

  if (conta.usuario) {
    botao.setAttribute("aria-label", "Minha conta");
    botao.replaceChildren(el("span", { class: "inicial", "aria-hidden": "true" }, conta.usuario.nome.charAt(0).toUpperCase()));
    caixa.replaceChildren(
      el("p", {}, "✅ Carrinho salvo na sua conta. Ele aparece em qualquer aparelho em que você entrar."),
      el("button", { class: "botao-link", type: "button", onclick: abrirConta }, `Conta de ${conta.usuario.nome.split(" ")[0]}`));
  } else {
    botao.setAttribute("aria-label", "Entrar");
    botao.replaceChildren(botao.dataset.icone ? document.createRange().createContextualFragment(botao.dataset.icone) : "");
    caixa.replaceChildren(
      el("p", {}, "💡 Entre na sua conta para ver o seu carrinho no celular e no computador."),
      el("button", { class: "botao-primario", type: "button", style: "margin-top:0", onclick: abrirConta }, "Entrar ou criar conta"));
  }
}

// ---------------------------------------------------------------------
// Meu personagem: quem tem conta monta o personagem da animação de busca
// ---------------------------------------------------------------------
function abrirEditorPersonagem() {
  conta.rascunho = { ...PERSONAGEM_PADRAO, ...(conta.usuario.personagem || PERSONAGENS_PRONTOS[0]) };
  conta.etapa = "personagem";
  conta.erro = "";
  desenharConta();
}

function editorPersonagem(erro) {
  const r = conta.rascunho;
  const previa = el("div", { class: "anim-buscando previa-personagem" });
  previa.innerHTML = desenharPersonagem(r);
  const escolher = (campo, valor) => { r[campo] = valor; desenharConta(); };
  const grupos = Object.entries(PERSONAGEM_OPCOES).map(([campo, { titulo, itens, cores }]) => el("div", { class: "grupo-personagem" },
    el("span", { class: "titulo-grupo" }, titulo),
    el("div", { class: "opcoes-personagem" }, cores
      ? Object.entries(cores).map(([valor, cor]) => el("button", {
        type: "button", class: `cor-personagem${r[campo] === valor ? " ativa" : ""}`, style: `background:${cor}`,
        title: valor, "aria-label": `${titulo}: ${valor}`, "aria-pressed": String(r[campo] === valor), onclick: () => escolher(campo, valor),
      }))
      : Object.entries(itens).map(([valor, nome]) => el("button", {
        type: "button", class: `chip-personagem${r[campo] === valor ? " ativa" : ""}`, "aria-pressed": String(r[campo] === valor),
        onclick: () => escolher(campo, valor),
      }, nome)))));
  // No computador a janela fica larga, em colunas (prévia e botões à esquerda, opções à direita), para caber tudo sem
  // rolar (pedido do Giovanni, 23/10/2026); no celular continua uma coluna só
  return [
    el("h2", { id: "conta-titulo" }, "🎨 Meu personagem"),
    el("p", {}, "É ele que empurra o carrinho enquanto o site busca as ofertas para você."),
    el("div", { class: "editor-personagem" },
      el("div", { class: "editor-lado" },
        previa,
        el("button", { class: "botao-secundario botao-sortear", type: "button", onclick: () => { conta.rascunho = sortearPersonagem(); desenharConta(); } }, "🎲 Sortear um personagem"),
        erro,
        el("button", { class: "botao-primario", type: "button", onclick: () => salvarPersonagem() }, "Salvar meu personagem"),
        el("div", { class: "links-conta" },
          el("button", { class: "botao-link", type: "button", onclick: () => { conta.etapa = "entrar"; conta.erro = ""; desenharConta(); } }, "Voltar"),
          conta.usuario.personagem && el("button", { class: "botao-link", type: "button", onclick: () => salvarPersonagem(null) }, "Usar os personagens do site"))),
      el("div", { class: "editor-opcoes" }, ...grupos)),
  ];
}

function salvarPersonagem(personagem = conta.rascunho) {
  return comEspera(null, async () => {
    const dados = await chamarConta("PUT", "/personagem", { personagem });
    conta.usuario.personagem = dados.personagem;
    conta.etapa = "entrar";
    toast(dados.personagem ? "Personagem salvo! Ele aparece nas suas buscas 🛒" : "Pronto: o site volta a sortear os personagens");
  });
}

// ---------------------------------------------------------------------
// Alertas de preço: "🔔 Me avise quando baixar" (e-mail; o robô confere os preços uma vez por dia, lib/alertas.js)
// ---------------------------------------------------------------------
const alertas = new Map(); // código do produto -> alerta da conta
const temAlerta = (id) => alertas.has(id);

function guardarAlertas(lista = []) {
  alertas.clear();
  for (const a of lista) alertas.set(a.id, a);
  document.querySelectorAll(".alertar").forEach((b) => b.setAttribute("aria-pressed", temAlerta(b.dataset.id)));
}

async function carregarAlertas() {
  if (!conta.usuario) return guardarAlertas([]);
  try {
    const dados = await chamarConta("GET", "/alertas");
    conta.emailConfirmado = dados.confirmado !== false;
    guardarAlertas(dados.alertas);
  } catch { /* sem internet: os sinos ficam como estão */ }
}

// Sem conta: pede para entrar e, depois de entrar, volta direto para o alerta deste produto
function abrirAlerta(o) {
  if (!conta.ativo) return toast("Os alertas de preço ainda não estão ligados");
  conta.alertaOferta = o;
  conta.erro = "";
  conta.etapa = conta.usuario ? "alerta" : "entrar";
  desenharConta();
  const janela = $("#janela-conta");
  if (!janela.open) janela.showModal();
  $("input", janela)?.focus();
}

function janelaAlerta(erro) {
  const o = conta.alertaOferta;
  const existente = alertas.get(o.id);
  const sugestao = Math.floor(o.preco * 0.9);
  const valor = el("input", { name: "alvo", inputmode: "decimal", autocomplete: "off", "aria-label": "Preço desejado em reais",
    value: existente?.alvo ? brl(existente.alvo) : brl(sugestao),
    onfocus: () => { $("#alvo-preco").checked = true; } });
  const opcao = (id, nome, checked, ...conteudo) => el("label", { class: "opcao-alerta" },
    el("input", { type: "radio", name: "tipo", id, value: nome, checked }), ...conteudo);
  return [
    el("h2", { id: "conta-titulo" }, existente ? "🔔 Seu alerta de preço" : "🔔 Me avise quando baixar"),
    el("div", { class: "alerta-produto" },
      o.imagem && el("img", { src: o.imagem, alt: "", loading: "lazy" }),
      el("div", {}, el("strong", {}, o.titulo), el("span", {}, `Hoje: R$ ${brl(o.preco)} · ${infoLoja(o).nome}`))),
    caixaMomento(o),
    el("form", { onsubmit: salvarAlerta },
      el("fieldset", { class: "opcoes-alerta" },
        el("legend", {}, "Quando avisar?"),
        opcao("alvo-qualquer", "qualquer", !existente?.alvo, "Quando o preço baixar"),
        opcao("alvo-preco", "preco", Boolean(existente?.alvo), "Quando chegar a R$", valor)),
      erro,
      el("button", { class: "botao-primario", type: "submit" }, existente ? "Salvar alerta" : "Criar alerta"),
      el("p", { class: "legal" }, `Mandamos um e-mail para ${conta.usuario.email}. Conferimos o preço uma vez por dia.`),
      el("div", { class: "links-conta" },
        existente && el("button", { class: "botao-link perigo", type: "button", onclick: () => pararAlerta(o.id) }, "Parar este alerta"),
        el("button", { class: "botao-link", type: "button", onclick: () => { conta.etapa = "meus-alertas"; conta.erro = ""; desenharConta(); } },
          `Meus alertas (${alertas.size})`))),
  ];
}

function salvarAlerta(e) {
  e.preventDefault();
  const form = e.target;
  const o = conta.alertaOferta;
  const alvo = form.tipo.value === "preco" ? lerPreco(form.alvo.value) : null;
  if (alvo !== null && !(alvo > 0 && alvo < o.preco)) {
    conta.erro = `O preço do alerta precisa ser menor que o de hoje (R$ ${brl(o.preco)}).`;
    return desenharConta();
  }
  return comEspera(form, async () => {
    const dados = await chamarConta("POST", "/alertas", {
      oferta: { id: o.id, titulo: o.titulo, preco: o.preco, loja: o.loja, lojaNome: infoLoja(o).nome, link: o.link, imagem: o.imagem },
      alvo,
    });
    guardarAlertas(dados.alertas);
    conta.alertaOferta = null;
    conta.emailConfirmado = dados.confirmado !== false;
    // E-mail ainda não confirmado (conta com senha): os avisos só saem depois de abrir o link mandado ao e-mail
    if (!conta.emailConfirmado) {
      conta.etapa = "meus-alertas";
      return desenharConta();
    }
    $("#janela-conta").close();
    toast(alvo ? `🔔 Pronto! Avisamos quando chegar a R$ ${brl(alvo)}` : "🔔 Pronto! Avisamos por e-mail quando o preço baixar");
  });
}

function reenviarConfirmacao() {
  return comEspera(null, async () => {
    const dados = await chamarConta("POST", "/confirmar", { reenviar: true });
    if (dados.confirmado) { conta.emailConfirmado = true; desenharConta(); return toast("✅ Seu e-mail já está confirmado"); }
    toast("📧 Link mandado. Confira seu e-mail (e a caixa de spam).");
  });
}

// Link "Confirmar e-mail" do e-mail (#confirmar=<código>)
async function confirmarEmail(token) {
  try {
    await chamarConta("POST", "/confirmar", { token });
    conta.emailConfirmado = true;
    toast("✅ E-mail confirmado! Os alertas de preço já valem.");
  } catch (e) {
    toast(e.message);
  }
}

function pararAlerta(id) {
  return comEspera(null, async () => {
    guardarAlertas((await chamarConta("DELETE", "/alertas", { id })).alertas);
    if (conta.etapa === "alerta") { conta.alertaOferta = null; conta.etapa = "meus-alertas"; }
    toast("Alerta parado");
  });
}

function meusAlertas(erro) {
  const lista = [...alertas.values()];
  return [
    el("h2", { id: "conta-titulo" }, "🔔 Meus alertas de preço"),
    conta.emailConfirmado === false && el("div", { class: "aviso-confirmar" },
      el("strong", {}, "📧 Confirme seu e-mail para receber os avisos"),
      el("span", {}, `Mandamos um link para ${conta.usuario?.email || "o seu e-mail"}. Os alertas ficam guardados e começam a valer quando você abrir o link.`),
      el("button", { class: "botao-link", type: "button", onclick: reenviarConfirmacao }, "Mandar o link de novo")),
    el("p", {}, lista.length
      ? "Avisamos por e-mail quando o preço baixar. Conferimos uma vez por dia."
      : "Você ainda não tem alertas. Toque no 🔔 de um produto para acompanhar o preço dele."),
    erro,
    lista.length > 0 && el("ul", { class: "lista-alertas" }, ...lista.map((a) => el("li", {},
      a.imagem && el("img", { src: a.imagem, alt: "", loading: "lazy" }),
      el("div", {},
        el("a", { href: a.link, target: "_blank", rel: "sponsored noopener", ...marcaClique("alerta", { ...a, loja: a.lojaNome }) }, a.titulo),
        el("span", {}, `${a.alvo ? `Avisar em R$ ${brl(a.alvo)}` : "Avisar quando baixar"} · era R$ ${brl(a.precoInicial)}`
          + `${a.ultimoPreco && a.ultimoPreco !== a.precoInicial ? ` · hoje R$ ${brl(a.ultimoPreco)}` : ""}`)),
      el("button", { class: "botao-link perigo", type: "button", onclick: () => pararAlerta(a.id) }, "Parar")))),
    el("div", { class: "links-conta" },
      el("button", { class: "botao-link", type: "button", onclick: () => {
        conta.etapa = conta.alertaOferta ? "alerta" : "entrar"; conta.erro = ""; desenharConta();
      } }, "Voltar")),
  ];
}

// "Vale a pena comprar agora?" (ideia do Zoom e do Keepa): uma frase a partir do nosso histórico de preço.
// Só com 14+ dias de acompanhamento; antes disso não dá para dizer nada com honestidade.
const DIAS_PARA_OPINAR = 14;
function momentoDeCompra(o) {
  const h = o.historico;
  if (!h || !(h.dias >= DIAS_PARA_OPINAR) || !h.habitual) return null;
  const variou = h.maior30 > h.menor30 * 1.02;
  if (h.descontoReal) return { cor: "verde", titulo: "🟢 Bom momento para comprar", texto: `Está ${h.descontoReal}% abaixo do preço de costume (R$ ${brl(h.habitual)}).` };
  if (variou && o.preco <= h.menor30) return { cor: "verde", titulo: "🟢 Bom momento para comprar", texto: "É o menor preço dos últimos 30 dias." };
  if (o.preco >= h.habitual * 1.05) {
    return { cor: "vermelho", titulo: "🔴 Se puder, espere", texto: `Está ${Math.round((o.preco / h.habitual - 1) * 100)}% acima do preço de costume (R$ ${brl(h.habitual)}).` };
  }
  if (!variou) return { cor: "amarelo", titulo: "🟡 Preço estável", texto: "Não mudou nos últimos 30 dias." };
  return { cor: "amarelo", titulo: "🟡 Preço normal", texto: `Perto do preço de costume. Nos últimos 30 dias já custou R$ ${brl(h.menor30)}.` };
}

function caixaMomento(o) {
  const m = momentoDeCompra(o);
  if (!m) {
    return o.historico && el("div", { class: "momento momento-cedo" },
      el("strong", {}, "⏳ Vale a pena comprar agora?"),
      el("span", {}, `Acompanhamos este preço há ${o.historico.dias || 0} dia(s). Com ${DIAS_PARA_OPINAR} dias dizemos se é um bom momento.`));
  }
  return el("div", { class: `momento momento-${m.cor}` }, el("strong", {}, m.titulo), el("span", {}, m.texto));
}

// ---------------------------------------------------------------------
// Compartilhar no WhatsApp (ideia do Pelando/Promobit): o link abre o próprio produto no nosso site
// (?produto=<código>, janela "Ver detalhes"; a prévia do WhatsApp mostra a foto e o preço, ver _middleware.js).
// Lomadee não tem busca por código: vai o link de uma busca pelo nome.
// ---------------------------------------------------------------------
const ICONE_WHATSAPP = () => {
  const span = el("span", { class: "icone-whatsapp", "aria-hidden": "true" });
  span.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2c-1.5 0-3-.4-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4c1.7.7 2.3.8 3.2.7.5-.1 1.5-.6 1.8-1.2.2-.6.2-1.1.1-1.2l-.5-.2z"/></svg>';
  return span;
};

function linkDoProduto(o) {
  if (/^(awin|shopee|aliexpress|mercadolivre)-/.test(o.id)) return `${location.origin}/?produto=${encodeURIComponent(o.id)}`;
  return `${location.origin}/?q=${encodeURIComponent(o.titulo.split(/\s+/).slice(0, 6).join(" "))}`;
}

function compartilharWhatsApp(o) {
  const texto = `Olha essa oferta que achei no Vai pro Carrinho 🛒\n${o.titulo}\n💰 R$ ${brl(o.preco)} ${infoLoja(o).em} ${infoLoja(o).nome}\n${linkDoProduto(o)}`;
  window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank", "noopener");
}

// Link compartilhado aberto: mostra a página inicial e, por cima, a janela do produto
async function abrirProdutoDoLink() {
  const params = new URLSearchParams(location.search);
  const id = params.get("produto");
  if (!id) return;
  params.delete("produto");
  history.replaceState(null, "", `${location.pathname}${params.size ? `?${params}` : ""}`);
  try {
    const r = await fetch(`/api/produto?id=${encodeURIComponent(id)}`);
    const { oferta } = await r.json();
    if (oferta) abrirDetalhes(oferta, { doLink: true });
    else toast("Essa oferta não está mais disponível 😕");
  } catch {
    toast("Não foi possível abrir essa oferta agora");
  }
}

// ---------------------------------------------------------------------
// Comparar lado a lado (ideia do PriceRunner/Buscapé): marca até 4 produtos e vê tudo numa tabela
// ---------------------------------------------------------------------
const MAX_COMPARAR = 4;
const comparando = new Map(); // código -> oferta

function alternarComparar(o) {
  if (comparando.has(o.id)) comparando.delete(o.id);
  else if (comparando.size >= MAX_COMPARAR) return toast(`Dá para comparar até ${MAX_COMPARAR} produtos de cada vez`);
  else comparando.set(o.id, o);
  atualizarComparar();
}

function atualizarComparar() {
  document.querySelectorAll(".comparar").forEach((b) => b.setAttribute("aria-pressed", comparando.has(b.dataset.id)));
  let barra = $("#barra-comparar");
  document.body.classList.toggle("com-comparar", comparando.size > 0);
  if (!comparando.size) { barra?.remove(); return; }
  if (!barra) { barra = el("div", { class: "barra-comparar", id: "barra-comparar", role: "region", "aria-label": "Produtos para comparar" }); document.body.append(barra); }
  const lista = [...comparando.values()];
  barra.replaceChildren(
    el("div", { class: "barra-comparar-fotos" }, ...lista.map((o) => el("button", {
      type: "button", class: "barra-comparar-item", title: `Tirar: ${o.titulo}`, "aria-label": `Tirar da comparação: ${o.titulo}`,
      onclick: () => alternarComparar(o),
    }, o.imagem ? el("img", { src: o.imagem, alt: "" }) : el("span", {}, o.emoji || "🛍️"), el("span", { class: "tirar", "aria-hidden": "true" }, "✕")))),
    el("button", { class: "botao-primario", type: "button", disabled: lista.length < 2, onclick: abrirComparacao },
      ...(lista.length < 2 ? longoCurto("Escolha mais 1 produto", "Escolha mais 1") : longoCurto(`⚖️ Comparar ${lista.length} produtos`, `⚖️ Comparar (${lista.length})`))),
    el("button", { class: "botao-link", type: "button", onclick: () => { comparando.clear(); atualizarComparar(); } }, "Limpar"));
}

function abrirComparacao() {
  const lista = [...comparando.values()];
  const menor = Math.min(...lista.map((o) => o.preco));
  const melhorNota = Math.max(...lista.map((o) => o.avaliacao || 0));
  const maisVendido = Math.max(...lista.map((o) => o.vendidos || 0));
  const linha = (titulo, celula) => el("tr", {}, el("th", { scope: "row" }, titulo), ...lista.map((o) => el("td", {}, celula(o))));
  const tabela = el("table", { class: "tabela-comparar" },
    el("thead", {}, el("tr", {}, el("th", {}, ""), ...lista.map((o) => el("th", { scope: "col" },
      el("div", { class: "comparar-foto" }, o.imagem ? el("img", { src: fotoPequena(o.imagem), alt: "", onerror: fotoQuebrada(o) }) : el("span", { class: "foto-emoji" }, o.emoji || "🛍️")),
      el("button", { class: "titulo-botao", type: "button", onclick: () => { $("#janela-comparar").close(); abrirDetalhes(o); } }, o.titulo))))),
    el("tbody", {},
      linha("Loja", (o) => el("span", { class: `loja-tag ${infoLoja(o).tag || ""}`, style: `--cor-loja:${infoLoja(o).cor}` }, el("span", { class: "loja-ponto" }), infoLoja(o).nome)),
      linha("Preço", (o) => el("div", { class: o.preco === menor ? "comparar-melhor" : null },
        el("strong", { class: "comparar-preco" }, `R$ ${brl(o.preco)}`),
        o.preco === menor && el("small", {}, "🏆 Menor preço"),
        o.preco > menor && el("small", {}, `+R$ ${brl(o.preco - menor)}`))),
      linha("Desconto", (o) => (o.desconto ? `-${o.desconto}%${o.precoAntigo ? ` (era R$ ${brl(o.precoAntigo)})` : ""}` : "—")),
      linha("Vale a pena?", (o) => { const m = momentoDeCompra(o); return m ? m.titulo : "—"; }),
      linha("Avaliação", (o) => (o.avaliacao ? el("span", { class: o.avaliacao === melhorNota && lista.length > 1 ? "comparar-melhor" : null },
        `★ ${String(o.avaliacao).replace(".", ",")}`) : "—")),
      linha("Vendidos", (o) => (o.vendidos ? el("span", { class: o.vendidos === maisVendido ? "comparar-melhor" : null }, vendidosTexto(o.vendidos)) : "—")),
      linha("Envio", (o) => (o.envioNacional ? "🇧🇷 Do Brasil" : o.internacional ? "🌎 Internacional" : o.freteGratis ? `🚚 Frete grátis${o.full ? " · ⚡ Full" : ""}` : o.full ? "⚡ Full" : "Nacional")),
      el("tr", {}, el("th", {}, ""), ...lista.map((o) => el("td", {},
        el("a", { class: classeBotao(infoLoja(o)), href: o.link, target: "_blank", rel: "sponsored noopener", ...marcaClique("comparar", o) }, ...textoComprar(infoLoja(o))),
        el("button", { class: "botao-link", type: "button", onclick: () => { alternarComparar(o); comparando.size >= 2 ? abrirComparacao() : $("#janela-comparar").close(); } }, "Tirar"))))));
  $("#comparar-conteudo").replaceChildren(
    el("h2", { id: "comparar-titulo" }, "⚖️ Comparar produtos"),
    el("p", {}, "Preços de hoje. Confira na loja antes de comprar."),
    el("div", { class: "comparar-rolagem" }, tabela));
  if (!$("#janela-comparar").open) $("#janela-comparar").showModal();
}

function abrirConta() {
  conta.erro = "";
  if (!conta.usuario && conta.etapa !== "nova-senha") conta.etapa = "entrar";
  desenharConta();
  const janela = $("#janela-conta");
  if (!janela.open) janela.showModal();
  $("input", janela)?.focus();
}

function desenharConta() {
  const erro = conta.erro && el("p", { class: "erro-conta", role: "alert" }, conta.erro);
  let conteudo;

  if (conta.usuario && conta.etapa === "personagem") {
    conteudo = editorPersonagem(erro);
  } else if (conta.usuario && conta.etapa === "alerta" && conta.alertaOferta) {
    conteudo = janelaAlerta(erro);
  } else if (conta.usuario && conta.etapa === "meus-alertas") {
    conteudo = meusAlertas(erro);
  } else if (conta.usuario) {
    conteudo = [
      el("h2", { id: "conta-titulo" }, `Olá, ${conta.usuario.nome.split(" ")[0]}! 👋`),
      el("div", { class: "conta-dados" }, el("strong", {}, conta.usuario.nome), el("span", {}, conta.usuario.email)),
      el("p", {}, `Você tem ${favoritos.length} ${favoritos.length === 1 ? "item" : "itens"} no carrinho, salvos na sua conta.`),
      erro,
      el("button", { class: "botao-primario", type: "button", onclick: () => { $("#janela-conta").close(); abrirPainel(true); } }, "🛒 Ver meu carrinho"),
      el("button", { class: "botao-secundario botao-personagem", type: "button", onclick: () => { conta.etapa = "meus-alertas"; conta.erro = ""; desenharConta(); } },
        `🔔 Meus alertas de preço (${alertas.size})`),
      el("button", { class: "botao-secundario botao-personagem", type: "button", onclick: abrirEditorPersonagem },
        conta.usuario.personagem ? "🎨 Mudar meu personagem" : "🎨 Montar meu personagem"),
      el("div", { class: "links-conta" },
        el("button", { class: "botao-link", type: "button", onclick: sair }, "Sair desta conta"),
        el("button", { class: "botao-link perigo", type: "button", onclick: excluirConta }, "Excluir minha conta")),
    ];
  } else if (conta.etapa === "esqueci") {
    conteudo = [
      el("h2", { id: "conta-titulo" }, "Esqueci minha senha"),
      el("p", {}, "Digite o seu e-mail. Vamos mandar um link para você criar uma nova senha."),
      el("form", { onsubmit: pedirLink },
        campoEmail(),
        erro,
        el("button", { class: "botao-primario", type: "submit" }, "Receber link"),
        el("div", { class: "links-conta" }, linkEtapa("entrar", "Voltar"))),
    ];
  } else if (conta.etapa === "enviado") {
    conteudo = [
      el("h2", { id: "conta-titulo" }, "Confira seu e-mail 📬"),
      el("p", {}, "Se ", el("strong", {}, conta.email), " tiver conta, você vai receber um link para criar uma nova senha. Ele vale por 1 hora. Se não aparecer, olhe também no spam."),
      el("div", { class: "links-conta" }, linkEtapa("entrar", "Voltar para entrar")),
    ];
  } else if (conta.etapa === "nova-senha") {
    conteudo = [
      el("h2", { id: "conta-titulo" }, "Crie uma nova senha"),
      el("form", { onsubmit: gravarNovaSenha },
        campoSenha("new-password"),
        erro,
        el("button", { class: "botao-primario", type: "submit" }, "Salvar e entrar")),
    ];
  } else {
    const cadastro = conta.etapa === "cadastrar";
    conteudo = [
      el("h2", { id: "conta-titulo" }, cadastro ? "Criar conta" : "Entrar"),
      el("p", { class: conta.alertaOferta || conta.carrinhoOferta ? "aviso-alerta" : null }, conta.alertaOferta
        ? "🔔 Entre na sua conta para receber um e-mail quando o preço baixar."
        : conta.carrinhoOferta ? "🛒 Entre na sua conta para guardar produtos no seu carrinho. Ele fica salvo em qualquer aparelho."
        : "Assim o seu carrinho fica salvo em qualquer aparelho."),
      conta.google && el("button", { class: "botao-google", type: "button", onclick: entrarComGoogle },
        el("img", { src: "assets/google.svg", alt: "", width: "18", height: "18" }), "Entrar com Google"),
      conta.google && el("p", { class: "separador" }, cadastro ? "ou crie com e-mail e senha" : "ou entre com e-mail e senha"),
      el("form", { onsubmit: cadastro ? cadastrar : entrar },
        cadastro && el("label", {}, "Seu nome", el("input", { name: "nome", required: true, maxlength: "60", autocomplete: "given-name", value: conta.nome })),
        campoEmail(),
        campoSenha(cadastro ? "new-password" : "current-password"),
        erro,
        el("button", { class: "botao-primario", type: "submit" }, cadastro ? "Criar conta" : "Entrar"),
        el("div", { class: "links-conta" }, cadastro
          ? [linkEtapa("entrar", "Já tenho conta")]
          : [linkEtapa("cadastrar", "Criar conta"), linkEtapa("esqueci", "Esqueci minha senha")])),
      // (08/11/2026, pedido do Giovanni: saiu o aviso "Guardamos só o seu nome…" da tela de entrar; a Política de
      // Privacidade continua nos links da janela Conta)
    ];
  }
  // Links do rodapé (no celular o rodapé some desde 05/11/2026; a rolagem infinita não deixa chegar nele)
  const legais = el("p", { class: "links-legais" }, el("a", { href: "/como-funciona" }, "Como funciona"), " · ",
    el("a", { href: "/privacidade" }, "Política de Privacidade"));
  $("#conta-conteudo").replaceChildren(...conteudo.filter(Boolean), legais);
  $("#janela-conta").classList.toggle("janela-larga", Boolean(conta.usuario && conta.etapa === "personagem"));
}

async function comEspera(form, acao) {
  const botao = form && $("button[type=submit]", form);
  if (botao) { botao.disabled = true; botao.dataset.texto = botao.textContent; botao.textContent = "Aguarde…"; }
  try {
    conta.erro = "";
    await acao();
  } catch (e) {
    conta.erro = e.message;
  }
  desenharConta();
  $("#janela-conta input")?.focus();
}

function campoEmail() {
  return el("label", {}, "Seu e-mail",
    el("input", { name: "email", type: "email", required: true, maxlength: "254", autocomplete: "email", inputmode: "email", value: conta.email }));
}

function campoSenha(autocomplete) {
  const novaSenha = autocomplete === "new-password";
  const campo = el("input", { name: "senha", type: "password", required: true, minlength: novaSenha ? "8" : null, maxlength: "128", autocomplete });
  const mostrar = el("button", { class: "botao-link mostrar-senha", type: "button", onclick: () => {
    campo.type = campo.type === "password" ? "text" : "password";
    mostrar.textContent = campo.type === "password" ? "Mostrar" : "Esconder";
  } }, "Mostrar");
  return el("label", {}, novaSenha ? "Senha (mínimo 8 caracteres)" : "Senha", el("div", { class: "campo-senha" }, campo, mostrar));
}

function linkEtapa(etapa, texto) {
  return el("button", { class: "botao-link", type: "button", onclick: () => {
    const email = $("#janela-conta input[name=email]");
    if (email) conta.email = email.value.trim().toLowerCase();
    conta.etapa = etapa;
    conta.erro = "";
    desenharConta();
    $("#janela-conta input")?.focus();
  } }, texto);
}

function conectou(dados, mensagem) {
  conta.usuario = dados.usuario;
  juntarCarrinho(dados.carrinho);
  desenharContaTopo();
  toast(mensagem);
  // Entrou para guardar um produto: guarda agora
  if (conta.carrinhoOferta) {
    if (!ehFavorito(conta.carrinhoOferta.id)) guardarOuTirar(conta.carrinhoOferta);
    conta.carrinhoOferta = null;
  }
  // Entrou para criar um alerta: continua nele (e só depois de saber quais alertas a conta já tem)
  if (conta.alertaOferta) {
    conta.etapa = "alerta";
    return carregarAlertas().then(desenharConta);
  }
  carregarAlertas();
  // Depois de entrar, fecha a janela; os dados da conta (sair, excluir) ficam no ícone da conta
  $("#janela-conta").close();
}

function entrar(e) {
  e.preventDefault();
  const form = e.target;
  conta.email = form.email.value.trim().toLowerCase();
  return comEspera(form, async () => {
    const dados = await chamarConta("POST", "/entrar", { email: conta.email, senha: form.senha.value });
    conectou(dados, `🎉 Bem-vindo, ${dados.usuario.nome.split(" ")[0]}!`);
  });
}

function cadastrar(e) {
  e.preventDefault();
  const form = e.target;
  conta.nome = form.nome.value.trim();
  conta.email = form.email.value.trim().toLowerCase();
  return comEspera(form, async () => {
    const dados = await chamarConta("POST", "/cadastrar", { nome: conta.nome, email: conta.email, senha: form.senha.value });
    conectou(dados, `🎉 Conta criada! Bem-vindo, ${dados.usuario.nome.split(" ")[0]}!`);
  });
}

function pedirLink(e) {
  e.preventDefault();
  const form = e.target;
  conta.email = form.email.value.trim().toLowerCase();
  return comEspera(form, async () => {
    await chamarConta("POST", "/senha/esqueci", { email: conta.email, volta: location.pathname });
    conta.etapa = "enviado";
  });
}

function gravarNovaSenha(e) {
  e.preventDefault();
  const form = e.target;
  return comEspera(form, async () => {
    const dados = await chamarConta("POST", "/senha/redefinir", { token: conta.token, senha: form.senha.value });
    conta.token = "";
    conectou(dados, "🔑 Nova senha salva!");
  });
}

// Ao sair, o carrinho sai deste aparelho também (pode ser um aparelho compartilhado)
function esquecerAqui() {
  conta.usuario = null;
  conta.etapa = "entrar";
  favoritos = [];
  salvarFavoritos();
  atualizarFavoritos();
  guardarAlertas([]);
  desenharContaTopo();
  $("#janela-conta").close();
}

function sair() {
  return comEspera(null, async () => {
    await chamarConta("POST", "/sair", {});
    esquecerAqui();
    toast("Você saiu da sua conta");
  });
}

function excluirConta() {
  if (!confirm("Excluir a sua conta? O seu nome, e-mail e carrinho serão excluídos. Deseja continuar?")) return;
  return comEspera(null, async () => {
    await chamarConta("DELETE", "", {});
    esquecerAqui();
    toast("Sua conta foi excluída");
  });
}

// ---------------------------------------------------------------------
// Cartão de oferta
// ---------------------------------------------------------------------
function estrelas(nota) {
  const cheias = Math.round(nota);
  return "★".repeat(cheias) + "☆".repeat(5 - cheias);
}

// Texto com versão curta para o celular (cartões estreitos)
const longoCurto = (longo, curto) => [el("span", { class: "so-longo" }, longo), el("span", { class: "so-curto" }, curto)];

// Foto do cartão em tamanho de cartão (celular demorava: AliExpress e lojas VTEX mandam 800–1500 px, até 180 KB cada;
// 30/10/2026). A janela "Ver detalhes" continua com a original. AliExpress: sufixo _350x350; VTEX (Animale, Karsten,
// Monte Carlo, Rovitex…): /arquivos/ids/<id>-350-auto (mantém a proporção); gbmedia: w_400
const fotoPequena = (url) => {
  if (!url) return url;
  if (/aliexpress-media\.com|alicdn\.com/.test(url) && /\.(jpe?g|png|webp)$/i.test(url)) return `${url}_350x350${url.match(/\.\w+$/)[0]}`;
  if (/\.vteximg\.com\.br\/arquivos\/ids\/\d+/.test(url)) return url.replace(/(\/arquivos\/ids\/\d+)(?:_\d+)?(?:-\d+-(?:\d+|auto))?(?=\/|\?|$)/, "$1-350-auto");
  if (/gbmedia\.com\.br\/images\/w_\d+\//.test(url)) return url.replace(/\/w_\d+\//, "/w_400/");
  return url;
};

// Foto que não carregou: se era a versão pequena (ou a miniatura da Shopee), tenta a original; depois as outras fotos do
// produto; nos produtos da Awin, pergunta ao banco a foto de hoje (a lista pode ser uma cópia guardada antes de a loja
// trocar as fotos: print do Giovanni, 04/11/2026, tênis da Lauri Esporte); sem nenhuma, mostra o emoji
const fotosAtuais = new Map(); // id -> promessa da foto atual (uma consulta por produto)
const fotoAtual = (id) => {
  if (!fotosAtuais.has(id)) {
    fotosAtuais.set(id, fetch(`/api/produto?id=${encodeURIComponent(id)}`).then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.oferta?.imagem || d?.imagem || null).catch(() => null));
  }
  return fotosAtuais.get(id);
};
const fotoQuebrada = (o) => (e) => {
  const img = e.target;
  const emoji = () => img.isConnected && img.replaceWith(el("span", { class: "foto-emoji" }, o.emoji || "🛍️"));
  if (/_tn$/.test(img.src)) { img.src = img.src.replace(/_tn$/, ""); return; }
  if (o.imagem && img.src !== o.imagem && !img.dataset.original) { img.dataset.original = "1"; img.src = o.imagem; return; }
  const tentadas = new Set([o.imagem, ...(img.dataset.tentadas || "").split("|")]);
  const outra = (o.imagens || []).find((u) => u && !tentadas.has(u));
  if (outra) { img.dataset.tentadas = [...tentadas, outra].filter(Boolean).join("|"); img.src = outra; return; }
  if (/^awin-/.test(o.id || "") && !img.dataset.atual) {
    img.dataset.atual = "1";
    fotoAtual(o.id).then((u) => { if (u && !tentadas.has(u) && img.isConnected) img.src = u; else emoji(); });
    return;
  }
  emoji();
};

// Texto do botão: verbo + loja ("Comprar na Shopee"). No celular (cartão estreito), em 2 linhas: "Comprar" e,
// menor embaixo, "na Shopee" (pedido do Giovanni: a loja tem que aparecer no botão também no celular)
const textoComprar = (loja) => [
  el("span", { class: "so-longo" }, loja.nome.length <= 16 ? `Comprar ${loja.em} ${loja.nome}` : "Comprar na loja"),
  el("span", { class: "so-curto comprar-curto" }, "Comprar", el("small", {}, `${loja.em} ${loja.nome}`)),
];
// Nome de loja comprido ("Comprar no AliExpress"): letra menor, para o botão ficar numa linha como os outros
const classeBotao = (loja) => (`Comprar ${loja.em} ${loja.nome}`.length > 18 ? "botao-oferta texto-longo" : "botao-oferta");

// Mais vendido da lista (só quando a venda é expressiva, para o selo não perder valor)
function idMaisVendido(lista) {
  const campeao = lista.reduce((a, b) => ((b.vendidos || 0) > (a?.vendidos || 0) ? b : a), null);
  return campeao && campeao.vendidos >= 100 ? campeao.id : null;
}

// Mercado Livre (05/11/2026): não manda vendas nem nota; manda a posição no ranking de mais vendidos da categoria (rankML)
const RANK_COM_SELO = 10;
const rankTexto = (o) => (o.rankML > 0 && o.rankML <= RANK_COM_SELO ? `🔥 ${o.rankML}º mais vendido da categoria` : null);
// Peso de "vende muito" para comparar lojas: vendas da Shopee/AliExpress; no ML, o 1º do ranking vale 3.000 vendas, o 2º
// 1.500, o 3º 1.000, o 5º 600 (ser dos primeiros do ML numa categoria é muita venda; a Shopee com "4 mil vendidos" passa)
const pesoVendas = (o) => o.vendidos || (o.rankML > 0 ? Math.round(3000 / o.rankML) : 0);
function vendidosTexto(n) {
  if (!n) return null;
  return n >= 1000 ? `${(n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil vendidos` : `${n} vendidos`;
}

// Selos que vêm do histórico de preço (só ofertas do robô têm histórico)
function selosHistorico(o) {
  const h = o.historico;
  if (!h) return [];
  return [
    h.menorEm30Dias && el("span", { class: "selo selo-historico" }, "📉 Menor em 30 dias"),
    h.descontoReal && el("span", { class: "selo selo-real", title: "Preço abaixo do que a loja cobrou na maior parte dos últimos 30 dias (acompanhado pelo Vai pro Carrinho)" },
      `✅ Desconto real -${h.descontoReal}%`),
    !h.menorEm30Dias && !h.descontoReal && h.caiu >= 3 && el("span", { class: "selo selo-historico" }, `📉 Baixou ${h.caiu}%`),
  ];
}

const CELULAR = matchMedia("(max-width: 640px)");
function cartaoOferta(o, { melhor = false, maisVendido = false } = {}) {
  const loja = infoLoja(o);
  const [inteiro, decimal] = brl(o.preco).split(",");

  const abrir = () => toast(`Abrindo a oferta ${loja.em} ${loja.nome}… 🛒`);

  return el("article", {
    class: `oferta${melhor ? " melhor" : ""}`,
    style: `--cor-loja:${loja.cor};--texto-loja:${loja.texto};--fundo-cat:${FUNDO_CATEGORIA[o.categoria] || "linear-gradient(135deg,#ede9fe,#fce7f3)"}`,
  },
    // "Comparar" fica fora do link da foto (botão dentro de link não vale), desenhado no canto de baixo da foto
    el("div", { class: "oferta-topo" },
    el("button", { class: "comparar", type: "button", "data-id": o.id, "aria-pressed": comparando.has(o.id), title: "Comparar com outros produtos",
      onclick: () => alternarComparar(o) }, ...longoCurto("⚖️ Comparar", "⚖️")),
    // Celular (molde do app do Mercado Livre): carrinho redondo em cima da foto, e tocar na foto abre os detalhes
    el("button", {
      class: "favoritar favoritar-foto", type: "button", "data-id": o.id, "aria-pressed": ehFavorito(o.id),
      "aria-label": "Guardar no carrinho", title: "Guardar no Meu carrinho", onclick: (e) => alternarFavorito(o, e.currentTarget),
    }, ICONE_CARRINHO()),
    el("a", { class: "oferta-foto", href: o.link, target: "_blank", rel: "sponsored noopener", tabindex: "-1", "aria-hidden": "true", ...marcaClique("foto", o),
      onclick: (e) => { if (CELULAR.matches && temDetalhes(o)) { e.preventDefault(); abrirDetalhes(o); } else abrir(); } },
      o.imagem
        // Foto que não carrega (link quebrado da loja) vira o desenho padrão
        ? el("img", { src: fotoPequena(o.imagem), alt: "", loading: "lazy", decoding: "async", onerror: fotoQuebrada(o) })
        : el("span", { class: "foto-emoji" }, o.emoji || "🛍️"),
      el("div", { class: "selos" },
        melhor && el("span", { class: "selo selo-melhor" }, ...longoCurto("🏆 Menor preço da busca", "🏆 Menor preço")),
        maisVendido && el("span", { class: "selo selo-vendido" }, ...longoCurto("⭐ Mais vendido", "⭐ Top")),
        o.desconto && el("span", { class: "selo selo-desconto" }, `-${o.desconto}%`),
        ...selosHistorico(o)))),
    el("div", { class: "oferta-corpo" },
      el("div", { class: "loja-linha" },
        el("span", { class: `loja-tag ${loja.tag || ""}` }, el("span", { class: "loja-ponto" }), loja.nome),
        o.lojaOficial && el("span", { class: "selo-oficial", title: o.vendedor ? `Vendido por ${o.vendedor}` : null }, "✔ Oficial"),
        botaoCupom(o.loja)),
      el("h3", { class: "oferta-titulo", title: o.titulo }, temDetalhes(o)
        ? el("button", { class: "titulo-botao", type: "button", onclick: () => abrirDetalhes(o) }, o.titulo)
        : o.titulo),
      (o.avaliacao || o.vendidos || rankTexto(o)) && el("div", { class: "nota" },
        o.avaliacao && el("span", { class: "estrelas", "aria-label": `Nota ${o.avaliacao}` }, estrelas(o.avaliacao)),
        o.avaliacao && el("span", {}, String(o.avaliacao).replace(".", ",")),
        o.vendidos && el("span", { class: o.vendidos >= 1000 ? "vendidos-muitos" : null },
          `${o.vendidos >= 1000 ? "🔥 " : ""}${vendidosTexto(o.vendidos)}`),
        !o.vendidos && rankTexto(o) && el("span", { class: "vendidos-muitos" }, rankTexto(o))),
      el("div", { class: "precos" },
        // No celular o desconto sai de cima da foto e vem em verde ao lado do preço antigo ("60% OFF")
        o.precoAntigo && el("span", { class: "linha-de" },
          o.desconto && el("span", { class: "desconto-pill" }, `${o.desconto}% OFF`),
          el("span", { class: "preco-antigo" }, `R$ ${brl(o.precoAntigo)}`)),
        el("span", { class: "preco" }, el("small", {}, "R$"), inteiro, el("small", { class: "centavos" }, `,${decimal}`)),
        o.precoAntigo > o.preco + 1 && el("span", { class: "economia-tag" }, ...longoCurto(`Você economiza R$ ${brl(o.precoAntigo - o.preco)}`, `Economize R$ ${brl(o.precoAntigo - o.preco)}`))),
      (o.freteGratis || o.full) && el("div", { class: "selos-entrega" },
        o.freteGratis && el("span", { class: "frete" }, "🚚 Frete grátis"),
        o.full && el("span", { class: "full", title: "Entrega Full: o produto sai do depósito do Mercado Livre e costuma chegar mais rápido" }, "⚡ Full")),
      o.internacional && el("span", {
        class: "internacional",
        title: `Loja de fora do Brasil.${o.moeda ? ` Preço convertido de ${o.moeda} pela cotação do dia;` : ""} pode haver impostos de importação.`,
      }, o.moeda ? `🌎 Internacional · valor aproximado` : "🌎 Internacional"),
      o.envioNacional && el("span", { class: "internacional nacional", title: "Sai de um armazém no Brasil: chega mais rápido e sem impostos de importação." },
        el("span", { class: "bandeira-br", "aria-hidden": "true" }), " Envio do Brasil"),
      // Botão do carrinho logo acima do "Comprar" (pedido do Giovanni, 22/10/2026: em cima da foto ficava escondido)
      el("div", { class: "acoes-oferta" },
        el("div", { class: "links-oferta" },
          temDetalhes(o) && el("button", { class: "ver-historico", type: "button", onclick: () => abrirDetalhes(o) }, "🔍 Ver detalhes"),
          o.historico && el("button", { class: "ver-historico", type: "button", onclick: () => abrirHistorico(o) }, "📈 Histórico")),
        el("div", { class: "botoes-oferta" },
        el("button", { class: "whatsapp", type: "button", "aria-label": "Enviar no WhatsApp", title: "Enviar no WhatsApp",
          onclick: () => compartilharWhatsApp(o) }, ICONE_WHATSAPP()),
        el("button", {
          class: "alertar", type: "button", "data-id": o.id, "aria-pressed": temAlerta(o.id),
          "aria-label": "Me avise quando baixar", title: "Me avise quando o preço baixar", onclick: () => abrirAlerta(o),
        }, "🔔"),
        el("button", {
          class: "favoritar", type: "button", "data-id": o.id, "aria-pressed": ehFavorito(o.id),
          "aria-label": "Guardar no carrinho", title: "Guardar no Meu carrinho", onclick: (e) => alternarFavorito(o, e.currentTarget),
        }, ICONE_CARRINHO()))),
      el("a", { class: classeBotao(loja), href: o.link, target: "_blank", rel: "sponsored noopener", onclick: abrir, ...marcaClique("oferta", o) },
        ...textoComprar(loja), el("span", { class: "flecha", "aria-hidden": "true" }, "→"))));
}

// ---------------------------------------------------------------------
// Histórico de preço: janela com gráfico em degraus (o preço só muda nos
// dias registrados) e passe o dedo/mouse para ver o preço de cada dia.
// ---------------------------------------------------------------------
const dataCurta = (dia) => new Date(`${dia}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });

// Visual de 31/10/2026 (print do Giovanni: "deixe este gráfico mais bonito"): escala de preços à direita com linhas
// claras, faixa roxa que some para baixo, linha tracejada do preço de costume, menor preço em verde, preço de hoje em
// destaque e data no meio do eixo. Pontos só onde o preço mudou.
let contadorGraficos = 0;
function passoBonito(bruto) {
  const pot = 10 ** Math.floor(Math.log10(bruto));
  return [1, 2, 2.5, 5, 10].map((f) => f * pot).find((v) => v >= bruto);
}
function graficoHistorico(pontos, precoAtual, habitual = null) {
  const hoje = new Date().toLocaleDateString("sv-SE");
  const serie = [...pontos];
  if (!serie.length || serie.at(-1).dia !== hoje) serie.push({ dia: hoje, preco: precoAtual ?? serie.at(-1)?.preco });
  // Espaço à direita do tamanho da etiqueta do preço de hoje (R$ 45,60 ou R$ 1.234,56)
  const etiqueta = `R$ ${brl(serie.at(-1).preco)}`;
  const largura = etiqueta.length * 6 + 14;
  const L = 340, A = 190, m = { esq: 6, dir: largura + 12, topo: 16, base: 26 };
  // Meio dia depois de hoje, para o preço atual aparecer como um trecho e não só um ponto
  const t0 = Date.parse(serie[0].dia), t1 = Math.max(Date.parse(serie.at(-1).dia), t0 + 864e5) + 432e5;
  const precos = serie.map((p) => p.preco);
  const menor = Math.min(...precos), maior = Math.max(...precos);
  let min = Math.min(menor, habitual || menor), max = Math.max(maior, habitual || maior);
  if (max - min < 1) { min -= 5; max += 5; }
  const folga = (max - min) * 0.18;
  const lo = Math.max(0, min - folga), hi = max + folga;
  const x = (dia) => m.esq + ((Date.parse(dia) - t0) / (t1 - t0)) * (L - m.esq - m.dir);
  const y = (v) => m.topo + (1 - (v - lo) / (hi - lo)) * (A - m.topo - m.base);
  const fimX = L - m.dir, baseY = A - m.base;
  // Linha em degraus: o preço segue igual até o próximo registro
  let d = `M${x(serie[0].dia)},${y(serie[0].preco)}`;
  for (let i = 1; i < serie.length; i++) d += ` H${x(serie[i].dia)} V${y(serie[i].preco)}`;
  d += ` H${fimX}`;
  const area = `${d} V${baseY} H${x(serie[0].dia)} Z`;
  const ns = "http://www.w3.org/2000/svg";
  const svg = (tag, attrs, texto) => {
    const n = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (texto !== undefined) n.textContent = texto;
    return n;
  };

  const raiz = svg("svg", { viewBox: `0 0 ${L} ${A}`, class: "grafico", role: "img",
    "aria-label": `Preço de ${dataCurta(serie[0].dia)} até hoje: entre R$ ${brl(menor)} e R$ ${brl(maior)}; hoje R$ ${brl(serie.at(-1).preco)}` });
  const idFaixa = `grafico-faixa-${++contadorGraficos}`;
  const faixa = svg("linearGradient", { id: idFaixa, x1: 0, y1: 0, x2: 0, y2: 1 });
  faixa.append(svg("stop", { offset: "0%", "stop-color": "#7c3aed", "stop-opacity": ".26" }),
    svg("stop", { offset: "100%", "stop-color": "#7c3aed", "stop-opacity": "0" }));
  const defs = svg("defs", {});
  defs.append(faixa);
  raiz.append(defs);

  // Escala de preços à direita (3 ou 4 valores redondos); some o que encostar no preço de hoje
  const atualY = y(serie.at(-1).preco);
  const costumeY = habitual ? y(habitual) : null;
  const ocupado = (yy) => Math.abs(yy - atualY) < 14 || (costumeY !== null && Math.abs(yy - costumeY) < 15);
  const passo = passoBonito((hi - lo) / 4);
  for (let v = Math.ceil(lo / passo) * passo; v <= hi; v += passo) {
    const yy = y(v);
    if (yy < m.topo - 2 || yy > baseY - 4) continue;
    raiz.append(svg("line", { x1: m.esq, x2: fimX, y1: yy, y2: yy, class: "grafico-grade" }));
    if (!ocupado(yy)) {
      raiz.append(svg("text", { x: L - 4, y: yy + 3.5, "text-anchor": "end", class: "grafico-eixo" },
        `R$ ${brl(v).replace(/,00$/, "")}`));
    }
  }
  raiz.append(svg("line", { x1: m.esq, x2: fimX, y1: baseY, y2: baseY, class: "grafico-base" }));

  // Preço de costume: linha tracejada e o nome na coluna da escala (o valor está na caixa colorida acima)
  if (habitual) {
    raiz.append(svg("line", { x1: m.esq, x2: fimX, y1: costumeY, y2: costumeY, class: "grafico-costume" }));
    if (Math.abs(costumeY - atualY) >= 14) {
      raiz.append(svg("text", { x: L - 4, y: costumeY + 3.5, "text-anchor": "end", class: "grafico-costume-texto" }, "de costume"));
    }
  }

  raiz.append(svg("path", { d: area, fill: `url(#${idFaixa})` }), svg("path", { d, class: "grafico-linha" }));

  // Pontos só onde o preço mudou; o menor preço em verde (a última vez que chegou nele)
  const mudancas = serie.slice(0, -1).filter((p, i, a) => i === 0 || p.preco !== a[i - 1].preco);
  const menorPonto = [...serie].reverse().find((p) => p.preco === menor);
  for (const p of mudancas) {
    if (p === menorPonto) continue;
    raiz.append(svg("circle", { cx: x(p.dia), cy: y(p.preco), r: 3.5, class: "grafico-ponto" }));
  }
  if (menor < maior && menorPonto !== serie.at(-1)) {
    const mx = x(menorPonto.dia), my = y(menor);
    raiz.append(svg("circle", { cx: mx, cy: my, r: 5, class: "grafico-menor" }),
      svg("text", { x: Math.min(Math.max(mx, m.esq + 46), fimX - 46), y: Math.min(my + 17, baseY - 4),
        "text-anchor": "middle", class: "grafico-menor-texto" }, `menor R$ ${brl(menor)}`));
  }
  // Preço de hoje: bolinha com halo no fim da linha e etiqueta roxa na escala
  const ex = fimX;
  raiz.append(svg("circle", { cx: ex, cy: atualY, r: 9, class: "grafico-halo" }),
    svg("circle", { cx: ex, cy: atualY, r: 5, class: "grafico-atual" }));
  raiz.append(svg("rect", { x: L - largura - 1, y: atualY - 10, width: largura, height: 20, rx: 10, class: "grafico-etiqueta" }),
    svg("text", { x: L - 1 - largura / 2, y: atualY + 3.5, "text-anchor": "middle", class: "grafico-etiqueta-texto" }, etiqueta));

  // Datas: começo, meio (se tiver uns dias) e hoje
  const legenda = (texto, ancora, xx) => svg("text", { x: xx, y: A - 8, "text-anchor": ancora, class: "grafico-eixo" }, texto);
  raiz.append(legenda(dataCurta(serie[0].dia), "start", m.esq), legenda("hoje", "end", fimX));
  if (t1 - t0 > 6 * 864e5) {
    const meio = new Date((t0 + t1) / 2).toLocaleDateString("sv-SE");
    raiz.append(legenda(dataCurta(meio), "middle", (m.esq + fimX) / 2));
  }

  // Dica ao passar o mouse/dedo: preço em vigor naquele dia
  const guia = svg("line", { y1: m.topo - 6, y2: baseY, class: "grafico-guia", visibility: "hidden" });
  const marca = svg("circle", { r: 5, class: "grafico-marca", visibility: "hidden" });
  raiz.append(guia, marca);
  const dica = el("div", { class: "grafico-dica", hidden: true });
  const caixa = el("div", { class: "grafico-caixa" }, raiz, dica);
  const mover = (e) => {
    const r = raiz.getBoundingClientRect();
    const t = t0 + ((e.clientX - r.left) / r.width * L - m.esq) / (L - m.esq - m.dir) * (t1 - t0);
    const vigente = [...serie].reverse().find((p) => Date.parse(p.dia) <= t) || serie[0];
    const xx = Math.min(Math.max((e.clientX - r.left) / r.width * L, m.esq), fimX);
    for (const n of [guia, marca]) n.setAttribute("visibility", "visible");
    guia.setAttribute("x1", xx); guia.setAttribute("x2", xx);
    marca.setAttribute("cx", xx); marca.setAttribute("cy", y(vigente.preco));
    const diaVisto = new Date(Math.min(Math.max(t, t0), t1)).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
    dica.hidden = false;
    dica.replaceChildren(el("strong", {}, `R$ ${brl(vigente.preco)}`), el("span", {}, diaVisto));
    dica.style.left = `${(xx / L) * 100}%`;
  };
  raiz.addEventListener("pointermove", mover);
  raiz.addEventListener("pointerdown", mover);
  raiz.addEventListener("pointerleave", () => { for (const n of [guia, marca]) n.setAttribute("visibility", "hidden"); dica.hidden = true; });
  return caixa;
}

// ---------------------------------------------------------------------
// Janela "Ver detalhes": tudo o que a loja informa oficialmente sobre o
// produto (sem ler a página da loja, o que as regras de afiliado proíbem)
// ---------------------------------------------------------------------
// Em todos os produtos (pedido do Giovanni, 21/10/2026: "ajuda muito"). A API de afiliados da Shopee manda
// 1 foto e nenhuma descrição; a janela mostra a foto grande, o nome inteiro, nota, vendidos, loja e histórico.
const temDetalhes = (o) => Boolean(o.titulo);

// doLink = aberto por um link compartilhado no WhatsApp: sem o botão de enviar de novo (pedido do Giovanni, 24/10/2026)
function abrirDetalhes(o, { doLink = false } = {}) {
  const loja = infoLoja(o);
  // Shopee: o cartão usa a miniatura ("_tn"); aqui vale a foto original, maior
  const fotos = o.imagens?.length ? o.imagens : [o.imagem?.replace(/_tn$/, "")].filter(Boolean);
  const fotoGrande = fotos.length
    ? el("img", { src: fotos[0], alt: o.titulo, onload: (e) => { e.target.style.visibility = ""; },
      onerror: (e) => { e.target.style.visibility = "hidden"; } }) // foto quebrada: some, sem travar a galeria
    : el("span", { class: "foto-emoji" }, o.emoji || "🛍️");
  const galeria = el("div", { class: "detalhes-galeria", style: `--fundo-cat:${FUNDO_CATEGORIA[o.categoria] || "linear-gradient(135deg,#ede9fe,#fce7f3)"}` },
    el("div", { class: "detalhes-foto" }, fotoGrande),
    fotos.length > 1 && el("div", { class: "detalhes-miniaturas" }, ...fotos.map((f, i) =>
      el("button", { type: "button", class: i === 0 ? "ativa" : null, "aria-label": `Foto ${i + 1}`, onclick: (e) => {
        fotoGrande.src = f;
        e.currentTarget.parentElement.querySelectorAll("button").forEach((b) => b.classList.toggle("ativa", b === e.currentTarget));
      } }, el("img", { src: f, alt: "", loading: "lazy", onerror: (e) => e.target.parentElement.remove() })))));

  const [inteiro, decimal] = brl(o.preco).split(",");
  const info = el("div", { class: "detalhes-info" },
    el("div", { class: "detalhes-loja" },
      el("span", { class: `loja-tag ${loja.tag || ""}`, style: `--cor-loja:${loja.cor}` }, el("span", { class: "loja-ponto" }), loja.nome),
      o.lojaOficial && el("span", { class: "selo-oficial" }, "✔ Loja oficial"),
      botaoCupom(o.loja),
      o.vendedor && el("span", { class: "detalhes-vendedor" }, `Vendido por ${o.vendedor}`)),
    el("h2", { id: "detalhes-titulo" }, o.titulo),
    (o.avaliacao || o.vendidos || rankTexto(o)) && el("div", { class: "nota" },
      o.avaliacao && el("span", { class: "estrelas", "aria-label": `Nota ${o.avaliacao}` }, estrelas(o.avaliacao)),
      o.avaliacao && el("span", {}, String(o.avaliacao).replace(".", ",")),
      o.vendidos && el("span", { class: o.vendidos >= 1000 ? "vendidos-muitos" : null },
        `${o.vendidos >= 1000 ? "🔥 " : ""}${vendidosTexto(o.vendidos)}`),
      !o.vendidos && rankTexto(o) && el("span", { class: "vendidos-muitos" }, rankTexto(o))),
    el("div", { class: "precos" },
      o.precoAntigo && el("span", { class: "preco-antigo" }, `R$ ${brl(o.precoAntigo)}`, o.desconto && ` (-${o.desconto}%)`),
      el("span", { class: "preco" }, el("small", {}, "R$"), inteiro, el("small", { class: "centavos" }, `,${decimal}`)),
      o.precoAntigo > o.preco + 1 && el("span", { class: "economia-tag" }, `Você economiza R$ ${brl(o.precoAntigo - o.preco)}`)),
    el("div", { class: "detalhes-selos" },
      o.freteGratis && el("span", { class: "frete" }, "🚚 Frete grátis"),
      o.full && el("span", { class: "full" }, "⚡ Full · sai do depósito do Mercado Livre"),
      o.internacional && el("span", { class: "internacional" },
        o.moeda ? `🌎 Internacional · valor convertido de ${o.moeda}` : "🌎 Internacional"),
      o.envioNacional && el("span", { class: "internacional nacional" }, el("span", { class: "bandeira-br", "aria-hidden": "true" }), " Envio do Brasil")),
    o.descricao && el("div", { class: "detalhes-descricao" }, el("h3", {}, "Descrição"), el("p", {}, o.descricao)),
    caixaMomento(o),
    el("div", { class: "links-oferta" },
      o.historico && el("button", { class: "ver-historico", type: "button", onclick: () => { $("#janela-detalhes").close(); abrirHistorico(o); } },
        "📈 Ver histórico de preço"),
      el("button", { class: "ver-historico", type: "button", onclick: () => { $("#janela-detalhes").close(); abrirAlerta(o); } },
        temAlerta(o.id) ? "🔔 Ver meu alerta" : "🔔 Me avise quando baixar"),
      el("button", { class: "ver-historico", type: "button", onclick: () => { alternarComparar(o); $("#janela-detalhes").close(); } },
        comparando.has(o.id) ? "⚖️ Tirar da comparação" : "⚖️ Comparar")),
    !doLink && el("button", { class: "botao-whatsapp", type: "button", onclick: () => compartilharWhatsApp(o) }, ICONE_WHATSAPP(), "Enviar no WhatsApp"),
    el("a", { class: classeBotao(loja), href: o.link, target: "_blank", rel: "sponsored noopener", ...marcaClique("detalhes", o),
      style: `--cor-loja:${loja.cor};--texto-loja:${loja.texto}`, onclick: () => toast(`Abrindo a oferta ${loja.em} ${loja.nome}… 🛒`) },
      `Comprar ${loja.em} ${loja.nome.length <= 16 ? loja.nome : "loja"}`, el("span", { class: "flecha", "aria-hidden": "true" }, "→")),
    el("p", { class: "detalhes-nota" }, o.descricao
      ? "Preço e estoque podem mudar. No Pix ou com cupom pode sair mais barato: confira na loja antes de finalizar."
      : "Cores, tamanhos e a descrição completa aparecem na página da loja."));

  $("#detalhes-conteudo").replaceChildren(el("div", { class: "detalhes" }, galeria, info));
  if (!$("#janela-detalhes").open) $("#janela-detalhes").showModal();
}

let pedidoHistorico = 0;
async function abrirHistorico(o) {
  const janela = $("#janela-historico");
  const conteudo = $("#historico-conteudo");
  const loja = infoLoja(o);
  const pedido = ++pedidoHistorico;
  conteudo.replaceChildren(el("h2", { id: "historico-titulo" }, "Histórico de preço"), el("p", {}, o.titulo), el("p", {}, "Carregando…"));
  if (!janela.open) janela.showModal();
  let dados;
  try {
    const resp = await fetch(`/api/historico?id=${encodeURIComponent(o.id)}`);
    dados = await resp.json();
  } catch {
    dados = { pontos: [] };
  }
  // Resposta atrasada: a janela foi fechada ou já mostra outro produto
  if (pedido !== pedidoHistorico || !janela.open) return;
  const pontos = dados.pontos || [];
  const precos = [...pontos.map((p) => p.preco), o.preco];
  const diasAcompanhando = pontos.length ? Math.round((Date.now() - Date.parse(`${pontos[0].dia}T00:00:00`)) / 864e5) : 0;
  conteudo.replaceChildren(
    el("h2", { id: "historico-titulo" }, "Histórico de preço"),
    el("p", {}, `${o.titulo} · ${loja.nome}`),
    caixaMomento(o),
    el("div", { class: "historico-numeros" },
      el("div", {}, el("small", {}, "Hoje"), el("strong", {}, `R$ ${brl(o.preco)}`)),
      el("div", {}, el("small", {}, "Menor"), el("strong", {}, `R$ ${brl(Math.min(...precos))}`)),
      el("div", {}, el("small", {}, "Maior"), el("strong", {}, `R$ ${brl(Math.max(...precos))}`))),
    graficoHistorico(pontos, o.preco, o.historico?.dias >= DIAS_PARA_OPINAR ? o.historico.habitual : null),
    el("p", { class: "historico-nota" }, diasAcompanhando < 7
      ? "Começamos a acompanhar este preço há pouco tempo. O gráfico fica mais completo a cada dia."
      : `Preço acompanhado há ${diasAcompanhando} dias.${o.moeda ? ` Valores convertidos de ${o.moeda} para reais.` : ""}`),
    el("button", { class: "botao-secundario botao-alerta", type: "button", onclick: () => { janela.close(); abrirAlerta(o); } },
      temAlerta(o.id) ? "🔔 Ver meu alerta" : "🔔 Me avise quando baixar"),
    el("a", { class: classeBotao(loja), href: o.link, target: "_blank", rel: "sponsored noopener", ...marcaClique("historico", o),
      style: `--cor-loja:${loja.cor};--texto-loja:${loja.texto}` },
      ...textoComprar(loja), el("span", { class: "flecha", "aria-hidden": "true" }, "→")));
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
// A mesma lista de filtros serve para as "Ofertas do dia" (q vazio) e para a busca
const estado = { q: "", ofertas: [], inicio: null, paginaInicio: 1, temMaisInicio: false, vistosInicio: new Set(), lojasDesmarcadas: new Set(), secoesSo: null, secoesFora: new Set(), marcasSo: new Set(), todasMarcas: false, cupons: [], pedido: 0, loja: null, paginaLoja: 1 };

// Anúncios repetidos: na Shopee vários vendedores publicam o mesmo produto (mesmo título, foto e preço)
// com códigos diferentes. Fica um só, o que vendeu mais, na posição em que apareceu primeiro.
// Mesmo título com preço até 15% diferente também conta ("Celular Nokia 150 …" por R$ 155, 156, 165, 169 e 175)
const DIFERENCA_REPETIDO = 1.15;
// Numeração/tamanho no fim do título de calçado e roupa (04/11/2026: a Lauri Esporte manda cada numeração como um
// anúncio, com foto própria: "… Azul 40", "… Azul 41"). Mesma regra de lib/variacoes.js (semTamanho)
const CALCADO_ROUPA = /^(tenis|chuteiras?|sapatos?|sapatilhas?|sapatenis|botas?|botinas?|coturnos?|sandalias?|chinelos?|tamancos?|mocassins?|scarpins?|rasteiras?|papetes?|crocs|babuchas?|camisas?|camisetas?|camisolas?|regatas?|blusas?|blusoes?|blusao|jaquetas?|casacos?|moletons?|moletom|calcas?|bermudas?|shorts?|saias?|vestidos?|leggings?|tops?|meias?|cuecas?|calcinhas?|sutias?|maios?|biquinis?|body|bodies|macacoes?|macacao|agasalhos?|corta vento|coletes?|polos?|pijamas?)( |$)/;
function semTamanho(titulo) {
  const t = String(titulo || "").trim();
  if (!CALCADO_ROUPA.test(normalizar(t))) return t;
  const roupa = /\s+(\d?(PP|P|M|G|GG|XG|XGG|EG|EGG|EXG)|XXS|XS|S|L|XL|XXL|XXXL|2XL|3XL|G[1-4]|U|UN|[ÚU]NICO|Tam(anho)?\.? \w+)$/i;
  const numero = /\s+(N(º|o|um)?\.?\s*)?\d{1,2}(\s*[\/-]\s*\d{1,2})?( BR)?$/i;
  return (roupa.test(t) ? t.replace(roupa, "") : t.replace(numero, "")).trim() || t;
}
function semRepetidos(lista) {
  const posicao = new Map();
  const porTitulo = new Map(); // loja + título -> posições na saída
  const saida = [];
  for (const o of lista) {
    const chaves = [
      `id|${o.id}`,
      o.imagem && `f|${o.loja}|${o.imagem.replace(/_tn$/, "")}`,
    ].filter(Boolean);
    const titulo = `${o.loja}|${normalizar(semTamanho(o.titulo)).slice(0, 60)}`;
    let i = chaves.map((c) => posicao.get(c)).find((x) => x !== undefined);
    i ??= (porTitulo.get(titulo) || []).find((j) => o.preco > 0 && saida[j].preco > 0
      && Math.max(o.preco, saida[j].preco) <= Math.min(o.preco, saida[j].preco) * DIFERENCA_REPETIDO);
    const anterior = i === undefined ? null : saida[i];
    if (i === undefined) {
      i = saida.length;
      porTitulo.set(titulo, [...(porTitulo.get(titulo) || []), i]);
      saida.push(o);
    } else if ((o.vendidos || 0) > (saida[i].vendidos || 0)) {
      saida[i] = o;
    }
    // Juntou numerações diferentes: o cartão fica sem o número (o tamanho se escolhe na loja)
    if (anterior && anterior.titulo !== o.titulo && semTamanho(anterior.titulo) === semTamanho(o.titulo)) {
      saida[i] = { ...saida[i], titulo: semTamanho(saida[i].titulo) };
    }
    chaves.forEach((c) => posicao.set(c, i));
  }
  return saida;
}

// Busca adiantada enquanto a pessoa digita (pedido do Giovanni, 21/10/2026): quando ela para de digitar ou passa
// pela sugestão, o site já pede os resultados; ao apertar Enter eles estão prontos (ou quase).
// Pede com atalho=1 (não conta nos "em alta": pode ser só uma sugestão que ela nem escolheu). Se ela buscar isso
// mesmo, o site usa a resposta adiantada e só avisa o servidor para contar (contar=1).
// (VERSAO_BUSCA fica no começo do arquivo: as "Ofertas do dia" são pedidas logo que o arquivo começa a rodar)
const MAX_ADIANTADAS = 8; // por visita, para não gastar as consultas às lojas à toa
const adiantadas = new Map();
let totalAdiantadas = 0;
const chaveAdiantada = (q, cat) => `${q.trim().toLowerCase()}|${cat || ""}|${lojaAtual() || ""}`;
const enderecoBusca = (q, cat, extra = "") => {
  const loja = q && lojaAtual();
  return `/api/buscar?v=${VERSAO_BUSCA}&q=${encodeURIComponent(q)}${loja ? `&loja=${encodeURIComponent(loja)}`
    : q && cat ? `&cat=${encodeURIComponent(cat)}` : ""}${extra}`;
};
function adiantarBusca(q, cat) {
  q = (q || "").trim();
  const chave = chaveAdiantada(q, cat);
  if (q.length < 3 || adiantadas.has(chave) || totalAdiantadas >= MAX_ADIANTADAS) return;
  totalAdiantadas++;
  const pedido = fetch(enderecoBusca(q, cat, "&atalho=1"), { priority: "low" })
    .then((r) => (r.ok ? r.json() : null)).catch(() => null);
  adiantadas.set(chave, pedido);
  pedido.then((dados) => { if (!dados) adiantadas.delete(chave); });
}

// mais = pedaço de endereço que a resposta anterior mandou para buscar a continuação ("desde=10", "pagina=2")
async function consultarApi(q, mais = "") {
  const atalho = estado.atalho ? "&atalho=1" : "";
  estado.atalho = false;
  const exato = q && estado.exato ? "&exato=1" : "";
  if (q && !mais && !exato) {
    const chave = chaveAdiantada(q, estado.cat);
    const adiantada = adiantadas.get(chave);
    adiantadas.delete(chave);
    const dados = adiantada && (await adiantada);
    if (dados) {
      if (!atalho) fetch(enderecoBusca(q, estado.cat, "&contar=1")).catch(() => {});
      return dados;
    }
  }
  const resp = await fetch(enderecoBusca(q, estado.cat, `${mais ? `&${mais}` : ""}${atalho}${exato}`));
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

// Preço digitado do jeito brasileiro: "1.000" é mil e "99,90" tem centavos
function lerPreco(texto) {
  const limpo = String(texto || "").replace(/[^\d.,]/g, "");
  if (!limpo) return NaN;
  // Com vírgula, os pontos são de milhar. Sem vírgula, ponto seguido de 3 números também ("1.000")
  const numero = limpo.includes(",")
    ? limpo.replace(/\./g, "").replace(",", ".")
    : /\.\d{3}(\.|$)/.test(limpo) ? limpo.replace(/\./g, "") : limpo;
  return parseFloat(numero);
}

// Acessórios só aparecem se pedidos (ou se a busca só achou acessórios)
const escondeAcessorios = () => !$("#com-acessorios").checked && estado.ofertas.some((o) => !o.acessorio);

// O produto buscado: todas as palavras e, numa busca dentro de categoria, da categoria
const produtoExato = (o) => o.bate && (!estado.cat || estado.foraDaCategoria || o.naCategoria);

// "Maior desconto" honesto (como o selo "Desconto Real" do Zoom): primeiro o desconto que nós conferimos no
// histórico (preço abaixo do habitual dos últimos 30 dias); depois o desconto informado pela loja; os acima de 75%
// por último, porque quase sempre o "preço antigo" foi inflado (o Procon chama de maquiagem de preço)
const DESCONTO_SUSPEITO = 75;
const percentual = (o) => o.historico?.descontoReal || o.desconto || 0;
const economia = (o) => (o.historico?.descontoReal ? o.preco / (1 - o.historico.descontoReal / 100) - o.preco : (o.precoAntigo || o.preco) - o.preco);
function nivelDesconto(o) {
  if (o.historico?.descontoReal) return 0;
  if (!o.desconto || o.desconto < 5) return 3;
  return o.desconto > DESCONTO_SUSPEITO ? 2 : 1;
}

// Categoria(s) do que foi buscado, tirada dos próprios resultados: as categorias com mais de 20% dos produtos que
// começam pelo que foi buscado ("ar condicionado" -> Eletrodomésticos; "colchão" -> Cama e banho e Móveis, porque as
// lojas põem nas duas). "" = sem categoria. Sem busca, ou com menos de 5 desses produtos: null (não separa)
const PARTE_DA_CATEGORIA = 0.2;
function categoriasDaBusca() {
  if (!estado.q || estado.cat) return null; // dentro de uma categoria aberta já vale a categoria dela
  const base = estado.ofertas.filter((o) => o.principal && !o.acessorio && !o.variante && !o.foraDoTipo);
  if (base.length < 5) return null;
  const conta = new Map();
  for (const o of base) conta.set(o.secao || "", (conta.get(o.secao || "") || 0) + 1);
  const cats = [...conta].filter(([, n]) => n > base.length * PARTE_DA_CATEGORIA).map(([c]) => c);
  return cats.length ? new Set(cats) : null;
}

// Preço típico do produto buscado: mediana dos que começam pelo que foi buscado (5 ou mais), sem versões de nicho
const PARTE_DO_TIPICO = 0.3;
function precoTipico(lista) {
  const precos = lista.filter((o) => o.principal && !o.acessorio && !o.variante && !o.foraDoTipo && o.preco > 0)
    .map((o) => o.preco).sort((a, b) => a - b);
  return precos.length >= 5 ? precos[Math.floor(precos.length / 2)] : 0;
}

// Todos os filtros menos o de lojas: a contagem de cada loja (botões do card e da barra lateral) usa o mesmo, para
// bater com o que aparece na tela (contava também o que outros filtros escondiam; print do Giovanni, 23/10/2026)
function passaNosFiltros(comMarca = true) {
  const min = lerPreco($("#preco-min").value);
  const max = lerPreco($("#preco-max").value);
  const frete = $("#so-frete").checked;
  const bemAvaliados = $("#bem-avaliados").checked;
  const envio = $("input[name=envio]:checked")?.value || "todos";
  const semAcessorios = escondeAcessorios();
  return (o) => secaoVisivel(o)
    && !(comMarca && estado.marcasSo.size && !estado.marcasSo.has(marcaDe(o)?.n))
    && !(semAcessorios && o.acessorio)
    && !(min >= 0 && o.preco < min)
    && !(max >= 0 && o.preco > max)
    && (!frete || o.freteGratis)
    && (!bemAvaliados || o.avaliacao >= NOTA_BOA)
    && (envio === "todos" || (envio === "internacional") === Boolean(o.internacional));
}

function filtrar() {
  const passa = passaNosFiltros();
  const lista = estado.ofertas.filter((o) => !estado.lojasDesmarcadas.has(o.loja) && passa(o));
  estado.qtdFiltrada = lista.length; // a rolagem infinita para cedo quando os filtros não deixam nada (ver rolagemInfinita)

  const ordem = $("input[name=ordem]:checked").value;
  const ordenar = {
    menor: (a, b) => a.preco - b.preco,
    maior: (a, b) => b.preco - a.preco,
    desconto: (a, b) => nivelDesconto(a) - nivelDesconto(b) || percentual(b) - percentual(a),
    economia: (a, b) => nivelDesconto(a) - nivelDesconto(b) || economia(b) - economia(a),
    vendidos: (a, b) => pesoVendas(b) - pesoVendas(a),
  }[ordem];
  // Com busca, qualquer ordem segue a categoria do que foi buscado (regra do Giovanni, 17/10/2026): primeiro os produtos
  // dessa categoria, depois os de outras. Sem busca ("Ofertas do dia"), a ordem vale para todas as ofertas
  const daBusca = categoriasDaBusca();
  const foraDaBusca = (o) => (daBusca && !o.acessorio && !daBusca.has(o.secao || "") ? 1 : 0);
  if (!ordenar) return daBusca ? [...lista].sort((a, b) => foraDaBusca(a) - foraDaBusca(b)) : lista;
  // Sem busca e sem categoria aberta: só a ordem escolhida, em todas as ofertas (as "Ofertas do dia" vêm de várias
  // buscas e trazem marcas de produto/acessório que não valem aqui)
  if (!estado.q && !estado.cat) return [...lista].sort(ordenar);
  // Ordenar por preço/desconto não pode trazer o "Pôster Invictus" antes do perfume buscado, nem o "Comando Ar
  // Condicionado Ford Fiesta" e o resfriador de R$ 300 antes dos splits (print do Giovanni, 17/10/2026). Primeiro o produto
  // de verdade: começa pelo que foi buscado (principal), não é versão de nicho nem de carro e custa pelo menos 30% do preço
  // típico do produto; depois esses outros com todas as palavras; depois o resto; acessórios no fim
  const tipico = precoTipico(lista);
  const comPrincipal = lista.some((o) => o.principal);
  const grupo = (o) => {
    if (o.acessorio) return 4;
    if (!produtoExato(o)) return 3;
    if (comPrincipal && !o.principal) return 2;
    return o.variante || o.foraDoTipo || (tipico && o.preco < tipico * PARTE_DO_TIPICO) ? 1 : 0;
  };
  return [...lista].sort((a, b) => foraDaBusca(a) - foraDaBusca(b) || grupo(a) - grupo(b) || ordenar(a, b));
}

// Categorias nos resultados: "invictus" traz perfume, pôster e camiseta; o visitante marca as que quer ver.
// secoesSo = só estas (busca dentro de uma categoria: começa só com ela); senão, todas menos secoesFora.
const secaoVisivel = (o) => (estado.secoesSo ? estado.secoesSo.has(o.secao || "") : !estado.secoesFora.has(o.secao || ""));

function zerarSecoes() {
  estado.secoesSo = null;
  estado.secoesFora.clear();
  estado.marcasSo.clear();
  estado.todasMarcas = false;
}

function marcarSecao(secao, marcada) {
  const conjunto = estado.secoesSo || estado.secoesFora;
  (marcada === Boolean(estado.secoesSo)) ? conjunto.add(secao) : conjunto.delete(secao);
  desenharResultados();
}

const PARTE_FORA_AMBIGUA = 0.2;
function desenharFiltroSecoes() {
  const semAcessorios = escondeAcessorios();
  const contagem = new Map();
  for (const o of estado.ofertas) {
    if (!(semAcessorios && o.acessorio)) contagem.set(o.secao || "", (contagem.get(o.secao || "") || 0) + 1);
  }
  // Busca de um produto específico ("geladeira", "jogo de ferramentas"): a categoria já está dita na busca e a lista só
  // mostrava o que veio errado; o que ajuda é a marca, que fica no alto (pesquisas de usabilidade Baymard/NN/g; pedido do
  // Giovanni, 30/10/2026). As categorias só aparecem quando a busca se divide em 2+ categorias fortes ("toalha", "jogo")
  // ou não dá para saber; aí vêm antes das marcas
  // Também quando 20%+ dos produtos estão fora da categoria da busca ("kit", "capa", "presente", "vestido" com Moda infantil)
  const daBusca = categoriasDaBusca();
  const produtos = estado.ofertas.filter((o) => !o.acessorio);
  const fora = daBusca ? produtos.filter((o) => !daBusca.has(o.secao || "")).length : 0;
  const ambigua = !daBusca || daBusca.size > 1 || fora >= produtos.length * PARTE_FORA_AMBIGUA;
  $("#caixa-secoes").hidden = contagem.size < 2 || (estado.q && !estado.cat && !ambigua);
  const caixa = $("#caixa-secoes");
  const marcas = $("#caixa-marcas");
  if (estado.q && !estado.cat && ambigua) { if (caixa.nextElementSibling !== marcas) marcas.before(caixa); }
  else if (marcas.nextElementSibling !== caixa) marcas.after(caixa);
  const ordem = [...contagem.keys()].sort((a, b) => (!a) - (!b) || (b === estado.cat) - (a === estado.cat) || contagem.get(b) - contagem.get(a));
  $("#filtro-secoes").replaceChildren(...ordem.map((secao) => el("label", { class: "opcao" },
    el("input", { type: "checkbox", checked: secaoVisivel({ secao }), onchange: (e) => marcarSecao(secao, e.target.checked) }),
    secao ? `${categoriaPeloNome(secao)?.emoji || ""} ${secao}` : "Outros",
    el("span", { class: "qtd", title: `${contagem.get(secao)} ofertas desta categoria na lista` }, contagem.get(secao)))));
}

// Filtro por marca (pedido do Giovanni, 24/10/2026): a marca sai do título, pela mesma lista de marcas da busca
// (MARCAS em lib/vocabulario.js, que chega por /api/vocabulario). As lojas não mandam a marca separada (Shopee e
// AliExpress não têm o campo). Marca que também é palavra comum ("Golden", "Estrela", "Reserva", "5 HP") só vale nas
// 3 primeiras palavras do título. Sem marca reconhecida, o produto some quando alguma marca está marcada.
const MARCA_APELIDOS = { iphone: "apple", ipad: "apple", macbook: "apple", airpods: "apple", galaxy: "samsung", redmi: "xiaomi",
  poco: "xiaomi", eletrolux: "electrolux", britania: "britânia", boticario: "o boticário", kindle: "amazon", alexa: "amazon",
  chromecast: "google" };
const MARCAS_AMBIGUAS = new Set(["golden", "premier", "growth", "fame", "gama", "atlas", "continental", "reserva", "tomate",
  "honor", "poco", "mac", "creamy", "estrela", "hercules", "pioneiro", "skala", "democrata", "pegada", "moleca", "ipanema",
  "melissa", "kappa", "oxo", "fischer", "darkness", "dux", "hp", "ninja", "fila", "positivo", "alexa", "tip top", "galaxy"]);
const MARCAS_SIGLAS = { lg: "LG", hp: "HP", jbl: "JBL", tcl: "TCL", aoc: "AOC", wap: "WAP", qcy: "QCY", msi: "MSI", "3m": "3M",
  dji: "DJI", mac: "MAC", "tp link": "TP-Link", oxo: "OXO", hyperx: "HyperX", aiwa: "AIWA", wap: "WAP" };
// Lojas que vendem só a própria marca: o produto sem marca no título fica com a marca da loja
const LOJAS_QUE_SAO_MARCA = { karsten: "Karsten", polishop: "Polishop", "monte carlo": "Monte Carlo", animale: "Animale",
  "shark ninja": "Ninja", arno: "Arno", malwee: "Malwee", brinox: "Brinox", rovitex: "Rovitex" };
const marcaDaLoja = (o) => {
  const loja = limpo(o.lojaNome || "");
  const chave = Object.keys(LOJAS_QUE_SAO_MARCA).find((k) => loja === k || loja.startsWith(`${k} `));
  return chave ? { n: limpo(LOJAS_QUE_SAO_MARCA[chave]), nome: LOJAS_QUE_SAO_MARCA[chave] } : null;
};
const nomeDaMarca = (m) => MARCAS_SIGLAS[limpo(m)] || m.replace(/(^|\s)(\S)/g, (_, e, l) => e + l.toUpperCase());
let marcasDoTitulo = null; // [{ chave: " samsung ", n: "samsung", nome: "Samsung", amb }], montada quando o vocabulário chega
function prepararMarcas() {
  if (!vocab.marcas.length) return null;
  // A lista tem "britânia" e "britania": fica a 1ª (com acento) para o nome que aparece
  const nomes = new Map();
  for (const m of vocab.marcas) if (!nomes.has(limpo(m))) nomes.set(limpo(m), m);
  marcasDoTitulo = [...nomes].map(([n]) => {
    const dona = limpo(MARCA_APELIDOS[n] || n);
    return { chave: ` ${n} `, n: dona, nome: nomeDaMarca(nomes.get(dona) || MARCA_APELIDOS[n] || n), amb: MARCAS_AMBIGUAS.has(n) };
  });
  return marcasDoTitulo;
}
function marcaDe(o) {
  if (!marcasDoTitulo && !prepararMarcas()) return null;
  if (o._marcaDe === marcasDoTitulo) return o._marca;
  const t = ` ${limpo(o.titulo)} `;
  let melhor = null;
  for (const m of marcasDoTitulo) {
    const i = t.indexOf(m.chave);
    if (i < 0) continue;
    const posicao = t.slice(0, i).split(" ").length - 1; // 0 = 1ª palavra do título
    if (m.amb && posicao > 2) continue;
    if (!melhor || posicao < melhor.posicao) melhor = { n: m.n, nome: m.nome, posicao };
  }
  o._marcaDe = marcasDoTitulo;
  o._marca = melhor ? { n: melhor.n, nome: melhor.nome } : marcaDaLoja(o);
  return o._marca;
}

const MARCAS_VISIVEIS = 10;
let ordemMarcas = [];
let marcasParadas = false;
$("#caixa-marcas").addEventListener("pointerenter", () => { marcasParadas = true; });
$("#caixa-marcas").addEventListener("pointerleave", () => { marcasParadas = false; });
function desenharFiltroMarcas() {
  const passa = passaNosFiltros(false);
  const contagem = new Map();
  for (const o of estado.ofertas) {
    if (estado.lojasDesmarcadas.has(o.loja) || !passa(o)) continue;
    const m = marcaDe(o);
    if (m) contagem.set(m.n, { nome: m.nome, qtd: (contagem.get(m.n)?.qtd || 0) + 1 });
  }
  // Marca marcada que sumiu da lista (outro filtro) continua aparecendo, para dar para desmarcar
  for (const n of estado.marcasSo) if (!contagem.has(n)) contagem.set(n, { nome: marcasDoTitulo?.find((m) => m.n === n)?.nome || n, qtd: 0 });
  const caixa = $("#caixa-marcas");
  // Nas "Ofertas do dia" quase tudo é produto sem marca no nome (calça cargo, suporte de celular…): o filtro só vale
  // na busca, na categoria e na página de uma loja (print do Giovanni, 24/10/2026: só 3 marcas na página inicial)
  caixa.hidden = contagem.size < 2 || (!estado.q && !estado.loja);
  if (caixa.hidden) return;
  let ordem = [...contagem].sort(([a, x], [b, y]) => estado.marcasSo.has(b) - estado.marcasSo.has(a) || y.qtd - x.qtd || x.nome.localeCompare(y.nome, "pt-BR"));
  // Com o mouse (ou o dedo) em cima da lista, a ordem não muda: os lotes que chegam sozinhos mudavam as quantidades e a
  // marca embaixo do clique trocava (print "smart tv lg" com Samsung marcada, 31/10/2026). Só as quantidades se atualizam
  if (marcasParadas && ordemMarcas.length) {
    const pos = new Map(ordemMarcas.map((n, i) => [n, i]));
    ordem = ordem.sort(([a], [b]) => (pos.get(a) ?? 1e9) - (pos.get(b) ?? 1e9));
  }
  ordemMarcas = ordem.map(([n]) => n);
  const mostrar = estado.todasMarcas ? ordem : ordem.slice(0, Math.max(MARCAS_VISIVEIS, estado.marcasSo.size));
  $("#filtro-marcas").replaceChildren(...mostrar.map(([n, m]) => el("label", { class: "opcao" },
    el("input", { type: "checkbox", checked: estado.marcasSo.has(n), onchange: (e) => {
      if (e.target.checked) estado.marcasSo.add(n); else estado.marcasSo.delete(n);
      desenharFiltroLojas();
      desenharResultados();
    } }),
    m.nome,
    el("span", { class: "qtd", title: `${m.qtd} ofertas desta marca na lista` }, m.qtd))),
  ordem.length > mostrar.length || estado.todasMarcas
    ? el("button", { type: "button", class: "botao-link", onclick: () => { estado.todasMarcas = !estado.todasMarcas; desenharFiltroMarcas(); } },
      estado.todasMarcas ? "Ver menos" : `Ver todas (${ordem.length})`)
    : "");
}

// Ofertas de cada loja na lista (acessórios escondidos não entram)
function contarLojas() {
  const passa = passaNosFiltros();
  const contagem = {};
  for (const o of estado.ofertas) if (passa(o)) contagem[o.loja] = (contagem[o.loja] || 0) + 1;
  return contagem;
}

function alternarLoja(id, ligar) {
  if (ligar) estado.lojasDesmarcadas.delete(id); else estado.lojasDesmarcadas.add(id);
}

// A API das lojas manda o preço sem cupom; com cupom ou Pix (depende da conta e da campanha) pode sair menos na loja.
// Aviso uma vez só, no card de resultados e na faixa das "Ofertas do dia", sem mexer nos cartões (pedido do Giovanni)
// Pix e cupom não vêm nos arquivos das lojas (print Motorola, 28/10/2026: R$ 7.999 no site = preço a prazo; R$ 7.199 no Pix)
const AVISO_CUPOM = "💸 Pagando no Pix ou com cupom, muitos produtos saem ainda mais baratos na loja.";

// Lojas desta busca dentro do card de resultados (pedido do Giovanni, 17/10/2026): o visitante vê na hora quais lojas
// têm o produto e liga/desliga cada uma; "Limpar" desliga todas (para escolher só uma) e "Marcar todas" volta tudo
// Mesmo botão "Limpar filtros" da barra lateral, no card roxo (pedido do Giovanni, 22/10/2026: no card ele fica à vista)
const botaoLimparFiltros = () => el("button", { type: "button", class: "chip-acao chip-limpar", onclick: limparTudo }, "✕ Limpar filtros");

function lojasNoResumo() {
  const contagem = contarLojas();
  const ids = Object.keys(contagem);
  if (!ids.length) return null;
  const atualizar = () => { desenharFiltroLojas(); desenharResultados(); };
  const algumaDesligada = ids.some((id) => estado.lojasDesmarcadas.has(id));
  return el("div", { class: "resumo-lojas" },
    el("span", { class: "resumo-lojas-titulo" }, "Lojas com ofertas:"),
    ...ids.map((id) => {
      const loja = infoLoja(estado.ofertas.find((o) => o.loja === id));
      const ligada = !estado.lojasDesmarcadas.has(id);
      return el("button", {
        type: "button", class: "chip-loja", "aria-pressed": String(ligada), style: `--cor-loja:${loja.cor}`,
        title: ligada ? `Esconder as ofertas da ${loja.nome}` : `Mostrar as ofertas da ${loja.nome}`,
        onclick: () => { alternarLoja(id, !ligada); atualizar(); },
      }, el("span", { class: "loja-ponto" }), loja.nome, el("span", { class: "qtd" }, contagem[id]));
    }),
    el("button", {
      type: "button", class: "chip-acao",
      onclick: () => { ids.forEach((id) => alternarLoja(id, algumaDesligada)); atualizar(); },
    }, algumaDesligada ? "Marcar todas" : "Limpar"),
    el("small", { class: "resumo-lojas-nota" },
      estado.qtdParceiras ? `Temos ${estado.qtdParceiras} parceiras; aqui aparecem as que têm ofertas nesta busca. ` : "",
      el("button", { type: "button", class: "botao-link-claro", onclick: abrirLojas }, "Ver lojas parceiras"),
      " ", AVISO_CUPOM));
}

function desenharFiltroLojas() {
  desenharFiltroSecoes();
  desenharFiltroMarcas();
  desenharLojasDaLista();
}

// Lojas da barra lateral com a quantidade de cada uma (refeita a cada filtro mexido, para o número bater com a tela)
function desenharLojasDaLista() {
  const contagem = contarLojas();
  $("#filtro-lojas").replaceChildren(...Object.keys(contagem).map((id) => {
    const loja = infoLoja(estado.ofertas.find((o) => o.loja === id));
    return el("label", { class: "opcao", style: `--cor-loja:${loja.cor}` },
      el("input", {
        type: "checkbox", checked: !estado.lojasDesmarcadas.has(id),
        onchange: (e) => { alternarLoja(id, e.target.checked); desenharResultados(); },
      }),
      el("span", { class: "loja-ponto" }), loja.nome,
      el("span", { class: "qtd", title: `${contagem[id]} ofertas desta loja na lista` }, contagem[id]));
  }));
}

// "oculos" buscado com a página da Calvin Klein aberta: mostra a loja e um jeito de buscar em todas
function avisoLoja() {
  const loja = lojaAtual();
  if (!loja) return null;
  return el("p", { class: "resumo-categoria" }, `Na loja 🏬 ${nomeDaLoja(loja)} · `,
    el("button", { type: "button", onclick: () => irPara(estado.q) }, "Buscar em todas as lojas ✕"));
}

// "invictus" buscado dentro de Perfumes: mostra a categoria e um jeito de buscar em tudo
function avisoCategoria() {
  const sair = () => irPara(estado.q);
  if (estado.foraDaCategoria) {
    return el("p", { class: "resumo-categoria" }, `Nada encontrado em ${estado.foraDaCategoria}; mostrando todas as categorias.`);
  }
  if (!estado.cat) return null;
  const c = categoriaPeloNome(estado.cat);
  if (c && normalizar(estado.q).includes(normalizar(c.busca || c.nome))) return null; // é a própria categoria
  return el("p", { class: "resumo-categoria" }, `Na categoria ${c?.emoji || ""} ${estado.cat} · `,
    el("button", { type: "button", onclick: sair }, "Buscar em todas as categorias ✕"));
}

// Ofertas que valem para o "Menor preço": o produto buscado (título com todas as palavras),
// sem acessórios e sem preços fora da curva ("Bit para parafusadeira" a R$ 5 numa lista de R$ 200)
// Tira os preços fora da curva (menos de 30% ou mais de 3 vezes a mediana)
function semForaDaCurva(base) {
  if (!base.length) return [];
  const precos = base.map((o) => o.preco).sort((a, b) => a - b);
  const mediana = precos[Math.floor(precos.length / 2)];
  const dentro = base.filter((o) => o.preco >= mediana * 0.3 && o.preco <= mediana * 3);
  return dentro.length ? dentro : base;
}

function ofertasComparaveis(lista) {
  const produtos = lista.filter((o) => !o.acessorio);
  // Sem o produto buscado na lista (ex.: só jaquetas "Air" numa busca por "air fryer"), ninguém ganha o selo
  // e o selo "Menor preço" não vai para resfriador nem peça de carro quando há o produto de verdade
  const exatos = produtos.filter(produtoExato);
  const deVerdade = exatos.filter((o) => o.principal && !o.variante && !o.foraDoTipo);
  const base = deVerdade.length ? deVerdade : exatos;
  return semForaDaCurva(base);
}

// Selo de menor preço só para anúncio com alguma prova (03/11/2026, print "lisinha"): o "Menor preço da busca" era um
// anúncio da Shopee sem nenhuma venda nem nota, e na Shopee dava "O produto não existe". Nos marketplaces (Shopee,
// AliExpress) precisa de venda ou avaliação; lojas da Awin/Lomadee não mandam esses números e valem sempre
const MARKETPLACES = new Set(["shopee", "aliexpress"]);
const comProva = (o) => !MARKETPLACES.has(o.loja) || o.vendidos > 0 || o.avaliacao > 0;
function melhorOferta(lista) {
  if (poucosProdutos()) return null; // só peças na lista: o selo iria para uma peça
  const base = ofertasComparaveis(lista).filter(comProva);
  return base.length ? base.reduce((a, b) => (b.preco < a.preco ? b : a)) : null;
}

// "✨ Escolha rápida" (26/10/2026, pedido do Giovanni, pesquisa sobre como decidimos uma compra): com muitas opções a
// pessoa adia a decisão (Chernev et al., 2015), então 3 sugestões no topo da busca, cada uma com o critério à mostra.
// O "custo-benefício" fica no meio (efeito compromisso, Simonson 1989). Só entre os produtos de verdade da busca
// (ofertasComparaveis: sem acessório e sem preço fora da curva); nota só conta com vendas suficientes (avaliações
// de poucas pessoas não dizem muito).
const NOTA_BOA = 4;
const ESCOLHA_MINIMO = 6;
const VENDAS_MINIMAS = 10; // a API manda as vendas recentes (números baixos); com menos que isso a nota não diz muito
function escolhaRapida(lista) {
  if (!estado.q || estado.loja || poucosProdutos()) return [];
  // Categoria aberta (vitrine): os produtos da categoria, sem preço fora da curva; busca: os produtos de verdade da busca
  const cat = navegandoCategoria();
  const daCategoria = cat && lista.filter((o) => !o.acessorio && o.secao === cat.nome);
  const base = (cat ? semForaDaCurva(daCategoria) : ofertasComparaveis(lista)).filter((o) => !o.variante && !o.foraDoTipo);
  if (base.length < ESCOLHA_MINIMO) return [];
  const precos = base.map((o) => o.preco).sort((a, b) => a - b);
  const mediana = precos[Math.floor(precos.length / 2)];
  const usados = new Set();
  const primeiro = (candidatos, ordem) => {
    const o = candidatos.sort(ordem).find((x) => !usados.has(x.id));
    if (o) usados.add(o.id);
    return o;
  };
  const barato = primeiro(base.filter(comProva), (a, b) => a.preco - b.preco);
  const avaliado = primeiro(base.filter((o) => o.avaliacao >= 4.5 && o.vendidos >= VENDAS_MINIMAS),
    (a, b) => b.avaliacao - a.avaliacao || b.vendidos - a.vendidos);
  // Mercado Livre entra pelo ranking de mais vendidos (até o 5º da categoria; pesoVendas), 05/11/2026
  const custo = primeiro(base.filter((o) => o.preco <= mediana && (o.vendidos >= VENDAS_MINIMAS || (o.rankML > 0 && o.rankML <= 5))
    && !(o.avaliacao && o.avaliacao < 4.5)), (a, b) => pesoVendas(b) - pesoVendas(a));
  const escolhas = [
    barato && { o: barato, titulo: "💰 Mais barato", porque: "O menor preço entre os produtos desta lista" },
    custo && { o: custo, titulo: "🏆 Custo-benefício", porque: "O mais vendido entre os que custam menos que a média desta lista" },
    avaliado && { o: avaliado, titulo: "⭐ Mais bem avaliado", porque: `A maior nota entre os produtos com ${VENDAS_MINIMAS} vendas ou mais` },
  ].filter(Boolean);
  return escolhas.length >= 2 ? escolhas : [];
}

// A escolha fica parada enquanto a lista e os filtros são os mesmos: só muda quando o visitante mexe num filtro ou
// pede "Ver mais resultados"
function chaveDaEscolha() {
  return JSON.stringify([estado.pedido, estado.cargasManuais || 0, [...estado.lojasDesmarcadas], estado.secoesSo && [...estado.secoesSo],
    [...estado.secoesFora], [...estado.marcasSo], $("#preco-min").value, $("#preco-max").value, $("#so-frete").checked,
    $("#bem-avaliados").checked, $("#com-acessorios").checked, $("input[name=envio]:checked")?.value]);
}

function desenharEscolhaRapida(lista) {
  const caixa = $("#escolha-rapida");
  if (estado.completando) { caixa.hidden = true; return; }
  const chave = chaveDaEscolha();
  if (estado.escolha?.chave !== chave) estado.escolha = { chave, escolhas: escolhaRapida(lista) };
  const { escolhas } = estado.escolha;
  caixa.hidden = !escolhas.length;
  caixa.replaceChildren(...(escolhas.length ? [
    el("h2", { class: "escolha-cabeca" }, "✨ Escolha rápida"),
    el("div", { class: "escolha-lista" }, ...escolhas.map(({ o, titulo, porque }) => el("div", { class: "escolha" },
      el("p", { class: "escolha-titulo" }, titulo, el("small", {}, porque)),
      cartaoOferta(o)))),
  ] : []));
}

// "Corrigimos “eletrolux” · Buscar como digitei" ou "Você quis dizer: electrolux?"
function avisoCorrecao() {
  if (navegandoCategoria()) return null;
  if (estado.corrigidaDe) {
    return el("p", { class: "resumo-categoria" }, `Corrigimos “${estado.corrigidaDe}” · `,
      el("button", { type: "button", onclick: () => irPara(estado.corrigidaDe, { cat: estado.cat, exato: true, loja: lojaAtual() }) },
        "Buscar como digitei"));
  }
  if (estado.sugestao) {
    return el("p", { class: "resumo-categoria" }, "Você quis dizer: ",
      el("button", { type: "button", onclick: () => irPara(estado.sugestao, { cat: estado.cat, loja: lojaAtual() }) }, `${estado.sugestao}?`));
  }
  return null;
}

// Busca de um produto que nenhuma loja parceira vende (só peças dele): "máquina de lavar eletrolux" trazia
// só bomba, pé nivelador e embreagem. "principal" = título começa pelo produto buscado (lib/relevancia.js)
const POUCOS_PRODUTOS = 2;
const qtdPrincipais = () => estado.ofertas.filter((o) => o.principal).length;
const poucosProdutos = () => Boolean(estado.q) && !navegandoCategoria() && estado.ofertas.length > 0 && qtdPrincipais() <= POUCOS_PRODUTOS;
function avisoSemProduto() {
  if (!poucosProdutos()) return null;
  const qtd = qtdPrincipais();
  const loja = lojaAtual();
  if (loja) {
    return el("p", { class: "aviso-sem-produto", role: "status" }, `${qtd ? `Encontramos só ${qtd} ${qtd === 1 ? "oferta" : "ofertas"} de “${estado.q}”`
      : `😕 Não encontramos “${estado.q}”`} na ${nomeDaLoja(loja)}. `,
      el("button", { type: "button", class: "botao-link-claro", onclick: () => irPara(estado.q) }, "Buscar em todas as lojas"));
  }
  return el("p", { class: "aviso-sem-produto", role: "status" }, qtd
    ? `Encontramos só ${qtd} ${qtd === 1 ? "oferta" : "ofertas"} de “${estado.q}” nas lojas parceiras. O resto da lista são peças, acessórios e produtos parecidos.`
    : `😕 “${estado.q}” não está à venda nas nossas lojas parceiras no momento. Abaixo, peças, acessórios e produtos parecidos.`);
}

function desenharResumo(lista) {
  if (estado.loja) return desenharResumoLoja(lista);
  const qtdLojas = new Set(lista.map((o) => o.loja)).size;
  const cat = navegandoCategoria();
  const titulo = el("div", {},
    cat ? el("h1", {}, `${cat.emoji || ""} ${cat.nome}`) : el("h1", {}, el("span", {}, "Resultados para "), `“${estado.q}”`),
    el("p", {}, lista.length
      ? `${lista.length} ${lista.length === 1 ? "oferta" : "ofertas"} em ${qtdLojas} ${qtdLojas === 1 ? "loja" : "lojas"}`
      : estado.ofertas.length ? "Nenhuma oferta com esses filtros"
        // Busca sem nenhum resultado (print "geladeira bravecto", 31/10/2026): não fala de filtros que ninguém escolheu
        : "Não achamos ofertas com essas palavras nas lojas parceiras. Confira a escrita ou tente uma palavra mais simples."),
    avisoCorrecao(),
    avisoCategoria(),
    avisoLoja(),
    avisoSemProduto(),
    lojasNoResumo(),
    estado.ofertas.length ? el("div", { class: "resumo-acoes" }, botaoLimparFiltros()) : "");

  $("#resumo").replaceChildren(titulo);
}

// Botão "🚚 Frete grátis" acima da lista (o mesmo filtro de "Mais opções"). A Shopee não informa o frete
// para afiliados, então hoje só lojas da Awin têm essa informação: o botão só aparece quando a lista tem
// pelo menos FRETE_MINIMO ofertas com frete grátis (para não frustrar com 1 ou 2 resultados).
const FRETE_MINIMO = 8;
// Frete grátis nas Ofertas do dia (08/11/2026, print do Giovanni: abria com "Frete grátis (41)" e só aparecia mais rolando a
// lista com ele marcado): /api/frete-gratis manda, de 48 em 48, as ofertas do dia com frete grátis e quantas são ao todo. O
// total aparece no botão logo ao abrir; marcando, elas entram na lista e o "Ver mais" traz as próximas com frete grátis
// O total fica guardado no aparelho: ao atualizar a página o botão já abre com ele (08/11/2026: mostrava 49 e depois 3318).
// Sem total guardado (1ª visita), o botão aparece sem número até o total chegar
const GUARDA_FRETE = "vpc_frete_total";
function freteGuardado() {
  try {
    const g = JSON.parse(localStorage.getItem(GUARDA_FRETE) || "null");
    return g && Date.now() - g.quando < 30 * 3600e3 ? Number(g.total) || 0 : 0;
  } catch {
    return 0;
  }
}
const freteInicio = { total: freteGuardado(), conhecido: false, pagina: 0, temMais: true, lista: [], pedido: null };
freteInicio.conhecido = freteInicio.total > 0;
function pedirFreteGratis() {
  freteInicio.pedido ||= fetch(`/api/frete-gratis?pagina=${freteInicio.pagina + 1}`).then((r) => (r.ok ? r.json() : null)).catch(() => null)
    .then((d) => {
      if (!d?.ofertas) { freteInicio.temMais = false; freteInicio.conhecido = true; return false; }
      freteInicio.pagina += 1;
      // A 1ª página traz o total de hoje (vale mais que o guardado, que pode ser de ontem)
      if (freteInicio.pagina === 1) freteInicio.total = d.total || 0;
      freteInicio.conhecido = true;
      try { localStorage.setItem(GUARDA_FRETE, JSON.stringify({ quando: Date.now(), total: freteInicio.total })); } catch { /* sem armazenamento */ }
      freteInicio.temMais = Boolean(d.temMais);
      freteInicio.lista.push(...d.ofertas);
      return d.ofertas.length > 0;
    })
    .finally(() => { freteInicio.pedido = null; });
  return freteInicio.pedido;
}
const naPaginaInicial = () => !estado.q && !estado.loja && !$("#inicio").hidden;
function juntarFreteNoInicio() {
  if (!estado.inicio || !freteInicio.lista.length) return;
  estado.inicio = semRepetidos([...estado.inicio, ...freteInicio.lista]);
  freteInicio.lista = [];
  if (naPaginaInicial()) {
    estado.ofertas = estado.inicio;
    desenharFiltroLojas();
    desenharResultados();
  }
}
// Marcou "Frete grátis" na página inicial: as já trazidas entram na lista (e, se ainda não vieram, pede a 1ª página)
function freteMarcadoNoInicio() {
  if (!$("#so-frete").checked || !naPaginaInicial()) return;
  if (freteInicio.lista.length) juntarFreteNoInicio();
  else if (freteInicio.temMais && !freteInicio.pagina) pedirFreteGratis().then(juntarFreteNoInicio);
}
function desenharBotaoFrete() {
  const ligado = $("#so-frete").checked;
  const bem = $("#bem-avaliados").checked;
  // Cada contagem leva em conta a outra opção (07/11/2026, print do Giovanni: "Frete grátis" + "Bem avaliados" davam 0 e
  // a opção dizia 224). Hoje frete grátis só vem do Mercado Livre, que não manda nota: juntas, as duas não têm produto
  const temNota = (o) => o.avaliacao >= NOTA_BOA;
  const carregados = estado.ofertas.filter((o) => o.freteGratis && (!bem || temNota(o))).length;
  // Na página inicial, o total de ofertas do dia com frete grátis (não só as já carregadas; ver pedirFreteGratis)
  const doInicio = !estado.q && !estado.loja && !bem;
  const qtd = doInicio ? Math.max(carregados, freteInicio.total) : carregados;
  const comNumero = !doInicio || freteInicio.conhecido;
  // Nenhuma loja parceira informa frete hoje (Shopee, AliExpress e Lomadee não mandam; os feeds da Awin vêm sem; conferido
  // em 23/10/2026): a opção da barra lateral só aparece quando há produto com frete grátis informado pela loja
  // ("Com desconto" saiu em 24/10/2026: "Maior desconto" em "Ordenar por" já faz isso; sem frete, "Mais opções" some)
  $("#opcao-frete").hidden = !qtd && !ligado;
  // "⭐ Bem avaliados" (26/10/2026): só a Shopee manda nota; a opção aparece quando há produtos com nota na lista
  const avaliados = estado.ofertas.filter((o) => temNota(o) && (!ligado || o.freteGratis) && !(escondeAcessorios() && o.acessorio)).length;
  $("#opcao-avaliados").hidden = !avaliados && !bem;
  $("#qtd-avaliados").textContent = avaliados || "";
  $("#mais-opcoes").hidden = $("#opcao-frete").hidden && $("#opcao-avaliados").hidden;
  document.querySelectorAll("[data-frete]").forEach((b) => {
    b.hidden = qtd < FRETE_MINIMO && !ligado;
    b.setAttribute("aria-pressed", String(ligado));
    b.textContent = ligado ? "🚚 Frete grátis ✕" : comNumero ? `🚚 Frete grátis (${qtd})` : "🚚 Frete grátis";
  });
}

// Cartões aos poucos (30/10/2026, Giovanni: celular lento com ~300 ofertas na página inicial): montar centenas de cartões
// de uma vez travava a tela por segundos. Monta os primeiros na hora e o resto em lotes quando a pessoa rola perto do fim
// (um marcador invisível no fim da grade). Filtros, contagens e "Escolha rápida" continuam usando a lista inteira.
const CARTOES_POR_LOTE = 48;
const observadores = new WeakMap();
// Cartões já na tela de cada grade (ids e elementos, na ordem). 05/11/2026 (Giovanni: "a rolagem automática buga conforme
// avança a quantidade e o efeito fica visível"): ao carregar mais uma página, a grade inteira era refeita (centenas de
// cartões apagados e montados de novo: a tela piscava e pulava). Agora os cartões do começo que continuam iguais ficam
// onde estão e só o que mudou (normalmente só os novos, no fim) é montado
const desenhados = new WeakMap();
function desenharAosPoucos(grade, lista, fazer, { minimo = 0 } = {}) {
  observadores.get(grade)?.disconnect();
  const antes = desenhados.get(grade);
  let iguais = 0;
  if (antes && antes.nos.every((n) => n.parentNode === grade)) {
    while (iguais < antes.ids.length && iguais < lista.length && antes.ids[iguais] === lista[iguais]?.id) iguais++;
  }
  const ids = antes ? antes.ids.slice(0, iguais) : [];
  const nos = antes ? antes.nos.slice(0, iguais) : [];
  let feitos = iguais;
  const marcador = el("div", { class: "fim-da-grade", "aria-hidden": "true" });
  // minimo: quantos cartões já estavam na tela (redesenho da mesma busca): desenha pelo menos esses de uma vez, para a
  // lista não encolher e a tela não pular (04/11/2026)
  let tamanho = Math.max(CARTOES_POR_LOTE, minimo - iguais);
  const mais = () => {
    const lote = lista.slice(feitos, feitos + tamanho).map((o, j) => fazer(o, feitos + j));
    ids.push(...lista.slice(feitos, feitos + lote.length).map((o) => o?.id));
    nos.push(...lote);
    tamanho = CARTOES_POR_LOTE;
    feitos += lote.length;
    marcador.before(...lote);
    if (feitos >= lista.length) { observadores.get(grade)?.disconnect(); marcador.remove(); }
  };
  if (iguais) {
    // Tira só o que vem depois dos cartões iguais (e o marcador antigo)
    for (const n of antes.nos.slice(iguais)) n.remove();
    for (const m of grade.querySelectorAll(":scope > .fim-da-grade")) m.remove();
    const ficam = new Set(nos);
    const intrusos = [...grade.children].filter((n) => !ficam.has(n));
    for (const n of intrusos) n.remove();
    grade.append(marcador);
  } else {
    grade.replaceChildren(marcador);
  }
  desenhados.set(grade, { ids, nos });
  if (!lista.length) return marcador.remove();
  if (feitos >= lista.length) return marcador.remove();
  mais();
  if (feitos < lista.length && "IntersectionObserver" in window) {
    // Depois de cada lote o marcador é observado de novo: se ainda está perto da tela, vem o próximo lote
    const obs = new IntersectionObserver((e) => {
      if (!e.some((x) => x.isIntersecting) || !marcador.isConnected) return;
      mais();
      if (marcador.isConnected) { obs.unobserve(marcador); obs.observe(marcador); }
    }, { rootMargin: "1500px 0px" });
    obs.observe(marcador);
    observadores.set(grade, obs);
  } else {
    while (feitos < lista.length) mais();
  }
}

function desenharResultados() {
  desenharBotaoFrete();
  if ((estado.q || estado.loja) && estado.buscando) return; // filtro mexido enquanto a busca carrega: espera a resposta
  const lista = filtrar();
  // Na busca as lojas ficam no card de resultados; a lista da barra lateral só vale nas "Ofertas do dia"
  $("#caixa-lojas").hidden = Boolean(estado.q || estado.loja);
  if (!estado.q && !estado.loja) {
    desenharLojasDaLista();
    return desenharInicio(lista);
  }
  const idMelhor = lista.length > 1 ? melhorOferta(lista)?.id : null;
  desenharResumo(lista);
  $("#total").textContent = `${lista.length} ${lista.length === 1 ? "oferta" : "ofertas"}`;
  const idVendido = idMaisVendido(lista);
  // Mais produtos chegando sozinhos (completarSozinho) redesenham a lista: os cartões que já estavam na tela não refazem
  // a animação de surgir (todos piscavam e subiam de novo a cada lote: "a tela dá uma pulada", Giovanni 04/11/2026)
  const grade = $("#grade");
  const jaNaTela = new Set([...grade.querySelectorAll(":scope > .oferta:not(.carregando)")].map((c) => c.dataset.id));
  desenharAosPoucos(grade, lista, (o, i) => {
    const c = cartaoOferta(o, { melhor: o.id === idMelhor, maisVendido: o.id === idVendido });
    c.dataset.id = o.id;
    if (jaNaTela.has(o.id)) c.style.animation = "none";
    else c.style.animationDelay = `${jaNaTela.size ? 0 : Math.min(i, 12) * 30}ms`;
    return c;
  }, { minimo: jaNaTela.size });
  desenharEscolhaRapida(lista);
  sheinNaBusca();
  $("#vazio").hidden = lista.length > 0;
  // Botões de baixo seguem as lojas marcadas no card: com todas desligadas não há o que "ver mais"
  const lojaLigada = (o) => !estado.lojasDesmarcadas.has(o.loja);
  const nenhumaLoja = !estado.ofertas.some(lojaLigada);
  $("#mais-resultados").hidden = !estado.temMaisBusca || nenhumaLoja;
  const acessorios = estado.ofertas.filter((o) => o.acessorio && lojaLigada(o)).length;
  const botao = $("#ver-acessorios");
  botao.hidden = !acessorios || $("#com-acessorios").checked || acessorios === estado.ofertas.length;
  // "parecido" = não tem todas as palavras de uma busca de 2+ palavras (o servidor junta com os acessórios)
  const soParecidos = estado.ofertas.every((o) => !o.acessorio || o.parecido);
  const temParecidos = estado.ofertas.some((o) => o.parecido);
  const nome = soParecidos ? (acessorios === 1 ? "produto parecido" : "produtos parecidos")
    : temParecidos ? "acessórios e produtos parecidos" : (acessorios === 1 ? "acessório ou peça" : "acessórios e peças");
  botao.textContent = `Ver também ${acessorios} ${nome} para “${estado.q}”`;
}

// Animação enquanto busca: um personagem empurra um carrinho de um lado ao outro, olhando para os lados, e o
// carrinho vai enchendo de produtos pelo caminho. Quem tem conta pode montar o seu ("Meu personagem");
// sem escolha, o site sorteia um dos dois modelos prontos a cada busca.
// As opções valem também no servidor (OPCOES_PERSONAGEM em lib/conta.js): mudar nos dois lugares.
const PERSONAGEM_OPCOES = {
  cabelo: { titulo: "Cabelo", itens: { curto: "Curto", rabo: "Rabo de cavalo", cacheado: "Cacheado", coque: "Coque", black: "Black power", tranca: "Trança", moicano: "Moicano", bone: "Boné", careca: "Careca" } },
  corCabelo: { titulo: "Cor do cabelo", cores: { preto: "#1f1209", castanho: "#5b3a1e", loiro: "#e9c46a", ruivo: "#c2410c", grisalho: "#a8a29e", rosa: "#f472b6", azul: "#38bdf8", roxo: "#8b5cf6" } },
  pele: { titulo: "Pele", cores: { clara: "#f5c09a", media: "#e0a97a", morena: "#b97a4f", parda: "#8d5524", negra: "#5c3a21" } },
  rosto: { titulo: "Rosto", itens: { sorriso: "😊 Sorriso", rindo: "😄 Rindo", piscadinha: "😉 Piscadinha", lingua: "😛 Língua de fora", estrela: "🤩 Olhos de estrela", oculos: "🤓 Óculos", escuros: "😎 Óculos escuros", barba: "🧔 Barba", bigode: "👨 Bigode", sardas: "🙂 Sardas" } },
  roupa: { titulo: "Roupa", cores: { amarelo: "#fde047", verde: "#14b8a6", azul: "#3b82f6", vermelho: "#ef4444", rosa: "#f472b6", preto: "#27272a" } },
  acessorio: { titulo: "Acessório", itens: { nenhum: "Nenhum", fone: "🎧 Fone", mochila: "🎒 Mochila", sacola: "🛍️ Sacola", gorro: "🎅 Gorro de Natal" } },
  jeito: { titulo: "Jeito de andar", itens: { andando: "🚶 Andando", correndo: "🏃 Correndo", patins: "🛼 De patins" } },
  carrinho: { titulo: "Carrinho", itens: { logo: "Do logo", grade: "De supermercado", cestinha: "🧺 Cestinha", corrida: "🏎️ De corrida", foguete: "🚀 Foguete", presentes: "🎁 Cheio de presentes", blackfriday: "🖤 Black Friday" } },
};
// Campos que vieram depois (23/10/2026): personagem salvo antes não tem, e fica com o padrão
const PERSONAGEM_PADRAO = { acessorio: "nenhum", jeito: "andando" };
// Os dois modelos prontos (v1 = boneco de camiseta amarela + carrinho do logo; v2 = moça + carrinho de grade)
const PERSONAGENS_PRONTOS = [
  { cabelo: "curto", corCabelo: "castanho", pele: "clara", rosto: "sorriso", roupa: "amarelo", acessorio: "nenhum", jeito: "andando", carrinho: "logo" },
  { cabelo: "rabo", corCabelo: "preto", pele: "morena", rosto: "sorriso", roupa: "verde", acessorio: "nenhum", jeito: "andando", carrinho: "grade" },
];
// Botão "🎲 Sortear" do editor
const sortearPersonagem = () => Object.fromEntries(Object.entries(PERSONAGEM_OPCOES).map(([campo, { itens, cores }]) => {
  const valores = Object.keys(itens || cores);
  return [campo, valores[Math.floor(Math.random() * valores.length)]];
}));

// Cor um pouco mais escura (braço e perna de trás)
const escurecer = (hex, f = 0.82) => `#${[1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * f).toString(16).padStart(2, "0")).join("")}`;

// Coisas que caem no carrinho (classe p1…p6 = ordem em que caem). O grupo de fora leva a posição de cada carrinho
// (translate/scale): no mesmo grupo da animação, o transform do CSS apagava a posição
function caindoNoCarrinho(itens, dx, dy, s = 1) {
  return `<g transform="translate(${dx} ${dy}) scale(${s})">${itens.map((conteudo, i) => `<g class="anim-produto p${i + 1}">${conteudo}</g>`).join("")}</g>`;
}
const PRODUTOS = [
  '<rect x="96" y="26" width="18" height="16" rx="2" fill="#ee4d2d"/><path d="M96 31 H114 M105 26 V31" stroke="#fff" stroke-width="1.5"/>',
  '<rect x="117" y="22" width="10" height="20" rx="2.5" fill="#6d28d9" stroke="#fff" stroke-width="1.5"/>',
  '<rect x="131" y="25" width="12" height="17" rx="3" fill="#ec4899"/><rect x="134" y="20" width="6" height="5" rx="1" fill="#fde047"/>',
  '<rect x="140" y="27" width="13" height="15" rx="2" fill="#22c55e"/><path d="M146.5 27 V42 M140 33 H153" stroke="#fff" stroke-width="1.5"/>',
  '<rect x="99" y="11" width="25" height="16" rx="2" fill="#1e1b4b" stroke="#fff" stroke-width="1.5"/><path d="M106 30 L111 27 L116 30" fill="none" stroke="#fff" stroke-width="1.5"/>',
  '<path d="M127 6 h15 l5 6 -5 6 h-15 z" fill="#fde047" stroke="#fff" stroke-width="1.5"/><text x="135" y="15.5" font-size="8" font-weight="800" fill="#7c2d12" text-anchor="middle">R$</text>',
];
const presente = (x, y, w, h, cor, laco) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1.5" fill="${cor}"/>`
  + `<path d="M${x + w / 2} ${y} V${y + h} M${x} ${y + h / 2} H${x + w}" stroke="${laco}" stroke-width="2"/>`
  + `<path d="M${x + w / 2} ${y} q-4 -5 -6 -1 q2 3 6 1 q4 -5 6 -1 q-2 3 -6 1" fill="none" stroke="${laco}" stroke-width="1.6"/>`;
const PRESENTES = [
  presente(96, 26, 18, 16, "#ef4444", "#fde047"), presente(117, 24, 12, 18, "#22c55e", "#fff"), presente(131, 26, 13, 16, "#3b82f6", "#fde047"),
  presente(141, 28, 12, 14, "#fde047", "#ef4444"), presente(100, 13, 22, 13, "#a855f7", "#fff"), presente(126, 10, 15, 14, "#ef4444", "#fff"),
];
const etiqueta = (x, y, texto, fundo = "#fde047", cor = "#111") => `<path d="M${x} ${y} h${texto.length * 5 + 7} l5 6 -5 6 h-${texto.length * 5 + 7} z" fill="${fundo}" stroke="#fff" stroke-width="1"/>`
  + `<text x="${x + (texto.length * 5 + 7) / 2}" y="${y + 9}" font-size="7.5" font-weight="900" fill="${cor}" text-anchor="middle">${texto}</text>`;
const ETIQUETAS = [
  etiqueta(96, 30, "%"), etiqueta(112, 28, "-50%", "#ef4444", "#fff"), etiqueta(134, 30, "%"),
  etiqueta(100, 17, "-30%"), etiqueta(124, 16, "-70%", "#fff", "#111"), etiqueta(118, 5, "BF", "#111", "#fde047"),
];

const CARRINHOS = {
  // Carrinho do logo: cesta amarela; os produtos ficam atrás dela e aparecem por cima
  logo: {
    mao: [75, 28],
    desenho: () => `${caindoNoCarrinho(PRODUTOS, 0, 0)}
      <g transform="translate(70 18) scale(.75)">
        <path d="M6 12 H22 L36 72 H96" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M27 26 H110 L100 60 H35 Z" fill="#fbbf24" stroke="#fff" stroke-width="9" stroke-linejoin="round"/>
      </g>`,
    rodas: [[103, 87], [136, 87]],
    corRoda: "#9333ea",
  },
  // Carrinho de supermercado de grade: os produtos aparecem por dentro
  grade: {
    mao: [70, 30],
    desenho: () => `${caindoNoCarrinho(PRODUTOS, 2, 18, 0.9)}${grade("rgba(255,255,255,.12)", "#fff")}`,
    rodas: [[98, 84], [138, 84]],
    corRoda: "#ef4444",
  },
  // Cestinha de mão com rodinhas
  cestinha: {
    mao: [73, 40],
    desenho: () => `${caindoNoCarrinho(PRODUTOS, 22, 36, 0.66)}
      <path d="M90 50 q17 -26 34 0" fill="none" stroke="#fff" stroke-width="2.5"/>
      <path d="M73 40 L84 50" stroke="#fff" stroke-width="3.5" stroke-linecap="round"/>
      <path d="M84 50 H130 L125 72 H89 Z" fill="#f472b6" stroke="#fff" stroke-width="3" stroke-linejoin="round"/>
      <path d="M86 58 H128 M88 65 H127" stroke="#fff" stroke-width="1.2" opacity=".7"/>`,
    rodas: [[95, 82], [120, 82]],
    corRoda: "#f472b6",
  },
  // Carrinho de corrida, com chamas saindo de trás
  corrida: {
    mao: [72, 34],
    desenho: () => `${caindoNoCarrinho(PRODUTOS, -6, 16, 0.85)}
      <g class="anim-chama"><path d="M82 66 q-10 -2 -16 2 q6 0 9 3 q-7 1 -11 5 q9 -2 18 -4z" fill="#f97316"/><path d="M82 67 q-6 0 -9 2 q4 0 6 2 q-4 1 -6 3 q6 -1 9 -3z" fill="#fde047"/></g>
      <path d="M72 34 L84 50" stroke="#fff" stroke-width="3.5" stroke-linecap="round"/>
      <path d="M82 50 H146 Q158 52 160 66 H84 Z" fill="#ef4444" stroke="#fff" stroke-width="3" stroke-linejoin="round"/>
      <path d="M86 58 H152" stroke="#fff" stroke-width="2.5"/>
      <circle cx="120" cy="58" r="6" fill="#fff"/><text x="120" y="61" font-size="8" font-weight="900" fill="#ef4444" text-anchor="middle">1</text>`,
    rodas: [[96, 76], [146, 76]],
    corRoda: "#111827",
  },
  // Carrinho foguete, soltando fumacinha
  foguete: {
    mao: [72, 34],
    desenho: () => `${caindoNoCarrinho(PRODUTOS, 2, 12, 0.85)}
      <g class="anim-fumaca" fill="rgba(255,255,255,.75)"><circle cx="74" cy="66" r="4"/><circle cx="66" cy="70" r="3"/><circle cx="59" cy="66" r="2.2"/></g>
      <path d="M72 34 L84 48" stroke="#fff" stroke-width="3.5" stroke-linecap="round"/>
      <path d="M82 48 H138 Q160 52 164 60 Q160 68 138 72 H82 Z" fill="#e5e7eb" stroke="#fff" stroke-width="3" stroke-linejoin="round"/>
      <path d="M150 50 Q160 54 164 60 Q160 66 150 70 Z" fill="#ef4444"/>
      <circle cx="132" cy="60" r="5" fill="#38bdf8" stroke="#6d28d9" stroke-width="2"/>
      <path d="M90 48 L82 38 H96 L102 48 Z M90 72 L82 82 H96 L102 72 Z" fill="#6d28d9"/>
      <path d="M82 52 q-6 8 0 16" fill="none" stroke="#f97316" stroke-width="3" stroke-linecap="round"/>`,
    rodas: [[106, 80], [140, 80]],
    corRoda: "#6d28d9",
  },
  // Carrinho de supermercado cheio de presentes (Natal)
  presentes: {
    mao: [70, 30],
    desenho: () => `${caindoNoCarrinho(PRESENTES, 2, 18, 0.9)}${grade("rgba(255,255,255,.12)", "#fff")}`,
    rodas: [[98, 84], [138, 84]],
    corRoda: "#22c55e",
  },
  // Carrinho preto com etiquetas de desconto (Black Friday)
  blackfriday: {
    mao: [70, 30],
    desenho: () => `${caindoNoCarrinho(ETIQUETAS, 2, 18, 0.9)}${grade("rgba(17,17,17,.75)", "#fde047")}`,
    rodas: [[98, 84], [138, 84]],
    corRoda: "#111",
  },
};

// Carrinho de grade (supermercado, presentes, Black Friday): fundo e cor dos ferros
function grade(fundo, ferro) {
  return `<g fill="none" stroke="${ferro}" stroke-linecap="round" stroke-linejoin="round">
        <path d="M80 34 H154 L146 63 H88 Z" fill="${fundo}" stroke-width="3.5"/>
        <path d="M95 34 L98 63 M110 34 L111 63 M125 34 L124 63 M140 34 L136 63 M82 44 H151 M85 54 H148" stroke-width="1.5" opacity=".8"/>
        <path d="M72 30 L80 34 M88 63 L92 72 H144 L146 63 M98 72 V77 M138 72 V77" stroke-width="3.5"/>
      </g>
      <rect x="65" y="26" width="10" height="7" rx="3.5" fill="#ef4444" transform="rotate(25 70 29.5)"/>`;
}

const estrela = (cx, cy, r) => `<path d="${Array.from({ length: 10 }, (_, i) => {
  const a = -Math.PI / 2 + (i * Math.PI) / 5;
  const raio = i % 2 ? r * 0.45 : r;
  return `${i ? "L" : "M"}${(cx + raio * Math.cos(a)).toFixed(2)} ${(cy + raio * Math.sin(a)).toFixed(2)}`;
}).join(" ")}Z" fill="#fbbf24" stroke="#b45309" stroke-width=".5"/>`;

function desenharCabeca(p) {
  const pele = PERSONAGEM_OPCOES.pele.cores[p.pele];
  const cabelo = PERSONAGEM_OPCOES.corCabelo.cores[p.corCabelo];
  const atras = {
    rabo: `<g class="anim-rabo"><path d="M36 14 c-9 1 -12 9 -9 17 c2 -5 5 -8 10 -9z" fill="${cabelo}"/><circle cx="36" cy="14" r="2.5" fill="#f472b6"/></g>`,
    // Volume de cachos em volta da cabeça (mais atrás, porque ele olha para o carrinho)
    cacheado: `<g fill="${cabelo}">${[[34, 26, 5], [33, 19, 5.5], [35, 12, 5.5], [40, 7, 5.5], [46, 5.5, 5.5], [52, 7, 5], [56.5, 11.5, 4.5]]
      .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join("")}</g>`,
    coque: `<circle cx="40" cy="6.5" r="5.5" fill="${cabelo}"/><path d="M37 10.5 q3 1.5 6 0" stroke="#f472b6" stroke-width="2" fill="none"/>`,
    black: `<circle cx="44" cy="15" r="15.5" fill="${cabelo}"/>`,
    tranca: `<g class="anim-rabo" fill="${cabelo}">${[[35, 17], [33.5, 22], [32.5, 27], [32, 32]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="3" ry="3.2"/>`).join("")}<circle cx="32" cy="35.5" r="1.8" fill="#f472b6"/></g>`,
  }[p.cabelo] || "";
  const frente = {
    curto: `<path d="M35 18 a11 11 0 0 1 22 -2 c-6 -1 -12 -4 -14 -7 c-2 4 -5 7 -8 9z" fill="${cabelo}"/>`,
    rabo: `<path d="M35 19 a11 11 0 0 1 22 -3 c-4 0 -9 -2 -12 -6 c-3 4 -6 7 -10 9z" fill="${cabelo}"/>`,
    coque: `<path d="M35 19 a11 11 0 0 1 22 -3 c-4 0 -9 -2 -12 -6 c-3 4 -6 7 -10 9z" fill="${cabelo}"/>`,
    tranca: `<path d="M35 19 a11 11 0 0 1 22 -3 c-4 0 -9 -2 -12 -6 c-3 4 -6 7 -10 9z" fill="${cabelo}"/>`,
    cacheado: `<g fill="${cabelo}">${[[37, 15, 3.5], [41, 11.5, 3.5], [46, 10.5, 3.5], [51, 11.5, 3.2], [55, 14, 2.8]]
      .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join("")}</g>`,
    black: `<path d="M35.2 17 a11 11 0 0 1 21.6 -1.5 c-6 -3 -15 -3 -21.6 1.5z" fill="${cabelo}"/>`,
    moicano: `<path d="M38 13 l1 -9 l3.5 6 l1.5 -9 l3 7.5 l2 -8 l2 8.5 l2.5 -6 l0.5 9 q-8 -3 -16 1z" fill="${cabelo}"/>`,
    // Boné roxo do site, aba virada para o carrinho
    bone: `<path d="M35 17.5 a11 11 0 0 1 22 -1 z" fill="#6d28d9"/><path d="M56 15.5 h9 q1.5 2.5 -2 3 h-8z" fill="#5b21b6"/><circle cx="46" cy="9.5" r="1.3" fill="#fde047"/><path d="M35.5 18 q-1 4 1 7" stroke="${cabelo}" stroke-width="2.5" fill="none" stroke-linecap="round"/>`,
    careca: '<path d="M40 11 q4 -3 9 -1" fill="none" stroke="#fff" stroke-width="1.2" stroke-linecap="round" opacity=".5"/>',
  }[p.cabelo] || "";
  const olhos = {
    piscadinha: '<g class="anim-olhos" fill="#1e1b4b"><path d="M41.5 20 q1.5 -1.5 3 0" fill="none" stroke="#1e1b4b" stroke-width="1.3" stroke-linecap="round"/><circle cx="50" cy="20" r="1.6"/></g>',
    rindo: '<g class="anim-olhos" fill="none" stroke="#1e1b4b" stroke-width="1.3" stroke-linecap="round"><path d="M41.5 20.5 q1.5 -2 3 0"/><path d="M48.5 20.5 q1.5 -2 3 0"/></g>',
    estrela: `<g class="anim-olhos">${estrela(43, 20, 2.9)}${estrela(50, 20, 2.9)}</g>`,
  }[p.rosto] || '<g class="anim-olhos" fill="#1e1b4b"><circle cx="43" cy="20" r="1.6"/><circle cx="50" cy="20" r="1.6"/></g>';
  const extra = {
    oculos: '<g fill="rgba(255,255,255,.25)" stroke="#1e1b4b" stroke-width="1.3"><circle cx="42.5" cy="20" r="3.3"/><circle cx="50.5" cy="20" r="3.3"/><path d="M45.8 20 H47.2" fill="none"/></g>',
    escuros: '<g fill="#111827" stroke="#111827" stroke-width="1.2"><rect x="38.8" y="17.6" width="7" height="4.6" rx="2"/><rect x="47.2" y="17.6" width="7" height="4.6" rx="2"/><path d="M45.8 19 H47.2" fill="none"/></g><path d="M40.5 18.7 l2 0" stroke="#fff" stroke-width=".9" stroke-linecap="round" opacity=".8"/>',
    barba: `<path d="M35.5 20 c1 9 6 14 10.5 14 c4.5 0 9.5 -5 10.5 -14 c-2 4 -5 5 -7 4 c-2 -1 -5 -1 -7 0 c-2 1 -5 0 -7 -4z" fill="${cabelo}"/>`,
    bigode: `<path d="M42 24.2 q2.2 -2.2 4.5 -0.6 q2.3 -1.6 4.5 0.6 q-2.3 0.4 -4.5 -0.3 q-2.2 0.7 -4.5 0.3z" fill="${cabelo}"/>`,
    sardas: `<g fill="#9a3412" opacity=".55">${[[39.8, 23], [41.2, 24.2], [39.5, 24.8], [52.3, 23], [53.6, 24.2], [51.8, 24.8]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r=".55"/>`).join("")}</g>`,
  }[p.rosto] || "";
  const bochechas = ["rabo", "coque", "tranca"].includes(p.cabelo) ? '<circle cx="41" cy="23.5" r="1.8" fill="#f472b6" opacity=".5"/><circle cx="52" cy="23.5" r="1.8" fill="#f472b6" opacity=".5"/>' : "";
  const boca = {
    barba: "",
    rindo: '<path d="M43.5 24.5 q3 4.5 6 0 z" fill="#7c2d12"/><path d="M44.6 26.2 q1.9 1.5 3.8 0" fill="#f472b6"/>',
    lingua: '<path d="M44 25 q2.5 1.8 5 0" fill="none" stroke="#7c2d12" stroke-width="1.4" stroke-linecap="round"/><path d="M45.6 25.8 q1 3.2 2.2 0" fill="#f472b6" stroke="#be185d" stroke-width=".5"/>',
  }[p.rosto] ?? '<path d="M44 25 q2.5 1.8 5 0" fill="none" stroke="#7c2d12" stroke-width="1.4" stroke-linecap="round"/>';
  const acessorio = {
    fone: '<path d="M36.5 17 a10 10 0 0 1 18.5 -6" fill="none" stroke="#1e1b4b" stroke-width="2.2" stroke-linecap="round"/><rect x="33.6" y="15.5" width="5" height="8.5" rx="2.2" fill="#6d28d9" stroke="#1e1b4b" stroke-width=".8"/>',
    gorro: '<path d="M35 15 q10 -16 23 -2 q-2 -9 -10 -10 q-9 -1 -13 12z" fill="#ef4444"/><path d="M35 15 q11.5 -4 23 -2" stroke="#fff" stroke-width="3.2" fill="none" stroke-linecap="round"/><circle cx="34" cy="7" r="2.6" fill="#fff"/><path d="M49 3.5 q-9 -1 -15 3.5" stroke="#ef4444" stroke-width="3" fill="none" stroke-linecap="round"/>',
  }[p.acessorio] || "";
  return `<g class="anim-cabeca">${atras}<circle cx="46" cy="19" r="11" fill="${pele}"/>${frente}${olhos}${bochechas}${boca}${extra}${acessorio}</g>`;
}

function desenharPersonagem(p) {
  p = { ...PERSONAGEM_PADRAO, ...p };
  const pele = PERSONAGEM_OPCOES.pele.cores[p.pele];
  const roupa = PERSONAGEM_OPCOES.roupa.cores[p.roupa];
  const carrinho = CARRINHOS[p.carrinho] || CARRINHOS.logo;
  const [mx, my] = carrinho.mao;
  const patins = p.jeito === "patins"
    ? '<path d="M41 95 H55" stroke="#ef4444" stroke-width="3" stroke-linecap="round"/><circle cx="43.5" cy="97.8" r="1.8" fill="#fde047"/><circle cx="52.5" cy="97.8" r="1.8" fill="#fde047"/>' : "";
  const perna = (cor, fase) => `<g class="anim-perna" style="--fase:${fase}"><path d="M45 62 V90" stroke="${cor}" stroke-width="7" stroke-linecap="round"/><path d="M44 92 H52" stroke="#fff" stroke-width="5" stroke-linecap="round"/>${patins}</g>`;
  const roda = ([x, y]) => `<g class="anim-roda"><circle cx="${x}" cy="${y}" r="7" fill="#fff"/><path d="M${x} ${y - 5.5} V${y + 5.5} M${x - 5.5} ${y} H${x + 5.5}" stroke="${carrinho.corRoda}" stroke-width="2"/></g>`;
  const mochila = p.acessorio === "mochila"
    ? '<rect x="28.5" y="34" width="10" height="20" rx="4" fill="#8b5cf6" stroke="#fff" stroke-width="1.2"/><path d="M30 44 h7" stroke="#fff" stroke-width="1.2"/>' : "";
  const sacola = p.acessorio === "sacola"
    ? `<g transform="translate(${mx - 8} ${my + 2})"><path d="M2 4 q4 -6 8 0" fill="none" stroke="#fff" stroke-width="1.4"/><path d="M0 4 H12 L11 18 H1 Z" fill="#fde047" stroke="#fff" stroke-width="1.2"/><path d="M4 10 h4" stroke="#6d28d9" stroke-width="1.5" stroke-linecap="round"/></g>` : "";
  return `<div class="anim-andando anim-${p.jeito}"><svg viewBox="0 0 165 100" aria-hidden="true">
  <g class="anim-vento" stroke="rgba(255,255,255,.7)" stroke-width="3" stroke-linecap="round">
    <path d="M2 50 H22"/><path d="M8 66 H26"/><path d="M0 82 H18"/>
  </g>
  <g class="anim-corpo">
    ${perna("#1e1b4b", "0s")}
    <path d="M50 39 L${mx} ${my + 1}" stroke="${escurecer(pele)}" stroke-width="5" stroke-linecap="round"/>
    ${mochila}
    <rect x="36" y="31" width="19" height="33" rx="8" fill="${roupa}"/>
    ${perna("#312e81", "-.25s")}
    <path d="M47 38 L${mx} ${my}" stroke="${pele}" stroke-width="5" stroke-linecap="round"/>
    ${desenharCabeca(p)}
    ${carrinho.desenho()}
    ${sacola}
  </g>
  ${carrinho.rodas.map(roda).join("")}
</svg></div>`;
}

// O personagem escolhido na conta; sem escolha, um dos prontos, sorteado a cada busca
const personagemDaVez = () => conta.usuario?.personagem || PERSONAGENS_PRONTOS[Math.floor(Math.random() * PERSONAGENS_PRONTOS.length)];

function desenharResumoBuscando() {
  const cat = navegandoCategoria();
  const animacao = el("div", { class: "anim-buscando" });
  animacao.innerHTML = desenharPersonagem(personagemDaVez());
  $("#resumo").replaceChildren(el("div", {}, el("h1", {}, el("span", {}, "Buscando "), cat ? `${cat.nome}…` : `“${estado.q}”…`), el("p", {}, "Estamos buscando os melhores preços e ofertas para você 🛒")), animacao);
}

async function buscar(q) {
  const pedido = ++estado.pedido;
  // Buscou o nome de uma loja que não é marca ("kabum", "efacil", "cobasi"): abre direto a página dela (pedido do
  // Giovanni, 04/11/2026; "kabum" trazia peças de robô aspirador da marca). Loja que é marca ("motorola") busca normal
  if (!lojaAtual() && !categoriaAtual()) {
    const lojaBuscada = lojaDoNome(q, await carregarLojasParceiras());
    if (pedido !== estado.pedido) return;
    if (lojaBuscada && !lojaBuscada.marca && !lojaBuscada.soLink) {
      history.replaceState(null, "", `/?loja=${encodeURIComponent(lojaBuscada.id)}`);
      return mostrar();
    }
  }
  estado.q = q;
  mostrarLojaNaBusca(q, pedido);
  estado.foraDaCategoria = null;
  estado.lojasDesmarcadas.clear();
  zerarSecoes();
  $("#com-acessorios").checked = false;
  preencherBusca();

  // Tira os dados e botões da busca anterior enquanto a nova carrega (senão dá para clicar neles)
  estado.ofertas = [];
  estado.buscando = true;
  desenharResumoBuscando();
  $("#total").textContent = "";
  $("#filtro-lojas").replaceChildren();
  $("#caixa-secoes").hidden = true;
  $("#caixa-marcas").hidden = true;
  $("#vazio").hidden = true;
  $("#grade").replaceChildren(...esqueletos(8));
  $("#escolha-rapida").hidden = true;
  estado.temMaisBusca = false;
  $("#mais-resultados").hidden = true;
  $("#ver-acessorios").hidden = true;
  desenharBotaoFrete();

  try {
    const dados = await consultarApi(q);
    if (pedido !== estado.pedido) return; // chegou resposta de uma busca antiga
    estado.buscando = false;
    $("#aviso-teste").hidden = !dados.exemplo;
    estado.ofertas = semRepetidos(dados.ofertas);
    // O servidor corrigiu um erro de digitação ("eletrolux" -> "electrolux"): o endereço e a caixa passam a mostrar o certo
    estado.sugestao = dados.sugestao || null;
    estado.corrigidaDe = null;
    if (dados.q && normalizar(dados.q) !== normalizar(q)) {
      // Só hífen/espaço ("microondas" -> "micro-ondas", 05/11/2026): não é erro de digitação, não avisa "Corrigimos"
      estado.corrigidaDe = normalizar(dados.q).replace(/[\s-]/g, "") === normalizar(q).replace(/[\s-]/g, "") ? null : q;
      estado.q = dados.q;
      const params = new URLSearchParams(location.search);
      params.set("q", dados.q);
      history.replaceState(null, "", `?${params}`);
      preencherBusca();
    }
    // Nada na categoria: o servidor buscou em tudo, e as próximas páginas também são de tudo
    if (dados.foraDaCategoria) { estado.foraDaCategoria = estado.cat; estado.cat = null; }
    // Buscou dentro de uma categoria: começa mostrando só ela (as outras ficam para marcar).
    // Só se a categoria tiver boa parte dos produtos buscados: "batedeira" em Automotivo mostrava 2 itens sem
    // relação, e "batedeira de bolo" em Bebês, 1 de 111 (o resto estava em Eletroportáteis)
    const exatos = estado.ofertas.filter((o) => o.bate && !o.acessorio);
    const naCategoria = exatos.filter((o) => o.secao === estado.cat).length;
    if (estado.cat && !navegandoCategoria() && naCategoria && naCategoria >= exatos.length * 0.3) estado.secoesSo = new Set([estado.cat]);
    // Busca normal: começa só com as categorias do que foi buscado ("placa de video" = Informática); as outras ficam
    // desmarcadas em "Categorias nos resultados" (pedido do Giovanni, 19/10/2026)
    else if (!estado.cat) estado.secoesSo = categoriasDaBusca();
    estado.maisBusca = dados.mais;
    estado.temMaisBusca = Boolean(dados.mais);
    estado.completando = estado.temMaisBusca; // a "Escolha rápida" só aparece depois dos lotes automáticos
    // Buscou o nome de uma loja e nenhum produto tem esse nome no título: abre direto os produtos da loja
    // (replaceState: o "voltar" não cai de novo na busca vazia). "kabum" trazia 15 peças "parecidas" (print 04/11/2026):
    // vale também quando nada bate de verdade
    if (!estado.ofertas.some((o) => o.bate && !o.acessorio) && !lojaAtual()) {
      const loja = lojaDoNome(q, await carregarLojasParceiras());
      if (loja && !loja.soLink && pedido === estado.pedido) {
        history.replaceState(null, "", `/?loja=${encodeURIComponent(loja.id)}`);
        mostrar();
        return;
      }
    }
    desenharFiltroLojas();
    desenharResultados();
    completarSozinho(pedido);
  } catch (erro) {
    if (pedido !== estado.pedido) return;
    estado.buscando = false;
    estado.ofertas = [];
    $("#grade").replaceChildren();
    $("#escolha-rapida").hidden = true;
    $("#vazio").hidden = true; // o "Ops!" do topo já explica
    $("#resumo").replaceChildren(el("div", {}, el("h1", {}, "Ops! Não conseguimos buscar agora"), el("p", {}, "Verifique sua conexão e tente de novo.")));
  }
}

// ---------------------------------------------------------------------
// Cupons (pedido do Giovanni, 24/10/2026): cupons oficiais das lojas parceiras (/api/cupons, hoje da Lomadee).
// Janela "🎟️ Cupons de desconto" com código, validade, "Copiar" e o link da loja (com comissão); nos cartões das lojas
// que têm cupom, um selo "🎟️ Cupom" abre a janela só com os cupons dela. Nada inventado: texto e código são da loja.
// ---------------------------------------------------------------------
const cuponsDaLoja = (loja) => estado.cupons.filter((c) => c.loja === loja);
function botaoCupom(loja) {
  const qtd = cuponsDaLoja(loja).length;
  if (!qtd) return null;
  return el("button", { type: "button", class: "selo-cupom", title: `${qtd} ${qtd === 1 ? "cupom" : "cupons"} desta loja`,
    onclick: (e) => { e.stopPropagation(); abrirCupons(loja); } }, "🎟️ Cupom");
}

async function carregarCupons() {
  try {
    const r = await fetch("/api/cupons");
    if (!r.ok) return;
    estado.cupons = (await r.json()).cupons || [];
  } catch {
    return;
  }
  if (!estado.cupons.length) return;
  document.querySelectorAll("[data-ver-cupons]").forEach((b) => { b.hidden = false; });
  mostrarNumeros(); // o card roxo da página inicial ganha o botão dos cupons
  if (!estado.buscando) desenharResultados(); // selos "Cupom" nos cartões já desenhados
}

function abrirCupons(loja = "") {
  abrirFiltros(false);
  const janela = $("#janela-cupons");
  janela.dataset.loja = typeof loja === "string" ? loja : "";
  $("#cupons-filtro").value = "";
  desenharCupons();
  if (!janela.open) janela.showModal();
}

const validadeCupom = (iso) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
function desenharCupons() {
  const loja = $("#janela-cupons").dataset.loja;
  const filtro = limpo($("#cupons-filtro").value);
  let lista = loja ? cuponsDaLoja(loja) : estado.cupons;
  if (filtro) lista = lista.filter((c) => limpo(`${c.lojaNome} ${c.titulo} ${c.descricao || ""}`).includes(filtro));
  const lojas = new Set(estado.cupons.map((c) => c.loja)).size;
  $("#cupons-total").replaceChildren(loja
    ? el("span", {}, `Cupons de ${cuponsDaLoja(loja)[0]?.lojaNome || "esta loja"}. `,
      el("button", { type: "button", class: "botao-link", onclick: () => abrirCupons() }, "Ver cupons de todas as lojas"))
    : `${estado.cupons.length} ${estado.cupons.length === 1 ? "cupom" : "cupons"} de ${lojas} ${lojas === 1 ? "loja" : "lojas"}. Clique em “Pegar cupom”: o código aparece e a loja abre.`);
  $("#cupons-lista").replaceChildren(...(lista.length ? lista.map(itemCupom) : [el("p", { class: "vazio" }, "Nenhum cupom encontrado.")]));
}

// O código só aparece depois do clique em "Pegar cupom", que abre a loja pelo link com comissão (pedido do Giovanni,
// 24/10/2026: quem copiasse o código e fosse direto à loja compraria sem o link). O clique copia o código e marca a
// visita na loja; mesmo se a pessoa voltar à loja depois, o cookie da Lomadee já ficou no navegador.
// O código inteiro nem vem na lista (/api/cupons manda só o começo, codigoMascara): é pedido no clique (25/10/2026)
function itemCupom(c) {
  const loja = infoLoja(c);
  const codigo = c.codigoMascara && el("code", {}, c.codigoMascara);
  const aviso = el("small", { class: "cupom-aviso", hidden: true });
  // Código inteiro do cupom (pedido no clique; /api/cupons manda só o começo)
  const pedirCodigo = async () => {
    if (c.codigoInteiro) return c.codigoInteiro;
    try {
      const r = await fetch(`/api/cupons?codigo=${encodeURIComponent(c.id)}`);
      c.codigoInteiro = r.ok ? (await r.json()).codigo || null : null;
    } catch { c.codigoInteiro = null; }
    return c.codigoInteiro;
  };
  const avisar = (texto) => { aviso.textContent = texto; aviso.hidden = false; };
  // Botão "📋 Copiar" ao lado do código revelado: se a cópia automática falhar (o navegador bloqueia quando a loja
  // abre na frente), a pessoa volta e toca aqui (08/11/2026, Giovanni: "testei e não copiou")
  const copiar = el("button", { type: "button", class: "cupom-copiar", hidden: true, onclick: async () => {
    try { await navigator.clipboard.writeText(c.codigoInteiro); avisar("✓ Código copiado. Cole no carrinho da loja."); }
    catch { avisar("Selecione o código e copie: ele está destacado acima."); }
  } }, "📋 Copiar");
  const pegar = el("a", { class: "botao-oferta cupom-ir", href: c.link, target: "_blank", rel: "sponsored noopener", ...marcaClique("cupom", { ...c, id: "", titulo: "" }),
    onclick: () => {
      if (!c.codigoMascara) return;
      const promessa = pedirCodigo();
      // A cópia é pedida AGORA, ainda no clique e com o site na frente (antes a loja abria primeiro e o navegador recusava);
      // o texto chega quando o código vier do servidor
      let copiado;
      try {
        copiado = typeof ClipboardItem !== "undefined" && navigator.clipboard?.write
          ? navigator.clipboard.write([new ClipboardItem({ "text/plain": promessa.then((t) => {
            if (!t) throw new Error("sem código");
            return new Blob([t], { type: "text/plain" });
          }) })])
          : Promise.reject(new Error("sem ClipboardItem"));
      } catch (erro) { copiado = Promise.reject(erro); }
      copiado.catch(() => {}); // a falha é tratada abaixo, quando o código chegar
      promessa.then((inteiro) => {
        if (!inteiro) return avisar("Não foi possível mostrar o código agora. O desconto pode aparecer direto na loja parceira.");
        codigo.textContent = inteiro;
        codigo.parentElement.classList.add("revelado");
        copiar.hidden = false;
        copiado.then(
          () => avisar("✓ Código copiado. Cole no carrinho da loja parceira."),
          () => navigator.clipboard?.writeText(inteiro).then(
            () => avisar("✓ Código copiado. Cole no carrinho da loja parceira."),
            () => avisar("Toque em “📋 Copiar” e cole o código no carrinho da loja parceira."),
          ) ?? avisar("Toque em “📋 Copiar” e cole o código no carrinho da loja parceira."),
        );
      });
    } }, c.codigoMascara ? "🎟️ Pegar cupom e ir para a loja" : "Ativar desconto na loja →");
  return el("li", { class: "cupom" },
    el("div", { class: "cupom-topo" },
      el("span", { class: `loja-tag ${loja.tag || ""}`, style: `--cor-loja:${loja.cor}` }, el("span", { class: "loja-ponto" }), loja.nome),
      c.ate && el("small", { class: "cupom-validade" }, `Válido até ${validadeCupom(c.ate)}`)),
    el("strong", { class: "cupom-titulo" }, c.titulo),
    c.descricao && c.descricao !== c.titulo && el("p", { class: "cupom-descricao" }, c.descricao),
    el("div", { class: "cupom-acoes" },
      c.codigoMascara ? el("span", { class: "cupom-codigo" }, codigo, copiar) : el("span", { class: "cupom-sem-codigo" }, "Sem código: o desconto aparece na loja"),
      pegar),
    aviso);
}

// ---------------------------------------------------------------------
// Lojas parceiras (pedido do Giovanni, 22/10/2026): janela com todas as lojas (/api/lojas) e, em cada uma,
// "Ver produtos" abre ?loja=<id> com os produtos só dela (Shopee/AliExpress: mais vendidos; Awin: do banco,
// com desconto primeiro; Lomadee: os da marca)
// ---------------------------------------------------------------------
let lojasParceiras = null;
const corDaLoja = (l) => LOJAS[l.id]?.cor || corPorNome(l.nome) || "#6d28d9";

async function abrirLojas() {
  abrirFiltros(false);
  const janela = $("#janela-lojas");
  $("#lojas-filtro").value = "";
  janela.showModal();
  if (!lojasParceiras) {
    try {
      const r = await fetch("/api/lojas");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      lojasParceiras = (await r.json()).lojas || [];
    } catch {
      $("#lojas-total").textContent = "Não foi possível carregar as lojas agora. Tente de novo em instantes.";
      return;
    }
  }
  desenharListaLojas();
}

function desenharListaLojas() {
  const filtro = limpo($("#lojas-filtro").value);
  const todas = lojasParceiras || [];
  const lista = filtro ? todas.filter((l) => limpo(l.nome).includes(filtro)) : todas;
  $("#lojas-total").textContent = `${todas.length} lojas com produtos no Vai pro Carrinho. Veja os produtos de cada uma aqui ou vá direto ao site da loja.`;
  const linha = (l) => el("li", { class: "lp-linha", style: `--cor-loja:${corDaLoja(l)}` },
    el("span", { class: "loja-ponto" }),
    el("span", { class: "lp-nome" }, l.nome,
      el("small", {}, l.soLink ? "Compre direto no site da loja" : l.rede === "marketplace" ? "Milhões de produtos" : l.produtos ? (l.produtosMais ? `Mais de ${Math.max(Math.floor(l.produtos / 10) * 10, 10)} produtos`
        : `${l.produtos.toLocaleString("pt-BR")} ${l.produtos === 1 ? "produto" : "produtos"}`) : "",
        l.internacional ? " · 🌎 Internacional" : ""),
      botaoCupomLoja(l)),
    el("div", { class: "lp-botoes" },
      // Loja só com link (Shein, lib/shein.js): sem produtos no site, só o "Ir para a loja"
      l.soLink ? null : el("button", { type: "button", class: "botao-secundario", onclick: () => { $("#janela-lojas").close(); irParaLoja(l.id); } }, "Ver produtos"),
      // Site da loja pelo link com comissão (/api/ir-loja): vale qualquer compra feita lá dentro do prazo do cookie
      el("a", { class: "botao-oferta lp-ir", href: `/api/ir-loja?id=${encodeURIComponent(l.id)}`, target: "_blank", rel: "sponsored noopener",
        ...marcaClique("loja-parceira", { lojaNome: l.nome }) },
        "Ir para a loja →")));
  const grandes = lista.filter((l) => l.rede === "marketplace");
  const outras = lista.filter((l) => l.rede !== "marketplace");
  $("#lojas-lista").replaceChildren(
    ...(grandes.length ? [el("h3", {}, "Marketplaces"), el("ul", {}, ...grandes.map(linha))] : []),
    ...(outras.length ? [el("h3", {}, "Lojas e marcas"), el("ul", {}, ...outras.map(linha))] : []),
    ...(lista.length ? [] : [el("p", { class: "vazio" }, "Nenhuma loja com esse nome.")]));
}

// Na janela de lojas, as lojas com cupom ganham o selo (Lomadee: pelo nome; Awin: pela chave "awin:<loja>")
function botaoCupomLoja(l) {
  if (l.rede !== "lomadee" && l.rede !== "awin") return null;
  const c = estado.cupons.find((x) => (l.rede === "awin" ? `awin:${x.loja}` === l.id : x.lojaNome === l.nome));
  return c ? botaoCupom(c.loja) : null;
}

// Busca pelo nome de uma loja parceira (04/11/2026, Giovanni: "quando busco pela marca não aparece nada"): os títulos
// dos produtos não trazem o nome da loja ("lauri esporte", "efacil" davam 0). Acima dos resultados aparece a loja com
// "Ver produtos da loja". Não troca a busca: "motorola" continua mostrando os Motorola de todas as lojas
async function carregarLojasParceiras() {
  if (!lojasParceiras) {
    try {
      const r = await fetch("/api/lojas");
      if (!r.ok) return [];
      lojasParceiras = (await r.json()).lojas || [];
    } catch {
      return [];
    }
  }
  return lojasParceiras;
}
// "boticario" = oBoticario, "lauri" = Lauri Esporte, "monte carlo" = Monte Carlo Jóias
function casaComNome(q, nomeLoja) {
  const buscado = limpo(q).replace(/ /g, "");
  const nome = limpo(nomeLoja).replace(/ /g, "");
  if (buscado.length < 4 || !nome) return false;
  return nome === buscado || (buscado.length >= 5 && (nome.startsWith(buscado) || nome.endsWith(buscado)));
}
// Lojas para a lista de sugestões enquanto digita: o nome (ou uma palavra dele) começa com o digitado ("kab" = Kabum,
// "inbox" = Cama In Box); 3+ letras; no máximo 2
function lojasSugeridas(texto) {
  const digitado = limpo(texto);
  if (digitado.length < 3 || !lojasParceiras) return [];
  const junto = digitado.replace(/ /g, "");
  return lojasParceiras.filter((l) => {
    const nome = limpo(l.nome);
    return nome.startsWith(digitado) || nome.replace(/ /g, "").startsWith(junto)
      || (digitado.length >= 4 && nome.split(" ").some((p) => p.startsWith(digitado)));
  }).slice(0, 2);
}
function lojaDoNome(q, lojas) {
  // Shopee e AliExpress não (buscar "shopee" mostra produtos); Mercado Livre sim: abre os mais vendidos dele (05/11/2026)
  // Shein (só link): a faixa com "Ir para a loja" aparece, mas a busca continua normal (não há página da loja)
  return lojas.find((l) => (l.rede !== "marketplace" || l.id === "mercadolivre" || l.soLink) && casaComNome(q, l.nome)) || null;
}
async function mostrarLojaNaBusca(q, pedido) {
  const caixa = $("#loja-na-busca");
  caixa.hidden = true;
  desenharCampanhasShein("campanhas-shein-busca", naBlackFriday());
  if (lojaAtual() || naBlackFriday()) return;
  const loja = lojaDoNome(q, await carregarLojasParceiras());
  if (pedido !== estado.pedido || lojaAtual()) return;
  if (loja?.id === "shein") desenharCampanhasShein("campanhas-shein-busca", true);
  if (!loja) return;
  caixa.style.setProperty("--cor-loja", corDaLoja(loja));
  caixa.replaceChildren(
    el("span", { class: "loja-ponto" }),
    el("div", { class: "lnb-texto" }, el("strong", {}, loja.nome),
      el("small", {}, loja.soLink ? "Loja parceira: compre direto no site dela" : "Loja parceira do Vai pro Carrinho")),
    el("div", { class: "lnb-botoes" },
      loja.soLink ? null : el("button", { type: "button", class: "botao-secundario", onclick: () => irParaLoja(loja.id) }, "Ver produtos da loja"),
      el("a", { class: "lnb-ir", href: `/api/ir-loja?id=${encodeURIComponent(loja.id)}`, target: "_blank", rel: "sponsored noopener",
        ...marcaClique("loja-parceira", { lojaNome: loja.nome }) }, "Ir para a loja →")));
  caixa.hidden = false;
}

// Ofertas da Shein (08/11/2026): cartões das campanhas (lib/shein.js, /api/shein) na página inicial, na Black Friday e na busca
// por "shein". Cada cartão leva à campanha pelo link de afiliado do Giovanni; some sozinho quando a campanha acaba
let campanhasShein = null;
async function carregarCampanhasShein() {
  if (!campanhasShein) {
    campanhasShein = fetch("/api/shein").then((r) => (r.ok ? r.json() : { campanhas: [] })).then((d) => d.campanhas || []).catch(() => []);
  }
  return campanhasShein;
}
async function desenharCampanhasShein(id, mostrar) {
  const caixa = $(`#${id}`);
  if (!mostrar) { caixa.hidden = true; return; }
  if (!caixa.hidden && caixa.childElementCount) return; // já na tela (a lista da busca é redesenhada várias vezes)
  const lista = await carregarCampanhasShein();
  if (!lista.length) { caixa.hidden = true; return; }
  const prazo = (c) => (c.diasRestantes == null ? "Campanha da Shein" : c.diasRestantes <= 0 ? "Termina hoje"
    : c.diasRestantes === 1 ? "Termina amanhã" : `Termina em ${c.diasRestantes} dias`);
  caixa.replaceChildren(
    el("h3", {}, el("span", { class: "selo-shein" }, "SHEIN"), "Ofertas da Shein"),
    el("div", { class: "campanhas-lista" }, ...lista.map((c) => el("a", {
      class: "campanha", href: c.link, target: "_blank", rel: "sponsored noopener",
      ...marcaClique("campanha-shein", { loja: "shein", titulo: c.titulo }) },
    el("span", { class: "ce", "aria-hidden": "true" }, c.emoji || "🛍️"),
    el("span", { class: "ct" }, el("strong", {}, c.titulo), c.detalhe ? el("small", {}, c.detalhe) : null,
      el("small", {}, prazo(c)), el("span", { class: "cir" }, "Ver na Shein →"))))));
  caixa.hidden = false;
}

// Ofertas da Shein também nas buscas e categorias de moda, beleza e acessórios (08/11/2026, a Shein é forte nisso; nas
// de eletrônicos, casa etc. a faixa fica escondida). A categoria da busca vem dos produtos que chegaram (categoriasDaBusca)
const CATEGORIAS_SHEIN = new Set(["Moda feminina", "Moda masculina", "Moda infantil", "Moda íntima", "Moda fitness", "Calçados",
  "Bolsas e mochilas", "Joias e bijuterias", "Óculos", "Bonés e chapéus", "Relógios", "Maquiagem", "Skincare", "Cabelo", "Decoração"]);
function sheinNaBusca() {
  if (!estado.q || estado.loja || naBlackFriday()) return;
  const cats = estado.cat ? new Set([estado.cat]) : categoriasDaBusca();
  const deModa = Boolean(cats && [...cats].some((c) => CATEGORIAS_SHEIN.has(c)));
  if (deModa || /\bshein\b/i.test(estado.q)) desenharCampanhasShein("campanhas-shein-busca", true);
  else $("#campanhas-shein-busca").hidden = true;
}

function irParaLoja(id) {
  history.pushState(null, "", `/?loja=${encodeURIComponent(id)}`);
  window.scrollTo({ top: 0, behavior: "smooth" });
  mostrar();
}

const nomeDaLojaVista = () => estado.loja?.nome || lojasParceiras?.find((l) => l.id === estado.loja?.id)?.nome || "loja";

function desenharResumoLoja(lista) {
  if (estado.loja.id === BLACK_FRIDAY) return desenharResumoBlackFriday(lista);
  const total = estado.ofertas.length;
  // Lojas da Awin: o total do catálogo vem da lista de lojas (o site carrega 48 por vez)
  const doCatalogo = estado.loja.total || lojasParceiras?.find((l) => l.id === estado.loja.id)?.produtos || 0;
  $("#resumo").replaceChildren(el("div", {},
    el("h1", {}, `🏬 ${nomeDaLojaVista()}`),
    el("p", {}, lista.length
      ? (doCatalogo > total
        ? `Mostrando ${lista.length} de ${doCatalogo.toLocaleString("pt-BR")} produtos desta loja`
        : `${lista.length} ${lista.length === 1 ? "produto" : "produtos"}${lista.length < total ? ` de ${total}` : ""} desta loja`)
      : total ? "Nenhum produto com esses filtros"
        : "Esta loja ainda não enviou a lista de produtos dela para a nossa rede de parceiros. Volte em breve!"),
    atalhosDaLoja(),
    el("small", { class: "resumo-lojas-nota" },
      el("button", { type: "button", class: "botao-link-claro", onclick: abrirLojas }, "Ver outras lojas parceiras"), " ", AVISO_CUPOM),
    el("div", { class: "resumo-acoes" }, botaoLimparFiltros())));
}

// Atalhos de categoria da loja Mercado Livre (pedido do Giovanni, 05/11/2026): as categorias do ML com quantos mais
// vendidos cada uma tem; tocar filtra a loja (?mlcat=); "Tudo" volta
function atalhosDaLoja() {
  const atalhos = estado.loja?.atalhos;
  if (!atalhos?.length) return null;
  const ir = (cat) => {
    history.pushState(null, "", `/?loja=${encodeURIComponent(estado.loja.id)}${cat ? `&mlcat=${encodeURIComponent(cat)}` : ""}`);
    mostrar();
  };
  const chip = (cat, nome, n) => el("button", { type: "button", class: "chip-atalho-loja", "aria-pressed": String((estado.loja.cat || null) === cat),
    onclick: () => ir(cat) }, nome, n ? el("span", { class: "qtd" }, n.toLocaleString("pt-BR")) : null);
  const faixa = el("div", { class: "atalhos-loja", role: "group", "aria-label": "Categorias da loja" },
    chip(null, "Tudo", 0), ...atalhos.map((a) => chip(a.id, a.nome, a.n)));
  // Celular: a faixa rola de lado; o atalho escolhido fica à vista (no meio)
  requestAnimationFrame(() => {
    const ativo = faixa.querySelector('[aria-pressed="true"]');
    if (ativo && faixa.scrollWidth > faixa.clientWidth) faixa.scrollLeft = ativo.offsetLeft - faixa.clientWidth / 2 + ativo.offsetWidth / 2;
  });
  return faixa;
}

// ---------------------------------------------------------------------
// Black Friday (pedido do Giovanni, 24/10/2026): vaiprocarrinho.com.br/black-friday mostra só descontos que dá para
// conferir (lib/blackfriday.js, montada toda madrugada a partir das buscas do robô). Funciona como a página de uma
// loja (mostrarLoja), com o id BLACK_FRIDAY. Sem contagem regressiva falsa: a data é a da Black Friday de verdade.
// ---------------------------------------------------------------------
const BLACK_FRIDAY = "black-friday";
const DIA_BLACK_FRIDAY = new Date("2026-11-27T00:00:00-03:00");
const naBlackFriday = () => /^\/black-friday\/?$/i.test(location.pathname);

function irParaBlackFriday() {
  history.pushState(null, "", "/black-friday");
  window.scrollTo({ top: 0, behavior: "smooth" });
  mostrar();
}

function contagemBlackFriday() {
  const dias = Math.ceil((DIA_BLACK_FRIDAY - Date.now()) / 864e5);
  if (dias > 1) return `Faltam ${dias} dias para a Black Friday (27/11).`;
  if (dias === 1) return "A Black Friday é amanhã (27/11)!";
  if (dias > -4) return "É Black Friday! 🖤";
  return "";
}

function desenharResumoBlackFriday(lista) {
  const t = estado.loja.totais || {};
  // Sem filtro, conta todas as ofertas da página (07/11/2026: dizia "216 ofertas", só as já carregadas, de ~9.500)
  const total = (t.real || 0) + (t.baixou || 0) + (t.loja || 0);
  const qtd = lista.length === estado.ofertas.length && total > lista.length ? `Mais de ${total.toLocaleString("pt-BR")}` : lista.length;
  const legenda = (texto, qtd) => el("span", { class: "bf-legenda" }, texto, qtd ? el("span", { class: "qtd" }, qtd) : "");
  $("#resumo").replaceChildren(el("div", {},
    el("h1", {}, "🖤 Black Friday de verdade"),
    el("p", {}, contagemBlackFriday(), " ", lista.length
      ? `${qtd} ${lista.length === 1 ? "oferta" : "ofertas"} com desconto que dá para conferir.`
      : estado.ofertas.length ? "Nenhuma oferta com esses filtros." : "As ofertas aparecem aqui assim que o nosso robô conferir os preços. Volte amanhã!"),
    el("p", { class: "bf-explica" }, "Aqui só entra desconto de verdade: acompanhamos o preço de cada produto todos os dias. ",
      "Se a loja subiu o preço antes para depois dar “desconto”, o produto não aparece."),
    el("div", { class: "bf-legendas" },
      legenda("✅ Desconto real: abaixo do preço de costume dos últimos 30 dias", t.real),
      legenda("📉 Baixou: o preço caiu nos últimos dias", t.baixou),
      legenda("🏷️ Desconto da loja: ainda em acompanhamento", t.loja)),
    el("small", { class: "resumo-lojas-nota" }, "🔔 Toque no sininho de um produto e avisamos quando o preço baixar. ",
      estado.cupons.length ? el("button", { type: "button", class: "botao-link-claro", onclick: () => abrirCupons() }, `🎟️ Ver ${estado.cupons.length} cupons de desconto`) : ""),
    el("div", { class: "resumo-acoes" }, botaoLimparFiltros())));
}

async function pedirLoja(id, pagina) {
  const cat = estado.loja?.id === id && estado.loja?.cat ? `&mlcat=${encodeURIComponent(estado.loja.cat)}` : "";
  const r = await fetch(id === BLACK_FRIDAY ? `/api/black-friday?pagina=${pagina}` : `/api/lojas?id=${encodeURIComponent(id)}&pagina=${pagina}${cat}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function mostrarLoja(id) {
  const pedido = ++estado.pedido;
  estado.q = "";
  // Loja Mercado Livre: atalho de categoria escolhido (?mlcat=MLB1051; 05/11/2026)
  const mlcat = new URLSearchParams(location.search).get("mlcat");
  estado.loja = { id, nome: id === BLACK_FRIDAY ? "Black Friday" : lojasParceiras?.find((l) => l.id === id)?.nome || null,
    cat: id === "mercadolivre" && /^MLB\d+$/.test(mlcat || "") ? mlcat : null };
  estado.paginaLoja = 1;
  estado.lojasDesmarcadas.clear();
  zerarSecoes();
  estado.ofertas = [];
  estado.buscando = true;
  $("#loja-na-busca").hidden = true;
  desenharCampanhasShein("campanhas-shein-busca", id === BLACK_FRIDAY); // Ofertas da Shein também na Black Friday
  document.querySelectorAll("[data-busca] input").forEach((i) => { i.value = ""; });
  document.title = `${estado.loja.nome || "Loja parceira"} — Vai pro Carrinho`;
  $("#resumo").replaceChildren(id === BLACK_FRIDAY
    ? el("div", {}, el("h1", {}, "🖤 Black Friday de verdade"), el("p", {}, "Buscando os descontos conferidos 🛒"))
    : el("div", {}, el("h1", {}, `🏬 ${estado.loja.nome || "Carregando loja"}…`), el("p", {}, "Buscando os produtos desta loja 🛒")));
  $("#total").textContent = "";
  $("#caixa-secoes").hidden = true;
  $("#caixa-marcas").hidden = true;
  $("#caixa-lojas").hidden = true;
  $("#vazio").hidden = true;
  $("#grade").replaceChildren(...esqueletos(8));
  $("#escolha-rapida").hidden = true;
  $("#mais-resultados").hidden = true;
  $("#ver-acessorios").hidden = true;
  try {
    const dados = await pedirLoja(id, 1);
    if (pedido !== estado.pedido) return;
    estado.buscando = false;
    estado.loja.nome = dados.nome || estado.loja.nome;
    if (estado.loja.nome) { nomesDeLojas[id] = estado.loja.nome; marcarCategoria(); }
    estado.loja.totais = dados.totais;
    if (dados.atalhos) { estado.loja.atalhos = dados.atalhos; estado.loja.total = dados.total; }
    document.title = id === BLACK_FRIDAY ? "Black Friday de verdade — Vai pro Carrinho" : `${estado.loja.nome} — Vai pro Carrinho`;
    estado.ofertas = semRepetidos(dados.ofertas || []);
    estado.temMaisBusca = Boolean(dados.temMais);
    desenharFiltroLojas();
    desenharResultados();
    if (!estado.ofertas.length) $("#vazio").hidden = true; // o card de cima já explica
    completarLoja(pedido);
  } catch {
    if (pedido !== estado.pedido) return;
    estado.buscando = false;
    $("#grade").replaceChildren();
    $("#resumo").replaceChildren(el("div", {}, el("h1", {}, "Ops! Não conseguimos abrir esta loja agora"),
      el("p", {}, "Tente de novo em instantes ou ", el("button", { type: "button", class: "botao-link-claro", onclick: abrirLojas }, "escolha outra loja"), ".")));
  }
}

// A loja chega de 48 em 48: o site pede as próximas sozinho até uns 200 produtos, como na busca
// (pergunta do Giovanni, 28/10/2026: "ao escolher uma loja só carrega 40 produtos")
// Loja Mercado Livre: o dobro (05/11/2026, Giovanni: "quero que apareçam mais opções de produtos"; são ~3.800 mais vendidos)
async function completarLoja(pedido) {
  const ml = estado.loja?.id === "mercadolivre";
  for (let i = 0; i < PEDIDOS_AUTOMATICOS * (ml ? 3 : 1); i++) {
    if (pedido !== estado.pedido || !estado.temMaisBusca) return;
    if (estado.ofertas.length >= PRODUTOS_DESEJADOS * (ml ? 2.5 : 1)) return;
    await carregarMaisDaLoja({ sozinho: true });
  }
}

async function carregarMaisDaLoja({ sozinho = false } = {}) {
  const botao = $("#mais-resultados");
  const pedido = estado.pedido;
  const id = estado.loja.id;
  botao.disabled = true;
  botao.textContent = "Carregando…";
  try {
    const dados = await pedirLoja(id, estado.paginaLoja + 1);
    if (pedido !== estado.pedido || estado.loja?.id !== id) return;
    const antes = estado.ofertas.length;
    estado.ofertas = semRepetidos([...estado.ofertas, ...(dados.ofertas || [])]);
    estado.paginaLoja += 1;
    estado.temMaisBusca = Boolean(dados.temMais && estado.ofertas.length > antes);
    desenharFiltroLojas();
    desenharResultados();
  } catch {
    if (pedido === estado.pedido && !sozinho) toast("Não foi possível carregar mais produtos agora");
  } finally {
    botao.disabled = false;
    botao.textContent = "Ver mais resultados";
  }
}

// ---------------------------------------------------------------------
// Página inicial
// ---------------------------------------------------------------------
function desenharInicio(lista) {
  const idVendido = idMaisVendido(lista);
  if (!lista.length) {
    desenharAosPoucos($("#destaques"), [], null);
    $("#destaques").replaceChildren(estado.ofertas.length
      ? el("div", { class: "vazio" }, el("p", {}, "Nenhuma oferta do dia com esses filtros."),
        el("button", { type: "button", class: "botao-secundario", style: "width: auto; margin-top: 12px", onclick: limparFiltros }, "✕ Limpar filtros"))
      : el("p", { class: "vazio" }, "Nenhuma oferta do dia agora."));
  } else {
    desenharAosPoucos($("#destaques"), lista, (o) => {
      const c = cartaoOferta(o, { maisVendido: o.id === idVendido });
      // Ao carregar mais, só os cartões novos "surgem"; os que já estavam ficam parados
      if (estado.vistosInicio.has(o.id)) c.style.animation = "none";
      estado.vistosInicio.add(o.id);
      return c;
    });
  }
  $("#mais-ofertas").hidden = !estado.temMaisInicio;
}

// "⭐ Bem avaliados" nas "Ofertas do dia" (29/10/2026, Giovanni: só 39): só a Shopee manda nota, então o site pede mais
// páginas sozinho até ter uns 100 produtos com nota boa (as 6 primeiras páginas ficam prontas no servidor)
const BEM_AVALIADOS_DESEJADOS = 100;
const PAGINAS_BEM_AVALIADOS = 6;
async function completarBemAvaliados() {
  for (let i = 0; i < PAGINAS_BEM_AVALIADOS; i++) {
    if (estado.q || estado.loja || !estado.inicio || !estado.temMaisInicio || !$("#bem-avaliados").checked) return;
    if (estado.inicio.filter((o) => o.avaliacao >= NOTA_BOA).length >= BEM_AVALIADOS_DESEJADOS) return;
    if (!(await carregarMaisOfertas())) return;
  }
}

// "Ver mais ofertas": traz a próxima página de mais vendidos e junta à lista (devolve true se carregou)
let carregandoOfertas = null;
function carregarMaisOfertas() {
  carregandoOfertas ||= trazerMaisOfertas().finally(() => { carregandoOfertas = null; });
  return carregandoOfertas;
}
async function trazerMaisOfertas() {
  const botao = $("#mais-ofertas");
  // Com "Frete grátis" marcado, o "Ver mais" traz as próximas ofertas do dia com frete grátis (ver pedirFreteGratis)
  if ($("#so-frete").checked && !estado.q && (freteInicio.lista.length || freteInicio.temMais)) {
    botao.disabled = true;
    botao.textContent = "Carregando…";
    try {
      if (!freteInicio.lista.length) await pedirFreteGratis();
      juntarFreteNoInicio();
      return true;
    } finally {
      botao.disabled = false;
      botao.textContent = "Ver mais ofertas";
    }
  }
  botao.disabled = true;
  botao.textContent = "Carregando…";
  try {
    const dados = await consultarApi("", `pagina=${estado.paginaInicio + 1}`);
    const antes = estado.inicio.length;
    estado.inicio = semRepetidos([...estado.inicio, ...dados.ofertas]);
    estado.paginaInicio += 1;
    estado.temMaisInicio = Boolean(dados.temMais && estado.inicio.length > antes);
    // Só redesenha se o visitante continua no início (pode ter ido para uma busca)
    if (!estado.q && !$("#inicio").hidden) {
      estado.ofertas = estado.inicio;
      desenharFiltroLojas();
      desenharResultados();
    }
    return true;
  } catch {
    if (!estado.q) toast("Não foi possível carregar mais ofertas agora");
    return false;
  } finally {
    botao.disabled = false;
    botao.textContent = "Ver mais ofertas";
  }
}

// "Ver mais resultados": traz a próxima página da busca (Shopee) e junta à lista
// A busca chega aos poucos: o servidor responde com as primeiras páginas de cada loja (em poucos segundos)
// e o site pede as próximas sozinho, até ter uns 100 produtos (sem contar acessórios)
const PRODUTOS_DESEJADOS = 200; // 26/10/2026: era 100 (categorias abriam com ~110 produtos)
const PEDIDOS_AUTOMATICOS = 3;
async function completarSozinho(pedido) {
  // A "Escolha rápida" espera os lotes automáticos chegarem (senão o "mais barato" trocava sozinho segundos depois;
  // print do Giovanni, 26/10/2026)
  estado.completando = true;
  try {
    for (let i = 0; i < PEDIDOS_AUTOMATICOS; i++) {
      if (pedido !== estado.pedido || !estado.temMaisBusca) return;
      if (estado.ofertas.filter((o) => !o.acessorio).length >= PRODUTOS_DESEJADOS) return;
      await carregarMaisResultados({ sozinho: true });
    }
  } finally {
    if (pedido === estado.pedido) {
      estado.completando = false;
      if (!estado.buscando) desenharEscolhaRapida(filtrar());
    }
  }
}

async function carregarMaisResultados({ sozinho = false } = {}) {
  if (!sozinho) estado.cargasManuais = (estado.cargasManuais || 0) + 1;
  const botao = $("#mais-resultados");
  const pedido = estado.pedido;
  const q = estado.q;
  botao.disabled = true;
  botao.textContent = "Carregando…";
  try {
    const dados = await consultarApi(q, estado.maisBusca);
    // O visitante já fez outra busca ou voltou para o início: a resposta não vale mais
    if (pedido !== estado.pedido || estado.q !== q) return;
    const antes = estado.ofertas.length;
    const todas = semRepetidos([...estado.ofertas, ...dados.ofertas]);
    estado.maisBusca = dados.mais;
    estado.temMaisBusca = Boolean(dados.mais && todas.length > antes);
    // Produtos que começam pelo que foi buscado ("Console PS5 …") na frente, depois os outros, acessórios (escondidos) no fim.
    // 05/11/2026 (rolagem infinita): os que já estavam na tela ficam no mesmo lugar e os novos entram DEPOIS deles; antes a
    // lista toda era reordenada a cada página e produtos novos entravam no meio (a tela pulava)
    const ordenar = (l) => [...l.filter((o) => o.principal), ...l.filter((o) => !o.principal && !o.acessorio)];
    const jaNaTela = todas.slice(0, antes);
    const novas = todas.slice(antes);
    estado.ofertas = [...jaNaTela.filter((o) => !o.acessorio), ...ordenar(novas), ...todas.filter((o) => o.acessorio)];
    desenharFiltroLojas();
    desenharResultados();
  } catch {
    if (pedido === estado.pedido && !sozinho) toast("Não foi possível carregar mais resultados agora");
  } finally {
    botao.disabled = false;
    botao.textContent = "Ver mais resultados";
  }
}

function mostrarInicio() {
  estado.pedido++; // busca que ainda está carregando não pode mais desenhar nada
  desenharCampanhasShein("campanhas-shein", true);
  estado.q = "";
  estado.lojasDesmarcadas.clear();
  zerarSecoes();
  if (estado.inicio) {
    estado.ofertas = estado.inicio;
    desenharFiltroLojas();
    desenharResultados();
  } else {
    carregarDestaques();
  }
}

// "Aqui você encontra milhões de produtos de mais de 120 lojas": números de verdade, vindos de /api/numeros
// (lojas parceiras ativas agora, arredondadas para baixo). Sem resposta, a frase não aparece.
async function mostrarNumeros() {
  try {
    const r = await fetch("/api/numeros");
    if (!r.ok) return;
    const { lojas, lojasArredondado, marketplaces } = await r.json();
    if (!lojas || lojas < 2) return;
    const qtdLojas = lojasArredondado < lojas ? `mais de ${lojasArredondado} lojas` : `${lojas} lojas`;
    const produtos = marketplaces ? "milhões de produtos" : "produtos";
    document.querySelectorAll("[data-numeros]").forEach((e) => { e.textContent = `${produtos[0].toUpperCase()}${produtos.slice(1)} de ${qtdLojas}`; e.hidden = false; });
    const inicio = $("#numeros-inicio");
    inicio.replaceChildren("🛒 Aqui você encontra ", el("strong", {}, produtos), " de ", el("strong", {}, qtdLojas),
      " e compara os preços num só lugar.", el("small", { class: "aviso-cupom" }, AVISO_CUPOM),
      el("span", { class: "botoes-inicio" },
        el("button", { type: "button", class: "botao-cupons-inicio botao-bf", onclick: irParaBlackFriday }, "🖤 Black Friday de verdade"),
        estado.cupons.length ? el("button", { type: "button", class: "botao-cupons-inicio", onclick: () => abrirCupons() },
          `🎟️ Ver ${estado.cupons.length} cupons de desconto`) : ""));
    inicio.hidden = false;
    // Filtro de lojas: deixa claro que ali só estão as lojas da lista atual, não todas as parceiras
    const nota = $("#nota-lojas");
    nota.textContent = `Temos ${qtdLojas} parceiras; aqui aparecem as que têm ofertas nesta lista.`;
    estado.qtdParceiras = qtdLojas;
    nota.hidden = false;
  } catch {
    // sem a frase
  }
}
mostrarNumeros();

// Enquanto as ofertas carregam (a 1ª abertura leva alguns segundos), o título diz que está buscando
// Título fixo (08/11/2026, pedido do Giovanni: ao abrir aparecia rápido "🔍 Buscando ofertas do dia…"); enquanto carrega,
// os cartões cinza (esqueletos) já mostram que as ofertas estão chegando
function tituloOfertas() {
  const h2 = $("#titulo-ofertas");
  h2.classList.remove("carregando");
  if (h2.textContent !== "⚡ Ofertas do dia") h2.replaceChildren("⚡ Ofertas do dia");
}

// Últimas "Ofertas do dia" vistas neste aparelho: aparecem na hora na próxima abertura e são trocadas pelas novas assim
// que chegam (o visitante não fica olhando "Buscando…"). Valem 12 h; preço e link são os mesmos da loja naquela hora
const GUARDA_INICIO = "ofertasDoDia";
const VALIDADE_INICIO_GUARDADO = 12 * 3600e3;
function inicioGuardado() {
  try {
    const g = JSON.parse(localStorage.getItem(GUARDA_INICIO) || "null");
    return g && Date.now() - g.quando < VALIDADE_INICIO_GUARDADO && Array.isArray(g.ofertas) && g.ofertas.length ? g.ofertas : null;
  } catch {
    return null;
  }
}
function guardarInicio(ofertas) {
  try {
    localStorage.setItem(GUARDA_INICIO, JSON.stringify({ quando: Date.now(), ofertas: ofertas.slice(0, 300) }));
  } catch {
    // sem armazenamento (aba anônima, cheio): só não guarda
  }
}

// Páginas 2 a 6 das Ofertas do dia (prontas no servidor, PAGINAS_INICIO_PRONTAS em buscar.js) pedidas juntas, logo
// depois da 1ª: a página inicial já abre com ~250 ofertas e o "Bem avaliados" não precisa esperar (pedido do Giovanni,
// 30/10/2026). Devolve { ofertas, ultima, temMais } ou null.
const PAGINAS_INICIO_JUNTAS = 6;
async function paginasSeguintes() {
  const paginas = await Promise.all(Array.from({ length: PAGINAS_INICIO_JUNTAS - 1 }, (_, i) =>
    fetch(enderecoBusca("", null, `&pagina=${i + 2}`)).then((r) => (r.ok ? r.json() : null)).catch(() => null)));
  const ofertas = [];
  let ultima = 1, temMais = true;
  for (const [i, d] of paginas.entries()) {
    if (!d?.ofertas?.length) break;
    ofertas.push(...d.ofertas);
    ultima = i + 2;
    temMais = Boolean(d.temMais);
  }
  return ofertas.length ? { ofertas, ultima, temMais } : null;
}
async function completarInicio(pedido) {
  const seguintes = await paginasSeguintes();
  // Se a pessoa saiu do início ou já clicou em "Ver mais ofertas", deixa como está
  if (!seguintes || pedido !== estado.pedido || estado.paginaInicio !== 1) return;
  estado.inicio = semRepetidos([...estado.inicio, ...seguintes.ofertas]);
  estado.paginaInicio = seguintes.ultima;
  estado.temMaisInicio = seguintes.temMais;
  guardarInicio(estado.inicio);
  if (!estado.q && !$("#inicio").hidden) {
    estado.ofertas = estado.inicio;
    desenharFiltroLojas();
    desenharResultados();
  }
}

async function pedirInicio() {
  const adiantado = inicioAdiantado && (await inicioAdiantado);
  inicioAdiantado = null;
  if (adiantado) return adiantado;
  try {
    return await consultarApi("");
  } catch {
    // Falhou (rede do celular, servidor acordando): tenta mais uma vez antes de desistir
    await new Promise((ok) => setTimeout(ok, 1500));
    return consultarApi("");
  }
}

async function carregarDestaques() {
  const pedido = ++estado.pedido;
  if (!freteInicio.pagina && !freteInicio.pedido) pedirFreteGratis().then(() => { if (naPaginaInicial()) desenharBotaoFrete(); });
  estado.ofertas = [];
  $("#filtro-lojas").replaceChildren();
  const guardado = inicioGuardado();
  if (guardado) {
    estado.inicio = semRepetidos(guardado);
    estado.ofertas = estado.inicio;
    desenharFiltroLojas();
    desenharResultados();
  } else {
    $("#destaques").replaceChildren(...esqueletos(12));
    tituloOfertas(true);
  }
  try {
    const dados = await pedirInicio();
    // Com as guardadas na tela, espera as páginas seguintes e troca tudo de uma vez (sem a lista encolher e crescer)
    const seguintes = guardado && dados.temMais ? await paginasSeguintes() : null;
    estado.inicio = semRepetidos([...dados.ofertas, ...(seguintes?.ofertas || [])]);
    estado.paginaInicio = seguintes?.ultima || 1;
    estado.temMaisInicio = Boolean(seguintes ? seguintes.temMais : dados.temMais);
    guardarInicio(estado.inicio);
    tituloOfertas(false);
    if (pedido !== estado.pedido) return; // a pessoa já foi para uma busca
    $("#aviso-teste").hidden = !dados.exemplo;
    mostrarInicio();
    if (!seguintes) completarInicio(estado.pedido); // mostrarInicio() trocou o número do pedido
  } catch {
    tituloOfertas(false);
    if (pedido !== estado.pedido || guardado) return; // com as guardadas na tela, fica com elas
    $("#destaques").replaceChildren(el("p", { class: "vazio" }, "Não foi possível carregar as ofertas agora."));
  }
}

// itens: [{ nome: "Moda masculina", busca: "roupa masculina" }] ou textos simples
function desenharEmAlta(itens) {
  $("#em-alta").replaceChildren(el("button", { class: "chip-alta chip-bf", type: "button", onclick: irParaBlackFriday }, "🖤 Black Friday"), ...itens.map((i) => {
    const { nome, busca } = typeof i === "string" ? { nome: i, busca: i } : i;
    return el("button", { class: "chip-alta", type: "button", onclick: () => irPara(busca, { atalho: true, cat: categoriaPeloNome(nome)?.nome }) }, nome);
  }));
}

// Mais buscados no Mercado Livre (10/11/2026): cartões com a foto de um produto do ML e o preço "a partir de"; o toque abre a busca
function desenharBuscadosML(cartoes) {
  const caixa = $("#buscados-ml");
  if (!caixa) return;
  const maiuscula = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  $("#chips-ml").replaceChildren(...cartoes.map((c, i) => el("button", { class: "cartao-ml", type: "button",
    onclick: () => irPara(c.termo, { atalho: true }) },
    el("span", { class: "cartao-ml-foto" },
      el("img", { src: c.foto, alt: "", loading: "lazy", decoding: "async", referrerpolicy: "no-referrer" }),
      el("span", { class: "chip-ml-n", "aria-hidden": "true" }, String(i + 1))),
    el("span", { class: "cartao-ml-nome" }, maiuscula(c.termo)),
    c.preco && el("span", { class: "cartao-ml-preco" }, el("small", {}, "a partir de "), `R$ ${brl(c.preco)}`))));
  caixa.hidden = cartoes.length < 4;
}

async function carregarEmAlta() {
  try {
    const { itens = [], categorias = [], ml = [] } = await (await fetch("/api/em-alta?v=12")).json();
    const maiuscula = (t) => t.charAt(0).toUpperCase() + t.slice(1);
    if (itens.length) desenharEmAlta(itens.map((i) => ({ nome: maiuscula(i.nome), busca: i.busca })));
    if (categorias.length) desenharCategorias(categorias);
    desenharBuscadosML(ml);
  } catch {
    // Ficam as listas padrão
  }
}

// Menu de categorias da barra lateral. Vem de /api/em-alta, com as categorias que
// mais vendem agora na Shopee em primeiro; as 12 primeiras aparecem, o resto em "Ver todas"
const CATEGORIAS_VISIVEIS = 12;
const FUNDOS_MENU = CATEGORIAS.map((c) => c.fundo);

// Ordem do menu de categorias escolhida pelo visitante: "vendidos" (como vem da API) ou "az"
let categoriasAtuais = [];
let ordemCategorias = "vendidos";
try { if (localStorage.getItem("ordemCategorias") === "az") ordemCategorias = "az"; } catch { /* sem armazenamento */ }

const ABAS_CELULAR = 14;
function desenharCategorias(lista = categoriasAtuais) {
  categoriasAtuais = lista;
  document.querySelectorAll("[data-ordem-cat]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.ordemCat === ordemCategorias)));
  // Em A–Z vale a ordem alfabética para todas (a fixa só fica em 1º em "Mais vendidos")
  if (ordemCategorias === "az") lista = [...lista].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  const botoes = lista.map((c, i) =>
    el("button", { class: "cat-item", type: "button", "data-nome": c.nome,
      style: `--fundo-cat:${FUNDOS_MENU[i % FUNDOS_MENU.length]}`,
      onclick: () => { abrirFiltros(false); irPara(c.busca || c.nome, { atalho: true, cat: c.nome }); } },
      el("span", { class: "cat-icone", "aria-hidden": "true" }, c.emoji), c.nome));
  const caixa = $("#categorias");
  caixa.classList.remove("todas");
  const verTodas = lista.length > CATEGORIAS_VISIVEIS && el("button", { class: "cat-ver-todas", type: "button",
    onclick: (e) => {
      const todas = caixa.classList.toggle("todas");
      e.currentTarget.textContent = todas ? "Ver menos ▲" : `Ver todas (${lista.length}) ▼`;
    } }, `Ver todas (${lista.length}) ▼`);
  caixa.replaceChildren(...botoes, ...(verTodas ? [verTodas] : []));
  // Celular: abas que deslizam no topo ("Tudo" + as categorias que mais vendem), como no app do Mercado Livre
  $("#abas-cel").replaceChildren(
    el("button", { class: "aba-cel", type: "button", "data-tudo": "1", onclick: voltarAoInicio }, "Tudo"),
    ...categoriasAtuais.slice(0, ABAS_CELULAR).map((c) => el("button", { class: "aba-cel", type: "button", "data-nome": c.nome,
      onclick: () => irPara(c.busca || c.nome, { atalho: true, cat: c.nome }) }, c.nome)));
  marcarCategoria();
  if (estado.q && !$("#resultados").hidden) {
    // Link aberto direto (?q=perfume&cat=Perfumes): só agora dá para saber o título da categoria
    preencherBusca();
    if (estado.buscando) desenharResumoBuscando();
    else if (estado.ofertas.length) desenharResumo(filtrar());
  }
}

const categoriaPeloNome = (nome) => (nome ? categoriasAtuais.find((c) => c.nome === nome) : null);

// Categoria escolhida no menu: ?cat= no endereço (o clique na categoria sempre põe o cat).
// Digitar "perfume" sem categoria é uma busca comum, e não a vitrine de Perfumes
function categoriaAtual() {
  const params = new URLSearchParams(location.search);
  if (!(params.get("q") || "").trim() || params.get("loja")) return null;
  return params.get("cat") || null;
}

// Loja aberta (?loja=, com ou sem busca): a busca é feita só nela (pedido do Giovanni, 28/10/2026).
// Sem loja escolhida, a busca segue o site todo. A Black Friday não é loja
function lojaAtual() {
  if (naBlackFriday()) return null;
  return (new URLSearchParams(location.search).get("loja") || "").trim().slice(0, 120) || null;
}
const nomesDeLojas = {};
const nomeDaLoja = (id) => nomesDeLojas[id] || lojasParceiras?.find((l) => l.id === id)?.nome || LOJAS[id]?.nome
  || estado.ofertas.find((o) => o.lojaNome)?.lojaNome || "loja";

// Visitante clicou numa categoria (e não buscou nada dentro dela): devolve a categoria
function navegandoCategoria() {
  const c = categoriaPeloNome(categoriaAtual());
  return c && estado.q && normalizar(estado.q) === normalizar(c.busca || c.nome) ? c : null;
}

// Caixa de busca: mostra o que o visitante buscou, mas fica vazia ao abrir uma categoria
function preencherBusca() {
  const cat = navegandoCategoria();
  document.querySelectorAll("[data-busca] input").forEach((i) => { i.value = cat ? "" : estado.q; });
  document.title = `${cat ? cat.nome : estado.q} — Vai pro Carrinho`;
}

// Destaca no menu a categoria que está sendo vista e avisa na caixa de busca
// No celular os exemplos ("air fryer…") eram cortados: lá fica só o começo (pedido do Giovanni)
const PLACEHOLDER_BUSCA = $("[data-busca] input").placeholder;
const PLACEHOLDER_CURTO = "Busque e compare preços";
const telaPequena = matchMedia("(max-width: 640px)");
function marcarCategoria() {
  const cat = categoriaAtual();
  const loja = lojaAtual();
  document.querySelectorAll(".cat-item").forEach((b) => b.classList.toggle("ativa", b.dataset.nome === cat));
  const noInicio = !new URLSearchParams(location.search).get("q") && !loja && !naBlackFriday();
  $("[data-bb=inicio]")?.classList.toggle("ativa", noInicio);
  document.querySelectorAll(".aba-cel").forEach((b) => {
    const ativa = b.dataset.tudo ? noInicio : b.dataset.nome === cat;
    b.classList.toggle("ativa", ativa);
    if (ativa && b.scrollIntoView && b.offsetParent) b.scrollIntoView({ block: "nearest", inline: "center" });
  });
  const padrao = telaPequena.matches ? PLACEHOLDER_CURTO : PLACEHOLDER_BUSCA;
  const onde = loja ? nomeDaLoja(loja) : cat;
  document.querySelectorAll("[data-busca] input").forEach((i) => { i.placeholder = onde ? `Buscar em ${onde}…` : padrao; });
}
marcarCategoria();
telaPequena.addEventListener("change", marcarCategoria);

document.querySelectorAll("[data-ordem-cat]").forEach((b) => b.addEventListener("click", () => {
  ordemCategorias = b.dataset.ordemCat;
  try { localStorage.setItem("ordemCategorias", ordemCategorias); } catch { /* sem armazenamento */ }
  const todas = $("#categorias").classList.contains("todas");
  desenharCategorias();
  if (todas) $(".cat-ver-todas")?.click();
}));

function montarInicio() {
  desenharEmAlta(EM_ALTA);
  desenharCategorias(CATEGORIAS);
  carregarEmAlta();
}

// ---------------------------------------------------------------------
// Navegação: ?q=... na barra de endereço (o botão Voltar funciona)
// ---------------------------------------------------------------------

function mostrar() {
  const q = (new URLSearchParams(location.search).get("q") || "").trim();
  const loja = (new URLSearchParams(location.search).get("loja") || "").trim();
  estado.exato = new URLSearchParams(location.search).has("exato");
  estado.loja = null;
  $("#loja-na-busca").hidden = true; // atalho da loja buscada: só na busca normal (buscar() mostra de novo)
  const blackFriday = !q && !loja && naBlackFriday();
  if (blackFriday || (loja && !q)) {
    document.body.classList.remove("modo-inicio");
    $("#inicio").hidden = true;
    $("#resultados").hidden = false;
    estado.cat = null;
    marcarCategoria();
    return mostrarLoja(blackFriday ? BLACK_FRIDAY : loja);
  }
  const emBusca = Boolean(q);
  document.body.classList.toggle("modo-inicio", !emBusca);
  $("#inicio").hidden = emBusca;
  $("#resultados").hidden = !emBusca;
  marcarCategoria();
  estado.cat = categoriaAtual();
  if (emBusca) {
    buscar(q);
  } else {
    document.title = "Vai pro Carrinho — Compare preços e economize";
    document.querySelectorAll("[data-busca] input").forEach((i) => { i.value = ""; });
    mostrarInicio();
  }
}

// atalho = clique em "em alta" ou categoria: não conta como busca feita pelo visitante
// cat = buscar dentro dessa categoria do menu ("invictus" em Perfumes)
// loja = buscar só nessa loja (página da loja aberta)
function irPara(q, { atalho = false, cat = null, exato = false, loja = null } = {}) {
  q = (q || "").trim();
  estado.atalho = atalho;
  const onde = loja ? `&loja=${encodeURIComponent(loja)}` : cat ? `&cat=${encodeURIComponent(cat)}` : "";
  const url = q ? `/?q=${encodeURIComponent(q)}${onde}${exato ? "&exato=1" : ""}` : "/";
  history.pushState(null, "", url);
  window.scrollTo({ top: 0, behavior: "smooth" });
  mostrar();
}

// ---------------------------------------------------------------------
// Caixa de busca com sugestões
// ---------------------------------------------------------------------
const normalizar = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Sugestões enquanto digita (17/10/2026, pedido do Giovanni): entende erro de digitação ("eletrolux" -> electrolux),
// completa com marcas ("maquina de lavar ele" -> "maquina de lavar electrolux") e com os termos mais buscados no site.
// O vocabulário vem uma vez de /api/vocabulario (lib/vocabulario.js); a busca em si também corrige no servidor.
const limpo = (s) => normalizar(String(s || "")).replace(/[^a-z0-9]+/g, " ").trim();
const VAZIAS_SUGESTAO = new Set(["de", "do", "da", "dos", "das", "para", "com", "e", "a", "o"]);
const vocab = { termos: SUGESTOES, marcas: [], erros: {}, pedido: false, aoChegar: [] };
function prepararVocabulario() {
  vocab.itens = vocab.termos.map((t) => ({ t, n: limpo(t), p: limpo(t).split(" ") }));
  vocab.marcasN = vocab.marcas.map((m) => ({ m, n: limpo(m) }));
}
prepararVocabulario();
function carregarVocabulario() {
  if (vocab.pedido) return;
  vocab.pedido = true;
  fetch("/api/vocabulario?v=12").then((r) => (r.ok ? r.json() : null)).then((d) => {
    if (!d?.termos?.length) return;
    Object.assign(vocab, { termos: d.termos, marcas: d.marcas || [], erros: d.erros || {} });
    prepararVocabulario();
    vocab.aoChegar.forEach((f) => f());
  }).catch(() => {});
}

// Mesma conta do servidor (lib/vocabulario.js): letra trocada, faltando, sobrando ou invertida = 1
function distancia(a, b, limite = 2) {
  if (Math.abs(a.length - b.length) > limite) return limite + 1;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}
// Marca curta não aceita erro ("nivel" não é "nivea"); 7 ou 8 letras, 1; 9 ou mais, 2
const toleranciaMarca = (m) => (m.length >= 9 ? 2 : m.length >= 7 ? 1 : 0);
function corrigirPalavra(p) {
  if (vocab.erros[p]) return vocab.erros[p];
  if (p.length < 6 || /\d/.test(p) || vocab.marcasN.some((x) => x.n === p)) return null;
  const achada = vocab.marcasN.find((x) => !x.n.includes(" ") && x.n[0] === p[0] && toleranciaMarca(x.n)
    && distancia(p, x.n, toleranciaMarca(x.n)) <= toleranciaMarca(x.n));
  return achada ? achada.n : null;
}
const bateInteira = (p, w) => w === p || w === `${p}s` || p === `${w}s` || (p.length >= 6 && distancia(p, w, 1) <= 1);
// Começo de palavra com 1 letra errada: 4+ letras ("geladeria"), ou 3 depois de outras palavras ("air fra" -> air fryer)
// (a palavra do vocabulário tem que ser pelo menos do tamanho do digitado: "dew" não é "de")
const bateComeco = (u, w, minimo = 4) => w.startsWith(u)
  || (u.length >= minimo && w.length >= u.length && distancia(u, w.slice(0, u.length), 1) <= 1);

function sugerir(texto) {
  const bruto = texto.replace(/^\s+/, "");
  const originais = bruto.trim().split(/\s+/).filter(Boolean);
  if (!originais.length) return [];
  const terminou = /\s$/.test(bruto);
  // Cada palavra digitada já corrigida ("eletrolux" -> "electrolux"); fica do jeito digitado se não tiver erro
  const corrigidas = originais.map((o) => corrigirPalavra(limpo(o)) || o.toLowerCase());
  // A correção pode virar duas palavras ("airfrayer" -> "air fryer")
  const partes = limpo(corrigidas.join(" ")).split(" ");
  const completas = (terminou ? partes : partes.slice(0, -1)).filter((p) => p && !VAZIAS_SUGESTAO.has(p));
  const ultima = terminou ? "" : limpo(originais.at(-1));
  const ultimaCerta = terminou ? "" : partes.at(-1);
  const digitado = limpo(bruto);
  const saida = [];
  const vistos = new Set();
  const incluir = (s) => { const k = limpo(s); if (k && k !== digitado && !vistos.has(k) && vistos.add(k)) saida.push(s); };

  // 1) O que foi digitado, corrigido ("maquina de lavar eletrolux" -> "maquina de lavar electrolux")
  const corrigido = corrigidas.join(" ");
  if (limpo(corrigido) !== digitado) incluir(corrigido);

  // 2) Termos do vocabulário com todas as palavras digitadas (a última pode estar pela metade);
  //    os que começam igual ao digitado vêm primeiro, depois a ordem do vocabulário (mais buscados primeiro)
  const achados = [];
  // "de/da/para…" depois de outra palavra só bate a palavra inteira ("furadeira de" não é "furadeira dewalt")
  const ligacao = VAZIAS_SUGESTAO.has(ultima) && originais.length > 1;
  for (const item of vocab.itens) {
    if (!completas.every((p) => item.p.some((w) => bateInteira(p, w)))) continue;
    const minimo = completas.length ? 3 : 4;
    if (ligacao && !item.p.includes(ultima)) continue;
    if (ultima && !ligacao && !item.p.some((w) => bateComeco(ultima, w, minimo) || bateComeco(ultimaCerta, w, minimo))) continue;
    achados.push({ t: item.t, comeca: item.n.startsWith(limpo(corrigido)) || item.n.startsWith(digitado) });
  }
  const primeiro = achados.filter((a) => a.comeca);
  primeiro.slice(0, 5).forEach((a) => incluir(a.t));

  // 3) Marca no fim: "maquina de lavar ele" -> "maquina de lavar electrolux"; sozinha: "sams" -> "samsung"
  // Com produto antes, só marca que tem esse produto nas sugestões "produto + marca" do robô (print 31/10: "geladeira
  // bravecto", marca de remédio para pet). Sem nenhuma, não sugere marca (a busca dá 0 ofertas).
  const temProduto = (x) => !completas.length
    || vocab.itens.some((i) => ` ${i.n} `.includes(` ${x.n} `) && completas.every((p) => i.p.some((w) => bateInteira(p, w))));
  // ("jogo de" não vira "jogo dewalt", mas "notebook de" vira "notebook dell")
  if (ultima) {
    const antes = corrigidas.slice(0, -1).join(" ");
    vocab.marcasN
      .filter((x) => x.n.startsWith(ultima) || x.n === ultimaCerta || (ultima.length >= 4 && bateComeco(ultima, x.n)))
      .filter(temProduto)
      .slice(0, 4)
      .forEach((x) => incluir(antes ? `${antes} ${x.m}` : x.m));
  }
  achados.filter((a) => !a.comeca).forEach((a) => incluir(a.t));
  return saida.slice(0, 8);
}

// Destaca o pedaço já digitado, se a sugestão começa por ele
function textoSugestao(s, digitado) {
  const n = limpo(digitado);
  if (!n || !limpo(s).startsWith(n)) return el("span", {}, s);
  // Acha onde o digitado termina na sugestão (acentos e hífens contam como letras)
  let fim = 0;
  while (fim < s.length && limpo(s.slice(0, fim)).length < n.length) fim++;
  return el("span", {}, el("mark", {}, s.slice(0, fim)), s.slice(fim));
}

let contadorBuscas = 0;
function prepararBusca(form) {
  const input = $("input", form);
  const lista = $(".sugestoes", form);
  let itens = [];
  let ativo = -1;

  // Leitor de tela: a caixa é um "combobox" e anuncia a sugestão marcada pelas setas
  const idLista = lista.id || `sugestoes-${++contadorBuscas}`;
  lista.id = idLista;
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-controls", idLista);
  input.setAttribute("aria-expanded", "false");

  const fechar = () => {
    lista.hidden = true;
    ativo = -1;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
  };

  const marcar = () => {
    [...lista.children].forEach((li, i) => li.setAttribute("aria-selected", i === ativo));
    if (ativo >= 0) input.setAttribute("aria-activedescendant", `${idLista}-${ativo}`);
    else input.removeAttribute("aria-activedescendant");
  };

  // Loja escolhida na lista: abre a página dela
  const abrirLojaSugerida = (l) => { input.value = ""; fechar(); input.blur(); irParaLoja(l.id); };
  function desenhar() {
    if (document.activeElement !== input) return;
    // Lojas parceiras primeiro (pedido do Giovanni, 04/11/2026: "quando digitar o nome da loja, mostrar na lista com
    // ícone de loja"); dentro de uma loja aberta, não
    const lojas = lojaAtual() ? [] : lojasSugeridas(input.value).map((l) => ({ loja: l }));
    itens = [...lojas, ...sugerir(input.value)].slice(0, 8);
    if (!itens.length) return fechar();
    lista.replaceChildren(...itens.map((s, n) => (s.loja
      ? el("li", {
        role: "option", id: `${idLista}-${n}`, "aria-selected": "false", class: "sug-loja",
        onmousedown: (e) => { e.preventDefault(); abrirLojaSugerida(s.loja); },
      }, textoSugestao(s.loja.nome, input.value), el("small", {}, "Loja parceira"))
      : el("li", {
        role: "option", id: `${idLista}-${n}`, "aria-selected": "false",
        onmouseenter: () => adiantarBusca(s, categoriaAtual()),
        onmousedown: (e) => { e.preventDefault(); input.value = s; fechar(); irPara(s, { cat: categoriaAtual(), loja: lojaAtual() }); },
      }, textoSugestao(s, input.value)))));
    ativo = -1;
    lista.hidden = false;
    input.setAttribute("aria-expanded", "true");
    input.removeAttribute("aria-activedescendant");
  }

  // Parou de digitar: adianta a 1ª sugestão (se for o que está escrito, melhor ainda)
  let timerAdiantar;
  input.addEventListener("input", () => {
    desenhar();
    clearTimeout(timerAdiantar);
    const primeira = itens.find((i) => typeof i === "string");
    timerAdiantar = setTimeout(() => { if (document.activeElement === input && primeira) adiantarBusca(primeira, categoriaAtual()); }, 600);
  });
  input.addEventListener("focus", carregarVocabulario);
  // Lista de lojas para as sugestões: chegou depois de começar a digitar, desenha de novo
  input.addEventListener("focus", () => { if (!lojasParceiras) carregarLojasParceiras().then(() => { if (input.value.trim()) desenhar(); }); });
  vocab.aoChegar.push(() => { if (input.value.trim()) desenhar(); });
  input.addEventListener("blur", fechar);
  input.addEventListener("keydown", (e) => {
    if (lista.hidden) return;
    const adiantar = () => { if (typeof itens[ativo] === "string") adiantarBusca(itens[ativo], categoriaAtual()); };
    if (e.key === "ArrowDown") { ativo = (ativo + 1) % itens.length; marcar(); adiantar(); e.preventDefault(); }
    else if (e.key === "ArrowUp") { ativo = (ativo - 1 + itens.length) % itens.length; marcar(); adiantar(); e.preventDefault(); }
    else if (e.key === "Escape") fechar();
    else if (e.key === "Enter" && ativo >= 0 && itens[ativo]?.loja) { e.preventDefault(); abrirLojaSugerida(itens[ativo].loja); }
    else if (e.key === "Enter" && ativo >= 0) { input.value = itens[ativo]; }
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    fechar();
    input.blur();
    // Busca vazia: volta para as "Ofertas do dia" (como clicar no logo)
    if (!input.value.trim()) return irPara("");
    irPara(input.value, { cat: categoriaAtual(), loja: lojaAtual() });
  });
}

// ---------------------------------------------------------------------
// Filtros no celular (gaveta que sobe da parte de baixo)
// ---------------------------------------------------------------------
function abrirFiltros(abrir) {
  const gaveta = $("#filtros");
  const estavaAberta = gaveta.classList.contains("aberto");
  gaveta.classList.toggle("aberto", abrir);
  $("#painel-fundo").hidden = !abrir && $("#painel-favoritos").hidden;
  if (abrir && !estavaAberta) focarAoAbrir(gaveta, $(".filtros-cabecalho .fechar", gaveta));
  else if (!abrir && estavaAberta) devolverFoco(gaveta);
}

// ---------------------------------------------------------------------
// Início
// ---------------------------------------------------------------------
// A barra lateral gruda logo abaixo do cabeçalho (que muda de altura no celular)
new ResizeObserver(() => document.documentElement.style.setProperty("--altura-topo", `${$("#topo").offsetHeight}px`)).observe($("#topo"));
document.querySelectorAll("[data-busca]").forEach(prepararBusca);
// Logo: volta ao começo de tudo (sem busca, sem categoria, filtros e ordem zerados)
function voltarAoInicio(e) {
  e?.preventDefault();
  zerarFiltros();
  $("input[name=ordem][value=relevancia]").checked = true;
  document.querySelectorAll("[data-busca] input").forEach((i) => { i.value = ""; });
  irPara("");
}
document.querySelectorAll("[data-inicio]").forEach((a) => a.addEventListener("click", voltarAoInicio));
// Celular: atalhos da página inicial e barra de baixo (molde do app do Mercado Livre)
document.querySelectorAll("[data-atalho]").forEach((b) => b.addEventListener("click", () => {
  const atalho = b.dataset.atalho;
  if (atalho === "black-friday") return irParaBlackFriday();
  if (atalho === "avaliados") $("#bem-avaliados").checked = true;
  else $(`input[name=ordem][value=${atalho}]`).checked = true;
  $(atalho === "avaliados" ? "#bem-avaliados" : `input[name=ordem][value=${atalho}]`).dispatchEvent(new Event("change"));
  $("#titulo-ofertas").scrollIntoView({ behavior: "smooth", block: "start" });
}));
$("[data-bb-carrinho]").addEventListener("click", () => abrirPainel(true));
$("[data-bb-conta]").addEventListener("click", abrirConta);

let timerPreco;
["#preco-min", "#preco-max"].forEach((s) => $(s).addEventListener("input", () => {
  clearTimeout(timerPreco);
  timerPreco = setTimeout(desenharResultados, 300);
}));
$("#so-frete").addEventListener("change", () => { desenharResultados(); freteMarcadoNoInicio(); });
$("#bem-avaliados").addEventListener("change", () => { desenharResultados(); if ($("#bem-avaliados").checked) completarBemAvaliados(); });
// Mostrar/esconder acessórios muda também a contagem de cada loja
$("#com-acessorios").addEventListener("change", () => { desenharFiltroLojas(); desenharResultados(); });
document.querySelectorAll("[data-frete]").forEach((b) => b.addEventListener("click", () => {
  $("#so-frete").checked = !$("#so-frete").checked;
  desenharResultados();
  freteMarcadoNoInicio();
}));
$("#ver-acessorios").addEventListener("click", () => { $("#com-acessorios").checked = true; desenharFiltroLojas(); desenharResultados(); });
document.querySelectorAll("input[name=ordem], input[name=envio]").forEach((r) => r.addEventListener("change", desenharResultados));
function zerarFiltros() {
  $("#preco-min").value = "";
  $("#preco-max").value = "";
  $("#so-frete").checked = false;
  $("#bem-avaliados").checked = false;
  $("#com-acessorios").checked = false;
  $("input[name=envio][value=todos]").checked = true;
  estado.lojasDesmarcadas.clear();
  zerarSecoes();
}
// A categoria e a loja abertas também contam como filtro (pedido do Giovanni, 22/10/2026): vendo uma categoria ou uma
// loja parceira, volta à página inicial (como o logo); buscando dentro de uma categoria, refaz a busca em todas
function limparFiltros() {
  zerarFiltros();
  $("input[name=ordem][value=relevancia]").checked = true;
  // Na Black Friday, "Limpar filtros" só limpa os filtros (a página é o próprio assunto, não um filtro)
  if ((estado.loja && estado.loja.id !== BLACK_FRIDAY) || categoriaAtual()) {
    const q = estado.loja || navegandoCategoria() ? "" : estado.q;
    if (!q) document.querySelectorAll("[data-busca] input").forEach((i) => { i.value = ""; });
    return irPara(q);
  }
  desenharFiltroLojas();
  desenharResultados();
}
$("#limpar-filtros").addEventListener("click", limparFiltros);
// "Limpar filtros" do card roxo: volta à página inicial como o logo, também depois de uma busca (print do Giovanni,
// 28/10/2026: buscou "cueca boxer", clicou e nada aconteceu). O da barra lateral continua só limpando os filtros.
function limparTudo() {
  if (estado.loja?.id === BLACK_FRIDAY) return limparFiltros();
  zerarFiltros();
  $("input[name=ordem][value=relevancia]").checked = true;
  document.querySelectorAll("[data-busca] input").forEach((i) => { i.value = ""; });
  irPara("");
}

// Atualizar a página (F5) volta ao começo: sem busca, sem categoria e sem filtros
// (o navegador guardaria o que estava marcado). Link compartilhado com ?q= continua abrindo a busca.
zerarFiltros();
$("input[name=ordem][value=relevancia]").checked = true;
document.querySelectorAll("[data-busca] input").forEach((i) => { i.value = ""; });
if (performance.getEntriesByType?.("navigation")[0]?.type === "reload") {
  history.scrollRestoration = "manual";
  window.scrollTo(0, 0);
  if (location.search) history.replaceState(null, "", location.pathname);
}

avisoDeLojaInstavel();

$("#mais-ofertas").addEventListener("click", carregarMaisOfertas);
$("#mais-resultados").addEventListener("click", () => (estado.loja ? carregarMaisDaLoja() : carregarMaisResultados()));

// Rolagem infinita (pedido do Giovanni, 05/11/2026: "como no app do ML, quando chega no fim carrega os novos"): quando o
// botão "Ver mais ofertas"/"Ver mais resultados" chega perto da tela, a próxima página vem sozinha. O botão continua lá
// (para quem não rola, e se der erro). No máximo 40 seguidas por busca/loja, para não ficar pedindo sem parar
(function rolagemInfinita() {
  if (!("IntersectionObserver" in window)) return;
  let pedidoVisto = -1;
  let seguidas = 0;
  let acessoriosAbertos = -1;
  const obs = new IntersectionObserver((entradas) => {
    for (const e of entradas) {
      const botao = e.target;
      if (!e.isIntersecting || botao.hidden || botao.disabled) continue;
      if (estado.pedido !== pedidoVisto) { pedidoVisto = estado.pedido; seguidas = 0; }
      // No fim da lista, quando só sobra "Ver também N acessórios e produtos parecidos" (sem mais resultados para
      // carregar), eles entram sozinhos (pedido do Giovanni, 05/11/2026). Uma vez por busca: se a pessoa desmarcar
      // "acessórios" depois, não volta a abrir
      if (botao.id === "ver-acessorios") {
        if (acessoriosAbertos === estado.pedido) continue;
        if (!$("#mais-resultados").hidden || estado.buscando) {
          // Ainda carregando ou com mais resultados por vir: olha de novo daqui a pouco (o botão pode continuar à vista)
          obs.unobserve(botao);
          setTimeout(() => obs.observe(botao), 1500);
          continue;
        }
        acessoriosAbertos = estado.pedido;
        botao.click();
        continue;
      }
      if (seguidas >= 40) continue;
      // Filtros que não deixam nenhum produto: tenta só mais 3 páginas (07/11/2026: ficava "Carregando…" sem fim)
      if (estado.qtdFiltrada === 0 && seguidas >= 3) continue;
      seguidas++;
      const carga = botao.id === "mais-ofertas" ? carregarMaisOfertas()
        : estado.loja ? carregarMaisDaLoja({ sozinho: true }) : carregarMaisResultados({ sozinho: true });
      // Depois de carregar, observa de novo: se o botão ainda está à vista (veio pouca coisa), pede a próxima
      Promise.resolve(carga).finally(() => { obs.unobserve(botao); requestAnimationFrame(() => obs.observe(botao)); });
    }
  }, { rootMargin: "0px 0px 900px 0px" });
  for (const id of ["#mais-ofertas", "#mais-resultados", "#ver-acessorios"]) obs.observe($(id));
})();
document.querySelectorAll("[data-abrir-filtros]").forEach((b) => b.addEventListener("click", () => abrirFiltros(true)));
document.querySelectorAll("[data-fechar-filtros]").forEach((b) => b.addEventListener("click", () => abrirFiltros(false)));
$("#abrir-favoritos").addEventListener("click", () => abrirPainel(true));
$("#fechar-favoritos").addEventListener("click", () => abrirPainel(false));
$("#abrir-conta").dataset.icone = $("#abrir-conta").innerHTML;
$("#abrir-conta").addEventListener("click", abrirConta);
$("#fechar-conta").addEventListener("click", () => $("#janela-conta").close());
$("#fechar-historico").addEventListener("click", () => $("#janela-historico").close());
$("#fechar-detalhes").addEventListener("click", () => $("#janela-detalhes").close());
$("#fechar-comparar").addEventListener("click", () => $("#janela-comparar").close());
$("#janela-comparar").addEventListener("click", (e) => {
  const r = e.currentTarget.getBoundingClientRect();
  if (e.target === e.currentTarget && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) e.currentTarget.close();
});
$("#fechar-lojas").addEventListener("click", () => $("#janela-lojas").close());
$("#fechar-cupons").addEventListener("click", () => $("#janela-cupons").close());
$("#cupons-filtro").addEventListener("input", desenharCupons);
document.querySelectorAll("[data-ver-cupons]").forEach((b) => b.addEventListener("click", (e) => { e.preventDefault(); abrirCupons(); }));
document.querySelectorAll("[data-black-friday]").forEach((b) => b.addEventListener("click", (e) => { e.preventDefault(); irParaBlackFriday(); }));
// "Não contar minhas visitas" (pedido do Giovanni, 04/11/2026; botão no painel): /?nao-contar=1 grava o cookie que faz o
// servidor não contar este aparelho nas visitas, buscas e cliques (lib/naoContar.js); /?nao-contar=0 volta a contar
(() => {
  const params = new URLSearchParams(location.search);
  const valor = params.get("nao-contar");
  if (valor === null) return;
  const dominio = /(^|\.)vaiprocarrinho\.com\.br$/.test(location.hostname) ? "; Domain=vaiprocarrinho.com.br" : "";
  document.cookie = valor === "0"
    ? `vpc_nao_contar=; Max-Age=0; Path=/; SameSite=Lax; Secure${dominio}`
    : `vpc_nao_contar=1; Max-Age=63072000; Path=/; SameSite=Lax; Secure${dominio}`;
  params.delete("nao-contar");
  history.replaceState(null, "", `${location.pathname}${params.size ? `?${params}` : ""}`);
  setTimeout(() => toast(valor === "0" ? "Pronto: as visitas deste aparelho voltam a ser contadas"
    : "Pronto: as visitas deste aparelho não entram mais nas contas do painel ✅"), 300);
})();
carregarCupons();
carregarLojasParceiras(); // a busca pelo nome de uma loja abre a página dela (buscar) e as sugestões mostram as lojas
// A lista de marcas (filtro "Marcas") vem do vocabulário da busca: baixa logo e redesenha quando chegar
vocab.aoChegar.push(() => { if (!estado.buscando) { desenharFiltroMarcas(); } });
carregarVocabulario();
$("#lojas-filtro").addEventListener("input", () => lojasParceiras && desenharListaLojas());
document.querySelectorAll("[data-ver-lojas]").forEach((b) => b.addEventListener("click", abrirLojas));
$("#janela-lojas").addEventListener("click", (e) => {
  const r = e.currentTarget.getBoundingClientRect();
  if (e.target === e.currentTarget && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) e.currentTarget.close();
});
$("#janela-detalhes").addEventListener("click", (e) => {
  const r = e.currentTarget.getBoundingClientRect();
  if (e.target === e.currentTarget && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) e.currentTarget.close();
});
$("#janela-historico").addEventListener("click", (e) => {
  const r = e.currentTarget.getBoundingClientRect();
  if (e.target === e.currentTarget && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) e.currentTarget.close();
});
// Ao fechar, a próxima vez abre na tela principal da conta (e esquece o alerta que ia criar)
$("#janela-conta").addEventListener("close", () => {
  conta.alertaOferta = null;
  conta.carrinhoOferta = null;
  if (conta.usuario) conta.etapa = "entrar";
});
// Clique fora da janela fecha
$("#janela-conta").addEventListener("click", (e) => {
  const r = e.currentTarget.getBoundingClientRect();
  if (e.target === e.currentTarget && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) e.currentTarget.close();
});
$("#painel-fundo").addEventListener("click", () => { abrirPainel(false); abrirFiltros(false); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") { abrirPainel(false); abrirFiltros(false); } });

// Voltar do celular: fecha a gaveta, o carrinho e as janelas abertas antes de trocar a página
window.addEventListener("popstate", () => {
  abrirFiltros(false);
  abrirPainel(false);
  document.querySelectorAll("dialog[open]").forEach((j) => j.close());
  mostrar();
});

$("#ano").textContent = new Date().getFullYear();

const linkDeProduto = new URLSearchParams(location.search).has("produto");
montarInicio();
atualizarFavoritos();
mostrar();
carregarConta();
if (linkDeProduto) abrirProdutoDoLink();
