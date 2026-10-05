import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Paperclip, Plus, Stethoscope } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../../components/Modal';
import { StatusBadge } from '../../components/StatusBadge';
import { Button, Card, Empty, ErrorState, Field, Input, PageHeader, Select, Spinner, TableWrap, Textarea } from '../../components/ui';
import { api, downloadFile } from '../../lib/api';
import { addDaysIso, fmtDate, todayIso } from '../../lib/format';
import { useAction, useErrorText } from '../../lib/hooks';
import type { Sick } from '../../lib/types';

function SickForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const errText = useErrorText();
  const empty = { typeMaladie: 'justifie', dateDebut: todayIso(), dateFin: todayIso(), description: '' };
  const [v, setV] = useState(empty);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const justified = v.typeMaladie === 'justifie';
  const valid = v.dateFin >= v.dateDebut && v.dateDebut >= addDaysIso(todayIso(), -30) && (!justified || !!file);

  const create = useAction(
    () => {
      const fd = new FormData();
      Object.entries(v).forEach(([k, val]) => val && fd.append(k, val));
      if (file) fd.append('attachment', file);
      return api.post('/sick-leaves', fd);
    },
    {
      success: t('sick.submitted'),
      invalidate: [['sick'], ['notifications']],
      onSuccess: () => {
        setV(empty);
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
      title={t('sick.new')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" loading={create.isPending} disabled={!valid} onClick={() => create.mutate(undefined, { onError: (e) => setError(errText(e)) })}>
            {t('sick.submit')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && (
          <p role="alert" className="rounded-xl border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">
            {error}
          </p>
        )}
        <Field label={t('sick.type')} required>
          <Select value={v.typeMaladie} onChange={(e) => setV({ ...v, typeMaladie: e.target.value })}>
            <option value="justifie">{t('sick.justified')}</option>
            <option value="non justifie">{t('sick.unjustified')}</option>
          </Select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('leave.from')} required>
            <Input
              type="date"
              min={addDaysIso(todayIso(), -30)}
              value={v.dateDebut}
              onChange={(e) => setV({ ...v, dateDebut: e.target.value, dateFin: v.dateFin < e.target.value ? e.target.value : v.dateFin })}
            />
          </Field>
          <Field label={t('leave.to')} required>
            <Input type="date" min={v.dateDebut} value={v.dateFin} onChange={(e) => setV({ ...v, dateFin: e.target.value })} />
          </Field>
        </div>
        <Field label={t('sick.description')} hint={t('sick.privacy')}>
          <Textarea value={v.description} maxLength={2000} onChange={(e) => setV({ ...v, description: e.target.value })} />
        </Field>
        <Field label={t('sick.certificate')} required={justified} hint={t('leave.attachmentHint')}>
          <input type="file" accept="application/pdf,image/png,image/jpeg" className="field" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </Field>
      </div>
    </Modal>
  );
}

export default function MySick() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [open, setOpen] = useState(false);
  const q = useQuery({ queryKey: ['sick', 'mine'], queryFn: () => api.get<{ items: Sick[] }>('/sick-leaves/mine') });

  return (
    <>
      <PageHeader
        title={t('nav.mySick')}
        subtitle={t('sick.subtitle')}
        actions={
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => setOpen(true)}>
            {t('sick.new')}
          </Button>
        }
      />
      {q.isLoading ? (
        <Spinner />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.data!.items.length === 0 ? (
        <Card>
          <Empty icon={<Stethoscope size={22} />} title={t('sick.empty')} />
        </Card>
      ) : (
        <TableWrap>
          <table className="table-glass">
            <thead>
              <tr>
                <th>{t('sick.type')}</th>
                <th>{t('leave.period')}</th>
                <th>{t('common.status')}</th>
                <th aria-label={t('common.actions')} />
              </tr>
            </thead>
            <tbody>
              {q.data!.items.map((s) => (
                <tr key={s.id}>
                  <td className="font-semibold">{s.typeMaladie === 'justifie' ? t('sick.justified') : t('sick.unjustified')}</td>
                  <td className="whitespace-nowrap">
                    {fmtDate(s.dateDebut, lang)} → {fmtDate(s.dateFin, lang)}
                  </td>
                  <td>
                    <StatusBadge status={s.statut} />
                    {s.statut === 'refuse' && s.motifRefus && <p className="mt-1 max-w-xs text-xs text-bad">{s.motifRefus}</p>}
                  </td>
                  <td className="text-end">
                    {s.attachmentFileId && (
                      <button
                        className="rounded-full p-2 text-muted hover:bg-glass-hover hover:text-fg"
                        aria-label={t('sick.certificate')}
                        onClick={() => downloadFile(`/sick-leaves/${s.id}/attachment`)}
                      >
                        <Paperclip size={16} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
      <SickForm open={open} onClose={() => setOpen(false)} />
    </>
  );
}
