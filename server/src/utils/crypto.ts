import crypto from 'node:crypto';
import { env } from '../config/env.js';

const FIELD_KEY = Buffer.from(env.FIELD_ENCRYPTION_KEY, 'hex');
const FILE_KEY = Buffer.from(env.FILE_ENCRYPTION_KEY, 'hex');
const PSEUDO_KEY = Buffer.from(env.PSEUDONYM_KEY, 'hex');

const PREFIX = 'enc:v1:';

/** Chiffre un texte (AES-256-GCM). Format : enc:v1:<iv>.<tag>.<cipher> en base64url. */
export function encryptField(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', FIELD_KEY, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + [iv, tag, enc].map((b) => b.toString('base64url')).join('.');
}

export function isEncrypted(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

export function decryptField(value: string): string {
  if (!isEncrypted(value)) return value; // valeur historique non chiffrée
  const [iv, tag, enc] = value.slice(PREFIX.length).split('.').map((p) => Buffer.from(p ?? '', 'base64url'));
  if (!iv || !tag || !enc) throw new Error('Valeur chiffrée invalide');
  const decipher = crypto.createDecipheriv('aes-256-gcm', FIELD_KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

/** Chiffrement d'un fichier en mémoire : [iv(12)][tag(16)][données]. */
export function encryptBuffer(data: Buffer): Buffer {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', FILE_KEY, iv);
  const enc = Buffer.concat([cipher.update(data), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]);
}

export function decryptBuffer(blob: Buffer): Buffer {
  const iv = blob.subarray(0, 12);
  const tag = blob.subarray(12, 28);
  const data = blob.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', FILE_KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

/** Jeton aléatoire opaque (reset, invitation, refresh). */
export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

/** On ne stocke jamais un jeton en clair : seulement son empreinte SHA-256. */
export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/** Pseudonymisation déterministe (HMAC) : permet de dédupliquer sans pouvoir remonter à la personne. */
export function pseudonymize(value: string): string {
  return crypto.createHmac('sha256', PSEUDO_KEY).update(value).digest('hex').slice(0, 32);
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/** Mot de passe aléatoire fort (utilisé seulement pour les comptes créés sans mot de passe). */
export function randomPassword(): string {
  return randomToken(24) + 'aA1!';
}
