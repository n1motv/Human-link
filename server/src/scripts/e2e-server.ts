// Serveur des tests de bout en bout (Playwright, client/e2e/flows) : la vraie application, servant le front compilé,
// sur une base MongoDB jetable en mémoire, avec trois comptes connus. Rien n'est simulé : navigateur, API et base sont réels.
// Usage : npm run e2e:server (le front doit être compilé : npm --prefix ../client run build)
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MongoMemoryServer } from 'mongodb-memory-server';

const PORT = Number(process.env.E2E_PORT ?? 4100);
const PASSWORD = 'E2e-Passw0rd-2026!';
/** Secret TOTP de l'administrateur de test : le même que dans client/e2e/flows/accounts.ts (le test calcule les codes). */
const ADMIN_TOTP_SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';

const mongod = await MongoMemoryServer.create();
const key = () => crypto.randomBytes(32).toString('hex');
Object.assign(process.env, {
  NODE_ENV: 'test', // sans limitation de débit ni appels réseau externes ; les cookies restent httpOnly et SameSite=Strict
  JWT_SECRET: key(),
  FIELD_ENCRYPTION_KEY: key(),
  FILE_ENCRYPTION_KEY: key(),
  PSEUDONYM_KEY: key(),
  APP_URL: `http://localhost:${PORT}`,
  PORT: String(PORT),
  MONGODB_URI: mongod.getUri('humanlink_e2e'),
  STORAGE_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'humanlink-e2e-')),
  SERVE_CLIENT: 'true',
  CLIENT_DIST: path.resolve('..', 'client', 'dist'),
});

const { default: mongoose } = await import('mongoose');
const { createApp } = await import('../app.js');
const { User } = await import('../models/User.js');
const { Supervision } = await import('../models/Supervision.js');
const { hashPassword } = await import('../utils/password.js');
const { currentMonth } = await import('../utils/dates.js');

await mongoose.connect(process.env.MONGODB_URI!);

const base = { status: 'active', departement: 'Technique', soldeConge: 25, teleworkMax: 2, dernierMoisMaj: currentMonth(), passwordChangedAt: new Date() } as const;
const passwordHash = await hashPassword(PASSWORD);
await User.create({
  ...base,
  passwordHash,
  matricule: '000001A',
  nom: 'Admin',
  prenom: 'Alice',
  email: 'admin@e2e.test',
  role: 'admin',
  poste: 'RH',
  twoFactor: { enabled: true, secret: ADMIN_TOTP_SECRET },
});
const manager = await User.create({
  ...base,
  passwordHash,
  matricule: '000002M',
  nom: 'Bernard',
  prenom: 'Karim',
  email: 'manager@e2e.test',
  role: 'manager',
  poste: 'Responsable technique',
});
const employee = await User.create({
  ...base,
  passwordHash,
  matricule: '000003E',
  nom: 'Lopez',
  prenom: 'Sofia',
  email: 'employe@e2e.test',
  role: 'employe',
  poste: 'Développeuse',
});
await User.create({ ...base, passwordHash, matricule: '000004E', nom: 'Haddad', prenom: 'Nadia', email: 'autre@e2e.test', role: 'employe', poste: 'Comptable' });
await Supervision.create({ managerId: manager._id, superviseId: employee._id });

const server = createApp().listen(PORT, () => console.log(`Serveur e2e prêt sur http://localhost:${PORT}`));
const stop = async () => {
  server.close();
  await mongoose.disconnect();
  await mongod.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
