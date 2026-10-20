/**
 * **Une Mondiale lancée, en local, pour les captures.** Joue le parcours de deux vrais joueurs
 * par l'API publique : inscription (ou connexion), fondation, adhésion par le code, nation,
 * « prêt », lancement. Puis, sauf `--nu`, remplit les stocks et pose des troupes (`convex/dev.ts`).
 * `--crans` pose en plus, pour la France, une escouade en Rhénanie aux crans entamés : une
 * infanterie à sec et un blindé à un cran de plein (coups et plein, ADR 0028 §3). `--recolte`
 * date une visite du plateau personnel de neuf heures plus tôt : la prochaine ouverture montre la
 * récolte, des vivres et de l'acier entrés, du pétrole sorti (ADR 0028 §7). `--livraison` pose
 * pour la France un avant-poste près de Bruxelles, son dépôt entamé, un camion chargé au QG et un
 * autre au point (ADR 0028 §4). `--tournee` y ajoute Lille, au dépôt plein, et lance deux
 * tournées : le camion du QG par Lille, sautée, et Bruxelles ; celui de Bruxelles par Lille seule,
 * qui attend. `--largage` pose pour la France un aérodrome et un avion chargé, un avant-poste de
 * niveau 1 près de Bruxelles et une escouade à sec en Rhénanie : de quoi larguer (ADR 0028 §4).
 * `--recherche` donne à la France un Centre de recherche de niveau 2, l'infanterie MK2 et l'aviation,
 * et le blindé en cours sur le Centre (#123) ; `--centre`, le même Centre sans carte posée. `--artillerie` lui donne l'artillerie, une pièce au nord de Paris et une escouade
 * de quatorze troupes à Reims, pose seize troupes britanniques à Amiens, et les bombarde une fois
 * la pièce en batterie : la salve bornée et le fanion qui compte (ADR 0028 §6). `--points` fait
 * tenir à la France Bakou, Narvik, Singapour et Halifax (Dakar va à l'adversaire, avec un entrepôt relevé), avec un blindé au plein vide, un camion
 * au plein et une escorte envoyée en mer, et les dépêches d'un dépôt brûlé (P11). `--petrole` lui donne un arsenal, la carte du
 * pétrole synthétique et un lot de soixante pétroles en cours (ADR 0028 §1). `--tutoriel` laisse
 * une place neuve, comme `--nu` : les premiers pas commencent au QG à poser (ADR 0027 §2).
 * `--navire` pose pour la France un port à Marseille, un cargo à quai et un avant-poste à Agde :
 * de quoi voir un navire s'écarter du quai puis s'y ranger (#129). `--exploitations` pose pour la France sa ferme et ses deux mines sur les gisements de son sol,
 * posées offertes comme la fondation : de quoi lire un registre de consommation à deux colonnes
 * (production et consommation, #121). `--chantiers` élève le QG au niveau 3 et met quatre
 * chantiers en file : un monte, 28 % plus vite, les autres attendent (ADR 0031). `--niveaux` y
 * ajoute une caserne de niveau 3.
 * `--tournee --sans-depart` pose la scène des tournées sans les lancer. `--tournee --rangoun` fait
 * tenir Rangoun à la France avant le départ, et poste deux fantassins de l'adversaire près de la
 * route de Bruxelles : l'un à 12 km, qui relève la tournée à mi-portée, l'autre à 45 km, qui la
 * relèverait sans Rangoun (#176).
 *
 *     npm run demo:mondiale
 *
 * Refuse toute URL qui n'est pas 127.0.0.1 ou localhost. Les comptes (mot de passe compris) vont
 * dans `scripts/demo-mondiale.accounts.json`, ignoré par git, et lu par `scripts/capture.mjs`.
 * Une démo existante est réutilisée : les comptes restent, une nouvelle partie est fondée.
 */
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../convex/_generated/api.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const accountsFile = fileURLToPath(new URL('./demo-mondiale.accounts.json', import.meta.url));
/** `--tutoriel` : une place neuve, au début des premiers pas (ADR 0027 §2) — rien de posé. */
const bare = process.argv.includes('--nu') || process.argv.includes('--tutoriel');
const steps = process.argv.includes('--crans');
const harvest = process.argv.includes('--recolte');
const tours = process.argv.includes('--tournee');
/** `--sans-depart` : la scène des tournées, mais aucune lancée — à lancer page ouverte (#128). */
const held = process.argv.includes('--sans-depart');
const rangoon = process.argv.includes('--rangoun');
const airdrops = process.argv.includes('--largage');
/** `--centre` : le Centre de `--recherche`, mais aucune carte posée — à poser depuis l'arbre. */
const idleCenter = process.argv.includes('--centre');
const research = idleCenter || process.argv.includes('--recherche');
const artillery = process.argv.includes('--artillerie');
const points = process.argv.includes('--points');
const oilLine = process.argv.includes('--petrole');
const mines = process.argv.includes('--exploitations');
/** `--niveaux` : `--chantiers`, plus une caserne de niveau 3 (ADR 0031). */
const levels = process.argv.includes('--niveaux');
const works = levels || process.argv.includes('--chantiers');
const navy = process.argv.includes('--navire');
const logistics = tours || process.argv.includes('--livraison');

