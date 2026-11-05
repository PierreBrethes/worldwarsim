/**
 * **Le film de la une** (#469) : trente secondes du jeu tel qu'il se joue, muettes, en deux découpes
 * (`accueil-16x9.webm`, `accueil-9x16.webm`), les mêmes plans. Le script joue le jeu dans Chromium
 * et le filme en direct ; il écrit les temps de chaque plan dans `film-shots.json`, que la page lit,
 * et régénère les affiches de `public/film/` depuis le film.
 *
 *     PLAYWRIGHT_DIR=/dossier/hors/dépôt npm run film -- [--decoupe wide|tall] \
 *       [--blitz <saison>] [--edition </edition/id>] [--sortie dossier] [--sans-manifeste] [--sans-affiche]
 *
 * **Une démo fraîche par découpe** : le film prend des ordres et des prises que la démo ne rejoue pas.
 * **Trois parties de démo** (`npm run demo:mondiale`, base locale, dans cet ordre) — la dernière
 * lancée est celle que lit le fichier des comptes, les deux autres se passent en option :
 *   1. `--blitz` : l'identifiant de la saison s'imprime (« saison … »), il va à `--blitz` ;
 *   2. `--conclue points` : son lieu `edition` va à `--edition` ;
 *   3. `--moments --accrochages --guet` : la Mondiale, lue dans `demo-mondiale.accounts.json`.
 * Les films vont dans `public/media/` (ignoré par git, règle plan-4b : `deploiement/README.md`,
 * « Médias »), sauf `--sortie`. La machine est au calme : un seul Chromium, nul vérifieur, nul banc.
 *
 * **Pourquoi pas `recordVideo`** : il filme une seule page, et l'ffmpeg que Playwright met en cache
 * ne sait ni recoller deux fichiers ni retailler un film. Le film passe par cinq pages (la carte,
 * la pièce, deux points des Sept, l'édition, la Blitz) ; on écoute donc le `screencast` de la page
 * de chaque plan — ce que `recordVideo` fait en dessous — et on pose les images, à cadence fixe,
 * dans le même ffmpeg, qui les encode en VP8. Rien ne se télécharge.
 */
import { execFile, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../convex/_generated/api.js';
import { chromiumPath } from './chromium.mjs';

const run = promisify(execFile);
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at < 0 ? fallback : args[at + 1];
};
const root = fileURLToPath(new URL('../', import.meta.url));

const dir = process.env.PLAYWRIGHT_DIR;
if (!dir)
  throw new Error('PLAYWRIGHT_DIR absent : dossier hors dépôt où `npm i playwright-core@1.58`');
const { chromium } = createRequire(`${dir}/`)('playwright-core');

/** La page du dev : jamais un autre hôte que le nôtre. */
const ORIGIN = option('origine', 'http://localhost:5173');
if (!['localhost', '127.0.0.1'].includes(new URL(ORIGIN).hostname))
  throw new Error(`Refus : ${ORIGIN} n'est pas local.`);

const accounts = JSON.parse(
  readFileSync(new URL('./demo-mondiale.accounts.json', import.meta.url), 'utf8'),
);
const account = accounts.a;
const places = accounts.places;
/** Les sièges de la Mondiale de la démo : la France (a) et le Royaume-Uni (b). */
const seats = Object.fromEntries(
  execFileSync('npx', ['convex', 'data', 'players', '--limit', '200', '--format', 'jsonl'], {
    cwd: root,
    encoding: 'utf8',
  })
    .split('\n')
    .filter((line) => line.startsWith('{'))
    .map((line) => JSON.parse(line))
    .filter((row) => row.seasonId === accounts.seasonId)
    .map((row) => [row.nation, row._id]),
);
const BLITZ = option('blitz');

/**
 * **Les premiers pas, passés** : leur bulle (« Dépliez le plateau personnel ») est une leçon de la
 * première fois, qui n'a pas sa place dans un film. Le serveur la garde au compte, pas à la page.
 */
