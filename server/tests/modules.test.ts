import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuditLog } from '../src/models/AuditLog.js';
import { ContactRequest } from '../src/models/ContactRequest.js';
import { LeaveRequest } from '../src/models/LeaveRequest.js';
import { Meeting } from '../src/models/Meeting.js';
import { Notification } from '../src/models/Notification.js';
import { SickLeave } from '../src/models/SickLeave.js';
import { StoredFile } from '../src/models/StoredFile.js';
import { User } from '../src/models/User.js';
import { addDays, today } from '../src/utils/dates.js';
import { writeEncrypted } from '../src/utils/storage.js';
import { client, connect, makeUser, resetDb, session, supervise, with2fa } from './helpers.js';

beforeAll(connect);
afterAll(() => mongoose.disconnect());
beforeEach(async () => {
  await resetDb();
  with2fa([]);
  fs.rmSync(process.env.STORAGE_DIR!, { recursive: true, force: true }); // chaque test repart d'un stockage vide
});

const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF');
const id = (u: { _id: unknown }) => String(u._id);

async function acceptedLeave(userId: mongoose.Types.ObjectId, from: string, to: string, raison = 'annual') {
  return LeaveRequest.create({ userId, raison, dateDebut: from, dateFin: to, nombreJours: 1, statut: 'accepte', statutManager: 'accepte', statutAdmin: 'accepte' });
}

function filesOnDisk(): string[] {
  const out: string[] = [];
  const walk = (d: string) => fs.existsSync(d) && fs.readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : out.push(path.join(d, e.name))));
  walk(process.env.STORAGE_DIR!);
  return out;
}

describe('coffre-fort : droits et refus de téléversement', () => {
  it('seul un administrateur dépose, liste le coffre d’un tiers ou supprime', async () => {
    const adm = await session('admin');
    const mgr = await session('manager');
    const emp = await session('employe');
    const other = await session('employe');
    const upload = (c: typeof adm.c) => c.post(`/api/documents/user/${id(other.user)}`).field('type', 'autre').field('name', 'Doc').attach('file', pdf, 'doc.pdf');

    expect((await upload(emp.c)).status).toBe(403);
    expect((await upload(mgr.c)).status).toBe(403);
    expect((await emp.c.get(`/api/documents/user/${id(other.user)}`)).status).toBe(403); // pas le coffre d'un collègue
    expect((await mgr.c.get(`/api/documents/user/${id(other.user)}`)).status).toBe(403);
    expect((await (await client()).get('/api/documents/mine')).status).toBe(401);

    const up = await upload(adm.c);
    expect(up.status).toBe(201);
    const fileId = up.body.file.id;
    expect((await emp.c.delete(`/api/documents/${fileId}`)).status).toBe(403);
    expect((await other.c.delete(`/api/documents/${fileId}`)).status).toBe(403); // même le propriétaire ne supprime pas

    const listed = await adm.c.get(`/api/documents/user/${id(other.user)}`);
    expect(listed.body.items).toHaveLength(1);
    expect(await AuditLog.countDocuments({ action: 'vault.list' })).toBe(1); // consultation du coffre d'un tiers tracée
  });

  it('refuse un fichier trop gros, un type interdit et une période manquante', async () => {
    const adm = await session('admin');
    const emp = await session('employe');
    const url = `/api/documents/user/${id(emp.user)}`;

    const tooBig = Buffer.concat([pdf, Buffer.alloc(10 * 1024 * 1024)]);
    const big = await adm.c.post(url).field('type', 'autre').field('name', 'Gros').attach('file', tooBig, 'gros.pdf');
    expect(big.status).toBe(400);
    expect(big.body.error.code).toBe('UPLOAD');

    const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
    const wrongType = await adm.c.post(url).field('type', 'autre').field('name', 'Image').attach('file', png, 'image.png');
    expect(wrongType.status).toBe(400); // le coffre n'accepte que des PDF
    expect(wrongType.body.error.code).toBe('BAD_FILE_TYPE');

    expect((await adm.c.post(url).field('type', 'bulletin').attach('file', pdf, 'b.pdf')).body.error.code).toBe('PERIOD_REQUIRED');
    expect((await adm.c.post(url).field('type', 'autre').attach('file', pdf, 'a.pdf')).body.error.code).toBe('NAME_REQUIRED');
    expect((await adm.c.post(url).field('type', 'bulletin').field('month', '3').field('year', '2026')).body.error.code).toBe('NO_FILE');
    expect((await adm.c.post(url).field('type', 'secret').field('name', 'x').attach('file', pdf, 'a.pdf')).status).toBe(400);
    expect(filesOnDisk()).toHaveLength(0); // rien n'a été écrit sur disque
  });

  it('refuse le dépôt pour un compte archivé ou inconnu', async () => {
    const adm = await session('admin');
    const archived = await makeUser('employe', { status: 'archived' });
    const up = (uid: string) => adm.c.post(`/api/documents/user/${uid}`).field('type', 'autre').field('name', 'x').attach('file', pdf, 'a.pdf');
    expect((await up(id(archived))).status).toBe(404);
    expect((await up('64b64b64b64b64b64b64b64b')).status).toBe(404);
    expect((await up('pas-un-id')).status).toBe(400);
  });

  it('la suppression retire aussi le fichier chiffré du disque', async () => {
    const adm = await session('admin');
    const emp = await session('employe');
    const up = await adm.c.post(`/api/documents/user/${id(emp.user)}`).field('type', 'autre').field('name', 'À effacer').attach('file', pdf, 'a.pdf');
    expect(filesOnDisk()).toHaveLength(1);
    expect((await adm.c.delete(`/api/documents/${up.body.file.id}`)).status).toBe(200);
    expect(filesOnDisk()).toHaveLength(0);
    expect((await emp.c.get(`/api/documents/${up.body.file.id}/download`)).status).toBe(404);
  });

  it('les justificatifs de congé ne sont pas téléchargeables par les routes du coffre-fort', async () => {
    const adm = await session('admin');
    const emp = await session('employe');
    const f = await StoredFile.create({ ownerId: emp.user._id, category: 'conge', label: 'Justificatif', mime: 'application/pdf', size: pdf.length, storageKey: await writeEncrypted(pdf) });
    expect((await adm.c.get(`/api/documents/${f._id}/download`)).status).toBe(404);
    expect((await emp.c.get(`/api/documents/${f._id}/download`)).status).toBe(404);
    expect((await emp.c.get('/api/documents/mine')).body.items).toHaveLength(0);
  });
});

