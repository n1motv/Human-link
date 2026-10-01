import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../lib/api';

/* ---------- Boutons ---------- */
interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'danger';
  size?: 'md' | 'sm';
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({ variant = 'default', size = 'md', loading, icon, className, children, disabled, type = 'button', ...rest }: BtnProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={clsx('btn', variant === 'primary' && 'btn-primary', variant === 'danger' && 'btn-danger', size === 'sm' && 'btn-sm', className)}
      {...rest}
    >
      {loading ? <Loader2 size={16} className="animate-spin" /> : icon}
      {children}
    </button>
  );
}

/* ---------- Champs de formulaire ---------- */
interface FieldProps {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

export function Field({ label, error, hint, required, children, className }: FieldProps) {
  return (
    <label className={clsx('block', className)}>
      <span className="mb-1.5 block text-xs font-semibold text-muted">
        {label}
        {required && <span className="text-bad"> *</span>}
      </span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-subtle">{hint}</span>}
      {error && (
        <span role="alert" className="mt-1 block text-xs text-bad">
          {error}
        </span>
      )}
    </label>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(function Input({ invalid, className, ...p }, ref) {
  return <input ref={ref} aria-invalid={invalid || undefined} className={clsx('field', className)} {...p} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(function Select({ invalid, className, ...p }, ref) {
  return <select ref={ref} aria-invalid={invalid || undefined} className={clsx('field', className)} {...p} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(function Textarea({ invalid, className, ...p }, ref) {
  return <textarea ref={ref} aria-invalid={invalid || undefined} className={clsx('field', className)} {...p} />;
});

/* ---------- Structure ---------- */
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ children, className, strong }: { children: ReactNode; className?: string; strong?: boolean }) {
  return <section className={clsx(strong ? 'glass-strong' : 'glass', 'p-5 sm:p-6', className)}>{children}</section>;
}

export function Spinner({ label }: { label?: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-muted" role="status">
      <Loader2 className="animate-spin" size={20} />
      <span className="text-sm">{label ?? t('common.loading')}</span>
    </div>
  );
}

export function Empty({ icon, title, hint }: { icon?: ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-14 text-center">
      {icon && <div className="mb-1 grid h-12 w-12 place-items-center rounded-2xl bg-glass text-accent">{icon}</div>}
      <p className="font-semibold">{title}</p>
      {hint && <p className="max-w-sm text-sm text-muted">{hint}</p>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useTranslation();
  const msg = error instanceof ApiError ? error.message : t('common.error');
  return (
    <div className="glass flex flex-col items-center gap-3 px-6 py-10 text-center" role="alert">
      <p className="text-sm text-bad">{msg}</p>
      {onRetry && (
        <Button size="sm" onClick={onRetry}>
          {t('common.retry')}
        </Button>
      )}
    </div>
  );
}

export function StatTile({ label, value, hint, icon, tone }: { label: string; value: ReactNode; hint?: string; icon?: ReactNode; tone?: 'accent' | 'ok' | 'warn' | 'info' }) {
  const toneCls = { accent: 'text-accent', ok: 'text-ok', warn: 'text-warn', info: 'text-info' }[tone ?? 'accent'];
  return (
    <div className="glass glass-hover rise p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-subtle">{label}</p>
        {icon && <span className={clsx('grid h-9 w-9 place-items-center rounded-xl bg-glass', toneCls)}>{icon}</span>}
      </div>
      <p className="mt-3 text-3xl font-bold tabular-nums tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: string; count?: number }[] }) {
  return (
    <div role="tablist" className="glass inline-flex flex-wrap gap-1 p-1" style={{ borderRadius: 999 }}>
      {items.map((i) => (
        <button
          key={i.value}
          role="tab"
          aria-selected={value === i.value}
          onClick={() => onChange(i.value)}
          className={clsx(
            'rounded-full px-4 py-1.5 text-sm font-semibold transition',
            value === i.value ? 'bg-gradient-to-br from-accent to-accent2 text-white shadow-lg' : 'text-muted hover:text-fg',
          )}
        >
          {i.label}
          {i.count !== undefined && <span className="ms-2 text-xs opacity-80">{i.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** Conteneur de tableau défilant sur mobile. */
export function TableWrap({ children }: { children: ReactNode }) {
  return (
    <div className="glass overflow-hidden p-0">
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}
