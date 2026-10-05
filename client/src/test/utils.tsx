import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ConfigProvider } from '../lib/config';
import { initI18n } from '../lib/i18n';
import { ThemeProvider } from '../lib/theme';
import { ToastProvider } from '../lib/toast';
import type { PublicConfig, User } from '../lib/types';

export const testConfig: PublicConfig = {
  company: { name: 'Acme', supportEmail: 'rh@acme.test', dpoEmail: 'dpo@acme.test', legalName: 'Acme SAS', address: '1 rue du Test' },
  branding: { logoUrl: '/branding/logo.svg', logoOnDarkUrl: '/branding/logo-on-dark.svg', showName: true, accent: '#8b5cf6', accent2: '#ec4899', defaultTheme: 'dark' },
  i18n: { defaultLanguage: 'fr', languages: ['fr', 'en'] },
  modules: { leaves: true, sickLeaves: true, bonuses: true, telework: true, meetings: true, vault: true, feedback: true, contact: true, chatbot: false, orgChart: true },
  hr: { minimumAge: 17, workingDays: [1, 2, 3, 4, 5] },
  security: { passwordMinLength: 12, require2faForRoles: ['admin'] },
  gdpr: { auditLogRetentionDays: 365, notificationRetentionDays: 90, contactRequestRetentionDays: 365, feedbackRetentionMonths: 24, departedEmployeeRetentionYears: 5 },
};

export const testUser: User = {
  id: 'u1',
  matricule: '000001',
  nom: 'Lopez',
  prenom: 'Sofia',
  email: 'sofia@acme.test',
  role: 'employe',
  status: 'active',
  isDirector: false,
  soldeConge: 17,
  teleworkMax: 2,
};

let i18nReady = false;

/** Rend un composant avec tout ce dont l'application a besoin : configuration, thème, requêtes, messages, routeur, langue française. */
export function renderWithProviders(ui: ReactElement, { route = '/' }: { route?: string } = {}) {
  if (!i18nReady) {
    initI18n('fr', ['fr', 'en']);
    i18nReady = true;
  }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <ConfigProvider value={testConfig}>
      <ThemeProvider defaultTheme="dark">
        <QueryClientProvider client={client}>
          <ToastProvider>
            <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
          </ToastProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </ConfigProvider>,
  );
}
