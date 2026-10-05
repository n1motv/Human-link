import type { Request, Response } from 'express';
import type { Types } from 'mongoose';
import { StoredFile } from '../../models/StoredFile.js';
import { audit } from '../../utils/audit.js';
import { MAX_FILE_BYTES, MIME_GROUPS, readDecrypted, removeFile, sniffMime, writeEncrypted } from '../../utils/storage.js';
import { assertClean } from '../../utils/antivirus.js';
import { badRequest, notFound } from '../../utils/errors.js';

type Category = 'photo' | 'bulletin' | 'contrat' | 'autre' | 'conge' | 'arret';

interface SaveInput {
  file: Express.Multer.File | undefined;
  ownerId: string | Types.ObjectId;
  category: Category;
  uploadedBy: string;
  allowed: readonly string[];
  label?: string;
  month?: number;
  year?: number;
}

export async function saveUpload(input: SaveInput) {
  const { file } = input;
  if (!file) throw badRequest('Fichier manquant', 'NO_FILE');
  if (file.size > MAX_FILE_BYTES) throw badRequest('Fichier trop volumineux', 'FILE_TOO_LARGE');
  const mime = await sniffMime(file.buffer, input.allowed);
  await assertClean(file.buffer, file.originalname); // antivirus ClamAV si configuré
  const storageKey = await writeEncrypted(file.buffer);
  return StoredFile.create({
    ownerId: input.ownerId,
    category: input.category,
    label: input.label,
    month: input.month,
    year: input.year,
    originalName: file.originalname.replace(/[^\w.\- ()éèàùçêôîû]/gi, '_').slice(0, 200),
    mime,
    size: file.size,
    storageKey,
    uploadedBy: input.uploadedBy,
  });
}

export const IMAGE = MIME_GROUPS.image;
export const PDF = MIME_GROUPS.pdf;
export const ATTACHMENT = MIME_GROUPS.attachment;

export async function deleteStoredFile(fileId: string | Types.ObjectId | undefined | null) {
  if (!fileId) return;
  const f = await StoredFile.findById(fileId).select('+storageKey');
  if (!f) return;
  await removeFile(f.storageKey);
  await f.deleteOne();
}

/** Envoie un fichier déchiffré. Les en-têtes empêchent toute exécution ou mise en cache partagée. */
export async function sendStoredFile(req: Request, res: Response, fileId: string, opts: { inline?: boolean; audit?: boolean } = {}) {
  const f = await StoredFile.findById(fileId).select('+storageKey');
  if (!f) throw notFound('Fichier introuvable');
  const data = await readDecrypted(f.storageKey);
  const ext = f.mime === 'application/pdf' ? 'pdf' : f.mime.split('/')[1];
  const base = (f.label || f.originalName || 'document').replace(/[^\w\-. ]/g, '_').replace(/\.[a-z]+$/i, '');
  res.setHeader('Content-Type', f.mime);
  res.setHeader('Content-Length', String(data.length));
  res.setHeader('Content-Disposition', `${opts.inline ? 'inline' : 'attachment'}; filename="${base}.${ext}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  res.setHeader('Cache-Control', opts.inline ? 'private, max-age=300' : 'private, no-store');
  if (opts.audit) await audit(req, { action: 'file.download', targetType: 'file', targetId: String(f._id), meta: { owner: String(f.ownerId), category: f.category } });
  res.end(data);
}