describe('RGPD : anonymisation et journal d’audit', () => {
  it('l’anonymisation efface fichiers, notifications, motifs de santé et invitations, et verrouille le compte', async () => {
    const adm = await session('admin');
    const emp = await session('employe', { telephone: '0612345678', numeroSecu: '1850175123456' });
    const mgr = await makeUser('manager');
    await supervise(mgr, emp.user);
    await adm.c.post(`/api/documents/user/${id(emp.user)}`).field('type', 'autre').field('name', 'Contrat').attach('file', pdf, 'c.pdf');
    const sick = await SickLeave.create({ userId: emp.user._id, typeMaladie: 'justifie', dateDebut: today(), dateFin: today(), description: 'Dépression', statut: 'accepte' });
    await LeaveRequest.create({ userId: emp.user._id, raison: 'annual', dateDebut: today(), dateFin: today(), nombreJours: 1, description: 'Opération', motifRefus: 'Détail sensible' });
    await Meeting.create({ title: 'Point', dateTime: new Date(), createdBy: mgr._id, invitees: [{ userId: emp.user._id, status: 'Accepted' }, { userId: mgr._id }] });
    expect(await Notification.countDocuments({ userId: emp.user._id })).toBeGreaterThan(0); // le dépôt de document a notifié
    expect(filesOnDisk()).toHaveLength(1);

    await adm.c.delete(`/api/users/${id(emp.user)}`);
    expect((await adm.c.post(`/api/users/${id(emp.user)}/anonymize`).send({})).status).toBe(200);

    expect(filesOnDisk()).toHaveLength(0);
    expect(await StoredFile.countDocuments({ ownerId: emp.user._id })).toBe(0);
    expect(await Notification.countDocuments({ userId: emp.user._id })).toBe(0);
    expect((await SickLeave.findById(sick._id))!.description).toBeUndefined(); // la date reste pour les statistiques, le motif disparaît
    expect((await LeaveRequest.findOne({ userId: emp.user._id }))!.description).toBeUndefined();
    const meeting = await Meeting.findOne({});
    expect(meeting!.invitees.map((i) => String(i.userId))).toEqual([id(mgr)]);
    const raw = await mongoose.connection.db!.collection('users').findOne({ _id: emp.user._id });
    expect(raw!.nom).toBe('Ancien');
    expect(raw!.numeroSecu).toBeUndefined();
    expect(raw!.telephone).toBeUndefined();

    const list = await adm.c.get('/api/users?limit=100');
    expect(list.body.items.map((u: { id: string }) => u.id)).not.toContain(id(emp.user)); // n'apparaît plus dans les listes
    expect((await adm.c.post(`/api/users/${id(emp.user)}/restore`).send({})).status).toBe(400); // irréversible
  });

  it('seul un compte archivé peut être restauré, et il peut se reconnecter', async () => {
    const adm = await session('admin');
    const emp = await makeUser('employe');
    expect((await adm.c.post(`/api/users/${id(emp)}/restore`).send({})).status).toBe(400);
    await adm.c.delete(`/api/users/${id(emp)}`);
    expect((await adm.c.post(`/api/users/${id(emp)}/restore`).send({})).status).toBe(200);
    expect((await User.findById(emp._id))!.status).toBe('active');
  });

  it('le journal d’audit est réservé à l’admin, filtrable, borné et résiste aux expressions régulières', async () => {
    const adm = await session('admin');
    const emp = await session('employe');
    await adm.c.get(`/api/documents/user/${id(emp.user)}`);
    await adm.c.get('/api/dashboard/admin');
    expect((await emp.c.get('/api/rgpd/audit')).status).toBe(403);
    expect((await (await client()).get('/api/rgpd/audit')).status).toBe(401);

    const byAction = await adm.c.get('/api/rgpd/audit?action=vault');
    expect(byAction.body.items.length).toBeGreaterThan(0);
    expect(byAction.body.items.every((a: { action: string }) => a.action.startsWith('vault'))).toBe(true);
    expect((await adm.c.get('/api/rgpd/audit?action=.*')).body.items).toHaveLength(0); // « .* » est cherché littéralement
    expect((await adm.c.get('/api/rgpd/audit?limit=500')).status).toBe(400);
    expect((await adm.c.get('/api/rgpd/audit?limit=1')).body.items).toHaveLength(1);
    const raw = JSON.stringify(byAction.body);
    expect(raw).not.toMatch(/127\.0\.0\.1|::1/); // l'adresse IP n'est conservée que pseudonymisée
  });

  it('l’export est privé (no-store), tracé, et ne contient ni mot de passe ni fichiers d’autrui', async () => {
    const emp = await session('employe');
    const other = await session('employe');
    await Notification.create({ userId: other.user._id, type: 'Info', message: 'Pour un autre uniquement' });
    const res = await emp.c.get('/api/rgpd/export');
    expect(res.headers['cache-control']).toMatch(/no-store/);
    expect(res.text).not.toContain('Pour un autre uniquement');
    expect(await AuditLog.countDocuments({ action: 'rgpd.export' })).toBe(1);
    expect((await (await client()).get('/api/rgpd/export')).status).toBe(401);
  });
});

