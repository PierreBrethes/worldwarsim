/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [TanStackRouterVite(), react(), tailwind()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // Le dépôt vit sur /mnt/c : inotify ne traverse pas le pont WSL2, aucun événement de
  // fichier n'arrive. Sans scrutation, le HMR est muet et il faut relancer le serveur.
  server: { watch: { usePolling: true, interval: 300 } },
  test: {
    environmentMatchGlobs: [['convex/**', 'edge-runtime']],
    server: { deps: { inline: ['convex-test'] } },
  },
});
