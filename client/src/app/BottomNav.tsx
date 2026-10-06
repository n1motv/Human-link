import { NavLink } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { useUser } from '../lib/auth';
import { useConfig } from '../lib/config';
import { BOTTOM_NAV } from './nav';

/**
 * Barre fixe en bas de l'écran sur téléphone (moins de 768 px) : les 4 destinations les plus fréquentes du rôle, à portée du pouce,
 * et « Menu » pour tout le reste (le tiroir latéral). Au-delà, le menu latéral habituel prend le relais.
 */
export function BottomNav({ onMenu }: { onMenu: () => void }) {
  const { t } = useTranslation();
  const user = useUser();
  const { modules } = useConfig();
  // Même requête que la cloche de l'en-tête : partagée, jamais envoyée deux fois.
  const unread = useQuery({ queryKey: ['notifications', 'count'], queryFn: () => api.get<{ unread: number }>('/notifications/unread-count'), refetchInterval: 60_000 });
  const items = BOTTOM_NAV[user.role].filter((i) => !i.module || modules[i.module]);

  return (
    <nav
      aria-label={t('nav.quick')}
      className="glass-strong fixed inset-x-2 bottom-2 z-30 flex items-stretch justify-around gap-1 !rounded-3xl px-1 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] md:hidden"
    >
      {items.map((i) => {
        const badge = i.to === '/notifications' ? (unread.data?.unread ?? 0) : 0;
        return (
          <NavLink key={i.to} to={i.to} end={i.end} className="bottom-link">
            <span className="relative">
              <i.icon size={22} aria-hidden />
              {badge > 0 && (
                <span
                  className="absolute -end-2 -top-1.5 grid min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold leading-4 text-on-accent"
                  aria-label={String(badge)}
                >
                  {badge > 9 ? '9+' : badge}
                </span>
              )}
            </span>
            <span className="max-w-full truncate">{t(i.label)}</span>
          </NavLink>
        );
      })}
      <button type="button" onClick={onMenu} className="bottom-link" aria-label={t('common.menu')}>
        <Menu size={22} aria-hidden />
        <span className="max-w-full truncate">{t('common.menu')}</span>
      </button>
    </nav>
  );
}
