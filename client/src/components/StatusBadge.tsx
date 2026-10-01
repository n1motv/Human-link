import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Decision } from '../lib/types';

const MAP = {
  'en attente': { cls: 'badge-warn', icon: Clock, key: 'status.pending' },
  accepte: { cls: 'badge-ok', icon: CheckCircle2, key: 'status.approved' },
  refuse: { cls: 'badge-bad', icon: XCircle, key: 'status.rejected' },
} as const;

export function StatusBadge({ status }: { status: Decision }) {
  const { t } = useTranslation();
  const { cls, icon: Icon, key } = MAP[status];
  return (
    <span className={`badge ${cls}`}>
      <Icon size={13} aria-hidden />
      {t(key)}
    </span>
  );
}
