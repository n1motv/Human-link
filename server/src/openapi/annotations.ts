import { z, type ZodType } from 'zod';
import { schemas } from '../shared.js';
import { errorReportBody } from '../modules/monitoring/monitoring.routes.js';
import { listQuery } from '../modules/users/users.routes.js';

/**
 * Description des routes principales : titre, corps de requête, paramètres et réponse, avec les schémas zod partagés avec le client.
 * La liste des routes, leurs méthodes, l'authentification et les rôles autorisés ne sont PAS saisis ici : ils sont lus dans les routeurs
 * Express (spec.ts). Une route sans annotation apparaît donc quand même, avec son titre par défaut ; une annotation dont la route n'existe plus
 * fait échouer la génération (et les tests).
 *
 * Clé : « MÉTHODE /chemin/{param} ».
 */
export interface Annotation {
  summary: string;
  description?: string;
  query?: ZodType;
  /** Corps de la requête. */
  body?: ZodType;
  /** Corps envoyé en multipart/form-data (avec un fichier). */
  multipart?: boolean;
  /** Code de réponse de succès (200 par défaut). */
  status?: number;
  response?: ZodType;
}

const ok = z.object({ ok: z.boolean() });
const { list, page } = schemas;

export const ANNOTATIONS: Record<string, Annotation> = {
  'GET /api/health': { summary: 'État du service', description: 'Utilisé par le HEALTHCHECK Docker.', response: ok },
  'GET /api/config': { summary: 'Configuration publique du client (nom, logo, couleurs, modules, règles)', response: schemas.publicConfig },
  'POST /api/client-errors': {
    summary: 'Signaler une erreur du navigateur',
    description: 'Public et limité en débit. Les données personnelles sont retirées avant journalisation.',
    body: errorReportBody,
    status: 204,
  },

  'GET /api/auth/csrf': { summary: 'Obtenir le jeton CSRF (cookie hl_csrf)', response: ok },
  'POST /api/auth/login': {
    summary: 'Connexion par e-mail et mot de passe',
    description: 'Renvoie l’utilisateur, ou `twoFactorRequired` et un défi à renvoyer sur /api/auth/2fa/login.',
    body: schemas.loginBody,
    response: z.object({ user: schemas.user.optional(), pending2fa: z.boolean().optional(), twoFactorRequired: z.boolean().optional(), challenge: z.string().optional() }),
  },
  'POST /api/auth/2fa/login': { summary: 'Seconde étape de connexion : code 2FA ou code de secours', body: schemas.twoFactorBody, response: z.object({ user: schemas.user }) },
  'GET /api/auth/me': { summary: 'Utilisateur connecté', response: z.object({ user: schemas.user, pending2fa: z.boolean() }) },
  'POST /api/auth/logout': { summary: 'Déconnexion', response: ok },

  'GET /api/users': { summary: 'Lister et rechercher les employés (paginé)', description: 'Un manager ne voit que son équipe.', query: listQuery, response: page(schemas.userRow) },
  'GET /api/users/me/profile': { summary: 'Mon profil', response: z.object({ user: schemas.user }) },

  'GET /api/leaves/mine': { summary: 'Mes demandes de congé', response: list(schemas.leave) },
  'GET /api/leaves': {
    summary: 'Demandes de congé à traiter',
    description: 'Un manager voit son équipe, un administrateur tout le monde.',
    query: z.object({ statut: schemas.decision.optional() }),
    response: list(schemas.leave),
  },
  'POST /api/leaves': { summary: 'Déposer une demande de congé', multipart: true, body: schemas.leaveCreateBody, status: 201, response: z.object({ leave: schemas.leave }) },
  'POST /api/leaves/{id}/decision': {
    summary: 'Accepter ou refuser une demande de congé',
    description: 'Validation en deux temps : manager, puis administrateur.',
    body: schemas.leaveDecisionBody,
  },

  'GET /api/sick-leaves/mine': { summary: 'Mes arrêts maladie', response: list(schemas.sick) },
  'GET /api/sick-leaves': { summary: 'Arrêts maladie à traiter', response: list(schemas.sick) },
  'GET /api/bonuses': { summary: 'Demandes de prime', response: list(schemas.bonus) },

  'GET /api/notifications': { summary: 'Mes notifications', response: list(schemas.notif).extend({ unread: z.number() }) },
  'GET /api/notifications/unread-count': { summary: 'Nombre de notifications non lues', response: z.object({ unread: z.number() }) },
  'GET /api/documents/mine': { summary: 'Mon coffre-fort', response: list(schemas.vaultFile) },
  'GET /api/calendar/me': {
    summary: 'Mon calendrier (congés, arrêts, télétravail, réunions)',
    query: z.object({ from: schemas.dateOnly, to: schemas.dateOnly }),
    response: z.object({ events: z.array(schemas.calendarEvent) }),
  },
};