async function skipFirstSteps() {
  const env = Object.fromEntries(
    readFileSync(`${root}.env.local`, 'utf8')
      .split('\n')
      .map((line) => line.match(/^([A-Z_]+)=(.*)$/))
      .filter(Boolean)
      .map(([, key, value]) => [key, value.trim()]),
  );
  if (!['127.0.0.1', 'localhost'].includes(new URL(env.VITE_CONVEX_URL).hostname))
    throw new Error(`Refus : ${env.VITE_CONVEX_URL} n'est pas un backend local.`);
  const client = new ConvexHttpClient(env.VITE_CONVEX_URL);
  const { token } = await client.action(api.auth.login, {
    nickname: account.nickname,
    password: account.password,
  });
  for (const seasonId of [accounts.seasonId, BLITZ])
    await client
      .mutation(api.firstSteps.show, { token, seasonId, shown: 'skipped' })
      .catch((error) => console.log(`[premiers pas] ${seasonId} : ${String(error).slice(0, 80)}`));
  /** Deux connexions du même compte ne se suivent pas de moins de trois secondes (`LOGIN_TOO_FAST`). */
  await new Promise((done) => setTimeout(done, 3500));
}
const EDITION = option('edition');
if (!BLITZ || !EDITION)
  throw new Error("--blitz <saison> et --edition </edition/id> : voir l'en-tête");

/** Le plan : sa clé de sous-titre (`fr.film.subtitles`) et sa durée, en secondes. */
const SHOTS = [
  { subtitle: 'map', length: 4 },
  { subtitle: 'night', length: 3 },
  { subtitle: 'piece', length: 4 },
  { subtitle: 'order', length: 3 },
  { subtitle: 'seven', length: 4 },
  { subtitle: 'day', length: 3 },
  { subtitle: 'edition', length: 4 },
  { subtitle: 'blitz', length: 5 },
];
/** La boucle muette de la une : les quatre premiers plans, qui n'ont pas besoin du reste. */
const LOOP_SHOTS = 4;

/** Les découpes : taille CSS de la fenêtre et densité (780 × 1688 pour le téléphone, comme son affiche). */
const CUTS = {
  wide: { width: 1440, height: 900, density: 1, file: 'accueil-16x9.webm', kbps: 950 },
  tall: { width: 390, height: 844, density: 2, file: 'accueil-9x16.webm', kbps: 950 },
};
const FPS = 25;
/** Le poids qu'une découpe ne dépasse pas. */
const MAX_BYTES = 4 * 1024 * 1024;

const ffmpeg = (() => {
  const cache = `${homedir()}/Library/Caches/ms-playwright`;
  const found = existsSync(cache)
    ? readdirSync(cache).filter((name) => name.startsWith('ffmpeg-'))
    : [];
  const path = found.map((name) => `${cache}/${name}/ffmpeg-mac`).find((one) => existsSync(one));
  if (!path) throw new Error('ffmpeg de Playwright absent de ~/Library/Caches/ms-playwright');
  return path;
})();

/* ------------------------------------------------------------------ la pellicule */

/**
 * Les images de la page « au plan », posées à cadence fixe dans un ffmpeg qui encode en VP8. Un
 * écran qui ne change pas n'envoie rien : on repose la dernière image reçue.
 */
class Reel {
  constructor(context, cut, out) {
    this.context = context;
    this.cut = cut;
    this.out = out;
    this.frame = null;
    this.written = 0;
    this.limit = Infinity;
    this.screen = null;
  }

  /** Les images vont dans un fichier : l'encodage se fait après, sans la cadence du direct. */
  start() {
    this.raw = createWriteStream(`${this.out}.mjpeg`);
    this.begun = Date.now();
    this.timer = setInterval(() => this.tick(), 8);
  }

  tick() {
    if (this.frame === null) return;
    const due = Math.min(Math.floor(((Date.now() - this.begun) * FPS) / 1000), this.limit);
    while (this.written < due) {
      this.raw.write(this.frame);
      this.written += 1;
    }
  }

