import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import type { UnitRole } from '../src/domain/ids';
import { nominalStrength } from './constants';
import { reassessDetection } from './movement/detection';
import schema from './schema';
import { modules } from './test.setup';
import { allRegions, pointOfRegion } from './regions';
import { distanceKm } from '../src/domain/geo';
import {
  foundSeat,
  joinSeat,
  placeHq,
  seatIn,
  surveyCamp,
  unclocked,
  type Seat,
} from './seats.fixture';

/**
 * **Une réévaluation ciblée rend ce que rendrait la passe entière** (#418). Chaque mutation qui
 * passe `changed` est jouée sur un plateau où un témoin — un troisième joueur, son avant-poste et
 * sa colonne au même endroit, que l'événement ne touche pas — relève tout ce qui bouge : la passe
 * entière qui suit ne change plus une ligne des trois registres. Retirer un joueur de `changed`
 * laisse au témoin, ou à ce joueur, une ligne que la passe entière corrige.
 */

const boot = () => convexTest({ schema, modules, transactionLimits: true });
type Bench = ReturnType<typeof boot>;
const MINUTE = 60_000;
const MIDDAY = Date.UTC(2026, 8, 9, 12);
/** Un carré de Hesse : de la terre partout, aucune des trois nations chez elle. */
const SITE = { lon: 8.6, lat: 50.3 };
const east = (km: number, at = SITE) => ({
  lon: at.lon + km / (111.32 * Math.cos((at.lat * Math.PI) / 180)),
  lat: at.lat,
});

/** Les régions allemandes, de la plus proche du site à la plus loin. */
const germanRegions = () =>
  allRegions()
    .filter((one) => one.country === 'DEU')
    .sort(
      (a, b) =>
        distanceKm(a.point, [SITE.lon, SITE.lat]) - distanceKm(b.point, [SITE.lon, SITE.lat]),
    );

const raise = (
  t: Bench,
  playerId: Id<'players'>,
  key: 'listening' | 'warehouse' | 'barracks' | 'airfield',
  regionId: string,
) =>
  t.run(async (ctx) =>
    ctx.db.insert('buildings', {
      seasonId: (await ctx.db.get(playerId))!.seasonId,
      playerId,
      key,
      regionId,
      point: pointOfRegion(regionId),
      level: 1,
    }),
  );

async function season(t: Bench, blitz = false) {
  const { seat, code } = await foundSeat(t, 'Pierre', 0.5);
  const seats: Seat[] = [seat];
  for (const name of ['Léa', 'Marc']) seats.push(await joinSeat(t, code, name));
  for (const [k, one] of seats.entries()) {
    await t.mutation(api.players.reserveNation, {
      ...one,
      nation: (blitz ? (['uk', 'ussr', 'germany'] as const) : (['france', 'uk', 'italy'] as const))[
        k
      ]!,
    });
    await t.mutation(api.players.declareReady, { ...one, ready: true });
  }
  await t.mutation(api.seasons.launch, seat);
  if (blitz) await unclocked(t);
  for (const one of seats) await placeHq(t, one);
  if (blitz)
    await t.run((ctx) => ctx.db.patch(seat.seasonId, { mode: 'blitz', theatre: 'europe' }));
  const players = await Promise.all(seats.map((one) => t.run((ctx) => seatIn(ctx, one))));
  return { seats, ids: players.map((player) => player._id), seasonId: seat.seasonId };
}

