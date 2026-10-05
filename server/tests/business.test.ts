import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { User } from '../src/models/User.js';
import { addDays, nextMonday, today } from '../src/utils/dates.js';
import { connect, makeUser, resetDb, session, supervise, with2fa } from './helpers.js';

beforeAll(connect);
afterAll(() => mongoose.disconnect());
beforeEach(async () => {
  await resetDb();
  with2fa([]);
});

// Un lundi dans le futur proche, pour éviter les week-ends : 3 jours ouvrés = lun-mer.
const monday = nextMonday(addDays(today(), 7));
const leave = { raison: 'Voyage', dateDebut: monday, dateFin: addDays(monday, 2), description: 'Vacances' };

/** Équipe type : un manager supervisant un employé, plus un admin. */
async function team() {
  const mgr = await session('manager');
  const emp = await session('employe');
  const adm = await session('admin');
  await supervise(mgr.user, emp.user);
  return { mgr, emp, adm };
}

describe('congés : double validation manager puis admin', () => {
  it('suit le circuit complet et débite le solde une seule fois', async () => {
    const { mgr, emp, adm } = await team();
    const created = await emp.c.post('/api/leaves').send(leave);
    expect(created.status).toBe(201);
    expect(created.body.leave.nombreJours).toBe(3);
    const id = created.body.leave.id as string;

    // L'admin ne peut pas valider avant le manager.
    expect((await adm.c.post(`/api/leaves/${id}/decision`).send({ decision: 'accepte' })).status).toBe(409);

    expect((await mgr.c.post(`/api/leaves/${id}/decision`).send({ decision: 'accepte' })).status).toBe(200);
    expect((await adm.c.post(`/api/leaves/${id}/decision`).send({ decision: 'accepte' })).status).toBe(200);
    expect((await User.findById(emp.user._id))!.soldeConge).toBe(17);

    // Rejouer la décision ne re-débite pas.
    expect((await adm.c.post(`/api/leaves/${id}/decision`).send({ decision: 'accepte' })).status).toBe(409);
    expect((await User.findById(emp.user._id))!.soldeConge).toBe(17);
  });

  it('exige un motif de refus et notifie l’employé', async () => {
    const { mgr, emp } = await team();
    const id = (await emp.c.post('/api/leaves').send(leave)).body.leave.id;
    expect((await mgr.c.post(`/api/leaves/${id}/decision`).send({ decision: 'refuse' })).status).toBe(400);
    expect((await mgr.c.post(`/api/leaves/${id}/decision`).send({ decision: 'refuse', motifRefus: 'Période chargée' })).status).toBe(200);
    const notifs = await emp.c.get('/api/notifications');
    expect(notifs.body.items[0].key).toBe('leave.refused_manager');
    expect(notifs.body.items[0].params.motif).toBe('Période chargée');
  });

  it('refuse un chevauchement, un solde insuffisant et une date passée', async () => {
    const { emp } = await team();
    expect((await emp.c.post('/api/leaves').send(leave)).status).toBe(201);
    expect((await emp.c.post('/api/leaves').send({ ...leave, dateDebut: addDays(monday, 1) })).status).toBe(409);
    const far = addDays(monday, 30);
    expect((await emp.c.post('/api/leaves').send({ ...leave, dateDebut: far, dateFin: addDays(far, 60) })).body.error.code).toBe('INSUFFICIENT_BALANCE');
    expect((await emp.c.post('/api/leaves').send({ ...leave, dateDebut: '2020-01-06', dateFin: '2020-01-07' })).body.error.code).toBe('PAST_DATE');
  });

  it("un manager ne décide pas pour une personne hors de son équipe", async () => {
    const { emp } = await team();
    const stranger = await session('manager');
    const id = (await emp.c.post('/api/leaves').send(leave)).body.leave.id;
    expect((await stranger.c.post(`/api/leaves/${id}/decision`).send({ decision: 'accepte' })).status).toBe(403);
  });

  it("l'employé ne peut ni décider, ni lister les demandes des autres", async () => {
    const { emp } = await team();
    const other = await session('employe');
    const id = (await emp.c.post('/api/leaves').send(leave)).body.leave.id;
    expect((await other.c.post(`/api/leaves/${id}/decision`).send({ decision: 'accepte' })).status).toBe(403);
    expect((await other.c.get('/api/leaves')).status).toBe(403);
    expect((await other.c.delete(`/api/leaves/${id}`)).status).toBe(404); // pas la sienne
    expect((await emp.c.delete(`/api/leaves/${id}`)).status).toBe(200);
  });

  it('une personne sans manager passe directement à l’admin', async () => {
    const loner = await session('employe');
    const created = await loner.c.post('/api/leaves').send(leave);
    expect(created.body.leave.statutManager).toBe('accepte');
  });

  it("l'acceptation efface le télétravail prévu sur la période", async () => {
    const { mgr, emp, adm } = await team();
    const { Telework } = await import('../src/models/Telework.js');
    await Telework.create({ userId: emp.user._id, date: addDays(monday, 1) });
    const id = (await emp.c.post('/api/leaves').send(leave)).body.leave.id;
    await mgr.c.post(`/api/leaves/${id}/decision`).send({ decision: 'accepte' });
    await adm.c.post(`/api/leaves/${id}/decision`).send({ decision: 'accepte' });
    expect(await Telework.countDocuments({ userId: emp.user._id })).toBe(0);
  });
});

