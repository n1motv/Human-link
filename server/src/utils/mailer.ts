import nodemailer from 'nodemailer';
import { env, isProd, isTest } from '../config/env.js';
import { clientConfig } from '../config/client.js';
import { logger } from './logger.js';

const transporter = env.SMTP_HOST
  ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    })
  : null;

if (!transporter && isProd) logger.warn('SMTP non configuré : aucun e-mail ne sera envoyé (activation et réinitialisation impossibles).');

/** Boîte d'envoi en mémoire pour les tests. */
export const outbox: { to: string; subject: string; text: string }[] = [];

const signature = () => `\n\n--\n${clientConfig.company.name}`;

/** Envoie un e-mail texte. Ne lève jamais : un échec d'envoi ne doit pas casser une action métier. */
export async function sendMail(to: string, subject: string, text: string): Promise<void> {
  const body = text + signature();
  if (isTest) {
    outbox.push({ to, subject, text: body });
    return;
  }
  if (!transporter) {
    // Développement : on affiche le message (les liens d'activation y figurent). Jamais en production.
    if (!isProd) logger.info(`\n===== E-MAIL (non envoyé, SMTP absent) =====\nÀ : ${to}\nSujet : ${subject}\n\n${body}\n============================================`);
    return;
  }
  try {
    await transporter.sendMail({ from: env.MAIL_FROM, to, subject, text: body });
  } catch (err) {
    logger.error({ err }, "Échec d'envoi d'e-mail");
  }
}
