#!/usr/bin/env node
// Prépare le colis à livrer à UN client : image Docker + configuration + logos + compose + notice d'installation.
// Aucun secret n'est embarqué : le client génère ses propres clés sur son serveur (voir INSTALL.md dans le colis).
//
//   npm run ship -- acme                       image construite et exportée (docker requis)
//   npm run ship -- acme --no-image            sans image : le client la récupère depuis un registre
//   npm run ship -- acme --registry ghcr.io/votre-org/human-link --push
//   npm run ship -- acme --out D:/livraisons --version 3.1.0
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const VALUE_FLAGS = ['--out', '--registry', '--version'];
const slug = args.find((a, i) => !a.startsWith('--') && !VALUE_FLAGS.includes(args[i - 1]));

const fail = (m) => {
  console.error(`✗ ${m}`);
  process.exit(1);
};
const run = (cmd, a, o = {}) => spawnSync(cmd, a, { cwd: ROOT, encoding: 'utf8', ...o });

if (!slug || slug === 'example') fail('Usage : npm run ship -- <client> [--no-image] [--registry <dépôt> --push] [--out <dossier>] [--version <x.y.z>]');
const clientDir = path.join(ROOT, 'clients', slug);
if (!fs.existsSync(path.join(clientDir, 'client.config.json'))) fail(`clients/${slug}/client.config.json introuvable`);

