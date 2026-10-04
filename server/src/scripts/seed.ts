// Crée le compte administrateur initial (idempotent). Usage : npm run seed
// Avec --demo, crée aussi un jeu de données de démonstration complet (voir seed-demo.ts ; mot de passe : voir sortie).
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { User, type UserAttrs, type UserDoc } from '../models/User.js';
import { seedDemo } from './seed-demo.js';
import { currentMonth } from '../utils/dates.js';
import { hashPassword } from '../utils/password.js';
import { randomToken } from '../utils/crypto.js';

const demo = process.argv.includes('--demo');

async function makeUser(data: Partial<UserAttrs>, password: string): Promise<UserDoc> {
  const exists = await User.findOne({ email: data.email });
  if (exists) return exists;
  return User.create({ ...data, passwordHash: await hashPassword(password), passwordChangedAt: new Date(), status: 'active', dernierMoisMaj: currentMonth() });
}

await mongoose.connect(env.MONGODB_URI);

if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) {
  console.error('Renseignez ADMIN_EMAIL et ADMIN_PASSWORD (12 caractères minimum) dans .env avant de lancer le seed.');
  process.exit(1);
}
await makeUser({ matricule: '000000A', nom: 'Admin', prenom: 'Admin', email: env.ADMIN_EMAIL, role: 'admin', poste: 'Administrateur', departement: 'RH' }, env.ADMIN_PASSWORD);
console.log(`Administrateur prêt : ${env.ADMIN_EMAIL} (la double authentification sera demandée à la première connexion)`);

if (demo) {
  const pwd = `Demo-${randomToken(6)}9`;
  await seedDemo(pwd, process.argv.includes('--reset-demo'));
  console.log(`Comptes de démonstration, mot de passe commun : ${pwd}
  Directrice : claire.martin@demo.local
  Managers : karim.bernard@demo.local (Technique), julie.petit@demo.local (Marketing)
  Employés : sofia.lopez@, luca.rossi@, nadia.haddad@, thomas.dubois@, emma.roux@demo.local
  Invité : hugo.lambert@demo.local · Archivé : paul.garnier@demo.local
  (relancer avec --reset-demo pour repartir de zéro ; les managers doivent activer la 2FA à la première connexion)`);
}

await mongoose.disconnect();
