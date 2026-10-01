import { Schema, model } from 'mongoose';
import { applyJsonTransform } from './plugins.js';

const schema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: String, required: true, index: true }, // AAAA-MM-JJ
  },
  { timestamps: true },
);
schema.index({ userId: 1, date: 1 }, { unique: true });
applyJsonTransform(schema);
export const Telework = model('Telework', schema);
