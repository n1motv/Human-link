import crypto from 'node:crypto';
import { clientConfig } from '../config/client.js';
import { env, isTest } from '../config/env.js';
import { badRequest } from './errors.js';
import { logger } from './logger.js';

const ENDPOINT = 'https://api.pwnedpasswords.com/range/';

const enabled = () => (env.HIBP_ENABLED ?? !isTest) && clientConfig.security.checkPwnedPasswords;

/**
 * Nombre d'apparitions du mot de passe dans des fuites publiques (0 = jamais vu, ou service injoignable).
 * Méthode k-anonymat : seuls les 5 premiers caractères de l'empreinte SHA-1 quittent le serveur, jamais le mot de passe.
 * Si le service ne répond pas, on laisse passer : une panne externe ne doit pas empêcher de changer de mot de passe.
 */
export async function pwnedCount(password: string): Promise<number> {
  if (!enabled()) return 0;
  const sha1 = crypto.createHash('sha1').update(password).digest('hex').toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);
  try {
    const res = await fetch(ENDPOINT + prefix, {
      headers: { 'Add-Padding': 'true', 'User-Agent': 'human-link-password-check' },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    for (const line of (await res.text()).split(/\r?\n/)) {
      const [hash, count] = line.trim().split(':');
      if (hash === suffix) return Number(count) || 0;
    }
    return 0;
  } catch (err) {
    logger.warn({ err: String(err) }, 'Vérification des fuites de mots de passe indisponible : mot de passe accepté sans contrôle');
    return 0;
  }
}

/** Refuse un mot de passe qui figure dans une fuite connue. */
export async function assertNotPwned(password: string): Promise<void> {
  if ((await pwnedCount(password)) > 0) {
    throw badRequest('Ce mot de passe apparaît dans des fuites de données connues. Choisissez-en un autre.', 'PASSWORD_PWNED');
  }
}
