import { Router } from 'express';
import { z } from 'zod';
import { User, toPublicUser, type UserDoc } from '../../models/User.js';
import { clientConfig } from '../../config/client.js';
import { env } from '../../config/env.js';
import { authOf, requireAuth } from '../../middleware/auth.js';
import { issueCsrfCookie } from '../../middleware/csrf.js';
import { authLimiter, publicFormLimiter } from '../../middleware/rateLimit.js';
import { audit } from '../../utils/audit.js';
import { randomToken, sha256 } from '../../utils/crypto.js';
import { badRequest, notFound, parse, unauthorized } from '../../utils/errors.js';
import { sendMail } from '../../utils/mailer.js';
import { dummyVerify, hashPassword, passwordSchema, verifyPassword } from '../../utils/password.js';
import { signTwoFactorChallenge, verifyTwoFactorChallenge } from '../../utils/tokens.js';
import { hashRecovery, newRecoveryCodes, newTotpSecret, totpQrDataUrl, verifyTotp } from '../../utils/totp.js';
import { endSession, revokeAllSessions, rotateSession, startSession } from './session.js';

export const authRouter = Router();

const GENERIC_LOGIN_ERROR = 'Identifiants invalides ou compte temporairement verrouillé';
const email = z.email().max(254).transform((v) => v.toLowerCase().trim());

async function recordFailure(user: UserDoc) {
  const { maxLoginAttempts, lockMinutes } = clientConfig.security;
  user.failedAttempts += 1;
  if (user.failedAttempts >= maxLoginAttempts) {
    user.lockUntil = new Date(Date.now() + lockMinutes * 60_000);
    user.failedAttempts = 0;
    void sendMail(
      user.email,
      'Compte temporairement verrouillé',
      `Plusieurs tentatives de connexion ont échoué. Votre compte est verrouillé pendant ${lockMinutes} minutes.\nSi ce n'était pas vous, changez votre mot de passe via « Mot de passe oublié ».`,
    );
  }
  await user.save();
}

async function completeLogin(req: import('express').Request, res: import('express').Response, user: UserDoc) {
  user.failedAttempts = 0;
  user.lockUntil = undefined;
  user.lastLoginAt = new Date();
  await user.save();
  await startSession(req, res, user);
  await audit(req, { action: 'auth.login', actorId: String(user._id), actorEmail: user.email });
  const pending2fa = clientConfig.security.require2faForRoles.includes(user.role) && !user.twoFactor?.enabled;
  res.json({ user: toPublicUser(user), pending2fa });
}

authRouter.get('/csrf', (_req, res) => {
  issueCsrfCookie(res);
  res.json({ ok: true });
});

authRouter.post('/login', authLimiter, async (req, res) => {
  const body = parse(z.object({ email, password: z.string().min(1).max(200) }), req.body);
  const user = await User.findOne({ email: body.email }).select('+passwordHash');

  if (!user?.passwordHash || user.status !== 'active') {
    await dummyVerify(body.password);
    throw unauthorized(GENERIC_LOGIN_ERROR, 'INVALID_CREDENTIALS');
  }
  if (user.lockUntil && user.lockUntil > new Date()) {
    await dummyVerify(body.password);
    throw unauthorized(GENERIC_LOGIN_ERROR, 'INVALID_CREDENTIALS');
  }
  if (!(await verifyPassword(user.passwordHash, body.password))) {
    await recordFailure(user);
    await audit(req, { action: 'auth.login_failed', actorId: String(user._id), actorEmail: user.email });
    throw unauthorized(GENERIC_LOGIN_ERROR, 'INVALID_CREDENTIALS');
  }

  if (user.twoFactor?.enabled) {
    res.json({ twoFactorRequired: true, challenge: await signTwoFactorChallenge(String(user._id)) });
    return;
  }
  await completeLogin(req, res, user);
});

