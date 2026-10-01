import { Schema, model } from 'mongoose';
import { applyJsonTransform } from './plugins.js';

export const FEEDBACK_CRITERIA = [
  'env', 'management', 'worklife', 'comm', 'recognition',
  'training', 'equipment', 'team', 'meetings', 'transparency',
] as const;

const ratings = Object.fromEntries(
  FEEDBACK_CRITERIA.map((k) => [k, { type: Number, required: true, min: 1, max: 5 }]),
);

/**
 * Feedback ANONYME : aucun lien vers l'utilisateur. `participant` est un pseudonyme HMAC
 * (utilisateur + mois) qui ne sert qu'à empêcher un second envoi le même mois.
 */
const schema = new Schema(
  {
    month: { type: String, required: true, index: true }, // AAAA-MM
    participant: { type: String, required: true },
    ratings,
    suggestion: { type: String, trim: true, maxlength: 2000, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
schema.index({ month: 1, participant: 1 }, { unique: true });
applyJsonTransform(schema, ['participant']);
export const Feedback = model('Feedback', schema);
