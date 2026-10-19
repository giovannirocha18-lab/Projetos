// =====================================================================
// Vai pro Carrinho — comparador de preços
// =====================================================================

const LOJAS = {
  shopee: { nome: "Shopee", em: "na", cor: "#ee4d2d", texto: "#fff" },
  mercadolivre: { nome: "Mercado Livre", em: "no", cor: "#ffe600", texto: "#2d3277" },
  amazon: { nome: "Amazon", em: "na", cor: "#ff9900", texto: "#131921" },
  aliexpress: { nome: "AliExpress", em: "no", cor: "#6d28d9", texto: "#fff" },
  magalu: { nome: "Magalu", em: "na", cor: "#0086ff", texto: "#fff" },
  shein: { nome: "Shein", em: "na", cor: "#222222", texto: "#fff" },
};

// Lojas fora da lista acima (as da Awin, por exemplo) chegam com o nome em lojaNome.
// Cor própria de algumas (o nome começa por: "spicy" vale "Spicy BR"); as outras ficam roxas
const CORES_POR_NOME = [["spicy", "#b0002a"]];
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
    if (conta.usuario) (juntar ? juntarCarrinho : usarCarrinhoDaConta)(dados.carrinho);
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
  // Na volta, o carrinho deste aparelho é juntado ao da conta (como no login com senha)
  try { localStorage.setItem(CHAVE_JUNTAR, "1"); } catch { /* sem armazenamento */ }
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

