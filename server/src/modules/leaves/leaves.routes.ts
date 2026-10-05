import { Router } from 'express';
import { z } from 'zod';
import { LeaveRequest } from '../../models/LeaveRequest.js';
import { User } from '../../models/User.js';
import { clientConfig } from '../../config/client.js';
import { authOf, requireAuth, requireRole } from '../../middleware/auth.js';
import { upload } from '../../middleware/upload.js';
import { audit } from '../../utils/audit.js';
import { countWorkingDays, isoDate, today } from '../../utils/dates.js';
import { badRequest, conflict, forbidden, notFound, parse } from '../../utils/errors.js';
import { notify, notifyAdmins } from '../../utils/notify.js';
import { assertCanAccessUser, displayName, managedIds, managerOf } from '../access.js';
import { CONFLICT_MESSAGES, clearTelework, findConflict } from '../absences/absences.service.js';
import { ATTACHMENT, deleteStoredFile, saveUpload, sendStoredFile } from '../files/files.service.js';

export const leavesRouter = Router();
leavesRouter.use(requireAuth());

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Identifiant invalide');
const userBrief = 'nom prenom email departement photoFileId';

const createSchema = z.object({
  raison: z.string().trim().min(1).max(120),
  dateDebut: isoDate,
  dateFin: isoDate,
  description: z.string().trim().max(2000).optional(),
});

leavesRouter.post('/', requireRole('employe', 'manager'), upload.single('attachment'), async (req, res) => {
  const auth = authOf(req);
  const body = parse(createSchema, req.body);
  if (body.dateFin < body.dateDebut) throw badRequest('La date de fin ne peut pas être avant la date de début', 'BAD_RANGE');
  if (body.dateDebut < today()) throw badRequest('La date de début ne peut pas être dans le passé', 'PAST_DATE');

  const user = await User.findById(auth.userId);
  if (!user) throw notFound();
  const nombreJours = countWorkingDays(body.dateDebut, body.dateFin, clientConfig.hr.workingDays);
  if (nombreJours === 0) throw badRequest('Cette période ne contient aucun jour ouvré', 'NO_WORKING_DAY');
  if (user.soldeConge < nombreJours) {
    throw badRequest(`Solde insuffisant : ${user.soldeConge} jour(s) disponible(s), ${nombreJours} demandé(s)`, 'INSUFFICIENT_BALANCE');
  }
  const clash = await findConflict(auth.userId, body.dateDebut, body.dateFin, 'conge');
  if (clash) throw conflict(CONFLICT_MESSAGES[clash]!, clash);
  if (clientConfig.hr.leaveAttachmentRequiredForReasons.includes(body.raison) && !req.file) {
    throw badRequest('Un justificatif est obligatoire pour ce motif', 'ATTACHMENT_REQUIRED');
  }

  const stored = req.file
    ? await saveUpload({ file: req.file, ownerId: user._id, category: 'conge', uploadedBy: auth.userId, allowed: ATTACHMENT, label: `Justificatif congé ${body.dateDebut}` })
    : undefined;

  // Le directeur — ou une personne sans manager — saute l'étape manager.
  const manager = await managerOf(auth.userId);
  const skipManager = user.isDirector || !manager;

  const leave = await LeaveRequest.create({
    ...body,
    userId: user._id,
    nombreJours,
    statutManager: skipManager ? 'accepte' : 'en attente',
    attachmentFileId: stored?._id,
  });

  const params = { name: displayName(user), from: body.dateDebut, to: body.dateFin };
  if (skipManager) await notifyAdmins('Congé', 'leave.submitted', params);
  else await notify(manager!, 'Congé', 'leave.submitted', params);
  await audit(req, { action: 'leave.create', targetType: 'leave', targetId: String(leave._id) });
  res.status(201).json({ leave });
});

leavesRouter.get('/mine', async (req, res) => {
  const items = await LeaveRequest.find({ userId: authOf(req).userId }).sort({ dateDebut: -1 });
  res.json({ items });
});

/** Liste de décision : admin = tout, manager = son équipe. */
leavesRouter.get('/', requireRole('admin', 'manager'), async (req, res) => {
  const auth = authOf(req);
  const q = parse(z.object({ statut: z.enum(['en attente', 'accepte', 'refuse']).optional() }), req.query);
  const filter: Record<string, unknown> = {};
  if (q.statut) filter.statut = q.statut;
  if (auth.role === 'manager') filter.userId = { $in: await managedIds(auth.userId) };
  const items = await LeaveRequest.find(filter).sort({ createdAt: -1 }).limit(500).populate('userId', userBrief);
  res.json({
    items: items.map((l) => {
      const o = l.toJSON() as Record<string, unknown>;
      o.user = (l.userId as unknown as { toJSON?: () => unknown })?.toJSON?.() ?? null;
      o.userId = String((l.userId as unknown as { _id?: unknown })?._id ?? l.userId);
      return o;
    }),
  });
});

