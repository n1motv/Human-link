import { describe, expect, it } from 'vitest';
import { ApiError } from './api';
import { STALE_TIMES, createQueryClient } from './queryClient';

describe('réglage du cache des requêtes (P-10)', () => {
  const client = createQueryClient();
  const stale = (key: string[]) => client.defaultQueryOptions({ queryKey: key }).staleTime;

  it('garde longtemps les données qui changent rarement et jamais celles de la cloche', () => {
    expect(stale(['org', 'tree'])).toBe(10 * 60_000);
    expect(stale(['org', 'supervisions'])).toBe(10 * 60_000);
    expect(stale(['notifications', 'count'])).toBe(0);
    expect(stale(['meetings', 'invitable'])).toBe(5 * 60_000);
  });

  it('applique 30 s aux autres données', () => {
    expect(stale(['leaves', 'mine'])).toBe(30_000);
    expect(stale(['audit', '', '', '1'])).toBe(30_000);
  });

  it('chaque réglage cible une clé distincte', () => {
    expect(new Set(STALE_TIMES.map(([k]) => k.join('/'))).size).toBe(STALE_TIMES.length);
  });

  it('ne réessaie pas une erreur de l’API (droits, validation) mais réessaie le réseau', () => {
    const retry = client.getDefaultOptions().queries!.retry as (n: number, e: unknown) => boolean;
    expect(retry(0, new ApiError(403, 'Refusé'))).toBe(false);
    expect(retry(0, new TypeError('Failed to fetch'))).toBe(true);
    expect(retry(2, new TypeError('Failed to fetch'))).toBe(false);
  });
});
