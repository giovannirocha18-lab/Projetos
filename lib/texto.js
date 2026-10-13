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
