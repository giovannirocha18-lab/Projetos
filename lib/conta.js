// =====================================================================
// CONTAS — "Entrar com Google" ou cadastro com e-mail e senha (com "Esqueci
// minha senha" por link no e-mail) e o "Meu carrinho" salvo na conta.
//
// Precisa, no Cloudflare (projeto > Settings):
//   - Bindings: banco D1 com o nome de variável DB
//   - Variables and Secrets: RESEND_API_KEY (Secret), chave do resend.com (e-mail de nova senha)
//   - Opcional: EMAIL_REMETENTE, ex.: "Vai pro Carrinho <nao-responda@vaiprocarrinho.com.br>"
//     (só depois de verificar o domínio no Resend)
//   - Opcional: GOOGLE_CLIENT_ID (variável) e GOOGLE_CLIENT_SECRET (Secret) para "Entrar com Google"
// Sem o banco, o site esconde o botão de entrar e tudo continua funcionando.
// =====================================================================

const MINUTO = 60 * 1000;
const HORA = 60 * MINUTO;
export const LINK_VALIDADE = HORA;
const PBKDF2_REPETICOES = 100000; // máximo aceito pelo Cloudflare
const SESSAO_DIAS = 90;
const COOKIE = "vpc_sessao";
export const COOKIE_GOOGLE = "vpc_google";
const CARRINHO_MAX = 100;

const TABELAS = [
  `CREATE TABLE IF NOT EXISTS usuarios (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     email TEXT NOT NULL UNIQUE,
     nome TEXT NOT NULL,
     criado_em INTEGER NOT NULL)`,
  // Senha de quem se cadastrou com e-mail. email_confirmado = 1 depois que a pessoa
  // usa o link de nova senha (prova que o e-mail é dela)
  `CREATE TABLE IF NOT EXISTS senhas (
     usuario_id INTEGER PRIMARY KEY,
     hash TEXT NOT NULL,
     email_confirmado INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS redefinicoes (
     token_hash TEXT PRIMARY KEY,
     usuario_id INTEGER NOT NULL,
     expira_em INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS limites (
     chave TEXT PRIMARY KEY,
     inicio INTEGER NOT NULL,
     contagem INTEGER NOT NULL)`,
  // Tabela do antigo login por código, que não é mais usado
  "DROP TABLE IF EXISTS codigos",
  `CREATE TABLE IF NOT EXISTS sessoes (
     token_hash TEXT PRIMARY KEY,
     usuario_id INTEGER NOT NULL,
     expira_em INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS carrinhos (
     usuario_id INTEGER PRIMARY KEY,
     itens TEXT NOT NULL,
     atualizado_em INTEGER NOT NULL)`,
  // Personagem da animação de busca que a pessoa montou (cabelo, pele, rosto, roupa, carrinho). Opcional.
  `CREATE TABLE IF NOT EXISTS personagens (
     usuario_id INTEGER PRIMARY KEY,
     dados TEXT NOT NULL)`,
];

// Cria as tabelas na primeira vez (não precisa mexer no painel do D1)
let tabelasProntas = false;
export async function banco(env) {
  if (!env.DB) return null;
  if (!tabelasProntas) {
    await env.DB.batch(TABELAS.map((sql) => env.DB.prepare(sql)));
    tabelasProntas = true;
  }
  return env.DB;
}

export function responder(dados, status = 200, cabecalhos = {}) {
  return new Response(JSON.stringify(dados), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
      ...cabecalhos,
    },
  });
}

export const erro = (mensagem, status = 400) => responder({ erro: mensagem }, status);

export const SEM_BANCO = () => erro("O cadastro ainda não está ligado.", 503);

export async function sha256(texto) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const hex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
const deHex = (texto) => new Uint8Array(texto.match(/../g).map((h) => parseInt(h, 16)));
export const tokenAleatorio = () => hex(crypto.getRandomValues(new Uint8Array(32)));

