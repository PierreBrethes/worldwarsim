/**
 * **Une capture du jeu en local**, connecté avec un compte de démo (`npm run demo:mondiale`).
 *
 *     PLAYWRIGHT_DIR=/chemin/vers/pw npm run capture -- <url> <sortie.png> \
 *       [--compte a|b] [--largeur 390 --hauteur 844] [--attendre ms] [--geste … ]
 *
 * `PLAYWRIGHT_DIR` : un dossier hors du dépôt où `npm i playwright-core@1.58` a été fait. L'URL
 * peut être un chemin (`/plateau`) pris sur http://localhost:5173 ; `{saison}` y devient
 * l'identifiant de la dernière démo, ce qui fait entrer le compte sur sa place
 * (`/plateau?season={saison}`). Les erreurs de console sortent sur stdout.
 *
 * `--geste` se répète et se joue dans l'ordre, après l'attente et avant la capture, pour voir un
 * état qu'il faut provoquer (le fantôme d'une pose) : `texte=Mine — charbon` clique le premier
 * élément qui porte ce texte, `clic=x,y` clique en un point, `toucher=x,y` (avec `--tactile`) tape du doigt, `clicdroit=x,y` et `clicmilieu=x,y` y cliquent du bouton droit ou du milieu (la rose des vents), `molette=x,y,dy` tourne la molette,
 * `survol=x,y` y mène la souris, `pause=ms` attend. `presser=x,y` enfonce le bouton en un point et
 * `lacher` le relâche : entre les deux, des `survol` font un glisser (une tuile du plateau personnel
 * portée sur la carte), et une capture prise avant `lacher` montre la main pleine. `touche=H` presse
 * une touche ; `tenir=Shift` l'enfonce et `relever=Shift` la relâche (Maj + glisser : le lasso).
 * `photo=chemin.png` prend une capture en cours de route, la dernière restant `<sortie.png>`.
 * `ralenti=10` passe toutes les animations dix fois plus lentement, pour en voir le milieu.
 * `camera=x,z,distance,pente°,azimut°` pose l'œil (cible au plateau en x, z ; azimut 0 = regard
 * vers le nord), puis laisse la boucle faire : les bords du plateau, de près, de loin, penché.
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
const flags = new Set(['--compte', '--largeur', '--hauteur', '--attendre', '--geste']);
/** `--tactile` : un écran tactile, pour les gestes du doigt (`toucher=x,y`, la rose s'ouvre au toucher). */
const touch = args.includes('--tactile');
const gestures = args.flatMap((arg, k) => (args[k - 1] === '--geste' ? [arg] : []));
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
  hasTouch: touch,
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
  for (const gesture of gestures) {
    const [kind, value = ''] = gesture.split(/=(.*)/s);
    const [x = 0, y = 0, dy = 0] = value.split(',').map(Number);
    if (kind === 'texte') await page.getByText(value).first().click();
    else if (kind === 'molette') {
      await page.mouse.move(x, y);
      await page.mouse.wheel(0, dy);
    } else if (kind === 'survol') await page.mouse.move(x, y, { steps: 8 });
    else if (kind === 'clic') await page.mouse.click(x, y);
    else if (kind === 'toucher') await page.touchscreen.tap(x, y);
    else if (kind === 'clicdroit') await page.mouse.click(x, y, { button: 'right' });
    else if (kind === 'clicmilieu') await page.mouse.click(x, y, { button: 'middle' });
    else if (kind === 'presser') {
      await page.mouse.move(x, y);
      await page.mouse.down();
    } else if (kind === 'lacher') await page.mouse.up();
    else if (kind === 'touche') await page.keyboard.press(value);
    else if (kind === 'tenir') await page.keyboard.down(value);
    else if (kind === 'relever') await page.keyboard.up(value);
    else if (kind === 'photo') await page.screenshot({ path: value });
    else if (kind === 'pause') await page.waitForTimeout(x);
    else if (kind === 'camera') {
      // `mapEngine` n'est exposé qu'en dev (`WorldMap.tsx`).
      const [, , distance = 60, polar = 0, azimuth = 0] = value.split(',').map(Number);
      await page.evaluate(
        ([tx, tz, d, p, a]) => {
          const engine = globalThis.mapEngine;
          const rad = Math.PI / 180;
          engine.controls.target.set(tx, 0, tz);
          engine.camera.position.set(
            tx + d * Math.sin(p * rad) * Math.sin(a * rad),
            d * Math.cos(p * rad),
            tz + d * Math.sin(p * rad) * Math.cos(a * rad),
          );
          engine.invalidate();
        },
        [x, y, distance, polar, azimuth],
      );
      await page.waitForTimeout(1500);
    } else if (kind === 'ralenti') {
      const devtools = await page.context().newCDPSession(page);
      await devtools.send('Animation.enable');
      await devtools.send('Animation.setPlaybackRate', { playbackRate: 1 / x });
    } else throw new Error(`--geste inconnu : ${gesture}`);
    await page.waitForTimeout(400);
  }
  await page.screenshot({ path: out });
  console.log(`capture : ${out} (${url})`);
} finally {
  await browser.close();
}
