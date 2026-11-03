// Painel do Giovanni (painel.vaiprocarrinho.com.br, 03/11/2026). Quem protege é o Cloudflare Access (Zero Trust):
// antes de chegar ao site, o Cloudflare pede o e-mail e manda um código; só os e-mails da política "Giovanni" entram.
// Depois do login, o Cloudflare manda em cada pedido um "passe" assinado (cabeçalho Cf-Access-Jwt-Assertion).
// Aqui o site confere esse passe (segunda camada): assinatura com as chaves públicas do time, aplicação certa (aud),
// emissor certo e validade. Sem passe válido, nada do painel abre, nem os números.
// O nome do time e o código da aplicação (AUD) não são segredo (aparecem no endereço da tela de login);
// podem ser trocados pelas variáveis ACCESS_EQUIPE e ACCESS_AUD do Pages.
const EQUIPE_PADRAO = "cool-butterfly-7f2a";
const AUD_PADRAO = "49834f3a5fff3ae25173f2d20be358006651811a9f4630a0eabc6d3d10b591e8";

export const HOST_PAINEL = "painel.vaiprocarrinho.com.br";
export const ehPainel = (url) => new URL(url).hostname === HOST_PAINEL;

const chaves = { lista: null, quando: 0 };
async function chavesPublicas(equipe, renovar = false) {
  if (!renovar && chaves.lista && Date.now() - chaves.quando < 60 * 60 * 1000) return chaves.lista;
  const r = await fetch(`https://${equipe}.cloudflareaccess.com/cdn-cgi/access/certs`);
  if (!r.ok) throw new Error(`certs ${r.status}`);
  const { keys } = await r.json();
  chaves.lista = keys || [];
  chaves.quando = Date.now();
  return chaves.lista;
}

const base64url = (texto) => Uint8Array.from(atob(texto.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(texto.length / 4) * 4, "=")), (c) => c.charCodeAt(0));
const lerJson = (parte) => JSON.parse(new TextDecoder().decode(base64url(parte)));

function passeDoPedido(request) {
  const cabecalho = request.headers.get("Cf-Access-Jwt-Assertion");
  if (cabecalho) return cabecalho;
  const cookie = request.headers.get("Cookie") || "";
  return /(?:^|;\s*)CF_Authorization=([^;]+)/.exec(cookie)?.[1] || "";
}

// Devolve o e-mail de quem entrou, ou null se o passe não vale
export async function quemEntrou(request, env) {
  const equipe = env.ACCESS_EQUIPE || EQUIPE_PADRAO;
  const aud = env.ACCESS_AUD || AUD_PADRAO;
  const passe = passeDoPedido(request);
  const partes = passe.split(".");
  if (partes.length !== 3) return null;
  try {
    const cabeca = lerJson(partes[0]);
    const dados = lerJson(partes[1]);
    if (cabeca.alg !== "RS256") return null;
    const agora = Date.now() / 1000;
    const auds = Array.isArray(dados.aud) ? dados.aud : [dados.aud];
    if (!auds.includes(aud)) return null;
    if (dados.iss !== `https://${equipe}.cloudflareaccess.com`) return null;
    if (!(dados.exp > agora) || (dados.nbf && dados.nbf > agora + 60)) return null;
    let chave = (await chavesPublicas(equipe)).find((k) => k.kid === cabeca.kid);
    if (!chave) chave = (await chavesPublicas(equipe, true)).find((k) => k.kid === cabeca.kid); // o Cloudflare troca as chaves de tempos em tempos
    if (!chave) return null;
    const publica = await crypto.subtle.importKey("jwk", chave, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", publica, base64url(partes[2]), new TextEncoder().encode(`${partes[0]}.${partes[1]}`));
    return ok ? dados.email || "ok" : null;
  } catch {
    return null;
  }
}
