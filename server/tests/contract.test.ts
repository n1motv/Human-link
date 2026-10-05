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

describe('contrat serveur / client : organisation, réunions, avis, contact, audit, sessions', () => {
  it('organisation, tableau de bord et calendriers', async () => {
    const adm = await session('admin');
    const mgr = await session('manager', { isDirector: true });
    const emp = await session('employe');
    await supervise(mgr.user, emp.user);
    await emp.c.post('/api/leaves').send({ raison: 'annual', dateDebut: addDays(today(), 3), dateFin: addDays(today(), 3) });

    conforms(schemas.supervisions, (await adm.c.get('/api/org/supervisions')).body, 'GET /api/org/supervisions');
    conforms(schemas.orgTree, (await adm.c.get('/api/org/tree')).body, 'GET /api/org/tree');
    conforms(
      schemas.list(schemas.teamMember).extend({}).omit({ items: true }).extend({ team: schemas.teamMember.array() }),
      (await mgr.c.get('/api/org/team')).body,
      'GET /api/org/team',
    );
    conforms(schemas.adminDashboard, (await adm.c.get('/api/dashboard/admin')).body, 'GET /api/dashboard/admin');

    const range = `from=${today()}&to=${addDays(today(), 30)}`;
    conforms(schemas.list(schemas.leaveCalendarItem), (await mgr.c.get(`/api/calendar/leaves?${range}`)).body, 'GET /api/calendar/leaves');
    conforms(schemas.list(schemas.teleworkCalendarItem), (await adm.c.get(`/api/telework/calendar?${range}`)).body, 'GET /api/telework/calendar');
    const week = await emp.c.get('/api/telework/next-week');
    conforms(schemas.teleworkWeek, week.body, 'GET /api/telework/next-week');
  });

  it('réunions', async () => {
    const mgr = await session('manager');
    const emp = await session('employe');
    await supervise(mgr.user, emp.user);
    const created = await mgr.c
      .post('/api/meetings')
      .send({ title: 'Revue de sprint', dateTime: new Date(Date.now() + 86_400_000).toISOString(), invitees: [String(emp.user._id)] });
    expect(created.status).toBe(201);
    conforms(schemas.list(schemas.meetingOrganized), (await mgr.c.get('/api/meetings/organized')).body, 'GET /api/meetings/organized');
    conforms(schemas.list(schemas.meetingInvitation), (await emp.c.get('/api/meetings/invitations')).body, 'GET /api/meetings/invitations');
    conforms(schemas.list(schemas.brief), (await mgr.c.get('/api/meetings/invitable')).body, 'GET /api/meetings/invitable');
  });

  it('avis anonymes, contact, journal d’audit et sessions', async () => {
    const adm = await session('admin');
    const emp = await session('employe');
    const status = await emp.c.get('/api/feedback/status');
    conforms(schemas.feedbackStatus, status.body, 'GET /api/feedback/status');
    const ratings = Object.fromEntries((status.body.criteria as string[]).map((k) => [k, 4]));
    expect((await emp.c.post('/api/feedback').send({ ratings, suggestion: 'Plus de calme' })).status).toBe(201);
    conforms(schemas.feedbackResults, (await adm.c.get('/api/feedback/results')).body, 'GET /api/feedback/results');

    expect((await emp.c.post('/api/contact').send({ sujet: 'Question', message: 'Bonjour, une question.' })).status).toBe(201);
    conforms(schemas.list(schemas.contactRequest), (await adm.c.get('/api/contact')).body, 'GET /api/contact');

    conforms(schemas.page(schemas.auditEntry), (await adm.c.get('/api/rgpd/audit')).body, 'GET /api/rgpd/audit');
    conforms(schemas.list(schemas.sessionInfo), (await emp.c.get('/api/auth/sessions')).body, 'GET /api/auth/sessions');
  });
});
