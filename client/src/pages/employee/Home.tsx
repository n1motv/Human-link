import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CalendarCheck, FileText, Plane, UserCog, Video, Wifi } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Avatar } from '../../components/Avatar';
import { StatusBadge } from '../../components/StatusBadge';
import { Card, Empty, PageHeader, Spinner, StatTile } from '../../components/ui';
import { api } from '../../lib/api';
import { useUser } from '../../lib/auth';
import { useConfig } from '../../lib/config';
import { fmtDate, fmtNumber, todayIso } from '../../lib/format';
import type { Leave, User } from '../../lib/types';

export default function Home() {
  const { t, i18n } = useTranslation();
  const me = useUser();
  const { modules } = useConfig();
  const lang = i18n.language;

  const profile = useQuery({ queryKey: ['profile'], queryFn: () => api.get<{ user: User }>('/users/me/profile') });
  const leaves = useQuery({ queryKey: ['leaves', 'mine'], queryFn: () => api.get<{ items: Leave[] }>('/leaves/mine'), enabled: modules.leaves });
  const week = useQuery({ queryKey: ['telework', 'next'], queryFn: () => api.get<{ days: string[]; chosen: string[]; max: number }>('/telework/next-week'), enabled: modules.telework });
  const invites = useQuery({
    queryKey: ['meetings', 'invitations'],
    queryFn: () => api.get<{ items: { id: string; status: string; dateTime: string }[] }>('/meetings/invitations'),
    enabled: modules.meetings,
  });

  const u = profile.data?.user ?? me;
  const pending = leaves.data?.items.filter((l) => l.statut === 'en attente').length ?? 0;
  const upcoming = leaves.data?.items.filter((l) => l.statut === 'accepte' && l.dateFin >= todayIso()).sort((a, b) => a.dateDebut.localeCompare(b.dateDebut)) ?? [];
  const pendingInvites = invites.data?.items.filter((i) => i.status === 'en attente' && new Date(i.dateTime) > new Date()).length ?? 0;

  const quick = [
    { to: '/me/leaves', icon: Plane, label: t('home.requestLeave'), show: modules.leaves },
    { to: '/me/telework', icon: Wifi, label: t('home.pickTelework'), show: modules.telework },
    { to: '/me/vault', icon: FileText, label: t('home.openVault'), show: modules.vault },
    { to: '/me/profile', icon: UserCog, label: t('home.editProfile'), show: true },
  ].filter((q) => q.show);

  return (
    <>
      <PageHeader title={t('home.hello', { name: me.prenom })} subtitle={t('home.subtitle')} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {modules.leaves && <StatTile label={t('home.balance')} value={fmtNumber(u.soldeConge, lang)} hint={t('home.days')} icon={<CalendarCheck size={18} />} tone="accent" />}
        {modules.leaves && <StatTile label={t('home.pending')} value={pending} hint={t('home.pendingHint')} icon={<Plane size={18} />} tone="warn" />}
        {modules.telework && <StatTile label={t('home.telework')} value={`${week.data?.chosen.length ?? 0}/${week.data?.max ?? u.teleworkMax}`} hint={t('home.nextWeek')} icon={<Wifi size={18} />} tone="info" />}
        {modules.meetings && <StatTile label={t('home.invitations')} value={pendingInvites} hint={t('home.toAnswer')} icon={<Video size={18} />} tone="ok" />}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold">{t('home.upcoming')}</h2>
            {modules.leaves && (
              <Link to="/me/leaves" className="inline-flex items-center gap-1 text-sm font-semibold text-accent hover:underline">
                {t('common.seeAll')} <ArrowRight size={14} className="rtl:rotate-180" />
              </Link>
            )}
          </div>
          {leaves.isLoading ? (
            <Spinner />
          ) : upcoming.length === 0 ? (
            <Empty icon={<Plane size={22} />} title={t('home.noUpcoming')} hint={t('home.noUpcomingHint')} />
          ) : (
            <ul className="divide-y divide-[var(--grid)]">
              {upcoming.slice(0, 5).map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-4 py-3">
                  <div>
                    <p className="font-semibold">{t(`leave.reasons.${l.raison}`, { defaultValue: l.raison })}</p>
                    <p className="text-sm text-muted">
                      {fmtDate(l.dateDebut, lang)} → {fmtDate(l.dateFin, lang)} · {t('leave.days', { count: l.nombreJours })}
                    </p>
                  </div>
                  <StatusBadge status={l.statut} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-6">
          <Card>
            <div className="flex items-center gap-4">
              <Avatar id={u.id} prenom={u.prenom} nom={u.nom} hasPhoto={!!u.photoFileId} size={56} />
              <div className="min-w-0">
                <p className="truncate font-bold">
                  {u.prenom} {u.nom}
                </p>
                <p className="truncate text-sm text-muted">{u.poste ?? t(`role.${u.role}`)}</p>
                <p className="truncate text-xs text-subtle">
                  {t('profile.matricule')} {u.matricule}
                </p>
              </div>
            </div>
            {u.departement && <p className="mt-4 text-sm text-muted">{u.departement}</p>}
          </Card>
          <Card>
            <h2 className="mb-3 text-base font-bold text-muted">{t('home.quick')}</h2>
            <div className="grid gap-2">
              {quick.map((q) => (
                <Link key={q.to} to={q.to} className="btn justify-start">
                  <q.icon size={16} className="text-accent" /> {q.label}
                </Link>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
