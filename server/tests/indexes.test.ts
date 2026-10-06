import mongoose from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditLog } from '../src/models/AuditLog.js';
import { BonusRequest } from '../src/models/BonusRequest.js';
import { ContactRequest } from '../src/models/ContactRequest.js';
import { Feedback } from '../src/models/Feedback.js';
import { LeaveRequest } from '../src/models/LeaveRequest.js';
import { Meeting } from '../src/models/Meeting.js';
import { Notification } from '../src/models/Notification.js';
import { RefreshToken } from '../src/models/RefreshToken.js';
import { SickLeave } from '../src/models/SickLeave.js';
import { StoredFile } from '../src/models/StoredFile.js';
import { Supervision } from '../src/models/Supervision.js';
import { Telework } from '../src/models/Telework.js';
import { User } from '../src/models/User.js';
import { connect } from './helpers.js';

/**
 * Index MongoDB (T-15) : chaque requête fréquente de l'application doit être servie par un index, sans balayage complet de la collection
 * (COLLSCAN) ni tri en mémoire (SORT bloquant). Avec des milliers de lignes, c'est ce qui sépare une page instantanée d'une page lente.
 * Les requêtes ci-dessous sont celles des routes et des tâches planifiées ; en ajouter une quand on en écrit une nouvelle.
 */

beforeAll(async () => {
  await connect();
  await Promise.all(mongoose.modelNames().map((m) => mongoose.model(m).syncIndexes()));
});
afterAll(() => mongoose.disconnect());

const id = new mongoose.Types.ObjectId();
const ids = [id, new mongoose.Types.ObjectId()];
const day = '2026-10-05';
const past = new Date(Date.now() - 86_400_000);

/** Étapes du plan retenu par MongoDB (en parcourant tout l'arbre : sous-plans, jointures, etc.). */
function stages(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) node.forEach((n) => stages(n, out));
  else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (k === 'stage' && typeof v === 'string') out.push(v);
      else stages(v, out);
    }
  }
  return out;
}

type Query = {
  find: (f: object) => {
    sort: (s: object) => { explain: (v: string) => Promise<{ queryPlanner: { winningPlan: unknown } }> };
    explain: (v: string) => Promise<{ queryPlanner: { winningPlan: unknown } }>;
  };
};
const plan = async (model: unknown, filter: object, sort?: object) => {
  const q = (model as Query).find(filter);
  const ex = await (sort ? q.sort(sort) : q).explain('queryPlanner');
  return stages(ex.queryPlanner.winningPlan);
};

interface Case {
  name: string;
  model: unknown;
  filter: object;
  sort?: object;
  /** Le tri en mémoire reste acceptable : il porte sur le résultat déjà filtré par l'index, jamais sur toute la collection. */
  sortOnFiltered?: boolean;
}

