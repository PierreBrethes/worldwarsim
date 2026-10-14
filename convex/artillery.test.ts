import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import type { UnitRole } from '../src/domain/ids';
import { INDIRECT_FIRE, nominalStrength } from './constants';
import schema from './schema';
import { modules } from './test.setup';
import { foundSeat, joinSeat, placeHq, seatIn, surveyCamp, type Seat } from './seats.fixture';

const boot = () => convexTest({ schema, modules, transactionLimits: true });
type Bench = ReturnType<typeof boot>;
const MIDDAY = Date.UTC(2026, 9, 14, 12);
const PARIS = { lon: 2.35, lat: 48.85 };
/** À 112 km de Paris : entre la zone morte et la portée, sur le sol français, que le détecteur
 *  `territory` du joueur couvre. */
const ROUEN = { lon: 1.1, lat: 49.44 };
/** À 17 km : dans la zone morte. */
const VERSAILLES = { lon: 2.13, lat: 48.8 };
const LYON = { lon: 4.85, lat: 45.75 };
/** La Manche, à une centaine de kilomètres de Rouen ; une infanterie sur la côte la voit. */
const CHANNEL = { lon: 0.0, lat: 50.2 };
const CHANNEL_EAST = { lon: 0.4, lat: 50.3 };
const COAST = { lon: 0.6, lat: 49.85 };
/** Lille et Bruxelles, à 95 km : la Belgique n'est le sol de personne, rien n'y voit d'office. */
const LILLE = { lon: 3.06, lat: 50.63 };
const BRUSSELS = { lon: 4.35, lat: 50.85 };
const MECHELEN = { lon: 4.48, lat: 51.03 };

async function season(t: Bench, mode: 'blitz' | 'mondiale' = 'blitz') {
  const { seat, code } = await foundSeat(t, 'Pierre', 0.5);
  const guest = await joinSeat(t, code, 'Léa');
  await t.mutation(api.players.reserveNation, { ...seat, nation: 'france' });
  await t.mutation(api.players.declareReady, { ...seat, ready: true });
  await t.mutation(api.players.reserveNation, { ...guest, nation: 'ussr' });
  await t.mutation(api.players.declareReady, { ...guest, ready: true });
  await t.mutation(api.seasons.launch, seat);
  await placeHq(t, seat);
  await placeHq(t, guest);
  if (mode === 'blitz')
    await t.run((ctx) => ctx.db.patch(seat.seasonId, { mode: 'blitz', theatre: 'europe' }));
  return { seat, guest };
}

async function troop(
  t: Bench,
  seat: Seat,
  stationedAt: { lon: number; lat: number },
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
      stationedAt,
    }),
  );
}

const emplaced = () => vi.setSystemTime(Date.now() + (INDIRECT_FIRE.emplaceSeconds + 1) * 1000);
const row = (t: Bench, id: Id<'troops'>) => t.run((ctx) => ctx.db.get(id));

