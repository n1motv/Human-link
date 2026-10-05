import crypto from 'node:crypto';
import { env } from '../config/env.js';

const PSEUDO_KEY = Buffer.from(env.PSEUDONYM_KEY, 'hex');

/**
 * Clés versionnées. L'identifiant d'une clé (kid) est calculé depuis la clé elle-même (8 premiers caractères de son
 * SHA-256) : rien à configurer, et chaque valeur chiffrée dit avec quelle clé elle l'a été. Pour changer de clé :
 * nouvelle clé dans *_ENCRYPTION_KEY, l'ancienne dans *_ENCRYPTION_KEYS_OLD, redémarrer (aucun arrêt de service),
 * puis `npm run rotate-keys` pour tout rechiffrer ; l'ancienne clé peut ensuite être retirée.
 */
export interface KeyRing {
  current: { kid: string; key: Buffer };
  all: Map<string, Buffer>;
}

const kidOf = (key: Buffer) => crypto.createHash('sha256').update(key).digest('hex').slice(0, 8);

export function buildKeyRing(current: string, old?: string): KeyRing {
  const cur = Buffer.from(current, 'hex');
  const all = new Map<string, Buffer>([[kidOf(cur), cur]]);
  for (const hex of (old ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)) {
    const k = Buffer.from(hex, 'hex');
    all.set(kidOf(k), k);
  }
  return { current: { kid: kidOf(cur), key: cur }, all };
}

const FIELD = buildKeyRing(env.FIELD_ENCRYPTION_KEY, env.FIELD_ENCRYPTION_KEYS_OLD);
const FILE = buildKeyRing(env.FILE_ENCRYPTION_KEY, env.FILE_ENCRYPTION_KEYS_OLD);

export const currentFieldKid = FIELD.current.kid;
export const currentFileKid = FILE.current.kid;

const V1 = 'enc:v1:'; // historique : sans identifiant de clé
const V2 = 'enc:v2:'; // enc:v2:<kid>:<iv>.<tag>.<cipher>

/** Chiffre un texte (AES-256-GCM). Format : enc:v2:<kid>:<iv>.<tag>.<cipher> en base64url. */
export function encryptField(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', FIELD.current.key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${V2}${FIELD.current.kid}:` + [iv, tag, enc].map((b) => b.toString('base64url')).join('.');
}

export function isEncrypted(value: unknown): value is string {
  return typeof value === 'string' && (value.startsWith(V2) || value.startsWith(V1));
}

function decryptWith(key: Buffer, iv: Buffer, tag: Buffer, enc: Buffer): string {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

export function decryptField(value: string): string {
  if (!isEncrypted(value)) return value; // valeur historique non chiffrée
  const v2 = value.startsWith(V2);
  const body = value.slice(v2 ? V2.length : V1.length);
  let kid: string | undefined;
  let payload = body;
  if (v2) {
    const i = body.indexOf(':');
    kid = body.slice(0, i);
    payload = body.slice(i + 1);
  }
  const [iv, tag, enc] = payload.split('.').map((p) => Buffer.from(p ?? '', 'base64url'));
  if (!iv || !tag || !enc) throw new Error('Valeur chiffrée invalide');
  if (kid) {
    const key = FIELD.all.get(kid);
    if (!key) throw new Error(`Clé de chiffrement inconnue (${kid}) : ajoutez-la à FIELD_ENCRYPTION_KEYS_OLD`);
    return decryptWith(key, iv, tag, enc);
  }
  // v1 : aucun identifiant, on essaie la clé courante puis les anciennes.
  let last: unknown;
  for (const key of FIELD.all.values()) {
    try {
      return decryptWith(key, iv, tag, enc);
    } catch (e) {
      last = e;
    }
  }
  throw last;
}

/** Vrai si la valeur n'est pas chiffrée avec la clé courante (v1 ou ancienne clé) : à rechiffrer. */
export function fieldNeedsRotation(value: unknown): boolean {
  return isEncrypted(value) && !value.startsWith(`${V2}${FIELD.current.kid}:`);
}

/** Fichiers : [magic "HLF2"][kid(4 octets)][iv(12)][tag(16)][données]. Ancien format : [iv(12)][tag(16)][données]. */
const MAGIC = Buffer.from('HLF2');

export function encryptBuffer(data: Buffer): Buffer {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', FILE.current.key, iv);
  const enc = Buffer.concat([cipher.update(data), cipher.final()]);
  return Buffer.concat([MAGIC, Buffer.from(FILE.current.kid, 'hex'), iv, cipher.getAuthTag(), enc]);
}

function decryptBufferWith(key: Buffer, blob: Buffer): Buffer {
  const iv = blob.subarray(0, 12);
  const tag = blob.subarray(12, 28);
  const data = blob.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

export function decryptBuffer(blob: Buffer): Buffer {
  if (blob.subarray(0, 4).equals(MAGIC)) {
    const key = FILE.all.get(blob.subarray(4, 8).toString('hex'));
    if (!key) throw new Error('Clé de chiffrement des fichiers inconnue : ajoutez-la à FILE_ENCRYPTION_KEYS_OLD');
    return decryptBufferWith(key, blob.subarray(8));
  }
  let last: unknown;
  for (const key of FILE.all.values()) {
    try {
      return decryptBufferWith(key, blob);
    } catch (e) {
      last = e;
    }
  }
  throw last;
}

export function bufferNeedsRotation(blob: Buffer): boolean {
  return !(blob.subarray(0, 4).equals(MAGIC) && blob.subarray(4, 8).toString('hex') === FILE.current.kid);
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
