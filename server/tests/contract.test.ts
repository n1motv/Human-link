import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ZodType } from 'zod';
import { SickLeave } from '../src/models/SickLeave.js';
import { StoredFile } from '../src/models/StoredFile.js';
import { writeEncrypted } from '../src/utils/storage.js';
import { addDays, today } from '../src/utils/dates.js';
import { schemas } from '../src/shared.js';
import { client, connect, makeUser, resetDb, session, supervise, with2fa } from './helpers.js';

beforeAll(connect);
afterAll(() => mongoose.disconnect());
beforeEach(async () => {
  await resetDb();
  with2fa([]);
});

/** Vérifie une vraie réponse de l'API contre le schéma partagé et affiche les écarts lisiblement. */
function conforms(schema: ZodType, body: unknown, what: string) {
  const r = schema.safeParse(body);
  if (!r.success) {
    const detail = r.error.issues.map((i) => `${i.path.join('.') || '(racine)'} : ${i.message}`).join('\n  ');
    throw new Error(`${what} ne respecte pas le contrat partagé (shared/src/index.ts) :\n  ${detail}`);
  }
}

describe('contrat serveur / client : les réponses respectent les schémas partagés (Q-12)', () => {
  it('configuration publique et profil connecté', async () => {
    const config = await (await client()).get('/api/config');
    conforms(schemas.publicConfig, config.body, 'GET /api/config');

    const emp = await session('employe', { poste: 'Développeuse', telephone: '0612345678', salaire: 42000, dateEmbauche: '2024-03-01', typeContrat: 'CDI', sexe: 'Femme' });
    const me = await emp.c.get('/api/auth/me');
    conforms(schemas.user, me.body.user, 'GET /api/auth/me');
    const profile = await emp.c.get('/api/users/me/profile');
    conforms(schemas.user, profile.body.user, 'GET /api/users/me/profile');
  });

  it('liste des employés (paginée) et fiche vue par un administrateur', async () => {
    const adm = await session('admin');
    await makeUser('employe', { poste: 'Comptable', salaire: 38000 });
    const list = await adm.c.get('/api/users?limit=5');
    conforms(schemas.page(schemas.userRow), list.body, 'GET /api/users');
  });

  it('congés : création, liste personnelle, liste du manager', async () => {
    const mgr = await session('manager');
    const emp = await session('employe');
    await supervise(mgr.user, emp.user);
    const body = { raison: 'annual', dateDebut: addDays(today(), 20), dateFin: addDays(today(), 22) };
    conforms(schemas.leaveCreateBody, body, 'corps de la demande de congé');
    const created = await emp.c.post('/api/leaves').send(body);
    expect(created.status).toBe(201);
    conforms(schemas.leave, created.body.leave, 'POST /api/leaves');

    conforms(schemas.list(schemas.leave), (await emp.c.get('/api/leaves/mine')).body, 'GET /api/leaves/mine');
    const team = await mgr.c.get('/api/leaves?statut=en%20attente');
    conforms(schemas.list(schemas.leave), team.body, 'GET /api/leaves');
    expect(team.body.items).toHaveLength(1);
    expect(team.body.items[0].user.prenom).toBe(emp.user.prenom); // le client affiche le nom de la personne
  });

  it('arrêts maladie et primes', async () => {
    const mgr = await session('manager');
    const emp = await session('employe');
    const adm = await session('admin');
    await supervise(mgr.user, emp.user);
    await SickLeave.create({ userId: emp.user._id, typeMaladie: 'non justifie', dateDebut: today(), dateFin: today(), description: 'Grippe' });
    conforms(schemas.list(schemas.sick), (await emp.c.get('/api/sick-leaves/mine')).body, 'GET /api/sick-leaves/mine');
    conforms(schemas.list(schemas.sick), (await adm.c.get('/api/sick-leaves')).body, 'GET /api/sick-leaves');

    const bonus = await mgr.c.post('/api/bonuses').send({ employeId: String(emp.user._id), montant: 500, motif: 'Projet livré' });
    expect(bonus.status).toBe(201);
    conforms(schemas.list(schemas.bonus), (await adm.c.get('/api/bonuses')).body, 'GET /api/bonuses');
  });

  it('notifications, coffre-fort et calendrier', async () => {
    const adm = await session('admin');
    const emp = await session('employe');
    const stored = await writeEncrypted(Buffer.from('%PDF-1.4 test'));
    await StoredFile.create({
      ownerId: emp.user._id,
      category: 'bulletin',
      label: 'Bulletin octobre',
      storageKey: stored,
      mime: 'application/pdf',
      size: 13,
      month: 10,
      year: 2026,
      uploadedBy: adm.user._id,
    });
    const vault = await emp.c.get('/api/documents/mine');
    conforms(schemas.list(schemas.vaultFile), vault.body, 'GET /api/documents/mine');
    expect(vault.body.items).toHaveLength(1);

    const notifs = await emp.c.get('/api/notifications');
    conforms(schemas.list(schemas.notif), notifs.body, 'GET /api/notifications');

    await emp.c.post('/api/leaves').send({ raison: 'annual', dateDebut: addDays(today(), 3), dateFin: addDays(today(), 3) });
    const from = today();
    const to = addDays(today(), 30);
    const cal = await emp.c.get(`/api/calendar/me?from=${from}&to=${to}`);
    conforms(schemas.list(schemas.calendarEvent).extend({}).partial({ items: true }), { items: cal.body.events }, 'GET /api/calendar/me');
  });
});

describe('corps de requête partagés', () => {
  it('refusent une date impossible ou un code trop court, comme le serveur', () => {
    expect(schemas.dateOnly.safeParse('2026-02-30').success).toBe(false);
    expect(schemas.dateOnly.safeParse('2026-02-28').success).toBe(true);
    expect(schemas.twoFactorBody.safeParse({ challenge: 'x', code: '123' }).success).toBe(false);
    expect(schemas.loginBody.safeParse({ email: 'A@B.fr', password: 'x' }).data?.email).toBe('a@b.fr');
  });
});
