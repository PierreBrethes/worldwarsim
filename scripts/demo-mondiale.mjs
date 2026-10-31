/**
 * **Une Mondiale lancée, en local, pour les captures.** Joue le parcours de deux vrais joueurs
 * par l'API publique : inscription (ou connexion), fondation, adhésion par le code, nation,
 * « prêt », lancement. Puis, sauf `--nu`, remplit les stocks et pose des troupes (`convex/dev.ts`).
 * `--crans` pose en plus, pour la France, une escouade en Rhénanie aux crans entamés : une
 * infanterie à sec et un blindé à un cran de plein (coups et plein, ADR 0028 §3). `--recolte`
 * date une visite du plateau personnel de neuf heures plus tôt : la prochaine ouverture montre la
 * récolte, des vivres et de l'acier entrés, du pétrole sorti (ADR 0028 §7) ; avec `--bac-plein`, le
 * charbon est au plafond de son bac : une part de la récolte y est perdue (#251). `--livraison` pose
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
 * `--edition` publie tout de suite deux éditions de presse : le classement et ses variations.
 * `--tournee --sans-depart` pose la scène des tournées sans les lancer. `--tournee --rangoun` fait
 * tenir Rangoun à la France avant le départ, et poste deux fantassins de l'adversaire près de la
 * route de Bruxelles : l'un à 12 km, qui relève la tournée à mi-portée, l'autre à 45 km, qui la
 * relèverait sans Rangoun, et un camion de tournée seul à l'arrêt en Picardie (#176).
 * `--voisins` pose un avant-poste britannique en Hainaut, contre le Nord français : deux
 * contours côte à côte (#217). `--quais` pose pour la France trois avant-postes, à La Valette, à
 * Singapour et à Florence : de quoi y viser un port (#221). `--iles` (#224) y ajoute, pour la
 * France, un QG à Paris (niveau 2), une colonne débarquée à La Valette par une coque venue du
 * large, un avant-poste qu'une de ses infanteries y fonde, un port en chantier sur le quai de La
 * Valette et une infanterie à Syracuse, d'où viser Malte à pied.
 * `--epingles [N]` (#234) sème N piles sur la France (1000 par défaut, une sur deux en Lorraine),
 * pose en face trois camps britanniques relevés en Sarre et en Alsace, un quatrième perdu de vue près de
 * Metz et un entrepôt relevé en Belgique, puis fait marcher une pile française vers Madrid et une
 * britannique à travers la Lorraine. `--lisbonne` donne Lisbonne à la France : elle lit la nation de ses relevés (P11).
 * `--pile-mixte` (#286) pose un camion, un chasseur et deux fantassins sur un même point : une pile
 * où les nouveaux modèles côtoient les anciens. `--escouade` (#283) pose un camion, un char et deux
 * fantassins en Essonne et dans le Cotentin, et les dissout : la couronne, puis contre la mer.
 * `--sans-place` (#295) pose huit pièces au bord de la côte irlandaise : U y est refusé, la barre
 * de sélection le dit avant le geste.
 * `--gisements` (#239) donne à la France un QG à Paris, une mine sur le charbon du Nord et un
 * avant-poste à Namur, et à l'adversaire une mine relevée sur la Sarre : une mine à poser, au
 * cadrage de la maquette des gisements.
 * `--echelle` (#265) pose pour la France l'aérodrome et le port de `--largage` et `--navire`, la
 * caserne de `--niveaux`, puis y fait entrer trois fantassins et deux chars : une garnison à
 * l'échelle commune (ADR 0035). L'avion de l'aérodrome est le transport du largage : un chasseur
 * ne part d'un point sans piste. Deux chars restent seuls à Orléans : une pile hors garnison, pour la
 * figurine plancher (#266).
 * `--raser` (#326) pose la caserne de `--niveaux` et y fait entrer la garnison de `--echelle` :
 * une caserne à raser dans l'interface, sa garnison posée au point.
 * `--demanteler` (#340) pose l'avant-poste de `--livraison` près de Bruxelles, un camion en
 * garnison : un point à démanteler dans l'interface.
 * `--combat [s]` (#272) pose une garnison britannique à Sedan, deux fantassins et un char, et
 * lance sur elle une colonne française de même force, qui arrive dans `s` secondes (25 par
 * défaut) : le temps d'ouvrir la carte, où le combat se joue à son point.
 *
 * `--huit` (#211) fait jouer huit comptes, a à h, une nation chacun (france, uk, germany, italy,
 * ussr, usa, japan, china) : une revue de deux fantassins et d'un blindé à chaque capitale, lieux
 * `capitale-<nation>`. `--rangs` pose, à côté de Paris (`rangs`), infanterie et blindé des deux
 * rangs et une artillerie, et une escorte et un porte-avions en golfe de Gascogne (`rangs-mer`).
 * `--recrue [s]` forme une infanterie de rang 2 à la caserne de `--niveaux` et la fait sortir dans
 * `s` secondes (25 par défaut) : lieu `recrue`. `--rejeu` joue le combat de `--combat` tout de
 * suite et attend son compte rendu : un combat passé, à rejouer (`combat`). `--hors-portee` pose
 * un QG à Paris et une mine sur le charbon de la Ruhr, sans avant-poste (`hors-portee`).
 * `--pillage` pose la scène de `--points` sans y envoyer l'escorte, fait marcher deux fantassins
 * français sur l'entrepôt adverse relevé en Pologne, et recule leur présence d'une heure et demie :
 * trois caisses sur quatre sont tombées (`pillage`).
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
/** Les lieux des scènes posées, écrits dans le fichier des comptes : `lieu=@camion` de `capture.mjs`. */
const places = {};
const bare = process.argv.includes('--nu') || process.argv.includes('--tutoriel');
const steps = process.argv.includes('--crans');
const harvest = process.argv.includes('--recolte');
/** `--bac-plein` : avec `--recolte`, le bac de charbon plein et sa mine qui tourne : du perdu. */
const fullBin = process.argv.includes('--bac-plein');
const tours = process.argv.includes('--tournee');
/** `--sans-depart` : la scène des tournées, mais aucune lancée — à lancer page ouverte (#128). */
const held = process.argv.includes('--sans-depart');
const rangoon = process.argv.includes('--rangoun');
const airdrops = process.argv.includes('--largage') || process.argv.includes('--echelle');
/** `--centre` : le Centre de `--recherche`, mais aucune carte posée — à poser depuis l'arbre. */
const idleCenter = process.argv.includes('--centre');
const research = idleCenter || process.argv.includes('--recherche');
const artillery = process.argv.includes('--artillerie');
const points = process.argv.includes('--points');
/** `--pillage` (#211) : `--points`, sans l'escorte en mer, plus un pillage en phase de présence. */
const pillaging = process.argv.includes('--pillage');
/** `--huit` (#211) : huit comptes, une nation chacun, une revue à chaque capitale. */
const eight = process.argv.includes('--huit');
/** `--rangs` (#211) : les deux rangs d'infanterie et de blindé, une artillerie, une flotte. */
const ranks = process.argv.includes('--rangs');
/** `--recrue [s]` (#211) : une infanterie de rang 2 formée à la caserne, sortie dans s secondes. */
const recruitAt = process.argv.indexOf('--recrue');
const recruitIn = recruitAt < 0 ? null : Number(process.argv[recruitAt + 1]) || 25;
/** `--rejeu` (#211) : le combat de `--combat`, joué tout de suite : un compte rendu à rejouer. */
const replaying = process.argv.includes('--rejeu');
/** `--hors-portee` (#211) : une mine qu'aucun avant-poste ne couvre. */
const unreached = process.argv.includes('--hors-portee');
/** `--edition` : deux éditions de presse tout de suite, la seconde avec ses variations (#180). */
const editions = process.argv.includes('--edition');
const oilLine = process.argv.includes('--petrole');
const mines = process.argv.includes('--exploitations');
/** `--niveaux` : `--chantiers`, plus une caserne de niveau 3 (ADR 0031). */
/** `--raser` (#326) : la caserne de `--niveaux` et la garnison de `--echelle`, à raser. */
const razing = process.argv.includes('--raser');
const levels =
  razing ||
  recruitIn !== null ||
  process.argv.includes('--niveaux') ||
  process.argv.includes('--echelle');