const env = Object.fromEntries(
  (existsSync(`${root}.env.local`) ? readFileSync(`${root}.env.local`, 'utf8') : '')
    .split('\n')
    .map((line) => line.match(/^([A-Z_]+)=(.*)$/))
    .filter(Boolean)
    .map(([, key, value]) => [key, value.trim()]),
);
const url = process.env.VITE_CONVEX_URL ?? env.VITE_CONVEX_URL;
if (!url) throw new Error('VITE_CONVEX_URL absent (.env.local)');
if (!['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) {
  throw new Error(`Refus : ${url} n'est pas un backend local.`);
}
/** `npx convex run` lit `.env.local` : il doit viser le même backend, sinon on mélangerait deux bases. */
const cliUrl = process.env.CONVEX_SELF_HOSTED_URL ?? env.CONVEX_SELF_HOSTED_URL;
if (cliUrl !== url)
  throw new Error(`CONVEX_SELF_HOSTED_URL (${cliUrl}) ≠ VITE_CONVEX_URL (${url})`);

const saved = existsSync(accountsFile) ? JSON.parse(readFileSync(accountsFile, 'utf8')) : {};
const accounts = {
  a: saved.a ?? { nickname: 'DemoAlpha', password: randomBytes(9).toString('base64url') },
  b: saved.b ?? { nickname: 'DemoBravo', password: randomBytes(9).toString('base64url') },
};
const client = new ConvexHttpClient(url);
const pause = (ms) => new Promise((done) => setTimeout(done, ms));

async function signIn({ nickname, password }) {
  try {
    return (await client.action(api.auth.login, { nickname, password })).token;
  } catch {
    await pause(400);
    return (await client.action(api.auth.register, { nickname, password })).token;
  }
}

const cli = (args) => execFileSync('npx', ['convex', ...args], { cwd: root, encoding: 'utf8' });

const tokenA = await signIn(accounts.a);
await pause(400);
const tokenB = await signIn(accounts.b);

const { code, seasonId } = await client.mutation(api.seasons.create, {
  token: tokenA,
  compensation: 0,
  mode: 'mondiale',
});
await client.mutation(api.seasons.join, { token: tokenB, code });
for (const [token, nation] of [
  [tokenA, 'france'],
  [tokenB, 'uk'],
]) {
  await client.mutation(api.players.reserveNation, { token, seasonId, nation });
  await client.mutation(api.players.declareReady, { token, seasonId, ready: true });
}
await client.mutation(api.seasons.launch, { token: tokenA, seasonId });

const scene = { a: null, b: null };
if (!bare) {
  cli(['run', 'dev:fillStocks', JSON.stringify({ seasonId, stock: 400 })]);
  const rows = cli(['data', 'players', '--limit', '200', '--format', 'jsonl'])
    .split('\n')
    .filter((line) => line.startsWith('{'))
    .map((line) => JSON.parse(line))
    .filter((row) => row.seasonId === seasonId);
  const at = { france: [2.35, 48.85], uk: [-0.12, 51.5] };
  for (const [key, nation] of [
    ['a', 'france'],
    ['b', 'uk'],
  ]) {
    const player = rows.find((row) => row.nation === nation);
    if (!player) continue;
    scene[key] = player._id;
    cli([
      'run',
      'dev:spawnTroops',
      JSON.stringify({
        playerId: player._id,
        role: 'infantry',
        count: 3,
        lon: at[nation][0],
        lat: at[nation][1],
      }),
    ]);
  }
  /** Hors de tout ancrage : rien ne les recharge, elles vivent sur ce qu'elles portent. */
  if (steps && scene.a !== null)
    for (const troop of [
      { role: 'infantry', rounds: 0 },
      { role: 'armor', rounds: 1, fuel: 1 },
    ])
      cli([
        'run',
        'dev:spawnTroops',
        JSON.stringify({ playerId: scene.a, count: 1, lon: 7.1, lat: 50.4, ...troop }),
      ]);
  /** Un avant-poste et son dépôt, un camion chargé au QG, un autre au point (ADR 0028 §4). */
  if (logistics && scene.a !== null)
    cli(['run', 'dev:logisticsScene', JSON.stringify({ playerId: scene.a, fullDepot: tours })]);
  /** Un avion chargé à l'aérodrome, un point sans piste, une escouade isolée (ADR 0028 §4). */
  if (airdrops && scene.a !== null)
    cli(['run', 'dev:airdropScene', JSON.stringify({ playerId: scene.a })]);
  /** Un port à Marseille, un cargo à quai, un avant-poste côtier à Agde (#129). */
  if (navy && scene.a !== null)
    cli(['run', 'dev:navyScene', JSON.stringify({ playerId: scene.a })]);
  /** Un Centre de recherche, deux cartes acquises, une troisième en cours (#123). */
  if (research && scene.a !== null)
    cli(['run', 'dev:researchScene', JSON.stringify({ playerId: scene.a, idle: idleCenter })]);
  /** Une salve sur seize troupes, une fois la pièce en batterie (ADR 0028 §6). */
  if (artillery && scene.a !== null && scene.b !== null) {
    cli(['run', 'dev:artilleryScene', JSON.stringify({ playerId: scene.a, enemyId: scene.b })]);
    await pause(32_000);
    const { me, camps } = await client.query(api.view.playerView, { token: tokenA, seasonId });
    const gun = me.troops.find((troop) => troop.role === 'artillery');
    const camp = camps.find((one) => !one.lastKnown && Math.abs(one.point[1] - 49.9) < 0.1);
    if (gun === undefined || camp === undefined)
      throw new Error('scène de l’artillerie incomplète');
    await client.mutation(api.movements.bombard, {
      token: tokenA,
      seasonId,
      troopId: gun.id,
      target: { kind: 'camp', campId: camp.id },
    });
  }
  /** Un arsenal et un lot de pétrole synthétique en cours (ADR 0028 §1). */
  if (mines && scene.a !== null) {
    const deposits = JSON.parse(readFileSync(`${root}public/deposits.json`, 'utf8'));
    /** Le QG d'abord (`HQ_FIRST`), à Paris ; les exploitations suivent, offertes. */
    const { me } = await client.query(api.view.playerView, { token: tokenA, seasonId });
    const paris = me.regions.find((region) => region.id === 'FRA-5333');
    await client.mutation(api.constructions.start, {
      token: tokenA,
      seasonId,
      building: 'hq',
      regionId: paris.id,
      point: { lon: paris.point[0], lat: paris.point[1] },
    });
    for (const [building, id] of [
      ['farm', 'food-FRA-5291'],
      ['mine', 'coal-FRA-5334'],
      ['mine', 'iron-FRA-5275'],
    ]) {
      const site = deposits.find((deposit) => deposit.id === id);
      await client.mutation(api.constructions.start, {
        token: tokenA,
        seasonId,
        building,
        regionId: site.regionId,
        point: { lon: site.lon, lat: site.lat },
      });
    }
  }
  if (works && scene.a !== null) {
    const paris = (
      await client.query(api.view.playerView, { token: tokenA, seasonId })
    ).me.regions.find((one) => one.id === 'FRA-5333');
    await client.mutation(api.constructions.start, {
      token: tokenA,
      seasonId,
      building: 'hq',
      regionId: paris.id,
      point: { lon: paris.point[0], lat: paris.point[1] },
    });
    cli(['run', 'dev:promoteHq', JSON.stringify({ playerId: scene.a, level: 3 })]);
    if (levels) cli(['run', 'dev:levelsScene', JSON.stringify({ playerId: scene.a })]);
    const { me } = await client.query(api.view.playerView, { token: tokenA, seasonId });
    for (const [building, id] of [
      ['barracks', 'FRA-5268'],
      ['warehouse', 'FRA-5312'],
      ['barracks', 'FRA-5321'],
      ['warehouse', 'FRA-5328'],
    ]) {
      const region = me.regions.find((one) => one.id === id);
      await client.mutation(api.constructions.start, {
        token: tokenA,
        seasonId,
        building,
        regionId: id,
        point: { lon: region.point[0], lat: region.point[1] },
      });
    }
  }
  if (oilLine && scene.a !== null)
    cli(['run', 'dev:oilLineScene', JSON.stringify({ playerId: scene.a })]);
  /** Bakou, Narvik, Singapour et Halifax tenus par la France, Dakar par l'adversaire, de quoi lire leurs règles. */
  if (points && scene.a !== null && scene.b !== null) {
    cli(['run', 'dev:pointsScene', JSON.stringify({ playerId: scene.a, enemyId: scene.b })]);
    /** L'escorte prend la mer : sous Halifax, ce mouvement maritime ne prend pas de slot. */
    const { me } = await client.query(api.view.playerView, { token: tokenA, seasonId });
    const fleet = me.troops.find((troop) => troop.role === 'escort');
    await client.mutation(api.movements.marchTo, {
      token: tokenA,
      seasonId,
      origin: { kind: 'point', point: { lon: -30, lat: 45 } },
      troopIds: [fleet.id],
      point: { lon: -34, lat: 47 },
    });
  }
  /** Rangoun à la France, et deux guetteurs de l'adversaire de part et d'autre de la mi-portée. */
  if (tours && rangoon && scene.a !== null && scene.b !== null) {
    cli(['run', 'dev:holdPoint', JSON.stringify({ playerId: scene.a, key: 'rangoon' })]);
    for (const [lon, lat] of [
      [3.47, 50.46],
      [3.11, 50.65],
    ])
      cli([
        'run',
        'dev:spawnTroops',
        JSON.stringify({ playerId: scene.b, role: 'infantry', count: 1, lon, lat }),
      ]);
  }
  /** Deux tournées : l'une saute un dépôt plein et roule, l'autre attend (ADR 0028). */
  if (tours && !held && scene.a !== null) {
    const { me } = await client.query(api.view.playerView, { token: tokenA, seasonId });
    const outpostIn = (lon) =>
      me.outposts.find((outpost) => Math.abs(outpost.lonLat[0] - lon) < 0.05);
    const lille = outpostIn(3.06);
    const brussels = outpostIn(4.35);
    const truckAt = (kind) =>
      me.troops.find(
        (troop) =>
          troop.role === 'landTransport' &&
          troop.stationedAt.kind === kind &&
          (kind === 'building' || troop.stationedAt.outpostId === brussels.id),
      );
    const start = (truck, stops) =>
      client.mutation(api.tours.start, { token: tokenA, seasonId, troopId: truck.id, stops });
    await start(truckAt('building'), [lille.id, brussels.id]);
    await start(truckAt('outpost'), [lille.id]);
  }
  if (harvest)
    cli([
      'run',
      'dev:pastVisit',
      JSON.stringify({ seasonId, hours: 9, gains: { food: 108, steel: 72, oil: -30 } }),
    ]);
}

writeFileSync(accountsFile, `${JSON.stringify({ ...accounts, code, seasonId }, null, 2)}\n`);
console.log(`Mondiale lancée : code ${code}, saison ${seasonId}`);
console.log(`Comptes : ${accounts.a.nickname} (a), ${accounts.b.nickname} (b) → ${accountsFile}`);
