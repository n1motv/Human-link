import { Router } from 'express';
import { z } from 'zod';
import { FEEDBACK_CRITERIA, Feedback } from '../../models/Feedback.js';
import { authOf, requireAuth, requireRole } from '../../middleware/auth.js';
import { pseudonymize } from '../../utils/crypto.js';
import { currentMonth } from '../../utils/dates.js';
import { conflict, parse } from '../../utils/errors.js';

export const feedbackRouter = Router();
feedbackRouter.use(requireAuth());

const participant = (userId: string, month: string) => pseudonymize(`${userId}:${month}`);

feedbackRouter.get('/status', requireRole('employe', 'manager'), async (req, res) => {
  const month = currentMonth();
  const done = await Feedback.exists({ month, participant: participant(authOf(req).userId, month) });
  res.json({ month, alreadySubmitted: !!done, criteria: FEEDBACK_CRITERIA });
});

const ratings = z.object(Object.fromEntries(FEEDBACK_CRITERIA.map((k) => [k, z.coerce.number().int().min(1).max(5)])));

/** Un feedback par personne et par mois, enregistré de façon anonyme. */
feedbackRouter.post('/', requireRole('employe', 'manager'), async (req, res) => {
  const body = parse(z.object({ ratings, suggestion: z.string().trim().max(2000).optional() }), req.body);
  const month = currentMonth();
  try {
    await Feedback.create({ month, participant: participant(authOf(req).userId, month), ratings: body.ratings, suggestion: body.suggestion ?? '' });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) throw conflict('Vous avez déjà donné votre avis ce mois-ci', 'ALREADY_SUBMITTED');
    throw err;
  }
  res.status(201).json({ ok: true });
});

feedbackRouter.get('/results', requireRole('admin'), async (req, res) => {
  const { month } = parse(
    z.object({
      month: z
        .string()
        .regex(/^\d{4}-\d{2}$/)
        .default(currentMonth()),
    }),
    req.query,
  );
  const rows = await Feedback.find({ month });
  const total = rows.length;
  const averages = Object.fromEntries(
    FEEDBACK_CRITERIA.map((k) => {
      const sum = rows.reduce((acc, r) => acc + ((r.ratings as unknown as Record<string, number>)[k] ?? 0), 0);
      return [k, total ? Math.round((sum / total) * 100) / 100 : 0];
    }),
  );
  // Anti-ré-identification : sous 3 réponses, on n'affiche pas les suggestions libres.
  const suggestions = total >= 3 ? rows.map((r) => r.suggestion).filter((s): s is string => !!s && s.trim() !== '') : [];
  res.json({ month, total, averages, suggestions, suggestionsHidden: total > 0 && total < 3 });
});
