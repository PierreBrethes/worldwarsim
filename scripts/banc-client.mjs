/**
 * **Le banc client** (#189) : ce que coûtent les gestes et la carte, au téléphone puis au bureau.
 *
 *     PLAYWRIGHT_DIR=/chemin/pw npm run banc:client -- [--profil telephone|bureau] [--passes 3]
 *       [--sortie dossier] [--sans-build] [--photos] [--cpu motif]
 *
 * Prérequis de `npm run capture` (Docker levé, fonctions déployées, `npm run demo:mondiale` —
 * `--niveaux --edition` donne des bâtiments et une presse). Le banc construit un build de prod
 * dans un dossier temporaire avec `VITE_BANC=1` (React de profilage, noms de fonctions gardés, la
 * carte exposée en `window.mapEngine`), le sert par `vite preview` sur :4173, puis joue le même
 * parcours `--passes` fois par profil, chaque passe dans un onglet neuf :
 *
 * - **téléphone** : 390×844, `deviceScaleFactor` 3, toucher, CPU ralenti ×4 (CDP) ;
 * - **bureau** : 1440×900, souris.
 *
 * Par geste : durée des images (rAF, médiane et p95), tâches longues, délai de l'entrée à la
 * première image qui suit la salve de commits React du geste, commits et composants rendus (le
 * hook de React DevTools : il voit chaque racine sans `<Profiler>` à poser dans l'arbre, et le
 * build de profilage y ajoute la durée des rendus) ; côté carte, images rendues par seconde,
 * temps JS de la boucle, temps GPU (`EXT_disjoint_timer_query_webgl2`, le GPU du poste et non
 * celui d'un téléphone), appels de dessin, et le temps CPU du processus GPU de Chrome par seconde
 * (composition et commandes GL, hors du thread principal). Une fois par passe, après les gestes de
 * la carte : pixel ratio, tampon, carte d'ombres, programmes, textures, flou de bascule. Chaque
 * chiffre est la médiane des passes. Sortie : `banc-client.json` et `banc-client.txt` dans
 * `--sortie`.
 *
 * Le haut de `ps` est imprimé avant de mesurer : un vérifieur ou un autre navigateur à côté
 * fausse tout.
 */
/* global window, document, requestAnimationFrame, addEventListener, getComputedStyle, innerWidth, innerHeight -- les fonctions passées à `page.evaluate` tournent dans la page. */
import { execFileSync, execSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at < 0 ? fallback : args[at + 1];
};
const root = fileURLToPath(new URL('..', import.meta.url));
const passes = Number(option('passes', 3));
const out = option('sortie', `${tmpdir()}/banc-client`);
const dist = `${out}/dist`;
const only = option('profil', null);
/** `--photos` : une capture après chaque geste de la première passe, pour voir ce qui a été joué. */
const photos = args.includes('--photos');
/** `--cpu <motif>` : le profil CPU des gestes dont le nom y répond (première passe), et ses
 *  fonctions les plus coûteuses en temps propre. */
const cpu = option('cpu', null) === null ? null : new RegExp(option('cpu'), 'i');
const PORT = 4173;
const origin = `http://localhost:${PORT}`;

const dir = process.env.PLAYWRIGHT_DIR;
if (!dir)
  throw new Error('PLAYWRIGHT_DIR absent : dossier hors dépôt où `npm i playwright-core@1.58`');
const { chromium } = createRequire(`${dir}/`)('playwright-core');

const env = readFileSync(`${root}.env.local`, 'utf8');
const convexUrl = env.match(/^VITE_CONVEX_URL=(.*)$/m)?.[1]?.trim() ?? '';
if (!['127.0.0.1', 'localhost'].includes(new URL(convexUrl).hostname))
  throw new Error(`Refus : VITE_CONVEX_URL (${convexUrl}) n'est pas local.`);
const accountsFile = `${root}scripts/demo-mondiale.accounts.json`;
if (!existsSync(accountsFile)) throw new Error('Pas de comptes de démo : `npm run demo:mondiale`.');
const accounts = JSON.parse(readFileSync(accountsFile, 'utf8'));

const PROFILES = {
  telephone: {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    hasTouch: true,
    isMobile: true,
    cpu: 4,
  },
  bureau: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, cpu: 1 },
};

