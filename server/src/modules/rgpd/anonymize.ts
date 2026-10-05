import { BonusRequest } from '../../models/BonusRequest.js';
import { ContactRequest } from '../../models/ContactRequest.js';
import { LeaveRequest } from '../../models/LeaveRequest.js';
import { Meeting } from '../../models/Meeting.js';
import { Notification } from '../../models/Notification.js';
import { RefreshToken } from '../../models/RefreshToken.js';
import { SickLeave } from '../../models/SickLeave.js';
import { StoredFile } from '../../models/StoredFile.js';
import { Supervision } from '../../models/Supervision.js';
import { Telework } from '../../models/Telework.js';
import type { UserDoc } from '../../models/User.js';
import { removeFile } from '../../utils/storage.js';
import { randomToken } from '../../utils/crypto.js';

/**
 * Effacement irréversible des données personnelles d'un compte archivé.
 * On conserve uniquement une coquille anonyme (pour l'intégrité des statistiques agrégées).
 */
export async function anonymizeUser(user: UserDoc): Promise<void> {
  const id = user._id;

  const files = await StoredFile.find({ ownerId: id }).select('+storageKey');
  for (const f of files) await removeFile(f.storageKey);
  await StoredFile.deleteMany({ ownerId: id });

  await Promise.all([
    Notification.deleteMany({ userId: id }),
    Telework.deleteMany({ userId: id }),
    ContactRequest.deleteMany({ userId: id }),
    RefreshToken.deleteMany({ userId: id }),
    Supervision.deleteMany({ $or: [{ managerId: id }, { superviseId: id }] }),
    // Les motifs/justificatifs peuvent contenir des données de santé : on les vide mais on garde les dates (statistiques).
    SickLeave.updateMany({ userId: id }, { $unset: { description: 1, attachmentFileId: 1 } }),
    LeaveRequest.updateMany({ userId: id }, { $unset: { description: 1, attachmentFileId: 1, motifRefus: 1 } }),
    BonusRequest.updateMany({ $or: [{ employeId: id }, { managerId: id }] }, { $unset: { motif: 1, motifRefus: 1 } }),
    Meeting.updateMany({ 'invitees.userId': id }, { $pull: { invitees: { userId: id } } }),
  ]);

  user.set({
    nom: 'Ancien',
    prenom: 'Employé',
    email: `anonyme-${randomToken(8).toLowerCase()}@anonymized.invalid`,
    status: 'anonymized',
    anonymizedAt: new Date(),
    isDirector: false,
    tokenVersion: user.tokenVersion + 1,
  });
  user.set({
    poste: undefined,
    sexe: undefined,
    dateNaissance: undefined,
    nationalite: undefined,
    pays: undefined,
    ville: undefined,
    codePostal: undefined,
    telephone: undefined,
    adresse: undefined,
    numeroSecu: undefined,
    salaire: undefined,
    photoFileId: undefined,
    twoFactor: { enabled: false, recoveryCodes: [] },
  });
  user.passwordHash = undefined;
  await user.save();
}