const works = levels || process.argv.includes('--chantiers');
const navy = process.argv.includes('--navire') || process.argv.includes('--echelle');
/** `--deux-camions` : la scène de `--livraison`, avec un second camion vide au QG (#319). */
const twinTrucks = process.argv.includes('--deux-camions');
/** `--demanteler` (#340) : l'avant-poste de `--livraison` près de Bruxelles, à démanteler dans
 *  l'interface : son épingle, l'aire qu'il colore, un camion en garnison. */
const dismantling = process.argv.includes('--demanteler');
const logistics = dismantling || tours || twinTrucks || process.argv.includes('--livraison');
/** `--voisins` : un avant-poste britannique en Hainaut, contre le Nord français (#217). */
const neighbours = process.argv.includes('--voisins');
/** `--quais` : trois avant-postes français, à La Valette, à Singapour et à Florence (#221). */
/** `--iles` : `--quais`, plus Malte débarquée, fondée et son quai, et Syracuse en face (#224). */
const islands = process.argv.includes('--iles');
const quays = islands || process.argv.includes('--quais');
/** `--epingles [N]` : N piles semées sur la France (1000 par défaut), des relevés en face (#234). */
const pinsAt = process.argv.indexOf('--epingles');
const pins = pinsAt < 0 ? null : Number(process.argv[pinsAt + 1]) || 1000;
/** `--lisbonne` : Lisbonne tenue par la France, qui lit la nation de ses relevés (P11). */
const lisbon = process.argv.includes('--lisbonne');
/** `--trajets` : une colonne Paris → Berlin à pied, une escorte Brest → Marseille par Gibraltar (#231). */
const threads = process.argv.includes('--trajets');
/** `--passagers` : un camion chargé de deux fantassins en Beauce, un autre vide (#238). */
const passengers = process.argv.includes('--passagers');
/** `--gisements` : une mine à poser, le Hainaut prenable, la Sarre prise, la Ruhr hors de portée (#239). */
const depositsAt = process.argv.includes('--gisements');
/** `--echelle` : une garnison entière, caserne, aérodrome et port, pour l'échelle commune (#265). */
const scale = process.argv.includes('--echelle');
/** `--troupe-seule` : avec `--echelle`, un camion et un char seuls sur un point (#301). */
const lone = process.argv.includes('--troupe-seule');
/** `--chargee` : avec `--troupe-seule`, le camion du point porte un fantassin à son bord. */
const loaded = process.argv.includes('--chargee');
/** `--combat [s]` : une colonne française sur une garnison britannique, arrivée dans s secondes (#272). */
const combatAt = process.argv.indexOf('--combat');
const combatIn = combatAt < 0 ? null : Number(process.argv[combatAt + 1]) || 25;

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
/** L'ordre des nations est celui de `scripts/banc-mondiale.mjs` ; a et b restent la France et le Royaume-Uni. */
const NATIONS = ['france', 'uk', 'germany', 'italy', 'ussr', 'usa', 'japan', 'china'];
const NICKNAMES = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel'];
const KEYS = 'abcdefgh'.split('');
const seats = eight ? 8 : 2;
const accounts = Object.fromEntries(
  KEYS.slice(0, seats).map((key, k) => [
    key,
    saved[key] ?? {
      nickname: `Demo${NICKNAMES[k]}`,
      password: randomBytes(9).toString('base64url'),
    },
  ]),
);
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

