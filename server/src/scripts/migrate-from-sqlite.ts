/**
 * Migration de l'ancienne version (Flask + SQLite chiffré Fernet) vers MongoDB.
 *
 *   npm run migrate:sqlite -- --db <chemin>/rh_data.db.enc --key <ancienne SECRET_KEY> [--files <dossier>] [--dry-run]
 *
 * - Les mots de passe Argon2 sont repris tels quels : les utilisateurs gardent leur mot de passe.
 * - Le feedback est ré-anonymisé (plus aucun lien avec l'utilisateur).
 * - Les notifications ne sont pas migrées (éphémères).
 * - Les fichiers S3 (photos, justificatifs) ne sont pas récupérés automatiquement. Avec --files <dossier>
 *   (copie locale du bucket : `aws s3 sync s3://bucket ./s3-copy`), les documents du coffre-fort
 *   (coffre_fort/<bulletins|contrats|autres>/<NomPrénom>/*.pdf) sont importés et chiffrés.
 * - Idempotent : relancer ne duplique pas les utilisateurs (clé = e-mail) ; les autres collections
 *   sont ignorées si l'utilisateur concerné existait déjà avant la migration.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import mongoose from 'mongoose';
import { clientConfig } from '../config/client.js';
import { env } from '../config/env.js';
import { BonusRequest } from '../models/BonusRequest.js';
import { ContactRequest } from '../models/ContactRequest.js';
import { Feedback, FEEDBACK_CRITERIA } from '../models/Feedback.js';
import { LeaveRequest } from '../models/LeaveRequest.js';
import { Meeting } from '../models/Meeting.js';
import { SickLeave } from '../models/SickLeave.js';
import { StoredFile } from '../models/StoredFile.js';
import { Supervision } from '../models/Supervision.js';
import { Telework } from '../models/Telework.js';
import { User } from '../models/User.js';
import { pseudonymize } from '../utils/crypto.js';
import { countWorkingDays } from '../utils/dates.js';
import { writeEncrypted } from '../utils/storage.js';

type Row = Record<string, unknown>;

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const flag = (name: string) => process.argv.includes(`--${name}`);

const dbPath = arg('db');
const fernetKey = arg('key');
const filesDir = arg('files');
const dryRun = flag('dry-run');
if (!dbPath || !fernetKey) {
  console.error('Usage : npm run migrate:sqlite -- --db <rh_data.db.enc|rh_data.db> --key <ancienne SECRET_KEY> [--files <dossier>] [--dry-run]');
  process.exit(1);
}

/** Déchiffrement Fernet (https://github.com/fernet/spec) : AES-128-CBC + HMAC-SHA256. */
function fernetDecrypt(keyB64: string, tokenBytes: Buffer): Buffer {
  const key = Buffer.from(keyB64, 'base64url');
  if (key.length !== 32) throw new Error('Clé Fernet invalide (32 octets attendus après décodage base64url)');
  const signingKey = key.subarray(0, 16);
  const encryptionKey = key.subarray(16);
  const token = Buffer.from(tokenBytes.toString('utf8').trim(), 'base64url');
  const mac = token.subarray(token.length - 32);
  const body = token.subarray(0, token.length - 32);
  const expected = crypto.createHmac('sha256', signingKey).update(body).digest();
  if (!crypto.timingSafeEqual(mac, expected)) throw new Error('Signature Fernet invalide : mauvaise clé ou fichier corrompu');
  const iv = body.subarray(9, 25);
  const decipher = crypto.createDecipheriv('aes-128-cbc', encryptionKey, iv);
  return Buffer.concat([decipher.update(body.subarray(25)), decipher.final()]);
}

