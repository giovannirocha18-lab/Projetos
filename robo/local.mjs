// Robô na MÁQUINA LOCAL do Giovanni (26/11/2026: a conta do GitHub travou os robôs do Actions; decisão dele: "vamos mover
// tudo pra máquina local"). Faz, na mesma ordem, o que o robo-precos.yml e o conferir-fotos.yml faziam no GitHub: roda
// os mesmos scripts de robo/, junta o que cada um anotou para o painel e grava a execução na aba Robô.
// O robô da noite do Cloudflare (lib/roboNoite.js: ML, buscas prontas, categorias) continua lá, não muda.
//
// Uso (dentro da pasta do projeto):
//   node robo/local.mjs              rodada da noite: Awin + alertas, lista da Shopee, IA das categorias, auditoria
//   node robo/local.mjs fotos        IA conferindo as fotos (a rodada da manhã)
//   node robo/local.mjs so awin      só um passo (awin, alertas, shopeelista, ia, marcas, auditoria, ia_buscas,
//                                    caminhos, variacoes, numeros); vários separados por espaço
//   node robo/local.mjs conferir     só confere se as chaves estão preenchidas e respondem (não roda nada)
//
// CHAVES: ficam no arquivo ".chaves-robo" na pasta do projeto (uma por linha, NOME=valor), preenchido pelo Giovanni.
// Esse arquivo está no .gitignore: NUNCA vai para o repositório (que é público) e este script nunca imprime os valores.
// Modelo com os nomes: robo/chaves-exemplo.txt. Passo a passo: docs/robo-local.md
import { spawn, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { montarPartes, gravarExecucao } from "./relatorio.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://vaiprocarrinho.com.br";
const ARQUIVO_DAS_CHAVES = join(RAIZ, ".chaves-robo");
const CLOUDFLARE = ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID", "D1_DATABASE_ID"];
const PESO = { ok: 0, aviso: 1, erro: 2 };

// ---- chaves --------------------------------------------------------------------------------------------------------
function lerChaves() {
  if (!existsSync(ARQUIVO_DAS_CHAVES)) return null;
  const chaves = {};
  for (const linha of readFileSync(ARQUIVO_DAS_CHAVES, "utf8").split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m || linha.trim().startsWith("#")) continue;
    const valor = m[2].replace(/^(["'])(.*)\1$/, "$2");
    if (valor) chaves[m[1]] = valor;
  }
  return chaves;
}

// ---- passos (os mesmos do GitHub) ----------------------------------------------------------------------------------
// job = nome do job no robo-precos.yml (o painel junta por ele); chave = nome da saída que o script anota (paraPainel)
const PASSOS = {
  awin: { job: "awin", titulo: "Preços das lojas (Awin)", script: "robo/awin.mjs", memoriaMb: 6144, minutos: 60, precisa: ["AWIN_FEED_KEY_PJ", ...CLOUDFLARE] },
  alertas: { job: "awin", titulo: "Alertas de preço", funcao: conferirAlertas, minutos: 20, precisa: ["CHAVE_ROBO"] },
  shopeelista: { job: "shopeelista", titulo: "Lista oficial da Shopee", script: "robo/shopee-lista.mjs", memoriaMb: 4096, minutos: 45, precisa: ["SHOPEE_FEED_OFICIAL", ...CLOUDFLARE] },
  ia: { job: "ia", titulo: "IA: categorias dos produtos", script: "robo/ia.mjs", args: ["--limite", "300000", "--esperar", "0"], minutos: 60, pacotes: ["@anthropic-ai/sdk"], precisa: ["ANTHROPIC_API_KEY", ...CLOUDFLARE] },
  marcas: { job: "ia", titulo: "Sugestões produto + marca", script: "robo/marcas.mjs", minutos: 15, podeFalhar: true, precisa: CLOUDFLARE },
  auditoria: { job: "auditoria", titulo: "Auditoria da busca", script: "robo/auditoria.mjs", args: ["150"], minutos: 30, saidas: ["auditoria", "lojas"], precisa: [] },
  ia_buscas: { job: "auditoria", titulo: "IA conferindo as buscas", script: "robo/conferir-buscas.mjs", args: ["300"], minutos: 100, podeFalhar: true, pacotes: ["@anthropic-ai/sdk"], precisa: ["ANTHROPIC_API_KEY", ...CLOUDFLARE] },
  caminhos: { job: "auditoria", titulo: "Categorias das lojas", script: "robo/caminhos.mjs", minutos: 15, precisa: CLOUDFLARE },
  variacoes: { job: "auditoria", titulo: "Tamanhos repetidos", script: "robo/variacoes.mjs", minutos: 15, podeFalhar: true, precisa: CLOUDFLARE },
  numeros: { job: "auditoria", titulo: "Números do site", script: "robo/numeros-site.mjs", minutos: 10, podeFalhar: true, semPainel: true, precisa: CLOUDFLARE },
  fotos: { job: "fotos", titulo: "IA conferindo as fotos", script: "robo/conferir-fotos.mjs", args: ["0.50", "30"], minutos: 60, semPainel: true, pacotes: ["@anthropic-ai/sdk", "sharp"], precisa: ["ANTHROPIC_API_KEY", ...CLOUDFLARE] },
};
// Versões iguais às do GitHub (robo-precos.yml e conferir-fotos.yml)
const VERSOES = { "@anthropic-ai/sdk": "1.3.0", sharp: "0.35.5" };
// Rodada da noite, na ordem do GitHub: Awin e lista da Shopee ao mesmo tempo, depois a IA, depois a auditoria
const NOITE = [["awin", "shopeelista"], ["alertas"], ["ia"], ["marcas"], ["auditoria"], ["ia_buscas"], ["caminhos"], ["variacoes"], ["numeros"]];

// ---- utilidades ----------------------------------------------------------------------------------------------------
const agora = () => new Date().toLocaleTimeString("pt-BR", { hour12: false });
let pastaDoDia = "";
function dizer(texto) {
  const linha = `[${agora()}] ${texto}`;
  console.log(linha);
  if (pastaDoDia) appendFileSync(join(pastaDoDia, "robo.log"), `${linha}\n`);
}

function instalarPacotes(nomes) {
  const faltam = nomes.filter((n) => !existsSync(join(RAIZ, "node_modules", ...n.split("/"), "package.json")));
  if (!faltam.length) return true;
  dizer(`Instalando (só na 1ª vez): ${faltam.join(", ")}`);
  const r = spawnSync("npm", ["install", "--no-save", "--no-package-lock", ...faltam.map((n) => `${n}@${VERSOES[n]}`)],
    { cwd: RAIZ, stdio: "inherit", shell: process.platform === "win32" });
  return r.status === 0;
}

// Roda um script de robo/ como o GitHub rodava: as chaves vão só no ambiente do processo, a saída vai para o arquivo
// de log do passo e o que ele anota para o painel (GITHUB_OUTPUT) é lido no fim
function rodarScript(nome, passo, chaves) {
  return new Promise((resolve) => {
    const saida = join(pastaDoDia, `${nome}.saida`);
    const resumo = join(pastaDoDia, `${nome}.md`);
    const log = join(pastaDoDia, `${nome}.log`);
    for (const f of [saida, resumo, log]) writeFileSync(f, "");
    const args = [...(passo.memoriaMb ? [`--max-old-space-size=${passo.memoriaMb}`] : []), passo.script, ...(passo.args || [])];
    const env = { ...process.env, GITHUB_OUTPUT: saida, GITHUB_STEP_SUMMARY: resumo };
    for (const k of passo.precisa) env[k] = chaves[k];
    const filho = spawn(process.execPath, args, { cwd: RAIZ, env, stdio: ["ignore", "pipe", "pipe"] });
    const guardar = (pedaco) => appendFileSync(log, pedaco);
    filho.stdout.on("data", guardar);
    filho.stderr.on("data", guardar);
    let passouDoTempo = false;
    const relogio = setTimeout(() => { passouDoTempo = true; filho.kill(); }, passo.minutos * 60_000);
    filho.on("close", (codigo) => {
      clearTimeout(relogio);
      const saidas = {};
      for (const linha of readFileSync(saida, "utf8").split(/\r?\n/)) {
        const i = linha.indexOf("=");
        if (i > 0) saidas[linha.slice(0, i)] = linha.slice(i + 1);
      }
      resolve({ resultado: passouDoTempo ? "cancelled" : codigo === 0 ? "success" : "failure", saidas });
    });
    filho.on("error", (e) => { clearTimeout(relogio); guardar(`Não deu para começar: ${e.message}\n`); resolve({ resultado: "failure", saidas: {} }); });
  });
}

// Alertas de preço: com os preços da Awin já atualizados, o site confere os produtos com alerta e manda os e-mails
async function conferirAlertas(chaves) {
  let produtos = 0, emails = 0, falhas = 0;
  for (let parte = 0; parte <= 200; parte++) {
    let json = null;
    for (let tentativa = 0; tentativa < 3 && !json; tentativa++) {
      try {
        const r = await fetch(`${SITE}/api/conferir-alertas?parte=${parte}`, { headers: { Authorization: `Bearer ${chaves.CHAVE_ROBO}` }, signal: AbortSignal.timeout(90_000) });
        if (r.status === 401 || r.status === 403) throw Object.assign(new Error("O site recusou a CHAVE_ROBO (confira o valor no arquivo das chaves)"), { fatal: true });
        json = await r.json();
      } catch (e) {
        if (e.fatal) throw e;
        await new Promise((ok) => setTimeout(ok, 3000));
      }
    }
    if (!json) { falhas++; continue; }
    produtos += Number(json.produtos) || 0;
    emails += Number(json.avisos) || 0;
    if (json.fim) break;
    if (falhas > 5) break;
  }
  return { linhas: [`${produtos} produtos com alerta conferidos; ${emails} e-mails "Baixou!" enviados`], avisos: falhas ? [`${falhas} partes não responderam`] : [] };
}

async function rodarPasso(nome, chaves) {
  const passo = PASSOS[nome];
  const faltam = passo.precisa.filter((k) => !chaves[k]);
  if (faltam.length) {
    dizer(`✗ ${passo.titulo}: falta preencher ${faltam.join(", ")} no arquivo .chaves-robo`);
    return { nome, resultado: "failure", saidas: { [nome]: JSON.stringify({ linhas: [], avisos: [`Falta a chave ${faltam.join(", ")} na máquina local`] }) } };
  }
  if (passo.pacotes && !instalarPacotes(passo.pacotes)) {
    dizer(`✗ ${passo.titulo}: não deu para instalar ${passo.pacotes.join(", ")}`);
    return { nome, resultado: "failure", saidas: {} };
  }
  dizer(`▶ ${passo.titulo}…`);
  const inicio = Date.now();
  let r;
  if (passo.funcao) {
    try {
      r = { resultado: "success", saidas: { [nome]: JSON.stringify(await passo.funcao(chaves)) } };
    } catch (e) {
      r = { resultado: "failure", saidas: { [nome]: JSON.stringify({ linhas: [], avisos: [e.message] }) } };
    }
  } else r = await rodarScript(nome, passo, chaves);
  const minutos = Math.round((Date.now() - inicio) / 6e4);
  const sinal = r.resultado === "success" ? "✓" : r.resultado === "cancelled" ? "⏱ passou do tempo:" : "✗ deu erro:";
  dizer(`${sinal} ${passo.titulo} (${minutos} min)${r.resultado === "success" || passo.funcao ? "" : `: ver ${join(pastaDoDia, `${nome}.log`)}`}`);
  return { nome, ...r, inicio, fim: Date.now() };
}

// Ponto de restauração do banco de antes de o robô gravar (D1 Time Travel; ver README)
async function pontoDeRestauracao(chaves) {
  try {
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${chaves.CLOUDFLARE_ACCOUNT_ID}/d1/database/${chaves.D1_DATABASE_ID}/time_travel/bookmark`,
      { headers: { Authorization: `Bearer ${chaves.CLOUDFLARE_API_TOKEN}` }, signal: AbortSignal.timeout(30_000) });
    const ponto = (await r.json())?.result?.bookmark;
    dizer(ponto ? `Banco antes do robô, ponto de restauração: ${ponto}` : "⚠ Não deu para pegar o ponto de restauração do banco");
  } catch {
    dizer("⚠ Não deu para pegar o ponto de restauração do banco");
  }
}

// Junta os passos no formato que o painel conhece (o "needs" do GitHub) e grava a execução na aba Robô
async function gravarNoPainel(feitos, chaves, inicio, modo, evento) {
  const needs = {};
  for (const f of feitos) {
    const passo = PASSOS[f.nome];
    if (passo.semPainel) continue;
    const job = (needs[passo.job] ||= { result: "success", outputs: {} });
    for (const chave of passo.saidas || [f.nome]) {
      if (f.saidas[chave]) job.outputs[chave] = f.saidas[chave];
      job.outputs[`${chave}_ok`] = f.resultado;
    }
    if (f.resultado !== "success" && !passo.podeFalhar) job.result = f.resultado;
  }
  const tempos = feitos.map((f) => ({ name: PASSOS[f.nome].job, started_at: new Date(f.inicio || inicio).toISOString(), completed_at: new Date(f.fim || Date.now()).toISOString() }));
  const jobs = Object.keys(needs).map((job) => {
    const dele = tempos.filter((t) => t.name === job);
    return { name: job, started_at: dele.map((t) => t.started_at).sort()[0], completed_at: dele.map((t) => t.completed_at).sort().pop() };
  });
  const partes = montarPartes(needs, jobs).map((p) => ({ ...p, avisos: p.avisos.map((a) => a.replace("ver o resumo no GitHub", "ver o log na máquina local")) }));
  const situacao = partes.reduce((pior, p) => (PESO[p.situacao] > PESO[pior] ? p.situacao : pior), "ok");
  const dados = { partes, atrasoMin: null, link: "", onde: "máquina local" };
  const linha = [inicio, 0, evento, modo, inicio, Date.now(), situacao, JSON.stringify(dados)];
  try {
    await gravarExecucao(chaves, linha);
  } catch (e) {
    dizer(`⚠ Resumo não gravado no painel: ${e.message}`);
  }
  return { partes, situacao };
}

// Uma rodada por vez: se a anterior ainda está rodando (até 5 h), esta não começa
function trancar(nome) {
  const tranca = join(RAIZ, ".cache", `robo-local-${nome}.tranca`);
  if (existsSync(tranca) && Date.now() - statSync(tranca).mtimeMs < 5 * 3600_000) return null;
  writeFileSync(tranca, String(process.pid));
  return () => rmSync(tranca, { force: true });
}

async function conferirChaves(chaves) {
  const todas = [...new Set(Object.values(PASSOS).flatMap((p) => p.precisa))];
  for (const k of todas) console.log(`${chaves[k] ? "✓" : "✗ FALTA"} ${k}`);
  if (CLOUDFLARE.every((k) => chaves[k])) {
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${chaves.CLOUDFLARE_ACCOUNT_ID}/d1/database/${chaves.D1_DATABASE_ID}/query`, {
      method: "POST", headers: { Authorization: `Bearer ${chaves.CLOUDFLARE_API_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ sql: "SELECT 1 AS ok" }),
    }).then((x) => x.json()).catch(() => null);
    console.log(r?.success ? "✓ O banco do Cloudflare respondeu" : "✗ O banco do Cloudflare NÃO respondeu (confira as 3 chaves do Cloudflare)");
  }
  if (chaves.CHAVE_ROBO) {
    // parte depois do fim: o site só confere a chave e responde "fim" (não manda e-mail nem grava nada)
    const r = await fetch(`${SITE}/api/conferir-alertas?parte=100000`, { headers: { Authorization: `Bearer ${chaves.CHAVE_ROBO}` } }).catch(() => null);
    console.log(r?.ok ? "✓ O site aceitou a CHAVE_ROBO" : `✗ O site NÃO aceitou a CHAVE_ROBO (resposta ${r?.status ?? "nenhuma"})`);
  }
  return todas.every((k) => chaves[k]);
}

async function main() {
  const [modo = "noite", ...resto] = process.argv.slice(2);
  const chaves = lerChaves();
  if (!chaves) {
    console.log(`Não achei o arquivo das chaves: ${ARQUIVO_DAS_CHAVES}\nCopie robo/chaves-exemplo.txt para esse nome e preencha (ver docs/robo-local.md).`);
    process.exit(1);
  }
  if (modo === "conferir") process.exit((await conferirChaves(chaves)) ? 0 : 1);

  const dia = new Date().toISOString().slice(0, 10);
  pastaDoDia = join(RAIZ, ".cache", "robo-local", `${dia}-${modo}`);
  mkdirSync(pastaDoDia, { recursive: true });
  const soltar = trancar(modo === "fotos" ? "fotos" : "noite");
  if (!soltar) { dizer("Outra rodada ainda está em andamento: esta não começou."); process.exit(0); }
  const inicio = Date.now();
  let feitos = [];
  try {
    // Código sempre o da produção (como o checkout do GitHub). Sem internet ou com mudança local, segue com o que tem
    const pull = spawnSync("git", ["pull", "--ff-only", "--quiet"], { cwd: RAIZ, encoding: "utf8" });
    if (pull.status !== 0) dizer(`⚠ Não deu para atualizar o código (git pull): ${(pull.stderr || "").trim().split("\n").pop() || "sem resposta"}`);

    if (modo === "fotos") feitos = [await rodarPasso("fotos", chaves)];
    else if (modo === "so") {
      const invalidos = resto.filter((n) => !PASSOS[n]);
      if (!resto.length || invalidos.length) { dizer(`Passos que existem: ${Object.keys(PASSOS).join(", ")}`); soltar(); process.exit(1); }
      for (const nome of resto) feitos.push(await rodarPasso(nome, chaves));
      if (feitos.some((f) => !PASSOS[f.nome].semPainel)) await gravarNoPainel(feitos, chaves, inicio, `local: ${resto.join(",")}`, "local");
    } else if (modo === "noite") {
      dizer("Rodada da noite na máquina local");
      if (CLOUDFLARE.every((k) => chaves[k])) await pontoDeRestauracao(chaves);
      for (const grupo of NOITE) feitos.push(...(await Promise.all(grupo.map((nome) => rodarPasso(nome, chaves)))));
      const { situacao } = await gravarNoPainel(feitos, chaves, inicio, "madrugada", "schedule");
      dizer(`Fim da rodada (${Math.round((Date.now() - inicio) / 6e4)} min): ${situacao === "ok" ? "tudo certo" : situacao === "aviso" ? "com avisos" : "com ERRO"}. Resumo no painel, aba Robô.`);
    } else {
      dizer("Uso: node robo/local.mjs [noite | fotos | so <passos> | conferir]");
      soltar();
      process.exit(1);
    }
  } finally {
    soltar();
  }
  process.exit(feitos.some((f) => f.resultado !== "success" && !PASSOS[f.nome].podeFalhar) ? 1 : 0);
}

main().catch((e) => {
  console.error(`ERRO: ${e.message}`);
  process.exit(1);
});
