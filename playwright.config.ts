import { defineConfig } from '@playwright/test';
import { loadEnv } from 'vite';

/**
 * **Le parcours critique en navigateur** (#651), `npm run e2e`. Il vise le backend que le front
 * vise (`VITE_CONVEX_URL`, de l'environnement ou de `.env.local`) ; le test refuse tout backend
 * qui n'est pas local, puisqu'il y ouvre des comptes et fonde une saison.
 */
const backend =
  process.env.VITE_CONVEX_URL ??
  loadEnv('development', process.cwd(), 'VITE_').VITE_CONVEX_URL ??
  '';
process.env.VITE_CONVEX_URL = backend;

const port = 5174;

export default defineConfig({
  testDir: 'e2e',
  timeout: 240_000,
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    viewport: { width: 1600, height: 900 },
    screenshot: 'only-on-failure',
    // Sans GPU (CI), le WebGL de three.js passe par SwiftShader.
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  /** Le serveur de dev, et pas le build : seul le dev expose `globalThis.mapEngine` aux gestes.
   *  Un port à lui, pour ne pas reprendre le `npm run dev` du poste. */
  webServer: {
    command: `npx vite --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { VITE_CONVEX_URL: backend },
  },
});
