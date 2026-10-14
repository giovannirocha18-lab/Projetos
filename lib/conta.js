// =====================================================================
// CONTAS — cadastro sem senha (nome + e-mail + código enviado por e-mail,
// ou "Entrar com Google") e o "Meu carrinho" salvo na conta.
//
// Precisa, no Cloudflare (projeto > Settings):
//   - Bindings: banco D1 com o nome de variável DB
//   - Variables and Secrets: RESEND_API_KEY (Secret), chave do resend.com
//   - Opcional: EMAIL_REMETENTE, ex.: "Vai pro Carrinho <nao-responda@vaiprocarrinho.com.br>"
//     (só depois de verificar o domínio no Resend)
//   - Opcional: GOOGLE_CLIENT_ID (variável) e GOOGLE_CLIENT_SECRET (Secret) para "Entrar com Google"
// Sem o banco, o site esconde o botão de entrar e tudo continua funcionando.
// =====================================================================

const MINUTO = 60 * 1000;
export const CODIGO_VALIDADE = 10 * MINUTO;
export const CODIGO_TENTATIVAS = 5;
export const ENVIO_INTERVALO = MINUTO;
export const ENVIOS_POR_HORA = 5;
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
  `CREATE TABLE IF NOT EXISTS codigos (
     email TEXT PRIMARY KEY,
     nome TEXT NOT NULL,
     codigo_hash TEXT NOT NULL,
     expira_em INTEGER NOT NULL,
     tentativas INTEGER NOT NULL,
     enviado_em INTEGER NOT NULL,
     hora_inicio INTEGER NOT NULL,
     envios_hora INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS sessoes (
     token_hash TEXT PRIMARY KEY,
     usuario_id INTEGER NOT NULL,
     expira_em INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS carrinhos (
     usuario_id INTEGER PRIMARY KEY,
     itens TEXT NOT NULL,
     atualizado_em INTEGER NOT NULL)`,
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

export function codigoAleatorio() {
  const [n] = crypto.getRandomValues(new Uint32Array(1));
  return String(n % 1000000).padStart(6, "0");
}

export const ehLocal = (request) => ["localhost", "127.0.0.1"].includes(new URL(request.url).hostname);

// Pedidos que mudam dados só valem se vierem do próprio site (proteção contra
// outro site tentar agir em nome do visitante)
export async function lerJson(request) {
  const origem = request.headers.get("Origin");
  if (!origem || new URL(origem).host !== new URL(request.url).host) return null;
  if (!(request.headers.get("Content-Type") || "").includes("application/json")) return null;
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export function validarEmail(email) {
  email = String(email || "").trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export function validarNome(nome) {
  nome = String(nome || "").replace(/\s+/g, " ").trim();
  return nome.length >= 1 && nome.length <= 60 ? nome : null;
}

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
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
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
      link,
      imagem: linkSeguro(i.imagem),
      emoji: texto(i.emoji, 8),
      categoria: texto(i.categoria, 40),
    });
    if (limpos.length >= CARRINHO_MAX) break;
  }
  return limpos;
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
// E-mail com o código (pelo resend.com)
// ---------------------------------------------------------------------
export async function enviarCodigo(env, request, email, nome, codigo) {
  if (!env.RESEND_API_KEY) {
    // No computador (wrangler pages dev) o código aparece no terminal
    if (ehLocal(request)) {
      console.log(`[teste] código para ${email}: ${codigo}`);
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
      subject: `${codigo} é o seu código do Vai pro Carrinho`,
      text: `Olá, ${primeiroNome}!\n\nSeu código para entrar no Vai pro Carrinho é: ${codigo}\n\nEle vale por 10 minutos. Se não foi você que pediu, é só ignorar este e-mail.`,
      html: `<div style="font-family:Arial,sans-serif;max-width:420px;margin:auto;color:#1a1530">
        <h2 style="color:#6d28d9">🛒 Vai pro Carrinho</h2>
        <p>Olá, ${primeiroNome.replace(/[<>&"]/g, "")}!</p>
        <p>Seu código para entrar é:</p>
        <p style="font-size:32px;font-weight:bold;letter-spacing:6px;background:#ede9fe;padding:12px;text-align:center;border-radius:12px">${codigo}</p>
        <p style="color:#625d78;font-size:14px">Ele vale por 10 minutos. Se não foi você que pediu, é só ignorar este e-mail.</p>
      </div>`,
    }),
  });
  if (!resp.ok) console.log(`Resend respondeu ${resp.status}: ${await resp.text()}`);
  return resp.ok;
}
