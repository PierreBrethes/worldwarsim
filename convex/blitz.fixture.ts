import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { THEATRES, theatreById } from '../src/domain/theatres';
import { blitzMapRulesOf } from '../src/domain/blitz-placement';
import { BLITZ } from './constants';
import { pointOfBuilding, regionFacts } from './regions';
import { routeKmFrom } from './routes';
import { regionAtRoutePoint } from './regionGeometry';
import schema from './schema';
import { modules } from './test.setup';
import { joinSeat, seatIn, signIn, TEST_SEASON_SEED, type Seat } from './seats.fixture';

export const boot = () => convexTest({ schema, modules, transactionLimits: true });
/** La pose mesure des routes sur la grille : quelques secondes sous `convex-test`. */
vi.setConfig({ testTimeout: 30_000 });
export type Bench = ReturnType<typeof boot>;
export const MIDDAY = Date.UTC(2026, 9, 14, 12);
export const MINUTE = 60_000;

export const NATIONS = ['france', 'ussr', 'japan', 'usa'] as const;
/** Les graines du plafond de chaque théâtre (T1) : un plafond tient sur les six, ou il descend. */
export const SIX_SEEDS = [7919, 15838, 23757, 31676, 39595, 47514];

export async function blitzLaunchedOn(
  t: Bench,
  theatre: string,
  players: number,
  seed = TEST_SEASON_SEED,
) {
  const token = await signIn(t, 'Pierre');
  const { code, seasonId } = await t.mutation(api.seasons.create, {
    token,
    compensation: 0.5,
    mode: 'blitz',
    theatre,
  });
  await t.run((ctx) => ctx.db.patch(seasonId, { seed }));
  const seat: Seat = { token, seasonId };
  const seats = [seat];
  for (let rank = 1; rank < players; rank += 1) {
    seats.push(await joinSeat(t, code, `Joueur ${String(rank)}`));
  }
  for (const [rank, who] of seats.entries()) {
    await t.mutation(api.players.reserveNation, { ...who, nation: NATIONS[rank]! });
    await t.mutation(api.players.declareReady, { ...who, ready: true });
  }
  await t.mutation(api.seasons.launch, seat);
  await t.action(internal.blitz.place, { seasonId });
  return seats;
}

export const playerOf = (t: Bench, seat: Seat) => t.run((ctx) => seatIn(ctx, seat));

export const buildingsOf = (t: Bench, playerId: Id<'players'>) =>
  t.run((ctx) =>
    ctx.db
      .query('buildings')
      .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
      .collect(),
  );

export const troopsOf = (t: Bench, playerId: Id<'players'>) =>
  t.run((ctx) =>
    ctx.db
      .query('troops')
      .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
      .collect(),
  );

export const neutralOf = (t: Bench, seasonId: Id<'seasons'>) =>
  t.run(async (ctx) => {
    const seats = await ctx.db
      .query('players')
      .withIndex('bySeason', (q) => q.eq('seasonId', seasonId))
      .collect();
    return seats.find((candidate) => candidate.irregular === true)!;
  });

/** **Chaque théâtre se pose à son plafond, sur six graines** (T1) ; mesuré le 14/10 après A2
 *  (distances en part du théâtre, QG tirés sur la terre) : le Pacifique à 4 échoue sur les six,
 *  d'où les fourchettes de `THEATRES`. Un fichier par théâtre, pour que vitest les parallélise ;
 *  la pose à pied se vérifie sur la première des six, sans septième pose. */
export function describePlacement(theatre: string) {
  const range = THEATRES.find((candidate) => candidate.id === theatre)!.players;
  describe(`la carte de départ — ${theatre}`, () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(MIDDAY);
    });
    afterEach(() => vi.useRealTimers());

    it(`se pose sur six graines à son plafond, à pied dans la tolérance — ${theatre} à ${String(range.max)}`, async () => {
      const refused = [];
      const astray: string[] = [];
      for (const [rank, seed] of SIX_SEEDS.entries()) {
        const t = boot();
        const seats = await blitzLaunchedOn(t, theatre, range.max, seed);
        const season = (await t.run((ctx) => ctx.db.get(seats[0]!.seasonId)))!;
        if (season.status !== 'launched') refused.push(seed);
        /** **Un port est dans sa région** : son quai est lu sur la grille, chez elle. */
        const ports = await t.run((ctx) =>
          ctx.db
            .query('buildings')
            .withIndex('bySeason', (q) => q.eq('seasonId', season._id))
            .filter((q) => q.eq(q.field('key'), 'port'))
            .collect(),
        );
        for (const port of ports) {
          const at = regionAtRoutePoint([port.point!.lon, port.point!.lat]);
          if (at !== port.regionId) astray.push(`${String(seed)} ${port.regionId} → ${String(at)}`);
        }
        if (rank === 0 && season.status === 'launched') await expectOnFoot(t, seats, season._id);
      }
      expect(refused).toEqual([]);
      expect(astray).toEqual([]);
    }, 180_000);
  });

  async function expectOnFoot(t: Bench, seats: Seat[], seasonId: Id<'seasons'>) {
    const neutral = await neutralOf(t, seasonId);
    const neutrals = await buildingsOf(t, neutral._id);
    const ports = neutrals.filter((building) => building.key === 'port');
    expect(ports.length).toBeGreaterThanOrEqual(range.max);
    for (const port of ports) expect(port.point).toBeDefined();
    for (const who of seats) {
      const me = await playerOf(t, who);
      const held = await buildingsOf(t, me._id);
      const hq = held.find((building) => building.key === 'hq')!;
      const others = [...held.filter((building) => building.key !== 'hq'), ...neutrals];
      const onFoot = routeKmFrom(
        pointOfBuilding(hq)!,
        others.map((building) => ({
          id: building._id as string,
          point: regionFacts(building.regionId)!.point,
        })),
        'land',
      );
      const barracks = held.find((building) => building.key === 'barracks')!;
      const rules = blitzMapRulesOf(theatreById(theatre)!, BLITZ.map);
      const target = rules.starting[0]!.km;
      expect(Math.abs(onFoot.get(barracks._id)! - target)).toBeLessThanOrEqual(
        target * BLITZ.map.tolerance,
      );
      const cities = neutrals.filter(
        (building) =>
          building.key === 'city' &&
          Math.abs((onFoot.get(building._id) ?? Infinity) - rules.near[0]!.km) <=
            rules.near[0]!.km * BLITZ.map.tolerance,
      );
      expect(cities.length).toBeGreaterThan(0);
    }
  }
}
