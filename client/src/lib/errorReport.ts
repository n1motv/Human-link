import { ApiError } from './api';

type Kind = 'render' | 'window' | 'promise';

const sent = new Set<string>();
const MAX_PER_SESSION = 5;

/**
 * Prévient l'équipe qu'une page a planté. Ne part que le strict nécessaire : message, pile, chemin de la page (sans paramètres)
 * et composants concernés. Ni compte, ni cookie, ni contenu de formulaire. Le serveur nettoie encore le texte avant de le journaliser.
 */
export function reportError(kind: Kind, error: unknown, component?: string) {
  try {
    if (error instanceof ApiError) return; // refus de droits, validation, réseau : déjà montrés à la personne, pas un défaut du code
    const message = error instanceof Error ? error.message : String(error);
    if (/ResizeObserver loop/i.test(message)) return; // bruit du navigateur, sans effet visible
    const stack = error instanceof Error ? error.stack : undefined;
    const key = `${kind}|${message}|${stack?.split('\n')[1] ?? ''}`;
    if (sent.has(key) || sent.size >= MAX_PER_SESSION) return; // une page cassée peut boucler : on n'envoie pas la même erreur deux fois
    sent.add(key);
    void fetch('/api/client-errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, message: message.slice(0, 2000), stack: stack?.slice(0, 8000), component: component?.slice(0, 4000), route: window.location.pathname }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* le suivi ne doit jamais provoquer une erreur de plus */
  }
}

export function installErrorReporting() {
  window.addEventListener('error', (e) => reportError('window', e.error ?? e.message));
  window.addEventListener('unhandledrejection', (e) => reportError('promise', e.reason));
}

/** Pour les tests : oublie les erreurs déjà envoyées. */
export const resetErrorReports = () => sent.clear();
