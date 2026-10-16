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

// Lojas fora da lista acima (as da Awin, por exemplo) chegam com o nome em lojaNome
const infoLoja = (o) => LOJAS[o.loja] || { nome: o.lojaNome || o.loja, em: "na", cor: "#6d28d9", texto: "#fff" };

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
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("visivel");
  clearTimeout(timerToast);
  timerToast = setTimeout(() => t.classList.remove("visivel"), 2600);
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

function alternarFavorito(oferta) {
  if (ehFavorito(oferta.id)) {
    favoritos = favoritos.filter((f) => f.id !== oferta.id);
    toast("Removido do carrinho");
  } else {
    const { id, titulo, preco, loja, lojaNome, link, imagem, emoji, categoria } = oferta;
    favoritos.unshift({ id, titulo, preco, loja, lojaNome, link, imagem, emoji, categoria });
    toast("🛒 Guardado no seu carrinho");
  }
  salvarFavoritos();
  enviarCarrinho();
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
      el("span", {}, "🛒"), el("p", {}, "Seu carrinho está vazio. Toque no carrinho de uma oferta para guardar e comprar depois.")));
    return;
  }
  lista.replaceChildren(...favoritos.map((f) => {
    const loja = infoLoja(f);
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

// Junta o carrinho deste aparelho com o da conta (sem repetir itens)
function juntarCarrinho(daConta = []) {
  const ids = new Set(favoritos.map((f) => f.id));
  const juntos = [...favoritos, ...daConta.filter((f) => !ids.has(f.id))];
  const mudouConta = juntos.length !== daConta.length;
  favoritos = juntos;
  salvarFavoritos();
  atualizarFavoritos();
  if (mudouConta) enviarCarrinho();
}

let timerEnvio;
function enviarCarrinho() {
  if (!conta.usuario) return;
  clearTimeout(timerEnvio);
  timerEnvio = setTimeout(async () => {
    try {
      await chamarConta("PUT", "/carrinho", { itens: favoritos });
    } catch {
      // Sessão vencida: volta a guardar só no aparelho
      await carregarConta();
    }
  }, 600);
}

async function carregarConta() {
  try {
    const dados = await chamarConta("GET", "");
    conta.ativo = dados.ativo;
    conta.google = Boolean(dados.google);
    conta.usuario = dados.usuario || null;
    if (conta.usuario) juntarCarrinho(dados.carrinho);
  } catch {
    conta.ativo = false;
  }
  desenharContaTopo();
  // Volta do Google com erro, ou link de nova senha do e-mail: abre a janela na etapa certa
  const hash = location.hash;
  if (hash !== "#erro-google" && !hash.startsWith("#nova-senha=")) return;
  history.replaceState(null, "", location.pathname + location.search);
  if (!conta.ativo) return;
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
  location.href = `/api/conta/google?volta=${encodeURIComponent(location.pathname)}`;
}

function desenharContaTopo() {
  const botao = $("#abrir-conta");
  botao.hidden = !conta.ativo;
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

  if (conta.usuario) {
    conteudo = [
      el("h2", { id: "conta-titulo" }, `Olá, ${conta.usuario.nome.split(" ")[0]}! 👋`),
      el("div", { class: "conta-dados" }, el("strong", {}, conta.usuario.nome), el("span", {}, conta.usuario.email)),
      el("p", {}, `Você tem ${favoritos.length} ${favoritos.length === 1 ? "item" : "itens"} no carrinho, salvos na sua conta.`),
      erro,
      el("button", { class: "botao-primario", type: "button", onclick: () => { $("#janela-conta").close(); abrirPainel(true); } }, "🛒 Ver meu carrinho"),
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
      el("p", {}, "Assim o seu carrinho fica salvo em qualquer aparelho."),
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
          : [linkEtapa("cadastrar", "Criar conta"), linkEtapa("esqueci", "Esqueci minha senha")]),
        el("p", { class: "legal" }, "Guardamos só o seu nome, e-mail e os itens do carrinho. Ao continuar, você concorda com a ",
          el("a", { href: "privacidade", target: "_blank" }, "Política de Privacidade"), ".")),
    ];
  }
  $("#conta-conteudo").replaceChildren(...conteudo.filter(Boolean));
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
  // Depois de entrar, fecha a janela; os dados da conta (sair, excluir) ficam no ícone da conta
  $("#janela-conta").close();
  toast(mensagem);
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
  if (!confirm("Excluir a sua conta? O seu nome, e-mail e carrinho serão apagados para sempre.")) return;
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

// Foto que não carregou: se era a miniatura da Shopee, tenta a original; senão, mostra o emoji
const fotoQuebrada = (o) => (e) => {
  const img = e.target;
  if (/_tn$/.test(img.src)) img.src = img.src.replace(/_tn$/, "");
  else img.replaceWith(el("span", { class: "foto-emoji" }, o.emoji || "🛍️"));
};

// Texto do botão: verbo + loja ("Comprar na Shopee"). No celular, só "Comprar"
const textoComprar = (loja) =>
  longoCurto(loja.nome.length <= 16 ? `Comprar ${loja.em} ${loja.nome}` : "Comprar na loja", "Comprar");

// Mais vendido da lista (só quando a venda é expressiva, para o selo não perder valor)
function idMaisVendido(lista) {
  const campeao = lista.reduce((a, b) => ((b.vendidos || 0) > (a?.vendidos || 0) ? b : a), null);
  return campeao && campeao.vendidos >= 100 ? campeao.id : null;
}

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

function cartaoOferta(o, { melhor = false, maisVendido = false } = {}) {
  const loja = infoLoja(o);
  const [inteiro, decimal] = brl(o.preco).split(",");

  const abrir = () => toast(`Abrindo a oferta ${loja.em} ${loja.nome}… 🛒`);

  return el("article", {
    class: `oferta${melhor ? " melhor" : ""}`,
    style: `--cor-loja:${loja.cor};--texto-loja:${loja.texto};--fundo-cat:${FUNDO_CATEGORIA[o.categoria] || "linear-gradient(135deg,#ede9fe,#fce7f3)"}`,
  },
    el("a", { class: "oferta-foto", href: o.link, target: "_blank", rel: "sponsored noopener", tabindex: "-1", "aria-hidden": "true", onclick: abrir },
      o.imagem
        // Foto que não carrega (link quebrado da loja) vira o desenho padrão
        ? el("img", { src: o.imagem, alt: "", loading: "lazy", decoding: "async", onerror: fotoQuebrada(o) })
        : el("span", { class: "foto-emoji" }, o.emoji || "🛍️"),
      el("div", { class: "selos" },
        melhor && el("span", { class: "selo selo-melhor" }, ...longoCurto("🏆 Menor preço da busca", "🏆 Menor preço")),
        maisVendido && el("span", { class: "selo selo-vendido" }, ...longoCurto("⭐ Mais vendido", "⭐ Top")),
        o.desconto && el("span", { class: "selo selo-desconto" }, `-${o.desconto}%`),
        ...selosHistorico(o))),
    el("button", {
      class: "favoritar", type: "button", "data-id": o.id, "aria-pressed": ehFavorito(o.id),
      "aria-label": "Guardar no carrinho", onclick: () => alternarFavorito(o),
    }, ICONE_CARRINHO()),
    el("div", { class: "oferta-corpo" },
      el("div", { class: "loja-linha" },
        el("span", { class: "loja-tag" }, el("span", { class: "loja-ponto" }), loja.nome),
        o.lojaOficial && el("span", { class: "selo-oficial", title: o.vendedor ? `Vendido por ${o.vendedor}` : null }, "✔ Oficial")),
      el("h3", { class: "oferta-titulo", title: o.titulo }, temDetalhes(o)
        ? el("button", { class: "titulo-botao", type: "button", onclick: () => abrirDetalhes(o) }, o.titulo)
        : o.titulo),
      (o.avaliacao || o.vendidos) && el("div", { class: "nota" },
        o.avaliacao && el("span", { class: "estrelas", "aria-label": `Nota ${o.avaliacao}` }, estrelas(o.avaliacao)),
        o.avaliacao && el("span", {}, String(o.avaliacao).replace(".", ",")),
        o.vendidos && el("span", { class: o.vendidos >= 1000 ? "vendidos-muitos" : null },
          `${o.vendidos >= 1000 ? "🔥 " : ""}${vendidosTexto(o.vendidos)}`)),
      el("div", { class: "precos" },
        o.precoAntigo && el("span", { class: "preco-antigo" }, `R$ ${brl(o.precoAntigo)}`),
        el("span", { class: "preco" }, el("small", {}, "R$"), inteiro, el("small", {}, `,${decimal}`)),
        o.precoAntigo > o.preco + 1 && el("span", { class: "economia-tag" }, ...longoCurto(`Você economiza R$ ${brl(o.precoAntigo - o.preco)}`, `Economize R$ ${brl(o.precoAntigo - o.preco)}`))),
      o.freteGratis && el("span", { class: "frete" }, "🚚 Frete grátis"),
      o.internacional && el("span", {
        class: "internacional",
        title: `Loja de fora do Brasil.${o.moeda ? ` Preço convertido de ${o.moeda} pela cotação do dia;` : ""} pode haver impostos de importação.`,
      }, o.moeda ? `🌎 Internacional · valor aproximado` : "🌎 Internacional"),
      el("div", { class: "links-oferta" },
        temDetalhes(o) && el("button", { class: "ver-historico", type: "button", onclick: () => abrirDetalhes(o) }, "🔍 Ver detalhes"),
        o.historico && el("button", { class: "ver-historico", type: "button", onclick: () => abrirHistorico(o) }, "📈 Histórico")),
      el("a", { class: "botao-oferta", href: o.link, target: "_blank", rel: "sponsored noopener", onclick: abrir },
        ...textoComprar(loja), el("span", { class: "flecha", "aria-hidden": "true" }, "→"))));
}

// ---------------------------------------------------------------------
// Histórico de preço: janela com gráfico em degraus (o preço só muda nos
// dias registrados) e passe o dedo/mouse para ver o preço de cada dia.
// ---------------------------------------------------------------------
const dataCurta = (dia) => new Date(`${dia}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });

function graficoHistorico(pontos, precoAtual) {
  const hoje = new Date().toLocaleDateString("sv-SE");
  const serie = [...pontos];
  if (!serie.length || serie.at(-1).dia !== hoje) serie.push({ dia: hoje, preco: precoAtual ?? serie.at(-1)?.preco });
  const L = 320, A = 150, m = { esq: 8, dir: 8, topo: 14, base: 22 };
  // Meio dia depois de hoje, para o preço atual aparecer como um trecho e não só um ponto
  const t0 = Date.parse(serie[0].dia), t1 = Math.max(Date.parse(serie.at(-1).dia), t0 + 864e5) + 432e5;
  const precos = serie.map((p) => p.preco);
  let min = Math.min(...precos), max = Math.max(...precos);
  if (max - min < 1) { min -= 5; max += 5; }
  const folga = (max - min) * 0.15;
  const x = (dia) => m.esq + ((Date.parse(dia) - t0) / (t1 - t0)) * (L - m.esq - m.dir);
  const y = (v) => m.topo + (1 - (v - (min - folga)) / (max - min + 2 * folga)) * (A - m.topo - m.base);
  // Linha em degraus: o preço segue igual até o próximo registro
  let d = `M${x(serie[0].dia)},${y(serie[0].preco)}`;
  for (let i = 1; i < serie.length; i++) d += ` H${x(serie[i].dia)} V${y(serie[i].preco)}`;
  d += ` H${L - m.dir}`;
  const area = `${d} V${A - m.base} H${x(serie[0].dia)} Z`;
  const ns = "http://www.w3.org/2000/svg";
  const svg = (tag, attrs) => { const n = document.createElementNS(ns, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); return n; };

  const raiz = svg("svg", { viewBox: `0 0 ${L} ${A}`, class: "grafico", role: "img",
    "aria-label": `Preço de ${dataCurta(serie[0].dia)} até hoje: entre R$ ${brl(Math.min(...precos))} e R$ ${brl(Math.max(...precos))}` });
  raiz.append(
    svg("line", { x1: m.esq, x2: L - m.dir, y1: A - m.base, y2: A - m.base, class: "grafico-base" }),
    svg("path", { d: area, class: "grafico-area" }),
    svg("path", { d, class: "grafico-linha" }));
  for (const p of serie.slice(0, -1)) raiz.append(svg("circle", { cx: x(p.dia), cy: y(p.preco), r: 4, class: "grafico-ponto" }));
  const legenda = (texto, ancora, xx) => { const t = svg("text", { x: xx, y: A - 6, "text-anchor": ancora, class: "grafico-eixo" }); t.textContent = texto; return t; };
  raiz.append(legenda(dataCurta(serie[0].dia), "start", m.esq), legenda("hoje", "end", L - m.dir));

  // Dica ao passar o mouse/dedo: preço em vigor naquele dia
  const guia = svg("line", { y1: m.topo, y2: A - m.base, class: "grafico-guia", visibility: "hidden" });
  const marca = svg("circle", { r: 5, class: "grafico-marca", visibility: "hidden" });
  raiz.append(guia, marca);
  const dica = el("div", { class: "grafico-dica", hidden: true });
  const caixa = el("div", { class: "grafico-caixa" }, raiz, dica);
  const mover = (e) => {
    const r = raiz.getBoundingClientRect();
    const t = t0 + ((e.clientX - r.left) / r.width * L - m.esq) / (L - m.esq - m.dir) * (t1 - t0);
    const vigente = [...serie].reverse().find((p) => Date.parse(p.dia) <= t) || serie[0];
    const xx = Math.min(Math.max((e.clientX - r.left) / r.width * L, m.esq), L - m.dir);
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
// Só vale abrir a janela quando ela mostra algo que o cartão não mostra.
// A API de afiliados da Shopee manda 1 foto e nenhuma descrição, então
// a janela aparece hoje só nas lojas da Awin que mandam fotos/descrição.
const temDetalhes = (o) => Boolean(o.descricao || o.imagens?.length > 1);

function abrirDetalhes(o) {
  const loja = infoLoja(o);
  const fotos = o.imagens?.length ? o.imagens : [o.imagem].filter(Boolean);
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
      el("span", { class: "loja-tag", style: `--cor-loja:${loja.cor}` }, el("span", { class: "loja-ponto" }), loja.nome),
      o.lojaOficial && el("span", { class: "selo-oficial" }, "✔ Loja oficial"),
      o.vendedor && el("span", { class: "detalhes-vendedor" }, `Vendido por ${o.vendedor}`)),
    el("h2", { id: "detalhes-titulo" }, o.titulo),
    (o.avaliacao || o.vendidos) && el("div", { class: "nota" },
      o.avaliacao && el("span", { class: "estrelas", "aria-label": `Nota ${o.avaliacao}` }, estrelas(o.avaliacao)),
      o.avaliacao && el("span", {}, String(o.avaliacao).replace(".", ",")),
      o.vendidos && el("span", { class: o.vendidos >= 1000 ? "vendidos-muitos" : null },
        `${o.vendidos >= 1000 ? "🔥 " : ""}${vendidosTexto(o.vendidos)}`)),
    el("div", { class: "precos" },
      o.precoAntigo && el("span", { class: "preco-antigo" }, `R$ ${brl(o.precoAntigo)}`, o.desconto && ` (-${o.desconto}%)`),
      el("span", { class: "preco" }, el("small", {}, "R$"), inteiro, el("small", {}, `,${decimal}`)),
      o.precoAntigo > o.preco + 1 && el("span", { class: "economia-tag" }, `Você economiza R$ ${brl(o.precoAntigo - o.preco)}`)),
    el("div", { class: "detalhes-selos" },
      o.freteGratis && el("span", { class: "frete" }, "🚚 Frete grátis"),
      o.internacional && el("span", { class: "internacional" },
        o.moeda ? `🌎 Internacional · valor convertido de ${o.moeda}` : "🌎 Internacional")),
    o.descricao && el("div", { class: "detalhes-descricao" }, el("h3", {}, "Descrição"), el("p", {}, o.descricao)),
    listaOutrasLojas(o),
    o.historico && el("button", { class: "ver-historico", type: "button", onclick: () => { $("#janela-detalhes").close(); abrirHistorico(o); } },
      "📈 Ver histórico de preço"),
    el("a", { class: "botao-oferta", href: o.link, target: "_blank", rel: "sponsored noopener",
      style: `--cor-loja:${loja.cor};--texto-loja:${loja.texto}`, onclick: () => toast(`Abrindo a oferta ${loja.em} ${loja.nome}… 🛒`) },
      `Comprar ${loja.em} ${loja.nome.length <= 16 ? loja.nome : "loja"}`, el("span", { class: "flecha", "aria-hidden": "true" }, "→")),
    el("p", { class: "detalhes-nota" }, o.descricao
      ? "Preço e estoque podem mudar. Confira na loja antes de finalizar."
      : "Cores, tamanhos e a descrição completa aparecem na página da loja."));

  $("#detalhes-conteudo").replaceChildren(el("div", { class: "detalhes" }, galeria, info));
  $("#janela-detalhes").showModal();
}

async function abrirHistorico(o) {
  const janela = $("#janela-historico");
  const conteudo = $("#historico-conteudo");
  const loja = infoLoja(o);
  conteudo.replaceChildren(el("h2", { id: "historico-titulo" }, "Histórico de preço"), el("p", {}, o.titulo), el("p", {}, "Carregando…"));
  janela.showModal();
  let dados;
  try {
    const resp = await fetch(`/api/historico?id=${encodeURIComponent(o.id)}`);
    dados = await resp.json();
  } catch {
    dados = { pontos: [] };
  }
  const pontos = dados.pontos || [];
  const precos = [...pontos.map((p) => p.preco), o.preco];
  const diasAcompanhando = pontos.length ? Math.round((Date.now() - Date.parse(`${pontos[0].dia}T00:00:00`)) / 864e5) : 0;
  conteudo.replaceChildren(
    el("h2", { id: "historico-titulo" }, "Histórico de preço"),
    el("p", {}, `${o.titulo} · ${loja.nome}`),
    el("div", { class: "historico-numeros" },
      el("div", {}, el("small", {}, "Hoje"), el("strong", {}, `R$ ${brl(o.preco)}`)),
      el("div", {}, el("small", {}, "Menor"), el("strong", {}, `R$ ${brl(Math.min(...precos))}`)),
      el("div", {}, el("small", {}, "Maior"), el("strong", {}, `R$ ${brl(Math.max(...precos))}`))),
    graficoHistorico(pontos, o.preco),
    el("p", { class: "historico-nota" }, diasAcompanhando < 7
      ? "Começamos a acompanhar este preço há pouco tempo. O gráfico fica mais completo a cada dia."
      : `Preço acompanhado há ${diasAcompanhando} dias.${o.moeda ? ` Valores convertidos de ${o.moeda} para reais.` : ""}`),
    el("a", { class: "botao-oferta", href: o.link, target: "_blank", rel: "sponsored noopener",
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
const estado = { q: "", ofertas: [], inicio: null, paginaInicio: 1, temMaisInicio: false, vistosInicio: new Set(), lojasDesmarcadas: new Set(), pedido: 0 };

// Anúncios repetidos: na Shopee vários vendedores publicam o mesmo produto (mesmo título, foto e preço)
// com códigos diferentes. Fica um só, o que vendeu mais, na posição em que apareceu primeiro.
function semRepetidos(lista) {
  const posicao = new Map();
  const saida = [];
  for (const o of lista) {
    const chaves = [
      `id|${o.id}`,
      `t|${o.loja}|${o.preco}|${normalizar(o.titulo || "").slice(0, 60)}`,
      o.imagem && `f|${o.loja}|${o.imagem.replace(/_tn$/, "")}`,
    ].filter(Boolean);
    const achada = chaves.find((c) => posicao.has(c));
    if (achada === undefined) {
      chaves.forEach((c) => posicao.set(c, saida.length));
      saida.push(o);
    } else {
      const i = posicao.get(achada);
      if ((o.vendidos || 0) > (saida[i].vendidos || 0)) saida[i] = o;
      chaves.forEach((c) => posicao.set(c, i));
    }
  }
  return saida;
}

// mais = pedaço de endereço que a resposta anterior mandou para buscar a continuação ("desde=10", "pagina=2")
async function consultarApi(q, mais = "") {
  const atalho = estado.atalho ? "&atalho=1" : "";
  estado.atalho = false;
  const cat = q && estado.cat ? `&cat=${encodeURIComponent(estado.cat)}` : "";
  const resp = await fetch(`/api/buscar?v=17&q=${encodeURIComponent(q)}${cat}${mais ? `&${mais}` : ""}${atalho}`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

function filtrar() {
  const min = parseFloat($("#preco-min").value);
  const max = parseFloat($("#preco-max").value);
  const frete = $("#so-frete").checked;
  const desconto = $("#so-desconto").checked;
  // Acessórios só aparecem se pedidos (ou se a busca só achou acessórios)
  const semAcessorios = !$("#com-acessorios").checked && estado.ofertas.some((o) => !o.acessorio);
  const lista = estado.ofertas.filter((o) =>
    !estado.lojasDesmarcadas.has(o.loja)
    && !(semAcessorios && o.acessorio)
    && !(min >= 0 && o.preco < min)
    && !(max >= 0 && o.preco > max)
    && (!frete || o.freteGratis)
    && (!desconto || o.desconto));

  const ordem = $("input[name=ordem]:checked").value;
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
    const loja = infoLoja(estado.ofertas.find((o) => o.loja === id));
    return el("label", { class: "opcao", style: `--cor-loja:${loja.cor}` },
      el("input", {
        type: "checkbox", checked: !estado.lojasDesmarcadas.has(id),
        onchange: (e) => { e.target.checked ? estado.lojasDesmarcadas.delete(id) : estado.lojasDesmarcadas.add(id); desenharResultados(); },
      }),
      el("span", { class: "loja-ponto" }), loja.nome,
      el("span", { class: "qtd", title: `${contagem[id]} ofertas desta loja na lista` }, contagem[id]));
  }));
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
function ofertasComparaveis(lista) {
  const produtos = lista.filter((o) => !o.acessorio);
  const certeiros = produtos.filter((o) => o.bate);
  const base = certeiros.length ? certeiros : produtos.length ? produtos : lista;
  const precos = base.map((o) => o.preco).sort((a, b) => a - b);
  const mediana = precos[Math.floor(precos.length / 2)];
  const dentro = base.filter((o) => o.preco >= mediana * 0.3 && o.preco <= mediana * 3);
  return dentro.length ? dentro : base;
}

function melhorOferta(lista) {
  const base = ofertasComparaveis(lista);
  return base.length ? base.reduce((a, b) => (b.preco < a.preco ? b : a)) : null;
}

function desenharResumo(lista) {
  const qtdLojas = new Set(lista.map((o) => o.loja)).size;
  const cat = navegandoCategoria();
  const titulo = el("div", {},
    cat ? el("h1", {}, `${cat.emoji || ""} ${cat.nome}`) : el("h1", {}, el("span", {}, "Resultados para "), `“${estado.q}”`),
    el("p", {}, lista.length
      ? `${lista.length} ${lista.length === 1 ? "oferta" : "ofertas"} em ${qtdLojas} ${qtdLojas === 1 ? "loja" : "lojas"}`
      : "Nenhuma oferta com esses filtros"),
    avisoCategoria());

  // Acessórios e peças: botão sempre à vista no topo (o resumo fica preso abaixo do cabeçalho)
  const acessorios = estado.ofertas.filter((o) => o.acessorio).length;
  const mostrando = $("#com-acessorios").checked;
  const botaoAcessorios = acessorios && acessorios < estado.ofertas.length && el("button", {
    class: "resumo-acessorios", type: "button", "aria-pressed": String(mostrando),
    onclick: () => { $("#com-acessorios").checked = !mostrando; desenharResultados(); },
  }, mostrando ? `🔧 Esconder acessórios e peças` : `🔧 Mostrar acessórios e peças (${acessorios})`);

  $("#resumo").replaceChildren(titulo, ...(botaoAcessorios ? [botaoAcessorios] : []));
}

// Botão "🚚 Frete grátis" acima da lista (o mesmo filtro de "Mais opções"). A Shopee não informa o frete
// para afiliados, então hoje só lojas da Awin têm essa informação: o botão só aparece quando a lista tem
// pelo menos FRETE_MINIMO ofertas com frete grátis (para não frustrar com 1 ou 2 resultados).
const FRETE_MINIMO = 8;
function desenharBotaoFrete() {
  const qtd = estado.ofertas.filter((o) => o.freteGratis).length;
  const ligado = $("#so-frete").checked;
  document.querySelectorAll("[data-frete]").forEach((b) => {
    b.hidden = qtd < FRETE_MINIMO && !ligado;
    b.setAttribute("aria-pressed", String(ligado));
    b.textContent = ligado ? "🚚 Frete grátis ✕" : `🚚 Frete grátis (${qtd})`;
  });
}

function desenharResultados() {
  desenharBotaoFrete();
  const lista = filtrar();
  if (!estado.q) return desenharInicio(lista);
  const idMelhor = lista.length > 1 ? melhorOferta(lista)?.id : null;
  desenharResumo(lista);
  $("#total").textContent = `${lista.length} ${lista.length === 1 ? "oferta" : "ofertas"}`;
  const idVendido = idMaisVendido(lista);
  $("#grade").replaceChildren(...lista.map((o, i) => {
    const c = cartaoOferta(o, { melhor: o.id === idMelhor, maisVendido: o.id === idVendido });
    c.style.animationDelay = `${Math.min(i, 12) * 30}ms`;
    return c;
  }));
  $("#vazio").hidden = lista.length > 0;
  $("#mais-resultados").hidden = !estado.temMaisBusca;
  const acessorios = estado.ofertas.filter((o) => o.acessorio).length;
  const botao = $("#ver-acessorios");
  botao.hidden = !acessorios || $("#com-acessorios").checked || acessorios === estado.ofertas.length;
  botao.textContent = `Ver também ${acessorios} ${acessorios === 1 ? "acessório ou peça" : "acessórios e peças"} para “${estado.q}”`;
}

async function buscar(q) {
  const pedido = ++estado.pedido;
  estado.q = q;
  estado.foraDaCategoria = null;
  estado.lojasDesmarcadas.clear();
  $("#com-acessorios").checked = false;
  preencherBusca();

  const cat = navegandoCategoria();
  $("#resumo").replaceChildren(el("div", {}, el("h1", {}, el("span", {}, "Buscando "), cat ? `${cat.nome}…` : `“${q}”…`), el("p", {}, "Comparando preços nas lojas")));
  $("#total").textContent = "";
  $("#filtro-lojas").replaceChildren();
  $("#vazio").hidden = true;
  $("#grade").replaceChildren(...esqueletos(8));
  estado.temMaisBusca = false;
  $("#mais-resultados").hidden = true;

  try {
    const dados = await consultarApi(q);
    if (pedido !== estado.pedido) return; // chegou resposta de uma busca antiga
    $("#aviso-teste").hidden = !dados.exemplo;
    estado.ofertas = semRepetidos(dados.ofertas);
    // Nada na categoria: o servidor buscou em tudo, e as próximas páginas também são de tudo
    if (dados.foraDaCategoria) { estado.foraDaCategoria = estado.cat; estado.cat = null; }
    estado.maisBusca = dados.mais;
    estado.temMaisBusca = Boolean(dados.mais);
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
function desenharInicio(lista) {
  const idVendido = idMaisVendido(lista);
  $("#destaques").replaceChildren(...(lista.length
    ? lista.map((o) => {
      const c = cartaoOferta(o, { maisVendido: o.id === idVendido });
      // Ao carregar mais, só os cartões novos "surgem"; os que já estavam ficam parados
      if (estado.vistosInicio.has(o.id)) c.style.animation = "none";
      estado.vistosInicio.add(o.id);
      return c;
    })
    : [el("p", { class: "vazio" }, estado.ofertas.length ? "Nenhuma oferta do dia com esses filtros." : "Nenhuma oferta do dia agora.")]));
  $("#mais-ofertas").hidden = !estado.temMaisInicio;
}

// "Ver mais ofertas": traz a próxima página de mais vendidos e junta à lista
async function carregarMaisOfertas() {
  const botao = $("#mais-ofertas");
  botao.disabled = true;
  botao.textContent = "Carregando…";
  try {
    const dados = await consultarApi("", `pagina=${estado.paginaInicio + 1}`);
    const antes = estado.inicio.length;
    estado.inicio = semRepetidos([...estado.inicio, ...dados.ofertas]);
    estado.paginaInicio += 1;
    estado.temMaisInicio = Boolean(dados.temMais && estado.inicio.length > antes);
    if (!estado.q) {
      estado.ofertas = estado.inicio;
      desenharFiltroLojas();
      desenharResultados();
    }
  } catch {
    toast("Não foi possível carregar mais ofertas agora");
  }
  botao.disabled = false;
  botao.textContent = "Ver mais ofertas";
}

// "Ver mais resultados": traz a próxima página da busca (Shopee) e junta à lista
async function carregarMaisResultados() {
  const botao = $("#mais-resultados");
  const pedido = estado.pedido;
  botao.disabled = true;
  botao.textContent = "Carregando…";
  try {
    const dados = await consultarApi(estado.q, estado.maisBusca);
    if (pedido !== estado.pedido) return; // o visitante já fez outra busca
    const antes = estado.ofertas.length;
    const todas = semRepetidos([...estado.ofertas, ...dados.ofertas]);
    estado.maisBusca = dados.mais;
    estado.temMaisBusca = Boolean(dados.mais && todas.length > antes);
    // Produtos antes, acessórios (escondidos) no fim
    estado.ofertas = [...todas.filter((o) => !o.acessorio), ...todas.filter((o) => o.acessorio)];
    desenharFiltroLojas();
    desenharResultados();
  } catch {
    toast("Não foi possível carregar mais resultados agora");
  } finally {
    botao.disabled = false;
    botao.textContent = "Ver mais resultados";
  }
}

function mostrarInicio() {
  estado.q = "";
  estado.lojasDesmarcadas.clear();
  if (estado.inicio) {
    estado.ofertas = estado.inicio;
    desenharFiltroLojas();
    desenharResultados();
  } else {
    carregarDestaques();
  }
}

async function carregarDestaques() {
  const pedido = ++estado.pedido;
  estado.ofertas = [];
  $("#filtro-lojas").replaceChildren();
  $("#destaques").replaceChildren(...esqueletos(12));
  try {
    const dados = await consultarApi("");
    estado.inicio = semRepetidos(dados.ofertas);
    estado.temMaisInicio = Boolean(dados.temMais);
    if (pedido !== estado.pedido) return; // a pessoa já foi para uma busca
    $("#aviso-teste").hidden = !dados.exemplo;
    mostrarInicio();
  } catch {
    if (pedido !== estado.pedido) return;
    $("#destaques").replaceChildren(el("p", { class: "vazio" }, "Não foi possível carregar as ofertas agora."));
  }
}

// itens: [{ nome: "Moda masculina", busca: "roupa masculina" }] ou textos simples
function desenharEmAlta(itens) {
  $("#em-alta").replaceChildren(...itens.map((i) => {
    const { nome, busca } = typeof i === "string" ? { nome: i, busca: i } : i;
    return el("button", { class: "chip-alta", type: "button", onclick: () => irPara(busca, { atalho: true, cat: categoriaPeloNome(nome)?.nome }) }, nome);
  }));
}

async function carregarEmAlta() {
  try {
    const { itens = [], categorias = [] } = await (await fetch("/api/em-alta?v=2")).json();
    const maiuscula = (t) => t.charAt(0).toUpperCase() + t.slice(1);
    if (itens.length) desenharEmAlta(itens.map((i) => ({ nome: maiuscula(i.nome), busca: i.busca })));
    if (categorias.length) desenharCategorias(categorias);
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

function desenharCategorias(lista = categoriasAtuais) {
  categoriasAtuais = lista;
  document.querySelectorAll("[data-ordem-cat]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.ordemCat === ordemCategorias)));
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
  marcarCategoria();
  if (estado.q && !$("#resultados").hidden) preencherBusca();
}

const categoriaPeloNome = (nome) => (nome ? categoriasAtuais.find((c) => c.nome === nome) : null);

// Categoria escolhida no menu: ?cat= no endereço (ou link antigo ?q=perfume, que é a busca da categoria)
function categoriaAtual() {
  const params = new URLSearchParams(location.search);
  const q = normalizar(params.get("q") || "");
  if (!q) return null;
  if (params.get("cat")) return params.get("cat");
  return categoriasAtuais.find((c) => normalizar(c.busca || c.nome) === q)?.nome || null;
}

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
const PLACEHOLDER_BUSCA = $("[data-busca] input").placeholder;
function marcarCategoria() {
  const cat = categoriaAtual();
  document.querySelectorAll(".cat-item").forEach((b) => b.classList.toggle("ativa", b.dataset.nome === cat));
  document.querySelectorAll("[data-busca] input").forEach((i) => { i.placeholder = cat ? `Buscar em ${cat}…` : PLACEHOLDER_BUSCA; });
}

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
function irPara(q, { atalho = false, cat = null } = {}) {
  q = (q || "").trim();
  estado.atalho = atalho;
  const url = q ? `?q=${encodeURIComponent(q)}${cat ? `&cat=${encodeURIComponent(cat)}` : ""}` : location.pathname;
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
        onmousedown: (e) => { e.preventDefault(); input.value = s; fechar(); irPara(s, { cat: categoriaAtual() }); },
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
    irPara(input.value, { cat: categoriaAtual() });
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
// A barra lateral gruda logo abaixo do cabeçalho (que muda de altura no celular)
new ResizeObserver(() => document.documentElement.style.setProperty("--altura-topo", `${$("#topo").offsetHeight}px`)).observe($("#topo"));
document.querySelectorAll("[data-busca]").forEach(prepararBusca);
document.querySelectorAll("[data-inicio]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); irPara(""); }));

let timerPreco;
["#preco-min", "#preco-max"].forEach((s) => $(s).addEventListener("input", () => {
  clearTimeout(timerPreco);
  timerPreco = setTimeout(desenharResultados, 300);
}));
["#so-frete", "#so-desconto", "#com-acessorios"].forEach((s) => $(s).addEventListener("change", desenharResultados));
document.querySelectorAll("[data-frete]").forEach((b) => b.addEventListener("click", () => {
  $("#so-frete").checked = !$("#so-frete").checked;
  desenharResultados();
}));
$("#ver-acessorios").addEventListener("click", () => { $("#com-acessorios").checked = true; desenharResultados(); });
document.querySelectorAll("input[name=ordem]").forEach((r) => r.addEventListener("change", desenharResultados));
function zerarFiltros() {
  $("#preco-min").value = "";
  $("#preco-max").value = "";
  $("#so-frete").checked = false;
  $("#so-desconto").checked = false;
  $("#com-acessorios").checked = false;
  estado.lojasDesmarcadas.clear();
}
$("#limpar-filtros").addEventListener("click", () => {
  zerarFiltros();
  desenharFiltroLojas();
  desenharResultados();
});

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

$("#mais-ofertas").addEventListener("click", carregarMaisOfertas);
$("#mais-resultados").addEventListener("click", carregarMaisResultados);
document.querySelectorAll("[data-abrir-filtros]").forEach((b) => b.addEventListener("click", () => abrirFiltros(true)));
document.querySelectorAll("[data-fechar-filtros]").forEach((b) => b.addEventListener("click", () => abrirFiltros(false)));
$("#abrir-favoritos").addEventListener("click", () => abrirPainel(true));
$("#fechar-favoritos").addEventListener("click", () => abrirPainel(false));
$("#abrir-conta").dataset.icone = $("#abrir-conta").innerHTML;
$("#abrir-conta").addEventListener("click", abrirConta);
$("#fechar-conta").addEventListener("click", () => $("#janela-conta").close());
$("#fechar-historico").addEventListener("click", () => $("#janela-historico").close());
$("#fechar-detalhes").addEventListener("click", () => $("#janela-detalhes").close());
$("#janela-detalhes").addEventListener("click", (e) => {
  const r = e.currentTarget.getBoundingClientRect();
  if (e.target === e.currentTarget && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) e.currentTarget.close();
});
$("#janela-historico").addEventListener("click", (e) => {
  const r = e.currentTarget.getBoundingClientRect();
  if (e.target === e.currentTarget && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) e.currentTarget.close();
});
// Clique fora da janela fecha
$("#janela-conta").addEventListener("click", (e) => {
  const r = e.currentTarget.getBoundingClientRect();
  if (e.target === e.currentTarget && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) e.currentTarget.close();
});
$("#painel-fundo").addEventListener("click", () => { abrirPainel(false); abrirFiltros(false); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") { abrirPainel(false); abrirFiltros(false); } });

window.addEventListener("popstate", mostrar);

$("#ano").textContent = new Date().getFullYear();

montarInicio();
atualizarFavoritos();
mostrar();
carregarConta();
