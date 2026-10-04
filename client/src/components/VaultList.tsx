import { Download, FileText, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { downloadFile } from '../lib/api';
import { fmtBytes, fmtDate } from '../lib/format';
import { useToast } from '../lib/toast';
import type { VaultFile } from '../lib/types';
import { Empty } from './ui';

const GROUPS: VaultFile['category'][] = ['bulletin', 'contrat', 'autre'];

/** Liste des documents d'un coffre-fort, par catégorie. `onDelete` n'est fourni qu'à l'administration. */
export function VaultList({ files, onDelete }: { files: VaultFile[]; onDelete?: (f: VaultFile) => void }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();

  if (files.length === 0) return <Empty icon={<FileText size={22} />} title={t('vault.empty')} hint={t('vault.emptyHint')} />;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {GROUPS.map((cat) => {
        const list = files.filter((f) => f.category === cat);
        return (
          <section key={cat} className="glass p-5">
            <h3 className="mb-3 flex items-center justify-between text-base font-bold text-muted">
              {t(`vault.cat.${cat}`)} <span className="badge badge-accent">{list.length}</span>
            </h3>
            {list.length === 0 ? (
              <p className="py-4 text-sm text-muted">—</p>
            ) : (
              <ul className="space-y-2">
                {list.map((f) => (
                  <li key={f.id} className="flex items-center gap-3 rounded-xl border border-line bg-glass px-3 py-2.5">
                    <FileText size={18} className="shrink-0 text-accent" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{f.label}</p>
                      <p className="text-xs text-subtle">
                        {fmtDate(f.createdAt, i18n.language)} · {fmtBytes(f.size)}
                      </p>
                    </div>
                    <button
                      className="rounded-full p-2 text-muted hover:bg-glass-hover hover:text-fg"
                      aria-label={`${t('common.download')} ${f.label}`}
                      onClick={() => downloadFile(`/documents/${f.id}/download`, `${f.label}.pdf`).catch(() => toast.error(t('common.error')))}
                    >
                      <Download size={16} />
                    </button>
                    {onDelete && (
                      <button className="rounded-full p-2 text-muted hover:bg-glass-hover hover:text-bad" aria-label={t('common.delete')} onClick={() => onDelete(f)}>
                        <Trash2 size={16} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
