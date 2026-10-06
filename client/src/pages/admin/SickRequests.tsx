import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, Paperclip, ShieldAlert, Stethoscope, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Avatar } from '../../components/Avatar';
import { BulkBar, PeopleList } from '../../components/BulkBar';
import { ConfirmDialog, RefuseDialog } from '../../components/DecisionDialog';
import { StatusBadge } from '../../components/StatusBadge';
import { Button, Card, Empty, ErrorState, PageHeader, Spinner, TableWrap, Tabs } from '../../components/ui';
import { api, downloadFile } from '../../lib/api';
import { fmtDate } from '../../lib/format';
import { useAction } from '../../lib/hooks';
import { useBulkDecision } from '../../lib/useBulkDecision';
import type { Sick } from '../../lib/types';

type Filter = 'en attente' | 'accepte' | 'refuse' | 'all';

export default function SickRequests() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [filter, setFilter] = useState<Filter>('en attente');
  const [refusing, setRefusing] = useState<Sick | null>(null);
  const [bulk, setBulk] = useState<'approve' | 'refuse' | null>(null);
  const [approving, setApproving] = useState<Sick | null>(null);
  const q = useQuery({
    queryKey: ['sick', 'all', filter],
    queryFn: () => api.get<{ items: Sick[] }>(`/sick-leaves${filter === 'all' ? '' : `?statut=${encodeURIComponent(filter)}`}`),
  });
  const decide = useAction(
    ({ id, decision, motifRefus }: { id: string; decision: 'accepte' | 'refuse'; motifRefus?: string }) => api.post(`/sick-leaves/${id}/decision`, { decision, motifRefus }),
    { success: t('decision.done'), invalidate: [['sick'], ['dashboard']] },
  );

  const canDecide = (s: Sick) => s.statut === 'en attente';
  const bulkSel = useBulkDecision<Sick>({
    rows: q.data?.items,
    canDecide,
    path: (id) => `/sick-leaves/${id}/decision`,
    nameOf: (s) => `${s.user?.prenom ?? ''} ${s.user?.nom ?? ''}`.trim(),
    invalidate: [['sick'], ['dashboard']],
  });
  const bulkNames = bulkSel.selectedRows.map((s) => `${s.user?.prenom ?? ''} ${s.user?.nom ?? ''}`.trim());

  return (
    <>
      <PageHeader title={t('nav.sick')} subtitle={t('sick.adminSubtitle')} />
      <p className="mb-4 flex items-center gap-2 rounded-2xl border border-line bg-glass px-4 py-3 text-sm text-muted">
        <ShieldAlert size={16} className="shrink-0 text-warn" /> {t('sick.healthNotice')}
      </p>
      <div className="mb-5">
        <Tabs
          value={filter}
          onChange={(f) => {
            setFilter(f);
            bulkSel.clear();
          }}
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
                <th className="w-10">
                  {bulkSel.selectable.length > 0 && (
                    <input
                      type="checkbox"
                      className="h-4 w-4 cursor-pointer accent-[var(--accent)]"
                      checked={bulkSel.allSelected}
                      onChange={bulkSel.toggleAll}
                      aria-label={t('bulk.selectAll')}
                    />
                  )}
                </th>
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
                    {canDecide(s) && (
                      <input
                        type="checkbox"
                        className="h-4 w-4 cursor-pointer accent-[var(--accent)]"
                        checked={bulkSel.selected.has(s.id)}
                        onChange={() => bulkSel.toggle(s.id)}
                        aria-label={t('bulk.select', { name: `${s.user?.prenom ?? ''} ${s.user?.nom ?? ''}`.trim() })}
                      />
                    )}
                  </td>
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
                        <button
                          className="rounded-full p-2 text-muted hover:bg-glass-hover hover:text-fg"
                          aria-label={t('sick.certificate')}
                          onClick={() => downloadFile(`/sick-leaves/${s.id}/attachment`)}
                        >
                          <Paperclip size={16} />
                        </button>
                      )}
                      {canDecide(s) && (
                        <>
                          <Button size="sm" variant="primary" icon={<Check size={14} />} onClick={() => setApproving(s)}>
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
      <BulkBar count={bulkSel.selectedRows.length} onApprove={() => setBulk('approve')} onRefuse={() => setBulk('refuse')} onClear={bulkSel.clear} />
      <ConfirmDialog
        open={bulk === 'approve'}
        icon={<Check size={22} />}
        title={t('bulk.approveTitle', { count: bulkSel.selectedRows.length })}
        message={t('bulk.approveMsg')}
        details={<PeopleList names={bulkNames} />}
        confirmLabel={t('bulk.approveConfirm', { count: bulkSel.selectedRows.length })}
        onClose={() => setBulk(null)}
        onConfirm={() => bulkSel.decide('accepte')}
      />
      <RefuseDialog
        open={bulk === 'refuse'}
        title={t('bulk.refuseTitle', { count: bulkSel.selectedRows.length })}
        details={
          <>
            <p className="mb-2 text-sm text-muted">{t('bulk.refuseMsg')}</p>
            <PeopleList names={bulkNames} />
          </>
        }
        onClose={() => setBulk(null)}
        onConfirm={(motif) => bulkSel.decide('refuse', motif)}
      />
      <ConfirmDialog
        open={!!approving}
        icon={<Check size={22} />}
        title={t('confirm.approveTitle')}
        message={t('confirm.approveMsg', { name: `${approving?.user?.prenom ?? ''} ${approving?.user?.nom ?? ''}`.trim() })}
        confirmLabel={t('decision.approve')}
        onClose={() => setApproving(null)}
        onConfirm={() => decide.mutateAsync({ id: approving!.id, decision: 'accepte' })}
      />
      <RefuseDialog open={!!refusing} onClose={() => setRefusing(null)} onConfirm={(motifRefus) => decide.mutateAsync({ id: refusing!.id, decision: 'refuse', motifRefus })} />
    </>
  );
}
