import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, Gift, Plus, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog, RefuseDialog } from '../../components/DecisionDialog';
import { Modal } from '../../components/Modal';
import { StatusBadge } from '../../components/StatusBadge';
import { Button, Card, Empty, ErrorState, Field, Input, PageHeader, Select, Spinner, TableWrap, Textarea } from '../../components/ui';
import { api } from '../../lib/api';
import { fmtDate, fmtMoney } from '../../lib/format';
import { useAction } from '../../lib/hooks';
import type { Bonus } from '../../lib/types';

interface TeamMember {
  id: string;
  nom: string;
  prenom: string;
}

function NewBonus({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const team = useQuery({ queryKey: ['team'], queryFn: () => api.get<{ team: TeamMember[] }>('/org/team'), enabled: open });
  const [v, setV] = useState({ employeId: '', montant: '', motif: '' });
  const create = useAction(() => api.post('/bonuses', { employeId: v.employeId, montant: Number(v.montant), motif: v.motif }), {
    success: t('bonus.submitted'),
    invalidate: [['bonuses']],
    onSuccess: () => {
      setV({ employeId: '', montant: '', motif: '' });
      onClose();
    },
  });
  const valid = v.employeId && Number(v.montant) > 0 && v.motif.trim();

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('bonus.new')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={!valid} loading={create.isPending} onClick={() => create.mutate()}>
            {t('bonus.submit')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t('common.employee')} required>
          <Select value={v.employeId} onChange={(e) => setV({ ...v, employeId: e.target.value })}>
            <option value="">—</option>
            {team.data?.team.map((m) => (
              <option key={m.id} value={m.id}>
                {m.prenom} {m.nom}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('bonus.amount')} required>
          <Input type="number" min="1" step="0.01" inputMode="decimal" value={v.montant} onChange={(e) => setV({ ...v, montant: e.target.value })} />
        </Field>
        <Field label={t('bonus.reason')} required>
          <Textarea value={v.motif} maxLength={1000} onChange={(e) => setV({ ...v, motif: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}

/** Primes : le manager crée et suit ses demandes ; l'admin les traite. */
export default function Bonuses({ role }: { role: 'admin' | 'manager' }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [open, setOpen] = useState(false);
  const [refusing, setRefusing] = useState<Bonus | null>(null);
  const [approving, setApproving] = useState<Bonus | null>(null);
  const q = useQuery({ queryKey: ['bonuses'], queryFn: () => api.get<{ items: Bonus[] }>('/bonuses') });
  const decide = useAction(
    ({ id, decision, motifRefus }: { id: string; decision: 'accepte' | 'refuse'; motifRefus?: string }) => api.post(`/bonuses/${id}/decision`, { decision, motifRefus }),
    { success: t('decision.done'), invalidate: [['bonuses'], ['dashboard']] },
  );

  return (
    <>
      <PageHeader
        title={t('nav.bonuses')}
        subtitle={role === 'manager' ? t('bonus.managerSubtitle') : t('bonus.adminSubtitle')}
        actions={
          role === 'manager' && (
            <Button variant="primary" icon={<Plus size={16} />} onClick={() => setOpen(true)}>
              {t('bonus.new')}
            </Button>
          )
        }
      />
      {q.isLoading ? (
        <Spinner />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.data!.items.length === 0 ? (
        <Card>
          <Empty icon={<Gift size={22} />} title={t('bonus.empty')} />
        </Card>
      ) : (
        <TableWrap>
          <table className="table-glass">
            <thead>
              <tr>
                <th>{t('common.employee')}</th>
                {role === 'admin' && <th>{t('common.manager')}</th>}
                <th>{t('bonus.amount')}</th>
                <th>{t('bonus.reason')}</th>
                <th>{t('common.date')}</th>
                <th>{t('common.status')}</th>
                {role === 'admin' && <th aria-label={t('common.actions')} />}
              </tr>
            </thead>
            <tbody>
              {q.data!.items.map((b) => (
                <tr key={b.id}>
                  <td className="font-semibold">
                    {b.employe?.prenom} {b.employe?.nom}
                  </td>
                  {role === 'admin' && (
                    <td>
                      {b.manager?.prenom} {b.manager?.nom}
                    </td>
                  )}
                  <td className="whitespace-nowrap font-semibold tabular-nums">{fmtMoney(b.montant, lang)}</td>
                  <td className="max-w-xs">
                    <p className="truncate">{b.motif}</p>
                  </td>
                  <td className="whitespace-nowrap text-muted">{fmtDate(b.createdAt, lang)}</td>
                  <td>
                    <StatusBadge status={b.statut} />
                    {b.statut === 'refuse' && b.motifRefus && <p className="mt-1 max-w-[14rem] text-xs text-bad">{b.motifRefus}</p>}
                  </td>
                  {role === 'admin' && (
                    <td>
                      {b.statut === 'en attente' && (
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="primary" icon={<Check size={14} />} onClick={() => setApproving(b)}>
                            {t('decision.approve')}
                          </Button>
                          <Button size="sm" variant="danger" icon={<X size={14} />} onClick={() => setRefusing(b)}>
                            {t('decision.refuse')}
                          </Button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
      <NewBonus open={open} onClose={() => setOpen(false)} />
      <ConfirmDialog
        open={!!approving}
        icon={<Check size={22} />}
        title={t('confirm.approveTitle')}
        message={t('confirm.approveMsg', { name: `${approving?.employe?.prenom ?? ''} ${approving?.employe?.nom ?? ''}`.trim() })}
        confirmLabel={t('decision.approve')}
        onClose={() => setApproving(null)}
        onConfirm={() => decide.mutateAsync({ id: approving!.id, decision: 'accepte' })}
      />
      <RefuseDialog open={!!refusing} onClose={() => setRefusing(null)} onConfirm={(motifRefus) => decide.mutateAsync({ id: refusing!.id, decision: 'refuse', motifRefus })} />
    </>
  );
}
