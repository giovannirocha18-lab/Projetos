// Robô da noite no Cloudflare (09/11/2026). Os minutos grátis do GitHub Actions acabaram no dia 9 (repositório privado: o robô
// gastava ~4 h por noite, quase tudo laços de curl ESPERANDO o site responder: mercadolivre, maisvendidos, prontas, shopee e
// lomadee). Agora quem faz esses laços é um Worker do Cloudflare com Cron Trigger ("relógio", código em robo/relogio-worker.js,
// criado pelo Giovanni no painel do Cloudflare): ele chama /api/robo-noite?trilha=… sem parar durante a madrugada, e cada
// chamada faz UM passo da trilha (functions/api/robo-noite.js). O estado de cada trilha fica no banco (tabela robo_noite), então
// o Worker pode parar e voltar (a cada 15 min) sem perder nada. No GitHub ficaram só os passos rápidos com Node (awin,
// shopeelista, ia, auditoria, relatorio: ~25 min por noite, cabem nos 2.000 min grátis do mês).
// As regras de cada passo são as mesmas dos laços do robo-precos.yml (tempos, esperas pelo limite, quando parar).
// Duas trilhas ao mesmo tempo, como os jobs antes:
//   ml:    árvore de categorias → tendências → mais vendidos (principais) → buscas do ML (44 h e 20 h, até 50 min)
//          → mais vendidos das sub-subcategorias (até 75 min) → buscas do ML que faltaram (até 95 min)
//   lojas: preços da Shopee → marcas da Lomadee → espera o ML chegar nos mais vendidos → buscas prontas (até 120 min)

export const TRILHAS = ["ml", "lojas"];
// Janela da madrugada (UTC): começa 01:45 de Brasília (depois dos jobs awin e shopeelista do GitHub, disparados ~01:14) e
// não começa passo novo depois das 07:00 de Brasília
export const JANELA_UTC = { inicio: 4 * 60 + 45, fim: 10 * 60 };
const MIN = 60e3;

// Qual "noite" está valendo agora: a data UTC dentro da janela, ou uma rodada manual (botão do painel, até 3 h)
export function noiteAtual(agora, manual) {
  if (manual && manual.ate > agora) return manual.noite;
  const d = new Date(agora);
  const m = d.getUTCHours() * 60 + d.getUTCMinutes();
  return m >= JANELA_UTC.inicio && m < JANELA_UTC.fim ? d.toISOString().slice(0, 10) : null;
}

export function estadoInicial(trilha, agora) {
  const base = { fase: trilha === "ml" ? "arvore" : "shopee", inicio: agora, faseInicio: agora, tempos: {}, esperaAte: 0, erros: 0, c: {} };
  base.tempos[base.fase] = { de: agora };
  return base;
}

function mudarFase(e, fase, agora) {
  if (e.tempos[e.fase]) e.tempos[e.fase].ate = agora;
  e.fase = fase;
  e.faseInicio = agora;
  e.n = 0;
  e.parte = 0;
  e.seguidas = 0;
  e.falhas = 0;
  e.tentativas = 0;
  if (fase !== "fim") e.tempos[fase] = { de: agora };
}

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const soma = (c, chave, v) => { c[chave] = num(c[chave]) + num(v); };
const temChave = (r, chave) => r && Object.prototype.hasOwnProperty.call(r, chave);

