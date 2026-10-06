import fs from 'node:fs';
import mongoose from 'mongoose';
import { unzipSync, strFromU8 } from 'fflate';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clientConfig } from '../src/config/client.js';
import { AuditLog } from '../src/models/AuditLog.js';
import { LeaveRequest } from '../src/models/LeaveRequest.js';
import { StoredFile } from '../src/models/StoredFile.js';
import { writeEncrypted } from '../src/utils/storage.js';
import { addDays, today } from '../src/utils/dates.js';
import { schemas } from '../src/shared.js';
import { client, connect, resetDb, session, with2fa } from './helpers.js';

beforeAll(connect);
afterAll(() => mongoose.disconnect());
beforeEach(async () => {
  await resetDb();
  with2fa([]);
  fs.rmSync(process.env.STORAGE_DIR!, { recursive: true, force: true });
});

const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF');

describe('registre des traitements (S-16)', () => {
  it('réservé à l’administrateur', async () => {
    const emp = await session('employe');
    expect((await emp.c.get('/api/rgpd/register')).status).toBe(403);
    expect((await (await client()).get('/api/rgpd/register')).status).toBe(401);
  });

  it('décrit les traitements avec les durées de conservation réellement configurées', async () => {
    const adm = await session('admin');
    const res = await adm.c.get('/api/rgpd/register');
    expect(res.status).toBe(200);
    expect(schemas.complianceRegister.safeParse(res.body).success).toBe(true);
    const g = clientConfig.gdpr;
    expect(res.body.retention).toEqual({
      departedEmployeeYears: g.departedEmployeeRetentionYears,
      auditLogDays: g.auditLogRetentionDays,
      notificationDays: g.notificationRetentionDays,
      contactRequestDays: g.contactRequestRetentionDays,
      feedbackMonths: g.feedbackRetentionMonths,
    });
    const byId = Object.fromEntries(res.body.treatments.map((t: { id: string; retention: string }) => [t.id, t]));
    expect(byId.audit.retention).toContain(`${g.auditLogRetentionDays} jours`);
    expect(byId.contact.retention).toContain(`${g.contactRequestRetentionDays} jours`);
    expect(byId.feedback.retention).toContain(`${g.feedbackRetentionMonths} mois`);
    expect(byId.personnel.retention).toContain(`${g.departedEmployeeRetentionYears} an`);
    expect(res.body.treatments.length).toBeGreaterThanOrEqual(10);
    expect(byId.sante.sensitive).toBe(true);
    expect(res.body.controller.dpoEmail).toBe(clientConfig.company.dpoEmail);
  });

  it('chaque consultation du registre est tracée', async () => {
    const adm = await session('admin');
    await adm.c.get('/api/rgpd/register');
    expect(await AuditLog.countDocuments({ action: 'rgpd.register' })).toBe(1);
  });
});

describe('dossier complet d’un employé (S-16)', () => {
  async function fileFor(userId: mongoose.Types.ObjectId, uploadedBy: mongoose.Types.ObjectId, over: Record<string, unknown>) {
    const storageKey = await writeEncrypted(pdf);
    return StoredFile.create({ ownerId: userId, uploadedBy, mime: 'application/pdf', size: pdf.length, storageKey, ...over });
  }

  it('réservé à l’administrateur : ni l’employé lui-même (il a son export), ni un manager, ni un collègue', async () => {
    const emp = await session('employe');
    const other = await session('employe');
    const mgr = await session('manager');
    for (const who of [emp, other, mgr]) expect((await who.c.get(`/api/rgpd/dossier/${emp.user._id}`)).status).toBe(403);
  });

  it('livre une archive ZIP avec les données et les documents déchiffrés, et trace l’export', async () => {
    const adm = await session('admin');
    const emp = await session('employe', { salaire: 41000, telephone: '0612345678' });
    await LeaveRequest.create({ userId: emp.user._id, raison: 'annual', dateDebut: addDays(today(), 5), dateFin: addDays(today(), 6), nombreJours: 2 });
    await fileFor(emp.user._id, adm.user._id, { category: 'bulletin', label: 'Bulletin octobre 2026', month: 10, year: 2026 });
    await fileFor(emp.user._id, adm.user._id, { category: 'bulletin', label: 'Bulletin octobre 2026', month: 10, year: 2026 }); // même nom : pas d'écrasement
    await fileFor(emp.user._id, emp.user._id, { category: 'photo', label: 'Miniature 96', mime: 'image/webp' }); // exclue

    const res = await adm.c.raw
      .get(`/api/rgpd/dossier/${emp.user._id}`)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/zip');
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="dossier-.*\.zip"/);
    expect(res.headers['cache-control']).toBe('private, no-store');

    const files = unzipSync(new Uint8Array(res.body as Buffer));
    expect(Object.keys(files).sort()).toEqual([
      'LISEZ-MOI.txt',
      'documents/bulletin/Bulletin octobre 2026 (2).pdf',
      'documents/bulletin/Bulletin octobre 2026.pdf',
      'donnees.json',
    ]);
    const data = JSON.parse(strFromU8(files['donnees.json']!));
    expect(data.profile.email).toBe(emp.user.email);
    expect(data.profile.salaire).toBe(41000); // données sensibles déchiffrées pour le dossier
    expect(data.leaves).toHaveLength(1);
    expect(Buffer.from(files['documents/bulletin/Bulletin octobre 2026.pdf']!).toString()).toBe(pdf.toString()); // déchiffré, identique à l'original
    expect(strFromU8(files['LISEZ-MOI.txt']!)).toContain('2 fichier(s)');

    const entry = await AuditLog.findOne({ action: 'rgpd.dossier.export' });
    expect(entry?.targetId).toBe(String(emp.user._id));
    expect(entry?.actorEmail).toBe(adm.user.email);
  });

  it('refuse un compte anonymisé ou inconnu', async () => {
    const adm = await session('admin');
    const emp = await session('employe');
    await adm.c.delete(`/api/users/${emp.user._id}`);
    await adm.c.post(`/api/users/${emp.user._id}/anonymize`);
    expect((await adm.c.get(`/api/rgpd/dossier/${emp.user._id}`)).status).toBe(404);
    expect((await adm.c.get('/api/rgpd/dossier/000000000000000000000000')).status).toBe(404);
    expect((await adm.c.get('/api/rgpd/dossier/pas-un-id')).status).toBe(400);
  });
});
