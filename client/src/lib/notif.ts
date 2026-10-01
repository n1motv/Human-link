import type { TFunction } from 'i18next';
import { fmtDateTime } from './format';
import type { Notif } from './types';

/** Traduit une notification : clé + paramètres du serveur, repli sur le texte français stocké. */
export function renderNotif(n: Notif, t: TFunction, lang: string): string {
  if (!n.key) return n.message;
  const params: Record<string, string | number> = { ...(n.params ?? {}) };
  if (typeof params.when === 'string') params.when = fmtDateTime(params.when, lang);
  if (typeof params.response === 'string') params.response = t(params.response === 'accepté' ? 'notifParams.accepted' : 'notifParams.refused');
  return t(`notif.${n.key}`, { ...params, defaultValue: n.message });
}
