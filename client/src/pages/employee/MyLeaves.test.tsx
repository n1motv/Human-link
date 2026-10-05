import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MyLeaves from './MyLeaves';
import { api } from '../../lib/api';
import { renderWithProviders, testUser } from '../../test/utils';

vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api')>();
  return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() } };
});
vi.mock('../../lib/auth', async () => {
  const { testUser } = await import('../../test/utils');
  return { useUser: () => testUser, useAuth: () => ({ user: testUser }) };
});

const get = vi.mocked(api.get);
const post = vi.mocked(api.post);
const day = (iso: string) => document.querySelector<HTMLButtonElement>(`[data-iso="${iso}"]`)!;
// Le champ « Du » affiche la date choisie ; il ne reste alors qu'un seul bouton « Choisir une date » : celui du champ « Au ».
const emptyPicker = () => screen.getAllByRole('button', { name: /Choisir une date/ })[0]!;

// Lundi 5 octobre 2026 : les 12 et 14 octobre sont des jours ouvrés dans le futur (3 jours ouvrés du lundi au mercredi).
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-05T10:00:00Z'));
  get.mockResolvedValue({ items: [] });
});
afterEach(() => vi.useRealTimers());

describe('création d’une demande de congé', () => {
  async function openForm() {
    renderWithProviders(<MyLeaves />);
    expect(await screen.findByText(/Solde actuel : 17 jour/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Nouvelle demande/ }));
    return screen.getByRole('dialog', { name: /Nouvelle demande/ });
  }

  it('calcule les jours ouvrés, puis envoie la demande avec les bonnes dates', async () => {
    post.mockResolvedValue({});
    const form = await openForm();
    const submit = within(form).getByRole('button', { name: /Envoyer la demande/ }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true); // rien n'est saisi

    fireEvent.click(emptyPicker());
    fireEvent.click(day('2026-10-12'));
    fireEvent.click(emptyPicker());
    fireEvent.click(day('2026-10-14'));

    expect(await within(form).findByText(/3 jour\(s\) ouvré\(s\) · solde actuel 17/)).toBeTruthy();
    expect(submit.disabled).toBe(false);

    fireEvent.click(submit);
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    const [path, body] = post.mock.calls[0]!;
    expect(path).toBe('/leaves');
    const fd = body as FormData;
    expect(fd.get('raison')).toBe('annual');
    expect(fd.get('dateDebut')).toBe('2026-10-12');
    expect(fd.get('dateFin')).toBe('2026-10-14');
    expect(await screen.findByText('Demande envoyée.')).toBeTruthy(); // confirmation, et le formulaire se ferme
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Nouvelle demande/ })).toBeNull());
  });

  it('refuse une demande plus longue que le solde disponible', async () => {
    const form = await openForm();
    fireEvent.click(emptyPicker());
    fireEvent.click(day('2026-10-12'));
    fireEvent.click(emptyPicker());
    fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
    fireEvent.click(day('2026-11-30')); // 36 jours ouvrés : bien plus que 17
    expect(await within(form).findByText(/Solde insuffisant/)).toBeTruthy();
    expect((within(form).getByRole('button', { name: /Envoyer la demande/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(post).not.toHaveBeenCalled();
  });

  it('ne propose pas de jour passé', async () => {
    await openForm();
    fireEvent.click(emptyPicker());
    expect(day('2026-10-02').disabled).toBe(true);
    expect(day('2026-10-05').disabled).toBe(false);
    expect(testUser.soldeConge).toBe(17);
  });
});
