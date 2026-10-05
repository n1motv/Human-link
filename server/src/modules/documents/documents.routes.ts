import { Router } from 'express';
import { z } from 'zod';
import { StoredFile } from '../../models/StoredFile.js';
import { User } from '../../models/User.js';
import { authOf, requireAuth, requireRole } from '../../middleware/auth.js';
import { upload } from '../../middleware/upload.js';
import { audit } from '../../utils/audit.js';
import { badRequest, notFound, parse } from '../../utils/errors.js';
import { notify } from '../../utils/notify.js';
import { PDF, deleteStoredFile, saveUpload, sendStoredFile } from '../files/files.service.js';

export const documentsRouter = Router();
documentsRouter.use(requireAuth());

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Identifiant invalide');
const VAULT = ['bulletin', 'contrat', 'autre'] as const;

/** Coffre-fort de l'utilisateur connecté. */
documentsRouter.get('/mine', async (req, res) => {
  const items = await StoredFile.find({ ownerId: authOf(req).userId, category: { $in: VAULT } }).sort({ year: -1, month: -1, createdAt: -1 });
  res.json({ items });
});

/** Coffre-fort d'un employé (admin uniquement). */
documentsRouter.get('/user/:id', requireRole('admin'), async (req, res) => {
  const { id } = parse(z.object({ id: objectId }), req.params);
  const items = await StoredFile.find({ ownerId: id, category: { $in: VAULT } }).sort({ year: -1, month: -1, createdAt: -1 });
  await audit(req, { action: 'vault.list', targetType: 'user', targetId: id });
  res.json({ items });
});

/** Corps du dépôt d’un document dans le coffre-fort (le fichier est joint en multipart). */
export const uploadBody = z.object({
  type: z.enum(VAULT),
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(1990).max(2100).optional(),
  name: z.string().trim().max(120).optional(),
});

documentsRouter.post('/user/:id', requireRole('admin'), upload.single('file'), async (req, res) => {
  const auth = authOf(req);
  const { id } = parse(z.object({ id: objectId }), req.params);
  const body = parse(uploadBody, req.body);
  const target = await User.findById(id);
  if (!target || target.status !== 'active') throw notFound('Employé introuvable');

  let label: string;
  if (body.type === 'autre') {
    if (!body.name) throw badRequest('Le nom du document est requis', 'NAME_REQUIRED');
    label = body.name;
  } else {
    if (!body.month || !body.year) throw badRequest("Le mois et l'année sont requis", 'PERIOD_REQUIRED');
    label = `${body.type === 'bulletin' ? 'Bulletin' : 'Contrat'} ${String(body.month).padStart(2, '0')}/${body.year}`;
  }
  const stored = await saveUpload({
    file: req.file,
    ownerId: id,
    category: body.type,
    uploadedBy: auth.userId,
    allowed: PDF,
    label,
    month: body.month,
    year: body.year,
  });
  await notify(id, 'Document', 'document.added', { label }, { emailSubject: 'Nouveau document dans votre coffre-fort' });
  await audit(req, { action: 'vault.upload', targetType: 'user', targetId: id, meta: { fileId: String(stored._id), type: body.type } });
  res.status(201).json({ file: stored });
});

documentsRouter.get('/:id/download', async (req, res) => {
  const auth = authOf(req);
  const { id } = parse(z.object({ id: objectId }), req.params);
  const file = await StoredFile.findById(id);
  // Un document n'est accessible qu'à son propriétaire ou à l'administration : 404 sinon (pas de fuite d'existence).
  if (!file || !VAULT.includes(file.category as (typeof VAULT)[number]) || (auth.role !== 'admin' && String(file.ownerId) !== auth.userId)) {
    throw notFound('Document introuvable');
  }
  await sendStoredFile(req, res, id, { audit: true });
});

documentsRouter.delete('/:id', requireRole('admin'), async (req, res) => {
  const { id } = parse(z.object({ id: objectId }), req.params);
  const file = await StoredFile.findById(id);
  if (!file || !VAULT.includes(file.category as (typeof VAULT)[number])) throw notFound('Document introuvable');
  await deleteStoredFile(id);
  await audit(req, { action: 'vault.delete', targetType: 'user', targetId: String(file.ownerId), meta: { fileId: id } });
  res.json({ ok: true });
});