// Um passo da trilha. chamar(rota, parâmetros) devolve o JSON da rota (ou { falhou: true }). Muda o estado "e" e devolve
// quantos segundos esperar antes do próximo passo
export async function passo(trilha, e, chamar, agora, outra) {
  const c = e.c;
  const desde = (t) => agora - t;
  if (trilha === "ml") {
    if (e.fase === "arvore") {
      if (num(e.n) >= 40 || desde(e.inicio) >= 10 * MIN) return mudarFase(e, "tendencias", agora), 0;
      const r = await chamar("preparar-ml", { arvore: 1 });
      e.n = num(e.n) + 1;
      if (r.limite) return soma(c, "esperas", 1), 60;
      if (num(r.faltam) === 0) mudarFase(e, "tendencias", agora);
      return 1;
    }
    if (e.fase === "tendencias") {
      if (num(e.n) >= 30 || desde(e.inicio) >= 18 * MIN) return mudarFase(e, "destaques", agora), 0;
      const r = await chamar("preparar-ml", { tendencias: 1 });
      e.n = num(e.n) + 1;
      if (r.limite) return soma(c, "esperas", 1), 60;
      soma(c, "tendTermos", r.termos);
      soma(c, "tendErros", r.comErro);
      if (num(r.guardadas) > 0) c.tendGuardadas = num(r.guardadas);
      if (num(r.faltam) === 0) mudarFase(e, "destaques", agora);
      return 1;
    }
    if (e.fase === "destaques") {
      if (desde(e.inicio) >= 25 * MIN) return mudarFase(e, "buscas", agora), 0;
      const r = await chamar("preparar-ml", { proxima: 1, nivel: 2 });
      if (!temChave(r, "categoria")) {
        e.falhas = num(e.falhas) + 1;
        if (e.falhas >= 5) mudarFase(e, "buscas", agora);
        return 5;
      }
      e.falhas = 0;
      if (r.limite) {
        if (num(e.seguidas) < 3) { e.seguidas = num(e.seguidas) + 1; soma(c, "esperas", 1); return 60; }
        return mudarFase(e, "buscas", agora), 0;
      }
      e.seguidas = 0;
      if (r.categoria === null) return mudarFase(e, "buscas", agora), 0;
      soma(c, "maisVendidos", r.destaques);
      soma(c, "categorias", 1);
      if (r.fim) mudarFase(e, "buscas", agora);
      return 1;
    }
    if (e.fase === "buscas") {
      const horas = num(e.volta) === 1 ? 20 : 44;
      const parte = num(e.parte);
      if (desde(e.inicio) > 50 * MIN) {
        c.parou = `parou aos 50 minutos (volta de ${horas} h, busca ${parte} de ${num(c.partes)})`;
        return mudarFase(e, "maisvendidos", agora), 0;
      }
      const r = await chamar("preparar-ml", { parte, horas });
      if (num(r.partes) > 0) c.partes = num(r.partes);
      if (parte === 0 && num(e.volta) === 0 && temChave(r, "fila")) c.fila = Array.isArray(r.fila) ? r.fila.length : num(r.fila);
      const consultas = num(r.consultas);
      soma(c, "precos", r.precos);
      soma(c, "fichas", r.fichasComOferta);
      soma(c, "ofertas", r.ofertasNasFichas);
      if (consultas > 0) soma(c, "renovadas", 1);
      if (r.limite) {
        soma(c, "esperas", 1);
        e.seguidas = num(e.seguidas) + 1;
        if (e.seguidas >= 5) {
          c.parou = `parou: o Mercado Livre recusou 5 vezes seguidas (busca ${parte} de ${num(c.partes)})`;
          return mudarFase(e, "maisvendidos", agora), 0;
        }
        return 60;
      }
      e.seguidas = 0;
      if (r.fim) {
        if (num(e.volta) === 0) { e.volta = 1; e.parte = 0; return 0; }
        return mudarFase(e, "maisvendidos", agora), 0;
      }
      e.parte = num(r.proxima) > parte ? num(r.proxima) : parte + 1;
      return consultas > 0 ? 1 : 0;
    }
    if (e.fase === "maisvendidos") {
      if (desde(e.faseInicio) > 75 * MIN) {
        c.mvParou = `parou aos 75 minutos (${num(c.mvFaltam)} categorias ficam para a próxima madrugada)`;
        return mudarFase(e, "fim", agora), 0;
      }
      const r = await chamar("preparar-ml", { proxima: 1 });
      if (!temChave(r, "categoria")) {
        e.falhas = num(e.falhas) + 1;
        if (e.falhas >= 5) { c.mvParou = "parou: o site respondeu com erro 5 vezes seguidas"; mudarFase(e, "fim", agora); }
        return 5;
      }
      e.falhas = 0;
      if (r.limite) {
        soma(c, "mvEsperas", 1);
        e.seguidas = num(e.seguidas) + 1;
        if (e.seguidas >= 5) {
          c.mvParou = `parou: o Mercado Livre recusou 5 vezes seguidas (${num(c.mvFaltam)} categorias ficam para a próxima madrugada)`;
          return mudarFase(e, "fim", agora), 0;
        }
        return 60;
      }
      e.seguidas = 0;
      if (r.categoria === null) return passarParaMvBuscas(e, agora), 0;
      soma(c, "mvTotal", r.destaques);
      soma(c, "mvCategorias", 1);
      c.mvFaltam = num(r.faltam);
      if (r.fim) passarParaMvBuscas(e, agora);
      return 0;
    }
    if (e.fase === "mvbuscas") {
      // Os 95 minutos contam desde o começo dos mais vendidos das sub-subcategorias
      if (desde(num(e.mvInicio) || e.faseInicio) >= 95 * MIN) return mudarFase(e, "fim", agora), 0;
      const parte = num(e.parte);
      const r = await chamar("preparar-ml", { parte, horas: 44 });
      if (num(r.partes) > 0) c.mvPartes = num(r.partes);
      c.mvParte = parte;
      if (r.limite) {
        soma(c, "mvEsperas", 1);
        e.seguidas = num(e.seguidas) + 1;
        if (e.seguidas >= 5) mudarFase(e, "fim", agora);
        return 60;
      }
      e.seguidas = 0;
      if (num(r.consultas) > 0) soma(c, "mvRenovadas", 1);
      if (r.fim) return mudarFase(e, "fim", agora), 0;
      e.parte = num(r.proxima) > parte ? num(r.proxima) : parte + 1;
      return 0;
    }
    return 0;
  }

  // Trilha "lojas"
  if (e.fase === "shopee") {
    const parte = num(e.parte);
    if (parte > 80) return mudarFase(e, "lomadee", agora), 0;
    const r = await chamar("coletar-precos", { parte });
    if (r.falhou) soma(c, "shopeeFalhas", 1);
    else {
      soma(c, "shopeeFeitas", 1);
      soma(c, "shopeeGravados", r.gravados);
      soma(c, "shopeeErros", Array.isArray(r.erros) ? r.erros.length : 0);
      if (JSON.stringify(r).includes("10030")) soma(c, "shopeeLimite", 1);
      if (r.fim) return mudarFase(e, "lomadee", agora), 0;
    }
    e.parte = parte + 1;
    return 2;
  }
  if (e.fase === "lomadee") {
    const parte = num(e.parte);
    if (parte > 20) return mudarFase(e, "aguarda", agora), 0;
    const r = await chamar("conferir-lojas", { parte });
    e.parte = parte + 1;
    if (r.falhou) { soma(c, "lomadeeFalhas", 1); return 0; }
    c.lomadeeCom = [...new Set([...(c.lomadeeCom || []), ...(Array.isArray(r.comProdutos) ? r.comProdutos : [])])];
    c.lomadeeQuebradas = [...new Set([...(c.lomadeeQuebradas || []), ...(Array.isArray(r.linksQuebrados) ? r.linksQuebrados : [])])];
    if (r.erro) soma(c, "lomadeeFalhas", 1);
    if (r.fim) return mudarFase(e, "aguarda", agora), 0;
    return 60; // a Lomadee aceita 60 consultas por minuto
  }
  if (e.fase === "aguarda") {
    // As buscas prontas leem os preços do Mercado Livre que a trilha "ml" guarda: espera ela chegar nos mais vendidos
    // (como o job "prontas" esperava o "mercadolivre"); se a trilha ml travar, segue depois de 1 h 30
    const mlPronto = outra && ["maisvendidos", "mvbuscas", "fim"].includes(outra.fase);
    if (mlPronto || !outra || desde(e.inicio) > 90 * MIN) return mudarFase(e, "prontas", agora), 0;
    return 30;
  }
  if (e.fase === "prontas") {
    const parte = num(e.parte);
    if (parte > 0 && desde(e.faseInicio) > 120 * MIN) {
      c.prontasEsgotou = parte;
      return mudarFase(e, "fim", agora), 0;
    }
    const r = await chamar("preparar-buscas", { parte });
    if (parte === 0) {
      if (!num(r.partes)) {
        e.falhas = num(e.falhas) + 1;
        if (e.falhas >= 5) { c.prontasErro = "Não deu para saber quantas buscas são"; mudarFase(e, "fim", agora); }
        return 30;
      }
      c.prontasPartes = num(r.partes);
    }
    if (JSON.stringify(r).includes("10030") && num(e.tentativas) < 2) {
      e.tentativas = num(e.tentativas) + 1;
      soma(c, "prontasEsperas", 1);
      return 60;
    }
    if (r.guardada === true) soma(c, "prontasGuardadas", 1);
    e.tentativas = 0;
    e.parte = parte + 1;
    if (e.parte >= num(c.prontasPartes)) mudarFase(e, "fim", agora);
    return 0;
  }
  return 0;
}

