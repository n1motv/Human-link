import nodemailer from 'nodemailer';
import { env, isProd, isTest } from '../config/env.js';
import { clientConfig } from '../config/client.js';
import { MailJob } from '../models/MailJob.js';
import { logger } from './logger.js';
import { reportError, scrubText } from './monitoring.js';

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

/** Délais entre deux essais : 1 min, 5 min, 30 min, 2 h, 6 h. Après le dernier, le message passe en « échec » et attend l'administrateur. */
export const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3600_000, 6 * 3600_000];
export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;
/** Durée pendant laquelle un message « pris » par un envoi n'est pas repris par un autre. */
const LEASE_MS = 5 * 60_000;

/**
 * Envoie un e-mail texte. Ne lève jamais : un échec d'envoi ne doit pas casser une action métier.
 * Avec un serveur SMTP, le message est d'abord ENREGISTRÉ puis envoyé par la file (nouveaux essais espacés en cas de panne).
 */
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
    await enqueueMail(to, subject, body);
    void processMailQueue(); // premier essai tout de suite, sans attendre le prochain passage
  } catch (err) {
    logger.error({ err }, "E-mail non enregistré dans la file d'attente");
  }
}

export async function enqueueMail(to: string, subject: string, body: string) {
  return MailJob.create({ to, subject, text: body });
}

export type Sender = (mail: { to: string; subject: string; text: string }) => Promise<void>;

const smtpSender: Sender = async ({ to, subject, text }) => {
  if (!transporter) throw new Error('SMTP non configuré');
  await transporter.sendMail({ from: env.MAIL_FROM, to, subject, text });
};

/**
 * Envoie les messages dont l'heure est venue. Chaque message est « pris » de façon atomique avant l'envoi : deux passages simultanés
 * (deux processus, ou un essai immédiat et le passage régulier) n'envoient jamais deux fois le même e-mail.
 * `send` et `now` sont injectables pour les tests.
 */
export async function processMailQueue(send: Sender = smtpSender, now: () => Date = () => new Date(), batch = 20): Promise<{ sent: number; failed: number; retried: number }> {
  const result = { sent: 0, failed: 0, retried: 0 };
  for (let i = 0; i < batch; i++) {
    const at = now();
    const job = await MailJob.findOneAndUpdate(
      { status: 'pending', nextAttemptAt: { $lte: at } },
      { $inc: { attempts: 1 }, $set: { nextAttemptAt: new Date(at.getTime() + LEASE_MS) } },
      { sort: { nextAttemptAt: 1 }, new: true },
    );
    if (!job) break;
    try {
      await send({ to: job.to, subject: job.subject, text: job.text ?? '' });
      await MailJob.updateOne({ _id: job._id }, { $set: { status: 'sent', sentAt: now() }, $unset: { text: 1, lastError: 1 } }); // le corps (lien d'activation) est effacé
      result.sent++;
    } catch (err) {
      const reason = scrubText((err as Error)?.message ?? err, 300);
      if (job.attempts >= MAX_ATTEMPTS) {
        await MailJob.updateOne({ _id: job._id }, { $set: { status: 'failed', lastError: reason } });
        result.failed++;
        // L'équipe est prévenue (journal d'erreurs, alerte webhook) : l'e-mail attend maintenant l'administrateur.
        reportError({ source: 'server', kind: 'mail', message: `E-mail abandonné après ${job.attempts} essais : ${reason}` });
      } else {
        await MailJob.updateOne({ _id: job._id }, { $set: { nextAttemptAt: new Date(now().getTime() + RETRY_DELAYS_MS[job.attempts - 1]!), lastError: reason } });
        result.retried++;
      }
    }
  }
  return result;
}

let timer: NodeJS.Timeout | undefined;
/** Passage régulier de la file (toutes les 30 s) : reprend les messages dont le prochain essai est arrivé, y compris après un redémarrage. */
export function startMailWorker() {
  if (timer || isTest || !transporter) return;
  timer = setInterval(() => void processMailQueue().catch((err) => logger.error({ err }, 'Passage de la file e-mail en erreur')), 30_000);
  timer.unref();
  void processMailQueue();
}
export function stopMailWorker() {
  if (timer) clearInterval(timer);
  timer = undefined;
}
