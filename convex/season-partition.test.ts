import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { api } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import type { LonLat } from '../src/domain/geo';
import { landCostOf } from '../src/domain/movement-orders';
import { nominalStrength, routeMinutes, SCOUT_RADIUS_KM } from './constants';
import { GAME_TABLES } from './dev';
import { regionFacts } from './regions';
import { routeBetween } from './routes';
import schema from './schema';
import { modules } from './test.setup';

/**
 * **Two seasons stand at the same time, and neither may read the other.** Since the multi-game
 * lobby the production database carries several boards at once, and the skirmish will be played
 * while test games are still lying around. A sweep of `troops` or `movements` without a season
 * filter is not a balance problem, it is contamination between games: a column of one caught by
 * a garrison of another, a defence counting somebody else's soldiers, a relay from elsewhere
 * carrying a march here.
 *
 * The two guards below are the same rule read twice — once on the board, once on the source.
 */

const boot = () => convexTest(schema, modules);

const MARNE = 'FRA-5323'; // where the column leaves from
const PRAHOVA = 'ROU-310'; // Romanian oil, 1 800 km east — nobody's home country
const MIDDAY = new Date(2026, 7, 17, 12, 0, 0);

const pointOf = (regionId: string): LonLat => regionFacts(regionId)!.point;
const asPoint = (point: LonLat) => ({ lon: point[0], lat: point[1] });

/** A whole season of its own, launched, with its two seats named — so that a test can hold two
 *  of them at once and tell every row apart by the season it was written in. */
async function launchedSeason(t: ReturnType<typeof boot>, host: string, visitor: string) {
  const { code, token } = await t.mutation(api.seasons.create, {
    nickname: host,
    format: 'skirmish',
    durationHours: 48,
    compensation: 0.5,
  });
  const { token: guest } = await t.mutation(api.seasons.join, { code, nickname: visitor });
  await t.mutation(api.players.reserveNation, { token, nation: 'france' });
  await t.mutation(api.players.declareReady, { token, ready: true });
  await t.mutation(api.players.reserveNation, { token: guest, nation: 'ussr' });
  await t.mutation(api.players.declareReady, { token: guest, ready: true });
  await t.mutation(api.seasons.launch, { token });
  return { token, guest };
}

async function playerOf(t: ReturnType<typeof boot>, token: string) {
  return t.run(async (ctx) => {
    const player = await ctx.db
      .query('players')
      .withIndex('byToken', (q) => q.eq('token', token))
      .unique();
    if (!player) throw new Error('player not found');
    return player;
  });
}

/** The endowment taken back, so every soldier in the case was put there by the case. */
async function disbandTheGift(t: ReturnType<typeof boot>, ...tokens: ReadonlyArray<string>) {
  for (const token of tokens) {
    const { _id: playerId } = await playerOf(t, token);
    await t.run(async (ctx) => {
      const held = await ctx.db
        .query('troops')
        .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
        .collect();
      for (const troop of held) await ctx.db.delete(troop._id);
    });
  }
}

async function raise(t: ReturnType<typeof boot>, token: string, regionId: string) {
  const { _id: playerId, seasonId } = await playerOf(t, token);
  return t.run(async (ctx) =>
    ctx.db.insert('buildings', { seasonId, playerId, key: 'barracks', regionId, level: 1 }),
  );
}

async function form(
  t: ReturnType<typeof boot>,
  token: string,
  stationedAt: Doc<'troops'>['stationedAt'],
) {
  const { _id: playerId, seasonId } = await playerOf(t, token);
  const strength = nominalStrength('infantry', 1);
  return t.run(async (ctx) =>
    ctx.db.insert('troops', {
      seasonId,
      playerId,
      role: 'infantry',
      tier: 1,
      nominalStrength: strength,
      currentStrength: strength,
      stationedAt,
    }),
  );
}

async function plant(
  t: ReturnType<typeof boot>,
  token: string,
  point: LonLat,
  specialization: Doc<'outposts'>['specialization'],
) {
  const { _id: playerId, seasonId } = await playerOf(t, token);
  return t.run(async (ctx) =>
    ctx.db.insert('outposts', {
      seasonId,
      playerId,
      point: asPoint(point),
      hostCountry: 'ROU',
      level: 1,
      specialization,
      foundedAt: Date.now(),
      disabledUntil: null,
      immuneUntil: null,
    }),
  );
}

