import { Schema, model } from 'mongoose';

/**
 * Jeton de rafraîchissement rotatif. Chaque utilisation émet un nouveau jeton de la même `family`.
 * Si un jeton déjà utilisé est présenté à nouveau (vol probable), toute la famille est révoquée.
 */
const schema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    family: { type: String, required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true, index: { expires: 0 } }, // TTL : supprimé à l'expiration
    usedAt: { type: Date },
    revokedAt: { type: Date },
    ipHash: { type: String },
    userAgent: { type: String, maxlength: 300 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
export const RefreshToken = model('RefreshToken', schema);
