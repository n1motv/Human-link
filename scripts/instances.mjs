#!/usr/bin/env node
// Gère plusieurs instances Human Link (une par client) sur la même machine, sans Docker.
// Chaque instance = un dossier clients/<nom>/ (client.config.json, branding/, .env) + son port + sa base MongoDB.
//
//   npm run instances -- list
//   npm run instances -- init all            crée clients/<nom>/.env avec des clés uniques
//   npm run instances -- up all              démarre en parallèle (arrière-plan)
//   npm run instances -- status
//   npm run instances -- seed all --demo     administrateur + données de démonstration
//   npm run instances -- logs acme
//   npm run instances -- down all
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLIENTS = path.join(ROOT, 'clients');
const RUN = path.join(ROOT, '.instances');
const SERVER_ENTRY = path.join(ROOT, 'server', 'dist', 'index.js');
const SEED_ENTRY = path.join(ROOT, 'server', 'dist', 'scripts', 'seed.js');
const FRONT_DIST = path.join(ROOT, 'client', 'dist', 'index.html');

const c = (code, s) => (process.stdout.isTTY ? `\x1b[${code}m${s}\x1b[0m` : s);
const green = (s) => c(32, s);
const red = (s) => c(31, s);
const dim = (s) => c(2, s);
const bold = (s) => c(1, s);

/** Instances = sous-dossiers de clients/ qui ont un client.config.json. */
function discover() {
  return fs
    .readdirSync(CLIENTS, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(CLIENTS, d.name, 'client.config.json')))
    .map((d) => d.name)
    .sort();
}

function parseEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
  return out;
}

const dirOf = (name) => path.join(CLIENTS, name);
const meta = (name) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(dirOf(name), 'instance.json'), 'utf8'));
  } catch {
    return {};
  }
};
const envOf = (name) => ({ PORT: String(meta(name).port ?? ''), ...parseEnv(path.join(dirOf(name), '.env')) });
const pidFile = (name) => path.join(RUN, `${name}.pid`);
const logFile = (name) => path.join(RUN, `${name}.log`);

function readPid(name) {
  try {
    const pid = Number(fs.readFileSync(pidFile(name), 'utf8'));
    process.kill(pid, 0); // lève une erreur si le processus n'existe plus
    return pid;
  } catch {
    return null;
  }
}

function select(args) {
  const all = discover();
  const wanted = args.filter((a) => !a.startsWith('--'));
  if (wanted.length === 0 || wanted.includes('all')) return all;
  const unknown = wanted.filter((n) => !all.includes(n));
  if (unknown.length) fail(`Instance inconnue : ${unknown.join(', ')}. Disponibles : ${all.join(', ')}`);
  return wanted;
}

function fail(msg) {
  console.error(red(`✗ ${msg}`));
  process.exit(1);
}

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
    const { port, database = `humanlink_${name}` } = meta(name);
    if (!port) fail(`${name}: instance.json (port) introuvable`);
    let text = fs.readFileSync(example, 'utf8');
    // Valeurs propres au test local (sans Docker, en HTTP). Le déploiement Docker les remplace (voir docker-compose.yml).
    text = text
      .replace(/^APP_URL=.*$/m, `APP_URL=http://localhost:${port}`)
      .replace(/^NODE_ENV=.*$/m, `NODE_ENV=production
PORT=${port}
COOKIE_SECURE=false
MONGODB_URI=mongodb://127.0.0.1:27017/${database}
CLIENT_DIR=.
SERVE_CLIENT=true
CLIENT_DIST=../../client/dist
STORAGE_DIR=./storage`);
    for (const k of ['JWT_SECRET', 'FIELD_ENCRYPTION_KEY', 'FILE_ENCRYPTION_KEY', 'PSEUDONYM_KEY']) text = text.replace(new RegExp(`^${k}=.*$`, 'm'), `${k}=${key()}`);
    text = text.replace(/^ADMIN_PASSWORD=.*$/m, `ADMIN_PASSWORD=${password}`);
    fs.writeFileSync(target, text, { mode: 0o600 });
    console.log(`${green('✓')} ${name}: .env créé (clés uniques). Administrateur : ${envOf(name).ADMIN_EMAIL} / ${password}`);
  }
}

function checkBuilt() {
  if (!fs.existsSync(SERVER_ENTRY) || !fs.existsSync(FRONT_DIST)) fail('Application non compilée. Lancez d\'abord : npm run build');
}

function up(names) {
  checkBuilt();
  fs.mkdirSync(RUN, { recursive: true });
  for (const name of names) {
    if (!fs.existsSync(path.join(dirOf(name), '.env'))) fail(`${name}: pas de .env. Lancez : npm run instances -- init ${name}`);
    if (readPid(name)) {
      console.log(`${dim('•')} ${name}: déjà démarrée (pid ${readPid(name)})`);
      continue;
    }
    const out = fs.openSync(logFile(name), 'a');
    // cwd = dossier du client : dotenv y lit SON .env et les chemins relatifs (CLIENT_DIR=., STORAGE_DIR=./storage) en partent.
    const child = spawn(process.execPath, [SERVER_ENTRY], { cwd: dirOf(name), detached: true, stdio: ['ignore', out, out], windowsHide: true });
    child.unref();
    fs.writeFileSync(pidFile(name), String(child.pid));
    console.log(`${green('✓')} ${name}: démarrée (pid ${child.pid}) → http://localhost:${envOf(name).PORT ?? '?'}`);
  }
}

