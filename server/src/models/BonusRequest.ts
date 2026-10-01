import { Schema, model } from 'mongoose';
import { DECISION } from './LeaveRequest.js';
import { applyJsonTransform } from './plugins.js';

const schema = new Schema(
  {
    managerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    employeId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    montant: { type: Number, required: true, min: 0.01, max: 1_000_000 },
    motif: { type: String, required: true, trim: true, maxlength: 1000 },
    statut: { type: String, enum: DECISION, default: 'en attente' },
    motifRefus: { type: String, trim: true, maxlength: 1000 },
  },
  { timestamps: true },
);
applyJsonTransform(schema);
export const BonusRequest = model('BonusRequest', schema);
