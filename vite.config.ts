/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import babel from '@rolldown/plugin-babel';
import tailwind from '@tailwindcss/vite';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';
import { fileURLToPath, URL } from 'node:url';

// Les tests datent leurs scénarios à l'heure locale du poste, le serveur compte en UTC : on
// fixe le fuseau avant que les workers de vitest ne naissent (voir `convex/invariants.test.ts`).
process.env.TZ = 'UTC';

// `og:image` doit être absolue et `index.html` ne sait pas se replier seul : une variable
// absente laisserait `%VITE_PUBLIC_ORIGIN%` en clair dans la page servie.
process.env.VITE_PUBLIC_ORIGIN ||= 'https://wws.pierrebrethes.cloud';

export default defineConfig({
  plugins: [
    // Un `*.test.tsx` sous src/routes/ n'est pas une route : le plugin le signale à chaque
    // exécution, et le préfixer d'un tiret mettrait le test loin du fichier qu'il teste.
    TanStackRouterVite({ routeFileIgnorePattern: '\\.test\\.tsx?$', autoCodeSplitting: true }),
    react(),
    babel({ presets: [reactCompilerPreset({ target: '19' })] }),
    tailwind(),
  ],
  // Les figurines sculptées dans Claude Design arrivent en GLB, importées comme les planches.
  assetsInclude: ['**/*.glb'],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    rollupOptions: {
      output: {
        // three pèse plus que tout le reste de la route : seul, il se met en cache entre deux
        // livraisons du jeu, qui ne le changent pas.
        manualChunks: (id) => (id.includes('/node_modules/three/') ? 'three' : undefined),
      },
    },
  },
  // Le dépôt vit sur /mnt/c : inotify ne traverse pas le pont WSL2, aucun événement de
  // fichier n'arrive. Sans scrutation, le HMR est muet et il faut relancer le serveur.
  // Ailleurs (macOS, ext4 natif) les événements arrivent, et scruter tout le dépôt toutes les
  // 300 ms ne ferait que chauffer le poste.
  server: {
    watch: process.cwd().startsWith('/mnt/') ? { usePolling: true, interval: 300 } : {},
  },
  test: {
    server: { deps: { inline: ['convex-test'] } },
    projects: [
      {
        extends: true,
        test: { name: 'convex', include: ['convex/**/*.test.ts'], environment: 'edge-runtime' },
      },
      {
        extends: true,
        test: {
          name: 'front',
          exclude: ['convex/**', 'node_modules/**', '.claude/**', 'brag-output/**'],
        },
      },
    ],
  },
});
