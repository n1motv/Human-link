import { Router } from 'express';
import { z } from 'zod';
import { AuditLog } from '../../models/AuditLog.js';
import { BonusRequest } from '../../models/BonusRequest.js';
import { ContactRequest } from '../../models/ContactRequest.js';
import { LeaveRequest } from '../../models/LeaveRequest.js';
import { Meeting } from '../../models/Meeting.js';
import { Notification } from '../../models/Notification.js';
import { SickLeave } from '../../models/SickLeave.js';
import { StoredFile } from '../../models/StoredFile.js';
import { Supervision } from '../../models/Supervision.js';
import { Telework } from '../../models/Telework.js';
import { User, toPublicUser } from '../../models/User.js';
import { authOf, requireAuth, requireRole } from '../../middleware/auth.js';
import { audit } from '../../utils/audit.js';
import { notFound, parse } from '../../utils/errors.js';
import { escapeRegex } from '../../utils/regex.js';

export const rgpdRouter = Router();
rgpdRouter.use(requireAuth());

/**
 * Droit d'accès et de portabilité (art. 15 et 20 RGPD) : toutes les données personnelles de la
 * personne connectée, dans un format structuré et lisible par machine.
 */
rgpdRouter.get('/export', async (req, res) => {
  const userId = authOf(req).userId;
  const user = await User.findById(userId);
  if (!user) throw notFound();
  const [leaves, sicks, bonuses, telework, meetings, notifications, files, contacts, supervision, history] = await Promise.all([
    LeaveRequest.find({ userId }),
    SickLeave.find({ userId }),
    BonusRequest.find({ employeId: userId }),
    Telework.find({ userId }),
    Meeting.find({ $or: [{ createdBy: userId }, { 'invitees.userId': userId }] }, 'title dateTime status'),
    Notification.find({ userId }),
    StoredFile.find({ ownerId: userId }),
    ContactRequest.find({ userId }),
    Supervision.findOne({ superviseId: userId }),
    AuditLog.find({ actorId: userId }).sort({ at: -1 }).limit(1000),
  ]);
  await audit(req, { action: 'rgpd.export', targetType: 'user', targetId: userId });
  const payload = {
    exportedAt: new Date().toISOString(),
    profile: toPublicUser(user),
    managerId: supervision ? String(supervision.managerId) : null,
    leaves,
    sickLeaves: sicks,
    bonuses,
    telework: telework.map((t) => t.date),
    meetings,
    notifications,
    documents: files,
    contactRequests: contacts,
    activityLog: history,
    note: 'Les retours de feedback mensuel sont anonymes et ne peuvent pas être rattachés à votre compte.',
  };
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="mes-donnees-${new Date().toISOString().slice(0, 10)}.json"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(JSON.stringify(payload, null, 2));
});

/** Journal d'audit (admin) : qui a consulté ou modifié quoi. */
rgpdRouter.get('/audit', requireRole('admin'), async (req, res) => {
  const q = parse(
    z.object({
      action: z.string().max(60).optional(),
      actor: z.string().max(120).optional(),
      target: z.string().max(60).optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(200).default(50),
    }),
    req.query,
  );
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
