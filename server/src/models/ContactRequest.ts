import { Schema, model } from 'mongoose';
import { applyJsonTransform, encryptedString } from './plugins.js';

const schema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    nom: { type: String, trim: true, maxlength: 80 },
    prenom: { type: String, trim: true, maxlength: 80 },
    email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
    telephone: encryptedString,
    sujet: { type: String, required: true, trim: true, maxlength: 160 },
    message: { type: String, required: true, trim: true, maxlength: 4000 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
schema.index({ createdAt: -1 });
applyJsonTransform(schema);
export const ContactRequest = model('ContactRequest', schema);
