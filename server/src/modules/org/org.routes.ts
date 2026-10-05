import { Router } from 'express';
import { z } from 'zod';
import { LeaveRequest } from '../../models/LeaveRequest.js';
import { Supervision } from '../../models/Supervision.js';
import { User } from '../../models/User.js';
import { authOf, requireAuth, requireRole } from '../../middleware/auth.js';
import { audit } from '../../utils/audit.js';
import { badRequest, conflict, notFound, parse } from '../../utils/errors.js';
import { notify } from '../../utils/notify.js';
import { displayName, managedIds } from '../access.js';

export const orgRouter = Router();
orgRouter.use(requireAuth());

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Identifiant invalide');

const userBrief = 'nom prenom email poste departement role isDirector photoFileId matricule';

/** Un couple manager / personne supervisée (corps de l’affectation et paramètres de sa suppression). */
export const supervisionPair = z.object({ managerId: objectId, superviseId: objectId });

/** Corps de la désignation du directeur. */
export const directorBody = z.object({ managerId: objectId });

/** Corps du réglage du maximum de jours de télétravail d’une personne. */
export const teleworkMaxBody = z.object({ teleworkMax: z.coerce.number().int().min(0).max(5) });

orgRouter.get('/supervisions', requireRole('admin'), async (_req, res) => {
  const rows = await Supervision.find().populate('managerId', userBrief).populate('superviseId', userBrief);
  const director = await User.findOne({ isDirector: true }, userBrief);
  res.json({
    assignments: rows
      .filter((r) => r.managerId && r.superviseId)
      .map((r) => ({ manager: (r.managerId as unknown as { toJSON(): unknown }).toJSON(), supervise: (r.superviseId as unknown as { toJSON(): unknown }).toJSON() })),
    director: director?.toJSON() ?? null,
  });
});

orgRouter.post('/supervisions', requireRole('admin'), async (req, res) => {
  const body = parse(supervisionPair, req.body);
  if (body.managerId === body.superviseId) throw badRequest('Un manager ne peut pas se superviser lui-même');
  const [manager, supervise] = await Promise.all([User.findById(body.managerId), User.findById(body.superviseId)]);
  if (!manager || manager.role !== 'manager' || manager.status !== 'active') throw badRequest('Le manager choisi est invalide');
  if (!supervise || supervise.status !== 'active' || supervise.role === 'admin') throw badRequest('La personne supervisée est invalide');
  if (await Supervision.exists({ superviseId: body.superviseId })) throw conflict('Cette personne est déjà supervisée par un autre manager');

  // Empêche les cycles (A supervise B qui supervise A, directement ou indirectement).
  let cursor: string | null = body.managerId;
  for (let depth = 0; cursor && depth < 50; depth++) {
    if (cursor === body.superviseId) throw badRequest('Cette assignation créerait une boucle hiérarchique', 'CYCLE');
    const up: { managerId: unknown } | null = await Supervision.findOne({ superviseId: cursor }, { managerId: 1 });
    cursor = up ? String(up.managerId) : null;
  }

  await Supervision.create(body);
  await audit(req, { action: 'org.assign', targetType: 'user', targetId: body.superviseId, meta: { managerId: body.managerId } });
  await notify(body.superviseId, 'Organisation', 'org.new_manager', { name: displayName(manager) });
  res.status(201).json({ ok: true });
});

orgRouter.delete('/supervisions/:managerId/:superviseId', requireRole('admin'), async (req, res) => {
  const { managerId, superviseId } = parse(supervisionPair, req.params);
  const r = await Supervision.deleteOne({ managerId, superviseId });
  if (!r.deletedCount) throw notFound('Assignation introuvable');
  await audit(req, { action: 'org.unassign', targetType: 'user', targetId: superviseId, meta: { managerId } });
  res.json({ ok: true });
});

orgRouter.put('/director', requireRole('admin'), async (req, res) => {
  const { managerId } = parse(directorBody, req.body);
  const target = await User.findById(managerId);
  if (!target || target.role !== 'manager' || target.status !== 'active') throw badRequest('Le directeur doit être un manager actif');
  await User.updateMany({ isDirector: true }, { isDirector: false });
  target.isDirector = true;
  await target.save();
  await audit(req, { action: 'org.set_director', targetType: 'user', targetId: managerId });
  res.json({ ok: true });
});

/** Organigramme : arbre à partir du directeur, puis les éventuelles racines isolées. */
orgRouter.get('/tree', requireRole('admin'), async (_req, res) => {
  const [links, users] = await Promise.all([Supervision.find(), User.find({ status: 'active', role: { $ne: 'admin' } }, userBrief)]);
  const byId = new Map(users.map((u) => [String(u._id), u]));
  const children = new Map<string, string[]>();
  const hasParent = new Set<string>();
  for (const l of links) {
    const m = String(l.managerId);
    const s = String(l.superviseId);
    if (!byId.has(m) || !byId.has(s)) continue;
    children.set(m, [...(children.get(m) ?? []), s]);
    hasParent.add(s);
  }
  const build = (id: string, seen = new Set<string>()): unknown => {
    const u = byId.get(id)!;
    seen.add(id);
    return {
      id,
      name: displayName(u),
      poste: u.poste,
      role: u.role,
      children: (children.get(id) ?? []).filter((c) => !seen.has(c)).map((c) => build(c, seen)),
    };
  };
  const director = users.find((u) => u.isDirector);
  const roots = users.filter((u) => !hasParent.has(String(u._id)) && (!director || String(u._id) !== String(director._id)));
  const tree = director ? { ...(build(String(director._id)) as object) } : null;
  res.json({
    tree,
    unassigned: roots.filter((r) => !children.get(String(r._id))?.length).map((r) => ({ id: String(r._id), name: displayName(r), poste: r.poste })),
    otherRoots: roots.filter((r) => children.get(String(r._id))?.length).map((r) => build(String(r._id))),
  });
});

// ---------- Espace manager ----------

orgRouter.get('/team', requireRole('manager'), async (req, res) => {
  const ids = await managedIds(authOf(req).userId);
  const [members, pending] = await Promise.all([
    User.find({ _id: { $in: ids }, status: 'active' }).sort({ nom: 1 }),
    LeaveRequest.distinct('userId', { userId: { $in: ids }, statut: 'en attente', statutManager: 'en attente' }),
  ]);
  const pendingSet = new Set(pending.map(String));
  res.json({
    team: members.map((u) => ({
      id: String(u._id),
      matricule: u.matricule,
      nom: u.nom,
      prenom: u.prenom,
      email: u.email,
      poste: u.poste,
      departement: u.departement,
      role: u.role,
      photoFileId: u.photoFileId ? String(u.photoFileId) : null,
      teleworkMax: u.teleworkMax,
      hasPendingLeave: pendingSet.has(String(u._id)),
    })),
  });
});

orgRouter.patch('/team/:id/telework-max', requireRole('manager'), async (req, res) => {
  const auth = authOf(req);
  const id = req.params.id as string;
  const { teleworkMax } = parse(teleworkMaxBody, req.body);
  if (!(await managedIds(auth.userId)).includes(id)) throw notFound('Cette personne ne fait pas partie de votre équipe');
  await User.updateOne({ _id: id }, { teleworkMax });
  await audit(req, { action: 'telework.set_max', targetType: 'user', targetId: id, meta: { teleworkMax } });
  await notify(id, 'Télétravail', 'telework.max_set', { n: teleworkMax });
  res.json({ ok: true });
});