authRouter.post('/2fa/login', authLimiter, async (req, res) => {
  const body = parse(z.object({ challenge: z.string().max(2000), code: z.string().min(6).max(20) }), req.body);
  const userId = await verifyTwoFactorChallenge(body.challenge);
  if (!userId) throw unauthorized('Vérification expirée, reconnectez-vous', 'CHALLENGE_EXPIRED');
  const user = await User.findById(userId);
  if (!user || user.status !== 'active' || !user.twoFactor?.enabled) throw unauthorized(GENERIC_LOGIN_ERROR, 'INVALID_CREDENTIALS');
  if (user.lockUntil && user.lockUntil > new Date()) throw unauthorized(GENERIC_LOGIN_ERROR, 'INVALID_CREDENTIALS');

  const code = body.code.trim();
  let ok = false;
  if (user.twoFactor.secret && (await verifyTotp(user.twoFactor.secret, code))) {
    ok = true;
  } else {
    const h = hashRecovery(code);
    if (user.twoFactor.recoveryCodes.includes(h)) {
      user.twoFactor.recoveryCodes = user.twoFactor.recoveryCodes.filter((c) => c !== h); // usage unique
      ok = true;
      await audit(req, { action: 'auth.recovery_code_used', actorId: String(user._id), actorEmail: user.email });
    }
  }
  if (!ok) {
    await recordFailure(user);
    await audit(req, { action: 'auth.2fa_failed', actorId: String(user._id), actorEmail: user.email });
    throw unauthorized('Code invalide', 'INVALID_2FA_CODE');
  }
  await completeLogin(req, res, user);
});

authRouter.post('/refresh', authLimiter, async (req, res) => {
  const user = await rotateSession(req, res, (id) => User.findById(id));
  res.json({ user: toPublicUser(user) });
});

