import argon2 from 'argon2';
import { z } from 'zod';
import { clientConfig } from '../config/client.js';

// Argon2id avec les paramètres par défaut de la bibliothèque (>= recommandations OWASP).
export const hashPassword = (plain: string) => argon2.hash(plain, { type: argon2.argon2id });

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

/** Empreinte factice : on la vérifie aussi pour les e-mails inconnus afin d'égaliser le temps de réponse. */
let dummy: Promise<string> | undefined;
export async function dummyVerify(plain: string): Promise<void> {
  dummy ??= hashPassword('dummy-password-for-timing-equalisation');
  await verifyPassword(await dummy, plain);
}

const COMMON = new Set([
  'password1234', 'azerty123456', 'motdepasse123', '123456789012', 'qwertyuiop12', 'administrator1',
]);

/** Politique NIST : longueur minimale (configurable), pas de règles de composition arbitraires, pas de mot de passe courant. */
export const passwordSchema = z
  .string()
  .max(200)
  .superRefine((v, ctx) => {
    const min = clientConfig.security.passwordMinLength;
    if (v.length < min) ctx.addIssue({ code: 'custom', message: `Au moins ${min} caractères` });
    if (COMMON.has(v.toLowerCase())) ctx.addIssue({ code: 'custom', message: 'Mot de passe trop courant' });
    if (!/[a-z]/i.test(v) || !/\d/.test(v)) ctx.addIssue({ code: 'custom', message: 'Doit contenir des lettres et au moins un chiffre' });
  });