// --- la machine, le build, le serveur ---------------------------------------------------------
const load = execSync('ps -Ao %cpu,command | sort -nr | head -7', { encoding: 'utf8' })
  .split('\n')
  .filter((line) => !line.includes('banc-client'))
  .map((line) => line.slice(0, 110))
  .join('\n');
console.log(`Charge avant mesure :\n${load}`);

mkdirSync(`${out}/photos`, { recursive: true });
const vite = `${root}node_modules/vite/bin/vite.js`;
if (!args.includes('--sans-build')) {
  console.log('build de prod (VITE_BANC=1)…');
  execFileSync(process.execPath, [vite, 'build', '--outDir', dist, '--emptyOutDir'], {
    cwd: root,
    env: { ...process.env, VITE_BANC: '1' },
    stdio: 'ignore',
  });
}
if (
  await fetch(origin).then(
    (r) => r.ok,
    () => false,
  )
)
  throw new Error(`${origin} répond déjà : un autre serveur y mesurerait un autre build.`);
const server = spawn(
  process.execPath,
  [vite, 'preview', '--outDir', dist, '--port', String(PORT), '--strictPort'],
  { cwd: root, stdio: 'ignore' },
);
for (let k = 0; ; k++) {
  if (
    await fetch(origin).then(
      (r) => r.ok,
      () => false,
    )
  )
    break;
  if (k > 50) throw new Error(`vite preview muet sur ${origin}`);
  await new Promise((resolve) => setTimeout(resolve, 200));
}

/** Les processus GPU de Chrome for Testing : ceux d'avant le lancement ne sont pas les nôtres. */
const gpuProcesses = () =>
  execSync('ps -Ao pid,command', { encoding: 'utf8' })
    .split('\n')
    .filter((line) => line.includes('Chrome for Testing') && line.includes('--type=gpu-process'))
    .map((line) => line.trim().split(/\s+/)[0]);
/** Le temps CPU cumulé d'un processus, en ms (`ps -o time` : m:ss.cc). */
const cpuTimeMs = (pid) => {
  const [minutes, seconds] = execSync(`ps -o time= -p ${pid}`, { encoding: 'utf8' })
    .trim()
    .split(':');
  return (Number(minutes) * 60 + Number(seconds)) * 1000;
};
const foreignGpu = new Set(gpuProcesses());
const cache = `${homedir()}/Library/Caches/ms-playwright/chromium-1243`;
const app = 'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const browser = await chromium.launch({
  executablePath: existsSync(`${cache}/chrome-mac-arm64/${app}`)
    ? `${cache}/chrome-mac-arm64/${app}`
    : `${cache}/chrome-mac/${app}`,
  args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal'],
});

