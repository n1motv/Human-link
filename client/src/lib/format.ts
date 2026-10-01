/** Formatage dépendant de la langue courante (Intl) : dates, nombres, montants. */
export function fmtDate(value: string | Date | undefined | null, lang: string, opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }): string {
  if (!value) return '—';
  // Les dates métier AAAA-MM-JJ sont sans fuseau : on les lit en UTC pour éviter un décalage d'un jour.
  const d = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const o = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? { ...opts, timeZone: 'UTC' } : opts;
  return new Intl.DateTimeFormat(intlLocale(lang), o).format(d);
}

export const fmtDateTime = (v: string | Date, lang: string) => fmtDate(v, lang, { dateStyle: 'medium', timeStyle: 'short' });

export function fmtMoney(n: number | undefined | null, lang: string): string {
  if (n === undefined || n === null) return '—';
  return new Intl.NumberFormat(intlLocale(lang), { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(n);
}

export const fmtNumber = (n: number, lang: string) => new Intl.NumberFormat(intlLocale(lang), { maximumFractionDigits: 2 }).format(n);

/** Le tamazight n'a pas toujours de données Intl dans le navigateur : repli sur le français. */
function intlLocale(lang: string): string {
  return lang === 'zgh' ? 'fr' : lang;
}

export const todayIso = () => new Date().toISOString().slice(0, 10);

export function addDaysIso(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const initials = (prenom?: string, nom?: string) => `${prenom?.[0] ?? ''}${nom?.[0] ?? ''}`.toUpperCase();

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} Ko`;
  return `${(n / 1024 / 1024).toFixed(1)} Mo`;
}
