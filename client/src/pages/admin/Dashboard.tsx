import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Banknote, Building2, CalendarCheck, Gift, Plane, Stethoscope, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, ErrorState, PageHeader, Spinner, StatTile } from '../../components/ui';
import { api } from '../../lib/api';
import { useConfig } from '../../lib/config';
import { fmtMoney } from '../../lib/format';

interface Stats {
  totalEmployees: number;
  totalDepartments: number;
  acceptedLeaves: number;
  averageSalary: number;
  leavesByMonth: number[];
  byDepartment: { name: string; count: number }[];
  today: { onSite: number; remote: number; absent: number };
  pending: { leaves: number; sick: number; bonuses: number };
}

const tooltipStyle = {
  background: 'var(--glass-strong)',
  border: '1px solid var(--glass-border)',
  borderRadius: 12,
  color: 'var(--fg)',
  fontSize: 12,
  backdropFilter: 'blur(12px)',
};

export default function Dashboard() {
  const { t, i18n } = useTranslation();
  const { modules } = useConfig();
  const q = useQuery({ queryKey: ['dashboard', 'admin'], queryFn: () => api.get<Stats>('/dashboard/admin'), refetchInterval: 120_000 });

  if (q.isLoading) return <Spinner />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const s = q.data!;

  const months = s.leavesByMonth.map((count, i) => ({
    m: new Intl.DateTimeFormat(i18n.language === 'zgh' ? 'fr' : i18n.language, { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, i, 1))),
    count,
  }));
  const presence = [
    { name: t('dashboard.onSite'), value: s.today.onSite, color: 'var(--accent)' },
    { name: t('dashboard.remote'), value: s.today.remote, color: 'var(--info)' },
    { name: t('dashboard.absent'), value: s.today.absent, color: 'var(--accent-2)' },
  ];
  const presenceTotal = presence.reduce((a, p) => a + p.value, 0);

  const pending = [
    { to: '/admin/leaves', icon: Plane, label: t('nav.leaves'), n: s.pending.leaves, show: modules.leaves },
    { to: '/admin/sick', icon: Stethoscope, label: t('nav.sick'), n: s.pending.sick, show: modules.sickLeaves },
    { to: '/admin/bonuses', icon: Gift, label: t('nav.bonuses'), n: s.pending.bonuses, show: modules.bonuses },
  ].filter((p) => p.show);

  return (
    <>
      <PageHeader title={t('nav.dashboard')} subtitle={t('dashboard.subtitle')} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label={t('dashboard.employees')} value={s.totalEmployees} icon={<Users size={18} />} tone="accent" />
        <StatTile label={t('dashboard.departments')} value={s.totalDepartments} icon={<Building2 size={18} />} tone="info" />
        <StatTile label={t('dashboard.acceptedLeaves')} value={s.acceptedLeaves} icon={<CalendarCheck size={18} />} tone="ok" />
        <StatTile label={t('dashboard.avgSalary')} value={fmtMoney(s.averageSalary, i18n.language)} icon={<Banknote size={18} />} tone="warn" />
      </div>

      {pending.length > 0 && (
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {pending.map((p) => (
            <Link key={p.to} to={p.to} className="glass glass-hover flex items-center gap-4 p-4">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-glass text-accent">
                <p.icon size={20} />
              </span>
              <div className="flex-1">
                <p className="text-sm text-muted">{p.label}</p>
                <p className="font-semibold">{t('dashboard.toReview', { count: p.n })}</p>
              </div>
              {p.n > 0 && <span className="badge badge-warn">{p.n}</span>}
            </Link>
          ))}
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h2 className="mb-4 text-lg font-bold">{t('dashboard.leavesByMonth')}</h2>
          <div className="h-64" role="img" aria-label={t('dashboard.leavesByMonth')}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={months} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="bar" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent)" />
                    <stop offset="100%" stopColor="var(--accent-2)" />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--grid)" vertical={false} />
                <XAxis dataKey="m" stroke="var(--fg-subtle)" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis stroke="var(--fg-subtle)" tickLine={false} axisLine={false} allowDecimals={false} fontSize={12} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--glass)' }} />
                <Bar dataKey="count" name={t('dashboard.acceptedLeaves')} fill="url(#bar)" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <h2 className="mb-2 text-lg font-bold">{t('dashboard.today')}</h2>
          <div className="relative h-52">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={presence} dataKey="value" innerRadius={62} outerRadius={84} paddingAngle={3} stroke="none" cornerRadius={6}>
                  {presence.map((p) => (
                    <Cell key={p.name} fill={p.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
              <div>
                <p className="text-3xl font-bold tabular-nums">{presenceTotal}</p>
                <p className="text-xs text-muted">{t('dashboard.people')}</p>
              </div>
            </div>
          </div>
          <ul className="mt-2 space-y-1.5 text-sm">
            {presence.map((p) => (
              <li key={p.name} className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-muted">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} /> {p.name}
                </span>
                <span className="font-semibold tabular-nums">{p.value}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="lg:col-span-3">
          <h2 className="mb-4 text-lg font-bold">{t('dashboard.byDepartment')}</h2>
          {s.byDepartment.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">—</p>
          ) : (
            <div style={{ height: Math.max(160, s.byDepartment.length * 44) }} role="img" aria-label={t('dashboard.byDepartment')}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={s.byDepartment} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
                  <CartesianGrid stroke="var(--grid)" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} stroke="var(--fg-subtle)" tickLine={false} axisLine={false} fontSize={12} />
                  <YAxis type="category" dataKey="name" width={110} stroke="var(--fg-muted)" tickLine={false} axisLine={false} fontSize={12} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--glass)' }} />
                  <Bar dataKey="count" name={t('dashboard.employees')} fill="var(--accent)" radius={[0, 8, 8, 0]} barSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
