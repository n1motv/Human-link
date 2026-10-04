import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { MonthCalendar, monthRange, type CalItem } from '../../components/Calendar';
import { ErrorState, PageHeader, Tabs } from '../../components/ui';
import { api } from '../../lib/api';
import { useConfig } from '../../lib/config';
import { personColors } from '../../lib/branding';

interface LeaveEntry {
  userId: string;
  nom: string;
  prenom: string;
  start: string;
  end: string;
  raison: string;
}
interface TeleEntry {
  userId: string;
  nom: string;
  prenom: string;
  date: string;
}

/** Calendrier d'équipe : congés acceptés ou télétravail (une couleur par personne). */
export default function TeamCalendar() {
  const { t } = useTranslation();
  const { modules } = useConfig();
  const [tab, setTab] = useState<'leaves' | 'telework'>(modules.leaves ? 'leaves' : 'telework');
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const { from, to } = monthRange(month);

  const leaves = useQuery({ queryKey: ['calendar', 'leaves', from], queryFn: () => api.get<{ items: LeaveEntry[] }>(`/calendar/leaves?from=${from}&to=${to}`), enabled: tab === 'leaves' && modules.leaves });
  const tele = useQuery({ queryKey: ['calendar', 'telework', from], queryFn: () => api.get<{ items: TeleEntry[] }>(`/telework/calendar?from=${from}&to=${to}`), enabled: tab === 'telework' && modules.telework });

  const people = useMemo(() => {
    const src = tab === 'leaves' ? leaves.data?.items ?? [] : tele.data?.items ?? [];
    const byId = new Map<string, string>();
    for (const x of src) byId.set(x.userId, `${x.prenom} ${x.nom}`);
    const colors = personColors([...byId.keys()]);
    return [...byId.entries()].map(([id, name]) => ({ id, name, color: colors.get(id)! })).sort((a, b) => a.name.localeCompare(b.name));
  }, [tab, leaves.data, tele.data]);
  const colorOf = (id: string) => people.find((p) => p.id === id)?.color ?? '#3f4a6b';

  const items: CalItem[] =
    tab === 'leaves'
      ? (leaves.data?.items ?? []).map((l, i) => ({ id: `l${i}`, start: l.start, end: l.end, label: `${l.prenom} ${l.nom}`, color: colorOf(l.userId), detail: t(`leave.reasons.${l.raison}`, { defaultValue: l.raison }) }))
      : (tele.data?.items ?? []).map((e, i) => ({ id: `t${i}`, start: e.date, end: e.date, label: `${e.prenom} ${e.nom}`, color: colorOf(e.userId) }));
  const err = tab === 'leaves' ? leaves.error : tele.error;

  return (
    <>
      <PageHeader
        title={t('nav.teamCalendar')}
        subtitle={t('calendar.teamSubtitle')}
        actions={
          <Tabs
            value={tab}
            onChange={setTab}
            items={[...(modules.leaves ? [{ value: 'leaves' as const, label: t('nav.leaves') }] : []), ...(modules.telework ? [{ value: 'telework' as const, label: t('nav.telework') }] : [])]}
          />
        }
      />
      {people.length > 0 && (
        <ul className="mb-4 flex flex-wrap gap-2" aria-label={t('calendar.people')}>
          {people.map((p) => (
            <li key={p.id} className="inline-flex items-center gap-2 rounded-full border border-line bg-glass py-1 pe-3 ps-1.5 text-sm">
              <span className="h-4 w-4 rounded-full" style={{ background: p.color }} aria-hidden />
              {p.name}
            </li>
          ))}
        </ul>
      )}
      {err ? <ErrorState error={err} /> : <MonthCalendar items={items} month={month} onMonthChange={setMonth} />}
    </>
  );
}
