import { strToU8, zipSync } from 'fflate';
import { AuditLog } from '../../models/AuditLog.js';
import { BonusRequest } from '../../models/BonusRequest.js';
import { ContactRequest } from '../../models/ContactRequest.js';
import { LeaveRequest } from '../../models/LeaveRequest.js';
import { Meeting } from '../../models/Meeting.js';
import { Notification } from '../../models/Notification.js';
import { SickLeave } from '../../models/SickLeave.js';
import { StoredFile } from '../../models/StoredFile.js';
import { Supervision } from '../../models/Supervision.js';
import { Telework } from '../../models/Telework.js';
import { User, toPublicUser } from '../../models/User.js';
import { notFound } from '../../utils/errors.js';
import { readDecrypted } from '../../utils/storage.js';

/** Toutes les données personnelles d'une personne, en JSON : export de la personne elle-même (art. 15 et 20) et dossier de l'administrateur. */
export async function buildUserData(userId: string) {
  const user = await User.findById(userId);
  if (!user) throw notFound();
  const [leaves, sicks, bonuses, telework, meetings, notifications, files, contacts, supervision, history] = await Promise.all([
    LeaveRequest.find({ userId }),
    SickLeave.find({ userId }),
    BonusRequest.find({ employeId: userId }),
    Telework.find({ userId }),
    Meeting.find({ $or: [{ createdBy: userId }, { 'invitees.userId': userId }] }, 'title dateTime status'),
    Notification.find({ userId }),
    StoredFile.find({ ownerId: userId }),
    ContactRequest.find({ userId }),
    Supervision.findOne({ superviseId: userId }),
    AuditLog.find({ actorId: userId }).sort({ at: -1 }).limit(1000),
  ]);
  return {
    status: user.status,
    payload: {
      exportedAt: new Date().toISOString(),
      profile: toPublicUser(user),
      managerId: supervision ? String(supervision.managerId) : null,
      leaves,
      sickLeaves: sicks,
      bonuses,
      telework: telework.map((t) => t.date),
      meetings,
      notifications,
      documents: files,
      contactRequests: contacts,
      activityLog: history,
      note: 'Les retours de feedback mensuel sont anonymes et ne peuvent pas être rattachés à ce compte.',
    },
  };
}

const safe = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w.\- ()]/g, '_')
    .slice(0, 80)
    .trim() || 'fichier';

const EXT: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/**
 * Dossier complet d'une personne pour une demande d'accès reçue par courrier : une archive ZIP avec toutes ses données (donnees.json),
 * ses documents déchiffrés (coffre-fort, justificatifs, photo) et une page d'explications. Les miniatures, simples copies réduites de la
 * photo, n'y figurent pas.
 */
export async function buildDossierZip(userId: string): Promise<{ zip: Uint8Array; name: string; files: number }> {
  const { payload, status } = await buildUserData(userId);
  if (status === 'anonymized') throw notFound('Ce compte est anonymisé : il ne reste aucune donnée personnelle à exporter');

  const entries: Record<string, Uint8Array> = {};
  entries['donnees.json'] = strToU8(JSON.stringify(payload, null, 2));

  const files = await StoredFile.find({ ownerId: userId, label: { $not: /^Miniature / } }).select('+storageKey');
  const used = new Set<string>();
  for (const f of files) {
    const base = safe(f.label || f.originalName || 'document').replace(/\.[a-z0-9]+$/i, '');
    let path = `documents/${f.category}/${base}.${EXT[f.mime] ?? 'bin'}`;
    for (let n = 2; used.has(path); n++) path = `documents/${f.category}/${base} (${n}).${EXT[f.mime] ?? 'bin'}`;
    used.add(path);
    entries[path] = new Uint8Array(await readDecrypted(f.storageKey));
  }
  const user = payload.profile as { prenom?: string; nom?: string; matricule?: string };
  entries['LISEZ-MOI.txt'] = strToU8(
    [
      `Dossier de ${user.prenom ?? ''} ${user.nom ?? ''} (matricule ${user.matricule ?? '—'})`,
      `Généré le ${new Date().toLocaleString('fr-FR')}.`,
      '',
      'donnees.json : toutes les données personnelles enregistrées (profil, congés, arrêts, primes, télétravail, réunions, notifications, messages, historique d’activité).',
      `documents/ : ${files.length} fichier(s) déchiffré(s) (bulletins, contrats, justificatifs, photo).`,
      '',
      'Cette archive contient des données personnelles, dont éventuellement des données de santé : à transmettre uniquement à la personne concernée, par un moyen sécurisé.',
    ].join('\r\n'),
  );
  return { zip: zipSync(entries, { level: 6 }), name: safe(`dossier-${user.nom ?? 'employe'}-${user.matricule ?? userId}`), files: files.length };
}
