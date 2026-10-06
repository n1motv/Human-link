import { z, type ZodType } from 'zod';
import { schemas } from '../shared.js';
import { changePasswordBody, forgotPasswordBody, notMeBody, tokenPasswordBody, twoFactorCodeBody, twoFactorDisableBody } from '../modules/auth/auth.routes.js';
import { bonusCreateBody } from '../modules/bonuses/bonuses.routes.js';
import { chatBody } from '../modules/chatbot/chatbot.routes.js';
import { contactBody } from '../modules/contact/contact.routes.js';
import { uploadBody } from '../modules/documents/documents.routes.js';
import { feedbackBody, resultsQuery } from '../modules/feedback/feedback.routes.js';
import { meetingCreateBody, meetingResponseBody } from '../modules/meetings/meetings.routes.js';
import { errorReportBody } from '../modules/monitoring/monitoring.routes.js';
import { directorBody, supervisionPair, teleworkMaxBody } from '../modules/org/org.routes.js';
import { auditQuery } from '../modules/rgpd/rgpd.routes.js';
import { sickCreateBody } from '../modules/sick/sick.routes.js';
import { teleworkDatesBody } from '../modules/telework/telework.routes.js';
import { listQuery, profileUpdateBody, userCreateBody, userUpdateBody } from '../modules/users/users.routes.js';

/**
 * Description des routes : titre, corps de requête, paramètres et réponse.
 * Les corps et paramètres sont les schémas que les routes utilisent réellement pour valider (exportés par chaque module),
 * les réponses viennent du contrat partagé avec le client (shared/src/index.ts) et sont vérifiées contre les vraies réponses
 * du serveur par tests/contract.test.ts.
 *
 * La liste des routes, leurs méthodes, l'authentification et les rôles autorisés ne sont PAS saisis ici : ils sont lus dans les routeurs
 * Express (spec.ts). Une annotation dont la route n'existe plus fait échouer la génération (et les tests), tout comme une route sans annotation
 * (tests/openapi.test.ts : toute opération doit être décrite).
 *
 * Clé : « MÉTHODE /chemin/{param} ».
 */
export interface Annotation {
  summary: string;
  description?: string;
  query?: ZodType;
  /** Corps de la requête. */
  body?: ZodType;
  /** Corps envoyé en multipart/form-data : nom du champ qui porte le fichier (`attachment`, `file`, `photo`). */
  multipart?: string;
  /** Code de réponse de succès (200 par défaut). */
  status?: number;
  response?: ZodType;
  /** La réponse est un fichier (type de contenu) plutôt que du JSON. */
  file?: string;
}

const ok = z.object({ ok: z.boolean() });
/** Document renvoyé tel quel, sans détail de ses champs (l'identifiant seul est garanti). */
const doc = z.looseObject({ id: z.string() });
const { list, page } = schemas;

const FILE = 'application/octet-stream';