leavesRouter.post('/:id/decision', requireRole('admin', 'manager'), async (req, res) => {
  const auth = authOf(req);
  const { id } = parse(z.object({ id: objectId }), req.params);
  const body = parse(z.object({ decision: z.enum(['accepte', 'refuse']), motifRefus: z.string().trim().min(1).max(1000).optional() }), req.body);
  if (body.decision === 'refuse' && !body.motifRefus) throw badRequest('Un motif de refus est requis', 'REASON_REQUIRED');

  const leave = await LeaveRequest.findById(id);
  if (!leave) throw notFound('Demande introuvable');
  if (leave.statut !== 'en attente') throw conflict('Cette demande a déjà été traitée', 'ALREADY_DECIDED');
  const employeeId = String(leave.userId);
  const employee = await User.findById(employeeId);
  if (!employee) throw notFound();
  const params = { from: leave.dateDebut, to: leave.dateFin, name: displayName(employee), motif: body.motifRefus ?? '' };

  if (auth.role === 'manager') {
    // Un manager ne décide que pour son équipe, et seulement à l'étape manager.
    if (!(await managedIds(auth.userId)).includes(employeeId)) throw forbidden();
    if (leave.statutManager !== 'en attente') throw conflict('Cette demande a déjà été traitée', 'ALREADY_DECIDED');
    if (body.decision === 'accepte') {
      leave.statutManager = 'accepte';
      await leave.save();
      await notifyAdmins('Congé', 'leave.manager_accepted', params, { emailSubject: 'Demande de congé à approuver' });
    } else {
      leave.statutManager = 'refuse';
      leave.statut = 'refuse';
      leave.motifRefus = body.motifRefus;
      await leave.save();
      await notify(employeeId, 'Congé', 'leave.refused_manager', params, { emailSubject: 'Réponse à votre demande de congé' });
    }
  } else if (body.decision === 'refuse') {
    leave.statutAdmin = 'refuse';
    leave.statut = 'refuse';
    leave.motifRefus = body.motifRefus;
    await leave.save();
    await notify(employeeId, 'Congé', 'leave.refused_admin', params, { emailSubject: 'Réponse à votre demande de congé' });
  } else {
    if (leave.statutManager !== 'accepte') throw conflict("Le manager doit d'abord valider cette demande", 'MANAGER_PENDING');
    // Prise de la demande de façon atomique, puis débit du solde conditionnel : pas de double décompte ni de solde négatif.
    const claimed = await LeaveRequest.findOneAndUpdate({ _id: id, statut: 'en attente' }, { statut: 'accepte', statutAdmin: 'accepte' });
    if (!claimed) throw conflict('Cette demande a déjà été traitée', 'ALREADY_DECIDED');
    const debited = await User.findOneAndUpdate({ _id: employeeId, soldeConge: { $gte: leave.nombreJours } }, { $inc: { soldeConge: -leave.nombreJours } });
    if (!debited) {
      await LeaveRequest.updateOne({ _id: id }, { statut: 'en attente', statutAdmin: 'en attente' });
      throw badRequest('Solde de congé insuffisant pour cette demande', 'INSUFFICIENT_BALANCE');
    }
    await clearTelework(employeeId, leave.dateDebut, leave.dateFin);
    await notify(employeeId, 'Congé', 'leave.accepted', params, { emailSubject: 'Réponse à votre demande de congé' });
  }
  await audit(req, { action: `leave.${body.decision}`, targetType: 'leave', targetId: id });
  res.json({ leave: await LeaveRequest.findById(id) });
});

/** L'employé peut retirer une demande encore en attente. */
leavesRouter.delete('/:id', async (req, res) => {
  const auth = authOf(req);
  const { id } = parse(z.object({ id: objectId }), req.params);
  const leave = await LeaveRequest.findById(id);
  if (!leave || String(leave.userId) !== auth.userId) throw notFound('Demande introuvable');
  if (leave.statut !== 'en attente') throw conflict('Seule une demande en attente peut être retirée', 'NOT_PENDING');
  await deleteStoredFile(leave.attachmentFileId);
  await leave.deleteOne();
  await audit(req, { action: 'leave.cancel', targetType: 'leave', targetId: id });
  res.json({ ok: true });
});

leavesRouter.get('/:id/attachment', async (req, res) => {
  const auth = authOf(req);
  const { id } = parse(z.object({ id: objectId }), req.params);
  const leave = await LeaveRequest.findById(id);
  if (!leave?.attachmentFileId) throw notFound('Aucun justificatif');
  await assertCanAccessUser(auth, String(leave.userId));
  await sendStoredFile(req, res, String(leave.attachmentFileId), { audit: true });
});