describe('a season reads its own board and no other', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('lets nothing from a second season meet, watch or carry a column of the first', async () => {
    const t = boot();
    const here = await launchedSeason(t, 'Pierre', 'Léa');
    const elsewhere = await launchedSeason(t, 'Camille', 'Nour');
    await disbandTheGift(t, here.token, here.guest, elsewhere.token, elsewhere.guest);

    /**
     * **Everything the other season could contaminate this one with**, planted on the very road
     * the column is about to walk and in the very region it is walking at: a garrison to answer
     * the arrival, a manned outpost and a camp to catch it on the way, a listening point to file
     * a sighting on it, and a relay to carry it faster than it should go.
     */
    const road = routeBetween(pointOf(MARNE), pointOf(PRAHOVA), 'land', landCostOf(['infantry']))!;
    const halfway = road.points[Math.floor(road.points.length / 2)]!;

    const theirBarracks = await raise(t, elsewhere.guest, PRAHOVA);
    const theirGarrison = await form(t, elsewhere.guest, theirBarracks);
    const theirOutpost = await plant(t, elsewhere.guest, halfway, 'relay');
    const theirSentries = await form(t, elsewhere.guest, theirOutpost);
    const theirCamp = await form(t, elsewhere.guest, asPoint(halfway));
    await plant(t, elsewhere.guest, halfway, 'listening');
    await plant(t, elsewhere.token, halfway, 'relay');

    const barracks = await raise(t, here.token, MARNE);
    const troop = await form(t, here.token, barracks);
    const sent = await t.mutation(api.movements.attack, {
      token: here.token,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [troop],
      target: { kind: 'region', regionId: PRAHOVA },
    });

    /** **A relay of another game does not shorten this road.** The trip is priced at what the
     *  route costs and nothing else — an acceleration would be the quietest of the three leaks,
     *  since nothing on the board would say where the hours went. */
    expect(sent.minutes).toBe(routeMinutes(road.costUnits));

    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const theirs = new Set([
      (await playerOf(t, elsewhere.token))._id,
      (await playerOf(t, elsewhere.guest))._id,
    ]);
    const engagements = await t.run(async (ctx) => ctx.db.query('engagements').collect());
    const sightings = await t.run(async (ctx) => ctx.db.query('sightings').collect());

    // Not one pass, and not one relevé: the other season never saw a thing.
    expect(engagements).toHaveLength(0);
    expect(sightings.filter((row) => theirs.has(row.playerId))).toHaveLength(0);

    // The column walked, found nobody, and came home whole.
    const back = await t.run(async (ctx) => ctx.db.get(troop));
    expect(back!.currentStrength).toBe(nominalStrength('infantry', 1));
    expect(back!.stationedAt).toBe(barracks);

    // And nothing of theirs was touched — no losses, no point put out of service.
    for (const troopId of [theirGarrison, theirSentries, theirCamp]) {
      const kept = await t.run(async (ctx) => ctx.db.get(troopId));
      expect(kept!.currentStrength).toBe(nominalStrength('infantry', 1));
    }
    expect((await t.run(async (ctx) => ctx.db.get(theirOutpost)))!.disabledUntil).toBeNull();
  });

  /**
   * **The camp is sixty kilometres from the road, which is inside a sentry's reach**
   * (`SCOUT_RADIUS_KM`) — so the same board, played inside one season, does file the relevé the
   * case above demands not to see. Without this the first guard would pass on a game that never
   * detects anything at all.
   */
  it('still files the relevé when the sentry stands in the same season', async () => {
    const t = boot();
    const { token, guest } = await launchedSeason(t, 'Pierre', 'Léa');
    await disbandTheGift(t, token, guest);

    const road = routeBetween(pointOf(MARNE), pointOf(PRAHOVA), 'land', landCostOf(['infantry']))!;
    const halfway = road.points[Math.floor(road.points.length / 2)]!;
    await form(t, guest, asPoint(halfway));

    const barracks = await raise(t, token, MARNE);
    const troop = await form(t, token, barracks);
    await t.mutation(api.movements.attack, {
      token,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [troop],
      target: { kind: 'region', regionId: PRAHOVA },
    });

    const watcher = (await playerOf(t, guest))._id;
    const sightings = await t.run(async (ctx) =>
      ctx.db
        .query('sightings')
        .withIndex('byPlayer', (q) => q.eq('playerId', watcher))
        .collect(),
    );
    expect(sightings).toHaveLength(1);
    expect(sightings[0]!.detector).toBe('troop');
    expect(SCOUT_RADIUS_KM).toBeGreaterThan(0);
  });
});

/**
 * **The static half of the rule.** The case above proves one board is sealed; nothing in it
 * stops the next mutation from sweeping a table whole again, and the leak would come back
 * silently — it costs nothing and reads as an ordinary query. So the source itself is read: a
 * `.collect()` on a table is legal only behind a `.withIndex()`, which is the one shape that
 * cannot answer outside its own range.
 *
 * `dev.ts` is the whitelist, and it is the only one: wiping the database is precisely the
 * reading that must not be filtered (ADR 0001 — a season is emptied, never migrated). Test files
 * are not scanned; they read what they wrote.
 */
describe('no table is swept whole', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const WHITELIST: ReadonlySet<string> = new Set(['dev.ts']);

  const sources = readdirSync(here)
    .filter((name) => name.endsWith('.ts') && !name.includes('.test.') && !name.endsWith('.d.ts'))
    .filter((name) => !WHITELIST.has(name));

  /** A `.query('table')` and the `.collect()` that closes it, with everything chained between
   *  them — stopped at the next `.query(` so two readings in one expression cannot lend each
   *  other an index. */
  const READING = /\.query\(\s*'(\w+)'\s*\)((?:(?!\.query\()[\s\S])*?)\.collect\(\)/g;

  it.each(sources)('%s reads every table through an index', (name) => {
    const source = readFileSync(join(here, name), 'utf-8');
    const unindexed = [...source.matchAll(READING)]
      .filter(([, , chained]) => !chained!.includes('.withIndex('))
      .map(([, table]) => table!);
    expect(unindexed).toEqual([]);
  });

  it('scans the server code rather than an empty list', () => {
    expect(sources).toContain('movements.ts');
    expect(sources.length).toBeGreaterThan(10);
  });

  /** **What earns `dev.ts` its exemption**: it is whitelisted because it has to read every table
   *  whole, so the least it owes is to read *all* of them. A slice that lands mid-season is
   *  emptied and never migrated (ADR 0001) — a table missing from the wipe is the one thing that
   *  would make "reset the base" a false answer. */
  it('wipes every table of the schema, since it migrates none of them', () => {
    expect([...GAME_TABLES].sort()).toEqual(Object.keys(schema.tables).sort());
  });
});
