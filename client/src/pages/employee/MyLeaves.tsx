import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Paperclip, Plane, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '../../components/DecisionDialog';
import { Modal } from '../../components/Modal';
import { StatusBadge } from '../../components/StatusBadge';
import { Button, Card, Empty, ErrorState, Field, Input, PageHeader, Select, Spinner, Textarea, TableWrap } from '../../components/ui';
import { api, downloadFile } from '../../lib/api';
import { useUser } from '../../lib/auth';
import { useConfig } from '../../lib/config';
import { addDaysIso, fmtDate, fmtNumber, todayIso } from '../../lib/format';
import { useAction, useErrorText } from '../../lib/hooks';
import type { Leave } from '../../lib/types';

const REASONS = ['annual', 'family', 'religious', 'travel', 'personal', 'other'];

/** Jours ouvrés entre deux dates (aperçu ; le serveur recalcule et fait foi). */
function workingDays(from: string, to: string, working: number[]): number {
  if (!from || !to || to < from) return 0;
  let n = 0;
  for (let d = from; d <= to; d = addDaysIso(d, 1)) if (working.includes(new Date(`${d}T00:00:00Z`).getUTCDay())) n++;
  return n;
}

function LeaveForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const user = useUser();
  const { hr } = useConfig();
  const errText = useErrorText();
  const [v, setV] = useState({ raison: 'annual', dateDebut: '', dateFin: '', description: '' });
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const days = useMemo(() => workingDays(v.dateDebut, v.dateFin, hr.workingDays), [v.dateDebut, v.dateFin, hr.workingDays]);
  const insufficient = days > user.soldeConge;
  const valid = v.dateDebut && v.dateFin && v.dateFin >= v.dateDebut && v.dateDebut >= todayIso() && days > 0 && !insufficient;

  const create = useAction(
    () => {
      const fd = new FormData();
      Object.entries(v).forEach(([k, val]) => val && fd.append(k, val));
      if (file) fd.append('attachment', file);
      return api.post('/leaves', fd);
    },
    {
      success: t('leave.submitted'),
      invalidate: [['leaves'], ['profile'], ['notifications']],
      onSuccess: () => {
        setV({ raison: 'annual', dateDebut: '', dateFin: '', description: '' });
        setFile(null);
        setError(null);
        onClose();
      },
    },
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('leave.new')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            loading={create.isPending}
            disabled={!valid}
            onClick={() => {
              setError(null);
              create.mutate(undefined, { onError: (e) => setError(errText(e)) });
            }}
          >
            {t('leave.submit')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <p role="alert" className="rounded-xl border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
        <Field label={t('leave.reason')} required>
          <Select value={v.raison} onChange={(e) => setV({ ...v, raison: e.target.value })}>
            {REASONS.map((r) => (
              <option key={r} value={r}>
                {t(`leave.reasons.${r}`)}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('leave.from')} required>
            <Input type="date" min={todayIso()} value={v.dateDebut} onChange={(e) => setV({ ...v, dateDebut: e.target.value, dateFin: v.dateFin && v.dateFin < e.target.value ? e.target.value : v.dateFin })} />
          </Field>
          <Field label={t('leave.to')} required>
            <Input type="date" min={v.dateDebut || todayIso()} value={v.dateFin} onChange={(e) => setV({ ...v, dateFin: e.target.value })} />
          </Field>
        </div>
        {v.dateDebut && v.dateFin && (
          <p className={`rounded-xl border px-3 py-2 text-sm ${insufficient ? 'border-bad/40 bg-bad/10 text-bad' : 'border-line bg-glass text-muted'}`}>
            {insufficient
              ? t('leave.insufficient', { balance: fmtNumber(user.soldeConge, i18n.language), days })
              : t('leave.preview', { days, balance: fmtNumber(user.soldeConge, i18n.language) })}
          </p>
        )}
        <Field label={t('leave.description')}>
          <Textarea value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} maxLength={2000} />
        </Field>
        <Field label={t('leave.attachment')} hint={t('leave.attachmentHint')}>
          <input type="file" accept="application/pdf,image/png,image/jpeg" className="field" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </Field>
      </div>
    </Modal>
  );
}

export default function MyLeaves() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const user = useUser();
  const [open, setOpen] = useState(false);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['leaves', 'mine'], queryFn: () => api.get<{ items: Leave[] }>('/leaves/mine') });
  const cancel = useAction((id: string) => api.delete(`/leaves/${id}`), { success: t('leave.cancelled'), invalidate: [['leaves']] });

  return (
    <>
      <PageHeader
        title={t('nav.myLeaves')}
        subtitle={t('leave.balanceLine', { balance: fmtNumber(user.soldeConge, lang) })}
        actions={
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => setOpen(true)}>
            {t('leave.new')}
          </Button>
        }
      />
      {q.isLoading ? (
        <Spinner />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.data!.items.length === 0 ? (
        <Card>
          <Empty icon={<Plane size={22} />} title={t('leave.empty')} hint={t('leave.emptyHint')} />
        </Card>
      ) : (
        <TableWrap>
          <table className="table-glass">
            <thead>
              <tr>
                <th>{t('leave.reason')}</th>
                <th>{t('leave.period')}</th>
                <th>{t('leave.daysCol')}</th>
                <th>{t('common.status')}</th>
                <th>{t('leave.steps')}</th>
                <th aria-label={t('common.actions')} />
              </tr>
            </thead>
            <tbody>
              {q.data!.items.map((l) => (
                <tr key={l.id}>
                  <td className="font-semibold">
                    {t(`leave.reasons.${l.raison}`, { defaultValue: l.raison })}
                    {l.description && <p className="max-w-xs truncate text-xs font-normal text-muted">{l.description}</p>}
                  </td>
                  <td className="whitespace-nowrap">
                    {fmtDate(l.dateDebut, lang)} → {fmtDate(l.dateFin, lang)}
                  </td>
                  <td className="tabular-nums">{l.nombreJours}</td>
                  <td>
                    <StatusBadge status={l.statut} />
                    {l.statut === 'refuse' && l.motifRefus && <p className="mt-1 max-w-xs text-xs text-bad">{l.motifRefus}</p>}
                  </td>
                  <td className="text-xs text-muted">
                    <span className="block">{t('leave.stepManager')}: {t(`status.${l.statutManager === 'accepte' ? 'approved' : l.statutManager === 'refuse' ? 'rejected' : 'pending'}`)}</span>
                    <span className="block">{t('leave.stepAdmin')}: {t(`status.${l.statutAdmin === 'accepte' ? 'approved' : l.statutAdmin === 'refuse' ? 'rejected' : 'pending'}`)}</span>
                  </td>
                  <td>
                    <div className="flex justify-end gap-1">
                      {l.attachmentFileId && (
                        <button className="rounded-full p-2 text-muted hover:bg-glass-hover hover:text-fg" aria-label={t('leave.attachment')} onClick={() => downloadFile(`/leaves/${l.id}/attachment`)}>
                          <Paperclip size={16} />
                        </button>
                      )}
                      {l.statut === 'en attente' && (
                        <button className="rounded-full p-2 text-muted hover:bg-glass-hover hover:text-bad" aria-label={t('leave.cancel')} onClick={() => setCancelId(l.id)}>
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}

      <LeaveForm open={open} onClose={() => setOpen(false)} />
      <ConfirmDialog
        open={!!cancelId}
        danger
        title={t('leave.cancel')}
        message={t('leave.cancelConfirm')}
        confirmLabel={t('leave.cancel')}
        onClose={() => setCancelId(null)}
        onConfirm={() => cancel.mutateAsync(cancelId!)}
      />
    </>
  );
}
