/**
 * **Une Mondiale locale où des bots jouent seuls** (#601, ADR 0042). Chaque bot est un joueur :
 * il lit sa vue, décide par `decideTurn` (`src/domain/bot.ts`) et passe ses ordres par les
 * mutations publiques avec son jeton. Ni `internal*` ni `dev:*`.
 *
 *     npm run bots:mondiale -- [--bots N] [--humains H] [--cadence s] [--code CODE]
 *
 * Sans `--code`, le script fonde la saison, imprime son lien et attend les places prêtes (les
 * bots, plus `--humains` joueurs) avant de la lancer. Avec `--code`, les bots rejoignent la
 * saison d'un humain, qui la lance lui-même. Comptes et saison : `scripts/bots-mondiale.accounts.json`
 * (ignoré par git, même format que celui de la démo : `capture.mjs --comptes … --compte a`).
 * Ctrl-C ou la fin de la saison arrêtent la boucle. Refuse tout backend non local.
 */
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ConvexHttpClient } from 'convex/browser';
import { runnerImport } from 'vite';
import { api } from '../convex/_generated/api.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const accountsFile = fileURLToPath(new URL('./bots-mondiale.accounts.json', import.meta.url));
const pause = (ms) => new Promise((done) => setTimeout(done, ms));

const optionOf = (name, fallback) => {
  const at = process.argv.indexOf(`--${name}`);
  return at < 0 ? fallback : process.argv[at + 1];
};
const MAX_PLAYERS = 8; // MODE_RULES.mondiale.maxPlayers
const bots = Math.min(Number(optionOf('bots', 2)), MAX_PLAYERS);
const humans = Number(optionOf('humains', 0));
/** @a-mesurer : secondes entre deux passages d'un bot. */
const cadence = Number(optionOf('cadence', 30));
const joinCode = optionOf('code', null);
if (!(bots >= 1) || !(humans >= 0) || !(cadence > 0))
  throw new Error('--bots, --humains, --cadence');
if (bots + humans > MAX_PLAYERS) throw new Error(`Au plus ${MAX_PLAYERS} places.`);
if (joinCode === null && bots + humans < 2)
  throw new Error('Une Mondiale veut deux places : --bots 2 au moins.');

// Seule la clé `VITE_CONVEX_URL` est lue de `.env.local` : jamais la clé admin.
const envFile = `${root}.env.local`;
const fromFile = existsSync(envFile)
  ? readFileSync(envFile, 'utf8')
      .match(/^VITE_CONVEX_URL=(.*)$/m)?.[1]
      ?.trim()
  : undefined;
