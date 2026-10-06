import { useTranslation } from 'react-i18next';
import { Select } from './Select';

export const PAGE_SIZES = [25, 50, 100, 200];

/** Choix du nombre de lignes par page. Au-delà de 60 lignes, le tableau est virtualisé (VirtualRows) : 200 par page restent fluides. */
export function PageSize({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const { t } = useTranslation();
  return (
    <Select aria-label={t('common.perPage')} value={String(value)} onChange={(e) => onChange(Number(e.target.value))} className="!w-auto !py-1.5 text-sm">
      {PAGE_SIZES.map((n) => (
        <option key={n} value={n}>
          {n} / {t('common.pageShort')}
        </option>
      ))}
    </Select>
  );
}
