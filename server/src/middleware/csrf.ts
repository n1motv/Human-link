import type { RequestHandler, Response } from 'express';
import { cookieSecure } from '../config/env.js';
import { forbidden } from '../utils/errors.js';
import { randomToken, safeEqual } from '../utils/crypto.js';
import { CSRF_COOKIE } from './auth.js';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Protection CSRF par « double submit cookie » : le cookie `hl_csrf` (lisible par le JS du site)
 * doit être renvoyé à l'identique dans l'en-tête `X-CSRF-Token`. Un site tiers ne peut pas lire
 * ce cookie, donc ne peut pas forger l'en-tête. S'ajoute à SameSite=Strict sur les cookies de session.
 */
export const csrfProtection: RequestHandler = (req, _res, next) => {
  if (SAFE.has(req.method)) return next();
  const cookie = req.cookies?.[CSRF_COOKIE] as string | undefined;
  const header = req.get('x-csrf-token');
  if (!cookie || !header || !safeEqual(cookie, header)) throw forbidden('Jeton CSRF invalide', 'CSRF');
  next();
};

export function issueCsrfCookie(res: Response): string {
  const token = randomToken(24);
  res.cookie(CSRF_COOKIE, token, { httpOnly: false, sameSite: 'strict', secure: cookieSecure, path: '/', maxAge: 24 * 3600 * 1000 });
  return token;
}