authRouter.post('/logout', async (req, res) => {
  await endSession(req, res);
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth({ allowPending2fa: true }), async (req, res) => {
  const auth = authOf(req);
  const user = await User.findById(auth.userId);
  if (!user) throw notFound();
  res.json({ user: toPublicUser(user), pending2fa: auth.pending2fa });
});

// ---------- Activation d'un compte invité et réinitialisation du mot de passe ----------

async function issueLink(user: UserDoc, kind: 'invite' | 'reset'): Promise<string> {
  const token = randomToken(32);
  const sec = clientConfig.security;
  if (kind === 'invite') {
    user.inviteTokenHash = sha256(token);
    user.inviteExpiresAt = new Date(Date.now() + sec.inviteTokenHours * 3_600_000);
  } else {
    user.resetTokenHash = sha256(token);
    user.resetExpiresAt = new Date(Date.now() + sec.resetTokenMinutes * 60_000);
  }
  await user.save();
  return `${env.APP_URL}/${kind === 'invite' ? 'activate' : 'reset-password'}?token=${token}`;
}

/** Envoie le lien d'activation (utilisé aussi par l'admin à la création d'un compte). */
export async function sendInvitation(user: UserDoc) {
  const link = await issueLink(user, 'invite');
  await sendMail(
    user.email,
    `Bienvenue chez ${clientConfig.company.name}`,
    `Bonjour ${user.prenom} ${user.nom},\n\nVotre compte a été créé. Pour choisir votre mot de passe et activer votre accès, utilisez ce lien (valable ${clientConfig.security.inviteTokenHours} h) :\n${link}\n\nPersonne ne connaît votre mot de passe : il n'est jamais envoyé par e-mail.`,
  );
}

authRouter.post('/forgot-password', publicFormLimiter, async (req, res) => {
  const body = parse(z.object({ email }), req.body);
  const user = await User.findOne({ email: body.email });
  if (user && (user.status === 'active' || user.status === 'invited')) {
    if (user.status === 'invited') {
      await sendInvitation(user);
    } else {
      const link = await issueLink(user, 'reset');
      await sendMail(
        user.email,
        'Réinitialisation de votre mot de passe',
        `Bonjour,\n\nPour choisir un nouveau mot de passe, utilisez ce lien (valable ${clientConfig.security.resetTokenMinutes} minutes) :\n${link}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez ce message.`,
      );
    }
    await audit(req, { action: 'auth.password_reset_requested', actorId: String(user._id), actorEmail: user.email });
  }
  // Réponse identique que le compte existe ou non : pas d'énumération des utilisateurs.
  res.json({ ok: true });
});

authRouter.post('/reset-password', authLimiter, async (req, res) => {
  const body = parse(z.object({ token: z.string().min(20).max(200), password: passwordSchema }), req.body);
  const user = await User.findOne({ resetTokenHash: sha256(body.token), resetExpiresAt: { $gt: new Date() } }).select(
    '+passwordHash +resetTokenHash +resetExpiresAt',
  );
  if (!user) throw badRequest('Lien invalide ou expiré', 'BAD_TOKEN');
  user.passwordHash = await hashPassword(body.password);
  user.passwordChangedAt = new Date();
  user.resetTokenHash = undefined;
  user.resetExpiresAt = undefined;
  user.failedAttempts = 0;
  user.lockUntil = undefined;
  user.tokenVersion += 1; // déconnecte toutes les sessions existantes
  await user.save();
  await revokeAllSessions(String(user._id));
  await audit(req, { action: 'auth.password_reset', actorId: String(user._id), actorEmail: user.email });
  void sendMail(user.email, 'Votre mot de passe a été modifié', "Votre mot de passe vient d'être modifié. Si ce n'était pas vous, contactez immédiatement votre service RH.");
  res.json({ ok: true });
});

authRouter.post('/activate', authLimiter, async (req, res) => {
  const body = parse(z.object({ token: z.string().min(20).max(200), password: passwordSchema }), req.body);
  const user = await User.findOne({ inviteTokenHash: sha256(body.token), inviteExpiresAt: { $gt: new Date() }, status: 'invited' }).select(
    '+passwordHash +inviteTokenHash +inviteExpiresAt',
  );
  if (!user) throw badRequest("Lien d'activation invalide ou expiré", 'BAD_TOKEN');
  user.passwordHash = await hashPassword(body.password);
  user.passwordChangedAt = new Date();
  user.inviteTokenHash = undefined;
  user.inviteExpiresAt = undefined;
  user.status = 'active';
  await user.save();
  await audit(req, { action: 'auth.account_activated', actorId: String(user._id), actorEmail: user.email });
  res.json({ ok: true });
});

authRouter.post('/change-password', requireAuth({ allowPending2fa: true }), async (req, res) => {
  const auth = authOf(req);
  const body = parse(z.object({ currentPassword: z.string().max(200), newPassword: passwordSchema }), req.body);
  const user = await User.findById(auth.userId).select('+passwordHash');
  if (!user?.passwordHash || !(await verifyPassword(user.passwordHash, body.currentPassword))) {
    throw unauthorized('Mot de passe actuel incorrect', 'INVALID_CREDENTIALS');
  }
  user.passwordHash = await hashPassword(body.newPassword);
  user.passwordChangedAt = new Date();
  user.tokenVersion += 1;
  await user.save();
  await revokeAllSessions(String(user._id));
  await startSession(req, res, user); // la session courante reste valide avec le nouveau tokenVersion
  await audit(req, { action: 'auth.password_changed' });
  res.json({ ok: true });
});

// ---------- Double authentification (TOTP) ----------

authRouter.post('/2fa/setup', requireAuth({ allowPending2fa: true }), async (req, res) => {
  const user = await User.findById(authOf(req).userId);
  if (!user) throw notFound();
  if (user.twoFactor?.enabled) throw badRequest('La double authentification est déjà activée');
  const secret = newTotpSecret();
  user.twoFactor = { ...(user.twoFactor ?? { enabled: false, recoveryCodes: [] }), pendingSecret: secret } as typeof user.twoFactor;
  await user.save();
  res.json({ secret, qrDataUrl: await totpQrDataUrl(user.email, secret) });
});

authRouter.post('/2fa/enable', requireAuth({ allowPending2fa: true }), async (req, res) => {
  const body = parse(z.object({ code: z.string().length(6) }), req.body);
  const user = await User.findById(authOf(req).userId);
  const pending = user?.twoFactor?.pendingSecret;
  if (!user || !pending) throw badRequest("Démarrez d'abord la configuration", 'NO_PENDING_SECRET');
  if (!(await verifyTotp(pending, body.code))) throw badRequest('Code invalide', 'INVALID_2FA_CODE');
  const codes = newRecoveryCodes();
  user.set({
    'twoFactor.secret': pending,
    'twoFactor.pendingSecret': undefined,
    'twoFactor.enabled': true,
    'twoFactor.recoveryCodes': codes.hashed,
  });
  await user.save();
  await audit(req, { action: 'auth.2fa_enabled' });
  res.json({ recoveryCodes: codes.plain });
});

authRouter.post('/2fa/disable', requireAuth(), async (req, res) => {
  const auth = authOf(req);
  if (clientConfig.security.require2faForRoles.includes(auth.role)) {
    throw badRequest('La double authentification est obligatoire pour votre rôle', 'TWO_FACTOR_MANDATORY');
  }
  const body = parse(z.object({ password: z.string().max(200), code: z.string().length(6) }), req.body);
  const user = await User.findById(auth.userId).select('+passwordHash');
  if (!user?.passwordHash || !(await verifyPassword(user.passwordHash, body.password))) throw unauthorized('Mot de passe incorrect', 'INVALID_CREDENTIALS');
  if (!user.twoFactor?.secret || !(await verifyTotp(user.twoFactor.secret, body.code))) throw badRequest('Code invalide', 'INVALID_2FA_CODE');
  user.twoFactor = { enabled: false, recoveryCodes: [] } as unknown as typeof user.twoFactor;
  await user.save();
  await audit(req, { action: 'auth.2fa_disabled' });
  res.json({ ok: true });
});
