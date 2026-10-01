import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { MonthCalendar, monthRange, type CalItem } from '../../components/Calendar';
import { ErrorState, PageHeader, Tabs } from '../../components/ui';
import { api } from '../../lib/api';
import { useConfig } from '../../lib/config';
import { colorFor } from '../../lib/branding';

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

  const items: CalItem[] =
    tab === 'leaves'
      ? (leaves.data?.items ?? []).map((l, i) => ({ id: `l${i}`, start: l.start, end: l.end, label: `${l.prenom} ${l.nom}`, color: colorFor(l.userId), detail: t(`leave.reasons.${l.raison}`, { defaultValue: l.raison }) }))
      : (tele.data?.items ?? []).map((e, i) => ({ id: `t${i}`, start: e.date, end: e.date, label: `${e.prenom} ${e.nom}`, color: colorFor(e.userId) }));
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
      {err ? <ErrorState error={err} /> : <MonthCalendar items={items} month={month} onMonthChange={setMonth} />}
    </>
  );
}
