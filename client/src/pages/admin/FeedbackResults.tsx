import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { EyeOff, MessageSquareQuote } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, Empty, ErrorState, Input, PageHeader, Spinner, StatTile } from '../../components/ui';
import { api } from '../../lib/api';

interface Results {
  month: string;
  total: number;
  averages: Record<string, number>;
  suggestions: string[];
  suggestionsHidden: boolean;
}

export default function FeedbackResults() {
  const { t } = useTranslation();
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const q = useQuery({ queryKey: ['feedback', 'results', month], queryFn: () => api.get<Results>(`/feedback/results?month=${month}`) });

  const overall = q.data && q.data.total ? Object.values(q.data.averages).reduce((a, b) => a + b, 0) / Object.values(q.data.averages).length : 0;

  return (
    <>
      <PageHeader
        title={t('nav.feedbackResults')}
        subtitle={t('feedback.adminSubtitle')}
        actions={<Input type="month" aria-label={t('feedback.month')} value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className="!w-auto" />}
      />
      {q.isLoading ? (
        <Spinner />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.data!.total === 0 ? (
        <Card>
          <Empty icon={<MessageSquareQuote size={22} />} title={t('feedback.noResults')} />
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <StatTile label={t('feedback.responses')} value={q.data!.total} icon={<MessageSquareQuote size={18} />} tone="accent" />
            <StatTile label={t('feedback.overall')} value={`${overall.toFixed(2)} / 5`} tone="ok" />
          </div>

          <Card className="mt-6">
            <h2 className="mb-4 text-lg font-bold">{t('feedback.averages')}</h2>
            <ul className="space-y-4">
              {Object.entries(q.data!.averages).map(([k, v]) => (
                <li key={k}>
                  <div className="mb-1.5 flex items-center justify-between text-sm">
                    <span className="font-medium">{t(`feedback.criteria.${k}`)}</span>
                    <span className="font-bold tabular-nums">{v.toFixed(2)}</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-glass-hover" role="meter" aria-valuenow={v} aria-valuemin={0} aria-valuemax={5} aria-label={t(`feedback.criteria.${k}`)}>
                    <div className="h-full rounded-full bg-gradient-to-r from-accent to-accent2 transition-all" style={{ width: `${(v / 5) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="mt-6">
            <h2 className="mb-4 text-lg font-bold">{t('feedback.suggestions')}</h2>
            {q.data!.suggestionsHidden ? (
              <p className="flex items-center gap-2 text-sm text-muted">
                <EyeOff size={16} className="text-warn" /> {t('feedback.hidden')}
              </p>
            ) : q.data!.suggestions.length === 0 ? (
              <p className="text-sm text-muted">{t('feedback.noSuggestions')}</p>
            ) : (
              <ul className="space-y-3">
                {q.data!.suggestions.map((s, i) => (
                  <li key={i} className="rounded-xl border border-line bg-glass px-4 py-3 text-sm">
                    {s}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </>
  );
}
