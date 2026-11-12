// Teste das sugestões enquanto digita (sugerir() em public/assets/app.js), com o vocabulário do site no ar.
// Rodar antes de publicar mudança nas sugestões:   node testes/sugestoes.mjs
// Cada caso: o que foi digitado -> o que TEM que aparecer (tem) e o que NÃO pode aparecer (nao).
import fs from "fs";
import { tendenciaAceitavel } from "../lib/buscas.js";

// Tendências do Mercado Livre que nunca viram sugestão nem busca pronta (robô #123, 06/11/2026)
for (const [termo, aceita] of [["videos paola oliveira nua", false], ["filhote de mico", false], ["filhotes de lebre", false],
  ["insetos vivos", false], ["airsoft", false], ["bloqueador bluetooth", false], ["jamer bloqueador bluetooth", false], ["juliana paes nua revistas masculinos", false], ["mascara airsoft", false], ["vinho tinto", false],
  ["celular motorola", true], ["piano digital", true], ["gaiola para calopsita", true], ["vivo y29", true], ["caneta laser", true]]) {
  if (tendenciaAceitavel(termo) !== aceita) { console.log(`✗ tendência "${termo}": ${aceita ? "devia aceitar" : "devia bloquear"}`); process.exitCode = 1; }
}

const CASOS = {
  // 31/10/2026: "jogo de" virava "jogo dewalt"; print "geladeira bravecto" (marca de remédio para pet)
  "jogo de": { tem: ["jogo de panelas"], nao: ["jogo dewalt"] },
  "geladeira bra": { tem: ["geladeira brastemp"], nao: ["geladeira bravecto"] },
  "notebook de": { tem: ["notebook dell"] },
  "jogo dew": { nao: ["jogo de panelas"] },
  "maquina de lavar ele": { tem: ["maquina de lavar electrolux"], nao: ["maquina de lavar eletran"] },
  "sams": { tem: ["samsung"] },
  "stanl": { tem: ["stanley", "garrafa stanley"] },
  "air fra": { tem: ["air fryer"] },
  "geladeria": { tem: ["geladeira"] },
  "tenis ni": { tem: ["tênis nike"] },
  "smart tv l": { tem: ["smart tv lg"] },
  "fone jb": { tem: ["fone jbl"] },
};

const src = fs.readFileSync(new URL("../public/assets/app.js", import.meta.url), "utf8");
const ini = src.indexOf("const normalizar = ");
const fim = src.indexOf("// Destaca o pedaço já digitado");
let voc;
try {
  voc = await (await fetch("https://vaiprocarrinho.com.br/api/vocabulario?v=13")).json();
} catch {
  console.log("⚠ Sem internet para pegar o vocabulário do site; teste das sugestões pulado.");
  process.exit(0);
}
const sugerir = new Function("SUGESTOES", "fetch", "voc", `${src.slice(ini, fim)};
  Object.assign(vocab, { termos: voc.termos, marcas: voc.marcas || [], erros: voc.erros || {} });
  prepararVocabulario(); return sugerir;`)([], () => new Promise(() => {}), voc);

const limpo = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
let erros = 0;
for (const [digitado, { tem = [], nao = [] }] of Object.entries(CASOS)) {
  const saida = sugerir(digitado).map(limpo);
  for (const t of tem) if (!saida.includes(limpo(t))) { erros++; console.log(`✗ "${digitado}": faltou "${t}" (veio: ${saida.join(" | ")})`); }
  for (const t of nao) if (saida.includes(limpo(t))) { erros++; console.log(`✗ "${digitado}": não podia vir "${t}"`); }
}
if (erros) { console.log(`\n${erros} erro(s)`); process.exit(1); }
console.log(`✓ Sugestões certas (${Object.keys(CASOS).length} casos)`);
