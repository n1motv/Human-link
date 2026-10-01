import { useQuery } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { VaultList } from '../../components/VaultList';
import { ErrorState, PageHeader, Spinner } from '../../components/ui';
import { api } from '../../lib/api';
import type { VaultFile } from '../../lib/types';

export default function MyVault() {
  const { t } = useTranslation();
  const q = useQuery({ queryKey: ['vault', 'mine'], queryFn: () => api.get<{ items: VaultFile[] }>('/documents/mine') });
  return (
    <>
      <PageHeader title={t('nav.vault')} subtitle={t('vault.subtitle')} />
      <p className="mb-5 flex items-center gap-2 text-sm text-muted">
        <ShieldCheck size={16} className="text-ok" /> {t('vault.encrypted')}
      </p>
      {q.isLoading ? <Spinner /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : <VaultList files={q.data!.items} />}
    </>
  );
}
