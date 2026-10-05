import { randomInt } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { User, CONTRACTS, ROLES, toPublicUser } from '../../models/User.js';
import { Supervision } from '../../models/Supervision.js';
import { clientConfig } from '../../config/client.js';
import { authOf, requireAuth, requireRole } from '../../middleware/auth.js';
import { upload } from '../../middleware/upload.js';
import { audit } from '../../utils/audit.js';
import { ageOn, isoDate, today } from '../../utils/dates.js';
import { badRequest, conflict, forbidden, notFound, parse } from '../../utils/errors.js';
import { hashPassword, verifyPassword } from '../../utils/password.js';
import { assertCanAccessUser, loadUser } from '../access.js';
import { sendInvitation } from '../auth/auth.routes.js';
import { revokeAllSessions } from '../auth/session.js';
import { IMAGE, deleteStoredFile, saveUpload, sendStoredFile } from '../files/files.service.js';
import { anonymizeUser } from '../rgpd/anonymize.js';
import { escapeRegex } from '../../utils/regex.js';

export const usersRouter = Router();
usersRouter.use(requireAuth());

const text = (max = 120) => z.string().trim().max(max);
const optText = (max = 120) => text(max).optional().or(z.literal('').transform(() => undefined));
const optDate = isoDate.optional().or(z.literal('').transform(() => undefined));

const profileFields = {
  nom: text(80).min(1),
  prenom: text(80).min(1),
  dateNaissance: optDate,
  adresse: optText(300),
  ville: optText(),
  codePostal: optText(20),
  pays: optText(80),
  nationalite: optText(80),
  telephone: optText(30),
};

const adminFields = {
  email: z.email().max(254).transform((v) => v.toLowerCase().trim()),
  role: z.enum(ROLES),
  poste: optText(),
  departement: optText(),
  sexe: z.enum(['Homme', 'Femme']).optional().or(z.literal('').transform(() => undefined)),
  numeroSecu: optText(40),
  dateEmbauche: optDate,
  typeContrat: z.enum(CONTRACTS).optional().or(z.literal('').transform(() => undefined)),
  salaire: z.coerce.number().min(0).max(10_000_000).optional(),
  soldeConge: z.coerce.number().min(0).max(1000).optional(),
  teleworkMax: z.coerce.number().int().min(0).max(5).optional(),
};

function checkAge(dateNaissance?: string) {
  if (dateNaissance && ageOn(dateNaissance) < clientConfig.hr.minimumAge) {
    throw badRequest(`L'employé doit avoir au moins ${clientConfig.hr.minimumAge} ans`, 'TOO_YOUNG');
  }
}

async function newMatricule(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const m = `0${String(randomInt(0, 100000)).padStart(5, '0')}${String.fromCharCode(65 + randomInt(0, 26))}`;
    if (!(await User.exists({ matricule: m }))) return m;
  }
  throw new Error('Impossible de générer un matricule');
}

/** Vue « annuaire » : aucune donnée sensible (ni salaire, ni n° de sécu, ni adresse). */
function listView(u: ReturnType<typeof toPublicUser>) {
  const keep = ['id', 'matricule', 'nom', 'prenom', 'email', 'role', 'poste', 'departement', 'status', 'isDirector', 'typeContrat', 'dateEmbauche', 'photoFileId', 'twoFactor'];
  return Object.fromEntries(keep.map((k) => [k, u[k]]));
}

// ---------- Mon profil ----------

usersRouter.get('/me/profile', async (req, res) => {
  const user = await loadUser(authOf(req).userId);
  await audit(req, { action: 'profile.read', targetType: 'user', targetId: String(user._id) });
  res.json({ user: toPublicUser(user) });
});

usersRouter.patch('/me/profile', async (req, res) => {
  const body = parse(
    z.object({ ...profileFields, email: adminFields.email.optional(), currentPassword: z.string().max(200).optional() }).partial(),
    req.body,
  );
  checkAge(body.dateNaissance);
  const user = await loadUser(authOf(req).userId);

  if (body.email && body.email !== user.email) {
    // Changer son identifiant de connexion exige de ressaisir son mot de passe.
    const full = await User.findById(user._id).select('+passwordHash');
    if (!body.currentPassword || !full?.passwordHash || !(await verifyPassword(full.passwordHash, body.currentPassword))) {
      throw forbidden('Mot de passe requis pour changer votre e-mail', 'PASSWORD_REQUIRED');
    }
    if (await User.exists({ email: body.email })) throw conflict('Cet e-mail est déjà utilisé', 'EMAIL_TAKEN');
    user.email = body.email;
  }
  const { email: _e, currentPassword: _p, ...fields } = body;
  user.set(fields);
  await user.save();
  await audit(req, { action: 'profile.update', targetType: 'user', targetId: String(user._id) });
  res.json({ user: toPublicUser(user) });
});