const tokens = [];
for (const key of KEYS.slice(0, seats)) {
  if (tokens.length > 0) await pause(400);
  tokens.push(await signIn(accounts[key]));
}
const [tokenA, tokenB] = tokens;

const { code, seasonId } = await client.mutation(api.seasons.create, {
  token: tokenA,
  compensation: 0,
  mode: 'mondiale',
});
for (const token of tokens.slice(1)) await client.mutation(api.seasons.join, { token, code });
for (const [k, token] of tokens.entries()) {
  const nation = NATIONS[k];
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
  places.paris = at.france;
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
  /** `--huit` : une revue à chaque capitale, et son lieu `capitale-<nation>`. */
  if (eight) {
    const capitals = JSON.parse(
      cli(['run', 'dev:reviewScene', JSON.stringify({ seasonId })]).match(/\{[\s\S]*\}/)[0],
    );
    for (const [nation, point] of Object.entries(capitals)) places[`capitale-${nation}`] = point;
  }
  /** `--rangs` : les deux rangs, une artillerie à côté de Paris ; une flotte au large de la Bretagne. */
  if (ranks && scene.a !== null) {
    const beside = { lon: 2.47, lat: 48.85 };
    const offshore = { lon: -6, lat: 47.5 };
    places.rangs = [beside.lon, beside.lat];
    places['rangs-mer'] = [offshore.lon, offshore.lat];
    for (const [role, tier, at] of [
      ['infantry', 1, beside],
      ['infantry', 2, beside],
      ['armor', 1, beside],
      ['armor', 2, beside],
      ['artillery', 1, beside],
      ['escort', 1, offshore],
      ['carrier', 1, offshore],
    ])
      cli([
        'run',
        'dev:spawnTroops',
        JSON.stringify({ playerId: scene.a, role, tier, count: 1, ...at }),
      ]);
  }
  /** `--hors-portee` : le QG de Paris et une mine de la Ruhr, que nul avant-poste ne couvre. */
  if (unreached && scene.a !== null) {
    const ruhr = JSON.parse(readFileSync(`${root}public/deposits.json`, 'utf8')).find(
      (deposit) => deposit.id === 'coal-DEU-1572',
    );
    places['hors-portee'] = [ruhr.lon, ruhr.lat];
    cli(['run', 'dev:unreachedMineScene', JSON.stringify({ playerId: scene.a })]);
  }
  /** `--pile-mixte` : un camion, un chasseur et deux fantassins sur un même point (#286). */
  if (process.argv.includes('--pile-mixte') && scene.a !== null)
    for (const [role, count] of [
      ['landTransport', 1],
      ['fighter', 1],
      ['infantry', 2],
    ])
      cli([
        'run',
        'dev:spawnTroops',
        JSON.stringify({ playerId: scene.a, role, count, lon: 1.0, lat: 47.3 }),
      ]);
  /** `--escouade` : un camion, un char et deux fantassins, en Essonne (sous le regard de la caméra)
   *  et dans le Cotentin, que la France dissout (#283) : la couronne au large de tout, puis contre
   *  la mer. */
  if (process.argv.includes('--escouade') && scene.a !== null)
    for (const [lon, lat] of [
      [2.35, 48.55],
      [-1.6, 49.4],
    ]) {
      for (const [role, count] of [
        ['landTransport', 1],
        ['armor', 1],
        ['infantry', 2],
      ])
        cli([
          'run',
          'dev:spawnTroops',
          JSON.stringify({ playerId: scene.a, role, count, lon, lat }),
        ]);
      await client
        .mutation(api.movements.disband, { token: tokenA, seasonId, point: { lon, lat } })
        .catch((error) => console.log(`Dissoudre en ${lon}, ${lat} : ${error.message}`));
    }
  /** `--sans-place` (#295) : huit pièces au bord de la côte irlandaise, que U ne peut pas ranger :
   *  la barre de sélection dit son refus avant le geste. */
  if (process.argv.includes('--sans-place') && scene.a !== null)
    for (const [role, count] of [
      ['landTransport', 1],
      ['armor', 1],
      ['infantry', 6],
    ])
      cli([
        'run',
        'dev:spawnTroops',
        JSON.stringify({ playerId: scene.a, role, count, lon: -9.75, lat: 51.75 }),
      ]);
  if (passengers && scene.a !== null) {
    places.camion = [1.6, 48.2];
    const spawn = (args) =>
      cli(['run', 'dev:spawnTroops', JSON.stringify({ playerId: scene.a, ...args })]);
    const [truck] = JSON.parse(
      spawn({ role: 'landTransport', count: 1, lon: 1.6, lat: 48.2 }).match(/\[[^\]]*\]/)[0],
    );
    spawn({ role: 'infantry', count: 2, lon: 1.6, lat: 48.2, carriedBy: truck });
    spawn({ role: 'landTransport', count: 1, lon: 3.4, lat: 47.6 });
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
    cli([
      'run',
      'dev:logisticsScene',
      JSON.stringify({ playerId: scene.a, fullDepot: tours, twin: twinTrucks }),
    ]);
  /** Un avion chargé à l'aérodrome, un point sans piste, une escouade isolée (ADR 0028 §4). */
  if (airdrops && scene.a !== null)
    cli(['run', 'dev:airdropScene', JSON.stringify({ playerId: scene.a })]);
  /** Un port à Marseille, un cargo à quai, un avant-poste côtier à Agde (#129). */
  if (navy && scene.a !== null)
    cli(['run', 'dev:navyScene', JSON.stringify({ playerId: scene.a })]);
  /** `--trajet-mixte` : un cargo et deux fantassins à bord, sur la côte de Boulogne (#302). Une
   *  colonne embarquée ne débarque que sur une côte et part d'un port ou d'une plage : la scène
   *  donne des traversées toutes en mer, jamais un trajet terre puis mer (aucune marche avant
   *  l'eau). Ce trajet-là attend une scène qui embarque des fantassins à quai (`dev:navyScene`). */
  if (process.argv.includes('--trajet-mixte') && scene.a !== null) {
    const spawn = (args) =>
      cli(['run', 'dev:spawnTroops', JSON.stringify({ playerId: scene.a, ...args })]);
    const at = { lon: 1.6, lat: 50.72 };
    const [cargo] = JSON.parse(spawn({ role: 'cargo', count: 1, ...at }).match(/\[[^\]]*\]/)[0]);
    spawn({ role: 'infantry', count: 2, ...at, carriedBy: cargo });
  }
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
  /** `--recrue` : une infanterie de rang 2 formée à la caserne, qui sort dans `recruitIn` secondes. */
  if (recruitIn !== null && scene.a !== null) {
    cli(['run', 'dev:grantCards', JSON.stringify({ playerId: scene.a, cards: ['infantryMk2'] })]);
    const { me } = await client.query(api.view.playerView, { token: tokenA, seasonId });
    const barracks = me.buildings.find((building) => building.key === 'barracks');
    places.recrue = barracks.point;
    await client.mutation(api.troops.recruit, {
      token: tokenA,
      seasonId,
      buildingId: barracks.id,
      role: 'infantry',
      tier: 2,
    });
    const finishing = cli([
      'run',
      'dev:finishRecruitments',
      JSON.stringify({ playerId: scene.a, afterMs: recruitIn * 1000 }),
    ]);
    if (Number(finishing.trim().split('\n').pop()) < 1)
      throw new Error('scène de la recrue : aucun lot daté');
  }
  if (oilLine && scene.a !== null)
    cli(['run', 'dev:oilLineScene', JSON.stringify({ playerId: scene.a })]);
  /** Bakou, Narvik, Singapour et Halifax tenus par la France, Dakar par l'adversaire, de quoi lire leurs règles. */
  if ((points || pillaging) && scene.a !== null && scene.b !== null) {
    cli(['run', 'dev:pointsScene', JSON.stringify({ playerId: scene.a, enemyId: scene.b })]);
  }
  if (points && scene.a !== null && scene.b !== null) {
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
  /** Deux fantassins marchent sur l'entrepôt relevé, arrivent, et leur présence est déjà entamée :
   *  trois caisses sur quatre sont tombées (`loadingAt`). */
  if (pillaging && scene.a !== null && scene.b !== null) {
    const warehouse = (
      await client.query(api.view.playerView, { token: tokenA, seasonId })
    ).surveyedInstallations.find((one) => one.key === 'warehouse');
    if (warehouse === undefined) throw new Error('scène du pillage : aucun entrepôt relevé');
    const [lon, lat] = warehouse.point;
    places.pillage = [lon, lat];
    const from = { lon: lon - 0.4, lat };
    cli([
      'run',
      'dev:spawnTroops',
      JSON.stringify({ playerId: scene.a, role: 'infantry', count: 2, ...from }),
    ]);
    const { me } = await client.query(api.view.playerView, { token: tokenA, seasonId });
    const column = me.troops.filter(
      (troop) =>
        troop.role === 'infantry' &&
        troop.stationedAt.kind === 'point' &&
        Math.abs(troop.stationedAt.lonLat[0] - from.lon) < 0.01,
    );
    await client.mutation(api.movements.plunder, {
      token: tokenA,
      seasonId,
      origin: { kind: 'point', point: from },
      troopIds: column.map((troop) => troop.id),
      buildingId: warehouse.id,
    });
    cli(['run', 'dev:arriveNow', JSON.stringify({ playerId: scene.a })]);
    for (let tries = 0; ; tries++) {
      await pause(500);
      const { movements } = await client.query(api.view.playerView, { token: tokenA, seasonId });
      if (movements.some((one) => one.mission?.phase === 'presence')) break;
      if (tries === 59) throw new Error('scène du pillage : la colonne n’est pas arrivée en 30 s');
    }
    const moved = cli([
      'run',
      'dev:pastPresence',
      JSON.stringify({ playerId: scene.a, hours: 1.5 }),
    ]);
    if (!/\b1\b/.test(moved)) throw new Error('scène du pillage : aucune présence en cours');
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
    /** Sous Rangoun, un camion de tournée seul à l'arrêt en Picardie : son mât montre la mi-portée. */
    if (rangoon && scene.b !== null)
      cli([
        'run',
        'dev:spawnTroops',
        JSON.stringify({
          playerId: scene.a,
          role: 'landTransport',
          count: 1,
          lon: 2.3,
          lat: 49.9,
          tourBase: lille.id,
        }),
      ]);
  }
  if (neighbours && scene.b !== null)
    cli(['run', 'dev:neighbourScene', JSON.stringify({ playerId: scene.b })]);
  if (quays && scene.a !== null)
    cli(['run', 'dev:quaysScene', JSON.stringify({ playerId: scene.a })]);
  if (islands && scene.a !== null) {
    const valletta = { lon: 14.513, lat: 35.895 };
    places.valette = [valletta.lon, valletta.lat];
    const offshore = { lon: 14.6, lat: 35.75 };
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
    cli(['run', 'dev:promoteHq', JSON.stringify({ playerId: scene.a, level: 2 })]);
    for (const [role, count, at] of [
      ['infantry', 2, offshore],
      ['cargo', 1, offshore],
      ['infantry', 1, { lon: 15.28, lat: 37.07 }],
    ])
      cli([
        'run',
        'dev:spawnTroops',
        JSON.stringify({ playerId: scene.a, role, count, lon: at.lon, lat: at.lat }),
      ]);
    const afloat = (await client.query(api.view.playerView, { token: tokenA, seasonId })).me.troops
      .filter((troop) => troop.stationedAt.kind === 'point')
      .filter((troop) => Math.abs(troop.stationedAt.lonLat[0] - offshore.lon) < 0.01);
    await client.mutation(api.movements.marchTo, {
      token: tokenA,
      seasonId,
      origin: { kind: 'point', point: offshore },
      troopIds: afloat.map((troop) => troop.id),
      point: valletta,
    });
    cli(['run', 'dev:arriveNow', JSON.stringify({ playerId: scene.a })]);
    await pause(3000);
    const founder = afloat.find((troop) => troop.role === 'infantry');
    await client.mutation(api.movements.foundOutpostHere, {
      token: tokenA,
      seasonId,
      point: valletta,
      regionId: 'MLT-5949',
      specialization: 'relay',
      troopIds: [founder.id],
    });
    await client.mutation(api.constructions.start, {
      token: tokenA,
      seasonId,
      building: 'port',
      regionId: 'MLT-5949',
      point: { lon: 14.5145, lat: 35.8998 },
    });
  }
  /** Mille pièces, des camps relevés, une dernière position, et deux mouvements (#234). */
  if (pins !== null && scene.a !== null && scene.b !== null) {
    for (let seed = 0, left = pins; ; seed++, left -= 100) {
      const piles = Math.max(0, Math.min(100, left));
      cli([
        'run',
        'dev:pinsScene',
        JSON.stringify({ playerId: scene.a, enemyId: scene.b, piles, seed }),
      ]);
      if (piles === 0) break;
    }
    const lone = { lon: 0.2, lat: 44.2 };
    const raider = { lon: 7.55, lat: 49.3 };
    cli([
      'run',
      'dev:spawnTroops',
      JSON.stringify({ playerId: scene.a, role: 'infantry', count: 1, ...lone }),
    ]);
    const { me } = await client.query(api.view.playerView, { token: tokenA, seasonId });
    const marcher = me.troops.find(
      (troop) =>
        troop.stationedAt.kind === 'point' &&
        Math.abs(troop.stationedAt.lonLat[0] - lone.lon) < 0.01,
    );
    await client.mutation(api.movements.marchTo, {
      token: tokenA,
      seasonId,
      origin: { kind: 'point', point: lone },
      troopIds: [marcher.id],
      point: { lon: -3.7, lat: 40.4 },
    });
    const theirs = (await client.query(api.view.playerView, { token: tokenB, seasonId })).me.troops;
    const runner = theirs.find(
      (troop) =>
        troop.stationedAt.kind === 'point' &&
        Math.abs(troop.stationedAt.lonLat[0] - raider.lon) < 0.01,
    );
    await client.mutation(api.movements.marchTo, {
      token: tokenB,
      seasonId,
      origin: { kind: 'point', point: raider },
      troopIds: [runner.id],
      point: { lon: 5.2, lat: 47.5 },
    });
  }
  if (threads && scene.a !== null) {
    const legs = [
      { role: 'infantry', from: { lon: 2.4, lat: 48.9 }, to: { lon: 13.4, lat: 52.5 } },
      { role: 'escort', from: { lon: -4.9, lat: 48.2 }, to: { lon: 5.3, lat: 43.1 }, fuel: 20 },
    ];
    for (const { role, from, fuel } of legs)
      cli([
        'run',
        'dev:spawnTroops',
        JSON.stringify({ playerId: scene.a, role, count: 1, fuel, ...from }),
      ]);
    const { me } = await client.query(api.view.playerView, { token: tokenA, seasonId });
    for (const { role, from, to } of legs) {
      const troop = me.troops.find(
        (one) =>
          one.role === role &&
          one.stationedAt.kind === 'point' &&
          Math.abs(one.stationedAt.lonLat[0] - from.lon) < 0.01,
      );
      await client.mutation(api.movements.marchTo, {
        token: tokenA,
        seasonId,
        origin: { kind: 'point', point: from },
        troopIds: [troop.id],
        point: to,
      });
    }
  }
  if ((combatIn !== null || replaying) && scene.a !== null && scene.b !== null) {
    const garrison = { lon: 4.94, lat: 49.7 };
    places.combat = [garrison.lon, garrison.lat];
    const from = { lon: 4.72, lat: 49.66 };
    const spawn = (playerId, role, count, at) =>
      JSON.parse(
        cli(['run', 'dev:spawnTroops', JSON.stringify({ playerId, role, count, ...at })]).match(
          /\[[^\]]*\]/,
        )[0],
      );
    for (const [role, count] of [
      ['infantry', 2],
      ['armor', 1],
    ])
      spawn(scene.b, role, count, garrison);
    const column = [...spawn(scene.a, 'infantry', 2, from), ...spawn(scene.a, 'armor', 1, from)];
    // A garrison is attacked once seen: the column relieves it first.
    cli(['run', 'dev:benchReassess', JSON.stringify({ seasonId })]);
    const { camps } = await client.query(api.view.playerView, { token: tokenA, seasonId });
    const camp = camps.find((one) => Math.abs(one.point[0] - garrison.lon) < 0.05);
    await client.mutation(api.movements.attack, {
      token: tokenA,
      seasonId,
      origin: { kind: 'point', point: from },
      troopIds: column,
      target: { kind: 'camp', campId: camp.id },
    });
    cli([
      'run',
      'dev:arriveNow',
      JSON.stringify({ playerId: scene.a, afterMs: replaying ? 0 : combatIn * 1000 }),
    ]);
    /** `--rejeu` : le combat est passé quand le compte rendu paraît dans la vue. */
    if (replaying) {
      for (let tries = 0; tries < 30; tries++) {
        await pause(1000);
        const { reports } = await client.query(api.view.playerView, { token: tokenA, seasonId });
        if (reports.length > 0) break;
        if (tries === 29) throw new Error('scène du rejeu : aucun combat résolu en 30 s');
      }
    }
  }
  /** Les fantassins et les chars entrent dans la caserne (#265). */
  if ((scale || razing) && scene.a !== null) {
    const { me } = await client.query(api.view.playerView, { token: tokenA, seasonId });
    const barracks = me.buildings.find((building) => building.key === 'barracks');
    const from = { lon: 2.0, lat: 48.6 };
    for (const [role, count] of [
      ['infantry', 3],
      ['armor', 2],
    ]) {
      const start = { lon: from.lon + count / 10, lat: from.lat };
      const spawned = JSON.parse(
        cli([
          'run',
          'dev:spawnTroops',
          JSON.stringify({ playerId: scene.a, role, count, ...start }),
        ]).match(/\[[^\]]*\]/)[0],
      );
      await client.mutation(api.movements.enterGarrison, {
        token: tokenA,
        seasonId,
        origin: { kind: 'point', point: start },
        troopIds: spawned,
        buildingId: barracks.id,
      });
    }
    cli([
      'run',
      'dev:spawnTroops',
      JSON.stringify({ playerId: scene.a, role: 'armor', count: 2, lon: 1.9, lat: 47.9 }),
    ]);
    cli(['run', 'dev:arriveNow', JSON.stringify({ playerId: scene.a })]);
  }
  /** Des unités seules (#301) : le camion du QG, l'avion de l'aérodrome et la coque du port sont
   *  chacun seuls dans leur garnison ; un camion seul sur un point (avec `--chargee`, il porte un
   *  fantassin), et un char seul sur un autre. */
  if (scale && lone && scene.a !== null) {
    const spawn = (role, lon, lat, carriedBy) =>
      JSON.parse(
        cli([
          'run',
          'dev:spawnTroops',
          JSON.stringify({ playerId: scene.a, role, count: 1, lon, lat, carriedBy }),
        ]).match(/\[[^\]]*\]/)[0],
      );
    const [truck] = spawn('landTransport', 2.4, 47.2);
    if (loaded) spawn('infantry', 2.4, 47.2, truck);
    spawn('armor', 3.1, 47.6);
    cli(['run', 'dev:arriveNow', JSON.stringify({ playerId: scene.a })]);
  }
  if (depositsAt && scene.a !== null && scene.b !== null)
    cli(['run', 'dev:depositsScene', JSON.stringify({ playerId: scene.a, enemyId: scene.b })]);
  if (lisbon && scene.a !== null)
    cli(['run', 'dev:holdPoint', JSON.stringify({ playerId: scene.a, key: 'lisbon' })]);
  if (harvest) {
    if (fullBin)
      cli(['run', 'dev:fillStocks', JSON.stringify({ seasonId, stock: 400, only: 'coal' })]);
    cli([
      'run',
      'dev:pastVisit',
      JSON.stringify({
        seasonId,
        hours: 9,
        gains: fullBin
          ? { food: 72, steel: 72, coal: 36, oil: -36 }
          : { food: 108, steel: 72, oil: -30 },
      }),
    ]);
  }
}

if (editions)
  for (const round of [0, 1]) {
    if (round > 0) await pause(1200);
    cli(['run', 'press:writeEditionJob', JSON.stringify({ seasonId })]);
  }

writeFileSync(
  accountsFile,
  `${JSON.stringify({ ...saved, ...accounts, code, seasonId, places }, null, 2)}\n`,
);
console.log(`Mondiale lancée : code ${code}, saison ${seasonId}`);
console.log(`Comptes : ${accounts.a.nickname} (a), ${accounts.b.nickname} (b) → ${accountsFile}`);
