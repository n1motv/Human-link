import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, Paperclip, ShieldAlert, Stethoscope, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Avatar } from '../../components/Avatar';
import { RefuseDialog } from '../../components/DecisionDialog';
import { StatusBadge } from '../../components/StatusBadge';
import { Button, Card, Empty, ErrorState, PageHeader, Spinner, TableWrap, Tabs } from '../../components/ui';
import { api, downloadFile } from '../../lib/api';
import { fmtDate } from '../../lib/format';
import { useAction } from '../../lib/hooks';
import type { Sick } from '../../lib/types';

type Filter = 'en attente' | 'accepte' | 'refuse' | 'all';

export default function SickRequests() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [filter, setFilter] = useState<Filter>('en attente');
  const [refusing, setRefusing] = useState<Sick | null>(null);
  const q = useQuery({ queryKey: ['sick', 'all', filter], queryFn: () => api.get<{ items: Sick[] }>(`/sick-leaves${filter === 'all' ? '' : `?statut=${encodeURIComponent(filter)}`}`) });
  const decide = useAction(
    ({ id, decision, motifRefus }: { id: string; decision: 'accepte' | 'refuse'; motifRefus?: string }) => api.post(`/sick-leaves/${id}/decision`, { decision, motifRefus }),
    { success: t('decision.done'), invalidate: [['sick'], ['dashboard']] },
  );

  return (
    <>
      <PageHeader title={t('nav.sick')} subtitle={t('sick.adminSubtitle')} />
      <p className="mb-4 flex items-center gap-2 rounded-2xl border border-line bg-glass px-4 py-3 text-sm text-muted">
        <ShieldAlert size={16} className="shrink-0 text-warn" /> {t('sick.healthNotice')}
      </p>
      <div className="mb-5">
        <Tabs
          value={filter}
          onChange={setFilter}
          items={[
            { value: 'en attente', label: t('status.pending') },
            { value: 'accepte', label: t('status.approved') },
            { value: 'refuse', label: t('status.rejected') },
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
          <Empty icon={<Stethoscope size={22} />} title={t('sick.noneToReview')} />
        </Card>
      ) : (
        <TableWrap>
          <table className="table-glass">
            <thead>
              <tr>
                <th>{t('common.employee')}</th>
                <th>{t('sick.type')}</th>
                <th>{t('leave.period')}</th>
                <th>{t('common.status')}</th>
                <th aria-label={t('common.actions')} />
              </tr>
            </thead>
            <tbody>
              {q.data!.items.map((s) => (
                <tr key={s.id}>
                  <td>
                    <div className="flex items-center gap-3">
                      <Avatar id={s.userId} prenom={s.user?.prenom} nom={s.user?.nom} hasPhoto={!!s.user?.photoFileId} size={34} />
                      <div className="min-w-0">
                        <p className="truncate font-semibold">
                          {s.user?.prenom} {s.user?.nom}
                        </p>
                        <p className="truncate text-xs text-muted">{s.user?.departement}</p>
                      </div>
                    </div>
                  </td>
                  <td>
                    {s.typeMaladie === 'justifie' ? t('sick.justified') : t('sick.unjustified')}
                    {s.description && <p className="max-w-[16rem] truncate text-xs text-muted">{s.description}</p>}
                  </td>
                  <td className="whitespace-nowrap">
                    {fmtDate(s.dateDebut, lang)} → {fmtDate(s.dateFin, lang)}
                  </td>
                  <td>
                    <StatusBadge status={s.statut} />
                    {s.statut === 'refuse' && s.motifRefus && <p className="mt-1 max-w-[14rem] text-xs text-bad">{s.motifRefus}</p>}
                  </td>
                  <td>
                    <div className="flex items-center justify-end gap-2">
                      {s.attachmentFileId && (
                        <button className="rounded-full p-2 text-muted hover:bg-glass-hover hover:text-fg" aria-label={t('sick.certificate')} onClick={() => downloadFile(`/sick-leaves/${s.id}/attachment`)}>
                          <Paperclip size={16} />
                        </button>
                      )}
                      {s.statut === 'en attente' && (
                        <>
                          <Button size="sm" variant="primary" icon={<Check size={14} />} onClick={() => decide.mutate({ id: s.id, decision: 'accepte' })}>
                            {t('decision.approve')}
                          </Button>
                          <Button size="sm" variant="danger" icon={<X size={14} />} onClick={() => setRefusing(s)}>
                            {t('decision.refuse')}
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
      <RefuseDialog open={!!refusing} onClose={() => setRefusing(null)} onConfirm={(motifRefus) => decide.mutateAsync({ id: refusing!.id, decision: 'refuse', motifRefus })} />
    </>
  );
}
