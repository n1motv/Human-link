import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api';

const SECOND = 1000;
const MINUTE = 60 * SECOND;

/**
 * Durée pendant laquelle une donnée en cache est considérée fraîche (React Query ne la redemande pas au serveur), selon sa nature :
 * l'organigramme change rarement, les notifications tout le temps. Les clés sont celles des `queryKey` ; une écriture
 * (`invalidateQueries`) recharge toujours tout de suite, quelle que soit la durée.
 */
export const STALE_TIMES: [queryKey: readonly string[], ms: number][] = [
  [['org'], 10 * MINUTE], // organigramme, rattachements : modifiés par l'administrateur seulement
  [['feedback', 'status'], 10 * MINUTE], // « avis déjà donné ce mois-ci ? »
  [['meetings', 'invitable'], 5 * MINUTE], // personnes invitables
  [['people'], 60 * SECOND], // résultats du sélecteur de personne : une recherche répétée ne redemande rien
  [['notifications'], 0], // la cloche doit toujours être à jour
];

export function createQueryClient() {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30 * SECOND,
        refetchOnWindowFocus: false,
        // Inutile de réessayer une erreur 4xx (droits, validation) : seul le réseau mérite un nouvel essai.
        retry: (count, err) => !(err instanceof ApiError) && count < 2,
      },
    },
  });
  for (const [key, staleTime] of STALE_TIMES) client.setQueryDefaults(key, { staleTime });
  return client;
}
