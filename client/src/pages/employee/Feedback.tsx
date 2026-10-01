import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, EyeOff, Star } from 'lucide-react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { Button, Card, ErrorState, PageHeader, Spinner, Textarea } from '../../components/ui';
import { api } from '../../lib/api';
import { useAction } from '../../lib/hooks';

interface Status {
  month: string;
  alreadySubmitted: boolean;
  criteria: string[];
}

function Rating({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          role="radio"
          aria-checked={value === n}
          aria-label={`${n}/5`}
          onClick={() => onChange(n)}
          className={clsx('rounded-lg p-1.5 transition hover:scale-110', n <= value ? 'text-warn' : 'text-subtle')}
        >
          <Star size={22} fill={n <= value ? 'currentColor' : 'none'} />
        </button>
      ))}
    </div>
  );
}

export default function Feedback() {
  const { t } = useTranslation();
  const q = useQuery({ queryKey: ['feedback', 'status'], queryFn: () => api.get<Status>('/feedback/status') });
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [suggestion, setSuggestion] = useState('');
  const send = useAction(() => api.post('/feedback', { ratings, suggestion }), { success: t('feedback.thanks'), invalidate: [['feedback']] });

  if (q.isLoading) return <Spinner />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const { criteria, alreadySubmitted } = q.data!;

  if (alreadySubmitted) {
    return (
      <>
        <PageHeader title={t('nav.feedback')} />
        <Card className="flex flex-col items-center gap-3 py-12 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-ok/15 text-ok">
            <CheckCircle2 size={28} />
          </span>
          <p className="text-lg font-semibold">{t('feedback.done')}</p>
          <p className="text-sm text-muted">{t('feedback.doneHint')}</p>
        </Card>
      </>
    );
  }

  const complete = criteria.every((c) => ratings[c]);
  return (
    <>
      <PageHeader title={t('nav.feedback')} subtitle={t('feedback.subtitle')} />
      <p className="mb-5 flex items-center gap-2 rounded-2xl border border-line bg-glass px-4 py-3 text-sm text-muted">
        <EyeOff size={16} className="shrink-0 text-ok" /> {t('feedback.anonymous')}
      </p>
      <Card>
        <ul className="divide-y divide-[var(--grid)]">
          {criteria.map((c) => (
            <li key={c} className="flex flex-wrap items-center justify-between gap-3 py-3.5">
              <span className="text-sm font-medium">{t(`feedback.criteria.${c}`)}</span>
              <Rating value={ratings[c] ?? 0} onChange={(n) => setRatings((r) => ({ ...r, [c]: n }))} label={t(`feedback.criteria.${c}`)} />
            </li>
          ))}
        </ul>
        <div className="mt-5">
          <label className="mb-1.5 block text-xs font-semibold text-muted" htmlFor="suggestion">
            {t('feedback.suggestion')}
          </label>
          <Textarea id="suggestion" value={suggestion} onChange={(e) => setSuggestion(e.target.value)} maxLength={2000} placeholder={t('feedback.suggestionPlaceholder')} />
        </div>
        <div className="mt-6 flex items-center gap-3">
          <Button variant="primary" disabled={!complete} loading={send.isPending} onClick={() => send.mutate()}>
            {t('feedback.send')}
          </Button>
          {!complete && <span className="text-xs text-muted">{t('feedback.rateAll')}</span>}
        </div>
      </Card>
    </>
  );
}