describe('primes, télétravail, réunions', () => {
  it("un manager ne peut proposer une prime qu'à son équipe", async () => {
    const { mgr, emp, adm } = await team();
    const stranger = await makeUser('employe');
    expect((await mgr.c.post('/api/bonuses').send({ employeId: String(stranger._id), montant: 100, motif: 'Bravo' })).status).toBe(403);
    const ok = await mgr.c.post('/api/bonuses').send({ employeId: String(emp.user._id), montant: 250, motif: 'Projet livré' });
    expect(ok.status).toBe(201);
    expect((await adm.c.post(`/api/bonuses/${ok.body.bonus.id}/decision`).send({ decision: 'accepte' })).status).toBe(200);
    expect((await emp.c.post('/api/bonuses').send({ employeId: String(emp.user._id), montant: 1, motif: 'x' })).status).toBe(403);
  });

  it('impose le quota exact de jours de télétravail sur la semaine suivante', async () => {
    const emp = await session('employe', { teleworkMax: 2 });
    const info = await emp.c.get('/api/telework/next-week');
    const days: string[] = info.body.days;
    expect(days).toHaveLength(5);
    expect((await emp.c.put('/api/telework/next-week').send({ dates: [days[0]] })).body.error.code).toBe('WRONG_COUNT');
    expect((await emp.c.put('/api/telework/next-week').send({ dates: ['2020-01-01', '2020-01-02'] })).body.error.code).toBe('OUT_OF_WEEK');
    expect((await emp.c.put('/api/telework/next-week').send({ dates: [days[0], days[3]] })).status).toBe(200);
    expect((await emp.c.get('/api/telework/next-week')).body.chosen).toEqual([days[0], days[3]]);
  });

  it('les invitations de réunion ne sont répondables que par les invités', async () => {
    const { mgr, emp } = await team();
    const outsider = await session('employe');
    const when = new Date(Date.now() + 86_400_000).toISOString();
    const m = await mgr.c.post('/api/meetings').send({ title: 'Point hebdo', dateTime: when, invitees: [String(emp.user._id), String(outsider.user._id)] });
    expect(m.status).toBe(201);
    expect(m.body.meeting.invitees).toHaveLength(1); // l'externe à l'équipe est ignoré
    const id = m.body.meeting.id;
    expect((await outsider.c.post(`/api/meetings/${id}/respond`).send({ response: 'Accepted' })).status).toBe(404);
    expect((await emp.c.post(`/api/meetings/${id}/respond`).send({ response: 'Accepted' })).status).toBe(200);
    const org = await mgr.c.get('/api/meetings/organized');
    expect(org.body.items[0].accepted).toBe(1);
  });
});