function openLegacyDb(): { db: DatabaseSync; cleanup: () => void } {
  const raw = fs.readFileSync(dbPath!);
  const isPlain = raw.subarray(0, 15).toString('latin1') === 'SQLite format 3';
  if (isPlain) return { db: new DatabaseSync(dbPath!, { readOnly: true }), cleanup: () => undefined };
  // Copie déchiffrée temporaire (droits 600), supprimée dans tous les cas en fin de script.
  const tmp = path.join(os.tmpdir(), `humanlink-legacy-${process.pid}.db`);
  fs.writeFileSync(tmp, fernetDecrypt(fernetKey!, raw), { mode: 0o600 });
  const db = new DatabaseSync(tmp, { readOnly: true });
  return {
    db,
    cleanup: () => {
      try {
        db.close(); // Windows refuse de supprimer un fichier encore ouvert
        fs.rmSync(tmp, { force: true });
      } catch (err) {
        console.warn(`Impossible de supprimer ${tmp} : supprimez-le manuellement (il contient des données en clair).`, err);
      }
    },
  };
}

const str = (v: unknown): string | undefined => (v === null || v === undefined || String(v).trim() === '' ? undefined : String(v).trim());
const num = (v: unknown): number | undefined => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? undefined : Number(v));
const isoDate = (v: unknown): string | undefined => {
  const s = str(v);
  const m = s && /^(\d{4}-\d{2}-\d{2})/.exec(s);
  return m ? m[1] : undefined; // valeurs invalides de l'ancienne base (ex. « 30 ») ignorées
};
const decision = (v: unknown) => (v === 'accepte' || v === 'refuse' ? v : 'en attente');
const normName = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

const report: Record<string, number> = {};
const bump = (k: string, n = 1) => (report[k] = (report[k] ?? 0) + n);

const { db, cleanup } = openLegacyDb();
const all = (sql: string): Row[] => {
  try {
    return db.prepare(sql).all() as Row[];
  } catch {
    return []; // table absente dans cette version
  }
};

