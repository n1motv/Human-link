import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type InputHTMLAttributes, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, CalendarClock, CalendarRange, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { intlLocale } from '../lib/format';

export type PickerMode = 'date' | 'month' | 'datetime';

const pad = (n: number) => String(n).padStart(2, '0');
const isoDay = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

function parse(v: string): { y: number; m: number; d: number; h: number; min: number } | null {
  const r = /^(\d{4})-(\d{2})(?:-(\d{2}))?(?:T(\d{2}):(\d{2}))?/.exec(v);
  if (!r) return null;
  return { y: +r[1]!, m: +r[2]! - 1, d: r[3] ? +r[3] : 1, h: r[4] ? +r[4] : 9, min: r[5] ? +r[5] : 0 };
}

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { type: 'date' | 'month' | 'datetime-local'; invalid?: boolean };

/**
 * Sélecteur de date au style de l'application. Remplace <input type="date|month|datetime-local"> à l'identique
 * (value / onChange / min / max / {...register()}) : un champ natif masqué reste la source de vérité.
 */
export const DatePicker = forwardRef<HTMLInputElement, Props>(function DatePicker(
  { type, invalid, className, disabled, min, max, value, defaultValue, onChange, onBlur, name, id, ...rest },
  ref,
) {
  const mode: PickerMode = type === 'month' ? 'month' : type === 'datetime-local' ? 'datetime' : 'date';
  const { t, i18n } = useTranslation();
  const loc = intlLocale(i18n.language);
  const nativeRef = useRef<HTMLInputElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => nativeRef.current as HTMLInputElement);
  const uid = useId();

  const [current, setCurrent] = useState('');
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'days' | 'months' | 'years'>('days');
  const now = new Date();
  const [cursor, setCursor] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [time, setTime] = useState({ h: 9, min: 0 });
  const [pos, setPos] = useState({ left: 0, top: 0, up: false });

  const sync = useCallback(() => setCurrent(nativeRef.current?.value ?? ''), []);
  useLayoutEffect(sync);

  const minV = typeof min === 'string' ? min : '';
  const maxV = typeof max === 'string' ? max : '';
  const cmp = (iso: string) => iso.slice(0, mode === 'month' ? 7 : 10);
  const outOfRange = (iso: string) => (minV && cmp(iso) < cmp(minV)) || (maxV && cmp(iso) > cmp(maxV));

  const place = useCallback(() => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const width = 300;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    const up = window.innerHeight - r.bottom < 420 && r.top > window.innerHeight - r.bottom;
    setPos({ left, top: up ? r.top : r.bottom, up });
  }, []);

  const show = () => {
    if (disabled) return;
    const p = parse(nativeRef.current?.value ?? '');
    const base = p ?? { y: now.getFullYear(), m: now.getMonth(), d: now.getDate(), h: 9, min: 0 };
    setCursor({ y: base.y, m: base.m });
    setTime({ h: base.h, min: base.min });
    setView(mode === 'month' ? 'months' : 'days');
    place();
    setOpen(true);
  };

  const write = (v: string) => {
    const el = nativeRef.current;
    if (!el) return;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    setCurrent(nativeRef.current?.value ?? v);
  };

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      const n = e.target as Node;
      if (!btnRef.current?.contains(n) && !popRef.current?.contains(n)) setOpen(false);
    };
    const close = (e: Event) => {
      if (e.target instanceof Node && popRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', away);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('mousedown', away);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [open]);

  useEffect(() => {
    if (open && view === 'days') (popRef.current?.querySelector('[data-sel="true"], [data-today="true"]') as HTMLElement | null)?.focus({ preventScroll: true });
  }, [open, view]);

  const sel = parse(current);
  const fmt = (o: Intl.DateTimeFormatOptions, y: number, m: number, d = 1) => new Intl.DateTimeFormat(loc, { ...o, timeZone: 'UTC' }).format(new Date(Date.UTC(y, m, d)));
  const label = !sel
    ? ''
    : mode === 'month'
      ? fmt({ month: 'long', year: 'numeric' }, sel.y, sel.m)
      : mode === 'date'
        ? fmt({ dateStyle: 'medium' }, sel.y, sel.m, sel.d)
        : `${fmt({ dateStyle: 'medium' }, sel.y, sel.m, sel.d)} · ${pad(sel.h)}:${pad(sel.min)}`;

  const weekStart = i18n.language.startsWith('en') ? 0 : 1;
  const weekdays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(loc, { weekday: 'narrow', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, 7 + ((i + weekStart) % 7))))),
    [loc, weekStart],
  );
  const first = (new Date(Date.UTC(cursor.y, cursor.m, 1)).getUTCDay() - weekStart + 7) % 7;
  const total = daysIn(cursor.y, cursor.m);
  const prevTotal = daysIn(cursor.y, cursor.m - 1);
  const cells = Array.from({ length: 42 }, (_, i) => {
    const off = i - first + 1;
    if (off < 1) return { y: cursor.m === 0 ? cursor.y - 1 : cursor.y, m: (cursor.m + 11) % 12, d: prevTotal + off, other: true };
    if (off > total) return { y: cursor.m === 11 ? cursor.y + 1 : cursor.y, m: (cursor.m + 1) % 12, d: off - total, other: true };
    return { y: cursor.y, m: cursor.m, d: off, other: false };
  });
  const today = isoDay(now.getFullYear(), now.getMonth(), now.getDate());

  const pickDay = (iso: string) => {
    if (mode === 'datetime') write(`${iso}T${pad(time.h)}:${pad(time.min)}`);
    else {
      write(iso);
      setOpen(false);
      btnRef.current?.focus();
    }
  };
  const pickMonth = (m: number) => {
    if (mode === 'month') {
      write(`${cursor.y}-${pad(m + 1)}`);
      setOpen(false);
      btnRef.current?.focus();
    } else {
      setCursor({ ...cursor, m });
      setView('days');
    }
  };
  const setTimePart = (next: { h: number; min: number }) => {
    setTime(next);
    if (sel) write(`${isoDay(sel.y, sel.m, sel.d)}T${pad(next.h)}:${pad(next.min)}`);
  };

  const shift = (n: number) => {
    if (view === 'years') setCursor((c) => ({ ...c, y: c.y + n * 12 }));
    else if (view === 'months') setCursor((c) => ({ ...c, y: c.y + n }));
    else setCursor((c) => ({ y: c.y + Math.floor((c.m + n) / 12), m: (c.m + n + 12) % 12 }));
  };

  const onGridKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      btnRef.current?.focus();
    }
    const el = document.activeElement as HTMLElement | null;
    if (!step || !el?.dataset.iso) return;
    e.preventDefault();
    const [y, m, d] = el.dataset.iso.split('-').map(Number) as [number, number, number];
    const nd = new Date(Date.UTC(y, m - 1, d + step));
    const iso = isoDay(nd.getUTCFullYear(), nd.getUTCMonth(), nd.getUTCDate());
    if (nd.getUTCMonth() !== cursor.m || nd.getUTCFullYear() !== cursor.y) setCursor({ y: nd.getUTCFullYear(), m: nd.getUTCMonth() });
    setTimeout(() => (popRef.current?.querySelector(`[data-iso="${iso}"]`) as HTMLElement | null)?.focus(), 0);
  };

  const Icon = mode === 'month' ? CalendarRange : mode === 'datetime' ? CalendarClock : CalendarDays;
  const monthName = fmt({ month: 'long' }, cursor.y, cursor.m);
  const title = view === 'days' ? `${monthName} ${cursor.y}` : view === 'months' ? String(cursor.y) : `${cursor.y - 4} – ${cursor.y + 7}`;

  return (
    <div className="relative">
      <input
        ref={nativeRef}
        type={type}
        id={id}
        name={name}
        min={min}
        max={max}
        value={value}
        defaultValue={defaultValue}
        disabled={disabled}
        onChange={onChange}
        onBlur={onBlur}
        tabIndex={-1}
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
        {...rest}
      />
      {/* aria-invalid pilote le style d'erreur du champ (.field[aria-invalid]) ; le champ natif masqué porte la validation. */}
      {/* eslint-disable-next-line jsx-a11y/role-supports-aria-props */}
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={rest['aria-label']}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={(e) => {
          if (!open && e.key === 'ArrowDown') (e.preventDefault(), show());
        }}
        className={clsx('field flex items-center gap-2 text-start disabled:opacity-60', className)}
      >
        <span className={clsx('min-w-0 flex-1 truncate', !label && 'text-subtle')}>{label || t('common.pickDate')}</span>
        <Icon size={16} className="shrink-0 text-muted" aria-hidden />
      </button>

      {open &&
        createPortal(
          <div
            ref={popRef}
            role="dialog"
            aria-label={label || t('common.pickDate')}
            id={`${uid}-pop`}
            style={{ left: pos.left, top: pos.top, width: 300, transform: pos.up ? 'translateY(calc(-100% - 6px))' : 'translateY(6px)' }}
            className="glass-strong rise fixed z-[100] p-3"
            onKeyDown={(e) => e.key === 'Escape' && (e.preventDefault(), setOpen(false), btnRef.current?.focus())}
          >
            <div className="mb-2 flex items-center gap-1">
              <button type="button" className="dp-nav" aria-label={t('common.previous')} onClick={() => shift(-1)}>
                <ChevronLeft size={18} className="rtl:rotate-180" />
              </button>
              <button
                type="button"
                className="flex-1 rounded-xl px-2 py-1.5 text-center font-display text-base font-bold capitalize hover:bg-glass-hover"
                onClick={() => setView(view === 'days' ? 'months' : view === 'months' ? 'years' : 'days')}
              >
                {title}
              </button>
              <button type="button" className="dp-nav" aria-label={t('common.next')} onClick={() => shift(1)}>
                <ChevronRight size={18} className="rtl:rotate-180" />
              </button>
            </div>

            {view === 'days' && (
              <div key={`${cursor.y}-${cursor.m}`} onKeyDown={onGridKey} className="dp-fade">
                <div className="mb-1 grid grid-cols-7 text-center text-xs font-semibold text-subtle">
                  {weekdays.map((w, i) => (
                    <span key={i} className="py-1">
                      {w}
                    </span>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-y-1" role="grid">
                  {cells.map((c) => {
                    const iso = isoDay(c.y, c.m, c.d);
                    const disabledDay = !!outOfRange(iso);
                    const selected = !!sel && sel.y === c.y && sel.m === c.m && sel.d === c.d;
                    return (
                      <button
                        key={iso}
                        type="button"
                        role="gridcell"
                        data-iso={iso}
                        data-sel={selected}
                        data-today={iso === today && !selected}
                        aria-selected={selected}
                        disabled={disabledDay}
                        tabIndex={selected || (iso === today && !sel) ? 0 : -1}
                        onClick={() => pickDay(iso)}
                        className={clsx('dp-day', c.other && 'text-subtle/60', iso === today && !selected && 'ring-1 ring-accent text-accent font-bold', selected && 'dp-day-sel')}
                      >
                        {c.d}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {view === 'months' && (
              <div className="dp-fade grid grid-cols-3 gap-1.5">
                {Array.from({ length: 12 }, (_, m) => {
                  const iso = `${cursor.y}-${pad(m + 1)}`;
                  const selected = !!sel && sel.y === cursor.y && sel.m === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      disabled={mode === 'month' && !!outOfRange(iso)}
                      onClick={() => pickMonth(m)}
                      className={clsx(
                        'dp-cell capitalize',
                        selected && 'dp-day-sel',
                        !selected && cursor.y === now.getFullYear() && m === now.getMonth() && 'ring-1 ring-accent text-accent',
                      )}
                    >
                      {fmt({ month: 'short' }, cursor.y, m)}
                    </button>
                  );
                })}
              </div>
            )}

            {view === 'years' && (
              <div className="dp-fade grid grid-cols-3 gap-1.5">
                {Array.from({ length: 12 }, (_, i) => cursor.y - 4 + i).map((y) => (
                  <button
                    key={y}
                    type="button"
                    onClick={() => {
                      setCursor({ ...cursor, y });
                      setView('months');
                    }}
                    className={clsx('dp-cell', sel?.y === y && 'dp-day-sel', !(sel?.y === y) && y === now.getFullYear() && 'ring-1 ring-accent text-accent')}
                  >
                    {y}
                  </button>
                ))}
              </div>
            )}

            {mode === 'datetime' && view === 'days' && (
              <div className="mt-3 flex items-center justify-center gap-2 border-t border-line pt-3">
                <TimeCol label={t('common.hours')} value={time.h} max={23} onPick={(h) => setTimePart({ ...time, h })} />
                <span className="font-display text-xl font-bold text-muted">:</span>
                <TimeCol label={t('common.minutes')} value={time.min} max={59} step={5} onPick={(min) => setTimePart({ ...time, min })} />
              </div>
            )}

            <div className="mt-3 flex items-center justify-between border-t border-line pt-2.5 text-sm font-semibold">
              <button
                type="button"
                className="rounded-lg px-2 py-1 text-muted hover:text-fg"
                onClick={() => {
                  write('');
                  setOpen(false);
                }}
              >
                {t('common.clear')}
              </button>
              {mode === 'datetime' && (
                <button type="button" className="rounded-lg px-3 py-1 text-accent hover:bg-accent/10" onClick={() => setOpen(false)}>
                  {t('common.done')}
                </button>
              )}
              <button
                type="button"
                className="rounded-lg px-2 py-1 text-accent hover:bg-accent/10"
                onClick={() => {
                  const iso = mode === 'month' ? today.slice(0, 7) : today;
                  if (outOfRange(iso)) return;
                  if (mode === 'datetime') write(`${today}T${pad(time.h)}:${pad(time.min)}`);
                  else write(iso);
                  setCursor({ y: now.getFullYear(), m: now.getMonth() });
                  if (mode !== 'datetime') setOpen(false);
                }}
              >
                {mode === 'month' ? t('common.thisMonth') : t('common.today')}
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
});

function TimeCol({ label, value, max, step = 1, onPick }: { label: string; value: number; max: number; step?: number; onPick: (v: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const items = Array.from({ length: Math.floor(max / step) + 1 }, (_, i) => i * step);
  useEffect(() => {
    (ref.current?.querySelector('[aria-selected="true"]') as HTMLElement | null)?.scrollIntoView({ block: 'center' });
  }, []);
  return (
    <div className="text-center">
      <p className="mb-1 text-xs text-subtle">{label}</p>
      <div ref={ref} role="listbox" aria-label={label} className="h-28 w-16 snap-y overflow-y-auto rounded-xl border border-line bg-glass p-1">
        {items.map((n) => (
          <button
            key={n}
            type="button"
            role="option"
            aria-selected={n === value}
            onClick={() => onPick(n)}
            className={clsx(
              'block w-full snap-center rounded-lg py-1 text-sm font-semibold tabular-nums',
              n === value ? 'dp-day-sel' : 'text-muted hover:bg-glass-hover hover:text-fg',
            )}
          >
            {pad(n)}
          </button>
        ))}
      </div>
    </div>
  );
}
