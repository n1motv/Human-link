import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { fmtDateTime } from '../lib/format';
import { renderNotif } from '../lib/notif';
import type { Notif } from '../lib/types';

/** Cloche : le compteur est interrogé toutes les 60 s (léger) ; la liste n'est chargée qu'à l'ouverture. */
export function NotificationBell() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const count = useQuery({
    queryKey: ['notifications', 'count'],
    queryFn: () => api.get<{ unread: number }>('/notifications/unread-count'),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  const list = useQuery({
    queryKey: ['notifications', 'list'],
    queryFn: () => api.get<{ items: Notif[]; unread: number }>('/notifications'),
    enabled: open,
  });
  const readAll = useMutation({
    mutationFn: () => api.post('/notifications/read-all'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const unread = count.data?.unread ?? 0;
  return (
    <div className="relative" ref={ref}>
      <button className="btn btn-icon relative" aria-label={`${t('nav.notifications')}${unread ? ` (${unread})` : ''}`} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute -end-0.5 -top-0.5 grid min-h-[18px] min-w-[18px] place-items-center rounded-full bg-gradient-to-br from-accent to-accent2 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="glass-strong rise absolute end-0 top-12 z-40 w-[min(22rem,calc(100vw-2rem))] p-2">
          <div className="flex items-center justify-between px-3 py-2">
            <p className="text-sm font-bold">{t('nav.notifications')}</p>
            {unread > 0 && (
              <button className="text-xs font-semibold text-accent hover:underline" onClick={() => readAll.mutate()}>
                {t('notifications.markAll')}
              </button>
            )}
          </div>
          <ul className="max-h-80 space-y-1 overflow-y-auto">
            {list.isLoading && <li className="skeleton m-2 h-12" />}
            {list.data?.items.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">{t('notifications.empty')}</li>}
            {list.data?.items.slice(0, 8).map((n) => (
              <li key={n.id} className={`rounded-xl px-3 py-2.5 text-sm ${n.isRead ? 'opacity-70' : 'bg-glass'}`}>
                <p>{renderNotif(n, t, i18n.language)}</p>
                <p className="mt-1 text-xs text-subtle">{fmtDateTime(n.createdAt, i18n.language)}</p>
              </li>
            ))}
          </ul>
          <Link to="/notifications" onClick={() => setOpen(false)} className="mt-1 block rounded-xl px-3 py-2 text-center text-sm font-semibold text-accent hover:bg-glass-hover">
            {t('notifications.seeAll')}
          </Link>
        </div>
      )}
    </div>
  );
}
