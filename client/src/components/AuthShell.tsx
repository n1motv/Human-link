import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useConfig } from '../lib/config';
import { LanguageMenu } from './LanguageMenu';
import { useTheme } from '../lib/theme';

/** Cadre commun des pages publiques (connexion, activation, mot de passe oublié...). */
export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  const cfg = useConfig();
  const { theme, toggle } = useTheme();
  const { t } = useTranslation();
  const [broken, setBroken] = useState(false);
  const logo = theme === 'dark' ? cfg.branding.logoOnDarkUrl : cfg.branding.logoUrl;

  return (
    <div className="grid min-h-screen place-items-center px-4 py-10">
      <div className="absolute end-4 top-4 flex items-center gap-2">
        <LanguageMenu />
        <button onClick={toggle} className="btn btn-icon" aria-label={t('common.toggleTheme')}>
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>

      <div className="grid w-full max-w-5xl items-center gap-10 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
        <aside className="hidden lg:block">
          {!broken && <img src={logo} alt={cfg.company.name} className="h-24 w-auto max-w-[340px] object-contain object-left" onError={() => setBroken(true)} />}
          {/* Le nom n'est répété que si le logo ne le contient pas (showName) ou s'il est introuvable. */}
          {(cfg.branding.showName || broken) && <p className="gradient-text mt-6 font-display text-6xl font-extrabold leading-[1.05]">{cfg.company.name}</p>}
          <p className="mt-8 max-w-sm text-lg text-muted">{t('auth.tagline')}</p>
        </aside>

        <main className="w-full max-w-md justify-self-center lg:justify-self-end">
          <div className="mb-6 flex flex-col items-center gap-3 text-center lg:hidden">
            {!broken && <img src={logo} alt="" className="h-14 w-auto max-w-[200px] object-contain" onError={() => setBroken(true)} />}
            {(cfg.branding.showName || broken) && <p className="gradient-text font-display text-2xl font-extrabold">{cfg.company.name}</p>}
          </div>
          <div className="glass-strong rise p-6 sm:p-8">
            <h1 className="text-2xl font-bold">{title}</h1>
            {subtitle && <p className="mt-1.5 text-sm text-muted">{subtitle}</p>}
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
    </div>
  );
}
