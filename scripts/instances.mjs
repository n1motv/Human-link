#!/usr/bin/env node
// Pilote les instances de TEST (une par client) : tout tourne dans Docker, une image par client, rien en direct sur la machine.
// Voir docker-compose.test.yml et docs/INSTANCES.md.
//
//   npm run instances -- up [nom|all]        construit les images, démarre, attend qu'elles soient saines
//   npm run instances -- watch               up + reconstruction automatique de l'image dès qu'un fichier de code change
//   npm run instances -- seed all --demo     administrateur + données de démonstration
//   npm run instances -- test                vérifie les instances (santé, config, logo, droits, connexion, métriques, version)
//   npm run instances -- status | logs <nom> | images | down [--purge] | restart
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLIENTS = path.join(ROOT, 'clients');
const COMPOSE_FILE = 'docker-compose.test.yml';
const METRICS_TOKEN = 'test-metrics-token'; // le même que dans docker-compose.test.yml
const MONITORING = process.argv.includes('--monitoring'); // ajoute Prometheus (9090) et Grafana (3030)

const c = (code, s) => (process.stdout.isTTY ? `\x1b[${code}m${s}\x1b[0m` : s);
const green = (s) => c(32, s);
const red = (s) => c(31, s);
const dim = (s) => c(2, s);
const bold = (s) => c(1, s);

function fail(msg) {
  console.error(red(`✗ ${msg}`));
  process.exit(1);
}

/** Instances = sous-dossiers de clients/ qui ont un client.config.json. */
function discover() {
  return fs
    .readdirSync(CLIENTS, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(CLIENTS, d.name, 'client.config.json')))
    .map((d) => d.name)
    .sort();
}

const dirOf = (name) => path.join(CLIENTS, name);
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const meta = (name) => {
  try {
    return readJson(path.join(dirOf(name), 'instance.json'));
  } catch {
    return {};
  }
};
const port = (name) => meta(name).port;

function parseEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
  return out;
}

function select(args) {
  const all = discover();
  const wanted = args.filter((a) => !a.startsWith('--'));
  if (wanted.length === 0 || wanted.includes('all')) return all;
  const unknown = wanted.filter((n) => !all.includes(n));
  if (unknown.length) fail(`Instance inconnue : ${unknown.join(', ')}. Disponibles : ${all.join(', ')}`);
  return wanted;
}

function docker(args) {
  const profile = MONITORING || args[0] === 'down' ? ['--profile', 'monitoring'] : []; // « down » retire aussi la supervision si elle tournait
  const r = spawnSync('docker', ['compose', '-f', COMPOSE_FILE, ...profile, ...args], { cwd: ROOT, stdio: 'inherit' });
  if (r.error) fail('Docker est introuvable. Installez et lancez Docker Desktop.');
  return r;
}

function requireDocker() {
  const r = spawnSync('docker', ['info'], { stdio: 'ignore' });
  if (r.status !== 0) fail("Le moteur Docker ne répond pas. Lancez Docker Desktop, attendez qu'il soit prêt, puis recommencez.");
}

/** Crée clients/<nom>/.env (clés uniques, mot de passe administrateur) à partir de .env.example. Les chemins, l'adresse et la base sont fixés par docker-compose.test.yml. */
function init(names) {
  for (const name of names) {
    const target = path.join(dirOf(name), '.env');
    if (fs.existsSync(target)) {
      console.log(`${dim('•')} ${name}: .env existe déjà (conservé)`);
      continue;
    }
    const example = path.join(dirOf(name), '.env.example');
    if (!fs.existsSync(example)) fail(`${name}: .env.example introuvable`);
    const key = () => crypto.randomBytes(32).toString('hex');
    const password = crypto.randomBytes(12).toString('base64url') + '9aA';
    let text = fs.readFileSync(example, 'utf8');
    for (const k of ['JWT_SECRET', 'FIELD_ENCRYPTION_KEY', 'FILE_ENCRYPTION_KEY', 'PSEUDONYM_KEY']) text = text.replace(new RegExp(`^${k}=.*$`, 'm'), `${k}=${key()}`);
    text = text.replace(/^ADMIN_PASSWORD=.*$/m, `ADMIN_PASSWORD=${password}`);
    fs.writeFileSync(target, text, { mode: 0o600 });
    console.log(`${green('✓')} ${name}: .env créé (clés uniques). Administrateur : ${parseEnv(target).ADMIN_EMAIL} / ${password}`);
  }
}

const buildId = async (name) => {
  try {
    return (await (await fetch(`http://127.0.0.1:${port(name)}/api/health`, { signal: AbortSignal.timeout(2000) })).json()).version ?? '?';
  } catch {
    return null;
  }
};

