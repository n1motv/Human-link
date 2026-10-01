import { Schema } from 'mongoose';
import { decryptField, encryptField, isEncrypted } from '../utils/crypto.js';

/** Champ texte chiffré au repos (AES-256-GCM). Non requêtable : ne pas filtrer ni trier dessus. */
export const encryptedString = {
  type: String,
  set: (v: unknown) => {
    if (v === undefined || v === null || v === '') return v;
    const s = String(v);
    return isEncrypted(s) ? s : encryptField(s);
  },
  get: (v: unknown) => {
    if (typeof v !== 'string' || v === '') return v;
    try {
      return decryptField(v);
    } catch {
      return undefined; // clé incorrecte ou donnée altérée : on n'expose rien
    }
  },
};

/** Champ numérique chiffré (ex. salaire) : stocké en texte chiffré, lu en nombre. */
export const encryptedNumber = {
  type: Schema.Types.Mixed, // ciphertext (string) en base, nombre en lecture
  set: (v: unknown) => {
    if (v === undefined || v === null || v === '') return v;
    return encryptField(String(Number(v)));
  },
  get: (v: unknown) => {
    if (typeof v !== 'string' || v === '') return v;
    try {
      const n = Number(decryptField(v));
      return Number.isFinite(n) ? n : undefined;
    } catch {
      return undefined;
    }
  },
};

/** Sérialisation JSON uniforme : id string, pas de _id/__v, getters actifs (déchiffrement). */
export function applyJsonTransform(schema: Schema, hidden: string[] = []) {
  const transform = (_doc: unknown, ret: Record<string, unknown>) => {
    ret.id = String(ret._id);
    delete ret._id;
    delete ret.__v;
    for (const h of hidden) delete ret[h];
    return ret;
  };
  schema.set('toJSON', { getters: true, virtuals: false, transform });
  schema.set('toObject', { getters: true, virtuals: false, transform });
}
