import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileTypeFromBuffer } from 'file-type';
import { env } from '../config/env.js';
import { decryptBuffer, encryptBuffer } from './crypto.js';
import { badRequest } from './errors.js';

const ROOT = path.resolve(env.STORAGE_DIR);

export const MIME_GROUPS = {
  image: ['image/jpeg', 'image/png', 'image/webp'],
  pdf: ['application/pdf'],
  attachment: ['application/pdf', 'image/jpeg', 'image/png'],
} as const;

export const MAX_FILE_BYTES = 10 * 1024 * 1024;

/**
 * Détecte le vrai type du fichier par ses « magic bytes » (l'extension et le Content-Type
 * envoyés par le navigateur sont falsifiables) et refuse tout ce qui n'est pas autorisé.
 */
export async function sniffMime(buffer: Buffer, allowed: readonly string[]): Promise<string> {
  const ft = await fileTypeFromBuffer(buffer);
  if (!ft || !allowed.includes(ft.mime)) {
    throw badRequest(`Type de fichier non autorisé (autorisés : ${allowed.map((m) => m.split('/')[1]).join(', ')})`, 'BAD_FILE_TYPE');
  }
  return ft.mime;
}

/** Écrit un fichier chiffré (AES-256-GCM) sous un nom aléatoire, hors de tout dossier public. */
export async function writeEncrypted(buffer: Buffer): Promise<string> {
  const now = new Date();
  const key = path.posix.join(String(now.getUTCFullYear()), String(now.getUTCMonth() + 1).padStart(2, '0'), `${randomUUID()}.bin`);
  const full = resolveKey(key);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, encryptBuffer(buffer), { mode: 0o600 });
  return key;
}

export async function readDecrypted(key: string): Promise<Buffer> {
  return decryptBuffer(await fs.readFile(resolveKey(key)));
}

/** Contenu chiffré tel que stocké (sans le déchiffrer) : sert à la rotation des clés. */
export async function readRaw(key: string): Promise<Buffer> {
  return fs.readFile(resolveKey(key));
}

/** Remplace le contenu d'un fichier de façon atomique (fichier temporaire puis renommage) : jamais de fichier à moitié écrit. */
export async function replaceRaw(key: string, blob: Buffer): Promise<void> {
  const full = resolveKey(key);
  const tmp = `${full}.${randomUUID()}.tmp`;
  await fs.writeFile(tmp, blob, { mode: 0o600 });
  await fs.rename(tmp, full);
}

export async function removeFile(key: string): Promise<void> {
  await fs.rm(resolveKey(key), { force: true });
}

/** Empêche toute sortie du dossier de stockage (path traversal). */
function resolveKey(key: string): string {
  const full = path.resolve(ROOT, key);
  if (!full.startsWith(ROOT + path.sep)) throw new Error('Chemin de stockage invalide');
  return full;
}
