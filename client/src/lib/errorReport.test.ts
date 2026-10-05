import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './api';
import { reportError, resetErrorReports } from './errorReport';

const fetchMock = vi.fn((_url: string, _init?: { body?: string }) => Promise.resolve(new Response(null, { status: 204 })));

beforeEach(() => {
  resetErrorReports();
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const sentBody = () => JSON.parse(fetchMock.mock.calls[0]![1]!.body!);

describe('envoi des erreurs du navigateur (T-03)', () => {
  it('envoie le message, la pile et le chemin sans paramètres', () => {
    window.history.pushState({}, '', '/me/leaves?token=secret&nom=Sofia');
    reportError('render', new Error('boom'), 'at Leaves');
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/client-errors');
    const body = sentBody();
    expect(body).toMatchObject({ kind: 'render', message: 'boom', route: '/me/leaves', component: 'at Leaves' });
    expect(JSON.stringify(body)).not.toMatch(/secret|Sofia/);
  });

  it('n’envoie pas deux fois la même erreur, ni plus de cinq par session', () => {
    const same = new Error('a');
    reportError('window', same);
    reportError('window', same);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 10; i++) reportError('window', new Error(`autre ${i}`));
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it('ignore les erreurs d’API déjà montrées à la personne et le bruit du navigateur', () => {
    reportError('promise', new ApiError(403, 'Accès refusé'));
    reportError('window', 'ResizeObserver loop completed with undelivered notifications.');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
