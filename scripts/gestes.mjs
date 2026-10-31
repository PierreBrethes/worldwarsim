/**
 * **La suite des gestes** (#353) : chaque geste du joueur, joué au bureau puis au doigt sur une
 * démo neuve, et l'état qui le suit affirmé des deux côtés — le serveur (`api.view.playerView`)
 * et l'écran (un nœud du DOM ou l'état du moteur).
 *
 *     PLAYWRIGHT_DIR=/chemin/pw npm run gestes -- [--profil bureau|telephone] [--heure instant]
 *       [--sortie dossier] [--seul motif]
 *
 * Prérequis de `npm run capture` : Docker levé, fonctions déployées, `npm run dev` sur :5173. La
 * suite fonde elle-même sa démo, une par profil (`demo-mondiale.mjs --pile-mixte --deux-camions
 * --passagers`), et ne tourne pas dans `npm run verifier` : la CI n'a ni backend ni démo. Un geste qui échoue
 * laisse sa capture dans `--sortie` ; le code de sortie dit s'il en reste un.
 *
 * La souris porte du bouton premier : le moteur ne lève une pièce que de lui, quel que soit le
 * réglage des boutons (`armCarry`), et aucun geste de la liste ne passe par la rose.
 */
/* global document, innerWidth, innerHeight -- les fonctions passées à `page.evaluate` tournent dans la page. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../convex/_generated/api.js';
import { hourOf } from './capture-cible.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at < 0 ? fallback : args[at + 1];
};
const root = fileURLToPath(new URL('..', import.meta.url));
const out = option('sortie', `${tmpdir()}/gestes`);
mkdirSync(out, { recursive: true });
const heure = hourOf(option('heure'));
const only = option('seul', null) === null ? null : new RegExp(option('seul'), 'i');
const profiles = option('profil', null) === null ? ['bureau', 'telephone'] : [option('profil')];

const dir = process.env.PLAYWRIGHT_DIR;
if (!dir)
  throw new Error('PLAYWRIGHT_DIR absent : dossier hors dépôt où `npm i playwright-core@1.58`');
const { chromium } = createRequire(`${dir}/`)('playwright-core');
const cache = `${homedir()}/Library/Caches/ms-playwright/chromium-1243`;
const app = 'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const executablePath = existsSync(`${cache}/chrome-mac-arm64/${app}`)
  ? `${cache}/chrome-mac-arm64/${app}`
  : `${cache}/chrome-mac/${app}`;

const env = Object.fromEntries(
  (existsSync(`${root}.env.local`) ? readFileSync(`${root}.env.local`, 'utf8') : '')
    .split('\n')
    .map((line) => line.match(/^([A-Z_]+)=(.*)$/))
    .filter(Boolean)
    .map(([, key, value]) => [key, value.trim()]),
);
/** Le backend de la démo, lu comme elle le lit : le mot de passe du compte `a` n'en part pas. */
const backend = process.env.VITE_CONVEX_URL ?? env.VITE_CONVEX_URL;
if (!backend) throw new Error('VITE_CONVEX_URL absent (.env.local)');
if (!['127.0.0.1', 'localhost'].includes(new URL(backend).hostname))
  throw new Error(`Refus : ${backend} n'est pas un backend local.`);
const client = new ConvexHttpClient(backend);
const origin = 'http://localhost:5173';
const accountsFile = `${root}scripts/demo-mondiale.accounts.json`;

/** Une démo neuve : chaque profil part du même état. */
function freshDemo() {
  execFileSync(
    'node',
    ['scripts/demo-mondiale.mjs', '--pile-mixte', '--deux-camions', '--passagers'],
    {
      cwd: root,
      stdio: ['ignore', 'ignore', 'inherit'],
    },
  );
  return JSON.parse(readFileSync(accountsFile, 'utf8'));
}

/** Attend que le serveur dise ce que le geste promet. */
async function serverSays(seat, what, check) {
  const deadline = Date.now() + 8000;
  for (;;) {
    const view = await client.query(api.view.playerView, seat);
    const said = check(view);
    if (said) return said;
    if (Date.now() > deadline) assert.fail(`serveur : ${what}`);
    await new Promise((done) => setTimeout(done, 300));
  }
}

