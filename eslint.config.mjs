// @ts-check
import js from '@eslint/js';
import globals from 'globals';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/test-results/**',
      '**/playwright-report/**',
      'graphify-out/**',
      'clients/**',
      '.instances/**',
      'server/.devdb/**',
      'server/src/_shared/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      '@typescript-eslint/no-unused-expressions': 'off',
    },
  },

  // Client : hooks React et accessibilité (jsx-a11y).
  {
    files: ['client/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    // Règles classiques des hooks. Les règles « React Compiler » du preset recommandé ne sont pas retenues : le projet n'utilise pas le compilateur.
    rules: { 'react-hooks/rules-of-hooks': 'error', 'react-hooks/exhaustive-deps': 'warn' },
  },
  { ...jsxA11y.flatConfigs.recommended, files: ['client/**/*.tsx'] },
  {
    files: ['client/**/*.tsx'],
    rules: {
      // `role` est une propriété métier des composants (<LeaveRequests role="manager" />), pas un rôle ARIA.
      'jsx-a11y/aria-role': ['error', { ignoreNonDOM: true }],
      // Mise au point volontaire à l'ouverture d'une fenêtre (palette, code 2FA) et sur le premier champ des écrans de connexion.
      'jsx-a11y/no-autofocus': 'off',
    },
  },
  {
    // Listes déroulantes, sélecteurs et palette : les options se choisissent au clavier depuis le champ qui garde le focus
    // (flèches, Entrée, Échap), le clic sur une option n'est donc pas le seul moyen d'y accéder.
    files: ['client/src/components/{Select,PersonPicker,DatePicker}.tsx', 'client/src/app/CommandPalette.tsx'],
    rules: {
      'jsx-a11y/click-events-have-key-events': 'off',
      'jsx-a11y/interactive-supports-focus': 'off',
      'jsx-a11y/no-noninteractive-element-interactions': 'off',
      'jsx-a11y/no-static-element-interactions': 'off',
    },
  },

  // Serveur, scripts et configuration : Node.
  {
    files: ['server/**/*.ts', 'shared/**/*.mjs', 'scripts/**/*.mjs', 'client/*.ts', 'client/scripts/**', 'client/e2e/**'],
    languageOptions: { globals: globals.node },
  },
);
