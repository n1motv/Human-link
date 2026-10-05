import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { readableOn } from '../lib/branding';
import { addDaysIso, todayIso } from '../lib/format';

export interface CalItem {
  id: string;
  start: string;
  end: string;
  label: string;
  color: string;
  /** Texte long pour l'infobulle / lecteurs d'écran. */
  detail?: string;
}

interface Props {
  items: CalItem[];
  month: Date;
  onMonthChange: (d: Date) => void;
  /** Premier jour de la semaine : 1 = lundi. */
  weekStart?: 0 | 1;
}

const iso = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** Calendrier mensuel léger : pas de dépendance externe, adaptatif, compatible RTL. */
export function MonthCalendar({ items, month, onMonthChange, weekStart = 1 }: Props) {
  const { i18n } = useTranslation();
  const lang = i18n.language;
  const [selected, setSelected] = useState<string | null>(null);
  const y = month.getFullYear();
  const m = month.getMonth();

  const { cells, weekdays } = useMemo(() => {
    const first = new Date(Date.UTC(y, m, 1));
    const lead = (first.getUTCDay() - weekStart + 7) % 7;
    const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const total = Math.ceil((lead + days) / 7) * 7;
    const cells = Array.from({ length: total }, (_, i) => {
      const d = i - lead + 1;
      return d >= 1 && d <= days ? iso(y, m, d) : null;
    });
    // 2024-01-01 est un lundi : base stable pour les noms de jours localisés.
    const weekdays = Array.from({ length: 7 }, (_, i) =>
      new Intl.DateTimeFormat(lang, { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, 1 + ((i + weekStart + 6) % 7)))),
    );
    return { cells, weekdays };
  }, [y, m, weekStart, lang]);

  const byDay = useMemo(() => {
    const map = new Map<string, CalItem[]>();
    for (const it of items) for (let d = it.start; d <= it.end; d = addDaysIso(d, 1)) map.set(d, [...(map.get(d) ?? []), it]);
    return map;
  }, [items]);

  const title = new Intl.DateTimeFormat(lang, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m, 1)));
  const today = todayIso();
  const sel = selected ? byDay.get(selected) ?? [] : [];

  return (
    <div className="glass p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <button aria-label="Mois précédent" className="btn btn-icon btn-sm" onClick={() => onMonthChange(new Date(y, m - 1, 1))}>
          <ChevronLeft size={18} className="rtl:rotate-180" />
        </button>
        <h2 className="text-lg font-bold capitalize">{title}</h2>
        <button aria-label="Mois suivant" className="btn btn-icon btn-sm" onClick={() => onMonthChange(new Date(y, m + 1, 1))}>
          <ChevronRight size={18} className="rtl:rotate-180" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-subtle">
        {weekdays.map((w) => (
          <div key={w} className="py-1">
            {w}
          </div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (!day) return <div key={i} className="min-h-14 sm:min-h-24" />;
          const list = byDay.get(day) ?? [];
          const isToday = day === today;
          return (
            <button
              key={day}
              onClick={() => setSelected(day === selected ? null : day)}
              aria-label={`${day}${list.length ? `, ${list.length}` : ''}`}
              className={clsx(
                'min-h-14 rounded-xl border p-1 text-start align-top transition sm:min-h-24 sm:p-2',
                selected === day ? 'border-accent bg-glass-hover' : 'border-transparent bg-glass hover:bg-glass-hover',
              )}
            >
              <span className={clsx('inline-grid h-6 w-6 place-items-center rounded-full text-xs font-semibold', isToday && 'bg-gradient-to-br from-accent to-accent2 text-on-accent')}>
                {Number(day.slice(8))}
              </span>
              <div className="mt-1 hidden space-y-0.5 sm:block">
                {list.slice(0, 3).map((it) => (
                  <div key={it.id + day} className="truncate rounded-md px-1.5 py-0.5 text-xs font-semibold leading-snug" style={{ background: it.color, color: readableOn(it.color) }} title={it.label}>
                    {it.label}
                  </div>
                ))}
                {list.length > 3 && <div className="text-[11px] text-muted">+{list.length - 3}</div>}
              </div>
              <div className="mt-1 flex flex-wrap gap-0.5 sm:hidden">
                {list.slice(0, 4).map((it) => (
                  <span key={it.id + day} className="h-1.5 w-1.5 rounded-full" style={{ background: it.color }} />
                ))}
              </div>
            </button>
          );
        })}
      </div>

      {selected && (
        <div className="mt-4 rounded-2xl border border-line bg-glass p-4">
          <p className="mb-2 text-sm font-semibold">{new Intl.DateTimeFormat(lang, { dateStyle: 'full', timeZone: 'UTC' }).format(new Date(`${selected}T00:00:00Z`))}</p>
          {sel.length === 0 ? (
            <p className="text-sm text-muted">—</p>
          ) : (
            <ul className="space-y-1.5">
              {sel.map((it) => (
                <li key={it.id} className="flex items-center gap-2 text-sm">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: it.color }} />
                  <span className="font-medium">{it.label}</span>
                  {it.detail && <span className="text-muted">· {it.detail}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export function monthRange(d: Date): { from: string; to: string } {
  const from = iso(d.getFullYear(), d.getMonth(), 1);
  const to = iso(d.getFullYear(), d.getMonth(), new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate());
  return { from, to };
}
