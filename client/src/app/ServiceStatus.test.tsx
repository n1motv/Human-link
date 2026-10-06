import { screen, waitFor } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../test/utils';
import { ServiceStatus } from './ServiceStatus';

const health = (over: Record<string, unknown> = {}) => new Response(JSON.stringify({ ok: true, version: 'dev', maintenance: false, ...over }), { status: 200 });

beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
afterEach(() => vi.unstubAllGlobals());

const mockHealth = (over?: Record<string, unknown>) => vi.mocked(fetch).mockImplementation(() => Promise.resolve(health(over)));

describe('version et maintenance (T-16)', () => {
  it('ne dit rien quand le serveur porte la même version que le front', async () => {
    mockHealth({ version: 'dev' });
    renderWithProviders(
      <ServiceStatus>
        <p>Application</p>
      </ServiceStatus>,
    );
    expect(await screen.findByText('Application')).toBeTruthy();
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/health', { cache: 'no-store' }));
    expect(screen.queryByText('Nouvelle version disponible')).toBeNull();
  });

  it('propose de recharger quand le serveur a une autre version, sans cacher l’application', async () => {
    mockHealth({ version: 'abc123def456' });
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    renderWithProviders(
      <ServiceStatus>
        <p>Application</p>
      </ServiceStatus>,
    );
    expect(await screen.findByText('Nouvelle version disponible')).toBeTruthy();
    expect(screen.getByText('Application')).toBeTruthy(); // le travail en cours n'est pas interrompu
    fireEvent.click(screen.getByRole('button', { name: 'Recharger' }));
    expect(reload).toHaveBeenCalledOnce();
  });

  it('« Plus tard » masque la bannière', async () => {
    mockHealth({ version: 'abc123def456' });
    renderWithProviders(
      <ServiceStatus>
        <p>Application</p>
      </ServiceStatus>,
    );
    await screen.findByText('Nouvelle version disponible');
    fireEvent.click(screen.getByRole('button', { name: 'Plus tard' }));
    expect(screen.queryByText('Nouvelle version disponible')).toBeNull();
  });

  it('affiche la page de maintenance à la place de l’application', async () => {
    mockHealth({ maintenance: true });
    renderWithProviders(
      <ServiceStatus>
        <p>Application</p>
      </ServiceStatus>,
    );
    expect(await screen.findByText('Maintenance en cours')).toBeTruthy();
    expect(screen.queryByText('Application')).toBeNull();
    expect(screen.getByRole('button', { name: /Réessayer maintenant/ })).toBeTruthy();
  });

  it('ignore une réponse en erreur : pas de bannière ni de maintenance', async () => {
    vi.mocked(fetch).mockImplementation(() => Promise.resolve(new Response('', { status: 404 })));
    renderWithProviders(
      <ServiceStatus>
        <p>Application</p>
      </ServiceStatus>,
    );
    expect(await screen.findByText('Application')).toBeTruthy();
    expect(screen.queryByText('Nouvelle version disponible')).toBeNull();
  });
});
