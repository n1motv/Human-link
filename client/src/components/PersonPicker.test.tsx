import { useState } from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../test/utils';
import { PersonPicker, type Person } from './PersonPicker';

const everyone: Person[] = [
  { id: 'a', prenom: 'Sofia', nom: 'Lopez', matricule: '000104E' },
  { id: 'b', prenom: 'Nadia', nom: 'Haddad', matricule: '000105E' },
  { id: 'c', prenom: 'Luca', nom: 'Rossi', matricule: '000106E' },
];

const urls: string[] = [];

beforeEach(() => {
  urls.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      urls.push(url);
      const q = new URL(url, 'http://x').searchParams.get('q')?.toLowerCase();
      const items = q ? everyone.filter((p) => `${p.prenom} ${p.nom}`.toLowerCase().includes(q)) : everyone;
      return Promise.resolve(new Response(JSON.stringify({ items, total: items.length }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

function Harness({ exclude = [] as string[] }) {
  const [p, setP] = useState<Person | null>(null);
  return (
    <>
      <PersonPicker aria-label="Employé" value={p} onChange={setP} filter="status=active&notRole=admin" exclude={exclude} />
      <output data-testid="choix">{p?.id ?? ''}</output>
    </>
  );
}

const box = () => screen.getByRole('combobox', { name: 'Employé' });

describe('PersonPicker (P-01)', () => {
  it('ne charge rien tant qu’on n’ouvre pas la liste, puis demande une page limitée au serveur', async () => {
    renderWithProviders(<Harness />);
    expect(urls).toHaveLength(0);
    fireEvent.focus(box());
    await screen.findByText('Sofia Lopez', { exact: false });
    expect(urls[0]).toContain('/api/users?status=active&notRole=admin&limit=12');
    expect(urls[0]).not.toContain('limit=200');
  });

  it('cherche côté serveur au fil de la frappe', async () => {
    renderWithProviders(<Harness />);
    fireEvent.focus(box());
    await screen.findByText('Nadia Haddad', { exact: false });
    fireEvent.change(box(), { target: { value: 'rossi' } });
    await waitFor(() => expect(urls.some((u) => u.includes('q=rossi'))).toBe(true));
    await waitFor(() => expect(screen.queryByText('Nadia Haddad', { exact: false })).toBeNull());
    expect(screen.getByText('Luca Rossi', { exact: false })).toBeTruthy();
  });

  it('choisit une personne au clic et au clavier, et n’affiche pas les personnes exclues', async () => {
    renderWithProviders(<Harness exclude={['a']} />);
    fireEvent.focus(box());
    await screen.findByText('Nadia Haddad', { exact: false });
    expect(screen.queryByText('Sofia Lopez', { exact: false })).toBeNull();
    fireEvent.click(screen.getByText('Nadia Haddad', { exact: false }));
    expect(screen.getByTestId('choix').textContent).toBe('b');
    expect((box() as HTMLInputElement).value).toBe('Nadia Haddad');

    fireEvent.click(screen.getByRole('button', { name: 'Effacer' }));
    expect(screen.getByTestId('choix').textContent).toBe('');
    fireEvent.focus(box());
    await screen.findByText('Luca Rossi', { exact: false });
    fireEvent.keyDown(box(), { key: 'ArrowDown' });
    fireEvent.keyDown(box(), { key: 'Enter' });
    expect(screen.getByTestId('choix').textContent).toBe('c');
  });
});