usersRouter.post('/me/photo', upload.single('photo'), async (req, res) => {
  const auth = authOf(req);
  const user = await loadUser(auth.userId);
  const stored = await saveUpload({ file: req.file, ownerId: user._id, category: 'photo', uploadedBy: auth.userId, allowed: IMAGE });
  const old = user.photoFileId;
  user.photoFileId = stored._id;
  await user.save();
  await deleteStoredFile(old);
  res.json({ user: toPublicUser(user) });
});

// ---------- Administration des utilisateurs ----------

usersRouter.get('/', requireRole('admin', 'manager'), async (req, res) => {
  const q = parse(
    z.object({
      q: z.string().max(80).optional(),
      role: z.enum(ROLES).optional(),
      notRole: z.enum(ROLES).optional(),
      unsupervised: z.enum(['true']).optional(),
      status: z.enum(['invited', 'active', 'archived']).optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(200).default(100),
    }),
    req.query,
  );
  const auth = authOf(req);
  const filter: Record<string, unknown> = { status: { $ne: 'anonymized' } };
  if (q.role) filter.role = q.role;
  else if (q.notRole) filter.role = { $ne: q.notRole };
  if (q.status) filter.status = q.status;
  if (q.q) {
    const rx = new RegExp(escapeRegex(q.q), 'i');
    filter.$or = [{ nom: rx }, { prenom: rx }, { email: rx }, { matricule: rx }, { departement: rx }];
  }
  if (auth.role === 'manager') {
    const ids = (await Supervision.find({ managerId: auth.userId }, { superviseId: 1 })).map((s) => s.superviseId);
    filter._id = { $in: ids };
  }
  if (q.unsupervised) {
    // Personnes qui n'ont pas encore de responsable (un seul responsable par personne).
    const taken = (await Supervision.find({}, { superviseId: 1 })).map((s) => s.superviseId);
    filter.$and = [{ _id: { $nin: taken } }];
  }
  const [items, total] = await Promise.all([
    User.find(filter).sort({ nom: 1, prenom: 1 }).skip((q.page - 1) * q.limit).limit(q.limit),
    User.countDocuments(filter),
  ]);
  res.json({ items: items.map((u) => listView(toPublicUser(u))), total, page: q.page });
});

usersRouter.post('/', requireRole('admin'), async (req, res) => {
  const body = parse(z.object({ ...profileFields, ...adminFields }), req.body);
  checkAge(body.dateNaissance);
  if (await User.exists({ email: body.email })) throw conflict('Cet e-mail est déjà assigné à un autre employé', 'EMAIL_TAKEN');
  const user = await User.create({
    ...body,
    matricule: await newMatricule(),
    status: 'invited',
    soldeConge: body.soldeConge ?? 0,
    teleworkMax: body.teleworkMax ?? clientConfig.hr.defaultTeleworkMaxDays,
    dernierMoisMaj: today().slice(0, 7),
  });
  await sendInvitation(user);
  await audit(req, { action: 'user.create', targetType: 'user', targetId: String(user._id) });
  res.status(201).json({ user: toPublicUser(user) });
});

usersRouter.get('/:id', async (req, res) => {
  const auth = authOf(req);
  const { id } = parse(z.object({ id: z.string().regex(/^[a-f\d]{24}$/i) }), req.params);
  await assertCanAccessUser(auth, id);
  const user = await loadUser(id);
  const full = toPublicUser(user);
  // Un manager n'a pas accès aux données sensibles de ses équipiers (salaire, n° de sécu, adresse, ...).
  const view = auth.role === 'admin' || auth.userId === id ? full : listView(full);
  if (auth.userId !== id) await audit(req, { action: 'user.read', targetType: 'user', targetId: id });
  res.json({ user: view });
});

