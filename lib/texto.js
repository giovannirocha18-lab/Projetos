// Utilidades de texto usadas na busca.

export function normalizar(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function palavras(s) {
  return normalizar(s).split(" ").filter((p) => p.length > 1);
}

// Busca simples num catálogo fixo. Cada item precisa de `_busca` (texto já
// normalizado). Prefere os itens que têm todas as palavras buscadas.
export function buscarNoCatalogo(catalogo, q) {
  const termos = palavras(q);
  const pontuar = (o) => termos.filter((t) => o._busca.split(" ").some((p) => p.startsWith(t))).length;
  const pontuados = catalogo.map((o) => [pontuar(o), o]);
  let achados = pontuados.filter(([p]) => p === termos.length);
  // Nenhum resultado com todas as palavras: aceita os que batem com alguma
  if (!achados.length) achados = pontuados.filter(([p]) => p > 0);
  return achados.sort((a, b) => b[0] - a[0] || (b[1].vendidos || 0) - (a[1].vendidos || 0)).map(([, o]) => o);
}

// Tira os campos internos (que começam com _) antes de mandar ao navegador
export const limpar = (oferta) =>
  Object.fromEntries(Object.entries(oferta).filter(([k]) => !k.startsWith("_")));
