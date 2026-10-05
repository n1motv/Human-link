import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ShieldCheck, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '../../components/DecisionDialog';
import { Modal } from '../../components/Modal';
import { PersonPicker, type Person } from '../../components/PersonPicker';
import { VaultList } from '../../components/VaultList';
import { Button, Card, ErrorState, Field, Input, PageHeader, Select, Spinner } from '../../components/ui';
import { api } from '../../lib/api';
import { useAction, useErrorText } from '../../lib/hooks';
import type { VaultFile } from '../../lib/types';

function UploadModal({ userId, open, onClose }: { userId: string; open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const errText = useErrorText();
  const now = new Date();
  const [type, setType] = useState<'bulletin' | 'contrat' | 'autre'>('bulletin');
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [year, setYear] = useState(String(now.getFullYear()));
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const up = useAction(
    () => {
      const fd = new FormData();
      fd.append('type', type);
      if (type === 'autre') fd.append('name', name);
      else {
        fd.append('month', month);
        fd.append('year', year);
      }
      fd.append('file', file!);
      return api.post(`/documents/user/${userId}`, fd);
    },
    {
      success: t('vault.uploaded'),
      invalidate: [['vault']],
      onSuccess: () => {
        setFile(null);
        setName('');
        setError(null);
        onClose();
      },
    },
  );
  const valid = !!file && (type === 'autre' ? name.trim() : month && year);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('vault.upload')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={!valid} loading={up.isPending} onClick={() => up.mutate(undefined, { onError: (e) => setError(errText(e)) })}>
            {t('vault.send')}
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
        <Field label={t('vault.type')} required>
          <Select value={type} onChange={(e) => setType(e.target.value as typeof type)}>
            <option value="bulletin">{t('vault.cat.bulletin')}</option>
            <option value="contrat">{t('vault.cat.contrat')}</option>
            <option value="autre">{t('vault.cat.autre')}</option>
          </Select>
        </Field>
        {type === 'autre' ? (
          <Field label={t('vault.docName')} required>
            <Input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
          </Field>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <Field label={t('vault.month')} required>
              <Select value={month} onChange={(e) => setMonth(e.target.value)}>
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i} value={i + 1}>
                    {String(i + 1).padStart(2, '0')}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('vault.year')} required>
              <Input type="number" min="1990" max="2100" value={year} onChange={(e) => setYear(e.target.value)} />
            </Field>
          </div>
        )}
        <Field label={t('vault.file')} required hint={t('vault.pdfOnly')}>
          <input type="file" accept="application/pdf" className="field" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </Field>
      </div>
    </Modal>
  );
}

export default function AdminVault() {
  const { t } = useTranslation();
  const [person, setPerson] = useState<Person | null>(null);
  const userId = person?.id ?? '';
  const [upload, setUpload] = useState(false);
  const [del, setDel] = useState<VaultFile | null>(null);
  const files = useQuery({ queryKey: ['vault', userId], queryFn: () => api.get<{ items: VaultFile[] }>(`/documents/user/${userId}`), enabled: !!userId });
  const remove = useAction((id: string) => api.delete(`/documents/${id}`), { success: t('vault.deleted'), invalidate: [['vault']] });

  return (
    <>
      <PageHeader title={t('nav.vault')} subtitle={t('vault.adminSubtitle')} />
      <Card className="mb-6">
        <div className="flex flex-wrap items-end gap-4">
          <Field label={t('common.employee')} className="min-w-[16rem] flex-1">
            <PersonPicker value={person} onChange={setPerson} filter="status=active&notRole=admin" placeholder={t('vault.choose')} />
          </Field>
          <Button variant="primary" icon={<Upload size={16} />} disabled={!userId} onClick={() => setUpload(true)}>
            {t('vault.upload')}
          </Button>
        </div>
        <p className="mt-3 flex items-center gap-2 text-xs text-muted">
          <ShieldCheck size={14} className="text-ok" /> {t('vault.encrypted')} {t('vault.audited')}
        </p>
      </Card>

      {userId &&
        (files.isLoading ? (
          <Spinner />
        ) : files.isError ? (
          <ErrorState error={files.error} onRetry={() => files.refetch()} />
        ) : (
          <VaultList files={files.data!.items} onDelete={setDel} />
        ))}

      {userId && <UploadModal userId={userId} open={upload} onClose={() => setUpload(false)} />}
      <ConfirmDialog
        open={!!del}
        danger
        title={t('common.delete')}
        message={t('vault.deleteConfirm', { name: del?.label ?? '' })}
        confirmLabel={t('common.delete')}
        onClose={() => setDel(null)}
        onConfirm={() => remove.mutateAsync(del!.id)}
      />
    </>
  );
}
