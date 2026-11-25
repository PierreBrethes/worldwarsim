/**
 * **Le parcours critique, de bout en bout** (#651) : deux comptes s'inscrivent, l'un fonde une
 * Mondiale, l'autre la rejoint par son lien, la saison part, le fondateur pose son QG puis lève
 * sa garnison offerte et la pose plus loin ; l'écran dit qu'un mouvement court. Un seul test, sur
 * le vrai front et le vrai backend : ce que les tests unitaires et `convex-test` ne voient pas,
 * c'est la couture entre les deux.
 *
 * Les gestes sur la carte sont ceux de `scripts/gestes.mjs` (le moteur exposé en dev,
 * `globalThis.mapEngine`), réduits à deux : poser une tuile, porter une pile.
 */
import { expect, test, type Browser, type Page } from '@playwright/test';
import { ConvexHttpClient } from 'convex/browser';
import type { Box3, Camera, Vector3 } from 'three';
import { api } from '../convex/_generated/api';
import type { Id } from '../convex/_generated/dataModel';

type LonLat = readonly [number, number];

/** Ce que le test lit du moteur, privé compris : la même surface que `scripts/gestes.mjs`. */
type Engine = {
  frame: { projectLonLat: (at: LonLat, height: number) => Vector3 };
  camera: Camera;
  controls: { target: Vector3; update: () => void };
  invalidate: () => void;
  screenOf: (at: LonLat) => { x: number; y: number } | null;
  renderer: { domElement: HTMLCanvasElement };
  maquettes: { byId: Map<string, unknown> };
  standing: {
    dressed: Map<string, { pieces: { groups: ReadonlyArray<unknown> } }>;
    pieceOf: (id: string) => { box: Box3 } | undefined;
  };
};

const backend = process.env.VITE_CONVEX_URL ?? '';
/** Le test ouvre des comptes et fonde une saison : jamais ailleurs que sur un backend local. */
const local =
  URL.canParse(backend) && ['127.0.0.1', 'localhost'].includes(new URL(backend).hostname);
const tag = Math.random().toString(36).slice(2, 7);
const founder = { nickname: `E2eA${tag}`, password: `pw-${tag}-founder` };
const guest = { nickname: `E2eB${tag}`, password: `pw-${tag}-guest` };

const began = Date.now();
/** Le temps de chaque étape, dans le journal de la CI : la carte en SwiftShader est lente. */
const mark = (step: string) =>
  console.log(`[e2e] ${((Date.now() - began) / 1000).toFixed(1)} s · ${step}`);

async function freshPage(browser: Browser): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  page.on('pageerror', (error) => console.log(`[pageerror] ${error.message}`));
  return page;
}

async function fillAccount(page: Page, account: typeof founder) {
  await page.getByLabel('nom de guerre').fill(account.nickname);
  await page.getByLabel('mot de passe', { exact: true }).fill(account.password);
}

/** Cadre la carte sur un point, à `distance`, et laisse les figurines se dresser. */
async function frame(page: Page, lonLat: LonLat, distance: number) {
  await page.evaluate(
    ([lonLat, distance]) => {
      const engine = (globalThis as unknown as { mapEngine: Engine }).mapEngine;
      const target = engine.frame.projectLonLat(lonLat, 0);
      const away = engine.camera.position.clone().sub(engine.controls.target).normalize();
      engine.controls.target.copy(target);
      engine.camera.position.copy(target).addScaledVector(away, distance);
      engine.controls.update();
      engine.invalidate();
    },
    [lonLat, distance] as const,
  );
  await page.waitForTimeout(2500);
}

/** Une main de souris qui prend en `from` et lâche en `to`, comme `carry` de `gestes.mjs`. */
async function carry(page: Page, from: readonly [number, number], to: readonly [number, number]) {
  await page.mouse.move(from[0], from[1]);
  await page.mouse.down();
  await page.mouse.move(from[0], from[1] - 40, { steps: 6 });
  await page.mouse.move(to[0], to[1], { steps: 20 });
  await page.waitForTimeout(200);
  await page.mouse.up();
}

/** Où une pièce de la pile tombe à l'écran, sur la carte nue (ni mât, ni bandeau devant) : la
 *  pile se dresse quand ses figurines sont chargées, on l'attend. */
async function pieceOnScreen(page: Page, pileId: string): Promise<readonly [number, number]> {
  const deadline = Date.now() + 30_000;
  for (;;) {
    const at = await page.evaluate((pileId) => {
      const engine = (globalThis as unknown as { mapEngine: Engine }).mapEngine;
      const canvas = engine.renderer.domElement;
      const box = canvas.getBoundingClientRect();
      const groups = engine.standing.dressed.get(pileId)?.pieces.groups ?? [];
      for (const k of groups.keys()) {
        const drawn = engine.standing.pieceOf(`${pileId}/${k}`)?.box;
        if (drawn === undefined) continue;
        const ndc = drawn.getCenter(drawn.min.clone()).project(engine.camera);
        const x = box.left + ((ndc.x + 1) / 2) * box.width;
        const y = box.top + ((1 - ndc.y) / 2) * box.height;
        if (document.elementFromPoint(x, y) === canvas) return [x, y] as const;
      }
      return null;
    }, pileId);
    if (at !== null) return at;
    if (Date.now() > deadline) throw new Error(`la pile ${pileId} n’est pas dessinée à nu`);
    await page.waitForTimeout(500);
  }
}

