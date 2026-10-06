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
import { withTransaction } from '../../utils/transaction.js';
import { randomToken } from '../../utils/crypto.js';

/**
 * Effacement irréversible des données personnelles d'un compte archivé.
 * On conserve uniquement une coquille anonyme (pour l'intégrité des statistiques agrégées).
 */
export async function anonymizeUser(user: UserDoc): Promise<void> {
  const id = user._id;

  const files = await StoredFile.find({ ownerId: id }).select('+storageKey');
  const storageKeys = files.map((f) => f.storageKey);

  // Toutes les écritures en base sont validées ensemble : un compte n'est jamais « à moitié » anonymisé (nom effacé mais fichiers
  // ou notifications restants). Les fichiers du disque ne sont supprimés qu'après, une fois la base validée.
  await withTransaction(async (session) => {
    await StoredFile.deleteMany({ ownerId: id }, { session });
    await Promise.all([
      Notification.deleteMany({ userId: id }, { session }),
      Telework.deleteMany({ userId: id }, { session }),
      ContactRequest.deleteMany({ userId: id }, { session }),
      RefreshToken.deleteMany({ userId: id }, { session }),
      Supervision.deleteMany({ $or: [{ managerId: id }, { superviseId: id }] }, { session }),
      // Les motifs/justificatifs peuvent contenir des données de santé : on les vide mais on garde les dates (statistiques).
      SickLeave.updateMany({ userId: id }, { $unset: { description: 1, attachmentFileId: 1 } }, { session }),
      LeaveRequest.updateMany({ userId: id }, { $unset: { description: 1, attachmentFileId: 1, motifRefus: 1 } }, { session }),
      BonusRequest.updateMany({ $or: [{ employeId: id }, { managerId: id }] }, { $unset: { motif: 1, motifRefus: 1 } }, { session }),
      Meeting.updateMany({ 'invitees.userId': id }, { $pull: { invitees: { userId: id } } }, { session }),
    ]);
    user.set({
      nom: 'Ancien',
      prenom: 'Employé',
      email: `anonyme-${randomToken(8).toLowerCase()}@anonymized.invalid`,
      status: 'anonymized',
      anonymizedAt: new Date(),
      isDirector: false,
      tokenVersion: user.tokenVersion + 1,
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
      photoThumbs: undefined,
      twoFactor: { enabled: false, recoveryCodes: [] },
    });
    user.passwordHash = undefined;
    await user.save({ session });
  });

  for (const key of storageKeys) await removeFile(key);
}