export const ehLocal = (request) => ["localhost", "127.0.0.1"].includes(new URL(request.url).hostname);

// Pedidos que mudam dados só valem se vierem do próprio site (proteção contra
// outro site tentar agir em nome do visitante)
export async function lerJson(request) {
  // "Origin: null" (ou outro valor estranho) não é endereço: conta como outro site
  let origem;
  try {
    origem = new URL(request.headers.get("Origin")).host;
  } catch {
    return null;
  }
  if (origem !== new URL(request.url).host) return null;
  if (!(request.headers.get("Content-Type") || "").includes("application/json")) return null;
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export function validarEmail(email) {
  email = String(email || "").trim().toLowerCase();
  // Só os caracteres que existem em e-mails de verdade (sem %, aspas, espaços, < >…)
  return email.length <= 254 && /^[a-z0-9.!#$&'*+/=?^_`{|}~-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(email) ? email : null;
}

export function validarNome(nome) {
  nome = String(nome || "").replace(/\s+/g, " ").trim();
  return nome.length >= 1 && nome.length <= 60 ? nome : null;
}

export const SENHA_MINIMO = 8;
export function validarSenha(senha) {
  return typeof senha === "string" && senha.length >= SENHA_MINIMO && senha.length <= 128 ? senha : null;
}

// ---------------------------------------------------------------------
// Senha: guardada embaralhada (PBKDF2), nunca a senha em si
// ---------------------------------------------------------------------
async function derivar(senha, sal, repeticoes) {
  const chave = await crypto.subtle.importKey("raw", new TextEncoder().encode(senha), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: sal, iterations: repeticoes }, chave, 256);
  return hex(new Uint8Array(bits));
}

export async function embaralharSenha(senha) {
  const sal = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${PBKDF2_REPETICOES}$${hex(sal)}$${await derivar(senha, sal, PBKDF2_REPETICOES)}`;
}

// Senha "de mentira" com o mesmo custo de uma de verdade (nunca confere). Usada quando o
// e-mail não tem conta ou senha, para a resposta demorar igual e não revelar quem tem cadastro
export const SENHA_FALSA = `pbkdf2$${PBKDF2_REPETICOES}$${"00".repeat(16)}$${"00".repeat(32)}`;

export async function conferirSenha(senha, guardada) {
  const [tipo, repeticoes, sal, hash] = String(guardada).split("$");
  if (tipo !== "pbkdf2") return false;
  return (await derivar(senha, deHex(sal), Number(repeticoes))) === hash;
}

// ---------------------------------------------------------------------
// Limite de tentativas (contra quem tenta adivinhar senhas ou lotar e-mails)
// Devolve true se ainda pode; conta mais uma tentativa
// ---------------------------------------------------------------------
export const LIMITES_GUARDADOS = 24 * HORA; // depois disso as linhas de limite são apagadas

export async function dentroDoLimite(db, chave, maximo, janela = HORA) {
  const agora = Date.now();
  // Um comando só (atômico): cria a linha, soma 1 ou recomeça a contagem se a janela acabou.
  // Assim 50 pedidos ao mesmo tempo não passam todos pela conferência antes de alguém somar
  const linha = await db.prepare(
    `INSERT INTO limites (chave, inicio, contagem) VALUES (?, ?, 1)
     ON CONFLICT(chave) DO UPDATE SET
       contagem = CASE WHEN ? - inicio >= ? THEN 1 ELSE contagem + 1 END,
       inicio = CASE WHEN ? - inicio >= ? THEN ? ELSE inicio END
     RETURNING contagem`,
  ).bind(chave, agora, agora, janela, agora, janela, agora).first();
  // Janela nova: aproveita para apagar as linhas velhas (IP e e-mail não ficam guardados à toa)
  if (linha.contagem === 1) {
    await db.prepare("DELETE FROM limites WHERE inicio < ?").bind(agora - LIMITES_GUARDADOS).run();
  }
  return linha.contagem <= maximo;
}

// Chaves de limite ligadas a um e-mail (apagadas junto com a conta)
export const chavesDoEmail = (email) => [`entrar:${email}`, `esqueci:${email}`, `esqueci-1min:${email}`];

export const ipDe = (request) => request.headers.get("CF-Connecting-IP") || "local";

// ---------------------------------------------------------------------
// Sessão (cookie que mantém a pessoa conectada)
// ---------------------------------------------------------------------
export function lerCookie(request, nome = COOKIE) {
  const cookies = request.headers.get("Cookie") || "";
  const achado = cookies.split(/;\s*/).find((c) => c.startsWith(`${nome}=`));
  if (!achado) return null;
  try {
    return decodeURIComponent(achado.slice(nome.length + 1));
  } catch {
    return null;
  }
}

const cookieSessao = (token, segundos) =>
  `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${segundos}`;

export const cookieApagar = () => cookieSessao("", 0);

// "Entrar com Google": cookie curto que guarda o código anti-fraude e a página de volta
export const cookieGoogle = (valor, segundos) =>
  `${COOKIE_GOOGLE}=${encodeURIComponent(valor)}; Path=/api/conta/google; HttpOnly; Secure; SameSite=Lax; Max-Age=${segundos}`;

export const enderecoRetornoGoogle = (request) => `${new URL(request.url).origin}/api/conta/google/retorno`;

// Só aceita voltar para uma página do próprio site
export const caminhoSeguro = (caminho) =>
  typeof caminho === "string" && /^\/(?![\/\\])[\w\-./]*$/.test(caminho) ? caminho : "/";

export async function criarSessao(db, usuarioId) {
  const token = tokenAleatorio();
  const agora = Date.now();
  await db.batch([
    db.prepare("DELETE FROM sessoes WHERE expira_em < ?").bind(agora),
    db.prepare("INSERT INTO sessoes (token_hash, usuario_id, expira_em) VALUES (?, ?, ?)")
      .bind(await sha256(token), usuarioId, agora + SESSAO_DIAS * 24 * 60 * MINUTO),
  ]);
  return cookieSessao(token, SESSAO_DIAS * 24 * 60 * 60);
}

export async function usuarioDaSessao(db, request) {
  const token = lerCookie(request);
  if (!token) return null;
  const tokenHash = await sha256(token);
  const usuario = await db.prepare(
    `SELECT u.id, u.nome, u.email FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id
     WHERE s.token_hash = ? AND s.expira_em > ?`,
  ).bind(tokenHash, Date.now()).first();
  return usuario ? { ...usuario, tokenHash } : null;
}

// ---------------------------------------------------------------------
// Carrinho: guarda só os campos que o site usa, com limite de tamanho
// ---------------------------------------------------------------------
const texto = (v, max) => (typeof v === "string" ? v.slice(0, max) : null);
const linkSeguro = (v) => (typeof v === "string" && /^https?:\/\//i.test(v) ? v.slice(0, 1000) : null);

export function limparCarrinho(itens) {
  if (!Array.isArray(itens)) return null;
  const vistos = new Set();
  const limpos = [];
  for (const i of itens) {
    if (!i || typeof i !== "object") continue;
    const id = texto(i.id, 100);
    const link = linkSeguro(i.link);
    const preco = Number(i.preco);
    if (!id || !link || !Number.isFinite(preco) || vistos.has(id)) continue;
    vistos.add(id);
    limpos.push({
      id,
      titulo: texto(i.titulo, 200) || "",
      preco,
      loja: texto(i.loja, 30) || "",
      lojaNome: texto(i.lojaNome, 60),
      link,
      imagem: linkSeguro(i.imagem),
      emoji: texto(i.emoji, 8),
      categoria: texto(i.categoria, 40),
    });
    if (limpos.length >= CARRINHO_MAX) break;
  }
  return limpos;
}

// Personagem: só valores da lista (o site desenha a partir deles). Mesmas opções do PERSONAGEM_OPCOES do app.js
const OPCOES_PERSONAGEM = {
  cabelo: ["curto", "rabo", "cacheado", "careca"],
  corCabelo: ["preto", "castanho", "loiro", "ruivo", "grisalho"],
  pele: ["clara", "media", "morena", "parda", "negra"],
  rosto: ["sorriso", "oculos", "barba", "piscadinha"],
  roupa: ["amarelo", "verde", "azul", "vermelho", "rosa", "preto"],
  carrinho: ["logo", "grade"],
};
export function limparPersonagem(p) {
  if (!p || typeof p !== "object") return null;
  const limpo = {};
  for (const [campo, valores] of Object.entries(OPCOES_PERSONAGEM)) {
    if (!valores.includes(p[campo])) return null;
    limpo[campo] = p[campo];
  }
  return limpo;
}

export async function lerPersonagem(db, usuarioId) {
  const linha = await db.prepare("SELECT dados FROM personagens WHERE usuario_id = ?").bind(usuarioId).first();
  return linha ? JSON.parse(linha.dados) : null;
}

export async function lerCarrinho(db, usuarioId) {
  const linha = await db.prepare("SELECT itens FROM carrinhos WHERE usuario_id = ?").bind(usuarioId).first();
  return linha ? JSON.parse(linha.itens) : [];
}

export async function salvarCarrinho(db, usuarioId, itens) {
  await db.prepare(
    `INSERT INTO carrinhos (usuario_id, itens, atualizado_em) VALUES (?, ?, ?)
     ON CONFLICT(usuario_id) DO UPDATE SET itens = excluded.itens, atualizado_em = excluded.atualizado_em`,
  ).bind(usuarioId, JSON.stringify(itens), Date.now()).run();
}

// ---------------------------------------------------------------------
// E-mail com o link para criar uma nova senha (pelo resend.com)
// ---------------------------------------------------------------------
export async function enviarLinkSenha(env, request, email, nome, link) {
  if (!env.RESEND_API_KEY) {
    // No computador (wrangler pages dev) o link aparece no terminal
    if (ehLocal(request)) {
      console.log(`[teste] link de nova senha para ${email}: ${link}`);
      return true;
    }
    return false;
  }
  const primeiroNome = nome.split(" ")[0];
  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.EMAIL_REMETENTE || "Vai pro Carrinho <onboarding@resend.dev>",
      to: [email],
      subject: "Crie uma nova senha no Vai pro Carrinho",
      text: `Olá, ${primeiroNome}!\n\nPara criar uma nova senha, abra este link:\n${link}\n\nEle vale por 1 hora. Se não foi você que pediu, é só ignorar este e-mail.`,
      html: `<div style="font-family:Arial,sans-serif;max-width:420px;margin:auto;color:#1a1530">
        <h2 style="color:#6d28d9">🛒 Vai pro Carrinho</h2>
        <p>Olá, ${primeiroNome.replace(/[<>&"]/g, "")}!</p>
        <p>Para criar uma nova senha, clique no botão:</p>
        <p style="text-align:center"><a href="${link}" style="display:inline-block;background:#6d28d9;color:#fff;padding:12px 24px;border-radius:12px;text-decoration:none;font-weight:bold">Criar nova senha</a></p>
        <p style="color:#625d78;font-size:14px">O link vale por 1 hora. Se não foi você que pediu, é só ignorar este e-mail.</p>
      </div>`,
    }),
  });
  if (!resp.ok) console.log(`Resend respondeu ${resp.status}: ${await resp.text()}`);
  return resp.ok;
}

// Resposta de "entrou na conta": cria a sessão e devolve os dados + carrinho
export async function respostaConectado(db, usuario) {
  const cookie = await criarSessao(db, usuario.id);
  return responder(
    { ativo: true, usuario: { nome: usuario.nome, email: usuario.email, personagem: await lerPersonagem(db, usuario.id) }, carrinho: await lerCarrinho(db, usuario.id) },
    200,
    { "Set-Cookie": cookie },
  );
}
