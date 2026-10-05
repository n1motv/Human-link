import { Router } from 'express';
import { z } from 'zod';
import { Meeting } from '../../models/Meeting.js';
import { Supervision } from '../../models/Supervision.js';
import { User } from '../../models/User.js';
import { authOf, requireAuth, requireRole } from '../../middleware/auth.js';
import { audit } from '../../utils/audit.js';
import { badRequest, notFound, parse } from '../../utils/errors.js';
import { notify } from '../../utils/notify.js';
import { displayName } from '../access.js';

export const meetingsRouter = Router();
meetingsRouter.use(requireAuth());

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Identifiant invalide');

/** Personnes invitables par un manager : son équipe + les autres managers. */
meetingsRouter.get('/invitable', requireRole('manager'), async (req, res) => {
  const auth = authOf(req);
  const team = (await Supervision.find({ managerId: auth.userId }, { superviseId: 1 })).map((s) => s.superviseId);
  const people = await User.find({ status: 'active', $or: [{ _id: { $in: team } }, { role: 'manager', _id: { $ne: auth.userId } }] }, 'nom prenom role poste').sort({ nom: 1 });
  res.json({ items: people.map((p) => p.toJSON()) });
});

meetingsRouter.post('/', requireRole('manager'), async (req, res) => {
  const auth = authOf(req);
  const body = parse(
    z.object({
      title: z.string().trim().min(1).max(160),
      dateTime: z.coerce.date(),
      invitees: z.array(objectId).min(1).max(200),
    }),
    req.body,
  );
  if (body.dateTime.getTime() < Date.now() - 60_000) throw badRequest('La réunion doit avoir lieu dans le futur', 'PAST_DATE');
  // Invitables : son équipe + les autres managers (jamais un employé d'une autre équipe, ni l'admin).
  const team = new Set((await Supervision.find({ managerId: auth.userId })).map((s) => String(s.superviseId)));
  const candidates = await User.find({ _id: { $in: body.invitees }, status: 'active', role: { $ne: 'admin' } }, 'role');
  const invitees = candidates.filter((u) => String(u._id) !== auth.userId && (team.has(String(u._id)) || u.role === 'manager')).map((u) => String(u._id));
  if (!invitees.length) throw badRequest('Aucun invité valide');

  const manager = await User.findById(auth.userId);
  const meeting = await Meeting.create({
    title: body.title,
    dateTime: body.dateTime,
    createdBy: auth.userId,
    invitees: invitees.map((userId) => ({ userId })),
  });
  await notify(
    invitees,
    'Invitation',
    'meeting.invited',
    { manager: displayName(manager ?? {}), title: body.title, when: body.dateTime.toISOString() },
    { emailSubject: 'Invitation à une réunion' },
  );
  await audit(req, { action: 'meeting.create', targetType: 'meeting', targetId: String(meeting._id) });
  res.status(201).json({ meeting });
});

/** Réunions créées par le manager, avec le décompte des réponses. */
meetingsRouter.get('/organized', requireRole('manager'), async (req, res) => {
  const meetings = await Meeting.find({ createdBy: authOf(req).userId })
    .sort({ dateTime: -1 })
    .limit(200);
  res.json({
    items: meetings.map((m) => ({
      id: String(m._id),
      title: m.title,
      dateTime: m.dateTime,
      status: m.status,
      invited: m.invitees.length,
      accepted: m.invitees.filter((i) => i.status === 'Accepted').length,
      rejected: m.invitees.filter((i) => i.status === 'Rejected').length,
    })),
  });
});

meetingsRouter.delete('/:id', requireRole('manager'), async (req, res) => {
  const { id } = parse(z.object({ id: objectId }), req.params);
  const r = await Meeting.deleteOne({ _id: id, createdBy: authOf(req).userId });
  if (!r.deletedCount) throw notFound('Réunion introuvable');
  res.json({ ok: true });
});

meetingsRouter.get('/invitations', async (req, res) => {
  const auth = authOf(req);
  const meetings = await Meeting.find({ 'invitees.userId': auth.userId }).sort({ dateTime: -1 }).limit(200).populate('createdBy', 'nom prenom');
  res.json({
    items: meetings.map((m) => ({
      id: String(m._id),
      title: m.title,
      dateTime: m.dateTime,
      organizer: (m.createdBy as unknown as { toJSON?: () => unknown })?.toJSON?.() ?? null,
      status: m.invitees.find((i) => String(i.userId) === auth.userId)?.status ?? 'en attente',
    })),
  });
});

meetingsRouter.post('/:id/respond', async (req, res) => {
  const auth = authOf(req);
  const { id } = parse(z.object({ id: objectId }), req.params);
  const { response } = parse(z.object({ response: z.enum(['Accepted', 'Rejected']) }), req.body);
  // Le filtre sur invitees.userId garantit qu'on ne répond que pour soi.
  const meeting = await Meeting.findOneAndUpdate({ _id: id, 'invitees.userId': auth.userId }, { $set: { 'invitees.$.status': response } }, { new: true });
  if (!meeting) throw notFound('Invitation introuvable');
  const me = await User.findById(auth.userId);
  await notify(meeting.createdBy, 'Invitation', 'meeting.responded', {
    name: displayName(me ?? {}),
    title: meeting.title,
    response: response === 'Accepted' ? 'accepté' : 'refusé',
  });
  res.json({ ok: true });
});
