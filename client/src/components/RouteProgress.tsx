import { useEffect, useRef, useState } from 'react';
import { useIsMutating } from '@tanstack/react-query';
import { usePendingCount } from '../lib/progress';

/** Fine barre de progression en haut de l'écran : chargement d'une page, d'un écran ou enregistrement en cours. */
export function RouteProgress() {
  const busy = usePendingCount() + useIsMutating() > 0;
  const [w, setW] = useState(0);
  const [visible, setVisible] = useState(false);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const clear = () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
    clear();
    if (busy) {
      // Court délai : un chargement instantané ne doit pas faire clignoter la barre.
      timers.current.push(
        window.setTimeout(() => {
          setVisible(true);
          setW(12);
          timers.current.push(window.setTimeout(() => setW(55), 120), window.setTimeout(() => setW(80), 900), window.setTimeout(() => setW(92), 2600));
        }, 120),
      );
    } else {
      setW((cur) => (cur > 0 ? 100 : 0));
      timers.current.push(window.setTimeout(() => setVisible(false), 260), window.setTimeout(() => setW(0), 520));
    }
    return clear;
  }, [busy]);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[300] h-[3px]" style={{ opacity: visible ? 1 : 0, transition: 'opacity 0.25s ease' }}>
      <div
        className="h-full rounded-e-full"
        style={{
          width: `${w}%`,
          background: 'linear-gradient(90deg, var(--accent), var(--accent-2))',
          boxShadow: '0 0 12px rgb(var(--accent-rgb) / 0.7)',
          transition: w === 100 ? 'width 0.2s ease-out' : 'width 0.8s cubic-bezier(0.2, 0.8, 0.2, 1)',
        }}
      />
    </div>
  );
}
