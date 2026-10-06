import { Schema, model } from 'mongoose';
import { applyJsonTransform, encryptedString } from './plugins.js';

export const MAIL_STATUSES = ['pending', 'sent', 'failed'] as const;

/**
 * File d'attente des e-mails (T-10) : un message est enregistré avant d'être envoyé, puis repris avec des délais croissants tant que
 * le serveur SMTP ne répond pas. Un e-mail d'activation ne se perd donc plus pendant une panne.
 * Le corps peut contenir un lien d'activation : il est chiffré au repos et effacé dès l'envoi réussi.
 */
const schema = new Schema(
  {
    to: { type: String, required: true, maxlength: 254 },
    subject: { type: String, required: true, maxlength: 300 },
    text: encryptedString,
    status: { type: String, enum: MAIL_STATUSES, default: 'pending' },
    attempts: { type: Number, default: 0 },
    /** Prochain essai (et « bail » : pendant l'envoi, repoussé pour qu'un second processus ne reprenne pas le même message). */
    nextAttemptAt: { type: Date, default: () => new Date() },
    lastError: { type: String, maxlength: 500 },
    sentAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
applyJsonTransform(schema, ['text']); // le corps ne sort jamais de l'API
schema.index({ status: 1, nextAttemptAt: 1 }); // messages à envoyer maintenant
schema.index({ status: 1, createdAt: -1 }); // page « envois en échec »
// Les messages envoyés ne sont gardés que 7 jours (diagnostic), puis supprimés.
schema.index({ sentAt: 1 }, { expireAfterSeconds: 7 * 24 * 3600 });
export const MailJob = model('MailJob', schema);
