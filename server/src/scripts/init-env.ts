// Crée server/.env avec des secrets frais. Usage : npm run setup
// Ne remplace jamais un .env existant : les clés de chiffrement perdues rendraient les données illisibles.
import crypto from 'node:crypto';
import fs from 'node:fs';

if (fs.existsSync('.env')) {
  console.error('.env existe déjà : rien n’a été modifié.');
  process.exit(0);
}
const key = () => crypto.randomBytes(32).toString('hex');
const adminPassword = `Adm-${crypto.randomBytes(9).toString('base64url')}-${crypto.randomInt(10, 99)}`;
const template = fs.readFileSync('.env.example', 'utf8');
const values: Record<string, string> = {
  JWT_SECRET: key(),
  FIELD_ENCRYPTION_KEY: key(),
  FILE_ENCRYPTION_KEY: key(),
  PSEUDONYM_KEY: key(),
  ADMIN_EMAIL: 'admin@example.com',
  ADMIN_PASSWORD: adminPassword,
};
const out = template
  .split('\n')
  .map((line) => {
    const m = /^([A-Z_]+)=/.exec(line);
    return m && m[1] && values[m[1]] !== undefined ? `${m[1]}=${values[m[1]]}` : line;
  })
  .join('\n');
fs.writeFileSync('.env', out, { mode: 0o600 });
console.log('server/.env créé avec des secrets uniques.\n');
console.log(`  Administrateur : admin@example.com\n  Mot de passe   : ${adminPassword}\n`);
console.log('Notez ce mot de passe maintenant (il ne sera plus affiché), puis lancez : npm run seed');
console.log('SAUVEGARDEZ .env dans un coffre : perdre FIELD_ENCRYPTION_KEY / FILE_ENCRYPTION_KEY rend les données chiffrées illisibles.');