// --- 1. Validation de la configuration et des logos ---
const cfg = JSON.parse(fs.readFileSync(path.join(clientDir, 'client.config.json'), 'utf8'));
for (const key of ['logoUrl', 'logoOnDarkUrl']) {
  const file = path.join(clientDir, cfg.branding[key].replace(/^\//, ''));
  if (!fs.existsSync(file)) fail(`Logo manquant : ${cfg.branding[key]} (${file})`);
}
for (const k of ['accent', 'accent2']) if (!/^#[0-9a-f]{6}$/i.test(cfg.branding[k])) fail(`branding.${k} doit être une couleur #rrggbb`);
if (!fs.existsSync(path.join(clientDir, '.env.example'))) fail('clients/<client>/.env.example manquant');

// --- 2. Version ---
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const sha = run('git', ['rev-parse', '--short', 'HEAD']).stdout?.trim() || 'local';
const version = opt('version', `${pkg.version ?? '3.0.0'}-${sha}`);
const imageName = opt('registry') ? `${opt('registry')}:${version}` : `human-link:${version}`;
const out = path.resolve(opt('out', path.join(ROOT, 'ship')));
const name = `${slug}-${version}`;
const dir = path.join(out, name);
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(path.join(dir, 'client'), { recursive: true });

// --- 3. Image Docker ---
let imageFile = null;
if (!flag('no-image')) {
  const daemon = run('docker', ['info', '--format', '{{.ServerVersion}}']);
  if (daemon.status !== 0) fail('Docker ne répond pas (démarrez Docker Desktop / le service), ou utilisez --no-image.');
  console.log(`→ Construction de l'image ${imageName} …`);
  const build = run('docker', ['build', '-t', imageName, '.'], { stdio: 'inherit' });
  if (build.status !== 0) fail('La construction de l\'image a échoué.');
  if (flag('push')) {
    if (!opt('registry')) fail('--push nécessite --registry <dépôt>');
    const push = run('docker', ['push', imageName], { stdio: 'inherit' });
    if (push.status !== 0) fail('docker push a échoué (docker login ?).');
  }
  imageFile = `human-link-${version}.tar`;
  console.log('→ Export de l\'image …');
  const save = run('docker', ['save', '-o', path.join(dir, imageFile), imageName], { stdio: 'inherit' });
  if (save.status !== 0) fail('docker save a échoué.');
}

// --- 4. Configuration du client (sans secrets : jamais de .env ni de storage/) ---
fs.copyFileSync(path.join(clientDir, 'client.config.json'), path.join(dir, 'client', 'client.config.json'));
fs.copyFileSync(path.join(clientDir, '.env.example'), path.join(dir, 'client', '.env.example'));
fs.cpSync(path.join(clientDir, 'branding'), path.join(dir, 'client', 'branding'), { recursive: true });

const domain = new URL(parseEnvValue(path.join(clientDir, '.env.example'), 'APP_URL') || 'https://rh.example.com').hostname;
function parseEnvValue(file, key) {
  const m = new RegExp(`^${key}=(.*)$`, 'm').exec(fs.readFileSync(file, 'utf8'));
  return m?.[1]?.trim();
}

fs.writeFileSync(
  path.join(dir, 'docker-compose.yml'),
  `# ${cfg.company.name} : application + MongoDB (+ HTTPS automatique avec --profile https).
# Lancer : docker compose --profile https up -d      (voir INSTALL.md)
name: humanlink-${slug}

services:
  mongo:
    image: mongo:7
    restart: unless-stopped
    command: ["--auth", "--bind_ip_all"]
    environment:
      MONGO_INITDB_ROOT_USERNAME: humanlink
      MONGO_INITDB_ROOT_PASSWORD: \${MONGO_PASSWORD:?définir MONGO_PASSWORD dans .env}
    volumes:
      - mongo-data:/data/db
    healthcheck:
      test: ["CMD", "mongosh", "--quiet", "--eval", "db.adminCommand('ping').ok"]
      interval: 15s
      timeout: 5s
      retries: 5

  app:
    image: ${imageName}
    restart: unless-stopped
    depends_on:
      mongo:
        condition: service_healthy
    env_file:
      - ./client/.env
    environment:
      MONGODB_URI: mongodb://humanlink:\${MONGO_PASSWORD}@mongo:27017/humanlink?authSource=admin
      TRUST_PROXY: \${TRUST_PROXY:-1}
      NODE_ENV: production
      PORT: "4000"
      CLIENT_DIR: /client
      CLIENT_DIST: /app/client/dist
      SERVE_CLIENT: "true"
      STORAGE_DIR: /data/storage
    volumes:
      - ./client:/client:ro
      - app-data:/data
    ports:
      - "\${APP_PORT:-127.0.0.1:4000}:4000"

  caddy:
    image: caddy:2
    profiles: ["https"]
    restart: unless-stopped
    depends_on: [app]
    ports:
      - "80:80"
      - "443:443"
    environment:
      DOMAIN: \${DOMAIN:?définir DOMAIN dans .env}
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data

volumes:
  mongo-data:
  app-data:
  caddy-data:
`,
);
fs.copyFileSync(path.join(ROOT, 'Caddyfile'), path.join(dir, 'Caddyfile'));
fs.writeFileSync(
  path.join(dir, '.env.example'),
  `# Variables de docker-compose (copier en .env ; jamais versionné).
MONGO_PASSWORD=
DOMAIN=rh.${domain.replace(/^rh\./, '')}
TRUST_PROXY=1
APP_PORT=127.0.0.1:4000
`,
);

const loadStep = imageFile
  ? `docker load -i ${imageFile}`
  : `docker pull ${imageName}      # image publiée sur votre registre (docker login au besoin)`;
fs.writeFileSync(
  path.join(dir, 'INSTALL.md'),
  `# Installation de ${cfg.company.name} (Human Link ${version})

Prérequis : un serveur Linux avec Docker (≥ 24) et Docker Compose, et un nom de domaine dont le DNS pointe vers ce serveur
(ports 80 et 443 ouverts). L'application exige HTTPS en production.

## 1. Vérifier et charger l'application

\`\`\`bash
sha256sum -c SHA256SUMS
${loadStep}
\`\`\`

## 2. Configurer

\`\`\`bash
cp .env.example .env                     # MONGO_PASSWORD (long et aléatoire), DOMAIN
cp client/.env.example client/.env
docker run --rm ${imageName} node dist/scripts/gen-keys.js     # affiche 4 clés à coller dans client/.env
\`\`\`

Dans \`client/.env\` : les 4 clés, \`APP_URL=https://<votre domaine>\`, les paramètres SMTP, \`ADMIN_EMAIL\` et \`ADMIN_PASSWORD\` (12 caractères minimum).

**Sauvegardez \`FIELD_ENCRYPTION_KEY\` et \`FILE_ENCRYPTION_KEY\` dans un coffre** : sans elles, les données chiffrées sont illisibles.

## 3. Démarrer

\`\`\`bash
docker compose --profile https up -d
docker compose exec app node dist/scripts/seed.js      # crée l'administrateur initial
\`\`\`

L'application est disponible sur https://<votre domaine>. L'administrateur doit activer la double authentification à la première connexion.

## 4. Exploitation

- **Sauvegardes** (quotidiennes) : \`docker compose exec -T mongo mongodump --archive --gzip -u humanlink -p "$MONGO_PASSWORD" --authenticationDatabase admin > sauvegarde.gz\`, le volume \`app-data\` (fichiers chiffrés) et le dossier \`client/\`.
- **État** : \`docker compose ps\` ; journaux : \`docker compose logs -f app\`.
- **Mise à jour** : charger la nouvelle image (\`docker load\` ou \`docker pull\`), modifier la ligne \`image:\` de \`docker-compose.yml\`, puis \`docker compose --profile https up -d\`.
- **Personnalisation** (logo, couleurs, modules, règles RH) : modifier \`client/client.config.json\` et \`client/branding/\`, puis \`docker compose restart app\` (sans reconstruire).
`,
);

// --- 5. Empreintes et archive ---
const sums = [];
const walk = (d) =>
  fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
for (const f of walk(dir).sort()) {
  const rel = path.relative(dir, f).split(path.sep).join('/');
  sums.push(`${crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')}  ${rel}`);
}
fs.writeFileSync(path.join(dir, 'SHA256SUMS'), `${sums.join('\n')}\n`);

const archive = path.join(out, `${name}.tar.gz`);
// cwd = dossier de sortie et chemins relatifs : tar (Git Bash / Windows) prendrait « C: » pour un hôte distant.
const tar = run('tar', ['-czf', `${name}.tar.gz`, name], { cwd: out });
if (tar.status !== 0) console.warn('⚠ tar indisponible : le dossier est livrable tel quel.');

const size = (f) => `${(fs.statSync(f).size / 1048576).toFixed(1)} Mo`;
console.log(`\n✓ Colis prêt pour ${cfg.company.name}\n  Dossier  : ${dir}${tar.status === 0 ? `\n  Archive  : ${archive} (${size(archive)})` : ''}\n  Image    : ${imageFile ? `${imageName} (${imageFile})` : `non incluse (${imageName} à publier sur un registre)`}\n  Secrets  : aucun (le client génère ses clés avec gen-keys)`);
