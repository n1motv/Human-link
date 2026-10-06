import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import { renderWithProviders, testUser } from '../test/utils';
import { BottomNav } from './BottomNav';

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() } };
});
let role: 'employe' | 'manager' | 'admin' = 'employe';
vi.mock('../lib/auth', () => ({ useUser: () => ({ ...testUser, role }), useAuth: () => ({ user: { ...testUser, role } }) }));

beforeEach(() => {
  role = 'employe';
  vi.mocked(api.get).mockResolvedValue({ unread: 3 });
});

describe('barre de navigation du bas, sur téléphone (U-16)', () => {
  it('propose les 4 destinations les plus fréquentes de l’employé, plus le menu', async () => {
    renderWithProviders(<BottomNav onMenu={() => undefined} />);
    const nav = screen.getByRole('navigation', { name: 'Navigation rapide' });
    expect([...nav.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual(['/me', '/me/leaves', '/me/calendar', '/notifications']);
    expect(screen.getByRole('button', { name: 'Menu' })).toBeTruthy();
    expect(nav.className).toMatch(/md:hidden/); // visible seulement sous la largeur d'une tablette
  });

  it('s’adapte au rôle', () => {
    role = 'manager';
    const { unmount } = renderWithProviders(<BottomNav onMenu={() => undefined} />);
    expect([...screen.getByRole('navigation').querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual([
      '/manager',
      '/manager/leaves',
      '/manager/calendar',
      '/notifications',
    ]);
    unmount();
    role = 'admin';
    renderWithProviders(<BottomNav onMenu={() => undefined} />);
    expect([...screen.getByRole('navigation').querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual(['/admin', '/admin/leaves', '/admin/calendar', '/notifications']);
  });

  it('marque la page courante et affiche le nombre de notifications non lues', async () => {
    renderWithProviders(<BottomNav onMenu={() => undefined} />, { route: '/me/leaves' });
    expect(screen.getByRole('link', { name: /Congés/ }).className).toMatch(/active/);
    expect(await screen.findByLabelText('3')).toBeTruthy();
  });

  it('« Menu » ouvre le tiroir des autres pages', () => {
    const onMenu = vi.fn();
    renderWithProviders(<BottomNav onMenu={onMenu} />);
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    expect(onMenu).toHaveBeenCalledOnce();
  });
});
