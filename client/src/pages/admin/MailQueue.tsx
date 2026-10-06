import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MailCheck, RotateCw, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '../../components/DecisionDialog';
import { Button, Card, Empty, ErrorState, PageHeader, Spinner, TableWrap, Tabs } from '../../components/ui';
import { api } from '../../lib/api';
import { fmtDateTime } from '../../lib/format';
import { useAction } from '../../lib/hooks';
import { schemas } from '../../lib/schemas';
import type { z } from 'zod';

type Queue = z.infer<typeof schemas.mailQueue>;
type Job = Queue['items'][number];
type Filter = 'failed' | 'pending' | 'all';

/**
 * Envois d'e-mails qui n'ont pas abouti (T-10). Un message est repris automatiquement plusieurs fois (1 min, 5 min, 30 min, 2 h, 6 h) ;
 * s'il échoue encore, il attend ici : on peut le relancer (panne SMTP terminée) ou l'abandonner. Le contenu des messages n'est jamais affiché.
 */
export default function MailQueue() {
  const { t, i18n } = useTranslation();
  const [filter, setFilter] = useState<Filter>('failed');
  const [dropping, setDropping] = useState<Job | null>(null);
  const q = useQuery({ queryKey: ['mail', filter], queryFn: () => api.get<Queue>(`/mail-jobs?status=${filter}`), refetchInterval: 30_000 });
  const retry = useAction((id: string) => api.post(`/mail-jobs/${id}/retry`), { success: t('mail.retried'), invalidate: [['mail']] });
  const drop = useAction((id: string) => api.delete(`/mail-jobs/${id}`), { success: t('mail.dropped'), invalidate: [['mail']] });

  return (
    <>
      <PageHeader title={t('nav.mail')} subtitle={t('mail.subtitle')} />
      <div className="mb-5">
        <Tabs
          value={filter}
          onChange={setFilter}
          items={[
            { value: 'failed', label: t('mail.failed'), count: q.data?.counts.failed },
            { value: 'pending', label: t('mail.pending'), count: q.data?.counts.pending },
            { value: 'all', label: t('common.all') },
          ]}
        />
      </div>

      {q.isLoading ? (
        <Spinner />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.data!.items.length === 0 ? (
        <Card>
          <Empty icon={<MailCheck size={22} />} title={t('mail.none')} />
        </Card>
      ) : (
        <TableWrap>
          <table className="table-glass">
            <thead>
              <tr>
                <th>{t('mail.to')}</th>
                <th>{t('mail.subject')}</th>
                <th>{t('mail.attempts')}</th>
                <th>{t('mail.error')}</th>
                <th aria-label={t('common.actions')} />
              </tr>
            </thead>
            <tbody>
              {q.data!.items.map((j) => (
                <tr key={j.id}>
                  <td>
                    {j.to}
                    <p className="text-xs text-muted">{fmtDateTime(j.createdAt, i18n.language)}</p>
                  </td>
                  <td>{j.subject}</td>
                  <td className="tabular-nums">
                    {j.attempts}
                    {j.status === 'pending' && <p className="text-xs text-muted">{t('mail.nextTry', { date: fmtDateTime(j.nextAttemptAt, i18n.language) })}</p>}
                  </td>
                  <td className="max-w-xs text-xs text-bad">{j.lastError ?? '—'}</td>
                  <td>
                    {j.status === 'failed' && (
                      <div className="flex justify-end gap-2">
                        <Button size="sm" icon={<RotateCw size={14} />} loading={retry.isPending && retry.variables === j.id} onClick={() => retry.mutate(j.id)}>
                          {t('mail.retry')}
                        </Button>
                        <button className="rounded-full p-2 text-muted hover:bg-glass-hover hover:text-bad" aria-label={t('common.delete')} onClick={() => setDropping(j)}>
                          <Trash2 size={15} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}

      <ConfirmDialog
        open={!!dropping}
        danger
        title={t('mail.dropTitle')}
        message={t('mail.dropMsg', { to: dropping?.to ?? '', subject: dropping?.subject ?? '' })}
        confirmLabel={t('common.delete')}
        onClose={() => setDropping(null)}
        onConfirm={() => drop.mutateAsync(dropping!.id)}
      />
    </>
  );
}
