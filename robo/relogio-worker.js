// "Relógio" do robô da noite (09/11/2026). Este arquivo NÃO roda no site: é o código do Worker que o Giovanni criou no painel
// do Cloudflare (Workers & Pages > relogio-vaiprocarrinho > Edit code), com Cron Trigger "*/15 4-9 * * *" (UTC).
// A cada 15 minutos ele acorda e, por ~13 minutos, chama /api/robo-noite de cada trilha sem parar, esperando o que o
// site pedir (o trabalho e as regras ficam no site: lib/roboNoite.js; mudar o robô NÃO precisa mexer aqui).
const SITE = "https://vaiprocarrinho.com.br/api/robo-noite";
const dormir = (s) => new Promise((ok) => setTimeout(ok, s * 1000));

async function pedir(url) {
  try {
    const r = await fetch(url, { headers: { "User-Agent": "relogio-vaiprocarrinho" } });
    return await r.json();
  } catch {
    return { esperar: 10 };
  }
}

async function trilha(nome, ate) {
  while (Date.now() < ate) {
    const r = await pedir(`${SITE}?trilha=${encodeURIComponent(nome)}`);
    if (r.fim) return;
    await dormir(Math.min(Math.max(Number(r.esperar) || 0, 0.5), 60));
  }
}

export default {
  async scheduled(evento, env, ctx) {
    const ate = Date.now() + 13 * 60 * 1000;
    const { trilhas = [] } = await pedir(SITE);
    await Promise.all(trilhas.map((nome) => trilha(nome, ate)));
  },
};
