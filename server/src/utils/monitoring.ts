import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { logger } from './logger.js';

/**
 * Suivi des erreurs auto-hébergé, sans service tiers : chaque erreur (navigateur ou serveur) est nettoyée de toute donnée
 * personnelle puis journalisée au niveau « error » ; avec ERROR_WEBHOOK_URL (Slack, Teams, Mattermost, ntfy…), l'équipe est aussi prévenue.
 */

const EMAIL = /[^\s@<>"']+@[^\s@<>"']+\.[a-z]{2,}/gi;
const OBJECT_ID = /\b[0-9a-f]{24}\b/gi;
const LONG_TOKEN = /\b[A-Za-z0-9_-]{32,}\b/g;
const LONG_NUMBER = /\b\d{6,}\b/g;

/** Retire e-mails, identifiants, jetons et longs nombres d'un texte libre, puis le tronque. */
export function scrubText(value: unknown, max = 300): string {
  return String(value ?? '')
    .replace(EMAIL, '[email]')
    .replace(OBJECT_ID, ':id')
    .replace(LONG_TOKEN, '[jeton]')
    .replace(LONG_NUMBER, '[n]')
    .slice(0, max);
}

/** Garde le chemin d'une adresse : ni paramètres, ni ancre, ni identifiants (/employees/6650… devient /employees/:id). */
export function scrubPath(value: unknown): string {
  const raw = String(value ?? '').split(/[?#]/)[0] ?? '';
  const path = raw.replace(/^https?:\/\/[^/]+/i, '');
  return scrubText(path.replace(/\/[0-9a-f]{24}(?=\/|$)/gi, '/:id').replace(/\/\d+(?=\/|$)/g, '/:id'), 200);
}

/** Pile d'appels : les premières lignes suffisent à situer l'erreur ; les adresses perdent leurs paramètres. */
export function scrubStack(value: unknown): string {
  return String(value ?? '')
    .split('\n')
    .slice(0, 12)
    .map((l) => scrubText(l.replace(/\?[^\s)]*/g, ''), 200))
    .join('\n')
    .slice(0, 2000);
}

export interface ErrorEvent {
  source: 'browser' | 'server';
  kind: string;
  message: string;
  stack?: string;
  route?: string;
  component?: string;
  release?: string;
}

const lastSent = new Map<string, number>();
const QUIET_MS = 10 * 60_000;

/** Empreinte stable : la même erreur répétée ne déclenche qu'une alerte par plage de 10 minutes. */
export function fingerprint(e: Pick<ErrorEvent, 'source' | 'kind' | 'message' | 'stack'>): string {
  const firstFrame = e.stack?.split('\n').find((l) => l.trim().startsWith('at ')) ?? '';
  return crypto.createHash('sha1').update(`${e.source}|${e.kind}|${e.message}|${firstFrame}`).digest('hex').slice(0, 12);
}

/** Journalise l'erreur (déjà nettoyée) et, si configuré, prévient l'équipe. Ne lève jamais d'exception. */
export function reportError(event: ErrorEvent): void {
  const id = fingerprint(event);
  logger.error({ monitoring: { id, ...event } }, `Erreur ${event.source === 'browser' ? 'navigateur' : 'serveur'} : ${event.message.slice(0, 120)}`);

  const url = env.ERROR_WEBHOOK_URL;
  if (!url) return;
  const now = Date.now();
  if (now - (lastSent.get(id) ?? 0) < QUIET_MS) return;
  lastSent.set(id, now);
  if (lastSent.size > 500) lastSent.clear();
  const where = event.route ? ` sur ${event.route}` : '';
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // « text » est compris par Slack, Mattermost et Teams (Workflows) ; les autres champs servent aux outils maison.
    body: JSON.stringify({ text: `Human Link — erreur ${event.source}${where} : ${event.message.slice(0, 200)} (réf. ${id})`, ...event, id }),
    signal: AbortSignal.timeout(3000),
  }).catch((err) => logger.warn({ err: scrubText(err?.message) }, 'Alerte d’erreur non envoyée'));
}
