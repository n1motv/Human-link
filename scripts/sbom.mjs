#!/usr/bin/env node
// Génère la liste des composants (SBOM) des images de test avec syft (exécuté dans Docker : rien à installer).
//   npm run sbom                  toutes les images humanlink/test-*
//   npm run sbom -- humanlink/mon-image:tag
// Écrit sbom/<image>.spdx.json et sbom/<image>.cdx.json (SPDX et CycloneDX, les deux formats que lisent les outils de conformité).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'sbom');
const SYFT = 'anchore/syft:latest';

const docker = (args, opts = {}) => spawnSync('docker', args, { encoding: 'utf8', ...opts });

if (docker(['info'], { stdio: 'ignore' }).status !== 0) {
  console.error('✗ Le moteur Docker ne répond pas. Lancez Docker Desktop, puis recommencez.');
  process.exit(1);
}

let images = process.argv.slice(2);
if (!images.length) {
  images = docker(['images', 'humanlink/test-*', '--format', '{{.Repository}}:{{.Tag}}']).stdout.split('\n').filter(Boolean);
  if (!images.length) {
    console.error("✗ Aucune image humanlink/test-*. Construisez-les d'abord : npm run instances -- build");
    process.exit(1);
  }
}

fs.mkdirSync(OUT, { recursive: true });
let failed = 0;
for (const image of images) {
  const base = image.replace(/[/:]/g, '_');
  const r = docker([
    'run',
    '--rm',
    '-v',
    '/var/run/docker.sock:/var/run/docker.sock',
    '-v',
    `${OUT}:/out`,
    SYFT,
    image,
    '-q',
    '-o',
    `spdx-json=/out/${base}.spdx.json`,
    '-o',
    `cyclonedx-json=/out/${base}.cdx.json`,
  ]);
  if (r.status !== 0) {
    failed++;
    console.error(`✗ ${image} : ${(r.stderr || r.stdout || '').trim().split('\n').slice(-3).join(' | ')}`);
    continue;
  }
  const sbom = JSON.parse(fs.readFileSync(path.join(OUT, `${base}.cdx.json`), 'utf8'));
  const count = (type) => sbom.components.filter((c) => c.type === type).length;
  console.log(
    `✓ ${image} : ${sbom.components.length} composants (${count('library')} bibliothèques, ${count('application')} applications, ${count('operating-system')} système) → sbom/${base}.{spdx,cdx}.json`,
  );
}
process.exit(failed ? 1 : 0);
