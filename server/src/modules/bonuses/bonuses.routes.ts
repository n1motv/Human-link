import { Router } from 'express';
import { schemas } from '../../shared.js';
import { z } from 'zod';
import { BonusRequest } from '../../models/BonusRequest.js';
import { User } from '../../models/User.js';
import { authOf, requireAuth, requireRole } from '../../middleware/auth.js';
import { audit } from '../../utils/audit.js';
import { conflict, forbidden, notFound, parse, badRequest } from '../../utils/errors.js';
import { notify, notifyAdmins } from '../../utils/notify.js';
import { displayName, managedIds } from '../access.js';

export const bonusesRouter = Router();
bonusesRouter.use(requireAuth());

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Identifiant invalide');

function view(b: InstanceType<typeof BonusRequest>) {
  const o = b.toJSON() as Record<string, unknown>;
  const emp = b.employeId as unknown as { toJSON?: () => unknown; _id?: unknown };
  const mgr = b.managerId as unknown as { toJSON?: () => unknown; _id?: unknown };
  o.employe = emp?.toJSON?.() ?? null;
  o.manager = mgr?.toJSON?.() ?? null;
  o.employeId = String(emp?._id ?? b.employeId);
  o.managerId = String(mgr?._id ?? b.managerId);
  return o;
}

/** Corps de la proposition de prime. */
export const bonusCreateBody = z.object({ employeId: objectId, montant: z.coerce.number().positive().max(1_000_000), motif: z.string().trim().min(1).max(1000) });

bonusesRouter.post('/', requireRole('manager'), async (req, res) => {
  const auth = authOf(req);
  const body = parse(bonusCreateBody, req.body);
  // Correction de l'ancienne version : un manager ne peut proposer une prime que pour son équipe.
  if (!(await managedIds(auth.userId)).includes(body.employeId)) throw forbidden('Cette personne ne fait pas partie de votre équipe');
  const [employee, manager] = await Promise.all([User.findById(body.employeId), User.findById(auth.userId)]);
  if (!employee || !manager) throw notFound();
  const bonus = await BonusRequest.create({ ...body, managerId: auth.userId });
  const params = { manager: displayName(manager), employee: displayName(employee), montant: body.montant };
  await notifyAdmins('Prime', 'bonus.submitted_admin', params);
  await notify(employee._id, 'Prime', 'bonus.submitted_employee', params, { emailSubject: 'Une prime a été proposée pour vous' });
  await audit(req, { action: 'bonus.create', targetType: 'bonus', targetId: String(bonus._id) });
  res.status(201).json({ bonus });
});

/** Admin : toutes les demandes. Manager : celles qu'il a émises. */
bonusesRouter.get('/', requireRole('admin', 'manager'), async (req, res) => {
  const auth = authOf(req);
  const filter = auth.role === 'manager' ? { managerId: auth.userId } : {};
  const items = await BonusRequest.find(filter).sort({ createdAt: -1 }).limit(500).populate('employeId', 'nom prenom').populate('managerId', 'nom prenom');
  res.json({ items: items.map(view) });
});

bonusesRouter.post('/:id/decision', requireRole('admin'), async (req, res) => {
  const { id } = parse(z.object({ id: objectId }), req.params);
  const body = parse(schemas.decisionBody, req.body);
  if (body.decision === 'refuse' && !body.motifRefus) throw badRequest('Un motif de refus est requis', 'REASON_REQUIRED');
  const bonus = await BonusRequest.findOneAndUpdate(
    { _id: id, statut: 'en attente' },
    { statut: body.decision, motifRefus: body.decision === 'refuse' ? body.motifRefus : undefined },
    { new: true },
  );
  if (!bonus) throw (await BonusRequest.exists({ _id: id })) ? conflict('Cette demande a déjà été traitée', 'ALREADY_DECIDED') : notFound('Demande introuvable');
  const employee = await User.findById(bonus.employeId);
  await notify(
    bonus.managerId,
    'Prime',
    body.decision === 'accepte' ? 'bonus.accepted' : 'bonus.refused',
    { employee: displayName(employee ?? {}), motif: body.motifRefus ?? '' },
    { emailSubject: 'Réponse à votre demande de prime' },
  );
  await audit(req, { action: `bonus.${body.decision}`, targetType: 'bonus', targetId: id });
  res.json({ bonus });
});
