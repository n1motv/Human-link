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
import { notFound, unauthorized } from '../../utils/errors.js';
import { maskIp, parseUserAgent, type DeviceInfo } from '../../utils/userAgent.js';

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
    ipMasked: maskIp(clientIp(req)),
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

export interface SessionInfo extends DeviceInfo {
  /** Identifiant public de la session (sa « famille » de jetons). */
  id: string;
  ipMasked?: string;
  createdAt: Date;
  lastActiveAt: Date;
  current: boolean;
}

/** Appareils actuellement connectés : une ligne par session, la plus récemment active en premier. */
export async function listSessions(userId: string, presentedRefresh?: string): Promise<SessionInfo[]> {
  const now = new Date();
  const records = await RefreshToken.find({ userId, revokedAt: { $exists: false }, expiresAt: { $gt: now } }).sort({ createdAt: 1 });
  const currentFamily = presentedRefresh ? records.find((r) => r.tokenHash === sha256(presentedRefresh))?.family : undefined;
  const byFamily = new Map<string, SessionInfo>();
  for (const r of records) {
    const prev = byFamily.get(r.family);
    byFamily.set(r.family, {
      id: r.family,
      ...parseUserAgent(r.userAgent ?? undefined),
      ipMasked: r.ipMasked ?? prev?.ipMasked ?? undefined,
      createdAt: prev?.createdAt ?? r.createdAt,
      lastActiveAt: r.createdAt, // chaque rafraîchissement crée un jeton : le plus récent donne la dernière activité
      current: r.family === currentFamily,
    });
  }
  return [...byFamily.values()].sort((a, b) => b.lastActiveAt.getTime() - a.lastActiveAt.getTime());
}

/** Ferme une session précise de cet utilisateur. Renvoie vrai si c'était la session courante. */
export async function revokeSession(userId: string, family: string, presentedRefresh?: string): Promise<boolean> {
  const active = await RefreshToken.find({ userId, family, revokedAt: { $exists: false } });
  if (!active.length) throw notFound('Session introuvable');
  const wasCurrent = !!presentedRefresh && active.some((r) => r.tokenHash === sha256(presentedRefresh));
  await RefreshToken.updateMany({ userId, family }, { revokedAt: new Date() });
  return wasCurrent;
}

/** Ferme toutes les sessions sauf la courante. */
export async function revokeOtherSessions(userId: string, presentedRefresh?: string): Promise<number> {
  const mine = presentedRefresh ? await RefreshToken.findOne({ tokenHash: sha256(presentedRefresh), userId }) : null;
  const filter: Record<string, unknown> = { userId, revokedAt: { $exists: false } };
  if (mine) filter.family = { $ne: mine.family };
  const r = await RefreshToken.updateMany(filter, { revokedAt: new Date() });
  return r.modifiedCount;
}
