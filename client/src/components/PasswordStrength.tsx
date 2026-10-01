import { useTranslation } from 'react-i18next';

/** Indicateur de robustesse (longueur + variété) : un guide, la validation reste côté serveur. */
export function PasswordStrength({ value, min }: { value: string; min: number }) {
  const { t } = useTranslation();
  if (!value) return null;
  const variety = [/[a-z]/, /[A-Z]/, /\d/, /[^a-zA-Z0-9]/].filter((r) => r.test(value)).length;
  const score = value.length < min ? 1 : Math.min(4, 1 + (value.length >= min + 4 ? 1 : 0) + (variety >= 3 ? 1 : 0) + (value.length >= 20 ? 1 : 0));
  const label = [t('password.weak'), t('password.weak'), t('password.fair'), t('password.good'), t('password.strong')][score]!;
  const color = ['', 'bg-bad', 'bg-warn', 'bg-info', 'bg-ok'][score]!;
  return (
    <div aria-live="polite">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= score ? color : 'bg-glass-hover'}`} />
        ))}
      </div>
      <p className="mt-1 text-xs text-muted">{label}</p>
    </div>
  );
}