// ---------------------------------------------------------------------
// Meu personagem: quem tem conta monta o personagem da animação de busca
// ---------------------------------------------------------------------
function abrirEditorPersonagem() {
  conta.rascunho = { ...(conta.usuario.personagem || PERSONAGENS_PRONTOS[0]) };
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
  return [
    el("h2", { id: "conta-titulo" }, "🎨 Meu personagem"),
    el("p", {}, "É ele que empurra o carrinho enquanto o site busca as ofertas para você."),
    previa,
    ...grupos,
    erro,
    el("button", { class: "botao-primario", type: "button", onclick: () => salvarPersonagem() }, "Salvar meu personagem"),
    el("div", { class: "links-conta" },
      el("button", { class: "botao-link", type: "button", onclick: () => { conta.etapa = "entrar"; conta.erro = ""; desenharConta(); } }, "Voltar"),
      conta.usuario.personagem && el("button", { class: "botao-link", type: "button", onclick: () => salvarPersonagem(null) }, "Usar os personagens do site")),
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
  } else if (conta.usuario) {
    conteudo = [
      el("h2", { id: "conta-titulo" }, `Olá, ${conta.usuario.nome.split(" ")[0]}! 👋`),
      el("div", { class: "conta-dados" }, el("strong", {}, conta.usuario.nome), el("span", {}, conta.usuario.email)),
      el("p", {}, `Você tem ${favoritos.length} ${favoritos.length === 1 ? "item" : "itens"} no carrinho, salvos na sua conta.`),
      erro,
      el("button", { class: "botao-primario", type: "button", onclick: () => { $("#janela-conta").close(); abrirPainel(true); } }, "🛒 Ver meu carrinho"),
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
        el("p", { class: "legal" }, "Guardamos só o seu nome, e-mail, os itens do carrinho e o personagem, se você montar um. Ao continuar, você concorda com a ",
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

// Foto que não carregou: se era a miniatura da Shopee, tenta a original; senão, mostra o emoji
const fotoQuebrada = (o) => (e) => {
  const img = e.target;
  if (/_tn$/.test(img.src)) img.src = img.src.replace(/_tn$/, "");
  else img.replaceWith(el("span", { class: "foto-emoji" }, o.emoji || "🛍️"));
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
      o.envioNacional && el("span", { class: "internacional nacional", title: "Sai de um armazém no Brasil: chega mais rápido e sem impostos de importação." },
        el("span", { class: "bandeira-br", "aria-hidden": "true" }), " Envio do Brasil"),
      el("div", { class: "links-oferta" },
        temDetalhes(o) && el("button", { class: "ver-historico", type: "button", onclick: () => abrirDetalhes(o) }, "🔍 Ver detalhes"),
        o.historico && el("button", { class: "ver-historico", type: "button", onclick: () => abrirHistorico(o) }, "📈 Histórico")),
      el("a", { class: classeBotao(loja), href: o.link, target: "_blank", rel: "sponsored noopener", onclick: abrir },
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
        o.moeda ? `🌎 Internacional · valor convertido de ${o.moeda}` : "🌎 Internacional"),
      o.envioNacional && el("span", { class: "internacional nacional" }, el("span", { class: "bandeira-br", "aria-hidden": "true" }), " Envio do Brasil")),
    o.descricao && el("div", { class: "detalhes-descricao" }, el("h3", {}, "Descrição"), el("p", {}, o.descricao)),
    o.historico && el("button", { class: "ver-historico", type: "button", onclick: () => { $("#janela-detalhes").close(); abrirHistorico(o); } },
      "📈 Ver histórico de preço"),
    el("a", { class: classeBotao(loja), href: o.link, target: "_blank", rel: "sponsored noopener",
      style: `--cor-loja:${loja.cor};--texto-loja:${loja.texto}`, onclick: () => toast(`Abrindo a oferta ${loja.em} ${loja.nome}… 🛒`) },
      `Comprar ${loja.em} ${loja.nome.length <= 16 ? loja.nome : "loja"}`, el("span", { class: "flecha", "aria-hidden": "true" }, "→")),
    el("p", { class: "detalhes-nota" }, o.descricao
      ? "Preço e estoque podem mudar. Confira na loja antes de finalizar."
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
    el("div", { class: "historico-numeros" },
      el("div", {}, el("small", {}, "Hoje"), el("strong", {}, `R$ ${brl(o.preco)}`)),
      el("div", {}, el("small", {}, "Menor"), el("strong", {}, `R$ ${brl(Math.min(...precos))}`)),
      el("div", {}, el("small", {}, "Maior"), el("strong", {}, `R$ ${brl(Math.max(...precos))}`))),
    graficoHistorico(pontos, o.preco),
    el("p", { class: "historico-nota" }, diasAcompanhando < 7
      ? "Começamos a acompanhar este preço há pouco tempo. O gráfico fica mais completo a cada dia."
      : `Preço acompanhado há ${diasAcompanhando} dias.${o.moeda ? ` Valores convertidos de ${o.moeda} para reais.` : ""}`),
    el("a", { class: classeBotao(loja), href: o.link, target: "_blank", rel: "sponsored noopener",
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
const estado = { q: "", ofertas: [], inicio: null, paginaInicio: 1, temMaisInicio: false, vistosInicio: new Set(), lojasDesmarcadas: new Set(), secoesSo: null, secoesFora: new Set(), pedido: 0 };

// Anúncios repetidos: na Shopee vários vendedores publicam o mesmo produto (mesmo título, foto e preço)
// com códigos diferentes. Fica um só, o que vendeu mais, na posição em que apareceu primeiro.
// Mesmo título com preço até 15% diferente também conta ("Celular Nokia 150 …" por R$ 155, 156, 165, 169 e 175)
const DIFERENCA_REPETIDO = 1.15;
function semRepetidos(lista) {
  const posicao = new Map();
  const porTitulo = new Map(); // loja + título -> posições na saída
  const saida = [];
  for (const o of lista) {
    const chaves = [
      `id|${o.id}`,
      o.imagem && `f|${o.loja}|${o.imagem.replace(/_tn$/, "")}`,
    ].filter(Boolean);
    const titulo = `${o.loja}|${normalizar(o.titulo || "").slice(0, 60)}`;
    let i = chaves.map((c) => posicao.get(c)).find((x) => x !== undefined);
    i ??= (porTitulo.get(titulo) || []).find((j) => o.preco > 0 && saida[j].preco > 0
      && Math.max(o.preco, saida[j].preco) <= Math.min(o.preco, saida[j].preco) * DIFERENCA_REPETIDO);
    if (i === undefined) {
      i = saida.length;
      porTitulo.set(titulo, [...(porTitulo.get(titulo) || []), i]);
      saida.push(o);
    } else if ((o.vendidos || 0) > (saida[i].vendidos || 0)) {
      saida[i] = o;
    }
    chaves.forEach((c) => posicao.set(c, i));
  }
  return saida;
}

// mais = pedaço de endereço que a resposta anterior mandou para buscar a continuação ("desde=10", "pagina=2")
async function consultarApi(q, mais = "") {
  const atalho = estado.atalho ? "&atalho=1" : "";
  estado.atalho = false;
  const cat = q && estado.cat ? `&cat=${encodeURIComponent(estado.cat)}` : "";
  const exato = q && estado.exato ? "&exato=1" : "";
  const resp = await fetch(`/api/buscar?v=65&q=${encodeURIComponent(q)}${cat}${mais ? `&${mais}` : ""}${atalho}${exato}`);
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

function filtrar() {
  const min = lerPreco($("#preco-min").value);
  const max = lerPreco($("#preco-max").value);
  const frete = $("#so-frete").checked;
  const desconto = $("#so-desconto").checked;
  const envio = $("input[name=envio]:checked")?.value || "todos";
  const semAcessorios = escondeAcessorios();
  const lista = estado.ofertas.filter((o) =>
    !estado.lojasDesmarcadas.has(o.loja)
    && secaoVisivel(o)
    && !(semAcessorios && o.acessorio)
    && !(min >= 0 && o.preco < min)
    && !(max >= 0 && o.preco > max)
    && (!frete || o.freteGratis)
    && (!desconto || o.desconto)
    && (envio === "todos" || (envio === "internacional") === Boolean(o.internacional)));

  const ordem = $("input[name=ordem]:checked").value;
  const ordenar = {
    menor: (a, b) => a.preco - b.preco,
    maior: (a, b) => b.preco - a.preco,
    desconto: (a, b) => nivelDesconto(a) - nivelDesconto(b) || percentual(b) - percentual(a),
    economia: (a, b) => nivelDesconto(a) - nivelDesconto(b) || economia(b) - economia(a),
    vendidos: (a, b) => (b.vendidos || 0) - (a.vendidos || 0),
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
}

function marcarSecao(secao, marcada) {
  const conjunto = estado.secoesSo || estado.secoesFora;
  (marcada === Boolean(estado.secoesSo)) ? conjunto.add(secao) : conjunto.delete(secao);
  desenharResultados();
}

function desenharFiltroSecoes() {
  const semAcessorios = escondeAcessorios();
  const contagem = new Map();
  for (const o of estado.ofertas) {
    if (!(semAcessorios && o.acessorio)) contagem.set(o.secao || "", (contagem.get(o.secao || "") || 0) + 1);
  }
  $("#caixa-secoes").hidden = contagem.size < 2;
  const ordem = [...contagem.keys()].sort((a, b) => (!a) - (!b) || (b === estado.cat) - (a === estado.cat) || contagem.get(b) - contagem.get(a));
  $("#filtro-secoes").replaceChildren(...ordem.map((secao) => el("label", { class: "opcao" },
    el("input", { type: "checkbox", checked: secaoVisivel({ secao }), onchange: (e) => marcarSecao(secao, e.target.checked) }),
    secao ? `${categoriaPeloNome(secao)?.emoji || ""} ${secao}` : "Outros",
    el("span", { class: "qtd", title: `${contagem.get(secao)} ofertas desta categoria na lista` }, contagem.get(secao)))));
}

// Ofertas de cada loja na lista (acessórios escondidos não entram)
function contarLojas() {
  const semAcessorios = escondeAcessorios();
  const contagem = {};
  for (const o of estado.ofertas) if (!(semAcessorios && o.acessorio)) contagem[o.loja] = (contagem[o.loja] || 0) + 1;
  return contagem;
}

function alternarLoja(id, ligar) {
  if (ligar) estado.lojasDesmarcadas.delete(id); else estado.lojasDesmarcadas.add(id);
}

// A API das lojas manda o preço sem cupom; com cupom ou Pix (depende da conta e da campanha) pode sair menos na loja.
// Aviso uma vez só, no card de resultados e na faixa das "Ofertas do dia", sem mexer nos cartões (pedido do Giovanni)
const AVISO_CUPOM = "💸 Produtos que têm cupom na loja podem sair ainda mais baratos.";

// Lojas desta busca dentro do card de resultados (pedido do Giovanni, 17/10/2026): o visitante vê na hora quais lojas
// têm o produto e liga/desliga cada uma; "Limpar" desliga todas (para escolher só uma) e "Marcar todas" volta tudo
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
      AVISO_CUPOM));
}

function desenharFiltroLojas() {
  desenharFiltroSecoes();
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
  // Sem o produto buscado na lista (ex.: só jaquetas "Air" numa busca por "air fryer"), ninguém ganha o selo
  // e o selo "Menor preço" não vai para resfriador nem peça de carro quando há o produto de verdade
  const exatos = produtos.filter(produtoExato);
  const deVerdade = exatos.filter((o) => o.principal && !o.variante && !o.foraDoTipo);
  const base = deVerdade.length ? deVerdade : exatos;
  if (!base.length) return [];
  const precos = base.map((o) => o.preco).sort((a, b) => a - b);
  const mediana = precos[Math.floor(precos.length / 2)];
  const dentro = base.filter((o) => o.preco >= mediana * 0.3 && o.preco <= mediana * 3);
  return dentro.length ? dentro : base;
}

function melhorOferta(lista) {
  if (poucosProdutos()) return null; // só peças na lista: o selo iria para uma peça
  const base = ofertasComparaveis(lista);
  return base.length ? base.reduce((a, b) => (b.preco < a.preco ? b : a)) : null;
}

// "Corrigimos “eletrolux” · Buscar como digitei" ou "Você quis dizer: electrolux?"
function avisoCorrecao() {
  if (navegandoCategoria()) return null;
  if (estado.corrigidaDe) {
    return el("p", { class: "resumo-categoria" }, `Corrigimos “${estado.corrigidaDe}” · `,
      el("button", { type: "button", onclick: () => irPara(estado.corrigidaDe, { cat: estado.cat, exato: true }) },
        "Buscar como digitei"));
  }
  if (estado.sugestao) {
    return el("p", { class: "resumo-categoria" }, "Você quis dizer: ",
      el("button", { type: "button", onclick: () => irPara(estado.sugestao, { cat: estado.cat }) }, `${estado.sugestao}?`));
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
  return el("p", { class: "aviso-sem-produto", role: "status" }, qtd
    ? `Encontramos só ${qtd} ${qtd === 1 ? "oferta" : "ofertas"} de “${estado.q}” nas lojas parceiras. O resto da lista são peças, acessórios e produtos parecidos.`
    : `😕 “${estado.q}” não está à venda nas nossas lojas parceiras no momento. Abaixo, peças, acessórios e produtos parecidos.`);
}

function desenharResumo(lista) {
  const qtdLojas = new Set(lista.map((o) => o.loja)).size;
  const cat = navegandoCategoria();
  const titulo = el("div", {},
    cat ? el("h1", {}, `${cat.emoji || ""} ${cat.nome}`) : el("h1", {}, el("span", {}, "Resultados para "), `“${estado.q}”`),
    el("p", {}, lista.length
      ? `${lista.length} ${lista.length === 1 ? "oferta" : "ofertas"} em ${qtdLojas} ${qtdLojas === 1 ? "loja" : "lojas"}`
      : "Nenhuma oferta com esses filtros"),
    avisoCorrecao(),
    avisoCategoria(),
    avisoSemProduto(),
    lojasNoResumo());

  $("#resumo").replaceChildren(titulo);
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
  if (estado.q && estado.buscando) return; // filtro mexido enquanto a busca carrega: espera a resposta
  const lista = filtrar();
  // Na busca as lojas ficam no card de resultados; a lista da barra lateral só vale nas "Ofertas do dia"
  $("#caixa-lojas").hidden = Boolean(estado.q);
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
  cabelo: { titulo: "Cabelo", itens: { curto: "Curto", rabo: "Rabo de cavalo", cacheado: "Cacheado", careca: "Careca" } },
  corCabelo: { titulo: "Cor do cabelo", cores: { preto: "#1f1209", castanho: "#5b3a1e", loiro: "#e9c46a", ruivo: "#c2410c", grisalho: "#a8a29e" } },
  pele: { titulo: "Pele", cores: { clara: "#f5c09a", media: "#e0a97a", morena: "#b97a4f", parda: "#8d5524", negra: "#5c3a21" } },
  rosto: { titulo: "Rosto", itens: { sorriso: "😊 Sorriso", oculos: "🤓 Óculos", barba: "🧔 Barba", piscadinha: "😉 Piscadinha" } },
  roupa: { titulo: "Roupa", cores: { amarelo: "#fde047", verde: "#14b8a6", azul: "#3b82f6", vermelho: "#ef4444", rosa: "#f472b6", preto: "#27272a" } },
  carrinho: { titulo: "Carrinho", itens: { logo: "Do logo", grade: "De supermercado" } },
};
// Os dois modelos prontos (v1 = boneco de camiseta amarela + carrinho do logo; v2 = moça + carrinho de grade)
const PERSONAGENS_PRONTOS = [
  { cabelo: "curto", corCabelo: "castanho", pele: "clara", rosto: "sorriso", roupa: "amarelo", carrinho: "logo" },
  { cabelo: "rabo", corCabelo: "preto", pele: "morena", rosto: "sorriso", roupa: "verde", carrinho: "grade" },
];

// Cor um pouco mais escura (braço e perna de trás)
const escurecer = (hex, f = 0.82) => `#${[1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * f).toString(16).padStart(2, "0")).join("")}`;

// Produtos que caem no carrinho (classe p1…p6 = ordem em que caem); dx/dy = onde ficam em cada carrinho
function produtosNoCarrinho(dx, dy) {
  const g = (n, conteudo) => `<g class="anim-produto p${n}" transform="translate(${dx} ${dy})">${conteudo}</g>`;
  return [
    g(1, '<rect x="96" y="26" width="18" height="16" rx="2" fill="#ee4d2d"/><path d="M96 31 H114 M105 26 V31" stroke="#fff" stroke-width="1.5"/>'),
    g(2, '<rect x="117" y="22" width="10" height="20" rx="2.5" fill="#6d28d9" stroke="#fff" stroke-width="1.5"/>'),
    g(3, '<rect x="131" y="25" width="12" height="17" rx="3" fill="#ec4899"/><rect x="134" y="20" width="6" height="5" rx="1" fill="#fde047"/>'),
    g(4, '<rect x="140" y="27" width="13" height="15" rx="2" fill="#22c55e"/><path d="M146.5 27 V42 M140 33 H153" stroke="#fff" stroke-width="1.5"/>'),
    g(5, '<rect x="99" y="11" width="25" height="16" rx="2" fill="#1e1b4b" stroke="#fff" stroke-width="1.5"/><path d="M106 30 L111 27 L116 30" fill="none" stroke="#fff" stroke-width="1.5"/>'),
    g(6, '<path d="M127 6 h15 l5 6 -5 6 h-15 z" fill="#fde047" stroke="#fff" stroke-width="1.5"/><text x="135" y="15.5" font-size="8" font-weight="800" fill="#7c2d12" text-anchor="middle">R$</text>'),
  ].join("");
}

const CARRINHOS = {
  // Carrinho do logo: cesta amarela; os produtos ficam atrás dela e aparecem por cima
  logo: {
    mao: [75, 28],
    desenho: () => `${produtosNoCarrinho(0, 0)}
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
    desenho: () => `${produtosNoCarrinho(-8, 18)}
      <g fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round">
        <path d="M80 34 H154 L146 63 H88 Z" fill="rgba(255,255,255,.12)" stroke-width="3.5"/>
        <path d="M95 34 L98 63 M110 34 L111 63 M125 34 L124 63 M140 34 L136 63 M82 44 H151 M85 54 H148" stroke-width="1.5" opacity=".8"/>
        <path d="M72 30 L80 34 M88 63 L92 72 H144 L146 63 M98 72 V77 M138 72 V77" stroke-width="3.5"/>
      </g>
      <rect x="65" y="26" width="10" height="7" rx="3.5" fill="#ef4444" transform="rotate(25 70 29.5)"/>`,
    rodas: [[98, 84], [138, 84]],
    corRoda: "#ef4444",
  },
};

function desenharCabeca(p) {
  const pele = PERSONAGEM_OPCOES.pele.cores[p.pele];
  const cabelo = PERSONAGEM_OPCOES.corCabelo.cores[p.corCabelo];
  const atras = {
    rabo: `<g class="anim-rabo"><path d="M36 14 c-9 1 -12 9 -9 17 c2 -5 5 -8 10 -9z" fill="${cabelo}"/><circle cx="36" cy="14" r="2.5" fill="#f472b6"/></g>`,
    // Volume de cachos em volta da cabeça (mais atrás, porque ele olha para o carrinho)
    cacheado: `<g fill="${cabelo}">${[[34, 26, 5], [33, 19, 5.5], [35, 12, 5.5], [40, 7, 5.5], [46, 5.5, 5.5], [52, 7, 5], [56.5, 11.5, 4.5]]
      .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join("")}</g>`,
  }[p.cabelo] || "";
  const frente = {
    curto: `<path d="M35 18 a11 11 0 0 1 22 -2 c-6 -1 -12 -4 -14 -7 c-2 4 -5 7 -8 9z" fill="${cabelo}"/>`,
    rabo: `<path d="M35 19 a11 11 0 0 1 22 -3 c-4 0 -9 -2 -12 -6 c-3 4 -6 7 -10 9z" fill="${cabelo}"/>`,
    cacheado: `<g fill="${cabelo}">${[[37, 15, 3.5], [41, 11.5, 3.5], [46, 10.5, 3.5], [51, 11.5, 3.2], [55, 14, 2.8]]
      .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join("")}</g>`,
    careca: '<path d="M40 11 q4 -3 9 -1" fill="none" stroke="#fff" stroke-width="1.2" stroke-linecap="round" opacity=".5"/>',
  }[p.cabelo];
  const olhos = p.rosto === "piscadinha"
    ? '<g class="anim-olhos" fill="#1e1b4b"><path d="M41.5 20 q1.5 -1.5 3 0" fill="none" stroke="#1e1b4b" stroke-width="1.3" stroke-linecap="round"/><circle cx="50" cy="20" r="1.6"/></g>'
    : '<g class="anim-olhos" fill="#1e1b4b"><circle cx="43" cy="20" r="1.6"/><circle cx="50" cy="20" r="1.6"/></g>';
  const extra = {
    oculos: '<g fill="rgba(255,255,255,.25)" stroke="#1e1b4b" stroke-width="1.3"><circle cx="42.5" cy="20" r="3.3"/><circle cx="50.5" cy="20" r="3.3"/><path d="M45.8 20 H47.2" fill="none"/></g>',
    barba: `<path d="M35.5 20 c1 9 6 14 10.5 14 c4.5 0 9.5 -5 10.5 -14 c-2 4 -5 5 -7 4 c-2 -1 -5 -1 -7 0 c-2 1 -5 0 -7 -4z" fill="${cabelo}"/>`,
  }[p.rosto] || "";
  const bochechas = p.cabelo === "rabo" ? '<circle cx="41" cy="23.5" r="1.8" fill="#f472b6" opacity=".5"/><circle cx="52" cy="23.5" r="1.8" fill="#f472b6" opacity=".5"/>' : "";
  const boca = p.rosto === "barba" ? "" : '<path d="M44 25 q2.5 1.8 5 0" fill="none" stroke="#7c2d12" stroke-width="1.4" stroke-linecap="round"/>';
  return `<g class="anim-cabeca">${atras}<circle cx="46" cy="19" r="11" fill="${pele}"/>${frente}${olhos}${bochechas}${boca}${extra}</g>`;
}

function desenharPersonagem(p) {
  const pele = PERSONAGEM_OPCOES.pele.cores[p.pele];
  const roupa = PERSONAGEM_OPCOES.roupa.cores[p.roupa];
  const carrinho = CARRINHOS[p.carrinho];
  const [mx, my] = carrinho.mao;
  const perna = (cor, fase) => `<g class="anim-perna" style="--fase:${fase}"><path d="M45 62 V90" stroke="${cor}" stroke-width="7" stroke-linecap="round"/><path d="M44 92 H52" stroke="#fff" stroke-width="5" stroke-linecap="round"/></g>`;
  const roda = ([x, y]) => `<g class="anim-roda"><circle cx="${x}" cy="${y}" r="7" fill="#fff"/><path d="M${x} ${y - 5.5} V${y + 5.5} M${x - 5.5} ${y} H${x + 5.5}" stroke="${carrinho.corRoda}" stroke-width="2"/></g>`;
  return `<div class="anim-andando"><svg viewBox="0 0 165 100" aria-hidden="true">
  <g class="anim-vento" stroke="rgba(255,255,255,.7)" stroke-width="3" stroke-linecap="round">
    <path d="M2 50 H22"/><path d="M8 66 H26"/><path d="M0 82 H18"/>
  </g>
  <g class="anim-corpo">
    ${perna("#1e1b4b", "0s")}
    <path d="M50 39 L${mx} ${my + 1}" stroke="${escurecer(pele)}" stroke-width="5" stroke-linecap="round"/>
    <rect x="36" y="31" width="19" height="33" rx="8" fill="${roupa}"/>
    ${perna("#312e81", "-.25s")}
    <path d="M47 38 L${mx} ${my}" stroke="${pele}" stroke-width="5" stroke-linecap="round"/>
    ${desenharCabeca(p)}
    ${carrinho.desenho()}
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
  estado.q = q;
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
  $("#vazio").hidden = true;
  $("#grade").replaceChildren(...esqueletos(8));
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
      estado.corrigidaDe = q;
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
    desenharFiltroLojas();
    desenharResultados();
    completarSozinho(pedido);
  } catch (erro) {
    if (pedido !== estado.pedido) return;
    estado.buscando = false;
    estado.ofertas = [];
    $("#grade").replaceChildren();
    $("#vazio").hidden = true; // o "Ops!" do topo já explica
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
    // Só redesenha se o visitante continua no início (pode ter ido para uma busca)
    if (!estado.q && !$("#inicio").hidden) {
      estado.ofertas = estado.inicio;
      desenharFiltroLojas();
      desenharResultados();
    }
  } catch {
    if (!estado.q) toast("Não foi possível carregar mais ofertas agora");
  } finally {
    botao.disabled = false;
    botao.textContent = "Ver mais ofertas";
  }
}

// "Ver mais resultados": traz a próxima página da busca (Shopee) e junta à lista
// A busca chega aos poucos: o servidor responde com as primeiras páginas de cada loja (em poucos segundos)
// e o site pede as próximas sozinho, até ter uns 100 produtos (sem contar acessórios)
const PRODUTOS_DESEJADOS = 100;
const PEDIDOS_AUTOMATICOS = 3;
async function completarSozinho(pedido) {
  for (let i = 0; i < PEDIDOS_AUTOMATICOS; i++) {
    if (pedido !== estado.pedido || !estado.temMaisBusca) return;
    if (estado.ofertas.filter((o) => !o.acessorio).length >= PRODUTOS_DESEJADOS) return;
    await carregarMaisResultados({ sozinho: true });
  }
}

async function carregarMaisResultados({ sozinho = false } = {}) {
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
    // Produtos antes, acessórios (escondidos) no fim
    // Produtos que começam pelo que foi buscado ("Console PS5 …") na frente, depois os outros, acessórios no fim
    estado.ofertas = [...todas.filter((o) => o.principal), ...todas.filter((o) => !o.principal && !o.acessorio), ...todas.filter((o) => o.acessorio)];
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
      " e compara os preços num só lugar.", el("small", { class: "aviso-cupom" }, AVISO_CUPOM));
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
function tituloOfertas(carregando) {
  const h2 = $("#titulo-ofertas");
  h2.classList.toggle("carregando", carregando);
  h2.replaceChildren(...(carregando
    ? [el("span", { class: "lupa", "aria-hidden": "true" }, "🔍"), " Buscando ofertas do dia…"]
    : ["⚡ Ofertas do dia"]));
}

async function carregarDestaques() {
  const pedido = ++estado.pedido;
  estado.ofertas = [];
  $("#filtro-lojas").replaceChildren();
  $("#destaques").replaceChildren(...esqueletos(12));
  tituloOfertas(true);
  try {
    const dados = await consultarApi("");
    estado.inicio = semRepetidos(dados.ofertas);
    estado.temMaisInicio = Boolean(dados.temMais);
    tituloOfertas(false);
    if (pedido !== estado.pedido) return; // a pessoa já foi para uma busca
    $("#aviso-teste").hidden = !dados.exemplo;
    mostrarInicio();
  } catch {
    tituloOfertas(false);
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
    const { itens = [], categorias = [] } = await (await fetch("/api/em-alta?v=4")).json();
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
  // Categoria fixa (Eletrodomésticos) continua em 1º também em A–Z
  if (ordemCategorias === "az") lista = [...lista].sort((a, b) => Boolean(b.fixa) - Boolean(a.fixa) || a.nome.localeCompare(b.nome, "pt-BR"));
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
  if (!(params.get("q") || "").trim()) return null;
  return params.get("cat") || null;
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
// No celular os exemplos ("air fryer…") eram cortados: lá fica só o começo (pedido do Giovanni)
const PLACEHOLDER_BUSCA = $("[data-busca] input").placeholder;
const PLACEHOLDER_CURTO = "Busque e compare preços";
const telaPequena = matchMedia("(max-width: 640px)");
function marcarCategoria() {
  const cat = categoriaAtual();
  document.querySelectorAll(".cat-item").forEach((b) => b.classList.toggle("ativa", b.dataset.nome === cat));
  const padrao = telaPequena.matches ? PLACEHOLDER_CURTO : PLACEHOLDER_BUSCA;
  document.querySelectorAll("[data-busca] input").forEach((i) => { i.placeholder = cat ? `Buscar em ${cat}…` : padrao; });
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
  estado.exato = new URLSearchParams(location.search).has("exato");
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
function irPara(q, { atalho = false, cat = null, exato = false } = {}) {
  q = (q || "").trim();
  estado.atalho = atalho;
  const url = q ? `?q=${encodeURIComponent(q)}${cat ? `&cat=${encodeURIComponent(cat)}` : ""}${exato ? "&exato=1" : ""}` : location.pathname;
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
  fetch("/api/vocabulario").then((r) => (r.ok ? r.json() : null)).then((d) => {
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
const bateComeco = (u, w, minimo = 4) => w.startsWith(u) || (u.length >= minimo && distancia(u, w.slice(0, u.length), 1) <= 1);

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
  for (const item of vocab.itens) {
    if (!completas.every((p) => item.p.some((w) => bateInteira(p, w)))) continue;
    const minimo = completas.length ? 3 : 4;
    if (ultima && !item.p.some((w) => bateComeco(ultima, w, minimo) || bateComeco(ultimaCerta, w, minimo))) continue;
    achados.push({ t: item.t, comeca: item.n.startsWith(limpo(corrigido)) || item.n.startsWith(digitado) });
  }
  const primeiro = achados.filter((a) => a.comeca);
  primeiro.slice(0, 5).forEach((a) => incluir(a.t));

  // 3) Marca no fim: "maquina de lavar ele" -> "maquina de lavar electrolux"; sozinha: "sams" -> "samsung"
  if (ultima) {
    const antes = corrigidas.slice(0, -1).join(" ");
    vocab.marcasN
      .filter((x) => x.n.startsWith(ultima) || x.n === ultimaCerta || (ultima.length >= 4 && bateComeco(ultima, x.n)))
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

  function desenhar() {
    if (document.activeElement !== input) return;
    itens = sugerir(input.value);
    if (!itens.length) return fechar();
    lista.replaceChildren(...itens.map((s, n) => el("li", {
      role: "option", id: `${idLista}-${n}`, "aria-selected": "false",
      onmousedown: (e) => { e.preventDefault(); input.value = s; fechar(); irPara(s, { cat: categoriaAtual() }); },
    }, textoSugestao(s, input.value))));
    ativo = -1;
    lista.hidden = false;
    input.setAttribute("aria-expanded", "true");
    input.removeAttribute("aria-activedescendant");
  }

  input.addEventListener("input", desenhar);
  input.addEventListener("focus", carregarVocabulario);
  vocab.aoChegar.push(() => { if (input.value.trim()) desenhar(); });
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
    input.blur();
    // Busca vazia: volta para as "Ofertas do dia" (como clicar no logo)
    if (!input.value.trim()) return irPara("");
    irPara(input.value, { cat: categoriaAtual() });
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
document.querySelectorAll("[data-inicio]").forEach((a) => a.addEventListener("click", (e) => {
  e.preventDefault();
  zerarFiltros();
  $("input[name=ordem][value=relevancia]").checked = true;
  document.querySelectorAll("[data-busca] input").forEach((i) => { i.value = ""; });
  irPara("");
}));

let timerPreco;
["#preco-min", "#preco-max"].forEach((s) => $(s).addEventListener("input", () => {
  clearTimeout(timerPreco);
  timerPreco = setTimeout(desenharResultados, 300);
}));
["#so-frete", "#so-desconto"].forEach((s) => $(s).addEventListener("change", desenharResultados));
// Mostrar/esconder acessórios muda também a contagem de cada loja
$("#com-acessorios").addEventListener("change", () => { desenharFiltroLojas(); desenharResultados(); });
document.querySelectorAll("[data-frete]").forEach((b) => b.addEventListener("click", () => {
  $("#so-frete").checked = !$("#so-frete").checked;
  desenharResultados();
}));
$("#ver-acessorios").addEventListener("click", () => { $("#com-acessorios").checked = true; desenharFiltroLojas(); desenharResultados(); });
document.querySelectorAll("input[name=ordem], input[name=envio]").forEach((r) => r.addEventListener("change", desenharResultados));
function zerarFiltros() {
  $("#preco-min").value = "";
  $("#preco-max").value = "";
  $("#so-frete").checked = false;
  $("#so-desconto").checked = false;
  $("#com-acessorios").checked = false;
  $("input[name=envio][value=todos]").checked = true;
  estado.lojasDesmarcadas.clear();
  zerarSecoes();
}
$("#limpar-filtros").addEventListener("click", () => {
  zerarFiltros();
  $("input[name=ordem][value=relevancia]").checked = true;
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
$("#mais-resultados").addEventListener("click", () => carregarMaisResultados());
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

// Voltar do celular: fecha a gaveta, o carrinho e as janelas abertas antes de trocar a página
window.addEventListener("popstate", () => {
  abrirFiltros(false);
  abrirPainel(false);
  document.querySelectorAll("dialog[open]").forEach((j) => j.close());
  mostrar();
});

$("#ano").textContent = new Date().getFullYear();

montarInicio();
atualizarFavoritos();
mostrar();
carregarConta();
