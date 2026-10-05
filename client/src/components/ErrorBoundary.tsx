import { Component, type ErrorInfo, type ReactNode } from 'react';
import { reportError } from '../lib/errorReport';

interface State {
  error: Error | null;
}

/** Évite l'écran blanc : une erreur de rendu affiche un message et un bouton de rechargement. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('Erreur de rendu', error, info.componentStack);
    reportError('render', error, info.componentStack ?? undefined);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="grid min-h-screen place-items-center px-4 text-center">
        <div className="glass-strong max-w-md p-8">
          <h1 className="text-xl font-bold">Une erreur est survenue</h1>
          <p className="mt-2 text-sm text-muted">L'affichage a rencontré un problème inattendu. Rechargez la page pour continuer.</p>
          <button className="btn btn-primary mt-6" onClick={() => window.location.reload()}>
            Recharger la page
          </button>
        </div>
      </div>
    );
  }
}
