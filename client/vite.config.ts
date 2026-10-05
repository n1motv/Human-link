import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const api = process.env.VITE_API_URL ?? 'http://localhost:4000';

export default defineConfig({
  // Contrat de données partagé avec le serveur (../shared/src) : types et schémas zod.
  resolve: { alias: { '@shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)) } },
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Le front appelle toujours /api et /branding en relatif : pas de CORS, cookies « même site ».
    proxy: { '/api': api, '/branding': api },
  },
  build: { sourcemap: false, target: 'es2022' },
  test: { environment: 'jsdom', globals: true, setupFiles: ['src/test-setup.ts'], exclude: ['e2e/**', 'node_modules/**'] },
});
