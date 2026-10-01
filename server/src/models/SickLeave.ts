import { Schema, model } from 'mongoose';
import { DECISION } from './LeaveRequest.js';
import { applyJsonTransform } from './plugins.js';

const schema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    typeMaladie: { type: String, enum: ['justifie', 'non justifie'], required: true },
    dateDebut: { type: String, required: true },
    dateFin: { type: String, required: true },
    description: { type: String, trim: true, maxlength: 2000 },
    statut: { type: String, enum: DECISION, default: 'en attente', index: true },
    motifRefus: { type: String, trim: true, maxlength: 1000 },
    attachmentFileId: { type: Schema.Types.ObjectId, ref: 'StoredFile' },
  },
  { timestamps: true },
);
applyJsonTransform(schema);
export const SickLeave = model('SickLeave', schema);
