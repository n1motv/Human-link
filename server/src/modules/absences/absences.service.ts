import { LeaveRequest } from '../../models/LeaveRequest.js';
import { SickLeave } from '../../models/SickLeave.js';
import { Telework } from '../../models/Telework.js';

type Kind = 'conge' | 'arret' | 'teletravail';

/** Les identifiants arrivent en chaînes depuis l'API ; Mongoose les convertit, le typage strict de QueryFilter non. */
const q = (filter: Record<string, unknown>) => filter as never;

/** Un chevauchement avec une demande refusée ne bloque pas : seules les demandes vivantes comptent. */
const alive = { statut: { $ne: 'refuse' } };
const accepted = { statut: 'accepte' };
const range = (s: string, e: string) => ({ dateDebut: { $lte: e }, dateFin: { $gte: s } });

/**
 * Règles de non-chevauchement (reprises de l'ancienne version, corrigées) :
 * - congé : ni autre congé, ni arrêt maladie ;
 * - arrêt : ni autre arrêt, ni congé ;
 * - télétravail : ni congé accepté, ni arrêt accepté.
 * Retourne le code du conflit, ou null.
 */
export async function findConflict(userId: string, start: string, end: string, kind: Kind, excludeId?: string): Promise<string | null> {
  const notSelf = excludeId ? { _id: { $ne: excludeId } } : {};
  if (kind === 'conge') {
    if (await LeaveRequest.exists(q({ userId, ...alive, ...range(start, end), ...notSelf }))) return 'OVERLAP_LEAVE';
    if (await SickLeave.exists(q({ userId, ...alive, ...range(start, end) }))) return 'OVERLAP_SICK';
  } else if (kind === 'arret') {
    if (await SickLeave.exists(q({ userId, ...alive, ...range(start, end), ...notSelf }))) return 'OVERLAP_SICK';
    if (await LeaveRequest.exists(q({ userId, ...alive, ...range(start, end) }))) return 'OVERLAP_LEAVE';
  } else {
    if (await LeaveRequest.exists(q({ userId, ...accepted, ...range(start, end) }))) return 'OVERLAP_LEAVE';
    if (await SickLeave.exists(q({ userId, ...accepted, ...range(start, end) }))) return 'OVERLAP_SICK';
  }
  return null;
}

export const CONFLICT_MESSAGES: Record<string, string> = {
  OVERLAP_LEAVE: 'Cette période chevauche un congé existant',
  OVERLAP_SICK: 'Cette période chevauche un arrêt maladie existant',
};

/** Quand une absence est acceptée, le télétravail prévu sur la période n'a plus lieu d'être. */
export async function clearTelework(userId: string, start: string, end: string): Promise<void> {
  await Telework.deleteMany({ userId, date: { $gte: start, $lte: end } });
}