describe('contrôle d’accès et données sensibles', () => {
  it('un employé ne peut pas lister les utilisateurs, les journaux ni les contacts', async () => {
    const emp = await session('employe');
    for (const url of ['/api/users', '/api/rgpd/audit', '/api/contact', '/api/dashboard/admin', '/api/org/supervisions', '/api/sick-leaves', '/api/bonuses']) {
      expect((await emp.c.get(url)).status, url).toBe(403);
    }
  });

  it('le salaire et le n° de sécu sont chiffrés en base et masqués à un manager', async () => {
    const { mgr, emp, adm } = await team();
    await adm.c.patch(`/api/users/${emp.user._id}`).send({ salaire: 4200, numeroSecu: '1850175123456', telephone: '0600000000' });
    const raw = await mongoose.connection.db!.collection('users').findOne({ _id: emp.user._id });
    for (const f of ['salaire', 'numeroSecu', 'telephone']) expect(String(raw![f])).toMatch(/^enc:v2:/);
    expect(JSON.stringify(raw)).not.toMatch(/1850175123456|4200/);

    const asAdmin = await adm.c.get(`/api/users/${emp.user._id}`);
    expect(asAdmin.body.user.salaire).toBe(4200);
    expect(asAdmin.body.user.numeroSecu).toBe('1850175123456');
    const asManager = await mgr.c.get(`/api/users/${emp.user._id}`);
    expect(asManager.status).toBe(200);
    expect(asManager.body.user.salaire).toBeUndefined();
    expect(asManager.body.user.numeroSecu).toBeUndefined();
    const stranger = await session('manager');
    expect((await stranger.c.get(`/api/users/${emp.user._id}`)).status).toBe(403);
    // La lecture des données d'un tiers est tracée.
    const audit = await adm.c.get('/api/rgpd/audit?action=user.read');
    expect(audit.body.total).toBeGreaterThan(0);
  });

  it("l'admin ne peut ni se rétrograder, ni s'archiver ; un changement de rôle coupe les sessions", async () => {
    const adm = await session('admin');
    const emp = await session('employe');
    expect((await adm.c.patch(`/api/users/${adm.user._id}`).send({ role: 'employe' })).status).toBe(400);
    expect((await adm.c.delete(`/api/users/${adm.user._id}`)).status).toBe(400);
    expect((await adm.c.patch(`/api/users/${emp.user._id}`).send({ role: 'manager' })).status).toBe(200);
    expect((await emp.c.get('/api/leaves/mine')).status).toBe(401);
  });

  it("un admin peut réinitialiser la 2FA d'un utilisateur (action tracée), pas un employé", async () => {
    const adm = await session('admin');
    const emp = await session('employe');
    const victim = await session('employe');
    await User.updateOne({ _id: victim.user._id }, { 'twoFactor.enabled': true });
    expect((await emp.c.post(`/api/users/${victim.user._id}/reset-2fa`).send({})).status).toBe(403);
    expect((await adm.c.post(`/api/users/${victim.user._id}/reset-2fa`).send({})).status).toBe(200);
    expect((await User.findById(victim.user._id))!.twoFactor?.enabled).toBe(false);
    expect((await victim.c.get('/api/leaves/mine')).status).toBe(401); // sessions coupées
    expect((await adm.c.get('/api/rgpd/audit?action=user.reset_2fa')).body.total).toBe(1);
  });

  it('rejette les champs hors schéma (pas de mass-assignment)', async () => {
    const emp = await session('employe');
    const res = await emp.c.patch('/api/users/me/profile').send({ nom: 'Nouveau', role: 'admin', soldeConge: 999, salaire: 99999 });
    expect(res.status).toBe(200);
    const u = (await User.findById(emp.user._id))!;
    expect(u.nom).toBe('Nouveau');
    expect(u.role).toBe('employe');
    expect(u.soldeConge).toBe(20);
  });

  it("changer son e-mail exige le mot de passe actuel", async () => {
    const emp = await session('employe');
    expect((await emp.c.patch('/api/users/me/profile').send({ email: 'autre@test.local' })).status).toBe(403);
    const ok = await emp.c.patch('/api/users/me/profile').send({ email: 'autre@test.local', currentPassword: 'Sup3r-Secret-Pass-2026' });
    expect(ok.status).toBe(200);
  });

  it('un employé ne peut supprimer que ses propres notifications', async () => {
    const { mgr, emp } = await team();
    await emp.c.post('/api/leaves').send(leave);
    const notif = (await mgr.c.get('/api/notifications')).body.items[0];
    expect((await emp.c.delete(`/api/notifications/${notif.id}`)).status).toBe(404);
    expect((await mgr.c.delete(`/api/notifications/${notif.id}`)).status).toBe(200);
  });
});