function up(names) {
  requireDocker();
  init(discover()); // Compose lit le .env de chaque service : on les crée tous
  console.log(bold('\nConstruction des images et démarrage…'));
  const r = docker(['up', '-d', '--build', '--wait', ...names, ...(MONITORING ? ['prometheus', 'grafana'] : [])]);
  if (r.status) fail('Le démarrage a échoué (voir ci-dessus). Pour le détail : npm run instances -- logs <nom>');
  console.log(green('\n✓ Instances prêtes.'));
  if (MONITORING) console.log('  Grafana : http://localhost:3030 (tableau « Human Link : exploitation »)   Prometheus : http://localhost:9090');
}

async function status(names) {
  const rows = [];
  for (const name of names) {
    const build = await buildId(name);
    rows.push({ name, port: String(port(name)), build: build ?? dim('—'), etat: build ? green('en marche') : dim('arrêtée'), url: `http://localhost:${port(name)}` });
  }
  // eslint-disable-next-line no-control-regex -- ce sont justement les codes de couleur ANSI (ESC) qu'on retire
  const strip = (s) => String(s).replace(/\x1b\[[0-9;]*m/g, '');
  const cols = ['name', 'port', 'etat', 'build', 'url'];
  const heads = ['INSTANCE', 'PORT', 'ÉTAT', 'VERSION', 'URL'];
  const widths = cols.map((k, i) => Math.max(heads[i].length, ...rows.map((r) => strip(r[k]).length)));
  const line = (cells) => cells.map((cell, i) => String(cell) + ' '.repeat(widths[i] - strip(cell).length)).join('  ');
  console.log(bold(line(heads)));
  for (const r of rows) console.log(line(cols.map((k) => r[k])));
}

function seed(names, flags) {
  requireDocker();
  for (const name of names) {
    console.log(bold(`\n— ${name} —`));
    const r = docker(['exec', '-T', name, 'node', 'dist/scripts/seed.js', ...flags]);
    if (r.status) fail(`${name}: le seed a échoué. L'instance est-elle démarrée ? (npm run instances -- up ${name})`);
  }
}

// ---------- test : vérifie chaque instance de l'extérieur, comme le ferait un navigateur ----------

async function smoke(names) {
  requireDocker();
  let failures = 0;
  const builds = new Set();
  for (const name of names) {
    const base = `http://127.0.0.1:${port(name)}`;
    const expected = readJson(path.join(dirOf(name), 'client.config.json'));
    const results = [];
    const check = async (label, fn) => {
      try {
        const detail = await fn();
        results.push([true, label, detail ?? '']);
      } catch (e) {
        failures++;
        results.push([false, label, e.message]);
      }
    };
    const must = (cond, msg) => {
      if (!cond) throw new Error(msg);
    };
    const get = (p, init = {}) => fetch(base + p, { signal: AbortSignal.timeout(5000), ...init });
    const csrfToken = async () => {
      const r = await get('/api/auth/csrf');
      return /hl_csrf=([^;]+)/.exec(r.headers.get('set-cookie') ?? '')?.[1];
    };
    const login = async (email, password) => {
      const token = await csrfToken();
      must(token, 'pas de cookie CSRF');
      return get('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: `hl_csrf=${token}`, 'X-CSRF-Token': token },
        body: JSON.stringify({ email, password }),
      });
    };

    let config;
    await check('santé', async () => {
      const health = await (await get('/api/health')).json();
      must(health.ok === true, `réponse inattendue : ${JSON.stringify(health)}`);
      builds.add(health.version);
      return `version ${health.version}`;
    });
    await check('configuration du client', async () => {
      config = await (await get('/api/config')).json();
      must(config.company.name === expected.company.name, `nom « ${config.company.name} » au lieu de « ${expected.company.name} »`);
      must(config.branding.accent === expected.branding.accent, 'couleur d’accent différente');
      return config.company.name;
    });
    await check('logo servi (clair et sombre)', async () => {
      for (const u of [config.branding.logoUrl, config.branding.logoOnDarkUrl]) {
        const r = await get(u);
        must(r.ok && /image\//.test(r.headers.get('content-type') ?? ''), `${u} → ${r.status} ${r.headers.get('content-type')}`);
      }
    });
    await check('interface servie', async () => {
      const r = await get('/login');
      must(r.ok && (await r.text()).includes('id="root"'), 'la page de connexion ne contient pas l’application');
    });
    await check('API protégée sans connexion (401)', async () => {
      const r = await get('/api/users');
      must(r.status === 401, `HTTP ${r.status}`);
    });
    await check('mauvais mot de passe refusé (401)', async () => {
      const r = await login('inconnu@test.local', 'mauvais-mot-de-passe-1');
      must(r.status === 401, `HTTP ${r.status}`);
    });
    await check('connexion de l’administrateur (après seed)', async () => {
      const env = parseEnv(path.join(dirOf(name), '.env'));
      const r = await login(env.ADMIN_EMAIL, env.ADMIN_PASSWORD);
      if (r.status === 401) return dim('administrateur absent : lancer « seed » d’abord');
      must(r.status === 200, `HTTP ${r.status}`);
      const body = await r.json();
      must(body.twoFactorRequired || body.user, 'réponse de connexion inattendue');
      return body.twoFactorRequired ? 'double authentification demandée' : 'connecté';
    });
    await check('métriques protégées par jeton', async () => {
      must((await get('/metrics')).status === 401, 'accessible sans jeton');
      const r = await get('/metrics', { headers: { Authorization: `Bearer ${METRICS_TOKEN}` } });
      must(r.ok && (await r.text()).includes('humanlink_http_requests_total'), `HTTP ${r.status} ou métriques absentes`);
    });

    console.log(bold(`\n${name}`) + dim(`  ${base}`));
    for (const [okay, label, detail] of results) console.log(`  ${okay ? green('✓') : red('✗')} ${label}${detail ? dim('  ' + detail) : ''}`);
  }
  if (names.length > 1 && builds.size > 1) {
    failures++;
    console.log(red(`\n✗ Les instances ne portent pas la même version : ${[...builds].join(', ')}`));
  }
  console.log(failures ? red(`\n✗ ${failures} vérification(s) en échec.`) : green('\n✓ Toutes les vérifications passent.'));
  process.exit(failures ? 1 : 0);
}

const [cmd = 'help', ...rest] = process.argv.slice(2);
const flags = rest.filter((a) => a.startsWith('--'));

switch (cmd) {
  case 'list':
    for (const n of discover())
      console.log(
        `${n.padEnd(12)} port ${String(port(n)).padEnd(5)} image humanlink/test-${n}:dev  ${fs.existsSync(path.join(dirOf(n), '.env')) ? '' : dim('(pas encore de .env : créé par « up »)')}`,
      );
    break;
  case 'init':
    init(select(rest));
    break;
  case 'build':
    requireDocker();
    init(discover());
    process.exit(docker(['build', ...select(rest)]).status ?? 1);
    break;
  case 'up':
  case 'start':
    up(select(rest));
    await status(select(rest));
    break;
  case 'watch':
    up(select(rest));
    await status(select(rest));
    console.log(
      bold(
        '\nSurveillance du code : toute modification de server/, client/, shared/ ou du dossier d’un client reconstruit l’image et relance l’instance. Ctrl+C pour arrêter la surveillance (les instances restent démarrées).\n',
      ),
    );
    process.exit(docker(['watch', '--no-up', ...select(rest)]).status ?? 0);
    break;
  case 'down':
  case 'stop':
    requireDocker();
    process.exit(docker(['down', ...(flags.includes('--purge') ? ['--volumes'] : [])]).status ?? 0);
    break;
  case 'restart':
    requireDocker();
    docker(['restart', ...select(rest)]);
    await status(select(rest));
    break;
  case 'status':
    requireDocker();
    await status(select(rest));
    break;
  case 'seed':
    seed(select(rest), flags);
    break;
  case 'logs': {
    requireDocker();
    const names = select(rest);
    process.exit(docker(['logs', '--tail', '100', ...(flags.includes('--follow') ? ['-f'] : []), ...(names.length === discover().length ? [] : names)]).status ?? 0);
    break;
  }
  case 'images':
    requireDocker();
    spawnSync('docker', ['images', 'humanlink/test-*', '--format', 'table {{.Repository}}:{{.Tag}}\t{{.ID}}\t{{.CreatedSince}}\t{{.Size}}'], { stdio: 'inherit' });
    break;
  case 'test':
    await smoke(select(rest));
    break;
  default:
    console.log(`Instances de test Human Link : une image Docker par client, toutes en parallèle

  list                      instances détectées dans clients/ (port, image)
  up      [nom|all]         construit les images, démarre et attend qu'elles soient saines
  watch   [nom|all]         up, puis reconstruit l'image à chaque modification du code
  build   [nom|all]         construit seulement les images
  seed    <nom|all> [--demo] [--reset-demo]
  test    [nom|all]         vérifie les instances de l'extérieur
  status  [nom|all]         état, port, version
  logs    [nom|all] [--follow]
  images                    images humanlink/test-* construites
  restart [nom|all]
  up --monitoring           ajoute Prometheus et Grafana (tableau d'exploitation)
  down    [--purge]         arrête (--purge supprime aussi les bases et fichiers de test)
  init    <nom|all>         crée clients/<nom>/.env (fait automatiquement par « up »)

Prérequis : Docker Desktop lancé. Aucune application n'est lancée en dehors de Docker.`);
}