describe('the artillery and indirect fire (lot 6b)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('strikes a seen unit from afar, takes no riposte, and reloads', async () => {
    const t = boot();
    const { seat, guest } = await season(t);
    const gun = await troop(t, seat, PARIS, 'artillery');
    const target = await troop(t, guest, ROUEN);
    const campId = await surveyCamp(t, seat, ROUEN);
    emplaced();

    await t.mutation(api.movements.bombard, {
      ...seat,
      troopId: gun,
      target: { kind: 'camp', campId },
    });

    expect((await row(t, target))!.currentStrength).toBe(20);
    const battery = (await row(t, gun))!;
    expect(battery.currentStrength).toBe(battery.nominalStrength);
    expect(battery.reloadUntil).toBeGreaterThan(Date.now());
    expect(battery.stationedAt).toEqual(PARIS);
    const [engagement] = await t.run((ctx) => ctx.db.query('engagements').collect());
    expect(engagement).toMatchObject({ cause: 'bombardment', firedFrom: PARIS });
    const strikes = await t.run((ctx) => ctx.db.query('strikes').collect());
    expect(strikes.map((strike) => strike.bySide)).toEqual(['attacker']);

    await expect(
      t.mutation(api.movements.bombard, {
        ...seat,
        troopId: gun,
        target: { kind: 'camp', campId: await surveyCamp(t, seat, ROUEN) },
      }),
    ).rejects.toThrow(/RELOADING/);
  });

  it('shells a hull at sea without drowning the battery or the hull’s passengers', async () => {
    const t = boot();
    const { seat, guest } = await season(t);
    const gun = await troop(t, seat, ROUEN, 'artillery');
    await troop(t, seat, COAST);
    const escort = await troop(t, guest, CHANNEL, 'escort');
    /** Formé avant sa coque : c'est lui que le relevé désigne, seul dans la passe. */
    const rider = await troop(t, guest, CHANNEL_EAST);
    const cargo = await troop(t, guest, CHANNEL_EAST, 'cargo');
    emplaced();
    for (const place of [CHANNEL, CHANNEL_EAST]) {
      await t.mutation(api.movements.bombard, {
        ...seat,
        troopId: gun,
        target: { kind: 'camp', campId: await surveyCamp(t, seat, place) },
      });
      await t.run((ctx) => ctx.db.patch(gun, { reloadUntil: undefined }));
    }
    for (const id of [gun, escort, cargo, rider]) expect(await row(t, id)).not.toBeNull();
  });

  it('fires only on what a detector still sees, never on a stale survey', async () => {
    const t = boot();
    const { seat, guest } = await season(t);
    const gun = await troop(t, seat, LILLE, 'artillery');
    await troop(t, guest, BRUSSELS);
    const campId = await surveyCamp(t, seat, BRUSSELS);
    emplaced();
    const fire = (id: Id<'campSightings'>) =>
      t.mutation(api.movements.bombard, {
        ...seat,
        troopId: gun,
        target: { kind: 'camp', campId: id },
      });
    await expect(fire(campId)).rejects.toThrow(/NOTHING_TO_ATTACK/);

    await troop(t, seat, MECHELEN);
    await fire(await surveyCamp(t, seat, BRUSSELS));
  });

  it('charges in a Blitz only what a detector still sees', async () => {
    const t = boot();
    const { seat, guest } = await season(t);
    const rifle = await troop(t, seat, LILLE);
    await troop(t, guest, BRUSSELS);
    await expect(
      t.mutation(api.movements.attack, {
        ...seat,
        origin: { kind: 'point', point: LILLE },
        troopIds: [rifle],
        target: { kind: 'camp', campId: await surveyCamp(t, seat, BRUSSELS) },
      }),
    ).rejects.toThrow(/NOTHING_TO_ATTACK/);
  });

  it('says why it holds its fire', async () => {
    const t = boot();
    const { seat, guest } = await season(t);
    const gun = await troop(t, seat, PARIS, 'artillery');
    const rifle = await troop(t, seat, PARIS);
    for (const place of [ROUEN, VERSAILLES, LYON]) await troop(t, guest, place);
    const fire = async (troopId: Id<'troops'>, place: { lon: number; lat: number }) =>
      t.mutation(api.movements.bombard, {
        ...seat,
        troopId,
        target: { kind: 'camp', campId: await surveyCamp(t, seat, place) },
      });

    await expect(fire(gun, ROUEN)).rejects.toThrow(/NOT_EMPLACED/);
    emplaced();
    await expect(fire(gun, VERSAILLES)).rejects.toThrow(/TOO_CLOSE/);
    await expect(fire(gun, LYON)).rejects.toThrow(/OUT_OF_RANGE/);
    await expect(fire(rifle, ROUEN)).rejects.toThrow(/ARTILLERY_ONLY/);
  });

  it('counts its emplacement from the end of the march that carried it', async () => {
    const t = boot();
    const { seat } = await season(t);
    const gun = await troop(t, seat, PARIS, 'artillery');
    const { movementId } = await t.mutation(api.movements.marchTo, {
      ...seat,
      origin: { kind: 'point', point: PARIS },
      troopIds: [gun],
      point: ROUEN,
    });
    const movement = (await t.run((ctx) => ctx.db.get(movementId)))!;
    vi.setSystemTime(movement.arrivesAt);
    await t.mutation(internal.movements.arrive, { movementId });
    expect((await row(t, gun))!.settledAt).toBe(movement.arrivesAt);
  });

  it('is neither formed nor fired in a Mondiale', async () => {
    const t = boot();
    const { seat, guest } = await season(t, 'mondiale');
    const gun = await troop(t, seat, PARIS, 'artillery');
    await troop(t, guest, ROUEN);
    emplaced();
    await expect(
      t.mutation(api.movements.bombard, {
        ...seat,
        troopId: gun,
        target: { kind: 'camp', campId: await surveyCamp(t, seat, ROUEN) },
      }),
    ).rejects.toThrow(/BLITZ_ONLY/);
    const workshop = await t.query(api.troops.workshop, seat);
    expect(workshop.grid.map((entry) => entry.role)).not.toContain('artillery');
  });
});
