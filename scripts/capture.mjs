/**
 * **Une capture du jeu en local**, connecté avec un compte de démo (`npm run demo:mondiale`).
 *
 *     PLAYWRIGHT_DIR=/chemin/vers/pw npm run capture -- <url> <sortie.png> \
 *       [--compte a|b] [--largeur 390 --hauteur 844] [--attendre ms]
 *
 * `PLAYWRIGHT_DIR` : un dossier hors du dépôt où `npm i playwright-core@1.58` a été fait. L'URL
 * peut être un chemin (`/plateau`) pris sur http://localhost:5173 ; `{saison}` y devient
 * l'identifiant de la dernière démo, ce qui fait entrer le compte sur sa place
 * (`/plateau?season={saison}`). Les erreurs de console sortent sur stdout.
 */
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at < 0 ? fallback : args[at + 1];
};
const flags = new Set(['--compte', '--largeur', '--hauteur', '--attendre']);
const positional = args.filter((arg, k) => !arg.startsWith('--') && !flags.has(args[k - 1]));
const [target, out] = positional;
if (!target || !out) {
  console.error(
    'usage : capture.mjs <url> <sortie.png> [--compte a|b] [--largeur N --hauteur N] [--attendre ms]',
  );
  process.exit(2);
}

const dir = process.env.PLAYWRIGHT_DIR;
if (!dir)
  throw new Error('PLAYWRIGHT_DIR absent : dossier hors dépôt où `npm i playwright-core@1.58`');
const { chromium } = createRequire(`${dir}/`)('playwright-core');

const accountsFile = fileURLToPath(new URL('./demo-mondiale.accounts.json', import.meta.url));
if (!existsSync(accountsFile))
  throw new Error('Pas de comptes de démo : lance `npm run demo:mondiale`.');
const accounts = JSON.parse(readFileSync(accountsFile, 'utf8'));
const account = accounts[option('compte', 'a')];
if (!account?.nickname) throw new Error('--compte : a ou b');

const origin = 'http://localhost:5173';
const url = (target.startsWith('/') ? origin + target : target).replace(
  '{saison}',
  accounts.seasonId,
);
if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname))
  throw new Error(`Refus : ${url} n'est pas local.`);

const cache = `${homedir()}/Library/Caches/ms-playwright/chromium-1243`;
const app = 'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const executablePath = existsSync(`${cache}/chrome-mac-arm64/${app}`)
  ? `${cache}/chrome-mac-arm64/${app}`
  : `${cache}/chrome-mac/${app}`;

const browser = await chromium.launch({
  executablePath,
  args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal'],
});
const page = await browser.newPage({
  viewport: { width: Number(option('largeur', 1440)), height: Number(option('hauteur', 900)) },
});
page.on('console', (message) => {
  if (message.type() === 'error') console.log(`[console.error] ${message.text()}`);
});
page.on('pageerror', (error) => console.log(`[pageerror] ${error.message}`));

try {
  await page.goto(`${origin}/connexion`);
  await page.getByLabel('nom de guerre').fill(account.nickname);
  await page.getByLabel('mot de passe').fill(account.password);
  await page.getByRole('button', { name: 'entrer' }).click();
  await page.waitForURL('**/accueil', { timeout: 15000 });
  await page.goto(url);
  /** La notice « Entrée en campagne » couvre le plateau d'une place neuve : on la tamponne. */
  const understood = page.getByRole('button', { name: /compris/i }).first();
  if (
    await understood.waitFor({ timeout: 8000 }).then(
      () => true,
      () => false,
    )
  ) {
    await understood.click();
  }
  await page.waitForTimeout(Number(option('attendre', 6000)));
  await page.screenshot({ path: out });
  console.log(`capture : ${out} (${url})`);
} finally {
  await browser.close();
}
