import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import type { UnitRole } from '../src/domain/ids';
import { contactKm, detectionRangeOf, nominalStrength } from './constants';
import { reassessDetection } from './movement/detection';
import { theatreById } from '../src/domain/theatres';
import schema from './schema';
import { modules } from './test.setup';
import { foundSeat, joinSeat, placeHq, seatIn, type Seat } from './seats.fixture';

/**
 * **Une Blitz du Pacifique se joue à l'échelle du Pacifique** (A2) : le contact et la vue y sont
 * presque quatre fois ceux de l'Europe, côté serveur — l'arrivée (`defenceNear`) et le relevé
 * d'une force posée (`syncCampSightings`), pas seulement les cercles qu'on dessine.
 */
const boot = () => convexTest({ schema, modules, transactionLimits: true });
type Bench = ReturnType<typeof boot>;
const MIDDAY = Date.UTC(2026, 9, 14, 12);
const pacific = theatreById('pacific')!;
/** Au Hubei, loin de toute côte : un pas vers l'est reste en Chine. */
const HUBEI = { lon: 112, lat: 31 };
const eastOf = (km: number) => ({
  lon: HUBEI.lon + km / (111.32 * Math.cos((31 * Math.PI) / 180)),
  lat: 31,
});

async function season(t: Bench) {
  const { seat, code } = await foundSeat(t, 'Pierre', 0.5);
  const guest = await joinSeat(t, code, 'Léa');
  for (const [who, nation] of [
    [seat, 'france'],
    [guest, 'japan'],
  ] as const) {
    await t.mutation(api.players.reserveNation, { ...who, nation });
    await t.mutation(api.players.declareReady, { ...who, ready: true });
  }
  await t.mutation(api.seasons.launch, seat);
  await placeHq(t, seat);
  await placeHq(t, guest);
  await t.run((ctx) => ctx.db.patch(seat.seasonId, { mode: 'blitz', theatre: 'pacific' }));
  return { seat, guest };
}

async function troop(
  t: Bench,
  seat: Seat,
  at: { lon: number; lat: number },
  role: UnitRole = 'infantry',
) {
  const player = await t.run((ctx) => seatIn(ctx, seat));
  const strength = nominalStrength(role, 1);
  return t.run((ctx) =>
    ctx.db.insert('troops', {
      seasonId: player.seasonId,
      playerId: player._id,
      role,
      tier: 1,
      nominalStrength: strength,
      currentStrength: strength,
      stationedAt: at,
    }),
  );
}

describe('the Pacific at its own scale (A2)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('engages on arrival what stands sixty kilometres off, inside the Pacific contact', async () => {
    expect(contactKm(pacific)).toBe(95);
    const t = boot();
    const { seat, guest } = await season(t);
    const attacker = await troop(t, seat, HUBEI);
    await troop(t, guest, eastOf(60));
    const me = await t.run((ctx) => seatIn(ctx, seat));
    const movementId = await t.run((ctx) =>
      ctx.db.insert('movements', {
        seasonId: seat.seasonId,
        playerId: me._id,
        type: 'attack',
        fromBuildingId: null,
        target: { kind: 'point', point: HUBEI },
        from: HUBEI,
        to: HUBEI,
        hostCountry: 'CHN',
        points: [HUBEI, HUBEI],
        legs: [{ medium: 'land', distanceUnits: 1 }],
        distanceUnits: 1,
        costUnits: 1,
        troopIds: [attacker as Id<'troops'>],
        departedAt: Date.now(),
        arrivesAt: Date.now(),
      }),
    );
    await t.mutation(internal.movements.arrive, { movementId });
    const engagements = await t.run((ctx) => ctx.db.query('engagements').collect());
    expect(engagements).toHaveLength(1);
  });

  it('sees a pile posted a hundred and fifty kilometres off, inside the Pacific sight', async () => {
    expect(detectionRangeOf(['infantry'], pacific)).toBe(228);
    const t = boot();
    const { seat, guest } = await season(t);
    await troop(t, seat, HUBEI);
    await troop(t, guest, eastOf(150));
    await t.run((ctx) => reassessDetection(ctx, seat.seasonId));
    const me = await t.run((ctx) => seatIn(ctx, seat));
    const camps = await t.run((ctx) =>
      ctx.db
        .query('campSightings')
        .withIndex('byPlayer', (q) => q.eq('playerId', me._id))
        .collect(),
    );
    expect(camps.map((camp) => camp.point)).toContainEqual(eastOf(150));
  });
});
