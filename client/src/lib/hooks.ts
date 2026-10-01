import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ApiError } from './api';
import { useToast } from './toast';

/** Traduit une erreur d'API : code connu → texte localisé, sinon message du serveur. */
export function useErrorText() {
  const { t, i18n } = useTranslation();
  return (e: unknown): string => {
    if (!(e instanceof ApiError)) return t('common.error');
    if (e.code && i18n.exists(`errors.${e.code}`)) return t(`errors.${e.code}`);
    if (e.code === 'VALIDATION' && e.details?.length) return e.details.map((d) => d.message).join(' · ');
    return e.message || t('common.error');
  };
}

interface Opts<V, R> {
  success?: string;
  invalidate?: QueryKey[];
  onSuccess?: (r: R, v: V) => void;
}

/** Mutation avec toast de succès / d'erreur et invalidation de caches : évite de répéter ce schéma partout. */
export function useAction<V, R = unknown>(fn: (v: V) => Promise<R>, opts: Opts<V, R> = {}) {
  const qc = useQueryClient();
  const toast = useToast();
  const errText = useErrorText();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r, v) => {
      if (opts.success) toast.success(opts.success);
      for (const key of opts.invalidate ?? []) void qc.invalidateQueries({ queryKey: key });
      opts.onSuccess?.(r, v);
    },
    onError: (e) => toast.error(errText(e)),
  });
}
