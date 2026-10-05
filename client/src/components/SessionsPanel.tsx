import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LogOut, Monitor, Smartphone, Tablet } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { fmtDateTime } from '../lib/format';
import { useAction } from '../lib/hooks';
import { ConfirmDialog } from './DecisionDialog';
import { Button, ErrorState, FormActions, Spinner } from './ui';

interface Session {
  id: string;
  browser: string;
  os: string;
  device: 'desktop' | 'mobile' | 'tablet';
  ipMasked?: string;
  createdAt: string;
  lastActiveAt: string;
  current: boolean;
}

const ICON = { desktop: Monitor, mobile: Smartphone, tablet: Tablet };

/** Appareils où le compte est connecté : on repère ceux qu'on ne reconnaît pas et on les déconnecte à distance. */
export function SessionsPanel() {
  const { t, i18n } = useTranslation();
  const q = useQuery({ queryKey: ['sessions'], queryFn: () => api.get<{ items: Session[] }>('/auth/sessions') });
  const [ask, setAsk] = useState<Session | 'others' | null>(null);
  const revoke = useAction((id: string) => api.delete(`/auth/sessions/${id}`), { success: t('sessions.revoked'), invalidate: [['sessions']] });
  const revokeOthers = useAction(() => api.delete<{ closed: number }>('/auth/sessions'), { invalidate: [['sessions']] });

  if (q.isLoading) return <Spinner />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const items = q.data!.items;
  const others = items.filter((s) => !s.current);

  return (
    <>
      <ul className="space-y-2.5">
        {items.map((s) => {
          const Icon = ICON[s.device] ?? Monitor;
          return (
            <li key={s.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-glass px-4 py-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent/12 text-accent">
                <Icon size={20} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  {s.browser} · {s.os}
                  {s.current && <span className="badge badge-ok">{t('sessions.current')}</span>}
                </p>
                <p className="text-sm text-muted">
                  {t('sessions.lastActive', { when: fmtDateTime(s.lastActiveAt, i18n.language) })}
                  {s.ipMasked && <span className="font-mono text-xs"> · {s.ipMasked}</span>}
                </p>
              </div>
              {!s.current && (
                <Button size="sm" variant="danger" icon={<LogOut size={14} />} onClick={() => setAsk(s)}>
                  {t('sessions.signOut')}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {others.length > 0 ? (
        <FormActions className="mt-3">
          <Button variant="danger" icon={<LogOut size={16} />} onClick={() => setAsk('others')}>
            {t('sessions.signOutOthers')}
          </Button>
        </FormActions>
      ) : (
        <p className="mt-3 text-center text-sm text-muted">{t('sessions.none')}</p>
      )}

      <ConfirmDialog
        open={!!ask}
        danger
        icon={<LogOut size={22} />}
        title={ask === 'others' ? t('sessions.confirmOthersTitle') : t('sessions.confirmTitle')}
        message={ask === 'others' ? t('sessions.confirmOthersMsg', { count: others.length }) : ask ? t('sessions.confirmMsg', { device: `${ask.browser} · ${ask.os}` }) : ''}
        confirmLabel={t('sessions.signOut')}
        onClose={() => setAsk(null)}
        onConfirm={async () => {
          if (ask === 'others') {
            const r = await revokeOthers.mutateAsync();
            if (r.closed) await q.refetch();
          } else if (ask) await revoke.mutateAsync(ask.id);
        }}
      />
    </>
  );
}
