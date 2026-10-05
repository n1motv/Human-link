import type { Response } from 'express';
import { clientConfig } from '../config/client.js';
import { sha256 } from './crypto.js';
import { HttpError } from './errors.js';

/**
 * Freinage progressif des tentatives de connexion, par couple (adresse IP, compte).
 * Les premières erreurs sont tolérées (faute de frappe) ; au-delà, chaque échec double le délai d'attente,
 * jusqu'à un plafond. Une connexion réussie remet le compteur à zéro.
 * En mémoire : suffisant pour une instance (une instance par client) ; à placer dans Redis si l'on répartit la charge.
 */
interface Entry {
  fails: number;
  blockedUntil: number;
  touched: number;
}

const entries = new Map<string, Entry>();
const IDLE_RESET_MS = 30 * 60_000;

const keyOf = (ip: string, account: string) => sha256(`${ip}|${account.toLowerCase()}`);

/** Délai imposé après `fails` échecs consécutifs (0 tant que les tentatives gratuites ne sont pas épuisées). */
export function throttleDelayMs(fails: number): number {
  const { loginFreeAttempts, loginBaseDelaySeconds, loginMaxDelayMinutes } = clientConfig.security;
  if (fails <= loginFreeAttempts) return 0;
  return Math.min(loginMaxDelayMinutes * 60_000, loginBaseDelaySeconds * 1000 * 2 ** (fails - loginFreeAttempts - 1));
}

/** Refuse la tentative (429 + Retry-After) tant que le délai du couple IP/compte n'est pas écoulé. */
export function assertLoginAllowed(res: Response, ip: string, account: string): void {
  const e = entries.get(keyOf(ip, account));
  if (!e) return;
  const now = Date.now();
  if (now - e.touched > IDLE_RESET_MS) {
    entries.delete(keyOf(ip, account));
    return;
  }
  if (e.blockedUntil > now) {
    const retryAfterSeconds = Math.ceil((e.blockedUntil - now) / 1000);
    res.setHeader('Retry-After', String(retryAfterSeconds));
    throw new HttpError(429, `Trop de tentatives. Réessayez dans ${retryAfterSeconds} secondes.`, 'LOGIN_THROTTLED', { retryAfterSeconds });
  }
}

export function recordLoginFailure(ip: string, account: string): void {
  const k = keyOf(ip, account);
  const now = Date.now();
  const prev = entries.get(k);
  const fails = (prev && now - prev.touched <= IDLE_RESET_MS ? prev.fails : 0) + 1;
  entries.set(k, { fails, blockedUntil: now + throttleDelayMs(fails), touched: now });
}

export function recordLoginSuccess(ip: string, account: string): void {
  entries.delete(keyOf(ip, account));
}

/** Pour les tests. */
export function resetLoginThrottle(): void {
  entries.clear();
}

// Évite que la table grossisse indéfiniment sous une attaque par dispersion.
setInterval(() => {
  const now = Date.now();
  for (const [k, e] of entries) if (now - e.touched > IDLE_RESET_MS) entries.delete(k);
}, 10 * 60_000).unref();
