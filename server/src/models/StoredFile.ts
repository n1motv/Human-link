import { Schema, model } from 'mongoose';
import { applyJsonTransform } from './plugins.js';

/**
 * Métadonnées d'un fichier stocké chiffré sur disque (hors du dossier public).
 * `ownerId` = personne concernée ; l'accès est toujours contrôlé par l'API.
 */
const schema = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    category: { type: String, enum: ['photo', 'bulletin', 'contrat', 'autre', 'conge', 'arret'], required: true },
    label: { type: String, trim: true, maxlength: 200 },
    month: { type: Number, min: 1, max: 12 },
    year: { type: Number },
    originalName: { type: String, maxlength: 200 },
    mime: { type: String, required: true },
    size: { type: Number, required: true },
    storageKey: { type: String, required: true, select: false },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
applyJsonTransform(schema, ['storageKey']);
export const StoredFile = model('StoredFile', schema);
