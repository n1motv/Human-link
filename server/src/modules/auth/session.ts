import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { RefreshToken } from '../../models/RefreshToken.js';
import type { UserDoc } from '../../models/User.js';
import { clientConfig } from '../../config/client.js';
import { cookieSecure } from '../../config/env.js';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '../../middleware/auth.js';
import { issueCsrfCookie } from '../../middleware/csrf.js';
import { clientIp } from '../../utils/audit.js';
import { pseudonymize, randomToken, sha256 } from '../../utils/crypto.js';
import { signAccessToken } from '../../utils/tokens.js';
import { unauthorized } from '../../utils/errors.js';

/** Un jeton déjà consommé reste accepté quelques secondes (onglets simultanés) sans déclencher l'alerte de vol. */
const REUSE_LEEWAY_MS = 10_000;

const cookieBase = { httpOnly: true, sameSite: 'strict' as const, secure: cookieSecure };

async function issue(req: Request, res: Response, user: UserDoc, family: string) {
  const days = clientConfig.security.refreshTokenDays;
  const refresh = randomToken(48);
  await RefreshToken.create({
    userId: user._id,
    family,
    tokenHash: sha256(refresh),
    expiresAt: new Date(Date.now() + days * 86_400_000),
    ipHash: pseudonymize(clientIp(req)),
    userAgent: req.get('user-agent')?.slice(0, 300),
  });
  const access = await signAccessToken(String(user._id), user.tokenVersion);
  res.cookie(ACCESS_COOKIE, access, { ...cookieBase, path: '/api', maxAge: clientConfig.security.accessTokenMinutes * 60_000 });
  res.cookie(REFRESH_COOKIE, refresh, { ...cookieBase, path: '/api/auth', maxAge: days * 86_400_000 });
  issueCsrfCookie(res);
}

export async function startSession(req: Request, res: Response, user: UserDoc) {
  await issue(req, res, user, randomUUID());
}

/** Rotation : chaque rafraîchissement invalide l'ancien jeton et en émet un nouveau (même famille). */
export async function rotateSession(req: Request, res: Response, loadUser: (id: string) => Promise<UserDoc | null>) {
  const presented = req.cookies?.[REFRESH_COOKIE] as string | undefined;
  if (!presented) throw unauthorized();
  const record = await RefreshToken.findOne({ tokenHash: sha256(presented) });
  if (!record || record.revokedAt || record.expiresAt < new Date()) throw unauthorized('Session expirée', 'TOKEN_EXPIRED');

  if (record.usedAt) {
    if (Date.now() - record.usedAt.getTime() > REUSE_LEEWAY_MS) {
      // Réutilisation d'un ancien jeton : on suppose un vol et on coupe toute la famille de sessions.
      await RefreshToken.updateMany({ family: record.family }, { revokedAt: new Date() });
      throw unauthorized('Session invalide', 'TOKEN_REUSED');
    }
  } else {
    record.usedAt = new Date();
    await record.save();
  }

  const user = await loadUser(String(record.userId));
  if (!user || user.status !== 'active') throw unauthorized('Session invalide', 'TOKEN_REVOKED');
  await issue(req, res, user, record.family);
  return user;
}

export async function endSession(req: Request, res: Response) {
  const presented = req.cookies?.[REFRESH_COOKIE] as string | undefined;
  if (presented) {
    const record = await RefreshToken.findOne({ tokenHash: sha256(presented) });
    if (record) await RefreshToken.updateMany({ family: record.family }, { revokedAt: new Date() });
  }
  res.clearCookie(ACCESS_COOKIE, { ...cookieBase, path: '/api' });
  res.clearCookie(REFRESH_COOKIE, { ...cookieBase, path: '/api/auth' });
}

export async function revokeAllSessions(userId: string) {
  await RefreshToken.updateMany({ userId, revokedAt: { $exists: false } }, { revokedAt: new Date() });
}
