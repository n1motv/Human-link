// Écrit la spécification OpenAPI de l'API dans docs/openapi.json. Usage : npm run gen:openapi
// Un test (tests/openapi.test.ts) échoue si ce fichier n'est plus à jour : il ne se périme pas sans qu'on le voie.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// La spécification se lit dans le code : ni base de données ni .env nécessaires. Clés factices pour passer la validation de env.ts.
const key = () => crypto.randomBytes(32).toString('hex');
Object.assign(process.env, {
  NODE_ENV: 'test',
  JWT_SECRET: key(),
  FIELD_ENCRYPTION_KEY: key(),
  FILE_ENCRYPTION_KEY: key(),
  PSEUDONYM_KEY: key(),
  APP_URL: 'http://localhost:5173',
  MONGODB_URI: 'mongodb://127.0.0.1:27017/openapi',
});

const { buildOpenApi } = await import('../openapi/spec.js');
const target = path.resolve('..', 'docs', 'openapi.json');
fs.writeFileSync(target, JSON.stringify(buildOpenApi(), null, 2) + '\n');
console.log(`Spécification écrite : ${target}`);
process.exit(0);
