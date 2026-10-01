import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { applyJsonTransform, encryptedNumber, encryptedString } from './plugins.js';

export const ROLES = ['admin', 'manager', 'employe'] as const;
export type Role = (typeof ROLES)[number];
export const CONTRACTS = ['CDI', 'CDD', 'Alternance', 'Stage', 'Freelance'] as const;

const userSchema = new Schema(
  {
    matricule: { type: String, required: true, unique: true, index: true },
    nom: { type: String, required: true, trim: true, maxlength: 80 },
    prenom: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    passwordHash: { type: String, select: false },
    role: { type: String, enum: ROLES, default: 'employe', index: true },
    isDirector: { type: Boolean, default: false },
    status: { type: String, enum: ['invited', 'active', 'archived', 'anonymized'], default: 'invited', index: true },

    poste: { type: String, trim: true, maxlength: 120 },
    departement: { type: String, trim: true, maxlength: 120, index: true },
    sexe: { type: String, enum: ['Homme', 'Femme'] },
    dateNaissance: { type: String }, // AAAA-MM-JJ
    nationalite: { type: String, trim: true, maxlength: 80 },
    pays: { type: String, trim: true, maxlength: 80 },
    ville: { type: String, trim: true, maxlength: 120 },
    codePostal: { type: String, trim: true, maxlength: 20 },
    dateEmbauche: { type: String },
    typeContrat: { type: String, enum: CONTRACTS },

    // Données personnelles sensibles : chiffrées en base.
    telephone: encryptedString,
    adresse: encryptedString,
    numeroSecu: encryptedString,
    salaire: encryptedNumber,

    soldeConge: { type: Number, default: 0 },
    dernierMoisMaj: { type: String },
    teleworkMax: { type: Number, default: 0, min: 0, max: 5 },

    photoFileId: { type: Schema.Types.ObjectId, ref: 'StoredFile' },

    // Sécurité du compte
    failedAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date },
    lastLoginAt: { type: Date },
    passwordChangedAt: { type: Date },
    tokenVersion: { type: Number, default: 0 }, // incrémenter = révoquer toutes les sessions
    twoFactor: {
      enabled: { type: Boolean, default: false },
      secret: encryptedString, // secret TOTP chiffré
      pendingSecret: encryptedString,
      recoveryCodes: { type: [String], default: [] }, // hachés
    },
    inviteTokenHash: { type: String, select: false },
    inviteExpiresAt: { type: Date, select: false },
    resetTokenHash: { type: String, select: false },
    resetExpiresAt: { type: Date, select: false },

    anonymizedAt: { type: Date },
  },
  { timestamps: true },
);

applyJsonTransform(userSchema, [
  'passwordHash',
  'inviteTokenHash',
  'inviteExpiresAt',
  'resetTokenHash',
  'resetExpiresAt',
  'failedAttempts',
  'lockUntil',
  'tokenVersion',
]);

export type UserAttrs = InferSchemaType<typeof userSchema>;
export type UserDoc = HydratedDocument<UserAttrs>;
export const User = model('User', userSchema);

/** Vue sérialisable d'un utilisateur : sans secrets 2FA ni données d'authentification. */
export function toPublicUser(u: UserDoc) {
  const j = u.toJSON() as Record<string, unknown>;
  const tf = (j.twoFactor ?? {}) as { enabled?: boolean };
  j.twoFactor = { enabled: !!tf.enabled };
  return j;
}
