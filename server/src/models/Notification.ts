import { Schema, model } from 'mongoose';
import { applyJsonTransform } from './plugins.js';

const schema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, required: true, maxlength: 40 },
    key: { type: String, maxlength: 60 }, // clé de traduction côté front
    params: { type: Schema.Types.Mixed },
    message: { type: String, required: true, maxlength: 1000 }, // texte français de repli
    isRead: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
schema.index({ userId: 1, createdAt: -1 });
applyJsonTransform(schema);
export const Notification = model('Notification', schema);