/** Attend que chaque instance réponde (connexion MongoDB + synchronisation des index : quelques secondes). */
async function waitHealthy(names) {
  for (const name of names) {
    const port = envOf(name).PORT;
    let ok = false;
    for (let i = 0; i < 40 && !ok; i++) {
      try {
        ok = (await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1000) })).ok;
      } catch {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    console.log(ok ? `${green('✓')} ${name}: prête` : `${red('✗')} ${name}: ne répond pas, voir : npm run instances -- logs ${name}`);
  }
}

function down(names) {
  for (const name of names) {
    const pid = readPid(name);
    if (!pid) {
      console.log(`${dim('•')} ${name}: arrêtée`);
      continue;
    }
    try {
      process.kill(pid);
    } catch {
      /* déjà terminé */
    }
    fs.rmSync(pidFile(name), { force: true });
    console.log(`${green('✓')} ${name}: arrêtée`);
  }
}

async function status(names) {
  const rows = [];
  for (const name of names) {
    const env = envOf(name);
    const pid = readPid(name);
    let health = dim('—');
    if (pid) {
      try {
        const r = await fetch(`http://127.0.0.1:${env.PORT}/api/health`, { signal: AbortSignal.timeout(2000) });
        health = r.ok ? green('ok') : red(`HTTP ${r.status}`);
      } catch {
        health = red('ne répond pas');
      }
    }
    rows.push({ name, port: env.PORT ?? '?', db: (env.MONGODB_URI ?? '').split('/').pop(), pid: pid ?? '—', etat: pid ? green('en marche') : dim('arrêtée'), health, url: `http://localhost:${env.PORT ?? '?'}` });
  }
  const strip = (s) => String(s).replace(/\x1b\[[0-9;]*m/g, '');
  const cols = ['name', 'port', 'db', 'pid', 'etat', 'health', 'url'];
  const heads = ['INSTANCE', 'PORT', 'BASE', 'PID', 'ÉTAT', 'SANTÉ', 'URL'];
  const widths = cols.map((k, i) => Math.max(heads[i].length, ...rows.map((r) => strip(r[k]).length)));
  const line = (cells) => cells.map((cell, i) => String(cell) + ' '.repeat(widths[i] - strip(cell).length)).join('  ');
  console.log(bold(line(heads)));
  for (const r of rows) console.log(line(cols.map((k) => r[k])));
}

function seed(names, flags) {
  if (!fs.existsSync(SEED_ENTRY)) fail('Application non compilée. Lancez d\'abord : npm run build');
  for (const name of names) {
    console.log(bold(`\n— ${name} —`));
    const r = spawnSync(process.execPath, [SEED_ENTRY, ...flags], { cwd: dirOf(name), stdio: 'inherit' });
    if (r.status) fail(`${name}: le seed a échoué (code ${r.status}). MongoDB est-il démarré ? (npm run dev:db en local)`);
  }
}

function logs(names) {
  const name = names[0];
  if (!name || !fs.existsSync(logFile(name))) fail('Aucun journal pour cette instance.');
  const lines = fs.readFileSync(logFile(name), 'utf8').split('\n').slice(-60);
  console.log(lines.join('\n'));
}

const [cmd = 'help', ...rest] = process.argv.slice(2);
const flags = rest.filter((a) => a.startsWith('--'));

switch (cmd) {
  case 'list':
    for (const n of discover()) console.log(`${n.padEnd(12)} port ${envOf(n).PORT ?? dim('(pas de .env)')}  ${fs.existsSync(path.join(dirOf(n), '.env')) ? '' : dim('→ npm run instances -- init ' + n)}`);
    break;
  case 'init':
    init(select(rest));
    break;
  case 'up':
  case 'start': {
    const names = select(rest);
    up(names);
    await waitHealthy(names);
    break;
  }
  case 'down':
  case 'stop':
    down(select(rest));
    break;
  case 'restart': {
    const names = select(rest);
    down(names);
    up(names);
    await waitHealthy(names);
    break;
  }
  case 'status':
    await status(select(rest));
    break;
  case 'seed':
    seed(select(rest), flags);
    break;
  case 'logs':
    logs(select(rest));
    break;
  default:
    console.log(`Instances Human Link (une par client, en parallèle)

  list                    instances détectées dans clients/
  init  <nom|all>         crée clients/<nom>/.env avec des clés uniques
  up    <nom|all>         démarre en arrière-plan (un processus Node par instance)
  down  <nom|all>         arrête
  restart <nom|all>
  status [nom|all]        état, port, base, santé
  seed  <nom|all> [--demo] [--reset-demo]
  logs  <nom>             dernières lignes du journal

Prérequis : npm run build, et MongoDB joignable (npm run dev:db en local).`);
}
