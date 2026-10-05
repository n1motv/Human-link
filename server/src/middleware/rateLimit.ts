import { rateLimit } from 'express-rate-limit';
import { isTest } from '../config/env.js';

const common = {
  standardHeaders: 'draft-7' as const,
  legacyHeaders: false,
  skip: () => isTest,
  message: { error: { code: 'RATE_LIMITED', message: 'Trop de requêtes, réessayez dans quelques instants' } },
};

/** Limite globale de l'API. */
export const apiLimiter = rateLimit({ ...common, windowMs: 60_000, limit: 300 });

/** Endpoints d'authentification : freinage des attaques par force brute / credential stuffing. */
export const authLimiter = rateLimit({ ...common, windowMs: 15 * 60_000, limit: 100 });

/** Renouvellement de session : appelé automatiquement par le navigateur, donc nettement plus large que la connexion. */
export const refreshLimiter = rateLimit({ ...common, windowMs: 15 * 60_000, limit: 600 });

/** Formulaires publics (contact, mot de passe oublié). */
export const publicFormLimiter = rateLimit({ ...common, windowMs: 60 * 60_000, limit: 10 });

/** Rapports d'erreur du navigateur : public, donc strictement limité (une page cassée ne doit pas inonder les journaux). */
export const errorReportLimiter = rateLimit({ ...common, windowMs: 60_000, limit: 10 });

/** Assistant RH : appels potentiellement coûteux. */
export const chatLimiter = rateLimit({ ...common, windowMs: 60_000, limit: 20 });
