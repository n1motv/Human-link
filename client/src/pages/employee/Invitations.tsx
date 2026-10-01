import { useQuery } from '@tanstack/react-query';
import { Check, Video, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Empty, ErrorState, PageHeader, Spinner } from '../../components/ui';
import { api } from '../../lib/api';
import { fmtDateTime } from '../../lib/format';
import { useAction } from '../../lib/hooks';

interface Invitation {
  id: string;
  title: string;
  dateTime: string;
  organizer: { nom: string; prenom: string } | null;
  status: 'en attente' | 'Accepted' | 'Rejected';
}

export default function Invitations() {
  const { t, i18n } = useTranslation();
  const q = useQuery({ queryKey: ['meetings', 'invitations'], queryFn: () => api.get<{ items: Invitation[] }>('/meetings/invitations') });
  const respond = useAction(({ id, response }: { id: string; response: 'Accepted' | 'Rejected' }) => api.post(`/meetings/${id}/respond`, { response }), {
    success: t('meetings.answered'),
    invalidate: [['meetings'], ['calendar']],
  });

  return (
    <>
      <PageHeader title={t('nav.meetings')} subtitle={t('meetings.inviteSubtitle')} />
      {q.isLoading ? (
        <Spinner />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.data!.items.length === 0 ? (
        <Card>
          <Empty icon={<Video size={22} />} title={t('meetings.emptyInvites')} />
        </Card>
      ) : (
        <ul className="space-y-3">
          {q.data!.items.map((m) => {
            const past = new Date(m.dateTime) < new Date();
            return (
              <li key={m.id} className="glass flex flex-wrap items-center gap-4 p-4">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-glass text-accent">
                  <Video size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{m.title}</p>
                  <p className="text-sm text-muted">
                    {fmtDateTime(m.dateTime, i18n.language)}
                    {m.organizer && ` · ${m.organizer.prenom} ${m.organizer.nom}`}
                  </p>
                </div>
                {m.status === 'en attente' && !past ? (
                  <div className="flex gap-2">
                    <Button size="sm" variant="primary" icon={<Check size={14} />} onClick={() => respond.mutate({ id: m.id, response: 'Accepted' })}>
                      {t('meetings.accept')}
                    </Button>
                    <Button size="sm" variant="danger" icon={<X size={14} />} onClick={() => respond.mutate({ id: m.id, response: 'Rejected' })}>
                      {t('meetings.decline')}
                    </Button>
                  </div>
                ) : (
                  <span className={`badge ${m.status === 'Accepted' ? 'badge-ok' : m.status === 'Rejected' ? 'badge-bad' : 'badge'}`}>
                    {m.status === 'Accepted' ? t('meetings.accepted') : m.status === 'Rejected' ? t('meetings.declined') : t('meetings.past')}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
