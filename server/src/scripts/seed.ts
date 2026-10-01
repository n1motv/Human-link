// Crée le compte administrateur initial (idempotent). Usage : npm run seed
// Avec --demo, crée aussi un petit jeu de données de démonstration (mot de passe : voir sortie).
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Supervision } from '../models/Supervision.js';
import { User, type UserAttrs, type UserDoc } from '../models/User.js';
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
  const common = { pays: 'France', nationalite: 'Française', typeContrat: 'CDI' as const, dateEmbauche: '2022-03-01', soldeConge: 12, teleworkMax: 2 };
  const dir = await makeUser({ ...common, matricule: '000101D', nom: 'Martin', prenom: 'Claire', email: 'claire.martin@demo.local', role: 'manager', isDirector: true, poste: 'Directrice', departement: 'Direction', dateNaissance: '1980-04-12', salaire: 7200 }, pwd);
  const mgr = await makeUser({ ...common, matricule: '000102M', nom: 'Bernard', prenom: 'Karim', email: 'karim.bernard@demo.local', role: 'manager', poste: 'Responsable technique', departement: 'Technique', dateNaissance: '1985-09-23', salaire: 5200 }, pwd);
  const e1 = await makeUser({ ...common, matricule: '000103E', nom: 'Lopez', prenom: 'Sofia', email: 'sofia.lopez@demo.local', role: 'employe', poste: 'Développeuse', departement: 'Technique', dateNaissance: '1993-01-30', salaire: 3800 }, pwd);
  const e2 = await makeUser({ ...common, matricule: '000104E', nom: 'Rossi', prenom: 'Luca', email: 'luca.rossi@demo.local', role: 'employe', poste: 'Designer', departement: 'Technique', dateNaissance: '1995-06-18', salaire: 3400 }, pwd);
  for (const [m, s] of [[dir, mgr], [mgr, e1], [mgr, e2]] as const) await Supervision.updateOne({ superviseId: s._id }, { managerId: m._id, superviseId: s._id }, { upsert: true });
  console.log(`\nComptes de démonstration (mot de passe commun : ${pwd})\n  claire.martin@demo.local (directrice), karim.bernard@demo.local (manager), sofia.lopez@demo.local, luca.rossi@demo.local`);
}

await mongoose.disconnect();
