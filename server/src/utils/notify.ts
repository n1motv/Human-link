import type { ClientSession, Types } from 'mongoose';
import { Notification } from '../models/Notification.js';
import { User } from '../models/User.js';
import { clientConfig } from '../config/client.js';
import { sendMail } from './mailer.js';

type Id = string | Types.ObjectId;
type Params = Record<string, string | number>;

/**
 * Catalogue des notifications. Le serveur stocke la clé + les paramètres : le navigateur traduit
 * (fichiers de langue du front, entrée `notif.<clé>`). Le texte français ci-dessous sert de repli
 * et de corps d'e-mail.
 */
const FR = {
  'leave.submitted': (p: Params) => `${p.name} a déposé une demande de congé du ${p.from} au ${p.to}.`,
  'leave.manager_accepted': (p: Params) => `La demande de congé de ${p.name} a été acceptée par son manager et requiert votre approbation.`,
  'leave.accepted': (p: Params) => `Votre demande de congé du ${p.from} au ${p.to} a été acceptée.`,
  'leave.refused_manager': (p: Params) => `Votre demande de congé a été refusée par votre manager : ${p.motif}.`,
  'leave.refused_admin': (p: Params) => `Votre demande de congé a été refusée par l'administration : ${p.motif}.`,
  'sick.submitted': (p: Params) => `${p.name} a déposé un arrêt maladie du ${p.from} au ${p.to}.`,
  'sick.accepted': () => 'Votre arrêt maladie a été accepté.',
  'sick.refused': (p: Params) => `Votre arrêt maladie a été refusé : ${p.motif}.`,
  'bonus.submitted_admin': (p: Params) => `${p.manager} a soumis une demande de prime de ${p.montant} € pour ${p.employee}.`,
  'bonus.submitted_employee': (p: Params) => `Votre manager ${p.manager} a soumis une demande de prime de ${p.montant} € en votre faveur.`,
  'bonus.accepted': (p: Params) => `La demande de prime pour ${p.employee} a été acceptée.`,
  'bonus.refused': (p: Params) => `La demande de prime pour ${p.employee} a été refusée : ${p.motif}.`,
  'meeting.invited': (p: Params) => `${p.manager} vous invite à la réunion « ${p.title} » le ${p.when}.`,
  'meeting.responded': (p: Params) => `${p.name} a répondu « ${p.response} » à votre invitation « ${p.title} ».`,
  'document.added': (p: Params) => `Un nouveau document a été déposé dans votre coffre-fort : ${p.label}.`,
  'telework.reminder': () => 'Pensez à choisir vos jours de télétravail pour la semaine prochaine.',
  'telework.max_set': (p: Params) => `Votre manager a fixé votre quota à ${p.n} jour(s) de télétravail par semaine.`,
  'feedback.reminder': () => 'Nouveau mois : donnez votre avis anonyme sur votre environnement de travail.',
  'contact.new': (p: Params) => `Nouvelle demande de contact : ${p.sujet}.`,
  'org.new_manager': (p: Params) => `${p.name} est désormais votre manager.`,
} satisfies Record<string, (p: Params) => string>;

export type NotifKey = keyof typeof FR;

interface NotifyOptions {
  /** Envoyer aussi un e-mail avec ce sujet. */
  emailSubject?: string;
  /** Transaction en cours : les notifications y sont écrites. */
  session?: ClientSession;
  /** Ne pas envoyer les e-mails tout de suite : les rendre à l'appelant, qui les envoie une fois la transaction validée. */
  deferMail?: boolean;
}

/** E-mail prêt à partir, à lancer quand la transaction est validée. */
export type DeferredMail = () => Promise<void>;

export async function notify(userIds: Id | Id[], type: string, key: NotifKey, params: Params = {}, opts: NotifyOptions = {}): Promise<DeferredMail[]> {
  const ids = [...new Set((Array.isArray(userIds) ? userIds : [userIds]).map(String))];
  const deferred: DeferredMail[] = [];
  if (!ids.length) return deferred;
  const { session } = opts;
  const message = FR[key](params);
  const users = await User.find({ _id: { $in: ids }, status: { $in: ['active', 'invited'] } }, { email: 1 });
  for (const u of users) {
    await Notification.create([{ userId: u._id, type, key, params, message }], { session });
    // Plafond par utilisateur : on garde les plus récentes.
    const max = clientConfig.notifications.maxPerUser;
    const stale = await Notification.find({ userId: u._id })
      .sort({ createdAt: -1 })
      .skip(max)
      .select('_id')
      .session(session ?? null);
    if (stale.length) await Notification.deleteMany({ _id: { $in: stale.map((s) => s._id) } }, { session });
    if (opts.emailSubject) {
      const subject = opts.emailSubject;
      const send = () => sendMail(u.email, subject, `Bonjour,\n\n${message}\n\nCordialement,\nL'équipe RH`);
      if (opts.deferMail) deferred.push(send);
      else void send();
    }
  }
  return deferred;
}

/** Envoie les e-mails différés (après validation de la transaction). Un échec d'envoi ne remonte jamais : sendMail ne lève pas. */
export async function sendDeferred(mails: DeferredMail[]): Promise<void> {
  await Promise.all(mails.map((m) => m()));
}

export async function adminIds(): Promise<string[]> {
  const admins = await User.find({ role: 'admin', status: 'active' }, { _id: 1 });
  return admins.map((a) => String(a._id));
}

export async function notifyAdmins(type: string, key: NotifKey, params: Params = {}, opts: NotifyOptions = {}) {
  return notify(await adminIds(), type, key, params, opts);
}