describe('calendrier', () => {
  it('« mon calendrier » ne montre que mes congés acceptés, pas les demandes en attente ni ceux des autres', async () => {
    const emp = await session('employe');
    const other = await session('employe');
    await acceptedLeave(emp.user._id, '2026-11-03', '2026-11-05', 'travel');
    await acceptedLeave(other.user._id, '2026-11-03', '2026-11-05', 'secret');
    await LeaveRequest.create({ userId: emp.user._id, raison: 'annual', dateDebut: '2026-11-10', dateFin: '2026-11-10', nombreJours: 1 }); // en attente
    const res = await emp.c.get('/api/calendar/me?from=2026-11-01&to=2026-11-30');
    expect(res.status).toBe(200);
    expect(res.body.events).toEqual([{ kind: 'leave', title: 'travel', start: '2026-11-03', end: '2026-11-05' }]);
    expect(JSON.stringify(res.body)).not.toContain('secret');
    expect((await emp.c.get('/api/calendar/me?from=2026-12-01&to=2026-12-31')).body.events).toHaveLength(0);
  });

  it('le calendrier d’équipe : manager = son équipe, admin = tous, employé = refusé', async () => {
    const mgr = await session('manager');
    const adm = await session('admin');
    const emp = await session('employe');
    const outsider = await makeUser('employe');
    await supervise(mgr.user, emp.user);
    await acceptedLeave(emp.user._id, '2026-11-03', '2026-11-03');
    await acceptedLeave(outsider._id, '2026-11-04', '2026-11-04');
    const q = '?from=2026-11-01&to=2026-11-30';
    expect((await mgr.c.get(`/api/calendar/leaves${q}`)).body.items.map((i: { userId: string }) => i.userId)).toEqual([id(emp.user)]);
    expect((await adm.c.get(`/api/calendar/leaves${q}`)).body.items).toHaveLength(2);
    expect((await emp.c.get(`/api/calendar/leaves${q}`)).status).toBe(403);
    expect((await adm.c.get('/api/calendar/me?from=2026-11-01&to=2026-11-30')).status).toBe(403); // l'admin n'a pas d'espace personnel
  });

  it('refuse des bornes invalides', async () => {
    const emp = await session('employe');
    expect((await emp.c.get('/api/calendar/me?from=demain&to=2026-11-30')).status).toBe(400);
    expect((await emp.c.get('/api/calendar/me')).status).toBe(400);
  });
});

