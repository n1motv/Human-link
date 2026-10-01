import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, Wifi } from 'lucide-react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { Button, Card, ErrorState, PageHeader, Spinner } from '../../components/ui';
import { api } from '../../lib/api';
import { fmtDate } from '../../lib/format';
import { useAction } from '../../lib/hooks';

interface Week {
  days: string[];
  chosen: string[];
  max: number;
  isDirector: boolean;
}

export default function Telework() {
  const { t, i18n } = useTranslation();
  const q = useQuery({ queryKey: ['telework', 'next'], queryFn: () => api.get<Week>('/telework/next-week') });
  const [sel, setSel] = useState<string[]>([]);
  useEffect(() => {
    if (q.data) setSel(q.data.chosen);
  }, [q.data]);

  const save = useAction(() => api.put('/telework/next-week', { dates: sel }), { success: t('telework.saved'), invalidate: [['telework']] });

  if (q.isLoading) return <Spinner />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const { days, max, isDirector } = q.data!;
  const exact = isDirector || sel.length === max;
  const toggle = (d: string) => setSel((s) => (s.includes(d) ? s.filter((x) => x !== d) : !isDirector && s.length >= max ? s : [...s, d].sort()));

  return (
    <>
      <PageHeader title={t('nav.telework')} subtitle={isDirector ? t('telework.directorHint') : t('telework.hint', { count: max })} />
      <Card>
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">{t('telework.nextWeek')}</h2>
          <span className={clsx('badge', exact ? 'badge-ok' : 'badge-warn')}>
            {isDirector ? sel.length : `${sel.length} / ${max}`}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {days.map((d) => {
            const on = sel.includes(d);
            const blocked = !on && !isDirector && sel.length >= max;
            return (
              <button
                key={d}
                role="checkbox"
                aria-checked={on}
                disabled={blocked}
                onClick={() => toggle(d)}
                className={clsx(
                  'glass glass-hover flex flex-col items-start gap-2 p-4 text-start transition',
                  on && '!border-accent !bg-gradient-to-br from-accent/30 to-accent2/20 shadow-[0_0_0_1px_var(--accent)]',
                  blocked && 'cursor-not-allowed opacity-40',
                )}
              >
                <span className="flex w-full items-center justify-between">
                  <Wifi size={18} className={on ? 'text-accent' : 'text-subtle'} />
                  {on && <Check size={18} className="text-accent" />}
                </span>
                <span className="text-sm font-bold capitalize">{fmtDate(d, i18n.language, { weekday: 'long' })}</span>
                <span className="text-xs text-muted">{fmtDate(d, i18n.language, { day: 'numeric', month: 'short' })}</span>
              </button>
            );
          })}
        </div>
        {!exact && <p className="mt-4 text-sm text-warn">{t('telework.needExact', { count: max })}</p>}
        <div className="mt-6">
          <Button variant="primary" disabled={!exact} loading={save.isPending} onClick={() => save.mutate()}>
            {t('common.save')}
          </Button>
        </div>
      </Card>
    </>
  );
}
