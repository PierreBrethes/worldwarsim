import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import type { LonLat } from '../src/domain/geo';
import { distanceKm } from '../src/domain/geo';
import type { Nation, UnitRole } from '../src/domain/ids';
import { LISTENING_STATION_RADIUS_KM, nominalStrength } from './constants';
import { capitalRegionOf } from './regions';
import schema from './schema';
import { modules } from './test.setup';
import { foundSeat, joinSeat, placeHq, seatIn, unclocked, type Seat } from './seats.fixture';

/**
 * **Ultra de bout en bout** (ADR 0047 §3, #726) : de vraies mutations, la station posée avant tout
 * départ, aucune réévaluation à la main, et le planificateur qui joue ses jobs. Ce que le
 * Britannique lit est la destination que sa station a entendue, jamais celle du moment où elle
 * est sourde.
 */
const boot = () => convexTest({ schema, modules, transactionLimits: true });
type Bench = ReturnType<typeof boot>;

const MIDDAY = new Date(2026, 7, 17, 12, 0, 0);

const playerOf = (t: Bench, seat: Seat) => t.run(async (ctx) => (await seatIn(ctx, seat))._id);

/** Le Royaume-Uni, la France et l'Allemagne, QG posés, sans troupe. */
async function launchedSeason(t: Bench) {
  const { seat, code } = await foundSeat(t, 'Pierre', 0.5);
  const seats: Record<'uk' | 'france' | 'germany', Seat> = {
    uk: seat,
    france: await joinSeat(t, code, 'Léa'),
    germany: await joinSeat(t, code, 'Max'),
  };
  for (const [nation, one] of Object.entries(seats)) {
    await t.mutation(api.players.reserveNation, { ...one, nation: nation as Nation });
    await t.mutation(api.players.declareReady, { ...one, ready: true });
  }
  await t.mutation(api.seasons.launch, seat);
  await unclocked(t);
  for (const one of Object.values(seats)) {
    await placeHq(t, one);
    const playerId = await playerOf(t, one);
    await t.run(async (ctx) => {
      for (const troop of await ctx.db
        .query('troops')
        .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
        .collect())
        await ctx.db.delete(troop._id);
    });
  }
  return seats;
}

async function postAt(t: Bench, seat: Seat, role: UnitRole, at: { lon: number; lat: number }) {
  const playerId = await playerOf(t, seat);
  return t.run(async (ctx) =>
    ctx.db.insert('troops', {
      seasonId: (await ctx.db.get(playerId))!.seasonId,
      playerId,
      role,
      tier: 1,
      nominalStrength: nominalStrength(role, 1),
      currentStrength: nominalStrength(role, 1),
      stationedAt: at,
    }),
  );
}

/** Une station debout avant tout départ : aucune ligne n'existe encore à relire. */
async function standingStation(t: Bench, seat: Seat, at: LonLat, nation: Nation) {
  const playerId = await playerOf(t, seat);
  return t.run(async (ctx) =>
    ctx.db.insert('buildings', {
      seasonId: seat.seasonId,
      playerId,
      key: 'listening',
      regionId: capitalRegionOf(nation),
      point: { lon: at[0], lat: at[1] },
      level: 1,
    }),
  );
}

/** Le prochain job du planificateur, à son heure. */
const nextJob = async (t: Bench) => {
  vi.advanceTimersToNextTimer();
  await t.finishInProgressScheduledFunctions();
};

const arcOf = async (t: Bench, seat: Seat, movementId: Id<'movements'>) =>
  ((await t.query(api.view.playerView, seat)).detected ?? []).find((arc) => arc.id === movementId);

describe('Ultra, de bout en bout (#726)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  /**
   * **9. La poursuite navale** : la flotte qui poursuit recourbe sa route sur place, à chaque
   * réveil. La station l'entend au départ, puis la perd ; chaque coude d'après est un ordre
   * qu'elle n'a pas entendu. Ne se teste ici que la destination, pas l'arc (#727).
   */
  it('9. stops serving a pursuing fleet new destinations once its station has gone deaf', async () => {
    const t = boot();
    const { uk, france, germany } = await launchedSeason(t);
    const FR = { lon: -19.5, lat: 45 };
    const DE = { lon: -17.3, lat: 45 };
    const listening: LonLat = [FR.lon, FR.lat + 0.3];
    await standingStation(t, uk, listening, 'uk');
    const hunters = [await postAt(t, france, 'carrier', FR), await postAt(t, france, 'escort', FR)];
    const cargo = await postAt(t, germany, 'cargo', DE);
    await t.mutation(api.movements.marchTo, {
      ...germany,
      origin: { kind: 'point', point: DE },
      troopIds: [cargo],
      point: { lon: -8, lat: 45 },
    });
    const track = (await t.query(api.view.playerView, france)).detected!.find(
      (arc) => arc.seenTo >= Date.now(),
    )!;
    await t.mutation(api.movements.attack, {
      ...france,
      origin: { kind: 'point', point: FR },
      troopIds: hunters,
      target: { kind: 'track', movementId: track.id as Id<'movements'> },
    });
    const chaseOf = () =>
      t.run(
        async (ctx) =>
          (await ctx.db.query('movements').collect()).find((one) =>
            one.troopIds.includes(hunters[0]!),
          ) ?? null,
      );
    const chase0 = (await chaseOf())!;

    /** Un coude se prend du point où la flotte est : la station l'entend s'il tombe dans son
     *  rayon, et seulement alors. */
    const hears = (at: { lon: number; lat: number }) =>
      distanceKm([at.lon, at.lat], listening) <= LISTENING_STATION_RADIUS_KM;
    expect(hears(chase0.from)).toBe(true);
    let heard = chase0.to;
    let bend = chase0.departedAt;
    let unheardBends = 0;
    let served = 0;
    for (let step = 0; step < 400; step += 1) {
      const chase = await chaseOf();
      if (chase?.pursuit === undefined) break;
      await nextJob(t);
      const after = await chaseOf();
      if (after !== null && after.departedAt !== bend) {
        bend = after.departedAt;
        if (hears(after.from)) heard = after.to;
        else if (distanceKm([after.to.lon, after.to.lat], [heard.lon, heard.lat]) > 1)
          unheardBends += 1;
      }
      const arc = await arcOf(t, uk, chase0._id);
      if (arc?.destination === undefined) continue;
      served += 1;
      expect(arc.destination.point).toEqual(heard);
    }
    /** La scène prouve quelque chose : la flotte a tourné hors d'écoute, sous un arc servi. */
    expect(unheardBends).toBeGreaterThan(0);
    expect(served).toBeGreaterThan(0);
  });
});
