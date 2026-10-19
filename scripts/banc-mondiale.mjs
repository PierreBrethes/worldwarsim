/**
 * **Le banc de charge de la Mondiale** (#143) : huit joueurs, cent cinquante troupes chacun, une
 * centaine de mouvements en vol, des avant-postes aux dépôts entamés, une tournée par joueur, et
 * un brouillard qui se croise (tous les départs tiennent dans un même carré d'Europe). Puis il
 * mesure et imprime le tableau qui sert de référence « avant » aux optimisations.
 *
 *     npm run banc:mondiale
 *
 * Refuse tout backend qui n'est pas 127.0.0.1 ou localhost. Les fonctions `dev:bench*` doivent
 * être déployées (`npx convex deploy`). Les chiffres viennent du backend lui-même : le flux de
 * journaux `/api/stream_function_logs` donne, pour chaque exécution, `executionTime` et
 * `usageStats.databaseReadDocuments` — plus fiable qu'un chronomètre client, qui ajoute le réseau,
 * et la seule source du nombre de documents lus. Les mesures sont la médiane de trois passes.
 */
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ConvexHttpClient } from 'convex/browser';
import { makeFunctionReference } from 'convex/server';
import { api } from '../convex/_generated/api.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const accountsFile = fileURLToPath(new URL('./banc-mondiale.accounts.json', import.meta.url));
const PLAYERS = 8;
const TROOPS = 150;
const SQUADS = 23;
const SQUAD_SIZE = 3;
/** Un joueur ne vole pas : sa place sert à mesurer `march` sans que ses slots soient pris. */
const MEASURED = 0;