const troop = (
  t: Bench,
  playerId: Id<'players'>,
  at: { lon: number; lat: number } | Id<'buildings'> | null,
  role: UnitRole = 'infantry',
) =>
  t.run(async (ctx) =>
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

/** Une colonne d'une troupe par le vrai `march`, qui relit son joueur (`dev.benchFlights`). */
async function column(
  t: Bench,
  playerId: Id<'players'>,
  from: { lon: number; lat: number },
  to: { lon: number; lat: number },
) {
  const troopId = await troop(t, playerId, from);
  const { filed } = await t.mutation(internal.dev.benchFlights, {
    playerId,
    flights: [{ ids: [troopId], from, to }],
  });
  expect(filed).toBe(1);
  return troopId;
}

const outpost = (
  t: Bench,
  playerId: Id<'players'>,
  at: { lon: number; lat: number },
  disabledUntil: number | null = null,
) =>
  t.run(async (ctx) =>
    ctx.db.insert('outposts', {
      seasonId: (await ctx.db.get(playerId))!.seasonId,
      playerId,
      point: at,
      hostCountry: 'DEU',
      level: 2,
      foundedAt: Date.now() - 1,
      disabledUntil,
      immuneUntil: disabledUntil,
    }),
  );

/** Le témoin : un avant-poste sur le site, et une colonne qui le traverse d'ouest en est. */
async function witness(t: Bench, playerId: Id<'players'>) {
  await outpost(t, playerId, SITE);
  await column(t, playerId, east(-150), east(150));
}

/** Les trois registres d'observateur, une ligne par relevé, sans ce qui se renumérote. */
const ledgers = (t: Bench) =>
  t.run(async (ctx) => {
    const rows = [
      ...(await ctx.db.query('sightings').collect()),
      ...(await ctx.db.query('campSightings').collect()),
      ...(await ctx.db.query('regionSightings').collect()),
    ];
    return rows
      .map(({ _id, _creationTime, ...row }) =>
        JSON.stringify(row, (key, value: unknown) => (key.endsWith('JobId') ? undefined : value)),
      )
      .sort();
  });

const wholePass = (t: Bench, seasonId: Id<'seasons'>) =>
  t.run((ctx) => reassessDetection(ctx, seasonId, Date.now()));

/** Ce que l'événement a laissé, et ce que la passe entière en ferait. */
async function aroundAWholePass(t: Bench, seasonId: Id<'seasons'>) {
  const left = await ledgers(t);
  await wholePass(t, seasonId);
  return { left, whole: await ledgers(t) };
}

describe('a targeted reassessment leaves nothing for the whole pass to change', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('when a disabled outpost watches again', async () => {
    const t = boot();
    const { ids, seasonId } = await season(t);
    const [owner, passer, third] = ids as [Id<'players'>, Id<'players'>, Id<'players'>];
    const at = Date.now() + 10 * MINUTE;
    await outpost(t, owner, east(30), at);
    await column(t, passer, east(-200, { lon: SITE.lon, lat: SITE.lat + 0.3 }), east(200));
    await witness(t, third);
    await wholePass(t, seasonId);
    const before = await ledgers(t);

    vi.setSystemTime(at);
    await t.mutation(internal.production.restoreAfterDisabling, { seasonId, at });

    const { left, whole } = await aroundAWholePass(t, seasonId);
    expect(left).toEqual(whole);
    expect(left).not.toEqual(before);
  });

  it('when a listening station is razed', async () => {
    const t = boot();
    const { seats, ids, seasonId } = await season(t);
    const [owner, passer, third] = ids as [Id<'players'>, Id<'players'>, Id<'players'>];
    const station = await raise(t, owner, 'listening', germanRegions()[0]!.id);
    await column(t, passer, east(-200), east(200));
    await witness(t, third);
    await wholePass(t, seasonId);
    const before = await ledgers(t);

    await t.mutation(api.buildings.demolish, { ...seats[0]!, buildingId: station });

    const { left, whole } = await aroundAWholePass(t, seasonId);
    expect(left).toEqual(whole);
    expect(left).not.toEqual(before);
  });

  it('when a pile is disbanded into a ring', async () => {
    const t = boot();
    const { seats, ids, seasonId } = await season(t);
    const [owner, passer, third] = ids as [Id<'players'>, Id<'players'>, Id<'players'>];
    const pile = east(-40);
    for (const role of ['armor', 'infantry', 'infantry', 'artillery'] as const)
      await troop(t, owner, pile, role);
    await column(t, passer, east(-200, { lon: SITE.lon, lat: SITE.lat + 0.5 }), east(200));
    await witness(t, third);
    await wholePass(t, seasonId);
    const before = await ledgers(t);

    await t.mutation(api.movements.disband, { ...seats[0]!, point: pile });

    const { left, whole } = await aroundAWholePass(t, seasonId);
    expect(left).toEqual(whole);
    expect(left).not.toEqual(before);
  });

  /** Deux colonnes de deux joueurs dues sur la même caisse, toutes deux réglées d'un coup. */
  async function crateScene(t: Bench, oil = 4000) {
    const { ids, seasonId } = await season(t);
    const [first, second, third] = ids as [Id<'players'>, Id<'players'>, Id<'players'>];
    await column(t, first, east(-120), SITE);
    await column(t, second, east(120), SITE);
    await witness(t, third);
    const arrivesAt = Date.now() + 20 * MINUTE;
    const crateId = await t.run(async (ctx) => {
      const zero = { ammunition: 0, oil: 0, coal: 0, food: 0, steel: 0 };
      const engagementId = await ctx.db.insert('engagements', {
        seasonId,
        attackerId: first,
        defenderId: second,
        cause: 'arrival',
        point: SITE,
        hostCountry: 'DEU',
        at: Date.now(),
        winner: 'attacker',
        outpostId: null,
        disabledUntil: null,
        troops: [],
      });
      const recoveryId = await ctx.db.insert('lootRecoveries', {
        seasonId,
        engagementId,
        dispossessedPlayerId: second,
        recoveringPlayerId: first,
        point: SITE,
        at: Date.now(),
        recovered: zero,
        remainder: zero,
      });
      const crateId = await ctx.db.insert('lootCrates', {
        seasonId,
        recoveryId,
        point: SITE,
        appearedAt: Date.now(),
        expiresAt: arrivesAt + MINUTE,
        loot: { ...zero, oil },
      });
      for (const movement of await ctx.db.query('movements').collect()) {
        if (movement.playerId === third) continue;
        const sightingId = await ctx.db.insert('lootCrateSightings', {
          seasonId,
          playerId: movement.playerId,
          crateId,
          point: SITE,
          loot: zero,
          seenAt: Date.now(),
          present: true,
          current: true,
        });
        await ctx.db.patch(movement._id, {
          arrivesAt,
          lootCollection: { sightingId, crateId, orderedAt: Date.now() },
        });
      }
      return crateId;
    });
    await wholePass(t, seasonId);
    return { seasonId, crateId, first, arrivesAt, before: await ledgers(t) };
  }

  it('when a column reaches a crate and settles every column due on it', async () => {
    const t = boot();
    const { seasonId, first, arrivesAt, before } = await crateScene(t);
    const arriving = await t.run(async (ctx) =>
      (await ctx.db.query('movements').collect()).find(
        (movement) => movement.playerId === first && movement.lootCollection !== undefined,
      ),
    );

    vi.setSystemTime(arrivesAt);
    await t.mutation(internal.movements.arrive, { movementId: arriving!._id });

    expect(
      await t.run(async (ctx) => (await ctx.db.query('lootCollections').collect()).length),
    ).toBe(2);
    const { left, whole } = await aroundAWholePass(t, seasonId);
    expect(left).toEqual(whole);
    expect(left).not.toEqual(before);
  });

  it('when a crate expires over the columns due on it', async () => {
    const t = boot();
    const { seasonId, crateId, arrivesAt, before } = await crateScene(t);

    vi.setSystemTime(arrivesAt + MINUTE);
    await t.mutation(internal.lootCrates.expire, { crateId, expectedAt: arrivesAt + MINUTE });

    expect(
      await t.run(async (ctx) => (await ctx.db.query('lootCollections').collect()).length),
    ).toBe(2);
    const { left, whole } = await aroundAWholePass(t, seasonId);
    expect(left).toEqual(whole);
    expect(left).not.toEqual(before);
  });

  /** La première colonne vide la caisse : la seconde rentre bredouille, et toutes deux se relisent. */
  it('when a crate expires over the columns due on it, the first of them emptying it', async () => {
    const t = boot();
    const { seasonId, crateId, arrivesAt, before } = await crateScene(t, 1);

    vi.setSystemTime(arrivesAt + MINUTE);
    await t.mutation(internal.lootCrates.expire, { crateId, expectedAt: arrivesAt + MINUTE });

    expect(await t.run((ctx) => ctx.db.get(crateId))).toBeNull();
    expect(
      await t.run(async (ctx) => (await ctx.db.query('lootCollections').collect()).length),
    ).toBe(1);
    const { left, whole } = await aroundAWholePass(t, seasonId);
    expect(left).toEqual(whole);
    expect(left).not.toEqual(before);
  });

  /** Trois compagnies sur une garnison d'une : la passe la tue, la colonne arrive. */
  async function assault(
    t: Bench,
    key: 'warehouse' | 'barracks',
    aim: (buildingId: Id<'buildings'>) => Partial<Doc<'movements'>>,
  ) {
    const { ids, seasonId } = await season(t);
    const [attacker, defender, third] = ids as [Id<'players'>, Id<'players'>, Id<'players'>];
    const region = germanRegions()[0]!;
    const buildingId = await raise(t, defender, key, region.id);
    const garrison = await troop(t, defender, buildingId);
    const troopIds = [
      await troop(t, attacker, null),
      await troop(t, attacker, null),
      await troop(t, attacker, null),
    ];
    await witness(t, third);
    const to = pointOfRegion(region.id);
    const from = east(-100, to);
    const movementId = await t.run((ctx) =>
      ctx.db.insert('movements', {
        seasonId,
        playerId: attacker,
        type: 'attack',
        fromBuildingId: null,
        target: { kind: 'building', buildingId },
        from,
        to,
        hostCountry: 'DEU',
        points: [from, to],
        legs: [{ medium: 'land', distanceUnits: 1 }],
        distanceUnits: 1,
        costUnits: 1,
        troopIds,
        departedAt: Date.now() - 60 * MINUTE,
        arrivesAt: Date.now(),
        ...aim(buildingId),
      }),
    );
    await wholePass(t, seasonId);
    const before = await ledgers(t);
    await t.mutation(internal.movements.arrive, { movementId });
    expect(await t.run((ctx) => ctx.db.get(garrison))).toBeNull();
    return { seasonId, before };
  }

  it('when a plunder meets the garrison of its warehouse', async () => {
    const t = boot();
    const { seasonId, before } = await assault(t, 'warehouse', (buildingId) => ({
      type: 'march',
      plunder: { phase: 'outbound', buildingId },
    }));

    const { left, whole } = await aroundAWholePass(t, seasonId);
    expect(left).toEqual(whole);
    expect(left).not.toEqual(before);
  });

  it('when a capture meets the garrison of its building', async () => {
    const t = boot();
    const { seasonId, before } = await assault(t, 'barracks', (buildingId) => ({
      capture: { kind: 'building', buildingId },
    }));

    expect(await t.run(async (ctx) => (await ctx.db.query('captures').collect()).length)).toBe(1);
    const { left, whole } = await aroundAWholePass(t, seasonId);
    expect(left).toEqual(whole);
    expect(left).not.toEqual(before);
  });

  it('when an airdrop falls on its outpost and the plane flies home', async () => {
    const t = boot();
    const { seats, ids, seasonId } = await season(t);
    const [owner, , third] = ids as [Id<'players'>, Id<'players'>, Id<'players'>];
    const airfield = await raise(t, owner, 'airfield', 'FRA-5323');
    const plane = await troop(t, owner, airfield, 'airTransport');
    await t.run((ctx) => ctx.db.patch(plane, { load: { ammunition: 80, oil: 40, coal: 0 } }));
    const outpostId = await outpost(t, owner, east(30));
    await witness(t, third);
    await t.mutation(api.logistics.airdrop, {
      ...seats[0]!,
      origin: { kind: 'building', buildingId: airfield },
      troopIds: [plane],
      target: { kind: 'outpost', outpostId },
    });
    await wholePass(t, seasonId);
    const flight = (await t.run((ctx) => ctx.db.query('movements').collect())).find(
      (movement) => movement.airdrop !== undefined,
    )!;
    vi.setSystemTime(flight.arrivesAt + 1);
    await wholePass(t, seasonId);
    const before = await ledgers(t);

    await t.mutation(internal.movements.arrive, { movementId: flight._id });

    const { left, whole } = await aroundAWholePass(t, seasonId);
    expect(left).toEqual(whole);
    expect(left).not.toEqual(before);
  });
});