function passarParaMvBuscas(e, agora) {
  const mvInicio = e.faseInicio;
  mudarFase(e, "mvbuscas", agora);
  e.mvInicio = mvInicio;
}

// Resumo de cada passo no formato do painel (aba Robô; o mesmo de robo/relatorio.mjs)
export const ORDEM_DO_PAINEL = ["awin", "alertas", "shopee", "shopeelista", "ml", "mv", "prontas", "lomadee", "ia", "marcas",
  "auditoria", "lojas", "ia_buscas", "caminhos", "variacoes"];

export function partesDoPainel(ml, lojas) {
  const partes = [];
  const fases = (e) => Object.keys(e?.tempos || {});
  const minutos = (e, ...lista) => {
    const t = lista.map((f) => e.tempos[f]).filter(Boolean);
    if (!t.length || !t.every((x) => x.ate)) return null;
    return Math.round((Math.max(...t.map((x) => x.ate)) - Math.min(...t.map((x) => x.de))) / MIN);
  };
  const parte = (e, chave, titulo, lista, linhas, avisos) => {
    if (!lista.some((f) => fases(e).includes(f))) return;
    const terminou = lista.every((f) => e.tempos[f]?.ate) || e.fase === "fim";
    const rodando = !terminou ? ["Ainda rodando (robô da noite no Cloudflare)"] : [];
    const todos = [...avisos.filter(Boolean), ...rodando];
    partes.push({ chave, titulo, situacao: todos.length ? "aviso" : "ok", linhas, avisos: todos, minutos: minutos(e, ...lista) });
  };
  if (lojas) {
    const c = lojas.c;
    const avisos = [];
    if (num(c.shopeeErros)) avisos.push(`${num(c.shopeeErros)} buscas com erro na Shopee (${num(c.shopeeLimite)} partes com o limite 10030)`);
    if (num(c.shopeeFalhas)) avisos.push(`${num(c.shopeeFalhas)} partes não responderam`);
    parte(lojas, "shopee", "Preços da Shopee", ["shopee"], [`${num(c.shopeeGravados)} preços guardados para o histórico (${num(c.shopeeFeitas)} partes)`], avisos);
  }
  if (ml) {
    const c = ml.c;
    const media = num(c.fichas) > 0 ? `${(num(c.ofertas) / num(c.fichas)).toFixed(1)} ofertas por ficha com vendedor (${num(c.fichas)} fichas)` : "";
    parte(ml, "ml", "Preços do Mercado Livre", ["arvore", "tendencias", "destaques", "buscas"], [
      `${num(c.maisVendidos)} mais vendidos guardados (${num(c.categorias)} categorias principais e subcategorias)`,
      `${num(c.tendGuardadas)} buscas mais populares do ML guardadas (${num(c.tendTermos)} lidas agora)`,
      `${num(c.renovadas)} buscas renovadas, ${num(c.precos)} preços guardados (${num(c.partes)} buscas)`,
      `${num(c.esperas)} esperas de 1 minuto pelo limite do Mercado Livre`,
      ...(media ? [media] : []),
      ...(c.fila !== undefined ? [`Fila do ML: ${num(c.fila)} buscas de visitantes com o ML incompleto`] : []),
    ], [c.parou, num(c.tendErros) ? `Tendências: ${num(c.tendErros)} categorias com erro` : ""]);
    parte(ml, "mv", "Mais vendidos do ML (sub-subcategorias)", ["maisvendidos", "mvbuscas"], [
      `${num(c.mvTotal)} mais vendidos guardados (${num(c.mvCategorias)} categorias)`,
      `${num(c.mvRenovadas)} buscas do ML renovadas depois (até a ${num(c.mvParte)} de ${num(c.mvPartes)})`,
      `${num(c.mvEsperas)} esperas de 1 minuto pelo limite do Mercado Livre`,
    ], [c.mvParou]);
  }
  if (lojas) {
    const c = lojas.c;
    const guardadas = num(c.prontasGuardadas);
    const total = num(c.prontasPartes);
    const avisos = [c.prontasErro];
    if (lojas.fase === "fim" && total && guardadas * 100 < total * 80) avisos.push("Menos de 80% guardadas: as outras ficam com a resposta da véspera (até 7 dias)");
    if (c.prontasEsgotou) avisos.push(`parou aos 120 minutos, na busca ${num(c.prontasEsgotou)} de ${total}`);
    parte(lojas, "prontas", "Buscas prontas", ["prontas"], [`${guardadas} de ${total} buscas guardadas`,
      `${num(c.prontasEsperas)} esperas de 1 minuto pelo limite da Shopee`], avisos);
    const q = c.lomadeeQuebradas || [];
    parte(lojas, "lomadee", "Marcas da Lomadee", ["lomadee"], [`${(c.lomadeeCom || []).length} marcas com produtos`],
      [q.length ? `Links quebrados (fora do site): ${q.join(", ")}` : "", num(c.lomadeeFalhas) ? `${num(c.lomadeeFalhas)} partes com erro` : ""]);
  }
  const prontas = partes.find((p) => p.chave === "prontas");
  if (prontas && lojas.c.prontasErro) prontas.situacao = "erro";
  return partes;
}

