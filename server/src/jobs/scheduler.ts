import cron from 'node-cron';
import { AuditLog } from '../models/AuditLog.js';
import { ContactRequest } from '../models/ContactRequest.js';
import { Feedback } from '../models/Feedback.js';
import { Notification } from '../models/Notification.js';
import { User } from '../models/User.js';
import { clientConfig } from '../config/client.js';
import { currentMonth } from '../utils/dates.js';
import { logger } from '../utils/logger.js';
import { notify } from '../utils/notify.js';
import { anonymizeUser } from '../modules/rgpd/anonymize.js';

/**
 * Crédite les jours de congé du mois. Idempotent (champ dernierMoisMaj) : peut être rejoué sans risque,
 * ce qui rattrape aussi un serveur éteint au moment du passage du cron.
 */
export async function accrueMonthlyLeave(): Promise<number> {
  const month = currentMonth();
  const amount = clientConfig.hr.monthlyLeaveAccrual;
  const r = await User.updateMany(
    { status: 'active', role: { $ne: 'admin' }, dernierMoisMaj: { $ne: month } },
    { $inc: { soldeConge: amount }, $set: { dernierMoisMaj: month } },
  );
  if (r.modifiedCount) logger.info(`Congés mensuels crédités à ${r.modifiedCount} personne(s)`);
  return r.modifiedCount;
}

async function remind(key: 'telework.reminder' | 'feedback.reminder', type: string) {
  const people = await User.find({ status: 'active', role: { $ne: 'admin' } }, '_id');
  await notify(people.map((p) => p._id), type, key, {}, { emailSubject: type === 'Télétravail' ? 'Choix des jours de télétravail' : 'Votre avis compte' });
}

/**
 * Rétention RGPD : on ne garde pas les données plus longtemps que nécessaire.
 * Les durées viennent de client.config.json (gdpr.*).
 */
export async function purgeExpiredData() {
  const g = clientConfig.gdpr;
  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
  const [a, n, c] = await Promise.all([
    AuditLog.deleteMany({ at: { $lt: daysAgo(g.auditLogRetentionDays) } }),
    Notification.deleteMany({ createdAt: { $lt: daysAgo(g.notificationRetentionDays) } }),
    ContactRequest.deleteMany({ createdAt: { $lt: daysAgo(g.contactRequestRetentionDays) } }),
  ]);
  const cutoffMonth = new Date();
  cutoffMonth.setUTCMonth(cutoffMonth.getUTCMonth() - g.feedbackRetentionMonths);
  const f = await Feedback.deleteMany({ month: { $lt: cutoffMonth.toISOString().slice(0, 7) } });

  // Comptes archivés depuis plus longtemps que la durée légale : anonymisation automatique.
  let anonymized = 0;
  if (g.departedEmployeeRetentionYears > 0) {
    const limit = new Date();
    limit.setUTCFullYear(limit.getUTCFullYear() - g.departedEmployeeRetentionYears);
    for (const u of await User.find({ status: 'archived', updatedAt: { $lt: limit } })) {
      await anonymizeUser(u);
      anonymized++;
    }
  }
  logger.info({ audit: a.deletedCount, notifications: n.deletedCount, contacts: c.deletedCount, feedback: f.deletedCount, anonymized }, 'Purge de rétention RGPD');
}

export function startJobs() {
  const { notifications } = clientConfig;
  void accrueMonthlyLeave().catch((err) => logger.error({ err }, 'Rattrapage des congés échoué'));
  cron.schedule(notifications.monthlyAccrualCron, () => void accrueMonthlyLeave().catch((err) => logger.error({ err }, 'Crédit des congés échoué')));
  cron.schedule(notifications.teleworkReminderCron, () => void remind('telework.reminder', 'Télétravail').catch((err) => logger.error({ err })));
  cron.schedule(notifications.feedbackReminderCron, () => void remind('feedback.reminder', 'Feedback').catch((err) => logger.error({ err })));
  cron.schedule('30 3 * * *', () => void purgeExpiredData().catch((err) => logger.error({ err }, 'Purge échouée')));
}
