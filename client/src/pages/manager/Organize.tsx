import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Trash2, Video } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '../../components/DecisionDialog';
import { Modal } from '../../components/Modal';
import { Button, Card, Empty, ErrorState, Field, Input, PageHeader, Spinner, TableWrap } from '../../components/ui';
import { api } from '../../lib/api';
import { fmtDateTime } from '../../lib/format';
import { useAction } from '../../lib/hooks';

interface Organized {
  id: string;
  title: string;
  dateTime: string;
  invited: number;
  accepted: number;
  rejected: number;
}
interface Person {
  id: string;
  nom: string;
  prenom: string;
  role: string;
  poste?: string;
}

function NewMeeting({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const people = useQuery({ queryKey: ['meetings', 'invitable'], queryFn: () => api.get<{ items: Person[] }>('/meetings/invitable'), enabled: open });
  const [title, setTitle] = useState('');
  const [when, setWhen] = useState('');
  const [sel, setSel] = useState<string[]>([]);
  const create = useAction(() => api.post('/meetings', { title, dateTime: new Date(when).toISOString(), invitees: sel }), {
    success: t('meetings.created'),
    invalidate: [['meetings']],
    onSuccess: () => {
      setTitle('');
      setWhen('');
      setSel([]);
      onClose();
    },
  });
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('meetings.new')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" loading={create.isPending} disabled={!title.trim() || !when || !sel.length} onClick={() => create.mutate()}>
            {t('meetings.send')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t('meetings.title')} required>
          <Input value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label={t('meetings.when')} required>
          <Input type="datetime-local" value={when} min={new Date().toISOString().slice(0, 16)} onChange={(e) => setWhen(e.target.value)} />
        </Field>
        <fieldset>
          <legend className="mb-1.5 text-xs font-semibold text-muted">{t('meetings.invitees')} *</legend>
          <ul className="max-h-52 space-y-1 overflow-y-auto rounded-2xl border border-line bg-glass p-2">
            {people.isLoading && <li className="skeleton h-9" />}
            {people.data?.items.map((p) => (
              <li key={p.id}>
                <label className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 hover:bg-glass-hover">
                  <input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={sel.includes(p.id)} onChange={() => toggle(p.id)} />
                  <span className="flex-1 text-sm font-medium">
                    {p.prenom} {p.nom}
                  </span>
                  <span className="text-xs text-subtle">{p.role === 'manager' ? t('role.manager') : p.poste}</span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      </div>
    </Modal>
  );
}

export default function Organize() {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [del, setDel] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['meetings', 'organized'], queryFn: () => api.get<{ items: Organized[] }>('/meetings/organized') });
  const remove = useAction((id: string) => api.delete(`/meetings/${id}`), { success: t('meetings.deleted'), invalidate: [['meetings']] });

  return (
    <>
      <PageHeader
        title={t('nav.organize')}
        subtitle={t('meetings.subtitle')}
        actions={
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => setOpen(true)}>
            {t('meetings.new')}
          </Button>
        }
      />
      {q.isLoading ? (
        <Spinner />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.data!.items.length === 0 ? (
        <Card>
          <Empty icon={<Video size={22} />} title={t('meetings.empty')} />
        </Card>
      ) : (
        <TableWrap>
          <table className="table-glass">
            <thead>
              <tr>
                <th>{t('meetings.title')}</th>
                <th>{t('meetings.when')}</th>
                <th>{t('meetings.invited')}</th>
                <th>{t('meetings.accepted')}</th>
                <th>{t('meetings.declined')}</th>
                <th aria-label={t('common.actions')} />
              </tr>
            </thead>
            <tbody>
              {q.data!.items.map((m) => (
                <tr key={m.id}>
                  <td className="font-semibold">{m.title}</td>
                  <td className="whitespace-nowrap">{fmtDateTime(m.dateTime, i18n.language)}</td>
                  <td className="tabular-nums">{m.invited}</td>
                  <td className="tabular-nums text-ok">{m.accepted}</td>
                  <td className="tabular-nums text-bad">{m.rejected}</td>
                  <td className="text-end">
                    <button className="rounded-full p-2 text-muted hover:bg-glass-hover hover:text-bad" aria-label={t('common.delete')} onClick={() => setDel(m.id)}>
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
      <NewMeeting open={open} onClose={() => setOpen(false)} />
      <ConfirmDialog
        open={!!del}
        danger
        title={t('common.delete')}
        message={t('meetings.deleteConfirm')}
        confirmLabel={t('common.delete')}
        onClose={() => setDel(null)}
        onConfirm={() => remove.mutateAsync(del!)}
      />
    </>
  );
}