describe('coffre-fort et fichiers', () => {
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF');

  it('stocke chiffré, n’est téléchargeable que par son propriétaire et l’admin', async () => {
    const adm = await session('admin');
    const owner = await session('employe');
    const other = await session('employe');

    const up = await adm.c.post(`/api/documents/user/${owner.user._id}`).field('type', 'bulletin').field('month', '3').field('year', '2026').attach('file', pdf, 'bulletin.pdf');
    expect(up.status).toBe(201);
    const id = up.body.file.id;
    expect(up.body.file.storageKey).toBeUndefined(); // le chemin disque n'est jamais exposé

    const dl = await owner.c.get(`/api/documents/${id}/download`);
    expect(dl.status).toBe(200);
    expect(dl.headers['content-type']).toBe('application/pdf');
    expect(dl.headers['x-content-type-options']).toBe('nosniff');
    expect(dl.headers['cache-control']).toMatch(/no-store/);
    expect((await other.c.get(`/api/documents/${id}/download`)).status).toBe(404);
    expect((await adm.c.get(`/api/documents/${id}/download`)).status).toBe(200);
    expect((await other.c.get(`/api/documents/mine`)).body.items).toHaveLength(0);

    // Sur disque, le contenu est chiffré : aucune trace de l'en-tête PDF.
    const root = process.env.STORAGE_DIR!;
    const files: string[] = [];
    const walk = (d: string) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : files.push(path.join(d, e.name))));
    walk(root);
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) expect(fs.readFileSync(f).includes('%PDF')).toBe(false);
  });

  it('refuse un faux PDF (extension trompeuse) et un exécutable', async () => {
    const adm = await session('admin');
    const owner = await session('employe');
    const fake = await adm.c.post(`/api/documents/user/${owner.user._id}`).field('type', 'autre').field('name', 'Test').attach('file', Buffer.from('<?php system($_GET[1]); ?>'), 'shell.pdf');
    expect(fake.status).toBe(400);
    expect(fake.body.error.code).toBe('BAD_FILE_TYPE');
    const exe = await adm.c.post(`/api/documents/user/${owner.user._id}`).field('type', 'autre').field('name', 'Test').attach('file', Buffer.from('MZ\x90\x00\x03'), 'a.pdf');
    expect(exe.status).toBe(400);
  });

  it("le justificatif d'un arrêt maladie reste inaccessible au manager", async () => {
    const { mgr, emp, adm } = await team();
    const sick = await emp.c.post('/api/sick-leaves').field('typeMaladie', 'justifie').field('dateDebut', today()).field('dateFin', addDays(today(), 1)).attach('attachment', pdf, 'certificat.pdf');
    expect(sick.status).toBe(201);
    const id = sick.body.sick.id;
    expect((await mgr.c.get(`/api/sick-leaves/${id}/attachment`)).status).toBe(404);
    expect((await adm.c.get(`/api/sick-leaves/${id}/attachment`)).status).toBe(200);
    expect((await emp.c.get(`/api/sick-leaves/${id}/attachment`)).status).toBe(200);
  });
});

