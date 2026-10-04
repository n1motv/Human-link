import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Mail, Users, Wifi } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Avatar } from '../../components/Avatar';
import { Button, Card, Empty, ErrorState, PageHeader, Select, Spinner } from '../../components/ui';
import { api } from '../../lib/api';
import { useConfig } from '../../lib/config';
import { useAction } from '../../lib/hooks';

interface Member {
  id: string;
  matricule: string;
  nom: string;
  prenom: string;
  email: string;
  poste?: string;
  departement?: string;
  photoFileId: string | null;
  teleworkMax: number;
  hasPendingLeave: boolean;
}

function TeleworkQuota({ member }: { member: Member }) {
  const { t } = useTranslation();
  const [n, setN] = useState(member.teleworkMax);
  const save = useAction((v: number) => api.patch(`/org/team/${member.id}/telework-max`, { teleworkMax: v }), { success: t('team.quotaSaved'), invalidate: [['team']] });
  return (
    <div className="flex items-center gap-2">
      <Select aria-label={t('team.teleworkQuota')} value={n} onChange={(e) => setN(Number(e.target.value))} className="!min-h-9 !w-20 !rounded-full !py-1">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <option key={i} value={i}>
            {i}
          </option>
        ))}
      </Select>
      <Button size="sm" disabled={n === member.teleworkMax} loading={save.isPending} onClick={() => save.mutate(n)}>
        {t('common.save')}
      </Button>
    </div>
  );
}

export default function Team() {
  const { t } = useTranslation();
  const { modules } = useConfig();
  const q = useQuery({ queryKey: ['team'], queryFn: () => api.get<{ team: Member[] }>('/org/team') });

  return (
    <>
      <PageHeader title={t('nav.team')} subtitle={t('team.subtitle')} />
      {q.isLoading ? (
        <Spinner />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.data!.team.length === 0 ? (
        <Card>
          <Empty icon={<Users size={22} />} title={t('team.empty')} hint={t('team.emptyHint')} />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {q.data!.team.map((m) => (
            <Card key={m.id} className="glass-hover">
              <div className="flex items-start gap-4">
                <Avatar id={m.id} prenom={m.prenom} nom={m.nom} hasPhoto={!!m.photoFileId} size={52} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">
                    {m.prenom} {m.nom}
                  </p>
                  <p className="truncate text-sm text-muted">{m.poste ?? '—'}</p>
                  <a href={`mailto:${m.email}`} className="mt-1 inline-flex max-w-full items-center gap-1.5 truncate text-xs text-subtle hover:text-fg">
                    <Mail size={12} /> <span className="truncate">{m.email}</span>
                  </a>
                </div>
                {m.hasPendingLeave && modules.leaves && (
                  <Link to="/manager/leaves" className="badge badge-warn" title={t('team.pendingLeave')}>
                    {t('status.pending')}
                  </Link>
                )}
              </div>
              {modules.telework && (
                <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-4">
                  <span className="flex items-center gap-2 text-sm text-muted">
                    <Wifi size={15} className="text-info" /> {t('team.teleworkQuota')}
                  </span>
                  <TeleworkQuota member={m} />
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
