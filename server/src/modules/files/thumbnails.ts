import sharp from 'sharp';
import type { Types } from 'mongoose';
import { StoredFile } from '../../models/StoredFile.js';
import { User } from '../../models/User.js';
import { readDecrypted, writeEncrypted } from '../../utils/storage.js';
import { deleteStoredFile } from './files.service.js';

/** Tailles servies (côté en pixels, images carrées). 96 px couvre un avatar de 48 px sur écran dense, 256 px une fiche de 128 px. */
export const THUMB_SIZES = { sm: 96, md: 256 } as const;
export type ThumbSize = keyof typeof THUMB_SIZES;

/**
 * Identifiant du fichier miniature d'un utilisateur, généré à la première demande puis conservé (chiffré comme tout fichier).
 * Une photo de 3 Mo n'est plus envoyée pour un avatar de 36 px : quelques Ko suffisent. Le recadrage est centré, la photo est
 * remise à l'endroit (EXIF) et ses métadonnées (position GPS, appareil) ne sont PAS recopiées dans la miniature.
 */
export async function ensureThumbnail(userId: Types.ObjectId | string, photoFileId: Types.ObjectId | string, size: ThumbSize): Promise<string> {
  const user = await User.findById(userId, { photoThumbs: 1 });
  const existing = user?.photoThumbs?.[size];
  if (existing) return String(existing);

  const original = await readDecrypted((await StoredFile.findById(photoFileId).select('+storageKey'))!.storageKey);
  const px = THUMB_SIZES[size];
  const data = await sharp(original, { limitInputPixels: 50_000_000 }).rotate().resize(px, px, { fit: 'cover', position: 'centre' }).webp({ quality: 80 }).toBuffer();
  const thumb = await StoredFile.create({
    ownerId: userId,
    category: 'photo',
    label: `Miniature ${px}`,
    originalName: `miniature-${px}.webp`,
    mime: 'image/webp',
    size: data.length,
    storageKey: await writeEncrypted(data),
    uploadedBy: userId,
  });

  // Deux demandes simultanées peuvent générer la même miniature : la première enregistrée gagne, l'autre est supprimée.
  const won = await User.updateOne({ _id: userId, photoFileId, [`photoThumbs.${size}`]: { $exists: false } }, { $set: { [`photoThumbs.${size}`]: thumb._id } });
  if (won.modifiedCount === 1) return String(thumb._id);
  await deleteStoredFile(thumb._id);
  const current = await User.findById(userId, { photoThumbs: 1 });
  const id = current?.photoThumbs?.[size];
  if (!id) throw new Error('Miniature indisponible'); // la photo a changé pendant la génération : le client réessaiera
  return String(id);
}

/** Supprime les miniatures d'un utilisateur (nouvelle photo, ou photo retirée). */
export async function clearThumbnails(user: { photoThumbs?: { sm?: Types.ObjectId | null; md?: Types.ObjectId | null } | null }) {
  for (const size of Object.keys(THUMB_SIZES) as ThumbSize[]) await deleteStoredFile(user.photoThumbs?.[size]);
}
