import { Schema, model } from 'mongoose';
import { applyJsonTransform } from './plugins.js';

/** Journal d'audit RGPD : qui a fait quoi, sur quelle donnée, quand. Purgé par la tâche de rétention. */
const schema = new Schema(
  {
    actorId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    actorEmail: { type: String },
    action: { type: String, required: true, index: true },
    targetType: { type: String },
    targetId: { type: String, index: true },
    ipHash: { type: String },
    userAgent: { type: String, maxlength: 300 },
    meta: { type: Schema.Types.Mixed },
    at: { type: Date, default: () => new Date(), index: true },
  },
  { timestamps: false },
);
applyJsonTransform(schema);
export const AuditLog = model('AuditLog', schema);
