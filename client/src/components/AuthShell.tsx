import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Languages, Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useConfig } from '../lib/config';
import { LANGUAGE_NAMES } from '../lib/i18n';
import { useTheme } from '../lib/theme';

/** Cadre commun des pages publiques (connexion, activation, mot de passe oublié...). */
export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  const cfg = useConfig();
  const { theme, toggle } = useTheme();
  const { t, i18n } = useTranslation();
  const [broken, setBroken] = useState(false);

  return (
    <div className="grid min-h-screen place-items-center px-4 py-10">
      <div className="absolute end-4 top-4 flex items-center gap-2">
        {cfg.i18n.languages.length > 1 && (
          <label className="relative">
            <span className="sr-only">Langue</span>
            <Languages size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
            <select
              value={cfg.i18n.languages.includes(i18n.language) ? i18n.language : 'fr'}
              onChange={(e) => void i18n.changeLanguage(e.target.value)}
              className="field !min-h-10 w-auto !rounded-full !py-1 !ps-9 !pe-3 text-sm"
            >
              {cfg.i18n.languages.map((l) => (
                <option key={l} value={l}>
                  {LANGUAGE_NAMES[l] ?? l}
                </option>
              ))}
            </select>
          </label>
        )}
        <button onClick={toggle} className="btn btn-icon" aria-label={t('common.toggleTheme')}>
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>

      <main className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          {!broken && <img src={theme === 'dark' ? cfg.branding.logoOnDarkUrl : cfg.branding.logoUrl} alt="" className="h-14 w-auto max-w-[200px] object-contain" onError={() => setBroken(true)} />}
          {(cfg.branding.showName || broken) && <p className="gradient-text text-2xl font-extrabold tracking-tight">{cfg.company.name}</p>}
        </div>
        <div className="glass-strong rise p-6 sm:p-8">
          <h1 className="text-xl font-bold">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
        <div className="mt-5 text-center text-sm text-muted">{footer}</div>
        <p className="mt-6 text-center text-xs text-subtle">
          <Link to="/privacy" className="hover:text-fg hover:underline">
            {t('nav.privacy')}
          </Link>
          {cfg.modules.contact && (
            <>
              {' · '}
              <Link to="/contact" className="hover:text-fg hover:underline">
                {t('nav.contact')}
              </Link>
            </>
          )}
        </p>
      </main>
    </div>
  );
}
