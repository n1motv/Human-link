import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Login from './Login';
import { api, ApiError } from '../../lib/api';
import { renderWithProviders, testUser } from '../../test/utils';

vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api')>();
  return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() } };
});
vi.mock('../../lib/auth', () => ({ useAuth: () => ({ user: null }) }));
const signIn = vi.fn();
vi.mock('../../app/SessionFlow', () => ({ useSessionFlow: () => ({ signIn }) }));

const post = vi.mocked(api.post);
const boxes = () => screen.getAllByRole('textbox') as HTMLInputElement[];
const pasteCode = (code: string) => fireEvent.paste(boxes()[0]!, { clipboardData: { getData: () => code } });

async function reachTwoFactorStep() {
  fireEvent.change(screen.getByLabelText(/Adresse e-mail/), { target: { value: 'sofia@acme.test' } });
  fireEvent.change(screen.getByLabelText(/^Mot de passe/), { target: { value: 'Sup3r-Secret-Pass-2026' } });
  fireEvent.click(screen.getByRole('button', { name: /Se connecter/ }));
  await screen.findByText('Vérification en deux étapes');
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('connexion avec double authentification', () => {
  it('demande le code après le mot de passe, refuse un faux code puis accepte le bon', async () => {
    post.mockImplementation(async (path: string, body?: unknown) => {
      if (path === '/auth/login') return { twoFactorRequired: true, challenge: 'challenge-123' };
      if (path === '/auth/2fa/login') {
        if ((body as { code: string }).code === '000000') throw new ApiError(401, 'Code invalide', 'INVALID_2FA_CODE');
        return { user: testUser, pending2fa: false };
      }
      throw new Error(`appel inattendu : ${path}`);
    });
    renderWithProviders(<Login />);
    await reachTwoFactorStep();
    expect(post).toHaveBeenCalledWith('/auth/login', { email: 'sofia@acme.test', password: 'Sup3r-Secret-Pass-2026' }, { noRefresh: true });
    expect(boxes()).toHaveLength(6);

    // faux code : message d'erreur, aucune session ouverte
    pasteCode('000000');
    expect((await screen.findByRole('alert')).textContent).toMatch(/Code invalide ou expiré/);
    expect(signIn).not.toHaveBeenCalled();

    // les cases se rouvrent, vides, après l'animation d'erreur
    await waitFor(() => expect(boxes().every((b) => !b.disabled && b.value === '')).toBe(true), { timeout: 3000 });

    // bon code : la session s'ouvre
    pasteCode('123456');
    await waitFor(() => expect(signIn).toHaveBeenCalledTimes(1), { timeout: 3000 });
    expect(post).toHaveBeenCalledWith('/auth/2fa/login', { challenge: 'challenge-123', code: '123456' }, { noRefresh: true });
    expect(signIn.mock.calls[0]![0]).toEqual({ user: testUser, pending2fa: false });
  });

  it('propose un code de secours à la place du code de l’application', async () => {
    post.mockImplementation(async (path: string) => {
      if (path === '/auth/login') return { twoFactorRequired: true, challenge: 'c' };
      return { user: testUser, pending2fa: false };
    });
    renderWithProviders(<Login />);
    await reachTwoFactorStep();
    fireEvent.click(screen.getByRole('button', { name: /code de secours/i }));
    const field = await screen.findByLabelText(/Code de secours/);
    fireEvent.change(field, { target: { value: 'ABCD-EFGH' } });
    fireEvent.click(screen.getByRole('button', { name: /Vérifier/ }));
    await waitFor(() => expect(signIn).toHaveBeenCalled());
    expect(post).toHaveBeenLastCalledWith('/auth/2fa/login', { challenge: 'c', code: 'ABCD-EFGH' }, { noRefresh: true });
  });

  it('sans 2FA, ouvre la session directement', async () => {
    post.mockResolvedValue({ user: testUser, pending2fa: false });
    renderWithProviders(<Login />);
    fireEvent.change(screen.getByLabelText(/Adresse e-mail/), { target: { value: 'sofia@acme.test' } });
    fireEvent.change(screen.getByLabelText(/^Mot de passe/), { target: { value: 'Sup3r-Secret-Pass-2026' } });
    fireEvent.click(screen.getByRole('button', { name: /Se connecter/ }));
    await waitFor(() => expect(signIn).toHaveBeenCalledTimes(1));
  });

  it('affiche le délai imposé après trop d’échecs', async () => {
    post.mockRejectedValue(Object.assign(new ApiError(429, 'Trop de tentatives', 'LOGIN_THROTTLED'), { details: { retryAfterSeconds: 45 } }));
    renderWithProviders(<Login />);
    fireEvent.change(screen.getByLabelText(/Adresse e-mail/), { target: { value: 'sofia@acme.test' } });
    fireEvent.change(screen.getByLabelText(/^Mot de passe/), { target: { value: 'mauvais-mot-de-passe' } });
    fireEvent.click(screen.getByRole('button', { name: /Se connecter/ }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Réessayez dans 45 s/);
  });
});