// Junta as partes da noite na execução do GitHub da mesma madrugada (tabela robo_execucoes, aba Robô do painel); se o GitHub
// não rodou (ex.: sem minutos), grava uma execução só do robô da noite
export function juntarNaExecucao(existentes, nossas) {
  const chaves = new Set(nossas.map((p) => p.chave));
  const todas = [...(existentes || []).filter((p) => !chaves.has(p.chave)), ...nossas];
  const ordem = (p) => { const i = ORDEM_DO_PAINEL.indexOf(p.chave); return i < 0 ? 99 : i; };
  return todas.sort((a, b) => ordem(a) - ordem(b));
}
const PESO = { ok: 0, aviso: 1, erro: 2 };
export const piorSituacao = (partes) => partes.reduce((pior, p) => (PESO[p.situacao] > PESO[pior] ? p.situacao : pior), "ok");

export async function gravarNoPainel(db, noite, ml, lojas, agora) {
  const nossas = partesDoPainel(ml, lojas);
  if (!nossas.length) return;
  await db.prepare(`CREATE TABLE IF NOT EXISTS robo_execucoes (id INTEGER PRIMARY KEY, numero INTEGER, evento TEXT, modo TEXT,
    inicio INTEGER, fim INTEGER, situacao TEXT, dados TEXT)`).run();
  const inicioNoite = Math.min(...[ml?.inicio, lojas?.inicio].filter(Boolean));
  // Execução do GitHub desta madrugada: começou até 2 h antes do robô da noite
  const github = await db.prepare(`SELECT id, dados FROM robo_execucoes WHERE evento != 'robo-noite' AND modo IN ('completo', 'madrugada')
    AND inicio > ? AND inicio < ? ORDER BY inicio DESC LIMIT 1`).bind(inicioNoite - 2 * 60 * MIN, inicioNoite + 60 * MIN).first();
  if (github) {
    let dados = {};
    try { dados = JSON.parse(github.dados) || {}; } catch { /* dados quebrados: refaz */ }
    dados.partes = juntarNaExecucao(dados.partes, nossas);
    dados.roboNoite = noite;
    await db.prepare("UPDATE robo_execucoes SET situacao = ?, fim = ?, dados = ? WHERE id = ?")
      .bind(piorSituacao(dados.partes), agora, JSON.stringify(dados), github.id).run();
    // Se antes ficou uma execução só do robô da noite (o GitHub gravou depois), ela sai
    await db.prepare("DELETE FROM robo_execucoes WHERE evento = 'robo-noite' AND inicio = ?").bind(inicioNoite).run();
    return;
  }
  const dados = { partes: nossas, atrasoMin: null, link: "", roboNoite: noite };
  await db.prepare(`INSERT OR REPLACE INTO robo_execucoes (id, numero, evento, modo, inicio, fim, situacao, dados)
    VALUES (?, 0, 'robo-noite', 'robo-noite', ?, ?, ?, ?)`).bind(inicioNoite, inicioNoite, agora, piorSituacao(nossas), JSON.stringify(dados)).run();
}

export async function criarTabela(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS robo_noite (trilha TEXT PRIMARY KEY, noite TEXT NOT NULL DEFAULT '',
    estado TEXT NOT NULL DEFAULT '{}', ocupado_ate INTEGER NOT NULL DEFAULT 0, atualizado INTEGER NOT NULL DEFAULT 0)`).run();
}

// Rodada manual (painel, /api/painel/robo-noite?comecar=1): linha "_manual" com noite = identificador e ocupado_ate = até quando vale
export async function rodadaManual(db) {
  const r = await db.prepare("SELECT noite, ocupado_ate FROM robo_noite WHERE trilha = '_manual'").first();
  return r ? { noite: r.noite, ate: r.ocupado_ate } : null;
}
