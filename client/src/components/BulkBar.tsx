import { Check, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from './ui';

/** Barre d'actions flottante : apparaît dès qu'une demande est cochée, au-dessus de la barre de navigation du bas sur téléphone. */
export function BulkBar({ count, onApprove, onRefuse, onClear }: { count: number; onApprove: () => void; onRefuse: () => void; onClear: () => void }) {
  const { t } = useTranslation();
  if (count === 0) return null;
  return (
    <div
      role="region"
      aria-label={t('bulk.actions')}
      className="glass-strong rise fixed inset-x-3 bottom-24 z-40 mx-auto flex w-fit max-w-[calc(100vw-1.5rem)] flex-wrap items-center justify-center gap-2 p-2.5 ps-4 shadow-2xl md:bottom-6"
    >
      <span className="text-sm font-semibold tabular-nums">{t('bulk.selected', { count })}</span>
      <Button size="sm" variant="primary" icon={<Check size={14} />} onClick={onApprove}>
        {t('bulk.approveAll')}
      </Button>
      <Button size="sm" variant="danger" icon={<X size={14} />} onClick={onRefuse}>
        {t('bulk.refuseAll')}
      </Button>
      <button className="rounded-full p-2 text-muted hover:bg-glass-hover hover:text-fg" aria-label={t('bulk.clear')} title={t('bulk.clear')} onClick={onClear}>
        <X size={16} />
      </button>
    </div>
  );
}

/** Liste des personnes concernées, dans la fenêtre de confirmation. */
export function PeopleList({ names }: { names: string[] }) {
  return (
    <ul className="mt-3 max-h-48 space-y-1 overflow-auto rounded-xl border border-line bg-glass p-2 text-sm">
      {names.map((n, i) => (
        <li key={`${n}-${i}`} className="truncate px-1.5 py-0.5 font-medium text-fg">
          {n}
        </li>
      ))}
    </ul>
  );
}