// --- ce que la page relève -------------------------------------------------------------------
/** Posé avant tout script de la page : le hook de React DevTools, les images, les tâches longues. */
function instrument() {
  const B = {
    on: false,
    t0: 0,
    firstInput: null,
    frames: [],
    commits: [],
    names: {},
    longtasks: [],
    renders: [],
  };
  window.__banc = B;
  const tick = (t) => {
    if (B.on) B.frames.push(t);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  new PerformanceObserver((list) => {
    if (B.on) for (const e of list.getEntries()) B.longtasks.push([e.startTime, e.duration]);
  }).observe({ type: 'longtask' });
  for (const type of ['pointerdown', 'keydown', 'wheel', 'touchstart'])
    addEventListener(
      type,
      (event) => {
        if (B.on && B.firstInput === null) B.firstInput = event.timeStamp;
      },
      { capture: true, passive: true },
    );
  const PERFORMED_WORK = 1;
  const nameOf = (fiber) => {
    const type = fiber.tag === 14 ? fiber.type.type : fiber.type;
    return type?.displayName || type?.name || type?.render?.name || '?';
  };
  /** Seuls les sous-arbres qui portent `PerformedWork` sont parcourus : une branche sautée par
   *  React garde les drapeaux de son dernier rendu, qu'il ne faut pas compter. */
  const walk = (fiber) => {
    let rendered = 0;
    const stack = [fiber];
    while (stack.length) {
      const node = stack.pop();
      if (node.sibling && node !== fiber) stack.push(node.sibling);
      const component = [0, 11, 14, 15].includes(node.tag);
      if (component && node.flags & PERFORMED_WORK) {
        rendered++;
        const name = nameOf(node);
        B.names[name] = (B.names[name] ?? 0) + 1;
      }
      if (node.child && node.subtreeFlags & PERFORMED_WORK) stack.push(node.child);
    }
    return rendered;
  };
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    renderers: new Map(),
    supportsFiber: true,
    isDisabled: false,
    inject(renderer) {
      this.renderers.set(1, renderer);
      return 1;
    },
    checkDCE() {},
    onCommitFiberUnmount() {},
    onPostCommitFiberRoot() {},
    onScheduleFiberRoot() {},
    onCommitFiberRoot(_id, fiberRoot) {
      if (!B.on) return;
      const at = performance.now();
      const rendered = walk(fiberRoot.current);
      B.commits.push([at, fiberRoot.current.actualDuration ?? 0, rendered]);
    },
  };
  /** La carte, une fois montée : chaque tour de boucle et chaque rendu, chronométrés. */
  const watchMap = () => {
    const engine = window.mapEngine;
    if (!engine) return setTimeout(watchMap, 200);
    const renderer = engine.renderer;
    const gl = renderer.getContext();
    const timer = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    const pending = [];
    let current = null;
    const render = renderer.render.bind(renderer);
    renderer.render = (scene, camera) => {
      const record = { t: performance.now(), whole: renderer.shadowMap.needsUpdate, gpu: null };
      const query = timer && B.on ? gl.createQuery() : null;
      if (query) gl.beginQuery(timer.TIME_ELAPSED_EXT, query);
      render(scene, camera);
      if (query) {
        gl.endQuery(timer.TIME_ELAPSED_EXT);
        pending.push([query, record]);
      }
      record.calls = renderer.info.render.calls;
      record.triangles = renderer.info.render.triangles;
      if (B.on) B.renders.push(record);
      current = record;
    };
    const loop = engine.loop;
    engine.loop = () => {
      const start = performance.now();
      current = null;
      loop();
      if (current) current.loopMs = performance.now() - start;
    };
    const poll = () => {
      requestAnimationFrame(poll);
      if (!timer) return;
      const disjoint = gl.getParameter(timer.GPU_DISJOINT_EXT);
      for (let k = pending.length - 1; k >= 0; k--) {
        const [query, record] = pending[k];
        if (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) continue;
        if (!disjoint) record.gpu = gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6;
        gl.deleteQuery(query);
        pending.splice(k, 1);
      }
    };
    requestAnimationFrame(poll);
  };
  addEventListener('DOMContentLoaded', watchMap);
}

/** La carte au repos, une fois par passe : ce qu'elle dessine et à quelle taille. */
function mapStatic() {
  const engine = window.mapEngine;
  const renderer = engine.renderer;
  const gl = renderer.getContext();
  const bands = [...document.querySelectorAll('div')].filter((node) => {
    const filter = getComputedStyle(node).backdropFilter;
    return filter && filter !== 'none' && !/blur\(0(px)?\)/.test(filter);
  });
  return {
    pixelRatio: renderer.getPixelRatio(),
    buffer: `${renderer.domElement.width}×${renderer.domElement.height}`,
    pixels: renderer.domElement.width * renderer.domElement.height,
    msaa: gl.getParameter(gl.SAMPLES),
    shadowMap: engine.lamp.light.shadow.mapSize.x,
    shadowType: renderer.shadowMap.type,
    programs: renderer.info.programs.length,
    textures: renderer.info.memory.textures,
    geometries: renderer.info.memory.geometries,
    tiltShift: getComputedStyle(renderer.domElement.parentElement).getPropertyValue('--tilt-shift'),
    blurBands: bands.map((node) => getComputedStyle(node).backdropFilter),
  };
}

// --- le parcours --------------------------------------------------------------------------------
const quantile = (xs, q) => {
  const sorted = xs.filter(Number.isFinite).sort((a, b) => a - b);
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : null;
};
const median = (xs) => quantile(xs, 0.5);
const round = (x, digits = 1) => (x === null ? null : Math.round(x * 10 ** digits) / 10 ** digits);

