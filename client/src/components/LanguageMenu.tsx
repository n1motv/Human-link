import { Languages } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useConfig } from '../lib/config';
import { LANGUAGE_NAMES, changeLanguage } from '../lib/i18n';
import { Select } from './Select';

/** Sélecteur de langue unique (en-tête de l'app et pages d'authentification). */
export function LanguageMenu() {
  const { t, i18n } = useTranslation();
  const { i18n: cfg } = useConfig();
  if (cfg.languages.length < 2) return null;
  return (
    <Select
      aria-label={t('common.language')}
      icon={<Languages size={16} aria-hidden />}
      value={cfg.languages.includes(i18n.language) ? i18n.language : 'fr'}
      onChange={(e) => void changeLanguage(e.target.value)}
      className="!min-h-10 !w-auto !rounded-full !py-1 !pe-3 text-sm"
    >
      {cfg.languages.map((l) => (
        <option key={l} value={l}>
          {LANGUAGE_NAMES[l] ?? l}
        </option>
      ))}
    </Select>
  );
}
