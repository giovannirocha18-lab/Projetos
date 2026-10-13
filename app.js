const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

let categoriaAtiva = "Todos";
let termoBusca = "";

function el(tag, classe, texto) {
  const node = document.createElement(tag);
  if (classe) node.className = classe;
  if (texto != null) node.textContent = texto;
  return node;
}

function semAcento(s) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function montarCabecalho() {
  document.title = SITE.nome;
  document.getElementById("site-nome").textContent = SITE.nome;
  document.getElementById("site-slogan").textContent = SITE.slogan;
  document.getElementById("rodape-nome").textContent = SITE.nome;
  document.getElementById("ano").textContent = new Date().getFullYear();

  const sociais = document.getElementById("sociais");
  [["Instagram", SITE.instagram], ["Grupo de ofertas no WhatsApp", SITE.whatsapp]]
    .filter(([, url]) => url)
    .forEach(([nome, url]) => {
      const a = el("a", "social", nome);
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener";
      sociais.appendChild(a);
    });
}

function montarCategorias() {
  const nomes = ["Todos", ...new Set(PRODUTOS.map((p) => p.categoria))];
  const box = document.getElementById("categorias");
  box.innerHTML = "";
  nomes.forEach((nome) => {
    const b = el("button", "chip", nome);
    b.type = "button";
    b.setAttribute("aria-pressed", nome === categoriaAtiva);
    b.addEventListener("click", () => {
      categoriaAtiva = nome;
      montarCategorias();
      renderizar();
    });
    box.appendChild(b);
  });
}

function cartao(p) {
  const card = el("article", "card");

  const foto = el("div", "foto");
  if (p.imagem) {
    const img = el("img");
    img.src = p.imagem;
    img.alt = p.titulo;
    img.loading = "lazy";
    foto.appendChild(img);
  } else {
    foto.appendChild(el("span", "foto-vazia", p.titulo.charAt(0)));
  }
  if (p.destaque) foto.appendChild(el("span", "selo", "Destaque"));
  if (p.preco && p.precoAntigo > p.preco) {
    const pct = Math.round((1 - p.preco / p.precoAntigo) * 100);
    foto.appendChild(el("span", "selo selo-desconto", `-${pct}%`));
  }
  card.appendChild(foto);

  const corpo = el("div", "corpo");
  corpo.appendChild(el("span", "categoria", p.categoria));
  corpo.appendChild(el("h2", "titulo", p.titulo));
  if (p.descricao) corpo.appendChild(el("p", "descricao", p.descricao));

  if (p.preco) {
    const precos = el("div", "precos");
    if (p.precoAntigo > p.preco) precos.appendChild(el("s", "preco-antigo", brl.format(p.precoAntigo)));
    precos.appendChild(el("span", "preco", brl.format(p.preco)));
    corpo.appendChild(precos);
  }

  const botao = el("a", "botao", "Ver no Mercado Livre");
  botao.href = p.link;
  botao.target = "_blank";
  // "sponsored" informa ao Google que é link de afiliado (evita penalização de SEO)
  botao.rel = "sponsored noopener";
  corpo.appendChild(botao);

  card.appendChild(corpo);
  return card;
}

function renderizar() {
  const termo = semAcento(termoBusca.trim());
  const lista = PRODUTOS
    .filter((p) => categoriaAtiva === "Todos" || p.categoria === categoriaAtiva)
    .filter((p) => !termo || semAcento(`${p.titulo} ${p.descricao || ""} ${p.categoria}`).includes(termo))
    .sort((a, b) => (b.destaque ? 1 : 0) - (a.destaque ? 1 : 0));

  const grade = document.getElementById("grade");
  grade.replaceChildren(...lista.map(cartao));
  document.getElementById("vazio").hidden = lista.length > 0;
}

document.getElementById("busca").addEventListener("input", (e) => {
  termoBusca = e.target.value;
  renderizar();
});

montarCabecalho();
montarCategorias();
renderizar();
