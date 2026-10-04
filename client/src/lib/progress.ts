import { useEffect, useSyncExternalStore } from 'react';

/** Compteur global de « chargements en cours » (pages, squelettes) qui pilote la barre de progression en haut de l'écran. */
let pending = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function usePending() {
  useEffect(() => {
    pending += 1;
    emit();
    return () => {
      pending -= 1;
      emit();
    };
  }, []);
}

export function usePendingCount(): number {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => pending,
  );
}