try {
  const users = all('SELECT * FROM utilisateurs');
  const teams = all('SELECT * FROM managers');
  const leaves = all('SELECT * FROM "demandes_congé"');
  const sicks = all('SELECT * FROM "demandes_arrêt"');
  const bonuses = all('SELECT * FROM demandes_prime');
  const meetings = all('SELECT * FROM "réunion"');
  const replies = all('SELECT * FROM "réponse_réunion"');
  const telework = all('SELECT * FROM teletravail');
  const contacts = all('SELECT * FROM demandes_contact');
  const feedbacks = all('SELECT * FROM feedback');

  console.log(`Base lue : ${users.length} utilisateurs, ${leaves.length} congés, ${sicks.length} arrêts, ${bonuses.length} primes, ${meetings.length} réunions, ${feedbacks.length} feedbacks.`);
  if (dryRun) {
    console.log('--dry-run : aucune écriture.');
    cleanup();
    process.exit(0);
  }

  await mongoose.connect(env.MONGODB_URI);
  const idMap = new Map<string, mongoose.Types.ObjectId>(); // ancien id (matricule) -> _id Mongo
  const emailMap = new Map<string, mongoose.Types.ObjectId>();
  const fresh = new Set<string>(); // ancien id des utilisateurs réellement créés par cette exécution
  const nameMap = new Map<string, mongoose.Types.ObjectId>();

  // ---------- Utilisateurs ----------
  for (const u of users) {
    const email = str(u.email)?.toLowerCase();
    const matricule = str(u.id);
    if (!email || !matricule || matricule === 'None') {
      bump('utilisateurs ignorés (sans id/e-mail)');
      continue;
    }
    const existing = await User.findOne({ email });
    const role = u.role === 'admin' || u.role === 'manager' ? u.role : 'employe';
    if (existing) {
      idMap.set(matricule, existing._id);
      emailMap.set(email, existing._id);
      bump('utilisateurs déjà présents');
      continue;
    }
    const doc = await User.create({
      matricule,
      nom: str(u.nom) ?? 'Inconnu',
      prenom: str(u.prenom) ?? 'Inconnu',
      email,
      passwordHash: str(u.mot_de_passe), // hash Argon2 conservé : même mot de passe qu'avant
      passwordChangedAt: new Date(),
      role,
      isDirector: Number(u.is_director) === 1,
      status: 'active',
      poste: str(u.poste),
      departement: str(u.departement),
      sexe: u.sexualite === 'Homme' || u.sexualite === 'Femme' ? u.sexualite : undefined,
      dateNaissance: isoDate(u.date_naissance),
      nationalite: str(u.nationalite),
      pays: str(u.pays),
      ville: str(u.ville),
      codePostal: str(u.code_postal),
      adresse: str(u.adresse),
      telephone: str(u.telephone),
      numeroSecu: str(u.numero_securite_sociale),
      salaire: num(u.salaire),
      dateEmbauche: isoDate(u.date_embauche),
      typeContrat: ['CDI', 'CDD', 'Alternance', 'Stage', 'Freelance'].includes(String(u.type_contrat)) ? u.type_contrat : undefined,
      soldeConge: num(u['solde_congé']) ?? 0,
      dernierMoisMaj: str(u.dernier_mois_maj),
      teleworkMax: Math.min(5, Math.max(0, num(u.teletravail_max) ?? 0)),
    } as never);
    idMap.set(matricule, doc._id);
    emailMap.set(email, doc._id);
    fresh.add(matricule);
    nameMap.set(normName(`${doc.nom}${doc.prenom}`), doc._id);
    bump('utilisateurs migrés');
  }
  const uid = (legacyId: unknown) => idMap.get(String(legacyId));
  const isFresh = (legacyId: unknown) => fresh.has(String(legacyId));

  // ---------- Hiérarchie ----------
  for (const t of teams) {
    const m = uid(t.id_manager);
    const s = uid(t.id_supervise);
    if (!m || !s || !isFresh(t.id_supervise)) continue;
    await Supervision.updateOne({ superviseId: s }, { managerId: m, superviseId: s }, { upsert: true });
    bump('supervisions');
  }

  // ---------- Congés ----------
  for (const l of leaves) {
    const userId = uid(l.id_utilisateurs);
    const start = isoDate(l.date_debut);
    const end = isoDate(l.date_fin);
    if (!userId || !isFresh(l.id_utilisateurs) || !start || !end) continue;
    await LeaveRequest.create({
      userId,
      raison: str(l.raison) ?? 'other',
      dateDebut: start,
      dateFin: end,
      nombreJours: countWorkingDays(start, end, clientConfig.hr.workingDays),
      description: str(l.description),
      statut: decision(l.statut),
      statutManager: decision(l.statut_manager),
      statutAdmin: decision(l.statut_admin),
      motifRefus: str(l.motif_refus),
    });
    bump('congés');
  }

  // ---------- Arrêts maladie (rattachés par e-mail dans l'ancienne base) ----------
  for (const a of sicks) {
    const userId = emailMap.get(String(a.employe_email).toLowerCase());
    const start = isoDate(a.date_debut);
    const end = isoDate(a.date_fin);
    const legacyId = [...idMap.entries()].find(([, v]) => v.equals(userId ?? new mongoose.Types.ObjectId()))?.[0];
    if (!userId || !start || !end || !legacyId || !isFresh(legacyId)) continue;
    await SickLeave.create({
      userId,
      typeMaladie: a.type_maladie === 'non justifie' ? 'non justifie' : 'justifie',
      dateDebut: start,
      dateFin: end,
      description: str(a.description),
      statut: decision(a.statut),
      motifRefus: str(a.motif_refus),
    });
    bump('arrêts maladie');
  }

  // ---------- Primes ----------
  for (const b of bonuses) {
    const manager = uid(b.id_manager);
    const employe = uid(b.id_employe);
    const montant = num(b.montant);
    if (!manager || !employe || !montant || montant <= 0 || !isFresh(b.id_employe)) continue;
    await BonusRequest.create({ managerId: manager, employeId: employe, montant, motif: str(b.motif) ?? '—', statut: decision(b.statut), motifRefus: str(b.motif_refus) });
    bump('primes');
  }

  // ---------- Réunions + réponses ----------
  for (const m of meetings) {
    const creator = uid(m.created_by);
    const when = new Date(String(m.date_time));
    if (!creator || Number.isNaN(when.getTime()) || !isFresh(m.created_by)) continue;
    const invitees = replies
      .filter((r) => String(r.meeting_id) === String(m.id))
      .map((r) => ({ userId: uid(r.employee_id), status: r.status === 'Accepted' || r.status === 'Rejected' ? r.status : 'en attente' }))
      .filter((i): i is { userId: mongoose.Types.ObjectId; status: string } => !!i.userId);
    await Meeting.create({ title: str(m.title) ?? 'Réunion', dateTime: when, createdBy: creator, invitees });
    bump('réunions');
  }

  // ---------- Télétravail ----------
  for (const t of telework) {
    const userId = uid(t.id_employe);
    const date = isoDate(t.date_teletravail);
    if (!userId || !date || !isFresh(t.id_employe)) continue;
    await Telework.updateOne({ userId, date }, { userId, date }, { upsert: true });
    bump('jours de télétravail');
  }

  // ---------- Demandes de contact ----------
  for (const c of contacts) {
    const email = str(c.email);
    if (!email) continue;
    const userId = c.id_utilisateur ? uid(c.id_utilisateur) : undefined;
    if (userId && !isFresh(c.id_utilisateur)) continue;
    await ContactRequest.create({ userId, nom: str(c.nom), prenom: str(c.prenom), email, telephone: str(c.telephone), sujet: str(c.sujet) ?? '—', message: str(c.message) ?? '—' });
    bump('demandes de contact');
  }

  // ---------- Feedback : ré-anonymisation ----------
  const legacyKeys: Record<string, string> = {
    env: 'rating_env', management: 'rating_management', worklife: 'rating_worklife', comm: 'rating_comm', recognition: 'rating_recognition',
    training: 'rating_training', equipment: 'rating_equipment', team: 'rating_team', meetings: 'rating_meetings', transparency: 'rating_transparency',
  };
  for (const f of feedbacks) {
    const month = String(f.created_at ?? '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) continue;
    const ratings = Object.fromEntries(FEEDBACK_CRITERIA.map((k) => [k, Math.min(5, Math.max(1, num(f[legacyKeys[k]!]) ?? 3))]));
    // Le pseudonyme suffit à garantir un seul avis par mois ; l'identifiant d'origine n'est PAS conservé.
    const participant = pseudonymize(`legacy:${f.user_id ?? f.id}:${month}`);
    await Feedback.updateOne({ month, participant }, { month, participant, ratings, suggestion: str(f.suggestion) ?? '' }, { upsert: true });
    bump('feedbacks (anonymisés)');
  }

  // ---------- Documents du coffre-fort (copie locale du bucket S3) ----------
  if (filesDir) {
    const vault = path.join(filesDir, 'coffre_fort');
    const byName = new Map<string, mongoose.Types.ObjectId>();
    for (const u of await User.find({ status: 'active' }, 'nom prenom')) byName.set(normName(`${u.nom}${u.prenom}`), u._id);
    for (const [folder, category] of [['bulletins', 'bulletin'], ['contrats', 'contrat'], ['autres', 'autre']] as const) {
      const base = path.join(vault, folder);
      if (!fs.existsSync(base)) continue;
      for (const person of fs.readdirSync(base)) {
        const owner = byName.get(normName(person));
        if (!owner) {
          bump('dossiers de coffre-fort sans employé correspondant');
          continue;
        }
        for (const file of fs.readdirSync(path.join(base, person)).filter((f) => f.toLowerCase().endsWith('.pdf'))) {
          const data = fs.readFileSync(path.join(base, person, file));
          if (data.subarray(0, 4).toString() !== '%PDF') continue;
          const storageKey = await writeEncrypted(data);
          await StoredFile.create({ ownerId: owner, category, label: file.replace(/\.pdf$/i, '').replace(/_\d{8}$/, ''), originalName: file, mime: 'application/pdf', size: data.length, storageKey });
          bump('documents du coffre-fort');
        }
      }
    }
  }

  console.log('\nMigration terminée :');
  for (const [k, v] of Object.entries(report)) console.log(`  ${String(v).padStart(5)}  ${k}`);
  console.log('\nÀ faire ensuite :');
  console.log("  - Les photos de profil et justificatifs S3 ne sont pas migrés (voir docs/MIGRATION.md).");
  console.log('  - Les administrateurs devront activer la 2FA à leur première connexion.');
  console.log('  - Vérifiez les comptes puis archivez/supprimez l’ancienne base et son fichier .env.');
} finally {
  cleanup();
  await mongoose.disconnect().catch(() => undefined);
}