export const ANNOTATIONS: Record<string, Annotation> = {
  // ---------- Service ----------
  'GET /api/health': {
    summary: 'État du service et version déployée',
    description: 'Utilisé par le HEALTHCHECK Docker et par le client pour détecter une nouvelle version ou la maintenance.',
    response: schemas.health,
  },
  'GET /metrics': { summary: 'Métriques Prometheus', description: 'Hors /api. Désactivé sans METRICS_TOKEN ; sinon en-tête `Authorization: Bearer <jeton>`.', file: 'text/plain' },
  'GET /api/config': { summary: 'Configuration publique du client (nom, logo, couleurs, modules, règles)', response: schemas.publicConfig },
  'POST /api/client-errors': {
    summary: 'Signaler une erreur du navigateur',
    description: 'Public et limité en débit. Les données personnelles sont retirées avant journalisation.',
    body: errorReportBody,
    status: 204,
  },

  // ---------- Authentification ----------
  'GET /api/auth/csrf': { summary: 'Obtenir le jeton CSRF (cookie hl_csrf)', response: ok },
  'POST /api/auth/login': {
    summary: 'Connexion par e-mail et mot de passe',
    description: 'Renvoie l’utilisateur, ou `twoFactorRequired` et un défi à renvoyer sur /api/auth/2fa/login.',
    body: schemas.loginBody,
    response: z.object({ user: schemas.user.optional(), pending2fa: z.boolean().optional(), twoFactorRequired: z.boolean().optional(), challenge: z.string().optional() }),
  },
  'POST /api/auth/2fa/login': { summary: 'Seconde étape de connexion : code 2FA ou code de secours', body: schemas.twoFactorBody, response: z.object({ user: schemas.user }) },
  'POST /api/auth/refresh': {
    summary: 'Renouveler la session (cookie hl_rt)',
    description: 'Appelé automatiquement par le navigateur ; les jetons de renouvellement tournent à chaque appel.',
    response: z.object({ user: schemas.user }),
  },
  'GET /api/auth/me': { summary: 'Utilisateur connecté', response: z.object({ user: schemas.user, pending2fa: z.boolean() }) },
  'POST /api/auth/logout': { summary: 'Déconnexion', response: ok },
  'POST /api/auth/forgot-password': {
    summary: 'Demander un lien de réinitialisation',
    description: 'Même réponse que l’e-mail existe ou non.',
    body: forgotPasswordBody,
    response: ok,
  },
  'POST /api/auth/reset-password': { summary: 'Choisir un nouveau mot de passe avec le jeton reçu', body: tokenPasswordBody, response: ok },
  'POST /api/auth/activate': { summary: 'Activer un compte invité en choisissant son mot de passe', body: tokenPasswordBody, response: ok },
  'POST /api/auth/change-password': { summary: 'Changer mon mot de passe', description: 'Les autres sessions sont fermées.', body: changePasswordBody, response: ok },
  'POST /api/auth/2fa/setup': {
    summary: 'Commencer la configuration de la 2FA',
    description: 'Renvoie le secret et le QR code à scanner.',
    response: z.object({ secret: z.string(), qrDataUrl: z.string() }),
  },
  'POST /api/auth/2fa/enable': {
    summary: 'Activer la 2FA avec un premier code',
    description: 'Renvoie les codes de secours, affichés une seule fois.',
    body: twoFactorCodeBody,
    response: z.object({ recoveryCodes: z.array(z.string()) }),
  },
  'POST /api/auth/2fa/disable': {
    summary: 'Désactiver la 2FA',
    description: 'Mot de passe et code exigés ; refusé pour les rôles qui l’imposent.',
    body: twoFactorDisableBody,
    response: ok,
  },
  'GET /api/auth/sessions': { summary: 'Mes appareils connectés', response: list(schemas.sessionInfo) },
  'DELETE /api/auth/sessions': { summary: 'Fermer toutes mes autres sessions', response: ok.extend({ closed: z.number() }) },
  'DELETE /api/auth/sessions/{id}': { summary: 'Fermer une session', response: ok.extend({ current: z.boolean() }) },
  'POST /api/auth/not-me': {
    summary: '« Ce n’était pas moi » : fermer les sessions et forcer un nouveau mot de passe',
    description: 'Public : le jeton du lien reçu par e-mail fait foi.',
    body: notMeBody,
    response: ok,
  },

  // ---------- Utilisateurs ----------
  'GET /api/users': { summary: 'Lister et rechercher les employés (paginé)', description: 'Un manager ne voit que son équipe.', query: listQuery, response: page(schemas.userRow) },
  'POST /api/users': { summary: 'Créer un compte et envoyer l’invitation', body: userCreateBody, status: 201, response: z.object({ user: schemas.user }) },
  'GET /api/users/{id}': {
    summary: 'Fiche d’un employé',
    description: 'Les données sensibles (salaire, n° de sécurité sociale, adresse) ne sont visibles que de l’administrateur et de la personne.',
    response: z.object({ user: schemas.user }),
  },
  'PATCH /api/users/{id}': { summary: 'Modifier un compte', body: userUpdateBody, response: z.object({ user: schemas.user }) },
  'DELETE /api/users/{id}': { summary: 'Archiver un compte', description: 'Les sessions sont fermées ; les données sont conservées selon la durée légale.', response: ok },
  'POST /api/users/{id}/restore': { summary: 'Restaurer un compte archivé', response: z.object({ user: schemas.user }) },
  'POST /api/users/{id}/anonymize': {
    summary: 'Anonymiser un compte archivé (RGPD)',
    description: 'Irréversible : données personnelles, fichiers et notifications effacés.',
    response: ok,
  },
  'POST /api/users/{id}/reset-2fa': { summary: 'Réinitialiser la 2FA d’un compte', response: ok },
  'POST /api/users/{id}/resend-invite': { summary: 'Renvoyer l’invitation', response: ok },
  'GET /api/users/{id}/photo': { summary: 'Photo de profil', file: 'image/*' },
  'GET /api/users/me/profile': { summary: 'Mon profil', response: z.object({ user: schemas.user }) },
  'PATCH /api/users/me/profile': {
    summary: 'Modifier mon profil',
    description: 'Changer l’adresse e-mail exige le mot de passe actuel.',
    body: profileUpdateBody,
    response: z.object({ user: schemas.user }),
  },
  'POST /api/users/me/photo': { summary: 'Envoyer ma photo de profil', multipart: 'photo', response: z.object({ user: schemas.user }) },

  // ---------- Congés ----------
  'GET /api/leaves/mine': { summary: 'Mes demandes de congé', response: list(schemas.leave) },
  'GET /api/leaves': {
    summary: 'Demandes de congé à traiter',
    description: 'Un manager voit son équipe, un administrateur tout le monde.',
    query: schemas.decisionFilterQuery,
    response: list(schemas.leave),
  },
  'POST /api/leaves': {
    summary: 'Déposer une demande de congé',
    multipart: 'attachment',
    body: schemas.leaveCreateBody,
    status: 201,
    response: z.object({ leave: schemas.leave }),
  },
  'POST /api/leaves/{id}/decision': {
    summary: 'Accepter ou refuser une demande de congé',
    description: 'Validation en deux temps : manager, puis administrateur.',
    body: schemas.decisionBody,
    response: z.object({ leave: schemas.leave }),
  },
  'DELETE /api/leaves/{id}': { summary: 'Retirer ma demande en attente', response: ok },
  'GET /api/leaves/{id}/attachment': { summary: 'Justificatif d’une demande', file: FILE },

  // ---------- Arrêts maladie ----------
  'GET /api/sick-leaves/mine': { summary: 'Mes arrêts maladie', response: list(schemas.sick) },
  'GET /api/sick-leaves': { summary: 'Arrêts maladie à traiter', query: schemas.decisionFilterQuery, response: list(schemas.sick) },
  'POST /api/sick-leaves': {
    summary: 'Déclarer un arrêt maladie',
    description: 'Un arrêt « justifié » exige un justificatif (PDF, JPEG ou PNG).',
    multipart: 'attachment',
    body: sickCreateBody,
    status: 201,
    response: z.object({ sick: schemas.sick }),
  },
  'POST /api/sick-leaves/{id}/decision': { summary: 'Accepter ou refuser un arrêt maladie', body: schemas.decisionBody, response: z.object({ sick: schemas.sick }) },
  'GET /api/sick-leaves/{id}/attachment': { summary: 'Justificatif d’un arrêt', file: FILE },

  // ---------- Primes ----------
  'GET /api/bonuses': { summary: 'Demandes de prime', description: 'Un manager voit celles qu’il a émises.', response: list(schemas.bonus) },
  'POST /api/bonuses': { summary: 'Proposer une prime pour quelqu’un de son équipe', body: bonusCreateBody, status: 201, response: z.object({ bonus: doc }) },
  'POST /api/bonuses/{id}/decision': { summary: 'Accepter ou refuser une prime', body: schemas.decisionBody, response: z.object({ bonus: doc }) },

  // ---------- Télétravail ----------
  'GET /api/telework/next-week': { summary: 'Mes jours de télétravail de la semaine prochaine', response: schemas.teleworkWeek },
  'PUT /api/telework/next-week': {
    summary: 'Choisir mes jours de télétravail',
    description: 'Au plus le maximum autorisé par le manager.',
    body: teleworkDatesBody,
    response: z.object({ chosen: z.array(schemas.dateOnly) }),
  },
  'GET /api/telework/calendar': {
    summary: 'Calendrier du télétravail',
    description: 'Administrateur : tout le monde ; manager : son équipe.',
    query: schemas.dateRangeQuery,
    response: list(schemas.teleworkCalendarItem),
  },

  // ---------- Réunions ----------
  'GET /api/meetings/invitable': { summary: 'Personnes invitables : mon équipe et les autres managers', response: list(schemas.brief) },
  'POST /api/meetings': { summary: 'Organiser une réunion', body: meetingCreateBody, status: 201, response: z.object({ meeting: doc }) },
  'GET /api/meetings/organized': { summary: 'Réunions que j’organise, avec le décompte des réponses', response: list(schemas.meetingOrganized) },
  'DELETE /api/meetings/{id}': { summary: 'Annuler une réunion que j’organise', response: ok },
  'GET /api/meetings/invitations': { summary: 'Mes invitations', response: list(schemas.meetingInvitation) },
  'POST /api/meetings/{id}/respond': { summary: 'Répondre à une invitation', body: meetingResponseBody, response: ok },

  // ---------- Calendrier ----------
  'GET /api/calendar/me': {
    summary: 'Mon calendrier (congés, arrêts, télétravail, réunions)',
    query: schemas.dateRangeQuery,
    response: z.object({ events: z.array(schemas.calendarEvent) }),
  },
  'GET /api/calendar/leaves': {
    summary: 'Congés acceptés de l’équipe (manager) ou de tous (administrateur)',
    query: schemas.dateRangeQuery,
    response: list(schemas.leaveCalendarItem),
  },

  // ---------- Notifications ----------
  'GET /api/notifications': { summary: 'Mes notifications', response: list(schemas.notif).extend({ unread: z.number() }) },
  'GET /api/notifications/unread-count': { summary: 'Nombre de notifications non lues', response: z.object({ unread: z.number() }) },
  'POST /api/notifications/read-all': { summary: 'Tout marquer comme lu', response: ok },
  'DELETE /api/notifications/{id}': { summary: 'Supprimer une de mes notifications', response: ok },

  // ---------- Coffre-fort ----------
  'GET /api/documents/mine': { summary: 'Mon coffre-fort', response: list(schemas.vaultFile) },
  'GET /api/documents/user/{id}': { summary: 'Coffre-fort d’un employé', description: 'Consultation tracée dans le journal d’audit.', response: list(schemas.vaultFile) },
  'POST /api/documents/user/{id}': {
    summary: 'Déposer un document dans le coffre d’un employé',
    description: 'PDF, JPEG ou PNG, 10 Mo au plus ; chiffré au repos et analysé par l’antivirus s’il est configuré.',
    multipart: 'file',
    body: uploadBody,
    status: 201,
    response: z.object({ file: doc }),
  },
  'GET /api/documents/{id}/download': {
    summary: 'Télécharger un document (déchiffré à la volée)',
    description: 'Réservé au propriétaire et à l’administrateur ; chaque téléchargement est tracé.',
    file: FILE,
  },
  'DELETE /api/documents/{id}': { summary: 'Supprimer un document du coffre', response: ok },

  // ---------- Organisation ----------
  'GET /api/org/supervisions': { summary: 'Rattachements manager / personne et directeur', response: schemas.supervisions },
  'POST /api/org/supervisions': {
    summary: 'Rattacher une personne à un manager',
    description: 'Une personne n’a qu’un seul manager ; les cycles sont refusés.',
    body: supervisionPair,
    status: 201,
    response: ok,
  },
  'DELETE /api/org/supervisions/{managerId}/{superviseId}': { summary: 'Supprimer un rattachement', response: ok },
  'PUT /api/org/director': { summary: 'Désigner le directeur', description: 'Il ne peut y en avoir qu’un.', body: directorBody, response: ok },
  'GET /api/org/tree': { summary: 'Organigramme', response: schemas.orgTree },
  'GET /api/org/team': { summary: 'Mon équipe', response: z.object({ team: z.array(schemas.teamMember) }) },
  'PATCH /api/org/team/{id}/telework-max': { summary: 'Régler le maximum de jours de télétravail d’une personne de mon équipe', body: teleworkMaxBody, response: ok },

  // ---------- Avis anonymes, contact ----------
  'GET /api/feedback/status': { summary: 'Avis du mois : déjà donné ? critères', response: schemas.feedbackStatus },
  'POST /api/feedback': { summary: 'Donner mon avis du mois (anonyme)', description: 'Rien ne relie l’avis à son auteur.', body: feedbackBody, status: 201, response: ok },
  'GET /api/feedback/results': {
    summary: 'Résultats agrégés du mois',
    description: 'Sous 3 réponses, les suggestions libres sont masquées (anti ré-identification).',
    query: resultsQuery,
    response: schemas.feedbackResults,
  },
  'POST /api/contact': {
    summary: 'Envoyer un message à l’équipe RH',
    description: 'Ouvert aux visiteurs ; limité en débit ; champ piège `website` contre les robots.',
    body: contactBody,
    status: 201,
    response: ok.extend({ id: z.string().optional() }),
  },
  'GET /api/contact': { summary: 'Messages reçus', response: list(schemas.contactRequest) },
  'DELETE /api/contact/{id}': { summary: 'Supprimer un message', response: ok },

  // ---------- Administration, RGPD, assistant ----------
  'GET /api/dashboard/admin': {
    summary: 'Tableau de bord administrateur',
    description: 'Agrégats seulement (aucun salaire individuel) ; la consultation est tracée.',
    response: schemas.adminDashboard,
  },
  'GET /api/rgpd/audit': { summary: 'Journal d’audit : qui a consulté ou modifié quelles données', query: auditQuery, response: page(schemas.auditEntry) },
  'GET /api/rgpd/export': { summary: 'Exporter toutes mes données (droit d’accès)', description: 'Fichier JSON ; la demande est tracée.', file: 'application/json' },
  'POST /api/chatbot': {
    summary: 'Poser une question à l’assistant RH',
    body: chatBody,
    response: z.object({ answer: z.string(), intent: z.string().nullable(), sensitive: z.boolean() }),
  },
};
