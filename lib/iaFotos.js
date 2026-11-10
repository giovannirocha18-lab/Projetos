// A IA confere as FOTOS (pedido do Giovanni, 11/11/2026, depois do print "computador" com balança): o robô
// (robo/conferir-fotos.mjs) mostra ao Claude Haiku a foto e o nome dos produtos que mais aparecem nas buscas e pergunta se
// a foto é mesmo daquele produto. Os que não são (foto de outra coisa, só um logotipo, imagem vazia) ficam na tabela
// ia_fotos com ok = 0 e saem das buscas e das Ofertas do dia. Vale enquanto o produto tiver a mesma foto: se a loja
// trocar a foto, ele volta e é conferido de novo.
import { chaveIa } from "./ia.js";

export const TABELA_IA_FOTOS = `CREATE TABLE IF NOT EXISTS ia_fotos (chave TEXT PRIMARY KEY, ok INTEGER NOT NULL, quando INTEGER NOT NULL,
  foto TEXT NOT NULL)`;

// Fotos reprovadas (nome do produto -> endereço da foto), guardadas 10 min na memória do servidor
const guardado = { mapa: null, quando: 0 };
const VALE_MS = 10 * 60 * 1000;
export async function fotosErradas(db) {
  if (!db) return null;
  if (guardado.quando && Date.now() - guardado.quando < VALE_MS) return guardado.mapa;
  let mapa = null;
  try {
    const { results } = await db.prepare("SELECT chave, foto FROM ia_fotos WHERE ok = 0 LIMIT 20000").all();
    mapa = results.length ? new Map(results.map((r) => [r.chave, r.foto])) : null;
  } catch {
    // tabela ainda não existe (o robô cria)
  }
  guardado.mapa = mapa;
  guardado.quando = Date.now();
  return mapa;
}

export const fotoErrada = (o, erradas) => Boolean(erradas?.size && o?.imagem && erradas.get(chaveIa(o.titulo || "")) === o.imagem);

export function semFotosErradas(ofertas, erradas) {
  if (!erradas?.size || !ofertas?.length) return ofertas;
  const ficam = ofertas.filter((o) => !fotoErrada(o, erradas));
  return ficam.length === ofertas.length ? ofertas : ficam;
}