describe('notifications', () => {
  it('chacun ne voit, ne compte et ne marque comme lues que ses propres notifications', async () => {
    const a = await session('employe');
    const b = await session('employe');
    await Notification.create([
      { userId: a.user._id, type: 'Info', message: 'pour A 1' },
      { userId: a.user._id, type: 'Info', message: 'pour A 2' },
      { userId: b.user._id, type: 'Info', message: 'pour B' },
    ]);
    expect((await a.c.get('/api/notifications/unread-count')).body.unread).toBe(2);
    const list = await a.c.get('/api/notifications');
    expect(list.body.items).toHaveLength(2);
    expect(JSON.stringify(list.body)).not.toContain('pour B');
    expect((await a.c.post('/api/notifications/read-all').send({})).status).toBe(200);
    expect((await a.c.get('/api/notifications/unread-count')).body.unread).toBe(0);
    expect((await b.c.get('/api/notifications/unread-count')).body.unread).toBe(1); // B n'est pas touché
    expect((await (await client()).get('/api/notifications')).status).toBe(401);
  });
});

describe('organisation', () => {
  it('seul l’admin gère la hiérarchie', async () => {
    const mgr = await session('manager');
    const emp = await session('employe');
    for (const c of [mgr.c, emp.c]) {
      expect((await c.get('/api/org/supervisions')).status).toBe(403);
      expect((await c.post('/api/org/supervisions').send({ managerId: id(mgr.user), superviseId: id(emp.user) })).status).toBe(403);
      expect((await c.put('/api/org/director').send({ managerId: id(mgr.user) })).status).toBe(403);
      expect((await c.get('/api/org/tree')).status).toBe(403);
    }
  });

  it('refuse les assignations invalides : auto-supervision, non-manager, admin, double manager, boucle', async () => {
    const adm = await session('admin');
    const m1 = await makeUser('manager');
    const m2 = await makeUser('manager');
    const e1 = await makeUser('employe');
    const assign = (managerId: string, superviseId: string) => adm.c.post('/api/org/supervisions').send({ managerId, superviseId });

    expect((await assign(id(m1), id(m1))).status).toBe(400);
    expect((await assign(id(e1), id(m1))).status).toBe(400); // « manager » qui n'en est pas un
    expect((await assign(id(m1), id(adm.user))).status).toBe(400); // on ne supervise pas un admin
    expect((await assign(id(m1), id(e1))).status).toBe(201);
    expect((await assign(id(m2), id(e1))).status).toBe(409); // une seule hiérarchie par personne
    expect((await assign(id(m1), id(m2))).status).toBe(201);
    const loop = await assign(id(m2), id(m1)); // m1 → m2 existe déjà : l'inverse ferait une boucle
    expect(loop.status).toBe(400);
    expect(loop.body.error.code).toBe('CYCLE');
    expect((await adm.c.post('/api/org/supervisions').send({ managerId: 'x', superviseId: id(e1) })).status).toBe(400);
  });

  it('la personne supervisée est notifiée, et la suppression d’un lien est tracée', async () => {
    const adm = await session('admin');
    const m = await makeUser('manager');
    const e = await makeUser('employe');
    await adm.c.post('/api/org/supervisions').send({ managerId: id(m), superviseId: id(e) });
    expect(await Notification.countDocuments({ userId: e._id, key: 'org.new_manager' })).toBe(1);
    expect((await adm.c.delete(`/api/org/supervisions/${id(m)}/${id(e)}`)).status).toBe(200);
    expect((await adm.c.delete(`/api/org/supervisions/${id(m)}/${id(e)}`)).status).toBe(404);
    expect(await AuditLog.countDocuments({ action: { $in: ['org.assign', 'org.unassign'] } })).toBe(2);
  });

  it('un seul directeur, et c’est un manager actif ; l’organigramme part de lui', async () => {
    const adm = await session('admin');
    const d1 = await makeUser('manager', { prenom: 'Claire' });
    const d2 = await makeUser('manager', { prenom: 'Karim' });
    const e = await makeUser('employe');
    const loner = await makeUser('employe', { prenom: 'Seule' });
    expect((await adm.c.put('/api/org/director').send({ managerId: id(e) })).status).toBe(400);
    expect((await adm.c.put('/api/org/director').send({ managerId: id(d1) })).status).toBe(200);
    expect((await adm.c.put('/api/org/director').send({ managerId: id(d2) })).status).toBe(200);
    expect(await User.countDocuments({ isDirector: true })).toBe(1);
    expect((await User.findById(d2._id))!.isDirector).toBe(true);

    await adm.c.post('/api/org/supervisions').send({ managerId: id(d2), superviseId: id(e) });
    const tree = (await adm.c.get('/api/org/tree')).body;
    expect(tree.tree.name).toMatch(/Karim/);
    expect(tree.tree.children.map((c: { id: string }) => c.id)).toEqual([id(e)]);
    expect(tree.unassigned.map((u: { id: string }) => u.id)).toContain(id(loner));
  });

  it('un manager ne voit et ne règle que son équipe', async () => {
    const mgr = await session('manager');
    const mine = await makeUser('employe', { teleworkMax: 2 });
    const stranger = await makeUser('employe', { teleworkMax: 2 });
    await supervise(mgr.user, mine);
    expect((await mgr.c.get('/api/org/team')).body.team.map((t: { id: string }) => t.id)).toEqual([id(mine)]);
    expect((await mgr.c.patch(`/api/org/team/${id(mine)}/telework-max`).send({ teleworkMax: 4 })).status).toBe(200);
    expect((await User.findById(mine._id))!.teleworkMax).toBe(4);
    expect((await mgr.c.patch(`/api/org/team/${id(stranger)}/telework-max`).send({ teleworkMax: 4 })).status).toBe(404);
    expect((await mgr.c.patch(`/api/org/team/${id(mine)}/telework-max`).send({ teleworkMax: 9 })).status).toBe(400);
    expect((await User.findById(stranger._id))!.teleworkMax).toBe(2);
  });
});

