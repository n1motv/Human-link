// Vérifie les traductions : npm run i18n:check
//  1. toute clé utilisée dans le code existe en français (langue de référence) ;
//  2. chaque langue complète (en, es, it, ar) possède toutes les clés du français ;
//  3. les variables {{x}} sont les mêmes que dans le français (évite les textes cassés).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const flat = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (typeof v === 'object' && v ? flat(v, `${p}${k}.`) : [[`${p}${k}`, v]]));
const load = (l) => Object.fromEntries(flat(JSON.parse(readFileSync(path.join(root, `src/locales/${l}.json`), 'utf8'))));

const walk = (d) => readdirSync(d).flatMap((f) => (statSync(path.join(d, f)).isDirectory() ? walk(path.join(d, f)) : [path.join(d, f)]));
const used = new Set();
for (const f of walk(path.join(root, 'src')).filter((f) => /\.tsx?$/.test(f))) {
  const s = readFileSync(f, 'utf8');
  for (const m of s.matchAll(/\bt\(\s*(['`])([^'`]+)\1/g)) if (!m[2].includes('${')) used.add(m[2]);
  for (const m of s.matchAll(/(?:label|title):\s*'((?:nav|chat|status|role)\.[\w.]+)'/g)) used.add(m[1]);
}

const fr = load('fr');
let bad = 0;
for (const k of used) if (!(k in fr)) (console.error(`✗ clé utilisée mais absente de fr.json : ${k}`), bad++);

const vars = (s) =>
  [...String(s).matchAll(/{{\s*(\w+)\s*}}/g)]
    .map((m) => m[1])
    .sort()
    .join(',');
const full = ['en', 'es', 'it', 'ar'];
for (const l of full) {
  const t = load(l);
  for (const k of Object.keys(fr)) {
    if (!(k in t)) (console.error(`✗ [${l}] clé manquante : ${k}`), bad++);
    else if (vars(t[k]) !== vars(fr[k])) (console.error(`✗ [${l}] variables différentes pour ${k} : "${vars(t[k])}" au lieu de "${vars(fr[k])}"`), bad++);
  }
  for (const k of Object.keys(t)) if (!(k in fr)) (console.error(`✗ [${l}] clé inconnue : ${k}`), bad++);
}
if (bad) {
  console.error(`\n${bad} problème(s) de traduction.`);
  process.exit(1);
}
console.log(`✓ ${used.size} clés utilisées, ${full.length + 1} langues cohérentes.`);
