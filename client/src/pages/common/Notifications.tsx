import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Empty, ErrorState, PageHeader, Spinner } from '../../components/ui';
import { api } from '../../lib/api';
import { fmtDateTime } from '../../lib/format';
import { renderNotif } from '../../lib/notif';
import type { Notif } from '../../lib/types';

export default function Notifications() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['notifications', 'list'], queryFn: () => api.get<{ items: Notif[]; unread: number }>('/notifications') });
  const refresh = () => qc.invalidateQueries({ queryKey: ['notifications'] });
  const readAll = useMutation({ mutationFn: () => api.post('/notifications/read-all'), onSuccess: refresh });
  const remove = useMutation({ mutationFn: (id: string) => api.delete(`/notifications/${id}`), onSuccess: refresh });

  return (
    <>
      <PageHeader
        title={t('nav.notifications')}
        subtitle={t('notifications.subtitle')}
        actions={
          <Button icon={<CheckCheck size={16} />} onClick={() => readAll.mutate()} disabled={!q.data?.unread}>
            {t('notifications.markAll')}
          </Button>
        }
      />
      {q.isLoading ? (
        <Spinner />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.data!.items.length === 0 ? (
        <Card>
          <Empty icon={<Bell size={22} />} title={t('notifications.empty')} />
        </Card>
      ) : (
        <ul className="space-y-3">
          {q.data!.items.map((n) => (
            <li key={n.id} className={`glass flex items-start gap-4 p-4 ${n.isRead ? 'opacity-75' : ''}`}>
              <span
                className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${n.isRead ? 'bg-subtle' : 'bg-gradient-to-br from-accent to-accent2'}`}
                aria-label={n.isRead ? '' : t('notifications.new')}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm">{renderNotif(n, t, i18n.language)}</p>
                <p className="mt-1 text-xs text-subtle">
                  {n.type} · {fmtDateTime(n.createdAt, i18n.language)}
                </p>
              </div>
              <button className="rounded-full p-2 text-muted hover:bg-glass-hover hover:text-bad" aria-label={t('common.delete')} onClick={() => remove.mutate(n.id)}>
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
