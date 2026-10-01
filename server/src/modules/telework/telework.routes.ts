import { Router } from 'express';
import { z } from 'zod';
import { Telework } from '../../models/Telework.js';
import { User } from '../../models/User.js';
import { clientConfig } from '../../config/client.js';
import { authOf, requireAuth, requireRole } from '../../middleware/auth.js';
import { audit } from '../../utils/audit.js';
import { addDays, isoDate, nextMonday, toUtc } from '../../utils/dates.js';
import { badRequest, conflict, notFound, parse } from '../../utils/errors.js';
import { managedIds } from '../access.js';
import { CONFLICT_MESSAGES, findConflict } from '../absences/absences.service.js';

export const teleworkRouter = Router();
teleworkRouter.use(requireAuth());

/** Jours ouvrés de la semaine prochaine (lundi → vendredi par défaut, selon la config du client). */
function nextWeekDays(): string[] {
  const monday = nextMonday();
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i)).filter((d) => clientConfig.hr.workingDays.includes(toUtc(d).getUTCDay()));
}

teleworkRouter.get('/next-week', requireRole('employe', 'manager'), async (req, res) => {
  const auth = authOf(req);
  const user = await User.findById(auth.userId);
  if (!user) throw notFound();
  const days = nextWeekDays();
  const chosen = await Telework.find({ userId: auth.userId, date: { $in: days } }).sort({ date: 1 });
  res.json({ days, chosen: chosen.map((c) => c.date), max: user.teleworkMax, isDirector: user.isDirector });
});

/** Remplace les jours de télétravail de la semaine prochaine. */
teleworkRouter.put('/next-week', requireRole('employe', 'manager'), async (req, res) => {
  const auth = authOf(req);
  const body = parse(z.object({ dates: z.array(isoDate).max(7) }), req.body);
  const user = await User.findById(auth.userId);
  if (!user) throw notFound();
  const allowed = new Set(nextWeekDays());
  const dates = [...new Set(body.dates)].sort();
  if (dates.some((d) => !allowed.has(d))) throw badRequest('Seuls les jours ouvrés de la semaine prochaine sont autorisés', 'OUT_OF_WEEK');
  // Le directeur choisit librement ; les autres doivent respecter exactement leur quota.
  if (!user.isDirector && dates.length !== user.teleworkMax) {
    throw badRequest(`Vous devez choisir exactement ${user.teleworkMax} jour(s) de télétravail`, 'WRONG_COUNT');
  }
  for (const d of dates) {
    const clash = await findConflict(auth.userId, d, d, 'teletravail');
    if (clash) throw conflict(`${d} : ${CONFLICT_MESSAGES[clash]}`, clash);
  }
  await Telework.deleteMany({ userId: auth.userId, date: { $in: [...allowed] } });
  if (dates.length) await Telework.insertMany(dates.map((date) => ({ userId: auth.userId, date })));
  await audit(req, { action: 'telework.set', targetType: 'user', targetId: auth.userId });
  res.json({ chosen: dates });
});

/** Calendrier du télétravail : admin = tout le monde, manager = son équipe. */
teleworkRouter.get('/calendar', requireRole('admin', 'manager'), async (req, res) => {
  const auth = authOf(req);
  const q = parse(z.object({ from: isoDate, to: isoDate }), req.query);
  const filter: Record<string, unknown> = { date: { $gte: q.from, $lte: q.to } };
  if (auth.role === 'manager') filter.userId = { $in: await managedIds(auth.userId) };
  const rows = await Telework.find(filter).populate('userId', 'nom prenom email').sort({ date: 1 });
  res.json({
    items: rows
      .filter((r) => r.userId)
      .map((r) => {
        const u = r.userId as unknown as { _id: unknown; nom: string; prenom: string; email: string };
        return { date: r.date, userId: String(u._id), nom: u.nom, prenom: u.prenom, email: u.email };
      }),
  });
});