describe('feedback anonyme, RGPD, assistant', () => {
  it("n'accepte qu'un feedback par mois et ne le rattache à personne", async () => {
    const emp = await session('employe');
    const adm = await session('admin');
    const ratings = Object.fromEntries(['env', 'management', 'worklife', 'comm', 'recognition', 'training', 'equipment', 'team', 'meetings', 'transparency'].map((k) => [k, 4]));
    expect((await emp.c.post('/api/feedback').send({ ratings, suggestion: 'Plus de café' })).status).toBe(201);
    expect((await emp.c.post('/api/feedback').send({ ratings })).status).toBe(409);
    expect((await emp.c.get('/api/feedback/status')).body.alreadySubmitted).toBe(true);
    const raw = await mongoose.connection.db!.collection('feedbacks').findOne({});
    expect(JSON.stringify(raw)).not.toContain(String(emp.user._id));
    const res = await adm.c.get('/api/feedback/results');
    expect(res.body.total).toBe(1);
    expect(res.body.suggestionsHidden).toBe(true); // < 3 réponses : suggestions masquées (anti ré-identification)
  });

  it("l'export RGPD contient les données de la personne et rien d'un autre", async () => {
    const { emp } = await team();
    const other = await session('employe');
    await emp.c.post('/api/leaves').send(leave);
    await other.c.post('/api/leaves').send({ ...leave, raison: 'Secret de l’autre' });
    const res = await emp.c.get('/api/rgpd/export');
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/attachment/);
    const data = JSON.parse(res.text);
    expect(data.profile.email).toBe(emp.user.email);
    expect(data.leaves).toHaveLength(1);
    expect(res.text).not.toContain('Secret de l’autre');
    expect(res.text).not.toMatch(/passwordHash/);
  });

  it("archiver puis anonymiser efface les données personnelles", async () => {
    const adm = await session('admin');
    const emp = await session('employe', { telephone: '0612345678', adresse: '1 rue Secrète', salaire: 3000 });
    expect((await adm.c.post(`/api/users/${emp.user._id}/anonymize`).send({})).status).toBe(400); // il faut archiver d'abord
    expect((await adm.c.delete(`/api/users/${emp.user._id}`)).status).toBe(200);
    expect((await emp.c.get('/api/leaves/mine')).status).toBe(401);
    expect((await adm.c.post(`/api/users/${emp.user._id}/anonymize`).send({})).status).toBe(200);
    const raw = await mongoose.connection.db!.collection('users').findOne({ _id: emp.user._id });
    expect(raw!.status).toBe('anonymized');
    expect(raw!.telephone).toBeUndefined();
    expect(raw!.adresse).toBeUndefined();
    expect(raw!.salaire).toBeUndefined();
    expect(raw!.email).toMatch(/@anonymized\.invalid$/);
    expect(raw!.passwordHash).toBeUndefined();
  });

  it("l'assistant répond depuis les données de l'utilisateur uniquement, dans sa langue", async () => {
    const emp = await session('employe', { salaire: 3100, soldeConge: 12.5 });
    await session('employe', { salaire: 9999 });
    const fr = await emp.c.post('/api/chatbot').send({ question: 'Quel est mon salaire ?', lang: 'fr' });
    expect(fr.body.answer).toContain('3100');
    expect(fr.body.sensitive).toBe(true);
    const en = await emp.c.post('/api/chatbot').send({ question: 'How many days do I have left? my leave balance', lang: 'fr' });
    expect(en.body.answer).toMatch(/12\.5 day/);
    const es = await emp.c.post('/api/chatbot').send({ question: '¿Cuál es mi saldo de vacaciones?', lang: 'fr' });
    expect(es.body.answer).toMatch(/12\.5 día/);
    const none = await emp.c.post('/api/chatbot').send({ question: 'Quel est le salaire de mon collègue ?', lang: 'fr' });
    expect(none.body.answer).not.toContain('9999');
  });
});

describe('cron : crédit mensuel idempotent', () => {
  it('ne crédite qu’une fois par mois', async () => {
    const { accrueMonthlyLeave } = await import('../src/jobs/scheduler.js');
    const u = await makeUser('employe', { soldeConge: 10, dernierMoisMaj: '2000-01' });
    expect(await accrueMonthlyLeave()).toBeGreaterThan(0);
    expect(await accrueMonthlyLeave()).toBe(0);
    expect((await User.findById(u._id))!.soldeConge).toBe(12.5);
  });
});
