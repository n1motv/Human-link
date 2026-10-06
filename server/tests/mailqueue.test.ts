import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MailJob } from '../src/models/MailJob.js';
import { MAX_ATTEMPTS, RETRY_DELAYS_MS, enqueueMail, processMailQueue, type Sender } from '../src/utils/mailer.js';
import { schemas } from '../src/shared.js';
import { client, connect, resetDb, session, with2fa } from './helpers.js';

beforeAll(connect);
afterAll(() => mongoose.disconnect());
beforeEach(async () => {
  await resetDb();
  with2fa([]);
});

const ok: Sender = async () => undefined;
const down =
  (msg = 'connect ECONNREFUSED 10.0.0.5:587'): Sender =>
  async () => {
    throw new Error(msg);
  };
const at = (ms: number) => () => new Date(ms);

describe('file d’attente des e-mails avec reprises (T-10)', () => {
  it('envoie un message, puis efface son corps (il contenait peut-être un lien d’activation)', async () => {
    await enqueueMail('sofia@acme.test', 'Activation', 'Votre lien : https://rh/activate?token=SECRET');
    const send = vi.fn(ok);
    expect(await processMailQueue(send)).toEqual({ sent: 1, failed: 0, retried: 0 });
    expect(send).toHaveBeenCalledWith({ to: 'sofia@acme.test', subject: 'Activation', text: 'Votre lien : https://rh/activate?token=SECRET' });
    const job = (await MailJob.findOne())!;
    expect(job.status).toBe('sent');
    expect(job.text).toBeUndefined();
    expect(job.sentAt).toBeInstanceOf(Date);
  });

  it('en cas de panne SMTP, reprend le message avec des délais croissants, sans le perdre', async () => {
    await enqueueMail('sofia@acme.test', 'Activation', 'corps');
    let now = Date.now();
    for (let attempt = 1; attempt < MAX_ATTEMPTS; attempt++) {
      expect(await processMailQueue(down(), at(now))).toEqual({ sent: 0, failed: 0, retried: 1 });
      const job = (await MailJob.findOne())!;
      expect(job.status).toBe('pending');
      expect(job.attempts).toBe(attempt);
      expect(job.nextAttemptAt.getTime()).toBe(now + RETRY_DELAYS_MS[attempt - 1]!);
      expect(await processMailQueue(down(), at(now + RETRY_DELAYS_MS[attempt - 1]! - 1))).toEqual({ sent: 0, failed: 0, retried: 0 }); // pas avant l'heure
      now += RETRY_DELAYS_MS[attempt - 1]!;
    }
    // La panne se termine : l'envoi aboutit au dernier essai, rien n'a été perdu.
    expect(await processMailQueue(ok, at(now))).toEqual({ sent: 1, failed: 0, retried: 0 });
    expect((await MailJob.findOne())?.status).toBe('sent');
  });

  it('abandonne après le dernier essai : le message passe en échec et garde la raison, sans donnée personnelle', async () => {
    await enqueueMail('sofia@acme.test', 'Activation', 'corps');
    let now = Date.now();
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      await processMailQueue(down('550 mailbox sofia.lopez@acme.test refused'), at(now));
      now += 7 * 3600_000;
    }
    const job = (await MailJob.findOne())!;
    expect(job.status).toBe('failed');
    expect(job.attempts).toBe(MAX_ATTEMPTS);
    expect(job.lastError).toContain('refused');
    expect(job.lastError).not.toContain('sofia.lopez@acme.test'); // e-mail retiré de la raison
    expect(await processMailQueue(ok, at(now))).toEqual({ sent: 0, failed: 0, retried: 0 }); // plus repris tout seul
  });

  it('deux passages simultanés n’envoient jamais deux fois le même message', async () => {
    await enqueueMail('a@acme.test', 'Un', 'x');
    const send = vi.fn<Sender>(async () => new Promise((r) => setTimeout(r, 50)));
    const [r1, r2] = await Promise.all([processMailQueue(send), processMailQueue(send)]);
    expect(send).toHaveBeenCalledTimes(1);
    expect(r1.sent + r2.sent).toBe(1);
  });

  it('un message « pris » par un envoi interrompu est repris après le délai de bail', async () => {
    await enqueueMail('a@acme.test', 'Un', 'x');
    const first = vi.fn<Sender>(() => new Promise(() => undefined)); // l'envoi ne se termine jamais (processus tué)
    void processMailQueue(first);
    await vi.waitFor(() => expect(first).toHaveBeenCalled());
    expect(await processMailQueue(ok)).toEqual({ sent: 0, failed: 0, retried: 0 }); // encore sous bail
    expect(await processMailQueue(ok, at(Date.now() + 6 * 60_000))).toMatchObject({ sent: 1 });
  });
});

describe('page d’administration des envois en échec', () => {
  const failedJob = (over: Record<string, unknown> = {}) =>
    MailJob.create({ to: 'x@acme.test', subject: 'Activation', text: 'LIEN-SECRET', status: 'failed', attempts: MAX_ATTEMPTS, lastError: 'ECONNREFUSED', ...over });

  it('réservée à l’administrateur', async () => {
    const emp = await session('employe');
    expect((await emp.c.get('/api/mail-jobs')).status).toBe(403);
    expect((await (await client()).get('/api/mail-jobs')).status).toBe(401);
  });

  it('liste les envois en échec sans jamais renvoyer le corps du message', async () => {
    const adm = await session('admin');
    await failedJob();
    await MailJob.create({ to: 'y@acme.test', subject: 'En attente', text: 'x', status: 'pending', attempts: 2 });
    await MailJob.create({ to: 'z@acme.test', subject: 'Envoyé', status: 'sent', sentAt: new Date() });
    const res = await adm.c.get('/api/mail-jobs');
    expect(schemas.mailQueue.safeParse(res.body).success).toBe(true);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.counts).toEqual({ failed: 1, pending: 1 });
    expect(JSON.stringify(res.body)).not.toContain('LIEN-SECRET');
    expect((await adm.c.get('/api/mail-jobs?status=all')).body.items).toHaveLength(2);
    expect((await adm.c.get('/api/mail-jobs?status=sent')).status).toBe(400);
  });

  it('relance un envoi en échec : il repart dans la file avec un compteur neuf', async () => {
    const adm = await session('admin');
    const job = await failedJob();
    const res = await adm.c.post(`/api/mail-jobs/${job.id}/retry`);
    expect(res.status).toBe(200);
    const after = (await MailJob.findById(job.id))!;
    expect(['pending', 'failed']).toContain(after.status); // le premier essai part aussitôt : SMTP absent en test, il peut déjà être repassé en attente
    expect(after.attempts).toBeLessThanOrEqual(1);
    expect((await adm.c.post(`/api/mail-jobs/${(await MailJob.create({ to: 'p@acme.test', subject: 's', status: 'sent' })).id}/retry`)).status).toBe(409); // seul un échec se relance
    expect((await adm.c.post('/api/mail-jobs/000000000000000000000000/retry')).status).toBe(404);
  });

  it('abandonne un envoi en échec (supprimé), pas un envoi en attente', async () => {
    const adm = await session('admin');
    const job = await failedJob();
    const pending = await MailJob.create({ to: 'p@acme.test', subject: 's', status: 'pending' });
    expect((await adm.c.delete(`/api/mail-jobs/${pending.id}`)).status).toBe(409);
    expect((await adm.c.delete(`/api/mail-jobs/${job.id}`)).status).toBe(200);
    expect(await MailJob.countDocuments({ _id: job._id })).toBe(0);
  });
});
