import { useEffect, useRef, useState, type ClipboardEvent, type CSSProperties, type KeyboardEvent } from 'react';
import { Check, X } from 'lucide-react';
import clsx from 'clsx';

export type OtpStatus = 'idle' | 'checking' | 'success' | 'error';

interface Props {
  value: string;
  onChange: (v: string) => void;
  /** Appelé dès que tous les chiffres sont saisis (validation automatique). */
  onComplete?: (v: string) => void;
  /** Appelé quand l'animation d'erreur est terminée : le parent vide le code et repasse en `idle`. */
  onSettle?: () => void;
  status?: OtpStatus;
  length?: number;
  autoFocus?: boolean;
  disabled?: boolean;
  label: string;
}

const ERROR_MS = 1300;

/**
 * Code à usage unique en cases séparées. Au résultat, les cases glissent l'une vers l'autre et fusionnent
 * en une seule case : verte avec une coche si le code est bon, rouge avec une croix s'il est faux
 * (puis elle se rouvre pour retaper le code).
 */
export function OtpInput({ value, onChange, onComplete, onSettle, status = 'idle', length = 6, autoFocus, disabled, label }: Props) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const [showError, setShowError] = useState(false);
  const merged = status === 'success' || (status === 'error' && showError);
  const locked = disabled || status === 'checking' || merged;
  const digits = Array.from({ length }, (_, i) => value[i] ?? '');

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  useEffect(() => {
    if (status !== 'error') return setShowError(false);
    setShowError(true);
    const h = setTimeout(() => {
      setShowError(false);
      onSettle?.();
      setTimeout(() => refs.current[0]?.focus(), 450);
    }, ERROR_MS);
    return () => clearTimeout(h);
    // onSettle volontairement exclu : il change à chaque rendu du parent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const commit = (next: string) => {
    const clean = next.replace(/\D/g, '').slice(0, length);
    onChange(clean);
    if (clean.length === length) onComplete?.(clean);
    return clean;
  };

  const type = (i: number, raw: string) => {
    const incoming = raw.replace(/\D/g, '');
    if (!incoming) return;
    const next = commit(value.slice(0, i) + incoming + value.slice(i + incoming.length));
    refs.current[Math.min(i + incoming.length, length - 1, next.length)]?.focus();
  };

  const onKeyDown = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    const rtl = document.dir === 'rtl';
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (digits[i]) onChange(value.slice(0, i) + value.slice(i + 1));
      else if (i > 0) {
        onChange(value.slice(0, i - 1) + value.slice(i));
        refs.current[i - 1]?.focus();
      }
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      refs.current[i + (rtl ? 1 : -1)]?.focus();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      refs.current[i + (rtl ? -1 : 1)]?.focus();
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const next = commit(e.clipboardData.getData('text'));
    refs.current[Math.min(next.length, length - 1)]?.focus();
  };

  const ok = status === 'success';

  return (
    <div className="relative h-14" role="group" aria-label={label} dir="ltr" style={{ '--tone': ok ? 'var(--success)' : 'var(--danger)' } as CSSProperties}>
      <div className="grid h-full gap-2.5" style={{ gridTemplateColumns: `repeat(${length}, minmax(0, 1fr))` }}>
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            value={d}
            disabled={locked}
            inputMode="numeric"
            autoComplete={i === 0 ? 'one-time-code' : 'off'}
            maxLength={length}
            aria-label={`${label} ${i + 1}/${length}`}
            onChange={(e) => type(i, e.target.value)}
            onKeyDown={(e) => onKeyDown(i, e)}
            onPaste={onPaste}
            onFocus={(e) => e.target.select()}
            style={{ '--shift': (length - 1) / 2 - i, '--wave': `${i * 90}ms` } as CSSProperties}
            className={clsx(
              'otp-box min-w-0 rounded-xl border bg-[var(--field)] text-center font-display text-2xl font-bold tabular-nums caret-accent outline-none',
              d ? 'border-accent/60' : 'border-[var(--field-border)]',
              'focus:border-accent focus:shadow-[0_0_0_3px_rgb(var(--accent-rgb)/0.25)]',
              status === 'checking' && 'otp-wave',
              merged && 'otp-box-merged',
            )}
          />
        ))}
      </div>

      {/* Case unique, de la taille d'une case, qui prend la place des 6 une fois fusionnées. */}
      <div className="pointer-events-none absolute inset-0 grid h-full gap-2.5" style={{ gridTemplateColumns: `repeat(${length}, minmax(0, 1fr))` }} aria-live="polite">
        <div
          className={clsx(
            'otp-result grid place-items-center rounded-xl border-2 border-[var(--tone)] bg-[color-mix(in_srgb,var(--tone)_18%,var(--field))] text-[var(--tone)]',
            merged && 'otp-result-in',
            merged && !ok && 'otp-bad',
          )}
          style={{ gridColumn: Math.ceil(length / 2) }}
        >
          {merged && (ok ? <Check size={28} strokeWidth={3} className="otp-icon" aria-label="OK" /> : <X size={28} strokeWidth={3} className="otp-icon" aria-label="Error" />)}
        </div>
      </div>
    </div>
  );
}
