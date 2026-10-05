import { Router } from 'express';
import { z } from 'zod';
import { SickLeave } from '../../models/SickLeave.js';
import { User } from '../../models/User.js';
import { authOf, requireAuth, requireRole } from '../../middleware/auth.js';
import { schemas } from '../../shared.js';
import { upload } from '../../middleware/upload.js';
import { audit } from '../../utils/audit.js';
import { addDays, isoDate, today } from '../../utils/dates.js';
import { badRequest, conflict, notFound, parse } from '../../utils/errors.js';
import { notify, notifyAdmins } from '../../utils/notify.js';
import { assertCanAccessUser, displayName } from '../access.js';
import { CONFLICT_MESSAGES, clearTelework, findConflict } from '../absences/absences.service.js';
import { ATTACHMENT, saveUpload, sendStoredFile } from '../files/files.service.js';

export const sickRouter = Router();
sickRouter.use(requireAuth());

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Identifiant invalide');

/** Corps de la déclaration d’un arrêt maladie (avec un justificatif en multipart si l’arrêt est justifié). */
export const sickCreateBody = z.object({
  typeMaladie: z.enum(['justifie', 'non justifie']),
  dateDebut: isoDate,
  dateFin: isoDate,
  description: z.string().trim().max(2000).optional(),
});

/** Un arrêt maladie est souvent déclaré après coup : on tolère 30 jours de rétroactivité. */
const MAX_BACKDATE_DAYS = 30;

sickRouter.post('/', requireRole('employe', 'manager'), upload.single('attachment'), async (req, res) => {
  const auth = authOf(req);
  const body = parse(sickCreateBody, req.body);
  if (body.dateFin < body.dateDebut) throw badRequest('La date de fin ne peut pas être avant la date de début', 'BAD_RANGE');
  if (body.dateDebut < addDays(today(), -MAX_BACKDATE_DAYS)) throw badRequest(`La date de début ne peut pas dépasser ${MAX_BACKDATE_DAYS} jours dans le passé`, 'PAST_DATE');
  const clash = await findConflict(auth.userId, body.dateDebut, body.dateFin, 'arret');
  if (clash) throw conflict(CONFLICT_MESSAGES[clash]!, clash);
  if (body.typeMaladie === 'justifie' && !req.file) throw badRequest('Un arrêt justifié nécessite un justificatif', 'ATTACHMENT_REQUIRED');

  const stored = req.file
    ? await saveUpload({ file: req.file, ownerId: auth.userId, category: 'arret', uploadedBy: auth.userId, allowed: ATTACHMENT, label: `Arrêt maladie ${body.dateDebut}` })
    : undefined;
  const sick = await SickLeave.create({ ...body, userId: auth.userId, attachmentFileId: stored?._id });
  const user = await User.findById(auth.userId);
  await notifyAdmins('Arrêt', 'sick.submitted', { name: displayName(user ?? {}), from: body.dateDebut, to: body.dateFin });
  await audit(req, { action: 'sick.create', targetType: 'sick', targetId: String(sick._id) });
  res.status(201).json({ sick });
});

sickRouter.get('/mine', async (req, res) => {
  res.json({ items: await SickLeave.find({ userId: authOf(req).userId }).sort({ dateDebut: -1 }) });
});

sickRouter.get('/', requireRole('admin'), async (req, res) => {
  const q = parse(schemas.decisionFilterQuery, req.query);
  const items = await SickLeave.find(q.statut ? { statut: q.statut } : {})
    .sort({ createdAt: -1 })
    .limit(500)
    .populate('userId', 'nom prenom email departement');
  await audit(req, { action: 'sick.list', targetType: 'sick' }); // donnée de santé : lecture tracée
  res.json({
    items: items.map((s) => {
      const o = s.toJSON() as Record<string, unknown>;
      o.user = (s.userId as unknown as { toJSON?: () => unknown })?.toJSON?.() ?? null;
      o.userId = String((s.userId as unknown as { _id?: unknown })?._id ?? s.userId);
      return o;
    }),
  });
});

sickRouter.post('/:id/decision', requireRole('admin'), async (req, res) => {
  const { id } = parse(z.object({ id: objectId }), req.params);
  const body = parse(schemas.decisionBody, req.body);
  if (body.decision === 'refuse' && !body.motifRefus) throw badRequest('Un motif de refus est requis', 'REASON_REQUIRED');
  const sick = await SickLeave.findOneAndUpdate(
    { _id: id, statut: 'en attente' },
    { statut: body.decision, motifRefus: body.decision === 'refuse' ? body.motifRefus : undefined },
    { new: true },
  );
  if (!sick) throw (await SickLeave.exists({ _id: id })) ? conflict('Cette demande a déjà été traitée', 'ALREADY_DECIDED') : notFound('Demande introuvable');
  if (body.decision === 'accepte') {
    await clearTelework(String(sick.userId), sick.dateDebut, sick.dateFin);
    await notify(sick.userId, 'Arrêt', 'sick.accepted', {}, { emailSubject: 'Réponse à votre arrêt maladie' });
  } else {
    await notify(sick.userId, 'Arrêt', 'sick.refused', { motif: body.motifRefus ?? '' }, { emailSubject: 'Réponse à votre arrêt maladie' });
  }
  await audit(req, { action: `sick.${body.decision}`, targetType: 'sick', targetId: id });
  res.json({ sick });
});

sickRouter.get('/:id/attachment', async (req, res) => {
  const auth = authOf(req);
  const { id } = parse(z.object({ id: objectId }), req.params);
  const sick = await SickLeave.findById(id);
  if (!sick?.attachmentFileId) throw notFound('Aucun justificatif');
  // Donnée de santé : seul l'intéressé et l'administration y accèdent (pas le manager).
  if (auth.role !== 'admin' && String(sick.userId) !== auth.userId) throw notFound('Aucun justificatif');
  await assertCanAccessUser(auth, String(sick.userId));
  await sendStoredFile(req, res, String(sick.attachmentFileId), { audit: true });
});