  /**
   * Écoute `page` avant son plan : le `screencast` n'envoie une image que quand l'écran change, on
   * lui en fait donc dessiner une, et le plan commence sur elle plutôt que sur celle d'avant.
   */
  async prime(page) {
    const cdp = await this.context.newCDPSession(page);
    const slot = { cdp, frame: null, live: false };
    cdp.on('Page.screencastFrame', ({ data, sessionId }) => {
      slot.frame = Buffer.from(data, 'base64');
      if (slot.live) this.frame = slot.frame;
      cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
    });
    await cdp.send('Page.startScreencast', {
      format: 'jpeg',
      quality: 92,
      maxWidth: this.cut.width * this.cut.density,
      maxHeight: this.cut.height * this.cut.density,
    });
    await page.evaluate(() => {
      globalThis.mapEngine?.invalidate();
      globalThis.document.body.style.opacity =
        globalThis.document.body.style.opacity === '0.999' ? '1' : '0.999';
    });
    const until = Date.now() + 1500;
    while (slot.frame === null && Date.now() < until)
      await new Promise((done) => setTimeout(done, 20));
    this.next = slot;
  }

  /** Le plan passe à la page amorcée : la précédente se tait. */
  async switchTo() {
    const slot = this.next;
    if (this.screen) {
      this.screen.cdp.removeAllListeners('Page.screencastFrame');
      await this.screen.cdp.send('Page.stopScreencast').catch(() => {});
    }
    slot.live = true;
    if (slot.frame) this.frame = slot.frame;
    this.screen = slot;
  }

  async stop() {
    clearInterval(this.timer);
    this.tick();
    await new Promise((done) => this.raw.end(done));
    /** Deux passes : VP8 règle son débit sur tout le film, pas image à image. */
    const rate = [
      '-b:v',
      `${this.cut.kbps}k`,
      '-c:v',
      'libvpx',
      '-g',
      String(FPS * 2),
      '-auto-alt-ref',
      '0',
      '-cpu-used',
      '2',
      '-an',
    ];
    const input = [
      '-y',
      '-loglevel',
      'error',
      '-f',
      'image2pipe',
      '-framerate',
      String(FPS),
      '-c:v',
      'mjpeg',
      '-i',
      `${this.out}.mjpeg`,
    ];
    const log = `${this.out}.pass`;
    await run(ffmpeg, [
      ...input,
      ...rate,
      '-pass',
      '1',
      '-passlogfile',
      log,
      '-f',
      'webm',
      '/dev/null',
    ]);
    await run(ffmpeg, [...input, ...rate, '-pass', '2', '-passlogfile', log, this.out]);
    rmSync(`${this.out}.mjpeg`);
    for (const name of readdirSync(dirname(this.out)))
      if (name.startsWith(`${basename(this.out)}.pass`)) rmSync(`${dirname(this.out)}/${name}`);
  }
}

/* ------------------------------------------------------------------ le jeu */

/** L'appareil du plan : caméra, soleil, installé dans la page (`mapEngine` n'existe qu'en dev). */
function installRig() {
  const engine = () => globalThis.mapEngine;
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
  const rad = Math.PI / 180;
  const here = () => {
    const e = engine();
    const target = e.controls.target.clone();
    const away = e.camera.position.clone().sub(target);
    const d = away.length();
    return { target, d, p: Math.acos(away.y / d) / rad, a: Math.atan2(away.x, away.z) / rad };
  };
  const aim = (e, spec) => {
    const target = e.frame.projectLonLat([spec.lon, spec.lat], 0);
    return { target, d: spec.d, p: spec.p, a: spec.a ?? 0 };
  };
  const put = (e, s) => {
    e.controls.target.copy(s.target);
    e.camera.position.set(
      s.target.x + s.d * Math.sin(s.p * rad) * Math.sin(s.a * rad),
      s.d * Math.cos(s.p * rad),
      s.target.z + s.d * Math.sin(s.p * rad) * Math.cos(s.a * rad),
    );
    e.controls.update();
    e.invalidate();
  };
  const sunAt = (e, ms) => {
    if (ms !== undefined) e.forcedInstant = ms;
  };
  const rig = (globalThis.__rig = {
    /** Chaque geste de caméra en annule un autre encore en vol. */
    gen: 0,
    /** Pose l'œil d'un coup. */
    frame(spec, sun) {
      rig.gen += 1;
      const e = engine();
      sunAt(e, sun);
      put(e, aim(e, spec));
    },
    /** Mène l'œil de là où il est à `spec` en `ms`, et le soleil de `sun[0]` à `sun[1]`. */
    fly(spec, ms, sun) {
      const e = engine();
      const mine = ++rig.gen;
      const from = here();
      const to = aim(e, spec);
      const begun = performance.now();
      const step = () => {
        if (rig.gen !== mine) return;
        const k = Math.min(1, (performance.now() - begun) / ms);
        const t = ease(k);
        put(e, {
          target: from.target.clone().lerp(to.target, t),
          d: from.d + (to.d - from.d) * t,
          p: from.p + (to.p - from.p) * t,
          a: from.a + (to.a - from.a) * t,
        });
        if (sun) sunAt(e, sun[0] + (sun[1] - sun[0]) * k);
        if (k < 1) globalThis.requestAnimationFrame(step);
      };
      step();
    },
    screenOf: (lonLat) => engine().screenOf(lonLat),
  });
}

