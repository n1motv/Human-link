import { Schema, model } from 'mongoose';
import { applyJsonTransform } from './plugins.js';

/** Relation manager -> personne supervisée. Un supervisé n'a qu'un seul manager. */
const schema = new Schema(
  {
    managerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    superviseId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  },
  { timestamps: true },
);
applyJsonTransform(schema);
export const Supervision = model('Supervision', schema);
