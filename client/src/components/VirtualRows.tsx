import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';

/** Au-delà de ce nombre de lignes, seules celles visibles à l'écran (plus une marge) existent dans la page. */
export const VIRTUAL_FROM = 60;

/** À poser sur chaque <tr> : permet de mesurer la vraie hauteur de la ligne (lignes de hauteur variable). */
export interface RowProps {
  ref?: (el: HTMLTableRowElement | null) => void;
  'data-index'?: number;
}

interface Props<T> {
  items: T[];
  /** Nombre de colonnes du tableau (pour les lignes d'espacement). */
  colSpan: number;
  /** Hauteur estimée d'une ligne, avant qu'elle soit mesurée. */
  estimate?: number;
  children: (item: T, rowProps: RowProps) => ReactNode;
}

/**
 * Corps de tableau virtualisé (TanStack Virtual) : avec des centaines de lignes (journal d'audit, annuaire de plusieurs
 * milliers de personnes), le navigateur ne construit que ce qui se voit, et le défilement reste fluide. Le défilement est celui de la
 * page entière (pas de zone à ascenseur interne). Sous VIRTUAL_FROM lignes, tout est rendu normalement.
 */
export function VirtualTBody<T>({ items, colSpan, estimate = 64, children }: Props<T>) {
  const virtual = items.length > VIRTUAL_FROM;
  const ref = useRef<HTMLTableSectionElement>(null);
  const [margin, setMargin] = useState(0);
  useLayoutEffect(() => {
    // Distance entre le haut de la page et le début des lignes : le virtualiseur en a besoin pour savoir quelles lignes sont visibles.
    if (virtual && ref.current) setMargin(ref.current.getBoundingClientRect().top + window.scrollY);
  }, [virtual]);

  const v = useWindowVirtualizer({ count: virtual ? items.length : 0, estimateSize: () => estimate, overscan: 12, scrollMargin: margin, useFlushSync: false });
  if (!virtual) return <tbody>{items.map((item) => children(item, {}))}</tbody>;

  const rows = v.getVirtualItems();
  const before = rows.length ? Math.max(0, rows[0]!.start - margin) : 0;
  const after = rows.length ? Math.max(0, v.getTotalSize() - rows[rows.length - 1]!.end) : 0;
  const spacer = (h: number) => (
    <tr aria-hidden style={{ height: h }}>
      <td colSpan={colSpan} style={{ padding: 0, border: 0 }} />
    </tr>
  );
  return (
    <tbody ref={ref}>
      {before > 0 && spacer(before)}
      {rows.map((row) => children(items[row.index]!, { ref: v.measureElement, 'data-index': row.index }))}
      {after > 0 && spacer(after)}
    </tbody>
  );
}
