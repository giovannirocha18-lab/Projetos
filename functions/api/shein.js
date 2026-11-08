// GET /api/shein -> campanhas da Shein em andamento (lib/shein.js): { campanhas: [{ titulo, detalhe, emoji, link, ate, diasRestantes }] }
import { campanhasSheinAtivas } from "../../lib/shein.js";

export function onRequestGet() {
  return Response.json({ campanhas: campanhasSheinAtivas() }, { headers: { "Cache-Control": "public, max-age=60", "X-Robots-Tag": "noindex" } });
}
