import { Schema, model } from 'mongoose';
import { applyJsonTransform } from './plugins.js';

export const DECISION = ['en attente', 'accepte', 'refuse'] as const;
export type Decision = (typeof DECISION)[number];

const schema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    raison: { type: String, required: true, trim: true, maxlength: 120 },
    dateDebut: { type: String, required: true },
    dateFin: { type: String, required: true },
    nombreJours: { type: Number, required: true }, // jours ouvrés
    description: { type: String, trim: true, maxlength: 2000 },
    statut: { type: String, enum: DECISION, default: 'en attente', index: true },
    statutManager: { type: String, enum: DECISION, default: 'en attente' },
    statutAdmin: { type: String, enum: DECISION, default: 'en attente' },
    motifRefus: { type: String, trim: true, maxlength: 1000 },
    attachmentFileId: { type: Schema.Types.ObjectId, ref: 'StoredFile' },
  },
  { timestamps: true },
);
schema.index({ userId: 1, dateDebut: 1, dateFin: 1 });
applyJsonTransform(schema);
export const LeaveRequest = model('LeaveRequest', schema);
