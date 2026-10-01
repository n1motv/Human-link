import mongoose, { type Types } from 'mongoose';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { clientConfig } from '../src/config/client.js';
import { Supervision } from '../src/models/Supervision.js';
import { User, type Role } from '../src/models/User.js';
import { outbox } from '../src/utils/mailer.js';
import { hashPassword } from '../src/utils/password.js';

export const PASSWORD = 'Sup3r-Secret-Pass-2026';
export const app = createApp();
export { outbox };

let counter = 0;

export async function connect() {
  await mongoose.connect(process.env.MONGODB_URI!);
  await Promise.all(mongoose.modelNames().map((m) => mongoose.model(m).syncIndexes()));
}

export async function resetDb() {
  const collections = await mongoose.connection.db!.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
  outbox.length = 0;
}

/** Désactive l'obligation de 2FA (sauf dans le test dédié) pour simplifier les scénarios. */
export function with2fa(roles: Role[]) {
  clientConfig.security.require2faForRoles = roles;
}

export async function makeUser(role: Role, extra: Record<string, unknown> = {}) {
  counter++;
  return User.create({
    matricule: `0${String(counter).padStart(5, '0')}T`,
    nom: `Nom${counter}`,
    prenom: `Prenom${counter}`,
    email: `${role}${counter}@test.local`,
    role,
    status: 'active',
    passwordHash: await hashPassword(PASSWORD),
    passwordChangedAt: new Date(),
    soldeConge: 20,
    teleworkMax: 2,
    departement: 'Technique',
    ...extra,
  });
}

export async function supervise(manager: { _id: Types.ObjectId }, member: { _id: Types.ObjectId }) {
  await Supervision.create({ managerId: manager._id, superviseId: member._id });
}

/** Client HTTP qui conserve les cookies et envoie le jeton CSRF sur chaque écriture. */
export async function client() {
  const agent = request.agent(app);
  await agent.get('/api/auth/csrf');
  const csrf = () => {
    const jar = (agent as unknown as { jar: { getCookies(o: unknown): { name: string; value: string }[] } }).jar;
    return jar.getCookies({ domain: '127.0.0.1', path: '/api/', secure: false, script: false }).find((c) => c.name === 'hl_csrf')?.value ?? '';
  };
  const wrap = (method: 'post' | 'put' | 'patch' | 'delete') => (url: string) => agent[method](url).set('X-CSRF-Token', csrf());
  return {
    raw: agent,
    get: (url: string) => agent.get(url),
    post: wrap('post'),
    put: wrap('put'),
    patch: wrap('patch'),
    delete: wrap('delete'),
  };
}

export type Client = Awaited<ReturnType<typeof client>>;

export async function loginAs(email: string, password = PASSWORD) {
  const c = await client();
  const res = await c.post('/api/auth/login').send({ email, password });
  return { c, res };
}

export async function session(role: Role, extra: Record<string, unknown> = {}) {
  const user = await makeUser(role, extra);
  const { c, res } = await loginAs(user.email);
  if (res.status !== 200) throw new Error(`Connexion de test impossible : ${res.status} ${JSON.stringify(res.body)}`);
  return { user, c };
}