/**
 * Une page du jeu, chargée, la liste « à faire » repliée, l'œil posé où le plan l'attend (`eye` :
 * { spec, sun }) ; `map: false` pour une page sans carte (l'édition). Si la vue ne vient pas (`liaison interrompue`, le serveur local chargé), on
 * recharge : une vue en panne ne se relit qu'au prochain changement, le film n'attendrait pas.
 */
async function openPage(context, path, { fold = true, map = true, eye } = {}, again = null) {
  const page = again ?? (await context.newPage());
  for (let attempt = 0; attempt < 4; attempt++) {
    await page.goto(`${ORIGIN}${path}`);
    /** La notice d'entrée d'une place neuve, s'il y en a une. */
    const understood = page.getByRole('button', { name: /compris/i }).first();
    if (
      await understood.waitFor({ timeout: 1200 }).then(
        () => true,
        () => false,
      )
    )
      await understood.click();
    if (map)
      await page
        .waitForFunction(() => globalThis.mapEngine !== undefined, null, { timeout: 20000 })
        .catch(() => {});
    await page.waitForTimeout(2500);
    const down = await page.getByText('liaison interrompue').count();
    if (down === 0) break;
    console.log(`[liaison] ${path.slice(0, 30)} : rechargée (${attempt + 1})`);
  }
  /** Le film se tourne la liste « à faire » repliée. */
  if (fold)
    await page
      .getByRole('button', { name: /replier/i })
      .first()
      .click()
      .catch(() => {});
  /** Une alerte non lue ouvre le journal à l'arrivée : le film ne le montre pas. */
  if (page.url().includes('windows='))
    await page
      .getByRole('button', { name: /^fermer$/i })
      .first()
      .click()
      .catch(() => {});
  /** La puce d'un pays hors cadre (« Nordrhein-Westfalen › ») est un guide du joueur, pas du film. */
  await page
    .addStyleTag({ content: '.destination-anchor{display:none!important}' })
    .catch(() => {});
  await page.evaluate(installRig).catch(() => {});
  if (eye)
    await page.evaluate(([spec, sun]) => globalThis.__rig.frame(spec, sun), [eye.spec, eye.sun]);
  await page.waitForTimeout(1200);
  return page;
}

