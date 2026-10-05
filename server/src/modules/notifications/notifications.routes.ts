import { Router } from 'express';
import { z } from 'zod';
import { Notification } from '../../models/Notification.js';
import { authOf, requireAuth } from '../../middleware/auth.js';
import { notFound, parse } from '../../utils/errors.js';

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth());

notificationsRouter.get('/', async (req, res) => {
  const userId = authOf(req).userId;
  const [items, unread] = await Promise.all([Notification.find({ userId }).sort({ createdAt: -1 }).limit(100), Notification.countDocuments({ userId, isRead: false })]);
  res.json({ items, unread });
});

/** Compteur léger pour l'interrogation périodique de la cloche. */
notificationsRouter.get('/unread-count', async (req, res) => {
  res.json({ unread: await Notification.countDocuments({ userId: authOf(req).userId, isRead: false }) });
});

notificationsRouter.post('/read-all', async (req, res) => {
  await Notification.updateMany({ userId: authOf(req).userId, isRead: false }, { isRead: true });
  res.json({ ok: true });
});

// Correction de l'ancienne version : on ne peut supprimer que ses propres notifications.
notificationsRouter.delete('/:id', async (req, res) => {
  const { id } = parse(z.object({ id: z.string().regex(/^[a-f\d]{24}$/i) }), req.params);
  const r = await Notification.deleteOne({ _id: id, userId: authOf(req).userId });
  if (!r.deletedCount) throw notFound();
  res.json({ ok: true });
});
