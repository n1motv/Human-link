import type { Request, RequestHandler } from 'express';
import { User, type Role } from '../models/User.js';
import { clientConfig } from '../config/client.js';
import { forbidden, unauthorized } from '../utils/errors.js';
import { verifyAccessToken } from '../utils/tokens.js';

export const ACCESS_COOKIE = 'hl_at';
export const REFRESH_COOKIE = 'hl_rt';
export const CSRF_COOKIE = 'hl_csrf';

interface Options {
  /** Autoriser un compte qui doit encore activer la 2FA (routes /auth/*). */
  allowPending2fa?: boolean;
}

/**
 * Authentifie la requête via le cookie httpOnly. À chaque requête on relit l'utilisateur en base :
 * un compte archivé, un rôle modifié ou une révocation de sessions prennent effet immédiatement.
 */
export function requireAuth(opts: Options = {}): RequestHandler {
  const handler: RequestHandler = async (req, _res, next) => {
    const token = req.cookies?.[ACCESS_COOKIE] as string | undefined;
    if (!token) throw unauthorized();
    const claims = await verifyAccessToken(token);
    if (!claims) throw unauthorized('Session expirée', 'TOKEN_EXPIRED');

    const user = await User.findById(claims.sub).select('role status tokenVersion email isDirector twoFactor.enabled');
    if (!user || user.status !== 'active' || user.tokenVersion !== claims.tv) throw unauthorized('Session invalide', 'TOKEN_REVOKED');

    const pending2fa = clientConfig.security.require2faForRoles.includes(user.role) && !user.twoFactor?.enabled;
    if (pending2fa && !opts.allowPending2fa) {
      throw forbidden('Activez la double authentification pour continuer', 'TWO_FACTOR_SETUP_REQUIRED');
    }
    req.auth = { userId: String(user._id), role: user.role, email: user.email, isDirector: user.isDirector, pending2fa };
    next();
  };
  return Object.assign(handler, { requiresAuth: true as const }); // repère lu par la génération de la documentation de l'API (openapi/spec.ts)
}

/** Contrôle d'accès par rôle (à placer après requireAuth). */
export function requireRole(...roles: Role[]): RequestHandler {
  const handler: RequestHandler = (req, _res, next) => {
    if (!req.auth || !roles.includes(req.auth.role)) throw forbidden();
    next();
  };
  return Object.assign(handler, { allowedRoles: roles }); // idem : les rôles autorisés figurent dans la documentation
}

export function authOf(req: Request) {
  if (!req.auth) throw unauthorized();
  return req.auth;
}
