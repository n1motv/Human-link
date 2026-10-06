import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, Paperclip, Plane, X } from 'lucide-react';
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
import type { Leave } from '../../lib/types';

type Filter = 'en attente' | 'accepte' | 'refuse' | 'all';

/** Demandes de congé à traiter : même page pour le manager (son équipe) et l'admin (tout le monde). */
export default function LeaveRequests({ role }: { role: 'admin' | 'manager' }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [filter, setFilter] = useState<Filter>('en attente');
  const [refusing, setRefusing] = useState<Leave | null>(null);
  const [bulk, setBulk] = useState<'approve' | 'refuse' | null>(null);
  const [approving, setApproving] = useState<Leave | null>(null);

  const q = useQuery({
    queryKey: ['leaves', 'all', filter],
    queryFn: () => api.get<{ items: Leave[] }>(`/leaves${filter === 'all' ? '' : `?statut=${encodeURIComponent(filter)}`}`),
  });
  const decide = useAction(
    ({ id, decision, motifRefus }: { id: string; decision: 'accepte' | 'refuse'; motifRefus?: string }) => api.post(`/leaves/${id}/decision`, { decision, motifRefus }),
    { success: t('decision.done'), invalidate: [['leaves'], ['dashboard'], ['team']] },
  );

  /** Ce que cette personne peut faire sur la demande, selon son rôle et l'étape où elle en est. */
  const canDecide = (l: Leave) => l.statut === 'en attente' && (role === 'manager' ? l.statutManager === 'en attente' : l.statutManager === 'accepte');
  const bulkSel = useBulkDecision<Leave>({
    rows: q.data?.items,
    canDecide,
    path: (id) => `/leaves/${id}/decision`,
    nameOf: (l) => `${l.user?.prenom ?? ''} ${l.user?.nom ?? ''}`.trim(),
    invalidate: [['leaves'], ['dashboard'], ['team']],
  });
  const bulkNames = bulkSel.selectedRows.map((l) => `${l.user?.prenom ?? ''} ${l.user?.nom ?? ''}`.trim());

  return (
    <>
      <PageHeader title={role === 'manager' ? t('nav.teamLeaves') : t('nav.leaves')} subtitle={role === 'manager' ? t('leave.managerSubtitle') : t('leave.adminSubtitle')} />
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
          <Empty icon={<Plane size={22} />} title={t('leave.noneToReview')} />
        </Card>
      ) : (
        <TableWrap>
          <table className="table-glass">
            <thead>
              <tr>
                <th className="w-8 !pe-0">
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
                <th>{t('leave.reason')}</th>
                <th>{t('leave.period')}</th>
                <th>{t('common.status')}</th>
                <th aria-label={t('common.actions')} />
              </tr>
            </thead>
            <tbody>
              {q.data!.items.map((l) => (
                <tr key={l.id}>
                  <td className="!pe-0">
                    {canDecide(l) && (
                      <input
                        type="checkbox"
                        className="h-4 w-4 cursor-pointer accent-[var(--accent)]"
                        checked={bulkSel.selected.has(l.id)}
                        onChange={() => bulkSel.toggle(l.id)}
                        aria-label={t('bulk.select', { name: `${l.user?.prenom ?? ''} ${l.user?.nom ?? ''}`.trim() })}
                      />
                    )}
                  </td>
                  <td>
                    <div className="flex items-center gap-3">
                      <Avatar id={l.userId} prenom={l.user?.prenom} nom={l.user?.nom} hasPhoto={!!l.user?.photoFileId} size={34} />
                      <div className="min-w-0">
                        <p className="truncate font-semibold">
                          {l.user?.prenom} {l.user?.nom}
                        </p>
                        <p className="truncate text-xs text-muted">{l.user?.departement}</p>
                      </div>
                    </div>
                  </td>
                  <td>
                    {t(`leave.reasons.${l.raison}`, { defaultValue: l.raison })}
                    {l.description && <p className="max-w-[16rem] truncate text-xs text-muted">{l.description}</p>}
                  </td>
                  <td className="whitespace-nowrap">
                    {fmtDate(l.dateDebut, lang)} → {fmtDate(l.dateFin, lang)}
                    <p className="text-xs text-muted tabular-nums">{t('leave.nDays', { count: l.nombreJours })}</p>
                  </td>
                  <td>
                    <StatusBadge status={l.statut} />
                    {role === 'admin' && l.statut === 'en attente' && l.statutManager === 'en attente' && <p className="mt-1 text-xs text-muted">{t('leave.awaitingManager')}</p>}
                    {l.statut === 'refuse' && l.motifRefus && <p className="mt-1 max-w-[14rem] text-xs text-bad">{l.motifRefus}</p>}
                  </td>
                  <td>
                    <div className="flex items-center justify-end gap-2">
                      {l.attachmentFileId && (
                        <button
                          className="rounded-full p-2 text-muted hover:bg-glass-hover hover:text-fg"
                          aria-label={t('leave.attachment')}
                          onClick={() => downloadFile(`/leaves/${l.id}/attachment`)}
                        >
                          <Paperclip size={16} />
                        </button>
                      )}
                      {canDecide(l) && (
                        <>
                          <Button
                            size="sm"
                            variant="primary"
                            icon={<Check size={14} />}
                            loading={decide.isPending && decide.variables?.id === l.id}
                            onClick={() => setApproving(l)}
                          >
                            {t('decision.approve')}
                          </Button>
                          <Button size="sm" variant="danger" icon={<X size={14} />} onClick={() => setRefusing(l)}>
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
