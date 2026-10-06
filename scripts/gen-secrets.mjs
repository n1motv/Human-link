#!/usr/bin/env node
// Génère les fichiers de secrets pour Docker (docker-compose.secrets.yml) : un fichier par secret, lisible par le seul propriétaire.
//
//   npm run secrets:gen                       crée ./secrets/ (refuse d'écraser l'existant)
//   npm run secrets:gen -- --dir /etc/humanlink/acme --admin
//   npm run secrets:gen -- --force            régénère TOUT (les données chiffrées existantes deviendraient illisibles !)
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const dir = path.resolve(opt('dir', 'secrets'));
const force = args.includes('--force');
const hex = () => crypto.randomBytes(32).toString('hex');
const pass = () => crypto.randomBytes(24).toString('base64url');

const mongoPassword = pass();
const files = {
  jwt_secret: hex(),
  field_encryption_key: hex(),
  file_encryption_key: hex(),
  pseudonym_key: hex(),
  mongo_password: mongoPassword,
  // Mot de passe en base64url : aucun caractère à échapper dans l'URI.
  mongodb_uri: `mongodb://humanlink:${mongoPassword}@mongo:27017/humanlink?authSource=admin&replicaSet=rs0`,
  // Phrase de passe des sauvegardes (profil « backup ») : à conserver dans un coffre, SÉPARÉ des sauvegardes elles-mêmes.
  backup_passphrase: pass() + pass(),
};
if (args.includes('--admin')) files.admin_password = pass() + '9aA';

fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
const existing = Object.keys(files).filter((n) => fs.existsSync(path.join(dir, n)));
if (existing.length && !force) {
  console.error(
    `✗ Fichiers déjà présents dans ${dir} : ${existing.join(', ')}\n  Rien n'a été écrit. --force les remplace, mais les données déjà chiffrées avec les anciennes clés deviendraient illisibles.`,
  );
  process.exit(1);
}
for (const [name, value] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), value, { mode: 0o400 });

console.log(`✓ ${Object.keys(files).length} secrets écrits dans ${dir} (lecture seule, propriétaire uniquement)`);
console.log('  Sauvegardez field_encryption_key et file_encryption_key dans un coffre : sans elles, les données chiffrées sont perdues.');
if (files.admin_password) console.log(`  Mot de passe de l'administrateur initial : ${dir}${path.sep}admin_password`);
console.log('  Démarrer : docker compose -f docker-compose.secrets.yml up -d   (voir docs/DEPLOIEMENT.md)');