/** Midi UTC du jour, plus `hours` heures : le soleil tenu où l'on veut. */
const sunMs = (hours) =>
  Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`) + hours * 3_600_000;

async function shoot(name) {
  const cutting = CUTS[name];
  const outDir = option('sortie', `${root}public/media`);
  mkdirSync(outDir, { recursive: true });
  const out = `${outDir}/${cutting.file}`;
  const browser = await chromium.launch({
    executablePath: chromiumPath(),
    args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal'],
  });
  const context = await browser.newContext({
    viewport: { width: cutting.width, height: cutting.height },
    deviceScaleFactor: cutting.density,
    /** Le téléphone se touche : sa pièce se lève du doigt (« lever le doigt pour ordonner »). */
    isMobile: name === 'tall',
    hasTouch: name === 'tall',
  });
  /** Ni l'indice des gestes ni la notice d'entrée : ce sont des leçons de la première fois. */
  await context.addInitScript(() => {
    localStorage.setItem('wws-gesture-hint', 'seen');
    localStorage.setItem('wws-briefing', 'seen');
    /**
     * « liaison interrompue » : cinq pages du même joueur sur un serveur local chargé coupent un
     * instant la ligne, et la carte le dit. Ce n'est pas le jeu qu'on montre : on masque l'avis (sans
     * le retirer : React en tient le nœud).
     */
    new globalThis.MutationObserver(() => {
      for (const node of globalThis.document.querySelectorAll('[role="status"]'))
        if (node.textContent.startsWith('liaison interrompue')) node.style.display = 'none';
    }).observe(globalThis.document, { childList: true, subtree: true });
  });
  const login = await context.newPage();
  await login.goto(`${ORIGIN}/connexion`);
  await login.getByLabel('nom de guerre').fill(account.nickname);
  await login.getByLabel('mot de passe').fill(account.password);
  await login.getByRole('button', { name: 'entrer' }).click();
  await login.waitForURL('**/accueil', { timeout: 15000 });
  await login.close();

  const forced = `heure=${encodeURIComponent(new Date(sunMs(12)).toISOString())}`;
  const mondiale = `/plateau?season=${accounts.seasonId}&${forced}`;
  const tall = name === 'tall';

  // Où l'œil se pose à chaque plan (degrés ; `d` en unités de la carte, 60 = l'Europe entière).
  const europe = { lon: 9, lat: 50.5, d: tall ? 80 : 58, p: 44 };
  const pile = [6.17, 49.36]; // la pile française devant Luxembourg
  const drop = [7.0, 50.9]; // un sol vide au nord-est : Cologne
  const around = { lon: 6.6, lat: 50.1, d: tall ? 20 : 14, p: 40 };
  const narvik = places.narvik;
  const tanger = places.tanger;

  /**
   * Trois pages ouvertes avant la première image, les deux autres à l'approche de leur plan : cinq
   * vues du même joueur à la fois font tomber le serveur local, et la carte dit alors « liaison
   * interrompue ».
   */
  const front = await openPage(context, mondiale, { eye: { spec: europe, sun: sunMs(12) } });
  const piece = await openPage(context, mondiale, { eye: { spec: around, sun: sunMs(12) } });
  const seven = await openPage(context, mondiale, {
    eye: {
      spec: { lon: narvik[0], lat: narvik[1], d: tall ? 3.6 : 3, p: 50, a: 0 },
      sun: sunMs(11),
    },
  });
  console.log('[prépa] front, piece, seven');
  const reel = new Reel(context, cutting, out);
  const starts = [];
  let clock = 0;
  for (const shot of SHOTS) {
    starts.push(clock);
    clock += shot.length;
  }
  const length = clock;
  reel.limit = length * FPS;
  const wait = (seconds) =>
    new Promise((done) =>
      setTimeout(
        () => {
          console.log(`t=${seconds} (réel ${((Date.now() - reel.begun) / 1000).toFixed(1)})`);
          done();
        },
        Math.max(0, reel.begun + seconds * 1000 - Date.now()),
      ),
    );
  const [mapAt, nightAt, pieceAt, orderAt, sevenAt, dayAt, editionAt, blitzAt] = starts;

  /** Les prises de la démo, lancées sans bloquer la pellicule : Narvik contesté, Tanger qui tombe. */
  const convex = (fn, payload) =>
    run('npx', ['convex', 'run', `dev:${fn}`, JSON.stringify(payload)], { cwd: root }).then(
      () =>
        console.log(
          `[${fn}] ${payload.point} : posée à t=${((Date.now() - reel.begun) / 1000).toFixed(1)}`,
        ),
      (error) => console.log(`[${fn}] ${error.message}`),
    );

  await reel.prime(front);
  await reel.switchTo();
  reel.start();

  /**
   * Chaque plan est un travail à son heure, que rien ne retarde : le film ne dure pas plus que ses
   * trente secondes parce qu'un clic a mis du temps à rendre la main. Un travail qui échoue le dit,
   * et son plan reste ce que la page montrait.
   */
  const tasks = [];
  const at = (seconds, job) =>
    tasks.push(
      wait(seconds)
        .then(job)
        .catch((error) =>
          console.log(`[plan à ${seconds}] ${String(error.message ?? error).slice(0, 120)}`),
        ),
    );
  const sinceFilm = () => (Date.now() - reel.begun) / 1000;
  /** Un plan : la page s'amorce une seconde avant, la pellicule y passe à l'heure, la précédente se ferme. */
  const cutTo = (seconds, opening, previous) => {
    at(seconds - 1.2, async () => reel.prime(await opening));
    at(seconds, async () => {
      await reel.switchTo();
      void Promise.resolve(previous).then((page) => page?.close());
    });
  };

  const editionOpen = wait(editionAt - 13).then(() =>
    openPage(context, `${EDITION}?${forced}`, { fold: false, map: false }),
  );
  const blitzOpen = wait(blitzAt - 11).then(() =>
    openPage(context, `/plateau?season=${BLITZ}&${forced}`, {
      fold: false,
      eye: { spec: { lon: 22, lat: 38, d: tall ? 120 : 85, p: 48 }, sun: sunMs(12) },
    }),
  );
  // La Mondiale de la démo est jouée par la France ; le Royaume-Uni (b) prend Narvik, la France Tanger.
  void convex('captureSoon', { playerId: seats.uk, point: 'narvik', inSeconds: length + 30 });
  void convex('captureSoon', { playerId: seats.france, point: 'tangier', inSeconds: dayAt - 2.5 });

  // 1. La carte du monde réel : l'Europe de haut, au jour, la caméra descend vers la Manche.
  at(mapAt, () =>
    front.evaluate(
      ([spec]) => globalThis.__rig.fly(spec, 4200),
      [{ lon: 3.5, lat: 50.2, d: tall ? 50 : 36, p: 54 }],
    ),
  );

  // 2. La nuit tombe : le soleil passe, les villes s'allument.
  at(nightAt, () =>
    front.evaluate(
      ([spec, a, b]) => globalThis.__rig.fly(spec, 3000, [a, b]),
      [{ lon: 3, lat: 50.4, d: tall ? 44 : 30, p: 57 }, sunMs(16.2), sunMs(19.6)],
    ),
  );

  // 3. Pièce en main : on lève la pile et on la porte jusqu'au sol visé, sans la poser.
  cutTo(pieceAt, piece, null);
  at(pieceAt + 0.1, async () => {
    const grab = await piece.evaluate((lonLat) => globalThis.__rig.screenOf(lonLat), pile);
    const to = await piece.evaluate((lonLat) => globalThis.__rig.screenOf(lonLat), drop);
    await piece.mouse.move(grab.x, grab.y);
    await wait(pieceAt + 0.6);
    await piece.mouse.down();
    /** Le geste suit l'horloge du film, pas un compte de pas : sous charge, il garde son temps. */
    for (let k = 0; k < 1;) {
      k = Math.min(1, (sinceFilm() - (pieceAt + 0.6)) / (orderAt - 0.4 - (pieceAt + 0.6)));
      await piece.mouse.move(grab.x + (to.x - grab.x) * k, grab.y + (to.y - grab.y) * k);
      await piece.waitForTimeout(16);
    }
  });

  // 4. L'ordre part : on lâche ; le fil et l'heure d'arrivée s'écrivent, la caméra recule.
  at(orderAt, async () => {
    await piece.mouse.up();
    await piece.evaluate(
      ([spec]) => globalThis.__rig.fly(spec, 3000),
      [{ lon: 6.8, lat: 50.1, d: tall ? 26 : 19, p: 44 }],
    );
  });

  // 5. Les Sept : Narvik contesté, une prise est en cours.
  cutTo(sevenAt, seven, piece);

  // 6. Vingt-quatre heures : Tanger, de nuit, vient de tomber ; l'anneau compte.
  /**
   * Les étiquettes (la bulle, l'anneau) ne se posent qu'au repos de la caméra : Narvik et Tanger
   * sont cadrés une fois pour toutes, à trois unités du point, sur deux pages qui attendent leur
   * plan. Tanger prend la page de l'ouverture, libre depuis qu'elle a cédé la place à la pièce.
   */
  const tangerEye = {
    spec: { lon: tanger[0], lat: tanger[1], d: tall ? 3.6 : 3, p: 50, a: 0 },
    sun: sunMs(21.5),
  };
  const narvikEye = {
    spec: { lon: narvik[0], lat: narvik[1], d: tall ? 3.6 : 3, p: 50, a: 0 },
    sun: sunMs(11),
  };
  /**
   * La ligne d'une page qui attend peut tomber (le serveur local, chargé par le film) : la vue
   * reste alors celle d'avant, sans prise ni anneau. On le revoit juste avant son plan, et la page
   * se recharge cadrée si c'est le cas.
   */
  const revive = async (page, eye) => {
    if ((await page.getByText('liaison interrompue').count()) === 0) return;
    console.log('[liaison] page rechargée avant son plan');
    await openPage(context, mondiale, { eye }, page);
  };
  at(8, async () => {
    await front.evaluate(
      ([spec, sun]) => globalThis.__rig.frame(spec, sun),
      [tangerEye.spec, tangerEye.sun],
    );
    await revive(front, tangerEye);
  });
  at(9, () => revive(seven, narvikEye));
  cutTo(dayAt, front, seven);

  // 7. L'édition finale : la une, puis la carte de la fin ; la page défile lentement.
  cutTo(editionAt, editionOpen, front);
  at(editionAt + 0.1, async () => {
    const edition = await editionOpen;
    const scrollTotal = tall ? 520 : 380;
    await edition.mouse.move(cutting.width / 2, cutting.height * 0.55);
    for (let done = 0, k = 0; k < 1;) {
      k = Math.min(1, (sinceFilm() - editionAt) / (SHOTS[6].length - 0.3));
      await edition.mouse.wheel(0, scrollTotal * k - done);
      done = scrollTotal * k;
      await edition.waitForTimeout(40);
    }
  });

  // 8. La Blitz : le théâtre sous le chronomètre, la caméra y descend.
  cutTo(blitzAt, blitzOpen, editionOpen);
  at(blitzAt, async () => {
    const blitz = await blitzOpen;
    await blitz.evaluate(
      ([spec]) => globalThis.__rig.fly(spec, 4800),
      [{ lon: 24, lat: 37.6, d: tall ? 44 : 30, p: 52, a: 6 }],
    );
  });

  await wait(length);
  await Promise.allSettled(tasks);
  await reel.stop();
  await browser.close();

  const bytes = statSync(out).size;
  console.log(
    `film ${name} : ${out} — ${(bytes / 1024 / 1024).toFixed(2)} Mo, ${reel.written} images`,
  );
  if (bytes > MAX_BYTES)
    console.log(`[poids] ${name} dépasse ${MAX_BYTES / 1024 / 1024} Mo : baisser kbps`);
  return { out, starts, length, bytes };
}

/* ------------------------------------------------------------------ le manifeste et les affiches */

/**
 * L'affiche d'une découpe, son premier instant : l'image que la une montre avant que le film
 * joue, et qu'il prolonge sans saut. Prise dans le film (ffmpeg), passée en WebP par un canvas.
 */
async function poster(name, file) {
  const png = `${file}.affiche.png`;
  await run(ffmpeg, ['-y', '-loglevel', 'error', '-ss', '0.1', '-i', file, '-frames:v', '1', png]);
  const browser = await chromium.launch({ executablePath: chromiumPath() });
  const page = await browser.newPage();
  const webp = await page.evaluate(async (b64) => {
    const img = new globalThis.Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const canvas = globalThis.document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    canvas.getContext('2d').drawImage(img, 0, 0);
    return canvas.toDataURL('image/webp', 0.85).split(',')[1];
  }, readFileSync(png).toString('base64'));
  await browser.close();
  rmSync(png);
  const target = `${root}public/film/accueil-affiche-${name === 'wide' ? '16x9' : '9x16'}.webp`;
  writeFileSync(target, Buffer.from(webp, 'base64'));
  console.log(`affiche : ${target}`);
}

await skipFirstSteps();
const wanted = option('decoupe') ? [option('decoupe')] : ['wide', 'tall'];
let last = null;
for (const name of wanted) {
  last = { name, ...(await shoot(name)) };
  if (!args.includes('--sans-affiche')) await poster(name, last.out);
}

if (!args.includes('--sans-manifeste') && last) {
  const shots = SHOTS.map((shot, k) => ({
    start: last.starts[k],
    end: last.starts[k] + shot.length,
    subtitle: shot.subtitle,
  }));
  const loop = { from: 0, to: last.starts[LOOP_SHOTS] };
  writeFileSync(
    `${root}src/routes/-index/film-shots.json`,
    `${JSON.stringify({ shots, loop }, null, 2)}\n`,
  );
  console.log(`manifeste : ${shots.length} plans, boucle ${loop.from}–${loop.to} s`);
}