async function runProfile(profile) {
  const phone = profile === 'telephone';
  const accounts = freshDemo();
  // La démo vient de connecter ses comptes : une tentative toutes les trois secondes.
  await new Promise((done) => setTimeout(done, 3500));
  const { token } = await client.action(api.auth.login, accounts.a);
  const seat = { token, seasonId: accounts.seasonId };
  const start = await client.query(api.view.playerView, seat);

  const browser = await chromium.launch({
    executablePath,
    args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal'],
  });
  try {
    const page = await browser.newPage(
      phone
        ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }
        : { viewport: { width: 1440, height: 900 } },
    );
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    // La session posée d'avance : la page de connexion n'admet qu'une tentative toutes les 3 s.
    await page.addInitScript((token) => localStorage.setItem('wws-session', token), token);
    await page.goto(
      `${origin}/plateau?season=${accounts.seasonId}&heure=${encodeURIComponent(heure)}`,
    );
    await page.waitForFunction(() => globalThis.mapEngine, null, { timeout: 20000 });
    await page.waitForTimeout(4000);

    const cdp = await page.context().newCDPSession(page);
    const touch = (type, points) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: points.map(([x, y], id) => ({ x, y, id })),
      });
    /** Un doigt (ou deux) par points CDP, comme le banc : de `from` à `to`, en `ms`. */
    const fingers = async (from, to, ms = 600) => {
      const steps = Math.max(2, Math.round(ms / 16));
      for (let k = 1; k <= steps; k++)
        await touch(
          'touchMove',
          from.map(([x, y], i) => [
            x + ((to[i][0] - x) * k) / steps,
            y + ((to[i][1] - y) * k) / steps,
          ]),
        );
    };
    /**
     * **Une main qui prend en `from` et lâche en `to`** : le bouton premier de la souris (le moteur
     * ne porte que de lui, quel que soit le réglage), ou un doigt. `hold` : l'appui tenu immobile
     * avant de bouger (un doigt sur la carte porte après un appui long, une souris détache une
     * pièce de son escouade).
     */
    const carry = async (from, to, { hold = 0, rise = true } = {}) => {
      if (phone) {
        await touch('touchStart', [from]);
        await page.waitForTimeout(hold);
        const lifted = rise ? [from[0], from[1] - 40] : from;
        await fingers([from], [lifted], 120);
        await fingers([lifted], [to]);
        await page.waitForTimeout(200);
        await touch('touchEnd', []);
        return;
      }
      await page.mouse.move(...from);
      await page.mouse.down();
      await page.waitForTimeout(hold);
      if (rise) await page.mouse.move(from[0], from[1] - 40, { steps: 6 });
      await page.mouse.move(...to, { steps: 20 });
      await page.waitForTimeout(200);
      await page.mouse.up();
    };
    const tap = (locator) => (phone ? locator.tap() : locator.click());
    const centreOf = async (locator) => {
      const box = await locator.boundingBox();
      assert.ok(box, 'nœud hors de l’écran');
      return [box.x + box.width / 2, box.y + box.height / 2];
    };
    /** Cadre la carte sur un point, à `distance`, et laisse les figurines se dresser. */
    const frame = async (lonLat, distance) => {
      await page.evaluate(
        ([lonLat, d]) => {
          const engine = globalThis.mapEngine;
          const target = engine.frame.projectLonLat(lonLat, 0);
          const away = engine.camera.position.clone().sub(engine.controls.target).normalize();
          engine.controls.target.copy(target);
          engine.camera.position.copy(target).addScaledVector(away, d);
          engine.controls.update();
          engine.invalidate();
        },
        [lonLat, distance],
      );
      await page.waitForTimeout(2500);
    };
    /** Le point de l'écran où le moteur trouve cette maquette, et non une pièce devant. */
    const maquettePoint = (id) =>
      page.evaluate((id) => {
        const engine = globalThis.mapEngine;
        for (let y = innerHeight * 0.2; y < innerHeight * 0.75; y += 6)
          for (let x = innerWidth * 0.15; x < innerWidth * 0.85; x += 6)
            if (engine.maquetteAtPoint(x, y) === id) return [x, y];
        return null;
      }, id);
    /** Les pièces dessinées d'une pile, et où chacune tombe à l'écran (sur la carte, à nu). */
    const piecesOf = (pileId) =>
      page.evaluate((pileId) => {
        const engine = globalThis.mapEngine;
        const canvas = engine.renderer.domElement;
        const box = canvas.getBoundingClientRect();
        const entry = engine.standing.dressed.get(pileId);
        return (entry?.pieces.groups ?? []).map((group, k) => {
          const drawn = engine.standing.pieceOf(`${pileId}/${k}`)?.box;
          const at = drawn?.getCenter(drawn.min.clone()).project(engine.camera);
          const x = at && box.left + ((at.x + 1) / 2) * box.width;
          const y = at && box.top + ((1 - at.y) / 2) * box.height;
          const bare = at !== undefined && document.elementFromPoint(x, y) === canvas;
          return { role: group.role, aboard: group.aboard ?? 0, at: bare ? [x, y] : null };
        });
      }, pileId);
    /** La poignée du plateau personnel : au doigt son nom dit l'état suivant (déplier, agrandir,
     *  replier), à la souris `aria-expanded` dit s'il est déplié. */
    const boardHandle = () =>
      page
        .getByRole('button', { name: phone ? /le plateau personnel$/ : /^Plateau personnel/ })
        .first();
    const boardOpen = async () =>
      phone
        ? !/^déplier/.test((await boardHandle().getAttribute('aria-label')) ?? '')
        : (await boardHandle().getAttribute('aria-expanded')) === 'true';
    /** Déplie ou replie le plateau, d'où qu'il parte (un lâcher le replie parfois de lui-même). */
    const board = async (open) => {
      for (let k = 0; k < 3 && (await boardOpen()) !== open; k++) {
        await tap(boardHandle());
        await page.waitForTimeout(700);
      }
      assert.equal(
        await boardOpen(),
        open,
        `écran : le plateau ne se ${open ? 'déplie' : 'replie'} pas`,
      );
    };
    const openBoard = () => board(true);
    const closeBoard = () => board(false);

    const gestures = [
      {
        name: 'ouvrir et fermer chaque surface',
        run: async () => {
          const link = (name) => page.getByRole('link', { name }).first();
          const button = (name) => page.getByRole('button', { name }).first();
          const menu = () => tap(button(/ouvrir le menu des surfaces/));
          // [ce qu'on ouvre, ce qui l'ouvre, la fenêtre qui doit monter (`data-surface`)]
          const surfaces = phone
            ? [
                ['journal', () => menu().then(() => tap(link(/^journal/i))), 'journal'],
                ['presse', () => menu().then(() => tap(link(/^presse/i))), 'press'],
                ['télégraphe', () => menu().then(() => tap(link(/^télégraphe/i))), 'telegraph'],
                ['abaque', () => menu().then(() => tap(link(/^abaque/i))), 'gunnery'],
                ['recherche', () => menu().then(() => tap(link(/^recherche/i))), 'research'],
                ['nation', () => menu().then(() => tap(link(/^nation/i))), 'nation'],
                [
                  'réglages',
                  () =>
                    tap(button(/^France$/)).then(() =>
                      tap(page.getByText('Réglages', { exact: true })),
                    ),
                  'settings',
                ],
              ]
            : [
                ['journal', () => link(/^Journal d’événements/).click(), 'journal-dock'],
                ['presse', () => link(/^Presse/).click(), 'press'],
                ['télégraphe', () => link(/^Télégraphe/).click(), 'telegraph'],
                ['abaque', () => link(/^Abaque de tir/).click(), 'gunnery'],
                ['recherche', () => button(/^recherche$/).click(), 'research'],
                ['nation', () => link(/fiche de nation/).click(), 'nation'],
                ['réglages', () => link(/^Réglages$/).click(), 'settings'],
              ];
          const missed = [];
          for (const [what, open, surface] of surfaces) {
            const window = page.locator(`[data-surface="${surface}"]`);
            await open();
            if (
              !(await window.waitFor({ timeout: 5000 }).then(
                () => true,
                () => false,
              ))
            ) {
              missed.push(`${what} ne s’ouvre pas`);
              continue;
            }
            const close = button(/^fermer$/i);
            if (phone && (await close.isVisible().catch(() => false))) await close.tap();
            else await page.keyboard.press('Escape');
            if (
              !(await window.waitFor({ state: 'detached', timeout: 5000 }).then(
                () => true,
                () => false,
              ))
            )
              missed.push(`${what} ne se ferme pas`);
          }
          assert.deepEqual(missed, [], `écran : ${missed.join(', ')}`);
        },
      },
      {
        name: 'défiler le plateau personnel',
        run: async () => {
          await closeBoard();
          // Au doigt : replié → mi-hauteur → plein → replié, la poignée disant chaque fois la suite.
          if (phone)
            for (const next of [/^agrandir/, /^replier/, /^déplier/]) {
              await tap(boardHandle());
              await page.waitForTimeout(700);
              const said = await boardHandle().getAttribute('aria-label');
              assert.match(said ?? '', next, `écran : la poignée dit « ${said} »`);
            }
          await openBoard();
          // Déplié, la rangée des tuiles défile : du doigt au téléphone, par sa flèche au bureau.
          const tile = page.getByRole('button', { name: /^Quartier général — / }).first();
          const scrolled = () =>
            tile.evaluate((node) => {
              for (let at = node.parentElement; at; at = at.parentElement)
                if (at.scrollWidth > at.clientWidth + 4) return at.scrollLeft;
              return null;
            });
          const before = await scrolled();
          assert.notEqual(before, null, 'écran : la rangée des tuiles ne déborde pas');
          if (phone) {
            const [x, y] = await centreOf(tile);
            await touch('touchStart', [[x + 150, y]]);
            await fingers([[x + 150, y]], [[x - 50, y]], 300);
            await touch('touchEnd', []);
          } else
            await page
              .getByRole('button', { name: /^suivantes$/ })
              .first()
              .click();
          await page.waitForTimeout(900);
          assert.ok((await scrolled()) > before, 'écran : la rangée des tuiles n’a pas défilé');
          await closeBoard();
        },
      },
      {
        name: 'poser une tuile',
        run: async () => {
          // La caserne, portée du plateau sur la Beauce, en terre à soi.
          const spot = [1.9, 47.9];
          await frame(spot, 4);
          await openBoard();
          const tile = page.getByRole('button', { name: /^Caserne — / }).first();
          await tile.scrollIntoViewIfNeeded();
          const from = await centreOf(tile);
          const to = await page.evaluate((spot) => globalThis.mapEngine.screenOf(spot), spot);
          await carry(from, [to.x, to.y]);
          await serverSays(seat, 'une caserne est en chantier', (view) =>
            [view.me.construction, ...view.me.constructionQueue].some(
              (site) => site?.key === 'barracks' && site.level === 1,
            ),
          );
          // L'écran : sa maquette en chantier se dresse sur la carte.
          await page
            .waitForFunction(
              () =>
                [...globalThis.mapEngine.maquettes.byId.keys()].some((id) =>
                  id.startsWith('building-barracks'),
                ),
              null,
              { timeout: 5000 },
            )
            .catch(() => assert.fail('écran : aucune maquette de caserne sur la carte'));
          await closeBoard();
        },
      },
      {
        name: 'élever un bâtiment par glisser',
        run: async () => {
          const hq = start.me.buildings.find((building) => building.key === 'hq');
          const id = `building-hq@${hq.point[0]},${hq.point[1]}`;
          await frame(hq.point, phone ? 4 : 3);
          await openBoard();
          const tile = page
            .getByRole('button', { name: /^Quartier général — niv\. 1 → 2/ })
            .first();
          await tile.scrollIntoViewIfNeeded();
          const from = await centreOf(tile);
          const to = await maquettePoint(id);
          assert.ok(to, `${id} n'est pas dessinée à l'écran`);
          await carry(from, to);
          await serverSays(seat, 'le QG s’élève au niveau 2', (view) =>
            [view.me.construction, ...view.me.constructionQueue].some(
              (site) => site?.key === 'hq' && site.level === 2,
            ),
          );
          // L'écran : l'avis de l'élévation, celui que le lâcher a obtenu du serveur.
          await page
            .getByText('Quartier général : niveau 2 en file')
            .first()
            .waitFor({ timeout: 5000 })
            .catch(() => assert.fail('écran : aucun avis « Quartier général : niveau 2 en file »'));
          await closeBoard();
        },
      },
      {
        name: 'lever une pile et la poser (marche)',
        run: async () => {
          // Le camion vide de `--passagers`, seul sur son point.
          const pileId = 'stack-point:3.4,47.6';
          const truck = start.me.troops.find(
            (troop) => troop.stationedAt.kind === 'point' && troop.stationedAt.lonLat[0] === 3.4,
          );
          await frame([3.4, 47.6], 3);
          const [piece] = await piecesOf(pileId);
          assert.ok(piece?.at, `${pileId} n'est pas dessinée à nu`);
          await carry(piece.at, [piece.at[0] - 260, piece.at[1] + 120], { hold: phone ? 500 : 0 });
          await serverSays(seat, 'le camion est en marche', (view) =>
            view.movements.some((movement) => JSON.stringify(movement).includes(truck.id)),
          );
          // L'écran : la pile a quitté son point.
          await page.waitForTimeout(1000);
          assert.equal(
            await page.evaluate((id) => globalThis.mapEngine.standing.dressed.has(id), pileId),
            false,
            `écran : ${pileId} est encore debout à son point`,
          );
        },
      },
      {
        name: 'embarquer',
        run: async () => {
          // La pile mixte : un fantassin détaché de son escouade, lâché sur le camion.
          const pileId = 'stack-point:1,47.3';
          await frame([1, 47.3], 3);
          const pieces = await piecesOf(pileId);
          const rider = pieces.find((one) => one.role === 'infantry' && one.at);
          const truck = pieces.find((one) => one.role === 'landTransport' && one.at);
          assert.ok(rider && truck, `${pileId} : fantassin ou camion caché`);
          await carry(rider.at, truck.at, { hold: 650 });
          const truckId = start.me.troops.find(
            (troop) =>
              troop.role === 'landTransport' &&
              troop.stationedAt.kind === 'point' &&
              troop.stationedAt.lonLat[0] === 1,
          ).id;
          await serverSays(seat, 'un fantassin est à bord du camion', (view) =>
            view.me.troops.some((troop) => troop.carriedBy === truckId),
          );
          // L'écran : le camion de la pile porte un passager.
          await page.waitForTimeout(1500);
          const after = await piecesOf(pileId);
          assert.ok(
            after.some((one) => one.role === 'landTransport' && one.aboard > 0),
            'écran : le camion de la pile ne dit aucun passager',
          );
        },
      },
      {
        name: 'charger un camion',
        run: async () => {
          // Le camion vide de `--deux-camions`, au QG : du charbon du bac, lâché sur son étiquette.
          const truck = start.me.troops.find(
            (troop) =>
              troop.role === 'landTransport' &&
              troop.stationedAt.kind === 'building' &&
              !troop.load,
          );
          const hq = start.me.buildings.find((building) => building.key === 'hq');
          await frame(hq.point, 6);
          const bin = page.locator('[data-bin="coal"]').filter({ visible: true }).first();
          const from = await centreOf(bin);
          // La main prise, toutes les étiquettes de transport se montrent : on vise celle du camion.
          const tagAt = () => centreOf(page.locator(`[data-carrier-id="${truck.id}"]`));
          if (phone) {
            await touch('touchStart', [from]);
            await fingers([from], [[from[0], from[1] - 80]], 200);
            await page.waitForTimeout(300);
            const to = await tagAt();
            await fingers([[from[0], from[1] - 80]], [to]);
            await page.waitForTimeout(300);
            await touch('touchEnd', []);
          } else {
            await page.mouse.move(...from);
            await page.mouse.down();
            await page.mouse.move(from[0], from[1] - 80, { steps: 6 });
            await page.waitForTimeout(300);
            await page.mouse.move(...(await tagAt()), { steps: 15 });
            await page.waitForTimeout(300);
            await page.mouse.up();
          }
          await serverSays(seat, 'le camion porte du charbon', (view) =>
            view.me.troops.some((troop) => troop.id === truck.id && (troop.load?.coal ?? 0) > 0),
          );
          // L'écran : l'étiquette du camion porte le signe de sa charge.
          await page
            .locator(`[data-carrier-id="${truck.id}"] .cargo-tag-sign`)
            .waitFor({ state: 'attached', timeout: 5000 })
            .catch(() => assert.fail('écran : l’étiquette du camion ne dit pas sa charge'));
        },
      },
    ];

    const results = [];
    for (const gesture of gestures) {
      if (only && !only.test(gesture.name)) continue;
      const began = Date.now();
      try {
        await gesture.run();
        results.push({ name: gesture.name, ok: true, ms: Date.now() - began });
      } catch (error) {
        const shot = `${out}/${profile}-${gesture.name.replace(/\W+/g, '-')}.png`;
        await page.screenshot({ path: shot }).catch(() => {});
        results.push({
          name: gesture.name,
          ok: false,
          ms: Date.now() - began,
          why: error.message,
          shot,
        });
      }
    }
    return { results, errors };
  } finally {
    await browser.close();
  }
}

let failed = 0;
for (const profile of profiles) {
  const began = Date.now();
  // Un profil qui tombe avant ses gestes compte comme un échec, et le suivant joue quand même.
  const { results, errors } = await runProfile(profile).catch((error) => ({
    results: [{ name: 'mise en place', ok: false, ms: Date.now() - began, why: error.message }],
    errors: [],
  }));
  console.log(`\n${profile} — ${((Date.now() - began) / 1000).toFixed(0)} s`);
  for (const r of results) {
    console.log(`  ${r.ok ? 'ok  ' : 'ÉCHEC'} ${r.name} (${(r.ms / 1000).toFixed(1)} s)`);
    if (!r.ok) console.log(`        ${r.why}${r.shot ? `\n        capture : ${r.shot}` : ''}`);
  }
  for (const message of errors) console.log(`  [pageerror] ${message}`);
  failed += results.filter((r) => !r.ok).length + errors.length;
}
process.exit(failed === 0 ? 0 : 1);
