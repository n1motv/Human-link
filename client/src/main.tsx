import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './app/App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ConfigProvider } from './lib/config';
import { AuthProvider } from './lib/auth';
import { SessionFlowProvider } from './app/SessionFlow';
import { ThemeProvider } from './lib/theme';
import { ToastProvider } from './lib/toast';
import { applyBranding } from './lib/branding';
import { ApiError } from './lib/api';
import { initI18n } from './lib/i18n';
import type { PublicConfig } from './lib/types';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // Inutile de réessayer une erreur 4xx (droits, validation) : seul le réseau mérite un nouvel essai.
      retry: (count, err) => !(err instanceof ApiError) && count < 2,
    },
  },
});

async function boot() {
  const root = createRoot(document.getElementById('root')!);
  try {
    // La configuration client (nom, logo, couleurs, modules) vient du serveur : le même build sert tous les clients.
    const res = await fetch('/api/config');
    if (!res.ok) throw new Error(String(res.status));
    const cfg = (await res.json()) as PublicConfig;
    applyBranding(cfg);
    initI18n(cfg.i18n.defaultLanguage, cfg.i18n.languages);
    root.render(
      <StrictMode>
        <ConfigProvider value={cfg}>
          <ThemeProvider defaultTheme={cfg.branding.defaultTheme}>
            <QueryClientProvider client={queryClient}>
              <ToastProvider>
                <AuthProvider>
                  <BrowserRouter>
                    <SessionFlowProvider>
                      <ErrorBoundary>
                        <App />
                      </ErrorBoundary>
                    </SessionFlowProvider>
                  </BrowserRouter>
                </AuthProvider>
              </ToastProvider>
            </QueryClientProvider>
          </ThemeProvider>
        </ConfigProvider>
      </StrictMode>,
    );
  } catch {
    document.documentElement.dataset.theme = 'dark';
    root.render(
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: '#fff', fontFamily: 'system-ui', padding: 24, textAlign: 'center' }}>
        <div>
          <h1 style={{ fontSize: 22, marginBottom: 8 }}>Service momentanément indisponible</h1>
          <p style={{ opacity: 0.7 }}>Impossible de joindre le serveur. Réessayez dans quelques instants.</p>
        </div>
      </div>,
    );
  }
}

void boot();
