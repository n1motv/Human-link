import { useState } from 'react';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from './api';
import { useErrorText } from './hooks';
import { useToast } from './toast';

interface Options<T> {
  rows: T[] | undefined;
  /** Seules les demandes que la personne peut traiter se cochent (selon son rôle et l'étape où en est la demande). */
  canDecide: (row: T) => boolean;
  /** Route de décision d'une demande : `/leaves/${id}/decision`. */
  path: (id: string) => string;
  nameOf: (row: T) => string;
  invalidate: QueryKey[];
}

export interface BulkResult {
  done: string[];
  failed: { name: string; reason: string }[];
}

/**
 * Sélection de plusieurs demandes et décision groupée (U-10). Une seule confirmation liste les personnes concernées ; les décisions
 * partent ensuite une à une vers la même route que la décision individuelle : mêmes droits, mêmes règles (solde, étapes manager puis
 * administrateur), mêmes notifications. Si l'une échoue (déjà traitée par quelqu'un d'autre, solde insuffisant), les autres passent
 * quand même et l'échec est signalé avec le nom de la personne.
 */
export function useBulkDecision<T extends { id: string }>({ rows, canDecide, path, nameOf, invalidate }: Options<T>) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const errText = useErrorText();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const selectable = (rows ?? []).filter(canDecide);
  // Une demande traitée ailleurs entre-temps disparaît de la liste : elle sort aussi de la sélection.
  const selectedRows = selectable.filter((r) => selected.has(r.id));
  const allSelected = selectable.length > 0 && selectedRows.length === selectable.length;

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(selectable.map((r) => r.id)));
  const clear = () => setSelected(new Set());

  /** Applique la décision aux demandes cochées. Ne lève jamais : le résultat dit ce qui a passé et ce qui a échoué. */
  const decide = async (decision: 'accepte' | 'refuse', motifRefus?: string): Promise<BulkResult> => {
    const result: BulkResult = { done: [], failed: [] };
    for (const row of selectedRows) {
      try {
        await api.post(path(row.id), { decision, motifRefus });
        result.done.push(row.id);
      } catch (e) {
        result.failed.push({ name: nameOf(row), reason: errText(e) });
      }
    }
    for (const key of invalidate) void qc.invalidateQueries({ queryKey: key });
    setSelected((s) => new Set([...s].filter((id) => !result.done.includes(id)))); // les échecs restent cochés : on peut réessayer
    if (result.done.length && !result.failed.length) toast.success(t('bulk.done', { count: result.done.length }));
    else if (result.failed.length)
      toast.error(t('bulk.partial', { ok: result.done.length, failed: result.failed.length, names: result.failed.map((f) => `${f.name} (${f.reason})`).join(' · ') }));
    return result;
  };

  return { selectable, selectedRows, selected, allSelected, toggle, toggleAll, clear, decide };
}
