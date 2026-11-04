// Conta do Mercado Livre conectada ao app (04/11/2026, teste pedido pelo Giovanni).
// Com o token só do app (client_credentials, lib/fontes/mercadolivre.js) a busca de anúncios (/sites/MLB/search) e os
// anúncios (/items) dão 403. Aqui o Giovanni autoriza o app UMA vez, logado na conta PJ ("Authorization Code"), e o site
// passa a ter um token "da conta", para testar se esses endereços abrem.
// Fluxo: painel → /api/painel/ml-conectar (gera "state" + PKCE, guarda no banco, manda para o Mercado Livre) → Giovanni
// aperta "Permitir" → o Mercado Livre volta para https://vaiprocarrinho.com.br/?code=…&state=… (endereço cadastrado no app)
// → functions/_middleware.js chama concluirAutorizacao (só aceita um "state" criado pelo painel nos últimos 15 minutos,
// e uma vez só) → painel /api/painel/ml-conta mostra o teste.
// Os tokens ficam no banco CRIPTOGRAFADOS (AES-GCM, chave tirada do Secret ML_CLIENT_SECRET, que nunca sai do servidor).
// O "refresh token" do Mercado Livre vale 6 meses e muda a cada renovação: guardamos sempre o novo.

const API = "https://api.mercadolibre.com";
const AUTORIZAR = "https://auth.mercadolivre.com.br/authorization";
export const VOLTA_ML = "https://vaiprocarrinho.com.br/"; // igual ao "URI de redirect" cadastrado no app do Mercado Livre
const VALE_STATE_MS = 15 * 60 * 1000;

const base64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const aleatorio = (n) => base64url(crypto.getRandomValues(new Uint8Array(n)));

async function tabelas(db) {
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS ml_oauth (state TEXT PRIMARY KEY, verificador TEXT NOT NULL, criado INTEGER NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS ml_conta (id INTEGER PRIMARY KEY, dados TEXT NOT NULL, atualizado INTEGER NOT NULL)"),
  ]);
}

async function chave(env) {
  const bruto = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`ml-conta|${env.ML_CLIENT_SECRET}`));
  return crypto.subtle.importKey("raw", bruto, "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function cifrar(env, objeto) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const dados = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await chave(env), new TextEncoder().encode(JSON.stringify(objeto)));
  return `${base64url(iv)}.${base64url(dados)}`;
}
const deBase64url = (t) => Uint8Array.from(atob(t.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
async function decifrar(env, texto) {
  const [iv, dados] = String(texto).split(".");
  const claro = await crypto.subtle.decrypt({ name: "AES-GCM", iv: deBase64url(iv) }, await chave(env), deBase64url(dados));
  return JSON.parse(new TextDecoder().decode(claro));
}

// Endereço da tela "Permitir" do Mercado Livre (com state e PKCE guardados no banco)
export async function iniciarAutorizacao(env) {
  await tabelas(env.DB);
  const state = aleatorio(24);
  const verificador = aleatorio(48);
  const desafio = base64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verificador)));
  await env.DB.batch([
    env.DB.prepare("DELETE FROM ml_oauth WHERE criado < ?").bind(Date.now() - VALE_STATE_MS),
    env.DB.prepare("INSERT INTO ml_oauth (state, verificador, criado) VALUES (?, ?, ?)").bind(state, verificador, Date.now()),
  ]);
  const u = new URL(AUTORIZAR);
  u.search = new URLSearchParams({ response_type: "code", client_id: env.ML_CLIENT_ID, redirect_uri: VOLTA_ML, state,
    code_challenge: desafio, code_challenge_method: "S256" }).toString();
  return u.toString();
}

async function pedirToken(env, campos) {
  const r = await fetch(`${API}/oauth/token`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ client_id: env.ML_CLIENT_ID, client_secret: env.ML_CLIENT_SECRET, ...campos }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) throw new Error(`Mercado Livre: token ${r.status} ${d.message || d.error || ""}`.trim());
  return { access: d.access_token, refresh: d.refresh_token || null, usuario: d.user_id || null,
    ate: Date.now() + Math.max(60, (Number(d.expires_in) || 21600) - 300) * 1000, escopo: d.scope || "" };
}
async function guardar(env, conta) {
  await env.DB.prepare("INSERT OR REPLACE INTO ml_conta (id, dados, atualizado) VALUES (1, ?, ?)").bind(await cifrar(env, conta), Date.now()).run();
}

// Volta do Mercado Livre: troca o "code" pelos tokens. Devolve null se o state não foi criado pelo painel (ignorado)
export async function concluirAutorizacao(env, code, state) {
  if (!env.DB || !code || !state || !env.ML_CLIENT_ID || !env.ML_CLIENT_SECRET) return null;
  let linha = null;
  try {
    linha = await env.DB.prepare("SELECT verificador, criado FROM ml_oauth WHERE state = ?").bind(state).first();
  } catch {
    return null; // tabela ainda não existe: ninguém começou pelo painel
  }
  if (!linha) return null;
  await env.DB.prepare("DELETE FROM ml_oauth WHERE state = ?").bind(state).run(); // uma vez só
  if (Date.now() - linha.criado > VALE_STATE_MS) return { ok: false, erro: "autorização vencida (mais de 15 minutos): comece de novo pelo painel" };
  try {
    const conta = await pedirToken(env, { grant_type: "authorization_code", code, redirect_uri: VOLTA_ML, code_verifier: linha.verificador });
    await guardar(env, conta);
    return { ok: true, usuario: conta.usuario };
  } catch (e) {
    return { ok: false, erro: String(e?.message || e) };
  }
}

// Token da conta (renova sozinho). null = conta não conectada
export async function tokenDaConta(env) {
  if (!env.DB) return null;
  let linha = null;
  try {
    linha = await env.DB.prepare("SELECT dados FROM ml_conta WHERE id = 1").first();
  } catch {
    return null;
  }
  if (!linha) return null;
  let conta = await decifrar(env, linha.dados);
  if (Date.now() >= conta.ate && conta.refresh) {
    conta = { ...conta, ...(await pedirToken(env, { grant_type: "refresh_token", refresh_token: conta.refresh })) };
    await guardar(env, conta);
  }
  return conta;
}
