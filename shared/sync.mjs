// Copie shared/src dans le dossier donné (ex. server/src/_shared). Le serveur est compilé par tsc avec rootDir « src » :
// il ne peut pas importer un fichier situé hors de son dossier, d'où cette copie générée (jamais versionnée, jamais modifiée à la main).
// Usage (depuis server/) : node ../shared/sync.mjs src/_shared
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const from = path.join(path.dirname(fileURLToPath(import.meta.url)), 'src');
const to = path.resolve(process.argv[2] ?? '');
if (!process.argv[2]) {
  console.error('Usage : node sync.mjs <dossier de destination>');
  process.exit(1);
}
if (!fs.existsSync(from)) {
  console.warn(`shared/src introuvable (${from}) : copie ignorée.`);
  process.exit(0);
}
fs.mkdirSync(to, { recursive: true });
for (const f of fs.readdirSync(from).filter((n) => n.endsWith('.ts'))) {
  const body = `// GÉNÉRÉ depuis shared/src/${f} par shared/sync.mjs : ne pas modifier ici.\n${fs.readFileSync(path.join(from, f), 'utf8')}`;
  const dest = path.join(to, f);
  if (!fs.existsSync(dest) || fs.readFileSync(dest, 'utf8') !== body) fs.writeFileSync(dest, body); // pas de réécriture inutile : tsx watch ne reboucle pas
}
