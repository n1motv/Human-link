import { useState } from 'react';
import { useConfig } from '../lib/config';
import { usePending } from '../lib/progress';
import { useTheme } from '../lib/theme';

/** Écran de démarrage plein écran (premier chargement, vérification de la session) aux couleurs du client. */
export function AppSplash() {
  usePending();
  const cfg = useConfig();
  const { theme } = useTheme();
  const [broken, setBroken] = useState(false);
  return (
    <div role="status" aria-busy="true" className="grid min-h-screen place-items-center px-6">
      <div className="splash-in flex flex-col items-center gap-5 text-center">
        <div className="splash-pulse">
          {!broken ? (
            <img src={theme === 'dark' ? cfg.branding.logoOnDarkUrl : cfg.branding.logoUrl} alt="" className="h-16 w-auto max-w-[220px] object-contain" onError={() => setBroken(true)} />
          ) : (
            <p className="gradient-text font-display text-4xl font-extrabold">{cfg.company.name}</p>
          )}
        </div>
        <div className="h-1 w-28 overflow-hidden rounded-full bg-glass">
          <div className="splash-bar h-full w-1/2 rounded-full" style={{ background: 'linear-gradient(90deg, var(--accent), var(--accent-2))' }} />
        </div>
        <span className="sr-only">{cfg.company.name}</span>
      </div>
    </div>
  );
}