/** **La poursuite d'une Blitz** (B18) : le regard, la route recourbée et la passe au contact. */
describe('a targeted reassessment of a Blitz pursuit leaves nothing for the whole pass to change', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  const PARIS = { lon: 2.35, lat: 48.85 };
  const LYON = { lon: 4.85, lat: 45.75 };

  /** La proie à Lyon, que le chasseur voit d'une pile au sud-ouest ; le témoin, une pile et une
   *  colonne d'un troisième joueur, au nord, là où le chasseur s'arrêtera. Aucun ne joue chez lui :
   *  un sol national relèverait tout et masquerait ce que les troupes relèvent. */
  async function chase(t: Bench) {
    const { seats, ids, seasonId } = await season(t, true);
    const [hunter, quarry, third] = ids as [Id<'players'>, Id<'players'>, Id<'players'>];
    const prey = await troop(t, quarry, LYON);
    await t.run((ctx) => ctx.db.patch(prey, { currentStrength: 1 }));
    await troop(t, hunter, { lon: 4.4, lat: 45.4 });
    await troop(t, third, east(-40, LYON));
    const north = { lon: LYON.lon, lat: 46.15 };
    const passing = await troop(t, third, east(-100, north));
    await t.run((ctx) =>
      ctx.db.insert('movements', {
        seasonId,
        playerId: third,
        type: 'march',
        fromBuildingId: null,
        target: { kind: 'point', point: east(100, north) },
        from: east(-100, north),
        to: east(100, north),
        hostCountry: 'FRA',
        points: [east(-100, north), east(100, north)],
        legs: [{ medium: 'land', distanceUnits: 1 }],
        distanceUnits: 1,
        costUnits: 1,
        troopIds: [passing],
        departedAt: Date.now(),
        arrivesAt: Date.now() + 10 * 60 * MINUTE,
      }),
    );
    return { seats, hunter, prey, seasonId };
  }

  /** Each look of every pursuit, in date order, until none is left. */
  async function runPursuits(t: Bench) {
    for (let step = 0; step < 60; step += 1) {
      const next = (await t.run((ctx) => ctx.db.query('movements').collect()))
        .filter((one) => one.pursuit !== undefined)
        .sort((a, b) => a.pursuit!.checkAt - b.pursuit!.checkAt)[0];
      if (next === undefined) return;
      vi.setSystemTime(next.pursuit!.checkAt);
      await t.mutation(internal.movements.pursue, {
        movementId: next._id,
        expectedAt: next.pursuit!.checkAt,
      });
    }
    throw new Error('a pursuit that never ends');
  }

  it('from the order to the strike, with no whole pass in between', async () => {
    const t = boot();
    const { seats, hunter, prey, seasonId } = await chase(t);
    const tank = await troop(t, hunter, PARIS, 'armor');
    await wholePass(t, seasonId);
    const campId = await surveyCamp(t, seats[0]!, LYON);

    await t.mutation(api.movements.attack, {
      ...seats[0]!,
      origin: { kind: 'point', point: PARIS },
      troopIds: [tank],
      target: { kind: 'camp', campId },
    });
    const ordered = await aroundAWholePass(t, seasonId);
    expect(ordered.left).toEqual(ordered.whole);
    await runPursuits(t);

    expect(await t.run((ctx) => ctx.db.query('engagements').collect())).toHaveLength(1);
    expect(await t.run((ctx) => ctx.db.get(prey))).toBeNull();
    const { left, whole } = await aroundAWholePass(t, seasonId);
    expect(left).toEqual(whole);
  });

  it('when a pursuit takes the road again from short of its target', async () => {
    const t = boot();
    const { hunter, prey, seasonId } = await chase(t);
    const tank = await troop(t, hunter, PARIS, 'armor');
    const short = { lon: 4.85, lat: 46.15 };
    const movementId = await t.run((ctx) =>
      ctx.db.insert('movements', {
        seasonId,
        playerId: hunter,
        type: 'attack',
        fromBuildingId: null,
        target: { kind: 'point', point: LYON },
        from: PARIS,
        to: LYON,
        hostCountry: 'FRA',
        points: [PARIS, short],
        legs: [{ medium: 'land', distanceUnits: 1 }],
        distanceUnits: 1,
        costUnits: 1,
        troopIds: [tank],
        departedAt: MIDDAY - MINUTE,
        arrivesAt: MIDDAY,
        pursuit: { troopId: prey, checkAt: MIDDAY },
      }),
    );
    await wholePass(t, seasonId);
    const before = await ledgers(t);

    await t.mutation(internal.movements.pursue, { movementId, expectedAt: MIDDAY });

    expect((await t.run((ctx) => ctx.db.get(movementId)))?.points[0]).toEqual(short);
    const { left, whole } = await aroundAWholePass(t, seasonId);
    expect(left).toEqual(whole);
    expect(left).not.toEqual(before);
  });
});