async function play(profileName, pass) {
  const profile = PROFILES[profileName];
  const phone = profile.isMobile === true;
  const context = await browser.newContext(profile);
  const page = await context.newPage();
  page.on('pageerror', (error) => console.log(`[pageerror] ${error.message}`));
  await page.addInitScript(instrument);
  const cdp = await context.newCDPSession(page);
  await page.goto(`${origin}/connexion`);
  await page.getByLabel('nom de guerre').fill(accounts.a.nickname);
  await page.getByLabel('mot de passe').fill(accounts.a.password);
  await page.getByRole('button', { name: 'entrer' }).click();
  await page.waitForURL('**/accueil', { timeout: 15000 });
  await page.goto(`${origin}/plateau?season=${accounts.seasonId}`);
  const understood = page.getByRole('button', { name: /compris/i }).first();
  if (
    await understood.waitFor({ timeout: 8000 }).then(
      () => true,
      () => false,
    )
  )
    await understood.click();
  await page.waitForFunction(() => window.mapEngine !== undefined);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu });
  const gpu = gpuProcesses().find((pid) => !foreignGpu.has(pid));
  await page.waitForTimeout(8000);
  const { width, height } = profile.viewport;

  const results = {};
  const gesture = async (name, act, settle = 1200) => {
    await page.evaluate(() => {
      const B = window.__banc;
      Object.assign(B, { on: true, t0: performance.now(), firstInput: null });
      for (const key of ['frames', 'commits', 'longtasks', 'renders']) B[key] = [];
      B.names = {};
    });
    const profiled = cpu !== null && pass === 0 && cpu.test(name);
    if (profiled) {
      await cdp.send('Profiler.enable');
      await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
      await cdp.send('Profiler.start');
    }
    const gpuBefore = gpu ? cpuTimeMs(gpu) : 0;
    await act();
    await page.waitForTimeout(settle);
    const gpuAfter = gpu ? cpuTimeMs(gpu) : 0;
    if (profiled) {
      const { profile } = await cdp.send('Profiler.stop');
      const file = `${out}/${profileName}-${name.replace(/\W+/g, '-')}.cpuprofile`;
      writeFileSync(file, JSON.stringify(profile));
      console.log(`profil CPU « ${name} » → ${file}\n${hottest(profile)}`);
    }
    const raw = await page.evaluate(() => {
      const B = window.__banc;
      B.on = false;
      return { ...B, end: performance.now() };
    });
    results[name] = summarize(raw);
    results[name].gpuProcessMsPerS = round((gpuAfter - gpuBefore) / results[name].seconds, 0);
    if (photos && pass === 0)
      await page.screenshot({
        path: `${out}/photos/${profileName}-${name.replace(/\W+/g, '-')}.png`,
      });
  };
  const touch = (type, points) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: points.map(([x, y], id) => ({ x, y, id })),
    });
  /** Un ou deux doigts, de `from` à `to` (listes de points), en `ms`. */
  const fingers = async (from, to, ms = 900) => {
    await touch('touchStart', from);
    const steps = Math.round(ms / 16);
    for (let k = 1; k <= steps; k++) {
      const at = from.map(([x, y], i) => [
        x + ((to[i][0] - x) * k) / steps,
        y + ((to[i][1] - y) * k) / steps,
      ]);
      await touch('touchMove', at);
    }
    await touch('touchEnd', []);
  };
  const drag = async (button, from, to, ms = 900) => {
    await page.mouse.move(...from);
    await page.mouse.down({ button });
    await page.mouse.move(...to, { steps: Math.round(ms / 16) });
    await page.mouse.up({ button });
  };
  const tap = (locator) => (phone ? locator.tap() : locator.click());
  const close = async () => {
    const button = page.getByRole('button', { name: /^fermer$/i }).first();
    if (phone && (await button.isVisible().catch(() => false))) await button.tap();
    else await page.keyboard.press('Escape');
  };
  const link = (name) => page.getByRole('link', { name }).first();
  const button = (name) => page.getByRole('button', { name }).first();
  const menu = () => tap(button(/ouvrir le menu des surfaces/));

  // Le journal s'ouvre seul à l'arrivée quand des dépêches attendent : on part de la carte nue.
  for (let k = 0; k < 3; k++) {
    if (
      !(await page
        .getByRole('button', { name: /^fermer$/i })
        .first()
        .isVisible())
    )
      break;
    await close();
    await page.waitForTimeout(800);
  }

  // Les surfaces : au téléphone par le menu (ou la fiche de nation pour les réglages).
  const surfaces = phone
    ? [
        ['journal', menu, () => link(/^journal/i)],
        ['presse', menu, () => link(/^presse/i)],
        ['télégraphe', menu, () => link(/^télégraphe/i)],
        ['abaque', menu, () => link(/^abaque/i)],
        ['recherche', menu, () => link(/^recherche/i)],
        ['nation', menu, () => link(/^nation/i)],
        ['à faire', menu, () => button(/^à faire/i)],
        [
          'réglages',
          () => tap(button(/^France$/)),
          () => page.getByText('Réglages', { exact: true }),
        ],
      ]
    : [
        ['journal', null, () => link(/^Journal d’événements/)],
        ['presse', null, () => link(/^Presse/)],
        ['télégraphe', null, () => link(/^Télégraphe/)],
        ['abaque', null, () => link(/^Abaque de tir/)],
        ['recherche', null, () => button(/^recherche$/)],
        ['nation', null, () => link(/fiche de nation/)],
        ['réglages', null, () => link(/^Réglages$/)],
      ];
  if (phone) await gesture('menu des surfaces', menu).then(close);
  for (const [name, before, target] of surfaces) {
    if (before) {
      await before();
      await page.waitForTimeout(600);
    }
    await gesture(`ouvrir ${name}`, () => tap(target()));
    if (name === 'journal') {
      const box = await page.evaluate(() => {
        const scrollers = [...document.querySelectorAll('*')].filter((node) => {
          const style = getComputedStyle(node);
          const rect = node.getBoundingClientRect();
          const cx = rect.x + rect.width / 2;
          const cy = rect.y + rect.height / 2;
          return (
            /auto|scroll/.test(style.overflowY) &&
            node.scrollHeight > node.clientHeight + 20 &&
            cx > 0 &&
            cx < innerWidth &&
            cy > 0 &&
            cy < innerHeight &&
            node.contains(document.elementFromPoint(cx, cy))
          );
        });
        const largest = scrollers.sort((a, b) => b.clientHeight - a.clientHeight)[0];
        if (!largest) return null;
        const rect = largest.getBoundingClientRect();
        return {
          x: rect.x + rect.width / 2,
          y: rect.y + rect.height / 2,
          room: largest.scrollHeight - largest.clientHeight,
        };
      });
      if (!box) console.log('journal trop court pour défiler : geste non mesuré');
      else
        await gesture('défiler journal', async () => {
          for (const yDistance of [-600, 600])
            await cdp.send('Input.synthesizeScrollGesture', {
              x: Math.round(box.x),
              y: Math.round(box.y),
              yDistance,
              speed: 1200,
              gestureSourceType: phone ? 'touch' : 'mouse',
            });
        });
    }
    await gesture(`fermer ${name}`, close);
  }
  if (!phone) {
    const todo = button(/\d+ à faire$/);
    for (let k = 0; k < 2; k++) {
      const open = (await todo.getAttribute('aria-expanded')) === 'true';
      await gesture(open ? 'replier à faire' : 'déplier à faire', () => todo.click());
    }
  }

  // Le plateau personnel : la poignée, replié → mi-hauteur → plein → replié au téléphone.
  if (phone) {
    await gesture('plateau mi-hauteur', () => tap(button(/déplier le plateau personnel/)));
    await gesture('plateau plein', () => tap(button(/agrandir le plateau personnel/)));
    await gesture('plateau replié', () => tap(button(/replier le plateau personnel/)));
  } else {
    await gesture('plateau déplié', () => button(/^Plateau personnel$/).click());
    await gesture('plateau replié', () => button(/^Plateau personnel$/).click());
  }

  // La fiche d'un bâtiment : une pièce peut se tenir devant, on essaie les suivants.
  const sites = await page.evaluate(() => {
    const engine = window.mapEngine;
    const canvas = engine.renderer.domElement.getBoundingClientRect();
    return [...engine.maquettes.byId]
      .filter(([id]) => engine.maquettes.drawnAt(id) !== null)
      .map(([id, { item }]) => {
        const at = item.at.clone().project(engine.eye);
        const x = canvas.x + ((at.x + 1) / 2) * canvas.width;
        const y = canvas.y + ((1 - at.y) / 2) * canvas.height;
        return { id, x, y };
      })
      .filter(
        ({ x, y }) =>
          x > 40 && x < innerWidth - 40 && y > innerHeight * 0.2 && y < innerHeight * 0.65,
      );
  });
  let opened = false;
  for (const site of sites) {
    await gesture('ouvrir fiche bâtiment', () =>
      phone ? page.touchscreen.tap(site.x, site.y) : page.mouse.click(site.x, site.y),
    );
    opened = page.url().includes('building');
    if (opened) break;
    await close();
    await page.waitForTimeout(800);
  }
  if (opened) await gesture('fermer fiche bâtiment', close);
  else {
    delete results['ouvrir fiche bâtiment'];
    console.log('aucun bâtiment ouvert : fiche non mesurée');
  }

  // La carte : déplacer, zoomer, incliner, d'un point de mer en haut à gauche.
  const sea = [Math.round(width * 0.3), Math.round(height * 0.32)];
  const centre = [Math.round(width / 2), Math.round(height * 0.45)];
  const by = ([x, y], dx, dy) => [x + dx, y + dy];
  if (phone) {
    await gesture(
      'carte déplacer',
      async () => {
        for (let k = 0; k < 2; k++) {
          await fingers([sea], [by(sea, 120, 180)]);
          await fingers([by(sea, 120, 180)], [sea]);
        }
      },
      1700,
    );
    await gesture(
      'carte zoomer',
      async () => {
        const [x, y] = centre;
        await fingers(
          [
            [x - 30, y],
            [x + 30, y],
          ],
          [
            [x - 140, y],
            [x + 140, y],
          ],
        );
        await fingers(
          [
            [x - 140, y],
            [x + 140, y],
          ],
          [
            [x - 30, y],
            [x + 30, y],
          ],
        );
      },
      1700,
    );
    await gesture(
      'carte incliner',
      async () => {
        const [x, y] = centre;
        await fingers(
          [
            [x - 60, y],
            [x + 60, y],
          ],
          [
            [x - 60, y - 160],
            [x + 60, y - 160],
          ],
        );
        await fingers(
          [
            [x - 60, y - 160],
            [x + 60, y - 160],
          ],
          [
            [x - 60, y],
            [x + 60, y],
          ],
        );
      },
      1700,
    );
  } else {
    await gesture(
      'carte déplacer',
      async () => {
        for (let k = 0; k < 2; k++) {
          await drag('middle', sea, by(sea, 300, 200));
          await drag('middle', by(sea, 300, 200), sea);
        }
      },
      1700,
    );
    await gesture(
      'carte zoomer',
      async () => {
        await page.mouse.move(...centre);
        for (const dy of [...Array(10).fill(-120), ...Array(10).fill(120)]) {
          await page.mouse.wheel(0, dy);
          await page.waitForTimeout(60);
        }
      },
      1700,
    );
    await gesture(
      'carte incliner',
      async () => {
        await drag('left', sea, by(sea, 0, 160));
        await drag('left', by(sea, 0, 160), sea);
      },
      1700,
    );
  }
  const statics = await page.evaluate(mapStatic);
  await gesture('repos 10 s', () => page.waitForTimeout(10000), 0);
  await context.close();
  return { statics, results };
}

