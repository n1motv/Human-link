import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { MonthCalendar, monthRange, type CalItem } from '../../components/Calendar';
import { ErrorState, PageHeader } from '../../components/ui';
import { api } from '../../lib/api';
import type { CalendarEvent } from '../../lib/types';

const COLORS = { leave: '#16a34a', sick: '#d97706', telework: '#2563eb', meeting: '#db2777' } as const;

export default function MyCalendar() {
  const { t } = useTranslation();
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const { from, to } = monthRange(month);
  const q = useQuery({ queryKey: ['calendar', 'me', from], queryFn: () => api.get<{ events: CalendarEvent[] }>(`/calendar/me?from=${from}&to=${to}`) });

  const items: CalItem[] = (q.data?.events ?? []).map((e, i) => ({
    id: `${e.kind}-${i}`,
    start: e.start,
    end: e.end,
    color: COLORS[e.kind],
    label: e.kind === 'leave' ? t(`leave.reasons.${e.title}`, { defaultValue: t('legend.leave') }) : e.kind === 'meeting' ? e.title : t(`legend.${e.kind}`),
    detail: e.time ? new Date(e.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : undefined,
  }));

  return (
    <>
      <PageHeader title={t('nav.calendar')} subtitle={t('calendar.mySubtitle')} />
      <div className="mb-4 flex flex-wrap gap-3 text-sm">
        {(Object.keys(COLORS) as (keyof typeof COLORS)[]).map((k) => (
          <span key={k} className="inline-flex items-center gap-2 text-muted">
            <span className="h-3 w-3 rounded-full" style={{ background: COLORS[k] }} /> {t(`legend.${k}`)}
          </span>
        ))}
      </div>
      {q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : <MonthCalendar items={items} month={month} onMonthChange={setMonth} />}
    </>
  );
}
