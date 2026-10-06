import { Router } from 'express';
import { z } from 'zod';
import { MailJob } from '../../models/MailJob.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { audit } from '../../utils/audit.js';
import { conflict, notFound, parse } from '../../utils/errors.js';
import { processMailQueue } from '../../utils/mailer.js';

export const mailRouter = Router();
mailRouter.use(requireAuth(), requireRole('admin'));

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Identifiant invalide');

/** Filtre de la page « E-mails » : les envois en échec (par défaut), ceux en attente d'un nouvel essai, ou tous. */
export const mailListQuery = z.object({ status: z.enum(['failed', 'pending', 'all']).default('failed') });

const view = (j: { toJSON(): unknown }) => j.toJSON();

/** Envois d'e-mails en échec ou en attente de reprise. Le corps des messages (liens d'activation) n'est jamais renvoyé. */
mailRouter.get('/', async (req, res) => {
  const { status } = parse(mailListQuery, req.query);
  const statuses: ('failed' | 'pending')[] = status === 'all' ? ['failed', 'pending'] : [status];
  const [items, failed, pending] = await Promise.all([
    MailJob.find({ status: { $in: statuses } })
      .sort({ createdAt: -1 })
      .limit(200),
    MailJob.countDocuments({ status: 'failed' }),
    MailJob.countDocuments({ status: 'pending' }),
  ]);
  res.json({ items: items.map(view), counts: { failed, pending } });
});

/** Remet un envoi en échec dans la file : nouvel essai immédiat, puis reprises espacées comme pour un nouveau message. */
mailRouter.post('/:id/retry', async (req, res) => {
  const { id } = parse(z.object({ id: objectId }), req.params);
  const job = await MailJob.findOneAndUpdate(
    { _id: id, status: 'failed' },
    { $set: { status: 'pending', attempts: 0, nextAttemptAt: new Date() }, $unset: { lastError: 1 } },
    { new: true },
  );
  if (!job) throw (await MailJob.exists({ _id: id })) ? conflict('Seul un envoi en échec peut être relancé', 'NOT_FAILED') : notFound('Envoi introuvable');
  await audit(req, { action: 'mail.retry', targetType: 'mail', targetId: id });
  void processMailQueue();
  res.json({ job: view(job) });
});

/** Abandonne un envoi en échec (le message est supprimé). */
mailRouter.delete('/:id', async (req, res) => {
  const { id } = parse(z.object({ id: objectId }), req.params);
  const r = await MailJob.deleteOne({ _id: id, status: 'failed' });
  if (!r.deletedCount) throw (await MailJob.exists({ _id: id })) ? conflict('Seul un envoi en échec peut être supprimé', 'NOT_FAILED') : notFound('Envoi introuvable');
  await audit(req, { action: 'mail.delete', targetType: 'mail', targetId: id });
  res.json({ ok: true });
});