const BURST_MS = 150;

/** Les fonctions au plus grand temps propre d'un profil CPU, avec leur fichier et leur ligne. */
function hottest(profile, count = 15) {
  const self = new Map();
  const gaps = profile.timeDeltas;
  const byId = new Map(profile.nodes.map((node) => [node.id, node]));
  profile.samples.forEach((id, k) => {
    const { functionName, url, lineNumber } = byId.get(id).callFrame;
    const key = `${functionName || '(anonyme)'} ${url.split('/').pop()}:${lineNumber + 1}`;
    self.set(key, (self.get(key) ?? 0) + (gaps[k] ?? 0) / 1000);
  });
  return [...self]
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([key, ms]) => `  ${ms.toFixed(0).padStart(6)} ms  ${key}`)
    .join('\n');
}

/** Un geste relevé, réduit à ses chiffres. */
function summarize(raw) {
  const { frames, commits, longtasks, renders, names, t0, end, firstInput } = raw;
  const deltas = frames.slice(1).map((t, k) => t - frames[k]);
  const start = firstInput ?? t0;
  /** La salve du geste : les commits qui se suivent à moins de `BURST_MS` depuis l'entrée. Le
   *  battement d'une horloge, une seconde plus loin, n'en est pas. */
  let settled = start;
  for (const [at] of commits) if (at >= start && at - settled < BURST_MS) settled = at;
  const shown = frames.find((t) => t > settled);
  const seconds = (end - t0) / 1000;
  const whole = renders.filter((r) => r.whole);
  return {
    seconds: round(seconds, 2),
    frameMedianMs: round(median(deltas)),
    frameP95Ms: round(quantile(deltas, 0.95)),
    frameMaxMs: round(Math.max(0, ...deltas)),
    longTasks: longtasks.length,
    longTaskMs: round(
      longtasks.reduce((sum, [, ms]) => sum + ms, 0),
      0,
    ),
    latencyMs: shown === undefined ? null : round(shown - start, 0),
    commits: commits.length,
    rendered: commits.reduce((sum, [, , n]) => sum + n, 0),
    reactMs: round(commits.reduce((sum, [, ms]) => sum + ms, 0)),
    topComponents: Object.entries(names)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, n]) => `${name}×${n}`),
    mapFps: round(renders.length / seconds),
    mapWholeFps: round(whole.length / seconds),
    mapLoopMs: round(median(renders.map((r) => r.loopMs))),
    mapLoopP95Ms: round(
      quantile(
        renders.map((r) => r.loopMs),
        0.95,
      ),
    ),
    mapGpuMs: round(median(whole.map((r) => r.gpu)), 2),
    mapCalls: renders.length ? Math.max(...renders.map((r) => r.calls)) : null,
    mapTriangles: renders.length ? Math.max(...renders.map((r) => r.triangles)) : null,
  };
}

