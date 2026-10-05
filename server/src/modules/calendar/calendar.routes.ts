import { Router } from 'express';
import { schemas } from '../../shared.js';
import { LeaveRequest } from '../../models/LeaveRequest.js';
import { Meeting } from '../../models/Meeting.js';
import { SickLeave } from '../../models/SickLeave.js';
import { Telework } from '../../models/Telework.js';
import { authOf, requireAuth, requireRole } from '../../middleware/auth.js';
import { parse } from '../../utils/errors.js';
import { managedIds } from '../access.js';

export const calendarRouter = Router();
calendarRouter.use(requireAuth());

const rangeQuery = schemas.dateRangeQuery;

/** Événements personnels : congés et arrêts acceptés, télétravail, réunions acceptées ou organisées. */
calendarRouter.get('/me', requireRole('employe', 'manager'), async (req, res) => {
  const { userId } = authOf(req);
  const { from, to } = parse(rangeQuery, req.query);
  const overlap = { dateDebut: { $lte: to }, dateFin: { $gte: from } };
  const [leaves, sicks, tele, meetings] = await Promise.all([
    LeaveRequest.find({ userId, statut: 'accepte', ...overlap }),
    SickLeave.find({ userId, statut: 'accepte', ...overlap }),
    Telework.find({ userId, date: { $gte: from, $lte: to } }),
    Meeting.find({
      dateTime: { $gte: new Date(`${from}T00:00:00Z`), $lte: new Date(`${to}T23:59:59Z`) },
      $or: [{ createdBy: userId }, { invitees: { $elemMatch: { userId, status: 'Accepted' } } }],
    }),
  ]);
  res.json({
    events: [
      ...leaves.map((l) => ({ kind: 'leave', title: l.raison, start: l.dateDebut, end: l.dateFin })),
      ...sicks.map((s) => ({ kind: 'sick', title: 'sick', start: s.dateDebut, end: s.dateFin })),
      ...tele.map((t) => ({ kind: 'telework', title: 'telework', start: t.date, end: t.date })),
      ...meetings.map((m) => ({
        kind: 'meeting',
        title: m.title,
        start: m.dateTime.toISOString().slice(0, 10),
        end: m.dateTime.toISOString().slice(0, 10),
        time: m.dateTime.toISOString(),
      })),
    ],
  });
});

/** Congés acceptés de l'équipe (manager) ou de tous (admin). */
calendarRouter.get('/leaves', requireRole('admin', 'manager'), async (req, res) => {
  const auth = authOf(req);
  const { from, to } = parse(rangeQuery, req.query);
  const filter: Record<string, unknown> = { statut: 'accepte', dateDebut: { $lte: to }, dateFin: { $gte: from } };
  if (auth.role === 'manager') filter.userId = { $in: await managedIds(auth.userId) };
  const rows = await LeaveRequest.find(filter).populate('userId', 'nom prenom email');
  res.json({
    items: rows
      .filter((r) => r.userId)
      .map((r) => {
        const u = r.userId as unknown as { _id: unknown; nom: string; prenom: string; email: string };
        return { userId: String(u._id), nom: u.nom, prenom: u.prenom, email: u.email, start: r.dateDebut, end: r.dateFin, raison: r.raison };
      }),
  });
});
