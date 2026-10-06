import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { visualizer } from 'rollup-plugin-visualizer';

const api = process.env.VITE_API_URL ?? 'http://localhost:4000';

export default defineConfig({
  // Contrat de données partagé avec le serveur (../shared/src) : types et schémas zod.
  resolve: { alias: { '@shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)) } },
  // ANALYZE=1 npm run build : écrit stats.html (carte des paquets, tailles brutes et compressées) pour voir ce qui pèse.
  plugins: [react(), tailwindcss(), ...(process.env.ANALYZE ? [visualizer({ filename: 'stats.html', gzipSize: true, brotliSize: true, template: 'treemap' })] : [])],
  server: {
    port: 5173,
    // Le front appelle toujours /api et /branding en relatif : pas de CORS, cookies « même site ».
    proxy: { '/api': api, '/branding': api },
  },
  build: { sourcemap: false, target: 'es2022' },
  test: { environment: 'jsdom', globals: true, setupFiles: ['src/test-setup.ts'], exclude: ['e2e/**', 'node_modules/**'] },
});