const env = Object.fromEntries(
  (existsSync(`${root}.env.local`) ? readFileSync(`${root}.env.local`, 'utf8') : '')
    .split('\n')
    .map((line) => line.match(/^([A-Z_]+)=(.*)$/))
    .filter(Boolean)
    .map(([, key, value]) => [key, value.trim().replace(/^['"]|['"]$/g, '')]),
);
const url = process.env.VITE_CONVEX_URL ?? env.VITE_CONVEX_URL;
const adminKey = process.env.CONVEX_SELF_HOSTED_ADMIN_KEY ?? env.CONVEX_SELF_HOSTED_ADMIN_KEY;
if (!url || !adminKey)
  throw new Error('VITE_CONVEX_URL ou CONVEX_SELF_HOSTED_ADMIN_KEY absent (.env.local)');
for (const target of [
  url,
  process.env.CONVEX_SELF_HOSTED_URL ?? env.CONVEX_SELF_HOSTED_URL ?? url,
]) {
  if (!['127.0.0.1', 'localhost'].includes(new URL(target).hostname))
    throw new Error(`Refus : ${target} n'est pas un backend local.`);
}

const client = new ConvexHttpClient(url);
const admin = new ConvexHttpClient(url);
admin.setAdminAuth(adminKey);
const internal = (name) => makeFunctionReference(name);
const pause = (ms) => new Promise((done) => setTimeout(done, ms));
const rand = (spread) => (Math.random() * 2 - 1) * spread;
/** Un isolat froid décode la grille des routes : le premier appel dépasse parfois la seconde permise. */
const coldRetry = async (call) => {
  for (let attempt = 0; ; attempt++)
    try {
      return await call();
    } catch (error) {
      if (attempt >= 3 || !String(error.message).includes('timed out')) throw error;
    }
};
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

/** Le flux de journaux du backend : une page de complétions après `cursor`. */
async function logPage(cursor) {
  const reply = await fetch(`${url}/api/stream_function_logs?cursor=${cursor}`, {
    headers: { Authorization: `Convex ${adminKey}` },
  });
  if (!reply.ok) throw new Error(`stream_function_logs ${reply.status}`);
  return reply.json();
}
let cursor = (await logPage(0)).newCursor;

/** Lance `call`, puis lit dans le flux la complétion de `identifier` : durée et documents lus. */
async function measured(identifier, call) {
  const from = cursor;
  let failure = null;
  try {
    await call();
  } catch (error) {
    failure = error;
  }
  for (let attempt = 0; attempt < 40; attempt++) {
    const page = await logPage(from);
    const hit = page.entries.findLast(
      (entry) => entry.kind === 'Completion' && entry.identifier === identifier,
    );
    if (hit) {
      cursor = page.newCursor;
      const timedOut = hit.error?.includes('timed out') ?? false;
      if (failure !== null && !timedOut) throw failure;
      return {
        timedOut,
        ms: hit.executionTime * 1000,
        read: hit.usageStats.databaseReadDocuments,
        written: hit.usageStats.databaseWriteDocuments,
      };
    }
    await pause(250);
  }
  throw new Error(`aucune complétion de ${identifier} dans le flux`);
}
const passes = async (identifier, call, n = 3) => {
  const runs = [];
  for (let k = 0; k < n; k++) runs.push(await measured(identifier, call));
  return {
    ms: median(runs.map((run) => run.ms)),
    read: median(runs.map((run) => run.read)),
    written: median(runs.map((run) => run.written)),
  };
};

// --- comptes -----------------------------------------------------------------------------------
const saved = existsSync(accountsFile) ? JSON.parse(readFileSync(accountsFile, 'utf8')) : [];
const accounts = Array.from(
  { length: PLAYERS },
  (_, k) =>
    saved[k] ?? {
      nickname: `Banc${String(k + 1)}`,
      password: randomBytes(9).toString('base64url'),
    },
);
writeFileSync(accountsFile, JSON.stringify(accounts, null, 2));
const tokens = [];
for (const account of accounts) {
  try {
    tokens.push((await client.action(api.auth.login, account)).token);
  } catch {
    await pause(400);
    tokens.push((await client.action(api.auth.register, account)).token);
  }
  await pause(400);
}

// --- la saison ---------------------------------------------------------------------------------
const { code, seasonId } = await client.mutation(api.seasons.create, {
  token: tokens[0],
  compensation: 0,
  mode: 'mondiale',
});
for (const token of tokens.slice(1)) await client.mutation(api.seasons.join, { token, code });
const nations = ['france', 'uk', 'germany', 'italy', 'ussr', 'usa', 'japan', 'china'];
for (const [k, token] of tokens.entries()) {
  await client.mutation(api.players.reserveNation, { token, seasonId, nation: nations[k] });
  await client.mutation(api.players.declareReady, { token, seasonId, ready: true });
}
await client.mutation(api.seasons.launch, { token: tokens[0], seasonId });
const places = await admin.query(internal('dev:benchPlayers'), { seasonId });
const playerOf = (k) => places.find((place) => place.nation === nations[k]).id;

// --- les troupes, les avant-postes, les tournées ----------------------------------------------
/** Tous les départs dans un carré d'Europe centrale : les rayons de détection se croisent. */
const HEART = { lon: 8, lat: 50 };
const around = (spread) => ({ lon: HEART.lon + rand(spread), lat: HEART.lat + rand(spread) });
const scenes = [];
for (let k = 0; k < PLAYERS; k++) {
  const reserve = around(0.8);
  scenes.push({
    reserve,
    ...(await admin.mutation(internal('dev:benchScene'), {
      playerId: playerOf(k),
      squads: Array.from({ length: SQUADS }, () => around(0.8)),
      reserve: { at: reserve, count: TROOPS - SQUADS * SQUAD_SIZE - 1 },
      outposts: Array.from({ length: 4 }, () => around(1.2)),
    })),
  });
}
let tours = 0;
for (let k = 0; k < PLAYERS; k++) {
  if (k === MEASURED) continue;
  try {
    await client.mutation(api.tours.start, {
      token: tokens[k],
      seasonId,
      troopId: scenes[k].truckId,
      stops: scenes[k].outpostIds.slice(1),
    });
    tours += 1;
  } catch (error) {
    console.warn(`tournée ${String(k)} refusée : ${String(error.data?.code ?? error.message)}`);
  }
}

// --- les mouvements en vol, par étages : le brouillard est relu à chaque étage -----------------
/** Un joueur après l'autre, puis tour à tour : le plateau se remplit de tous les côtés à la fois. */
const queue = [];
for (let s = 0; s < SQUADS; s++)
  for (let k = 0; k < PLAYERS; k++)
    if (k !== MEASURED)
      queue.push({ k, ids: scenes[k].squads[s].ids, from: scenes[k].squads[s].at, tries: 0 });
const STAGES = [20, 40, 80, 120, queue.length];
const ramp = [];
let flights = 0;
for (const stage of STAGES) {
  while (flights < stage && queue.length > 0) {
    /** Un départ par appel : chacun relit le brouillard de son joueur, comme un vrai `march`. */
    const group = queue.splice(0, 1);
    const byPlayer = Map.groupBy(group, (flight) => flight.k);
    for (const [k, mine] of byPlayer) {
      const result = await coldRetry(() =>
        admin.mutation(internal('dev:benchFlights'), {
          playerId: playerOf(k),
          flights: mine.map(({ ids, from }) => ({ ids, from, to: around(2.5) })),
        }),
      );
      flights += result.filed;
      for (const index of result.failedAt)
        if (mine[index].tries < 3) queue.push({ ...mine[index], tries: mine[index].tries + 1 });
    }
  }
  const run = await measured('dev:benchReassess', () =>
    admin.mutation(internal('dev:benchReassess'), { seasonId }),
  );
  const seen = await measured('view:playerView', () =>
    client.query(api.view.playerView, { token: tokens[1], seasonId }),
  );
  ramp.push({ flights, ...run, view: seen });
}

// --- les mesures -------------------------------------------------------------------------------
const viewRuns = [];
for (const token of tokens.slice(1, 4))
  viewRuns.push(
    await measured('view:playerView', () => client.query(api.view.playerView, { token, seasonId })),
  );
const view = {
  timedOut: viewRuns.some((run) => run.timedOut),
  ms: median(viewRuns.map((run) => run.ms)),
  read: median(viewRuns.map((run) => run.read)),
  written: 0,
};
const reassess = await passes('dev:benchReassess', () =>
  admin.mutation(internal('dev:benchReassess'), { seasonId }),
);
const stats = await admin.query(internal('dev:benchStats'), { seasonId });
/** Le joueur mesuré a deux slots : deux départs, deux chiffres. */
const marches = [];
for (const squad of scenes[MEASURED].squads.slice(0, 2))
  marches.push(
    await measured('movements:marchTo', () =>
      client.mutation(api.movements.marchTo, {
        token: tokens[MEASURED],
        seasonId,
        origin: { kind: 'point', point: squad.at },
        troopIds: squad.ids,
        point: around(2.5),
      }),
    ),
  );

/** Et un joueur qui a déjà vingt-trois colonnes en vol : son départ relit tout ce qu'il voit et
 *  tout ce qu'on voit de lui. Ses slots sont pris, donc le vrai `march` passe par le banc. */
const BUSY = 1;
const busy = await measured('dev:benchFlights', () =>
  admin.mutation(internal('dev:benchFlights'), {
    playerId: playerOf(BUSY),
    flights: [
      { ids: scenes[BUSY].reserveIds.slice(1, 4), from: scenes[BUSY].reserve, to: around(2.5) },
    ],
  }),
);

const fixed = (n, d = 1) => n.toFixed(d);
/** Une exécution qui dépasse la seconde permise est coupée et ne laisse rien : on le dit. */
const cell = (run) => (run.timedOut ? `${fixed(run.ms)} (coupée à 1 s)` : fixed(run.ms));
console.log(
  `\nBanc Mondiale — ${String(PLAYERS)} joueurs, ${String(stats.troops)} troupes, ${String(flights)} mouvements en vol, ${String(stats.outposts)} avant-postes, ${String(tours)} tournées`,
);
console.log(
  "Source : /api/stream_function_logs du backend local (executionTime, databaseReadDocuments), médiane de 3 passes (playerView : 3 joueurs, le cache des requêtes rendrait 0 à une répétition). Une exécution coupée à 1 s ne rend que ce qu'elle avait lu.\n",
);
console.log('| Mesure | Durée (ms) | Documents lus | Documents écrits |');
console.log('|---|---:|---:|---:|');
console.log(
  `| \`playerView\` (un joueur) | ${cell(view)} | ${String(view.read)} | ${String(view.written)} |`,
);
console.log(
  `| \`reassessDetection\` (saison) | ${cell(reassess)} | ${String(reassess.read)} | ${String(reassess.written)} |`,
);
for (const [k, run] of marches.entries())
  console.log(
    `| \`march\` sous charge (\`marchTo\` n°${String(k + 1)}) | ${cell(run)} | ${String(run.read)} | ${String(run.written)} |`,
  );
console.log(
  `| \`march\` d'un joueur aux 23 colonnes en vol | ${cell(busy)} | ${String(busy.read)} | ${String(busy.written)} |`,
);
console.log(`| Jobs planifiés en attente | ${String(stats.pendingJobs)} | | |`);
console.log('\nMontée en charge de `reassessDetection` :\n');
console.log(
  '| Mouvements en vol | `reassessDetection` (ms) | docs lus | `playerView` (ms) | docs lus |',
);
console.log('|---:|---:|---:|---:|---:|');
for (const step of ramp)
  console.log(
    `| ${String(step.flights)} | ${cell(step)} | ${String(step.read)} | ${cell(step.view)} | ${String(step.view.read)} |`,
  );
console.log(`\nsaison ${seasonId}, code ${code}`);