const CASES: Case[] = [
  // Employés
  { name: 'employés : liste triée par nom', model: User, filter: { status: { $ne: 'anonymized' } }, sort: { nom: 1, prenom: 1 } },
  { name: 'employés : liste filtrée par statut', model: User, filter: { status: 'active' }, sort: { nom: 1, prenom: 1 } },
  { name: 'employés : liste filtrée par rôle', model: User, filter: { status: { $ne: 'anonymized' }, role: 'manager' }, sort: { nom: 1, prenom: 1 } },
  { name: 'connexion par e-mail', model: User, filter: { email: 'a@b.fr' } },
  { name: 'directeur', model: User, filter: { isDirector: true } },
  { name: 'administrateurs actifs (notifications)', model: User, filter: { role: 'admin', status: 'active' } },
  { name: 'comptes archivés à anonymiser', model: User, filter: { status: 'archived', updatedAt: { $lt: past } } },
  // Congés
  { name: 'congés : les miens', model: LeaveRequest, filter: { userId: id }, sort: { createdAt: -1 } },
  { name: 'congés : à traiter (administrateur)', model: LeaveRequest, filter: { statut: 'en attente' }, sort: { createdAt: -1 } },
  { name: 'congés : à traiter (manager)', model: LeaveRequest, filter: { statut: 'en attente', userId: { $in: ids } }, sort: { createdAt: -1 } },
  { name: 'congés : calendrier de l’équipe', model: LeaveRequest, filter: { statut: 'accepte', dateDebut: { $lte: day }, dateFin: { $gte: day }, userId: { $in: ids } } },
  { name: 'congés : absents du jour', model: LeaveRequest, filter: { statut: 'accepte', dateDebut: { $lte: day }, dateFin: { $gte: day } } },
  { name: 'congés : chevauchement pour une personne', model: LeaveRequest, filter: { userId: id, dateDebut: { $lte: day }, dateFin: { $gte: day } } },
  // Arrêts maladie
  { name: 'arrêts : les miens', model: SickLeave, filter: { userId: id }, sort: { dateDebut: -1 } },
  { name: 'arrêts : à traiter', model: SickLeave, filter: { statut: 'en attente' }, sort: { createdAt: -1 } },
  { name: 'arrêts : absents du jour', model: SickLeave, filter: { statut: 'accepte', dateDebut: { $lte: day }, dateFin: { $gte: day } } },
  // Primes
  { name: 'primes : toutes (administrateur)', model: BonusRequest, filter: {}, sort: { createdAt: -1 } },
  { name: 'primes : émises par un manager', model: BonusRequest, filter: { managerId: id }, sort: { createdAt: -1 } },
  { name: 'primes : reçues par une personne (export RGPD)', model: BonusRequest, filter: { employeId: id } },
  // Télétravail
  { name: 'télétravail : une personne sur une période', model: Telework, filter: { userId: id, date: { $gte: day, $lte: day } } },
  { name: 'télétravail : équipe sur une période', model: Telework, filter: { date: { $gte: day, $lte: day }, userId: { $in: ids } }, sort: { date: 1 } },
  // Notifications
  { name: 'notifications : les miennes', model: Notification, filter: { userId: id }, sort: { createdAt: -1 } },
  { name: 'notifications : non lues', model: Notification, filter: { userId: id, isRead: false } },
  { name: 'notifications : purge de rétention', model: Notification, filter: { createdAt: { $lt: past } } },
  // Réunions
  { name: 'réunions organisées', model: Meeting, filter: { createdBy: id }, sort: { dateTime: -1 } },
  { name: 'réunions où je suis invité', model: Meeting, filter: { 'invitees.userId': id }, sort: { dateTime: -1 } },
  { name: 'réunions du calendrier', model: Meeting, filter: { dateTime: { $gte: past, $lte: new Date() } } },
  // Coffre-fort, organisation, avis, contact
  {
    name: 'coffre-fort : documents d’une personne',
    model: StoredFile,
    filter: { ownerId: id, category: { $in: ['bulletin', 'contrat', 'autre'] } },
    sort: { year: -1, month: -1, createdAt: -1 },
  },
  { name: 'organisation : équipe d’un manager', model: Supervision, filter: { managerId: id } },
  { name: 'organisation : manager d’une personne', model: Supervision, filter: { superviseId: id } },
  { name: 'avis du mois', model: Feedback, filter: { month: '2026-10' } },
  { name: 'contact : messages reçus', model: ContactRequest, filter: {}, sort: { createdAt: -1 } },
  { name: 'contact : purge de rétention', model: ContactRequest, filter: { createdAt: { $lt: past } } },
  // Journal d’audit
  { name: 'audit : le plus récent d’abord', model: AuditLog, filter: {}, sort: { at: -1 } },
  { name: 'audit : filtré par préfixe d’action', model: AuditLog, filter: { action: /^user\./ }, sort: { at: -1 }, sortOnFiltered: true }, // un préfixe couvre plusieurs actions : plusieurs plages d'index, donc un tri sur le résultat
  { name: 'audit : filtré par cible', model: AuditLog, filter: { targetId: 'abc' }, sort: { at: -1 } },
  { name: 'audit : actions d’une personne (export RGPD)', model: AuditLog, filter: { actorId: id }, sort: { at: -1 } },
  { name: 'audit : purge de rétention', model: AuditLog, filter: { at: { $lt: past } } },
  // Sessions
  { name: 'sessions : jeton présenté', model: RefreshToken, filter: { tokenHash: 'abc' } },
  { name: 'sessions : appareils connectés', model: RefreshToken, filter: { userId: id, revokedAt: { $exists: false }, expiresAt: { $gt: new Date() } }, sort: { createdAt: 1 } },
  { name: 'sessions : famille de jetons', model: RefreshToken, filter: { family: 'abc' } },
];

describe('index MongoDB : aucune requête fréquente ne balaie toute la collection (T-15)', () => {
  for (const c of CASES) {
    it(c.name, async () => {
      const found = await plan(c.model, c.filter, c.sort);
      // EXPRESS_IXSCAN : accès direct par clé unique (MongoDB 8)
      expect(
        found.some((x) => /IXSCAN/.test(x)),
        `plan : ${found.join(' > ')}`,
      ).toBe(true);
      expect(found, 'balayage complet de la collection').not.toContain('COLLSCAN');
      if (!c.sortOnFiltered)
        expect(
          found.filter((x) => x.startsWith('SORT')),
          'tri en mémoire (aucun index ne fournit l’ordre demandé)',
        ).toEqual([]);
    });
  }

  // Recherches « contient » (texte libre dans le nom, l'e-mail, le service) : aucun index B-tree ne sait les servir.
  // Elles restent acceptables tant qu'elles s'exécutent sur la collection des employés (quelques milliers de lignes) et sont paginées côté serveur.
  it('les recherches par sous-chaîne sont les seules à balayer, et c’est assumé', async () => {
    const found = await plan(User, { status: { $ne: 'anonymized' }, $or: [{ nom: /dup/i }, { email: /dup/i }] }, { nom: 1, prenom: 1 });
    expect(found).not.toContain('SORT'); // au moins le tri vient d'un index
  });
});
