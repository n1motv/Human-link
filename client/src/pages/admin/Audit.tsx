import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, ScrollText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Empty, ErrorState, Input, PageHeader, Spinner, TableWrap } from '../../components/ui';
import { api } from '../../lib/api';
import { fmtDateTime } from '../../lib/format';

interface Entry {
  id: string;
  at: string;
  actorEmail?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  ipHash?: string;
}

const LIMIT = 50;

/** Journal d'audit : preuve, pour le client, de qui a consulté ou modifié des données personnelles. */
export default function Audit() {
  const { t, i18n } = useTranslation();
  const [action, setAction] = useState('');
  const [actor, setActor] = useState('');
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ['audit', action, actor, page],
    queryFn: () => api.get<{ items: Entry[]; total: number }>(`/rgpd/audit?page=${page}&limit=${LIMIT}${action ? `&action=${encodeURIComponent(action)}` : ''}${actor ? `&actor=${encodeURIComponent(actor)}` : ''}`),
    placeholderData: (prev) => prev,
  });
  const pages = Math.max(1, Math.ceil((q.data?.total ?? 0) / LIMIT));

  return (
    <>
      <PageHeader title={t('nav.audit')} subtitle={t('audit.subtitle')} />
      <div className="mb-5 flex flex-wrap gap-3">
        <Input className="!w-auto min-w-[14rem]" placeholder={t('audit.filterAction')} aria-label={t('audit.filterAction')} value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} />
        <Input className="!w-auto min-w-[14rem]" placeholder={t('audit.filterActor')} aria-label={t('audit.filterActor')} value={actor} onChange={(e) => { setActor(e.target.value); setPage(1); }} />
      </div>
      {q.isLoading ? (
        <Spinner />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.data!.items.length === 0 ? (
        <Card>
          <Empty icon={<ScrollText size={22} />} title={t('audit.empty')} />
        </Card>
      ) : (
        <>
          <TableWrap>
            <table className="table-glass">
              <thead>
                <tr>
                  <th>{t('common.date')}</th>
                  <th>{t('audit.actor')}</th>
                  <th>{t('audit.action')}</th>
                  <th>{t('audit.target')}</th>
                </tr>
              </thead>
              <tbody>
                {q.data!.items.map((e) => (
                  <tr key={e.id}>
                    <td className="whitespace-nowrap text-muted">{fmtDateTime(e.at, i18n.language)}</td>
                    <td>{e.actorEmail ?? '—'}</td>
                    <td>
                      <code className="rounded-md bg-glass px-2 py-0.5 text-xs">{e.action}</code>
                    </td>
                    <td className="font-mono text-xs text-muted">
                      {e.targetType ?? ''} {e.targetId ? `· ${e.targetId.slice(-8)}` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          <div className="mt-4 flex items-center justify-between text-sm text-muted">
            <span>{t('audit.total', { count: q.data!.total })}</span>
            <div className="flex items-center gap-2">
              <Button size="sm" icon={<ChevronLeft size={14} className="rtl:rotate-180" />} disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label={t('common.previous')} />
              <span className="tabular-nums">
                {page} / {pages}
              </span>
              <Button size="sm" icon={<ChevronRight size={14} className="rtl:rotate-180" />} disabled={page >= pages} onClick={() => setPage((p) => p + 1)} aria-label={t('common.next')} />
            </div>
          </div>
        </>
      )}
    </>
  );
}