/** Les passes d'un profil, réduites à la médiane de chaque chiffre. */
function merge(runs) {
  const gestures = {};
  for (const name of Object.keys(runs[0].results)) {
    const each = runs.map((run) => run.results[name]).filter(Boolean);
    const merged = {};
    for (const key of Object.keys(each[0]))
      merged[key] = key === 'topComponents' ? each[0][key] : median(each.map((one) => one[key]));
    gestures[name] = merged;
  }
  return { statics: runs[0].statics, gestures };
}

const COLUMNS = [
  ['geste', 22],
  ['img méd', 7, 'frameMedianMs'],
  ['img p95', 7, 'frameP95Ms'],
  ['longues', 7, 'longTasks'],
  ['ms long', 7, 'longTaskMs'],
  ['délai', 6, 'latencyMs'],
  ['commits', 7, 'commits'],
  ['compos.', 7, 'rendered'],
  ['React ms', 8, 'reactMs'],
  ['carte/s', 7, 'mapFps'],
  ['JS carte', 8, 'mapLoopMs'],
  ['GPU ms', 6, 'mapGpuMs'],
  ['proc GPU', 8, 'gpuProcessMsPerS'],
  ['appels', 6, 'mapCalls'],
];
const table = (gestures) =>
  [
    COLUMNS.map(([title, w]) => title.padStart(w)).join(' '),
    ...Object.entries(gestures).map(([name, g]) =>
      COLUMNS.map(([, w, key], k) =>
        k === 0 ? name.padEnd(w) : String(g[key] ?? '–').padStart(w),
      ).join(' '),
    ),
  ].join('\n');

