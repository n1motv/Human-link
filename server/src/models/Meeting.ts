import { Schema, model } from 'mongoose';
import { applyJsonTransform } from './plugins.js';

const schema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 160 },
    dateTime: { type: Date, required: true, index: true },
    status: { type: String, enum: ['Scheduled', 'Cancelled'], default: 'Scheduled' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    invitees: [
      {
        _id: false,
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        status: { type: String, enum: ['en attente', 'Accepted', 'Rejected'], default: 'en attente' },
      },
    ],
  },
  { timestamps: true },
);
schema.index({ 'invitees.userId': 1 });
applyJsonTransform(schema);
export const Meeting = model('Meeting', schema);
