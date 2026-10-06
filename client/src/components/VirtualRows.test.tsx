import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { VIRTUAL_FROM, VirtualTBody } from './VirtualRows';

// jsdom ne fait pas de mise en page (toute ligne y mesure 0 px) : on remplace le virtualiseur de TanStack par une fenêtre fixe
// de 24 lignes à partir de la 100e, et on vérifie ce que NOTRE composant en fait. Le comportement réel (défilement, mesure)
// a été vérifié dans un vrai navigateur : 200 lignes simulées, 20 seulement dans la page, la première disparaît au défilement.
const ROW = 64;
vi.mock('@tanstack/react-virtual', () => ({
  useWindowVirtualizer: ({ count }: { count: number }) => ({
    getVirtualItems: () => (count ? Array.from({ length: 24 }, (_, i) => ({ index: 100 + i, start: (100 + i) * ROW, end: (101 + i) * ROW })) : []),
    getTotalSize: () => count * ROW,
    measureElement: () => undefined,
  }),
}));

const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i, name: `Personne ${i}` }));
const table = (n: number) => (
  <table>
    <VirtualTBody items={rows(n)} colSpan={2}>
      {(r, rowProps) => (
        <tr key={r.id} {...rowProps}>
          <td>{r.name}</td>
          <td>{r.id}</td>
        </tr>
      )}
    </VirtualTBody>
  </table>
);

describe('tableaux virtualisés (P-11)', () => {
  it('affiche toutes les lignes tant qu’il y en a peu', () => {
    const { container } = render(table(VIRTUAL_FROM));
    expect(container.querySelectorAll('tbody tr')).toHaveLength(VIRTUAL_FROM);
    expect(container.querySelector('tbody tr[aria-hidden]')).toBeNull();
  });

  it('au-delà, ne construit que la fenêtre visible, entre deux lignes d’espacement qui gardent la hauteur totale', () => {
    const { container } = render(table(2000));
    const built = [...container.querySelectorAll('tbody tr[data-index]')];
    expect(built).toHaveLength(24); // 2 000 lignes en mémoire : 24 dans la page
    expect(built[0]?.textContent).toContain('Personne 100');
    expect(built.at(-1)?.textContent).toContain('Personne 123');
    const [top, bottom] = [...container.querySelectorAll('tbody tr[aria-hidden]')] as HTMLElement[];
    expect(top?.style.height).toBe(`${100 * ROW}px`); // les 100 lignes au-dessus de la fenêtre
    expect(bottom?.style.height).toBe(`${(2000 - 124) * ROW}px`); // les 1 876 lignes en dessous
  });

  it('chaque ligne porte son numéro pour être mesurée avec sa vraie hauteur', () => {
    const { container } = render(table(500));
    expect([...container.querySelectorAll('tbody tr[data-index]')].map((r) => r.getAttribute('data-index'))[0]).toBe('100');
  });
});