const report = {
  at: new Date().toISOString(),
  commit: execSync('git rev-parse --short HEAD', { cwd: root, encoding: 'utf8' }).trim(),
  seasonId: accounts.seasonId,
  passes,
  load,
  profiles: {},
};
let text = `Banc client — ${report.commit}, ${passes} passes, médianes\n`;
try {
  for (const name of only ? [only] : Object.keys(PROFILES)) {
    const runs = [];
    for (let k = 0; k < passes; k++) {
      console.log(`${name} : passe ${k + 1}/${passes}`);
      runs.push(await play(name, k));
    }
    const merged = merge(runs);
    report.profiles[name] = { ...merged, runs };
    const s = merged.statics;
    text += `\n== ${name} ==\ncarte : pixel ratio ${s.pixelRatio}, tampon ${s.buffer}, MSAA ${s.msaa}, ombres ${s.shadowMap}², ${s.programs} programmes, ${s.textures} textures, flou de bascule ${s.tiltShift} (${s.blurBands.length} bandes actives)\n${table(merged.gestures)}\n`;
  }
} finally {
  await browser.close();
  server.kill();
}
writeFileSync(`${out}/banc-client.json`, JSON.stringify(report, null, 2));
writeFileSync(`${out}/banc-client.txt`, text);
console.log(`\n${text}\n→ ${out}/banc-client.json`);
