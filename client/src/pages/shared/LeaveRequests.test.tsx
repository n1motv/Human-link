import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LeaveRequests from './LeaveRequests';
import { ApiError, api } from '../../lib/api';
import { renderWithProviders } from '../../test/utils';
import type { Leave } from '../../lib/types';

vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api')>();
  return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() } };
});

const get = vi.mocked(api.get);
const post = vi.mocked(api.post);

const pending: Leave = {
  id: 'L1',
  userId: 'u1',
  user: { id: 'u1', nom: 'Lopez', prenom: 'Sofia', departement: 'Technique' },
  raison: 'annual',
  dateDebut: '2026-11-02',
  dateFin: '2026-11-06',
  nombreJours: 5,
  statut: 'en attente',
  statutManager: 'en attente',
  statutAdmin: 'en attente',
  createdAt: '2026-10-01T09:00:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  get.mockResolvedValue({ items: [pending] });
  post.mockResolvedValue({});
});

describe('traitement d’une demande de congé par un manager', () => {
  it('demande une confirmation nommant la personne, puis enregistre l’acceptation', async () => {
    renderWithProviders(<LeaveRequests role="manager" />);
    expect(await screen.findByText('Sofia Lopez')).toBeTruthy();
    expect(get).toHaveBeenCalledWith('/leaves?statut=en%20attente');

    fireEvent.click(screen.getByRole('button', { name: 'Accepter' }));
    const dialog = await screen.findByRole('dialog', { name: 'Accepter la demande ?' });
    expect(within(dialog).getByText(/La demande de Sofia Lopez sera acceptée/)).toBeTruthy();
    expect(post).not.toHaveBeenCalled(); // rien n'est envoyé avant la confirmation

    fireEvent.click(within(dialog).getByRole('button', { name: 'Accepter' }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post).toHaveBeenCalledWith('/leaves/L1/decision', { decision: 'accepte', motifRefus: undefined });
    expect(await screen.findByText('Décision enregistrée.')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Accepter la demande ?' })).toBeNull());
  });

  it('« Annuler » referme la confirmation sans rien envoyer', async () => {
    renderWithProviders(<LeaveRequests role="manager" />);
    await screen.findByText('Sofia Lopez');
    fireEvent.click(screen.getByRole('button', { name: 'Accepter' }));
    const dialog = await screen.findByRole('dialog', { name: 'Accepter la demande ?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Annuler' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Accepter la demande ?' })).toBeNull());
    expect(post).not.toHaveBeenCalled();
  });

  it('un refus exige un motif', async () => {
    renderWithProviders(<LeaveRequests role="manager" />);
    await screen.findByText('Sofia Lopez');
    fireEvent.click(screen.getByRole('button', { name: 'Refuser' }));
    const dialog = await screen.findByRole('dialog', { name: 'Refuser la demande' });
    const confirm = within(dialog).getByRole('button', { name: 'Refuser' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true); // pas de motif, pas de refus
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Livraison prévue cette semaine-là.' } });
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    await waitFor(() => expect(post).toHaveBeenCalledWith('/leaves/L1/decision', { decision: 'refuse', motifRefus: 'Livraison prévue cette semaine-là.' }));
  });

  it('n’offre aucune action sur une demande déjà traitée par le manager (côté manager)', async () => {
    get.mockResolvedValue({ items: [{ ...pending, statutManager: 'accepte' }] });
    renderWithProviders(<LeaveRequests role="manager" />);
    await screen.findByText('Sofia Lopez');
    expect(screen.queryByRole('button', { name: 'Accepter' })).toBeNull();
  });
});

describe('décisions groupées (U-10)', () => {
  const person = (id: string, prenom: string, nom: string, over: Partial<Leave> = {}): Leave => ({
    ...pending,
    id,
    userId: `u-${id}`,
    user: { id: `u-${id}`, prenom, nom, departement: 'Technique' },
    ...over,
  });
  const three = [person('L1', 'Sofia', 'Lopez'), person('L2', 'Nadia', 'Haddad'), person('L3', 'Luca', 'Rossi', { statutManager: 'accepte' })];

  beforeEach(() => get.mockResolvedValue({ items: three }));

  it('ne propose de cocher que les demandes que le manager peut traiter', async () => {
    renderWithProviders(<LeaveRequests role="manager" />);
    await screen.findByText('Sofia Lopez');
    expect(screen.getByRole('checkbox', { name: /Sofia Lopez/ })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: /Nadia Haddad/ })).toBeTruthy();
    expect(screen.queryByRole('checkbox', { name: /Luca Rossi/ })).toBeNull(); // déjà acceptée par le manager
    expect(screen.queryByRole('region', { name: 'Actions groupées' })).toBeNull();
  });

  it('une seule confirmation liste les personnes, puis chaque décision part vers la route habituelle', async () => {
    renderWithProviders(<LeaveRequests role="manager" />);
    await screen.findByText('Sofia Lopez');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Tout sélectionner' }));
    const bar = screen.getByRole('region', { name: 'Actions groupées' });
    expect(within(bar).getByText('2 sélectionnée(s)')).toBeTruthy();

    fireEvent.click(within(bar).getByRole('button', { name: 'Accepter' }));
    const dialog = await screen.findByRole('dialog', { name: 'Accepter 2 demande(s) ?' });
    expect(within(dialog).getByText('Sofia Lopez')).toBeTruthy();
    expect(within(dialog).getByText('Nadia Haddad')).toBeTruthy();
    expect(post).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Accepter (2)' }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    expect(post).toHaveBeenCalledWith('/leaves/L1/decision', { decision: 'accepte', motifRefus: undefined });
    expect(post).toHaveBeenCalledWith('/leaves/L2/decision', { decision: 'accepte', motifRefus: undefined });
    expect(await screen.findByText('2 décision(s) enregistrée(s).')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Actions groupées' })).toBeNull());
  });

  it('le refus groupé envoie le même motif à chacune', async () => {
    renderWithProviders(<LeaveRequests role="manager" />);
    await screen.findByText('Sofia Lopez');
    fireEvent.click(screen.getByRole('checkbox', { name: /Sofia Lopez/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Nadia Haddad/ }));
    fireEvent.click(within(screen.getByRole('region', { name: 'Actions groupées' })).getByRole('button', { name: 'Refuser' }));
    const dialog = await screen.findByRole('dialog', { name: 'Refuser 2 demande(s)' });
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Période de clôture.' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Refuser' }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    expect(post).toHaveBeenCalledWith('/leaves/L2/decision', { decision: 'refuse', motifRefus: 'Période de clôture.' });
  });

  it('si l’une échoue, les autres passent quand même et l’échec est nommé', async () => {
    post.mockImplementation(async (path: string) => {
      if (path.includes('L2')) throw new ApiError(409, 'Cette demande a déjà été traitée', 'ALREADY_DECIDED');
      return {};
    });
    renderWithProviders(<LeaveRequests role="manager" />);
    await screen.findByText('Sofia Lopez');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Tout sélectionner' }));
    fireEvent.click(within(screen.getByRole('region', { name: 'Actions groupées' })).getByRole('button', { name: 'Accepter' }));
    const dialog = await screen.findByRole('dialog', { name: 'Accepter 2 demande(s) ?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Accepter (2)' }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2)); // L1 passe, L2 échoue : les deux ont été tentées
    const toast = await screen.findByText(/1 enregistrée\(s\), 1 en échec : Nadia Haddad/);
    expect(toast).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: /Nadia Haddad/ })).toHaveProperty('checked', true); // l'échec reste coché : on peut réessayer
    expect(screen.getByRole('checkbox', { name: /Sofia Lopez/ })).toHaveProperty('checked', false);
  });
});