usersRouter.patch('/:id', requireRole('admin'), async (req, res) => {
  const { id } = parse(z.object({ id: z.string().regex(/^[a-f\d]{24}$/i) }), req.params);
  const body = parse(z.object({ ...profileFields, ...adminFields, password: z.string().optional() }).partial(), req.body);
  checkAge(body.dateNaissance);
  const auth = authOf(req);
  const user = await loadUser(id);

  if (body.email && body.email !== user.email && (await User.exists({ email: body.email, _id: { $ne: id } }))) {
    throw conflict('Cet e-mail est déjà assigné à un autre employé', 'EMAIL_TAKEN');
  }
  if (body.role && body.role !== user.role) {
    if (id === auth.userId) throw badRequest('Vous ne pouvez pas modifier votre propre rôle', 'SELF_ROLE');
    user.tokenVersion += 1; // le nouveau rôle s'applique immédiatement : on force une reconnexion
    await revokeAllSessions(id);
    if (body.role !== 'manager') await Supervision.deleteMany({ managerId: id });
  }
  const { password: _ignored, ...fields } = body;
  user.set(fields);
  await user.save();
  await audit(req, { action: 'user.update', targetType: 'user', targetId: id, meta: { fields: Object.keys(fields) } });
  res.json({ user: toPublicUser(user) });
});

/** Téléphone perdu : l'admin réinitialise la 2FA d'un compte (action tracée) ; la 2FA se reconfigure à la prochaine connexion. */
usersRouter.post('/:id/reset-2fa', requireRole('admin'), async (req, res) => {
  const id = req.params.id as string;
  const user = await loadUser(id);
  user.twoFactor = { enabled: false, recoveryCodes: [] } as unknown as typeof user.twoFactor;
  user.tokenVersion += 1; // coupe les sessions en cours
  await user.save();
  await revokeAllSessions(id);
  await audit(req, { action: 'user.reset_2fa', targetType: 'user', targetId: id });
  res.json({ ok: true });
});

usersRouter.post('/:id/resend-invite', requireRole('admin'), async (req, res) => {
  const user = await loadUser(req.params.id as string);
  if (user.status !== 'invited') throw badRequest("Ce compte est déjà activé");
  await sendInvitation(user);
  res.json({ ok: true });
});

/** « Suppression » = archivage : accès coupé, données conservées pendant la durée légale. */
usersRouter.delete('/:id', requireRole('admin'), async (req, res) => {
  const auth = authOf(req);
  const id = req.params.id as string;
  if (id === auth.userId) throw badRequest('Vous ne pouvez pas archiver votre propre compte', 'SELF_DELETE');
  const user = await loadUser(id);
  user.status = 'archived';
  user.tokenVersion += 1;
  user.isDirector = false;
  await user.save();
  await revokeAllSessions(id);
  await Supervision.deleteMany({ $or: [{ managerId: id }, { superviseId: id }] });
  await audit(req, { action: 'user.archive', targetType: 'user', targetId: id });
  res.json({ ok: true });
});

usersRouter.post('/:id/restore', requireRole('admin'), async (req, res) => {
  const user = await loadUser(req.params.id as string);
  if (user.status !== 'archived') throw badRequest("Ce compte n'est pas archivé");
  user.status = user.passwordChangedAt ? 'active' : 'invited';
  await user.save();
  await audit(req, { action: 'user.restore', targetType: 'user', targetId: String(user._id) });
  res.json({ user: toPublicUser(user) });
});

/** Droit à l'effacement (art. 17 RGPD) : irréversible. Réservé aux comptes déjà archivés. */
usersRouter.post('/:id/anonymize', requireRole('admin'), async (req, res) => {
  const id = req.params.id as string;
  const user = await loadUser(id);
  if (user.status !== 'archived') throw badRequest("Archivez d'abord le compte avant de l'anonymiser", 'NOT_ARCHIVED');
  await anonymizeUser(user);
  await audit(req, { action: 'user.anonymize', targetType: 'user', targetId: id });
  res.json({ ok: true });
});

usersRouter.get('/:id/photo', async (req, res) => {
  const auth = authOf(req);
  const id = req.params.id as string;
  // Les photos sont visibles de toute personne connectée (annuaire interne) ; pas les autres fichiers.
  void auth;
  const user = await User.findById(id, { photoFileId: 1 });
  if (!user?.photoFileId) throw notFound();
  await sendStoredFile(req, res, String(user.photoFileId), { inline: true });
});

// utilisé par les tests / l'admin pour fixer un mot de passe sans e-mail
export async function setPassword(userId: string, plain: string) {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user) throw notFound();
  user.passwordHash = await hashPassword(plain);
  user.passwordChangedAt = new Date();
  user.status = 'active';
  await user.save();
}