test('fonder, rejoindre, poser le QG et envoyer un mouvement', async ({ browser }) => {
  expect(local, `VITE_CONVEX_URL « ${backend} » : un backend local est attendu`).toBe(true);
  // Fondateur : un dossier, puis une Mondiale.
  const a = await freshPage(browser);
  await a.goto('/connexion?ouvrir&suite=fonder');
  await fillAccount(a, founder);
  await a.getByRole('button', { name: 'ouvrir le dossier' }).click();
  await a.waitForURL('**/fonder');
  await a.getByRole('button', { name: 'fonder une Mondiale — sept jours' }).click();
  await a.waitForURL('**/salon');
  mark('salon fondé');
  const codeButton = a.getByRole('button', { name: /^Code de partie \S+ : le copier$/ });
  const code = (await codeButton.getAttribute('aria-label'))?.match(/^Code de partie (\S+) /)?.[1];
  expect(code, 'le salon ne montre pas son code').toBeTruthy();
  await a.getByRole('radio', { name: 'France' }).click();
  await expect(a.getByRole('radio', { name: 'France' })).toHaveAttribute('aria-checked', 'true');

  // Invité : le lien d'invitation, un dossier, une nation, « prêt ».
  const b = await freshPage(browser);
  await b.goto(`/rejoindre/${code}`);
  await fillAccount(b, guest);
  await b.getByRole('button', { name: 'ouvrir le dossier et répondre présent' }).click();
  await b.waitForURL('**/salon');
  await b.getByRole('radio', { name: 'R.-Uni' }).click();
  await b.getByRole('button', { name: 'tamponner « prêt »' }).click();

  mark('invité prêt');
  // Le fondateur lance : la séquence de lancement mène au plateau.
  await a.getByRole('button', { name: 'lancer la saison — irréversible' }).click();
  await a.waitForURL('**/plateau', { timeout: 60_000 });
  await a.waitForFunction(() => 'mapEngine' in globalThis, null, { timeout: 60_000 });
  mark('plateau chargé');
  const understood = a.getByRole('button', { name: /compris/i }).first();
  if (await understood.isVisible({ timeout: 8000 }).catch(() => false)) await understood.click();

  // Le serveur dit où est la capitale : c'est là que le QG se pose.
  const seat = await a.evaluate(() => ({
    token: localStorage.getItem('wws-session') ?? '',
    seasonId: localStorage.getItem('wws-season') ?? '',
  }));
  const client = new ConvexHttpClient(backend);
  const query = () =>
    client.query(api.view.playerView, {
      token: seat.token,
      seasonId: seat.seasonId as Id<'seasons'>,
    });
  const capital = (await query()).me.capitalPoint;
  expect(capital, 'la place neuve n’a pas de capitale').not.toBeNull();
  const at = capital as LonLat;

  mark(`capitale ${at.join(', ')}`);
  // Poser le QG : sa tuile, du plateau personnel à la capitale.
  await frame(a, at, 4);
  const handle = a.getByRole('button', { name: /le plateau personnel$/ }).first();
  if ((await handle.getAttribute('aria-expanded')) !== 'true') await handle.click();
  const tile = a.getByRole('button', { name: /^Quartier général — / }).first();
  await tile.scrollIntoViewIfNeeded();
  const tileBox = await tile.boundingBox();
  expect(tileBox, 'la tuile du QG est hors de l’écran').not.toBeNull();
  const to = await a.evaluate(
    (at) => (globalThis as unknown as { mapEngine: Engine }).mapEngine.screenOf(at),
    at,
  );
  expect(to, 'la capitale est hors de l’écran').not.toBeNull();
  mark(`tuile en ${tileBox!.x}, ${tileBox!.y} · capitale à l'écran en ${to!.x}, ${to!.y}`);
  await carry(
    a,
    [tileBox!.x + tileBox!.width / 2, tileBox!.y + tileBox!.height / 2],
    [to!.x, to!.y],
  );
  await expect
    .poll(async () => (await query()).me.hqLevel, {
      message: 'le serveur n’a pas reçu la pose du QG',
      timeout: 15_000,
    })
    .toBeGreaterThan(0);
  mark('QG posé au serveur');
  await a.waitForFunction(
    () =>
      [...(globalThis as unknown as { mapEngine: Engine }).mapEngine.maquettes.byId.keys()].some(
        (id) => id.startsWith('building-hq'),
      ),
    null,
    { timeout: 20_000 },
  );
  if ((await handle.getAttribute('aria-expanded')) === 'true') await handle.click();

  // Envoyer un mouvement : la garnison offerte du QG, levée et posée plus loin.
  mark('maquette du QG debout');
  const hq = (await query()).me.buildings.find((building) => building.key === 'hq');
  expect(hq, 'le serveur n’a pas de QG').toBeDefined();
  const pileId = `building:${hq!.id}`;
  await frame(a, hq!.point as LonLat, 3);
  const piece = await pieceOnScreen(a, pileId);
  const [x, y] = piece;
  mark(`garnison à l'écran en ${x}, ${y}`);
  await carry(a, [x, y], [x - 220, y + 90]);

  // L'écran : le compteur des slots de la réglette, puis son volet, disent le mouvement en cours.
  const slots = a.getByRole('button', { name: /mouvements/ }).first();
  await expect(slots).toContainText(/1 \/ \d+/, { timeout: 15_000 });
  // Le volet cède devant une fenêtre ouverte (`coversUnderway`) : le plateau personnel se replie.
  const fold = a.getByRole('button', { name: 'replier le plateau personnel' });
  if ((await fold.count()) > 0) await fold.first().click();
  await expect(a).not.toHaveURL(/personalBoard/);
  await slots.click();
  await expect(slots).toHaveAttribute('aria-expanded', 'true');
  await expect(a.getByText(/^slots 1 \/ \d+$/)).toBeVisible();
});