describe('formulaire de contact', () => {
  it('un robot (champ piège rempli) reçoit un succès apparent mais rien n’est enregistré', async () => {
    const anon = await client();
    const res = await anon.post('/api/contact').send({ email: 'bot@test.local', sujet: 'Promo', message: 'Achetez maintenant', website: 'http://spam.example' });
    expect(res.status).toBe(201);
    expect(await ContactRequest.countDocuments()).toBe(0);
  });

  it('un visiteur doit donner son e-mail ; un employé connecté est identifié par son compte, pas par le formulaire', async () => {
    const anon = await client();
    expect((await anon.post('/api/contact').send({ sujet: 'Question', message: 'Bonjour, une question' })).body.error.code).toBe('EMAIL_REQUIRED');
    expect((await anon.post('/api/contact').send({ email: 'visiteur@test.local', sujet: 'Question', message: 'abc' })).status).toBe(400);
    expect((await anon.post('/api/contact').send({ email: 'visiteur@test.local', sujet: 'Question', message: 'Bonjour, une question' })).status).toBe(201);

    const emp = await session('employe');
    const sent = await emp.c.post('/api/contact').send({ email: 'usurpe@test.local', nom: 'Faux', sujet: 'Attestation', message: 'Pouvez-vous m’envoyer une attestation ?' });
    expect(sent.status).toBe(201);
    const stored = await ContactRequest.findById(sent.body.id);
    expect(stored!.email).toBe(emp.user.email);
    expect(stored!.nom).toBe(emp.user.nom);
    expect(String(stored!.userId)).toBe(id(emp.user));
  });

  it('seul l’admin lit et supprime les demandes, et il est prévenu des nouvelles', async () => {
    const adm = await session('admin');
    const emp = await session('employe');
    const sent = await emp.c.post('/api/contact').send({ sujet: 'Sujet', message: 'Un message assez long' });
    expect(await Notification.countDocuments({ userId: adm.user._id, key: 'contact.new' })).toBe(1);
    expect((await emp.c.get('/api/contact')).status).toBe(403);
    expect((await emp.c.delete(`/api/contact/${sent.body.id}`)).status).toBe(403);
    expect((await adm.c.get('/api/contact')).body.items).toHaveLength(1);
    expect((await adm.c.delete(`/api/contact/${sent.body.id}`)).status).toBe(200);
    expect((await adm.c.delete(`/api/contact/${sent.body.id}`)).status).toBe(404);
  });
});

