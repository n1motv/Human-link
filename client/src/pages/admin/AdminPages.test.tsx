import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, downloadFile } from '../../lib/api';
import { renderWithProviders } from '../../test/utils';
import Compliance from './Compliance';
import MailQueue from './MailQueue';

vi.mock('../../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api')>();
  return { ...actual, downloadFile: vi.fn().mockResolvedValue(undefined), api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() } };
});
const get = vi.mocked(api.get);
const post = vi.mocked(api.post);
const del = vi.mocked(api.delete);

const register = {
  generatedAt: '2026-10-06T09:00:00.000Z',
  controller: { name: 'Acme SAS', address: '1 rue du Test, 75000 Paris', dpoEmail: 'dpo@acme.test', supportEmail: 'rh@acme.test' },
  retention: { departedEmployeeYears: 5, auditLogDays: 365, notificationDays: 90, contactRequestDays: 365, feedbackMonths: 24 },
  treatments: [
    {
      id: 'sante',
      name: 'Arrêts maladie',
      purpose: 'Enregistrer les arrêts.',
      legalBasis: 'Obligation légale.',
      dataCategories: ['Dates', 'Justificatif'],
      sensitive: true,
      recipients: ['Administration RH uniquement'],
      retention: 'Pendant la relation de travail, puis 5 ans.',
      security: ['Justificatifs chiffrés'],
    },
    {
      id: 'audit',
      name: 'Journal d’audit',
      purpose: 'Savoir qui a consulté quoi.',
      legalBasis: 'Intérêt légitime.',
      dataCategories: ['E-mail', 'Date'],
      sensitive: false,
      recipients: ['Administration RH'],
      retention: '365 jours, puis suppression automatique.',
      security: ['Lecture seule'],
    },
  ],
  processors: [{ name: 'Hébergeur', role: 'Héberge l’application.' }],
  transfers: 'Aucune donnée ne quitte le serveur.',
  rights: 'Droits exercés depuis « Mes données ».',
};

describe('page Conformité (S-16)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    get.mockImplementation(async (path: string) => {
      if (path.startsWith('/rgpd/register')) return register;
      if (path.startsWith('/users')) return { items: [{ id: 'u1', prenom: 'Sofia', nom: 'Lopez', matricule: '000104E' }], total: 1, page: 1 };
      throw new Error(`appel imprévu : ${path}`);
    });
  });

  it('montre les durées de conservation actuelles et chaque traitement, la donnée de santé signalée', async () => {
    renderWithProviders(<Compliance />);
    expect(await screen.findByText('Arrêts maladie')).toBeTruthy();
    expect(screen.getByText('5 an(s)')).toBeTruthy();
    expect(screen.getAllByText('365 jours').length).toBeGreaterThan(0);
    expect(screen.getByText('24 mois')).toBeTruthy();
    expect(screen.getByText('Donnée de santé')).toBeTruthy();
    expect(screen.getByText('Pendant la relation de travail, puis 5 ans.')).toBeTruthy();
    expect(screen.getByText(/Acme SAS/)).toBeTruthy();
  });

  it('exporte le dossier de la personne choisie, en un clic', async () => {
    renderWithProviders(<Compliance />);
    await screen.findByText('Arrêts maladie');
    const button = screen.getByRole('button', { name: 'Exporter le dossier' });
    expect((button as HTMLButtonElement).disabled).toBe(true); // personne choisie : non
    fireEvent.focus(screen.getByRole('combobox', { name: 'Choisir un employé…' }));
    fireEvent.click(await screen.findByText('Sofia Lopez', { exact: false }));
    expect((button as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(button);
    await waitFor(() => expect(downloadFile).toHaveBeenCalledWith('/rgpd/dossier/u1', 'dossier-Lopez-000104E.zip'));
    expect(await screen.findByText('Dossier téléchargé.')).toBeTruthy();
  });
});

describe('page E-mails (T-10)', () => {
  const job = {
    id: 'j1',
    to: 'sofia@acme.test',
    subject: 'Activation de votre compte',
    status: 'failed',
    attempts: 6,
    nextAttemptAt: '2026-10-06T09:00:00.000Z',
    lastError: 'connect ECONNREFUSED',
    createdAt: '2026-10-06T08:00:00.000Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    get.mockResolvedValue({ items: [job], counts: { failed: 1, pending: 2 } });
    post.mockResolvedValue({ job });
    del.mockResolvedValue({ ok: true });
  });

  it('liste les envois en échec avec leur erreur, sans jamais afficher le contenu', async () => {
    renderWithProviders(<MailQueue />);
    expect(await screen.findByText('sofia@acme.test')).toBeTruthy();
    expect(get).toHaveBeenCalledWith('/mail-jobs?status=failed');
    expect(screen.getByText('connect ECONNREFUSED')).toBeTruthy();
    expect(screen.getByText('Activation de votre compte')).toBeTruthy();
  });

  it('relance un envoi', async () => {
    renderWithProviders(<MailQueue />);
    await screen.findByText('sofia@acme.test');
    fireEvent.click(screen.getByRole('button', { name: 'Relancer' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/mail-jobs/j1/retry'));
    expect(await screen.findByText('Envoi relancé.')).toBeTruthy();
  });

  it('demande confirmation avant d’abandonner un envoi', async () => {
    renderWithProviders(<MailQueue />);
    await screen.findByText('sofia@acme.test');
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
    const dialog = await screen.findByRole('dialog', { name: 'Abandonner cet envoi ?' });
    expect(del).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Supprimer' }));
    await waitFor(() => expect(del).toHaveBeenCalledWith('/mail-jobs/j1'));
  });

  it('affiche un état vide rassurant quand tout est parti', async () => {
    get.mockResolvedValue({ items: [], counts: { failed: 0, pending: 0 } });
    renderWithProviders(<MailQueue />);
    expect(await screen.findByText('Aucun envoi en échec : tout est parti.')).toBeTruthy();
  });
});
