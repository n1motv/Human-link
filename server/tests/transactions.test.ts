import fs from 'node:fs';
import mongoose from 'mongoose';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LeaveRequest } from '../src/models/LeaveRequest.js';
import { Notification } from '../src/models/Notification.js';
import { StoredFile } from '../src/models/StoredFile.js';
import { Telework } from '../src/models/Telework.js';
import { User } from '../src/models/User.js';
import { addDays, today } from '../src/utils/dates.js';
import { supportsTransactions, resetTransactionSupport, withTransaction } from '../src/utils/transaction.js';
import { writeEncrypted } from '../src/utils/storage.js';
import { connect, resetDb, session, supervise, with2fa } from './helpers.js';

beforeAll(connect);
afterAll(() => mongoose.disconnect());
beforeEach(async () => {
  await resetDb();
  with2fa([]);
  fs.rmSync(process.env.STORAGE_DIR!, { recursive: true, force: true });
});
afterEach(() => vi.restoreAllMocks());

/** Un congé déjà accepté par le manager, en attente de l'administrateur. */
async function leaveReadyForAdmin() {
  const adm = await session('admin');
  const mgr = await session('manager');
  const emp = await session('employe', { soldeConge: 10 });
  await supervise(mgr.user, emp.user);
  const from = addDays(today(), 10);
  const leave = await LeaveRequest.create({ userId: emp.user._id, raison: 'annual', dateDebut: from, dateFin: addDays(from, 2), nombreJours: 3, statutManager: 'accepte' });
  await Telework.create({ userId: emp.user._id, date: from });
  return { adm, emp, leave };
}

describe('transactions MongoDB (T-11)', () => {
  it('les tests tournent sur un jeu de réplicas : les transactions sont bien actives', async () => {
    resetTransactionSupport();
    expect(await supportsTransactions()).toBe(true);
  });

  it('une décision de congé validée met à jour la demande, le solde, le télétravail et les notifications ensemble', async () => {
    const { adm, emp, leave } = await leaveReadyForAdmin();
    const res = await adm.c.post(`/api/leaves/${leave.id}/decision`).send({ decision: 'accepte' });
    expect(res.status).toBe(200);
    expect((await LeaveRequest.findById(leave.id))?.statut).toBe('accepte');
    expect((await User.findById(emp.user._id))?.soldeConge).toBe(7);
    expect(await Telework.countDocuments({ userId: emp.user._id })).toBe(0);
    expect(await Notification.countDocuments({ userId: emp.user._id, key: 'leave.accepted' })).toBe(1);
  });

  it('si la notification échoue, la décision est annulée en entier : demande, solde et télétravail restent comme avant', async () => {
    const { adm, emp, leave } = await leaveReadyForAdmin();
    vi.spyOn(Notification, 'create').mockRejectedValue(new Error('panne simulée'));
    const res = await adm.c.post(`/api/leaves/${leave.id}/decision`).send({ decision: 'accepte' });
    expect(res.status).toBe(500);
    const after = await LeaveRequest.findById(leave.id);
    expect(after?.statut).toBe('en attente'); // pas de congé accepté sans solde débité
    expect(after?.statutAdmin).toBe('en attente');
    expect((await User.findById(emp.user._id))?.soldeConge).toBe(10); // pas de solde débité sans congé accepté
    expect(await Telework.countDocuments({ userId: emp.user._id })).toBe(1); // télétravail conservé
  });

  it('un solde insuffisant annule aussi la prise de la demande', async () => {
    const { adm, emp, leave } = await leaveReadyForAdmin();
    await User.updateOne({ _id: emp.user._id }, { soldeConge: 1 });
    const res = await adm.c.post(`/api/leaves/${leave.id}/decision`).send({ decision: 'accepte' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INSUFFICIENT_BALANCE');
    expect((await LeaveRequest.findById(leave.id))?.statut).toBe('en attente');
    expect((await User.findById(emp.user._id))?.soldeConge).toBe(1);
  });

  it('une panne en cours d’anonymisation ne laisse pas un compte à moitié effacé, ni de fichier supprimé du disque', async () => {
    const adm = await session('admin');
    const emp = await session('employe', { poste: 'Comptable' });
    const key = await writeEncrypted(Buffer.from('%PDF-1.4 bulletin'));
    await StoredFile.create({ ownerId: emp.user._id, category: 'bulletin', label: 'Bulletin', storageKey: key, mime: 'application/pdf', size: 17, uploadedBy: adm.user._id });
    await Notification.create({ userId: emp.user._id, type: 'x', key: 'telework.reminder', message: 'x' });
    await adm.c.delete(`/api/users/${emp.user._id}`); // archivage

    vi.spyOn(Telework, 'deleteMany').mockRejectedValue(new Error('panne simulée'));
    expect((await adm.c.post(`/api/users/${emp.user._id}/anonymize`)).status).toBe(500);
    vi.restoreAllMocks();

    const user = await User.findById(emp.user._id);
    expect(user?.status).toBe('archived'); // toujours archivé, pas anonymisé
    expect(user?.poste).toBe('Comptable'); // aucune donnée effacée
    expect(await StoredFile.countDocuments({ ownerId: emp.user._id })).toBe(1);
    expect(await Notification.countDocuments({ userId: emp.user._id })).toBe(1);
    const onDisk = (fs.readdirSync(process.env.STORAGE_DIR!, { recursive: true }) as string[]).filter((f) => f.endsWith('.bin'));
    expect(onDisk).toHaveLength(1);

    // Une fois la panne passée, l'anonymisation aboutit complètement.
    expect((await adm.c.post(`/api/users/${emp.user._id}/anonymize`)).status).toBe(200);
    expect((await User.findById(emp.user._id))?.status).toBe('anonymized');
    expect(await StoredFile.countDocuments({ ownerId: emp.user._id })).toBe(0);
  });

  it('sur une base sans jeu de réplicas, le code s’exécute sans transaction et sans session', async () => {
    resetTransactionSupport();
    vi.spyOn(mongoose.connection.db!, 'admin').mockReturnValue({ command: async () => ({ ok: 1, isWritablePrimary: true }) } as never);
    let received: unknown = 'jamais appelé';
    await withTransaction(async (s) => {
      received = s;
    });
    expect(received).toBeUndefined();
    vi.restoreAllMocks();
    resetTransactionSupport();
  });
});