describe('tableau de bord administrateur', () => {
  it('réservé à l’admin, compte les demandes à traiter et ne livre aucun salaire individuel', async () => {
    const adm = await session('admin');
    const mgr = await session('manager');
    const e1 = await makeUser('employe', { salaire: 3000, departement: 'Technique' });
    const e2 = await makeUser('employe', { salaire: 5000, departement: 'Technique' });
    await LeaveRequest.create({ userId: e1._id, raison: 'annual', dateDebut: addDays(today(), 10), dateFin: addDays(today(), 10), nombreJours: 1, statutManager: 'accepte' });
    await LeaveRequest.create({ userId: e2._id, raison: 'annual', dateDebut: addDays(today(), 12), dateFin: addDays(today(), 12), nombreJours: 1 }); // pas encore validé par le manager
    await SickLeave.create({ userId: e1._id, typeMaladie: 'justifie', dateDebut: addDays(today(), 3), dateFin: addDays(today(), 3) }); // en attente
    await SickLeave.create({ userId: e2._id, typeMaladie: 'justifie', dateDebut: today(), dateFin: today(), statut: 'accepte' }); // absent aujourd'hui

    expect((await mgr.c.get('/api/dashboard/admin')).status).toBe(403);
    expect((await (await client()).get('/api/dashboard/admin')).status).toBe(401);
    const res = await adm.c.get('/api/dashboard/admin');
    expect(res.status).toBe(200);
    expect(res.body.pending).toEqual({ leaves: 1, sick: 1, bonuses: 0 }); // seules les demandes déjà validées par le manager attendent l'admin
    expect(res.body.averageSalary).toBe(4000);
    expect(res.body.today.absent).toBe(1); // l'arrêt maladie accepté du jour
    expect(res.body.byDepartment[0]).toMatchObject({ name: 'Technique' });
    expect(res.text).not.toMatch(/"salaire"|3000|5000/);
    expect(await AuditLog.countDocuments({ action: 'dashboard.admin' })).toBe(1); // lecture d'agrégats de salaires tracée
  });
});

describe('feedback anonyme : seuil de ré-identification', () => {
  const ratings = Object.fromEntries(['env', 'management', 'worklife', 'comm', 'recognition', 'training', 'equipment', 'team', 'meetings', 'transparency'].map((k) => [k, 4]));

  it('masque les suggestions sous 3 réponses, les montre à partir de 3, et refuse un avis incomplet', async () => {
    const adm = await session('admin');
    const people = [await session('employe'), await session('employe'), await session('employe')];
    expect((await people[0]!.c.post('/api/feedback').send({ ratings: { env: 5 } })).status).toBe(400);
    expect((await people[0]!.c.post('/api/feedback').send({ ratings: { ...ratings, env: 9 } })).status).toBe(400);

    await people[0]!.c.post('/api/feedback').send({ ratings, suggestion: 'Plus de formations' });
    await people[1]!.c.post('/api/feedback').send({ ratings, suggestion: 'Moins de réunions' });
    let res = await adm.c.get('/api/feedback/results');
    expect(res.body).toMatchObject({ total: 2, suggestions: [], suggestionsHidden: true });
    expect(res.text).not.toContain('Moins de réunions');

    await people[2]!.c.post('/api/feedback').send({ ratings, suggestion: '' });
    res = await adm.c.get('/api/feedback/results');
    expect(res.body.total).toBe(3);
    expect(res.body.suggestionsHidden).toBe(false);
    expect(res.body.suggestions.sort()).toEqual(['Moins de réunions', 'Plus de formations']); // les vides sont écartées
    expect(res.body.averages.env).toBe(4);
  });

  it('les résultats sont réservés à l’admin et le mois doit être valide', async () => {
    const adm = await session('admin');
    const emp = await session('employe');
    expect((await emp.c.get('/api/feedback/results')).status).toBe(403);
    expect((await adm.c.get('/api/feedback/results?month=hier')).status).toBe(400);
    expect((await adm.c.get('/api/feedback/results?month=2020-01')).body).toMatchObject({ total: 0, suggestionsHidden: false });
    expect((await adm.c.get('/api/feedback/status')).status).toBe(403); // l'admin ne répond pas au feedback
  });
});