const url = process.env.VITE_CONVEX_URL ?? fromFile;
if (!url) throw new Error('VITE_CONVEX_URL absent (.env.local)');
if (!['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) {
  throw new Error(`Refus : ${url} n'est pas un backend local.`);
}

/** Le décideur est du TS sans extensions d'import : vite le charge, jamais Node tel quel. */
const load = async (file) =>
  (
    await runnerImport(`${root}src/${file}`, {
      configFile: false,
      root,
      resolve: { alias: { '@': `${root}src` } },
    })
  ).module;
const { decideTurn, worldFrom } = await load('domain/bot.ts');
const { adaptServerView } = await load('data/serverView.ts');
const read = (name) => JSON.parse(readFileSync(`${root}public/${name}`, 'utf8'));
const world = worldFrom({
  projection: read('projection.json'),
  grid: read('grid.json'),
  coast: read('coast.json'),
  regionGrid: read('region-grid.json'),
  regionIndex: read('region-index.json'),
});

const NATIONS = ['france', 'uk', 'usa', 'ussr', 'germany', 'japan', 'italy', 'china'];
const KEYS = 'abcdefgh'.split('');
const client = new ConvexHttpClient(url);
const saved = existsSync(accountsFile) ? JSON.parse(readFileSync(accountsFile, 'utf8')) : {};
const accounts = Object.fromEntries(
  KEYS.slice(0, bots).map((key, k) => [
    key,
    saved[key] ?? { nickname: `Bot${k + 1}`, password: randomBytes(9).toString('base64url') },
  ]),
);
const save = (extra = {}) =>
  writeFileSync(accountsFile, `${JSON.stringify({ ...accounts, ...extra }, null, 2)}\n`);

const LOGIN_MIN_INTERVAL_MS = 3_000; // src/domain/account.ts
const REGISTER_MIN_INTERVAL_MS = 400; // la garde serveur est à 250 ms
/** Connexion, puis inscription si le compte n'existe pas ; `LOGIN_TOO_FAST` attend et retente. */
async function signIn({ nickname, password }) {
  for (;;) {
    try {
      return (await client.action(api.auth.login, { nickname, password })).token;
    } catch (error) {
      if (String(error).includes('LOGIN_TOO_FAST')) {
        await pause(LOGIN_MIN_INTERVAL_MS + 200);
        continue;
      }
      if (!String(error).includes('BAD_CREDENTIALS')) throw error;
      await pause(REGISTER_MIN_INTERVAL_MS);
      return (await client.action(api.auth.register, { nickname, password })).token;
    }
  }
}
/** Un pseudo pris par un compte au mot de passe inconnu (`NICKNAME_TAKEN`) en reçoit un neuf. */
async function signInOrRename(key, k) {
  try {
    return await signIn(accounts[key]);
  } catch (error) {
    if (!String(error).includes('NICKNAME_TAKEN')) throw error;
    accounts[key] = {
      nickname: `Bot${k + 1}${randomBytes(2).toString('hex')}`,
      password: randomBytes(9).toString('base64url'),
    };
    console.log(`${key} : pseudo pris, nouveau pseudo ${accounts[key].nickname}`);
    await pause(REGISTER_MIN_INTERVAL_MS);
    return await signIn(accounts[key]);
  }
}

let stopped = false;
let wake = () => {};
process.on('SIGINT', () => {
  stopped = true;
  wake();
});
const nap = (ms) =>
  new Promise((done) => {
    const timer = setTimeout(done, ms);
    wake = () => {
      clearTimeout(timer);
      done();
    };
  });

const tokens = [];
for (const [k, key] of KEYS.slice(0, bots).entries()) {
  if (tokens.length > 0) await pause(REGISTER_MIN_INTERVAL_MS);
  tokens.push(await signInOrRename(key, k));
}

let seasonId;
let code;
if (joinCode === null) {
  ({ code, seasonId } = await client.mutation(api.seasons.create, {
    token: tokens[0],
    compensation: 0,
    mode: 'mondiale',
  }));
  for (const token of tokens.slice(1)) await client.mutation(api.seasons.join, { token, code });
} else {
  code = joinCode.toUpperCase();
  for (const token of tokens)
    ({ seasonId } = await client.mutation(api.seasons.join, { token, code }));
}
save({ seasonId, code });
console.log(`Saison ${code} : http://localhost:5173/rejoindre/${code}`);

/** Chaque bot prend la première nation libre (`NATION_TAKEN` → la suivante), puis se déclare prêt. */
for (const token of tokens) {
  for (const nation of NATIONS) {
    try {
      await client.mutation(api.players.reserveNation, { token, seasonId, nation });
      break;
    } catch (error) {
      if (!String(error).includes('NATION_TAKEN')) throw error;
    }
  }
  await client.mutation(api.players.declareReady, { token, seasonId, ready: true });
}

const lobbyOf = () => client.query(api.seasons.lobby, { token: tokens[0], seasonId });
if (joinCode === null) {
  console.log(`J'attends ${bots + humans} places prêtes (${bots} bots, ${humans} humains)…`);
  while (!stopped) {
    const lobby = await lobbyOf();
    if (lobby.players.length >= bots + humans && lobby.players.every((p) => p.ready)) {
      try {
        await client.mutation(api.seasons.launch, { token: tokens[0], seasonId });
        break;
      } catch (error) {
        console.log(`Lancement refusé : ${String(error).split('\n')[0]}`);
      }
    }
    await nap(2_000);
  }
} else {
  console.log("J'attends que l'humain lance la saison…");
  while (!stopped && (await lobbyOf()).status === 'lobby') await nap(2_000);
}
if (!stopped) console.log('Saison lancée : les bots jouent.');

/** Un ordre du décideur → sa mutation publique. Les ids de la vue sont des `string` : le serveur les valide. */
function submit(seat, order) {
  const { fn, args } = order;
  const origin = (o) =>
    o.kind === 'building' ? { kind: 'building', buildingId: o.buildingId } : o;
  switch (fn) {
    case 'constructions.start':
      return client.mutation(api.constructions.start, { ...seat, ...args });
    case 'troops.recruit':
      return client.mutation(api.troops.recruit, { ...seat, ...args });
    case 'movements.attack':
      return client.mutation(api.movements.attack, {
        ...seat,
        origin: origin(args.origin),
        troopIds: args.troopIds,
        target: { kind: 'camp', campId: args.target.campId },
      });
    case 'movements.marchTo':
      return client.mutation(api.movements.marchTo, {
        ...seat,
        origin: origin(args.origin),
        troopIds: args.troopIds,
        point: args.point,
      });
    case 'movements.enterGarrison':
      return client.mutation(api.movements.enterGarrison, {
        ...seat,
        origin: origin(args.origin),
        troopIds: args.troopIds,
        buildingId: args.buildingId,
      });
    case 'movements.foundOutpostHere':
      return client.mutation(api.movements.foundOutpostHere, { ...seat, ...args });
    case 'logistics.load':
      return client.mutation(api.logistics.load, { ...seat, ...args });
    case 'tours.start':
      return client.mutation(api.tours.start, { ...seat, ...args });
    default:
      throw new Error(`ordre inconnu : ${fn}`);
  }
}

const first = (error) => String(error).split('\n')[0];
let passNumber = 0;
while (!stopped) {
  passNumber += 1;
  for (const [k, token] of tokens.entries()) {
    if (stopped) break;
    const name = accounts[KEYS[k]].nickname;
    const seat = { token, seasonId };
    let orders;
    try {
      const view = adaptServerView(await client.query(api.view.playerView, seat));
      const workshop = await client.query(api.troops.workshop, seat);
      orders = decideTurn({ view, workshop, world, now: Date.now() });
    } catch (error) {
      if (String(error).includes('SEASON_CONCLUDED')) stopped = true;
      console.log(`${name} : lecture refusée (${first(error)})`);
      continue;
    }
    for (const order of orders) {
      try {
        await submit(seat, order);
        console.log(`#${passNumber} ${name} : ${order.fn}`);
      } catch (error) {
        if (String(error).includes('SEASON_CONCLUDED')) stopped = true;
        console.log(`#${passNumber} ${name} : ${order.fn} refusé (${first(error)})`);
      }
    }
  }
  if (stopped) break;
  try {
    if ((await lobbyOf()).status === 'concluded') stopped = true;
  } catch (error) {
    console.log(`salon illisible (${first(error)})`);
  }
  if (!stopped) await nap(cadence * 1_000);
}
console.log('Fin de la boucle.');
process.exit(0);
