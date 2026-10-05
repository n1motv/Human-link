import { SignJWT, jwtVerify } from 'jose';
import { env } from '../config/env.js';
import { clientConfig } from '../config/client.js';

const key = Buffer.from(env.JWT_SECRET, 'hex');
const ISSUER = 'human-link';

export interface AccessClaims {
  sub: string;
  tv: number; // tokenVersion : permet la révocation globale
}

export async function signAccessToken(userId: string, tokenVersion: number): Promise<string> {
  return new SignJWT({ tv: tokenVersion, typ: 'access' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${clientConfig.security.accessTokenMinutes}m`)
    .sign(key);
}

export async function verifyAccessToken(token: string): Promise<AccessClaims | null> {
  try {
    const { payload } = await jwtVerify(token, key, { issuer: ISSUER, algorithms: ['HS256'] });
    if (payload.typ !== 'access' || typeof payload.sub !== 'string' || typeof payload.tv !== 'number') return null;
    return { sub: payload.sub, tv: payload.tv };
  } catch {
    return null;
  }
}

/** Lien « ce n'était pas moi » joint à l'e-mail d'alerte de nouvel appareil (valable 7 jours). */
export async function signNotMeToken(userId: string, deviceHash: string): Promise<string> {
  return new SignJWT({ typ: 'not-me', dev: deviceHash }).setProtectedHeader({ alg: 'HS256' }).setSubject(userId).setIssuer(ISSUER).setIssuedAt().setExpirationTime('7d').sign(key);
}

export async function verifyNotMeToken(token: string): Promise<{ userId: string; deviceHash: string } | null> {
  try {
    const { payload } = await jwtVerify(token, key, { issuer: ISSUER, algorithms: ['HS256'] });
    return payload.typ === 'not-me' && typeof payload.sub === 'string' && typeof payload.dev === 'string' ? { userId: payload.sub, deviceHash: payload.dev } : null;
  } catch {
    return null;
  }
}

/** Jeton court délivré après le mot de passe, à échanger contre une session avec le code 2FA. */
export async function signTwoFactorChallenge(userId: string): Promise<string> {
  return new SignJWT({ typ: '2fa-challenge' }).setProtectedHeader({ alg: 'HS256' }).setSubject(userId).setIssuer(ISSUER).setIssuedAt().setExpirationTime('5m').sign(key);
}

export async function verifyTwoFactorChallenge(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, key, { issuer: ISSUER, algorithms: ['HS256'] });
    return payload.typ === '2fa-challenge' && typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}
