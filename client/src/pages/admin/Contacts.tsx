import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Inbox, Mail, Phone, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '../../components/DecisionDialog';
import { Card, Empty, ErrorState, PageHeader, Spinner } from '../../components/ui';
import { api } from '../../lib/api';
import { fmtDateTime } from '../../lib/format';
import { useAction } from '../../lib/hooks';

interface ContactItem {
  id: string;
  nom?: string;
  prenom?: string;
  email: string;
  telephone?: string;
  sujet: string;
  message: string;
  userId?: string;
  createdAt: string;
}

export default function Contacts() {
  const { t, i18n } = useTranslation();
  const [del, setDel] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['contacts'], queryFn: () => api.get<{ items: ContactItem[] }>('/contact') });
  const remove = useAction((id: string) => api.delete(`/contact/${id}`), { success: t('contact.deleted'), invalidate: [['contacts']] });

  return (
    <>
      <PageHeader title={t('nav.contacts')} subtitle={t('contact.adminSubtitle')} />
      {q.isLoading ? (
        <Spinner />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.data!.items.length === 0 ? (
        <Card>
          <Empty icon={<Inbox size={22} />} title={t('contact.empty')} />
        </Card>
      ) : (
        <ul className="space-y-4">
          {q.data!.items.map((c) => (
            <li key={c.id} className="glass p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-bold">{c.sujet}</p>
                  <p className="mt-0.5 text-sm text-muted">
                    {[c.prenom, c.nom].filter(Boolean).join(' ') || '—'} {c.userId && <span className="badge badge-accent ms-2">{t('contact.member')}</span>}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-subtle">{fmtDateTime(c.createdAt, i18n.language)}</span>
                  <button className="rounded-full p-2 text-muted hover:bg-glass-hover hover:text-bad" aria-label={t('common.delete')} onClick={() => setDel(c.id)}>
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm">{c.message}</p>
              <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted">
                <a className="inline-flex items-center gap-1.5 hover:text-fg" href={`mailto:${c.email}?subject=Re: ${encodeURIComponent(c.sujet)}`}>
                  <Mail size={13} /> {c.email}
                </a>
                {c.telephone && (
                  <a className="inline-flex items-center gap-1.5 hover:text-fg" href={`tel:${c.telephone}`}>
                    <Phone size={13} /> {c.telephone}
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog open={!!del} danger title={t('common.delete')} message={t('contact.deleteConfirm')} confirmLabel={t('common.delete')} onClose={() => setDel(null)} onConfirm={() => remove.mutateAsync(del!)} />
    </>
  );
}
