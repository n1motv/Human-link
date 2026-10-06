import { Router } from 'express';
import { z } from 'zod';
import { AuditLog } from '../../models/AuditLog.js';
import { authOf, requireAuth, requireRole } from '../../middleware/auth.js';
import { audit } from '../../utils/audit.js';
import { parse } from '../../utils/errors.js';
import { escapeRegex } from '../../utils/regex.js';
import { buildDossierZip, buildUserData } from './dossier.js';
import { buildRegister } from './register.js';

export const rgpdRouter = Router();
rgpdRouter.use(requireAuth());

/**
 * Droit d'accès et de portabilité (art. 15 et 20 RGPD) : toutes les données personnelles de la
 * personne connectée, dans un format structuré et lisible par machine.
 */
rgpdRouter.get('/export', async (req, res) => {
  const userId = authOf(req).userId;
  const { payload } = await buildUserData(userId);
  await audit(req, { action: 'rgpd.export', targetType: 'user', targetId: userId });
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="mes-donnees-${new Date().toISOString().slice(0, 10)}.json"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(JSON.stringify(payload, null, 2));
});

/** Registre des activités de traitement (art. 30) avec les durées de conservation réellement appliquées. Administration seulement. */
rgpdRouter.get('/register', requireRole('admin'), async (req, res) => {
  await audit(req, { action: 'rgpd.register', targetType: 'register' });
  res.setHeader('Cache-Control', 'no-store');
  res.json(buildRegister());
});

/**
 * Dossier complet d'un employé en un clic (archive ZIP : données et documents déchiffrés), pour une demande d'accès reçue par courrier.
 * Administration seulement ; l'export est tracé dans le journal d'audit avec la personne concernée.
 */
rgpdRouter.get('/dossier/:id', requireRole('admin'), async (req, res) => {
  const { id } = parse(z.object({ id: z.string().regex(/^[a-f\d]{24}$/i, 'Identifiant invalide') }), req.params);
  const { zip, name, files } = await buildDossierZip(id);
  await audit(req, { action: 'rgpd.dossier.export', targetType: 'user', targetId: id, meta: { files } });
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${name}.zip"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(Buffer.from(zip));
});

/** Filtres et pagination du journal d’audit. */
export const auditQuery = z.object({
  action: z.string().max(60).optional(),
  actor: z.string().max(120).optional(),
  target: z.string().max(60).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

/** Journal d'audit (admin) : qui a consulté ou modifié quoi. */
rgpdRouter.get('/audit', requireRole('admin'), async (req, res) => {
  const q = parse(auditQuery, req.query);
  const filter: Record<string, unknown> = {};
  if (q.action) filter.action = new RegExp(`^${escapeRegex(q.action)}`);
  if (q.actor) filter.actorEmail = new RegExp(escapeRegex(q.actor), 'i');
  if (q.target) filter.targetId = q.target;
  const [items, total] = await Promise.all([
    AuditLog.find(filter)
      .sort({ at: -1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit),
    AuditLog.countDocuments(filter),
  ]);
  res.json({ items, total, page: q.page });
});
