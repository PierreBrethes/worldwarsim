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

  it('replays from the battery for the gunner, and from nowhere for the target (A4)', async () => {
    const t = boot();
    const { seat, guest } = await season(t);
    const gun = await troop(t, seat, PARIS, 'artillery');
    await troop(t, guest, ROUEN);
    const campId = await surveyCamp(t, seat, ROUEN);
    emplaced();
    await t.mutation(api.movements.bombard, {
      ...seat,
      troopId: gun,
      target: { kind: 'camp', campId },
    });
    const [engagement] = await t.run((ctx) => ctx.db.query('engagements').collect());

    const gunner = await t.query(api.replay.replayOf, { ...seat, combatId: engagement!._id });
    const target = await t.query(api.replay.replayOf, { ...guest, combatId: engagement!._id });
    expect(gunner).toMatchObject({ bombardment: { from: PARIS } });
    expect(target).toMatchObject({ bombardment: {} });
    expect(JSON.stringify(target)).not.toContain(String(PARIS.lon));
    expect(gunner).toMatchObject({ faced: { nation: 'ussr', forces: [{ role: 'infantry' }] } });
    expect(target).not.toHaveProperty('faced');
    const report = (await t.query(api.view.playerView, guest)).reports.find(
      (account) => account.id === engagement!._id,
    )!;
    expect(report).not.toHaveProperty('faced');
  });

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
    await t.run((ctx) => ctx.db.patch(rider, { carriedBy: cargo }));
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

  it('fires neither on the road nor from aboard, and counts no emplacement on the road', async () => {
    const t = boot();
    const { seat, guest } = await season(t);
    const gun = await troop(t, seat, PARIS, 'artillery');
    const shipped = await troop(t, seat, CHANNEL, 'artillery');
    await troop(t, seat, CHANNEL, 'cargo');
    await troop(t, guest, ROUEN);
    emplaced();
    /** Posée à l'instant : sans la règle, la vue lui donnerait un compte à rebours en route. */
    await t.run((ctx) => ctx.db.patch(gun, { settledAt: Date.now() }));
    await t.mutation(api.movements.marchTo, {
      ...seat,
      origin: { kind: 'point', point: PARIS },
      troopIds: [gun],
      point: LYON,
    });
    const fire = async (troopId: Id<'troops'>) =>
      t.mutation(api.movements.bombard, {
        ...seat,
        troopId,
        target: { kind: 'camp', campId: await surveyCamp(t, seat, ROUEN) },
      });
    await expect(fire(gun)).rejects.toThrow(/ON_THE_MOVE/);
    await expect(fire(shipped)).rejects.toThrow(/ABOARD/);
    const view = await t.query(api.view.playerView, seat);
    expect(view.me.troops.find((one) => one.id === gun)).not.toHaveProperty('emplacedAt');
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

  it('is formed in a Mondiale', async () => {
    const t = boot();
    const { seat } = await season(t, 'mondiale');
    const workshop = await t.query(api.troops.workshop, seat);
    expect(workshop.grid.map((entry) => entry.role)).toContain('artillery');
  });

  it('strikes up to four troops of the squad in a Mondiale, for one round, unseen', async () => {
    const t = boot();
    const { seat, guest } = await season(t, 'mondiale');
    const gun = await troop(t, seat, PARIS, 'artillery');
    const squad = await Promise.all(Array.from({ length: 6 }, () => troop(t, guest, ROUEN)));
    const campId = await surveyCamp(t, seat, ROUEN);
    emplaced();

    await t.mutation(api.movements.bombard, {
      ...seat,
      troopId: gun,
      target: { kind: 'camp', campId },
    });

    const strengths = await Promise.all(
      squad.map(async (id) => (await row(t, id))!.currentStrength),
    );
    expect(strengths.filter((strength) => strength === 20)).toHaveLength(4);
    expect(strengths.filter((strength) => strength === 50)).toHaveLength(2);
    expect((await row(t, gun))!.rounds).toBe(1);
    const [engagement] = await t.run((ctx) => ctx.db.query('engagements').collect());
    expect(engagement!.troops.filter((one) => one.side === 'defender')).toHaveLength(4);
    const report = (await t.query(api.view.playerView, guest)).reports.find(
      (account) => account.id === engagement!._id,
    )!;
    expect(report).not.toHaveProperty('faced');
    const target = await t.query(api.replay.replayOf, { ...guest, combatId: engagement!._id });
    expect(JSON.stringify(target)).not.toContain(String(PARIS.lon));
  });

  it('leaves the troops that marched off the point out of the salvo', async () => {
    const t = boot();
    const { seat, guest } = await season(t, 'mondiale');
    const gun = await troop(t, seat, PARIS, 'artillery');
    const squad = [];
    for (let k = 0; k < 6; k++) squad.push(await troop(t, guest, ROUEN));
    const { movementId } = await t.mutation(api.movements.marchTo, {
      ...guest,
      origin: { kind: 'point', point: ROUEN },
      troopIds: squad.slice(0, 2),
      point: LILLE,
    });
    const campId = await surveyCamp(t, seat, ROUEN);
    emplaced();

    await t.mutation(api.movements.bombard, {
      ...seat,
      troopId: gun,
      target: { kind: 'camp', campId },
    });

    const strengths = await Promise.all(
      squad.map(async (id) => (await row(t, id))!.currentStrength),
    );
    expect(strengths).toEqual([50, 50, 20, 20, 20, 20]);
    expect((await t.run((ctx) => ctx.db.get(movementId)))!.troopIds).toEqual(squad.slice(0, 2));
  });

  it('wastes no round nor reload on a pile it cannot touch', async () => {
    const t = boot();
    const { seat, guest } = await season(t, 'mondiale');
    const gun = await troop(t, seat, PARIS, 'artillery');
    await troop(t, guest, ROUEN, 'fighter');
    const campId = await surveyCamp(t, seat, ROUEN);
    emplaced();
    await expect(
      t.mutation(api.movements.bombard, {
        ...seat,
        troopId: gun,
        target: { kind: 'camp', campId },
      }),
    ).rejects.toThrow(/OUT_OF_GUNS_REACH/);
    const battery = (await row(t, gun))!;
    expect(battery.reloadUntil).toBeUndefined();
    expect(await t.run((ctx) => ctx.db.query('engagements').collect())).toHaveLength(0);
  });

  it('refuses a target in its dead zone in a Mondiale', async () => {
    const t = boot();
    const { seat, guest } = await season(t, 'mondiale');
    const gun = await troop(t, seat, PARIS, 'artillery');
    await troop(t, guest, VERSAILLES);
    const campId = await surveyCamp(t, seat, VERSAILLES);
    emplaced();
    await expect(
      t.mutation(api.movements.bombard, {
        ...seat,
        troopId: gun,
        target: { kind: 'camp', campId },
      }),
    ).rejects.toThrow(/TOO_CLOSE/);
  });
});
