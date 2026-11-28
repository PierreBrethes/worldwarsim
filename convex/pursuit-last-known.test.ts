import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { distanceKm } from '../src/domain/geo';
import type { Nation, UnitRole } from '../src/domain/ids';
import { nominalStrength } from './constants';
import { capitalRegionOf, pointOfRegion, regionFacts } from './regions';
import schema from './schema';
import { fileSurvey } from './surveys';
import { resolveDueLootCollectionMissions } from './lootCollections';
import { modules } from './test.setup';
import { foundSeat, joinSeat, placeHq, seatIn, unclocked, type Seat } from './seats.fixture';

/**
 * **La dernière position connue ne suit plus la colonne** (#727). Un coude de poursuite réécrit le
 * mouvement sur place, et la présence d'un pillage aussi ; l'arc d'un observateur dont la fenêtre
 * est close se relisait sur la route neuve, et la dernière position connue sautait là où la
 * colonne était vraiment. De vraies mutations, et le planificateur qui joue ses jobs jusqu'à une
 * heure donnée.
 */
const boot = () => convexTest({ schema, modules, transactionLimits: true });
type Bench = ReturnType<typeof boot>;
type Arc = NonNullable<Awaited<ReturnType<typeof arcsOf>>>[number];
/** Une lecture : l'heure, le mouvement suivi, et l'arc que chaque observateur en lit. */
type Read = {
  readonly at: number;
  readonly chase: Doc<'movements'> | null;
  readonly arcs: ReadonlyArray<Arc | undefined>;
};

const MIDDAY = new Date(2026, 7, 17, 12, 0, 0);
const playerOf = (t: Bench, seat: Seat) => t.run(async (ctx) => (await seatIn(ctx, seat))._id);

async function launchedSeason<N extends Nation>(
  t: Bench,
  nations: ReadonlyArray<N>,
  blitz = false,
): Promise<Record<N, Seat>> {
  const { seat, code } = await foundSeat(t, 'Pierre', 0.5);
  const seats = { [nations[0]!]: seat } as Record<N, Seat>;
  for (const [rank, nation] of nations.entries())
    if (rank > 0) seats[nation] = await joinSeat(t, code, `Joueur ${String(rank)}`);
  for (const nation of nations) {
    await t.mutation(api.players.reserveNation, { ...seats[nation], nation });
    await t.mutation(api.players.declareReady, { ...seats[nation], ready: true });
  }
  await t.mutation(api.seasons.launch, seat);
  await unclocked(t);
  for (const nation of nations) {
    await placeHq(t, seats[nation]);
    const playerId = await playerOf(t, seats[nation]);
    await t.run(async (ctx) => {
      for (const troop of await ctx.db
        .query('troops')
        .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
        .collect())
        await ctx.db.delete(troop._id);
    });
  }
  if (blitz)
    await t.run((ctx) => ctx.db.patch(seat.seasonId, { mode: 'blitz', theatre: 'europe' }));
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

/** Une station debout avant tout départ. */
async function station(t: Bench, seat: Seat, point: { lon: number; lat: number }) {
  const playerId = await playerOf(t, seat);
  const nation = (await t.run((ctx) => ctx.db.get(playerId)))!.nation as Nation;
  await t.run(async (ctx) =>
    ctx.db.insert('buildings', {
      seasonId: seat.seasonId,
      playerId,
      key: 'listening',
      regionId: capitalRegionOf(nation),
      point,
      level: 1,
    }),
  );
}

/** Les jobs échus jusqu'à `time`, dans l'ordre : jamais le saut d'un réveil lointain. */
async function reach(t: Bench, time: number) {
  for (let job = 0; job < 500; job += 1) {
    const due = await t.run(
      async (ctx) =>
        (await ctx.db.system.query('_scheduled_functions').collect())
          .filter((one) => one.state.kind === 'pending' && one.scheduledTime <= time)
          .map((one) => one.scheduledTime)
          .sort((a, b) => a - b)
          .at(0) ?? null,
    );
    if (due === null) {
      vi.advanceTimersByTime(Math.max(0, time - Date.now()));
      await t.finishInProgressScheduledFunctions();
      return;
    }
    vi.advanceTimersByTime(Math.max(0, due - Date.now()));
    await t.finishInProgressScheduledFunctions();
  }
  throw new Error('the scheduler never settles');
}

const arcsOf = async (t: Bench, seat: Seat) =>
  (await t.query(api.view.playerView, seat)).detected ?? [];

const movementCarrying = (t: Bench, troopId: Id<'troops'>) =>
  t.run(
    async (ctx) =>
      (await ctx.db.query('movements').collect()).find((one) => one.troopIds.includes(troopId)) ??
      null,
  );

/**
 * **Chaque regard de la poursuite, joué par le planificateur**, et l'arc de chaque observateur
 * relu avant le premier et après chacun.
 */
async function chaseUnder(
  t: Bench,
  hunter: Id<'troops'>,
  observers: ReadonlyArray<Seat>,
  steps: number,
): Promise<ReadonlyArray<Read>> {
  const chaseId = (await movementCarrying(t, hunter))!._id;
  const read = async (): Promise<Read> => ({
    at: Date.now(),
    chase: await t.run((ctx) => ctx.db.get(chaseId)),
    arcs: await Promise.all(
      observers.map(async (seat) => (await arcsOf(t, seat)).find((arc) => arc.id === chaseId)),
    ),
  });
  const reads = [await read()];
  for (let step = 0; step < steps; step += 1) {
    const chase = reads.at(-1)!.chase;
    if (chase?.pursuit === undefined) break;
    await reach(t, chase.pursuit.checkAt);
    reads.push(await read());
  }
  return reads;
}

/**
 * **Ce que le joueur voit** : relue après un coude pris quand elle était close, la même fenêtre
 * sert l'arc de la lecture d'avant, au point près ; une fenêtre ouverte suit la poursuite, depuis
 * le coude. Rend le nombre de coudes pris sous une fenêtre close et sous une fenêtre ouverte, et
 * celui des fenêtres servies, pour que la scène prouve quelque chose.
 */
function lastKnownHolds(reads: ReadonlyArray<Read>, observer: number) {
  let held: Arc | undefined;
  let bend = reads[0]?.chase?.departedAt;
  let bendsUnseen = 0;
  let bendsSeen = 0;
  const windows = new Set<number>();
  for (const { at, arcs, chase } of reads) {
    const arc = arcs[observer];
    const bent = chase !== null && chase.departedAt !== bend;
    if (chase !== null) bend = chase.departedAt;
    const before = held;
    held = arc;
    if (arc === undefined || !bent) continue;
    windows.add(arc.seenFrom);
    if (before?.seenFrom === arc.seenFrom && before.seenTo === arc.seenTo && arc.seenTo < at) {
      expect(arc).toEqual(before);
      bendsUnseen += 1;
    } else if (arc.seenTo > at) {
      /** Encore vue, la colonne se lit sur sa route neuve, depuis le coude. */
      expect(
        distanceKm([arc.from.lon, arc.from.lat], [chase.from.lon, chase.from.lat]),
      ).toBeLessThan(1);
      bendsSeen += 1;
    }
  }
  return { bendsUnseen, bendsSeen, windows: windows.size };
}

/** La ligne de cet observateur sur ce mouvement. */
async function rowOf(t: Bench, seat: Seat, movementId: Id<'movements'>) {
  const playerId = await playerOf(t, seat);
  return (
    await t.run((ctx) =>
      ctx.db
        .query('sightings')
        .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
        .collect(),
    )
  ).find((one) => one.movementId === movementId)!;
}

/** Ce qu'un arc dit de la colonne, hors de ce que le souvenir date autrement (`arrivesAt`). */
const stretchOf = ({ from, to, points, legs, headingDegrees, seenFrom, seenTo }: Arc) => ({
  from,
  to,
  points,
  legs,
  headingDegrees,
  seenFrom,
  seenTo,
});

describe('the last known position of a column rewritten in place (#727)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('stays on the stretch seen in a Mondiale, however the pursuit bends after', async () => {
    const t = boot();
    const { france, germany, italy } = await launchedSeason(t, [
      'france',
      'germany',
      'italy',
    ] as const);
    const FR = { lon: -19.5, lat: 45 };
    const DE = { lon: -17.3, lat: 45 };
    /** Deux stations allemandes sur la route de la poursuite, qui file vers l'est : la première
     *  l'entend partir puis la perd, la seconde la reprend plus loin, puis la perd à son tour.
     *  L'italienne l'entend partir, et ne l'entend plus. */
    await station(t, germany, { lon: FR.lon, lat: FR.lat - 0.3 });
    await station(t, germany, { lon: -13.5, lat: FR.lat - 0.3 });
    await station(t, italy, { lon: FR.lon, lat: FR.lat + 0.3 });
    const hunters = [await postAt(t, france, 'carrier', FR), await postAt(t, france, 'escort', FR)];
    const cargo = await postAt(t, germany, 'cargo', DE);
    await t.mutation(api.movements.marchTo, {
      ...germany,
      origin: { kind: 'point', point: DE },
      troopIds: [cargo],
      point: { lon: -8, lat: 45 },
    });
    const track = (await arcsOf(t, france)).find((arc) => arc.seenTo >= Date.now())!;
    await t.mutation(api.movements.attack, {
      ...france,
      origin: { kind: 'point', point: FR },
      troopIds: hunters,
      target: { kind: 'track', movementId: track.id as Id<'movements'> },
    });

    const reads = await chaseUnder(t, hunters[0]!, [germany, italy], 30);
    const german = lastKnownHolds(reads, 0);
    expect(german.windows).toBeGreaterThan(1);
    expect(german.bendsSeen).toBeGreaterThan(1);
    expect(german.bendsUnseen).toBeGreaterThan(2);
    expect(lastKnownHolds(reads, 1).bendsUnseen).toBeGreaterThan(2);

    /** **La poursuite finie, le souvenir est le dernier tronçon vu**, pas celui de la route du
     *  moment : la ligne se fige à l'oubli du mouvement sur la route qu'elle a gardée. */
    const chaseId = reads[0]!.chase!._id;
    expect(await t.run((ctx) => ctx.db.get(chaseId))).toBeNull();
    const lastSeen = [...reads].reverse().find((read) => read.arcs[1] !== undefined)!.arcs[1]!;
    const row = await rowOf(t, italy, chaseId);
    const memory = (await arcsOf(t, italy)).find((arc) => arc.id === row._id);
    expect(stretchOf(memory!)).toEqual(stretchOf(lastSeen));
    /** Le souvenir tient son tronçon : la route gardée part avec le mouvement. */
    expect(row.seenOn).toBeUndefined();
  });

  it('stays on the stretch seen in a Blitz, where the pursuit looks every fifteen seconds', async () => {
    const t = boot();
    const { france, ussr, germany } = await launchedSeason(
      t,
      ['france', 'ussr', 'germany'] as const,
      true,
    );
    /** Deux blindés de même allure : le chasseur suit sans rattraper, et l'infanterie allemande
     *  restée au départ le voit partir puis le perd. */
    const START = { lon: 17.0, lat: 52.3 };
    const AHEAD = { lon: 17.6, lat: 52.3 };
    const hunter = await postAt(t, france, 'armor', START);
    await postAt(t, germany, 'infantry', { lon: START.lon, lat: START.lat + 0.1 });
    const quarry = await postAt(t, ussr, 'armor', AHEAD);
    await t.mutation(api.movements.marchTo, {
      ...ussr,
      origin: { kind: 'point', point: AHEAD },
      troopIds: [quarry],
      point: { lon: 21.0, lat: 52.3 },
    });
    const track = (await arcsOf(t, france)).find((arc) => arc.seenTo >= Date.now())!;
    await t.mutation(api.movements.attack, {
      ...france,
      origin: { kind: 'point', point: START },
      troopIds: [hunter],
      target: { kind: 'track', movementId: track.id as Id<'movements'> },
    });

    const german = lastKnownHolds(await chaseUnder(t, hunter, [germany], 60), 0);
    expect(german.bendsSeen).toBeGreaterThan(0);
    expect(german.bendsUnseen).toBeGreaterThan(2);
  });

  /**
   * **Sur place, la route d'un pillage n'est plus que le site** (#633) : la présence réécrit le
   * mouvement, et l'arc d'un observateur qui a perdu la colonne en route se relisait au site — sa
   * destination, que le brouillard garde.
   */
  it('stays where the plunder was last seen, never at the warehouse it reached', async () => {
    const t = boot();
    const { france, ussr, germany } = await launchedSeason(t, [
      'france',
      'ussr',
      'germany',
    ] as const);
    const PRAHOVA = 'ROU-310';
    const site = pointOfRegion(PRAHOVA);
    const ussrId = await playerOf(t, ussr);
    const warehouseId = await t.run((ctx) =>
      ctx.db.insert('buildings', {
        seasonId: ussr.seasonId,
        playerId: ussrId,
        key: 'warehouse',
        regionId: PRAHOVA,
        point: site,
        level: 1,
      }),
    );
    const franceId = await playerOf(t, france);
    await t.run((ctx) =>
      fileSurvey(ctx, franceId, [{ point: regionFacts(PRAHOVA)!.point, radiusKm: 1 }], Date.now()),
    );
    const start = { lon: site.lon - 2.5, lat: site.lat };
    const infantry = await postAt(t, france, 'infantry', start);
    await postAt(t, germany, 'infantry', { lon: start.lon, lat: start.lat + 0.1 });
    await t.mutation(api.movements.plunder, {
      ...france,
      origin: { kind: 'point', point: start },
      troopIds: [infantry],
      buildingId: warehouseId,
    });
    const outbound = (await movementCarrying(t, infantry))!;
    const seen = (await arcsOf(t, germany)).find((arc) => arc.id === outbound._id)!;
    expect(seen.seenTo).toBeLessThan(outbound.arrivesAt);
    expect(distanceKm([seen.to.lon, seen.to.lat], [site.lon, site.lat])).toBeGreaterThan(50);

    await reach(t, outbound.arrivesAt);
    expect((await t.run((ctx) => ctx.db.get(outbound._id)))?.plunder?.phase).toBe('presence');
    const after = (await arcsOf(t, germany)).find((arc) => arc.id === outbound._id)!;
    expect(after).toEqual(seen);
  });
  /**
   * **Une arrivée rechiffrée sur place** (le Fort, ADR 0037 §6 ; le repos, fiche 07) : la route
   * reste, l'heure change. Qui a perdu la colonne avant n'en apprend pas le retard.
   */
  it('keeps the hour it was seen at when a Fort holds the column after', async () => {
    const t = boot();
    const { france, ussr, germany } = await launchedSeason(t, [
      'france',
      'ussr',
      'germany',
    ] as const);
    const here = pointOfRegion('ROU-310');
    const ussrId = await playerOf(t, ussr);
    await t.run(async (ctx) =>
      ctx.db.insert('outposts', {
        seasonId: ussr.seasonId,
        playerId: ussrId,
        point: here,
        hostCountry: 'ROU',
        level: 2,
        specialty: 'fort',
        foundedAt: Date.now(),
        disabledUntil: null,
        immuneUntil: null,
      }),
    );
    /** Une route d'ouest en est à 30 km au nord du Fort, et l'infanterie allemande à 20 km du
     *  départ, qui la perd bien avant l'entrée dans la vigie. */
    const degreesEast = (km: number) => km / (111.32 * Math.cos((here.lat * Math.PI) / 180));
    const lat = here.lat + 30 / 111.32;
    const from = { lon: here.lon + degreesEast(-150), lat };
    const column = await postAt(t, france, 'infantry', from);
    await postAt(t, germany, 'infantry', { lon: from.lon + degreesEast(-20), lat });
    const { movementId } = await t.mutation(api.movements.marchTo, {
      ...france,
      origin: { kind: 'point', point: from },
      troopIds: [column],
      point: { lon: here.lon + degreesEast(150), lat },
    });
    const outbound = (await t.run((ctx) => ctx.db.get(movementId)))!;
    const seen = (await arcsOf(t, germany)).find((arc) => arc.id === movementId)!;
    expect(seen.seenTo).toBeLessThan(outbound.fortEntry!.at);

    await reach(t, outbound.fortEntry!.at);
    const held = (await t.run((ctx) => ctx.db.get(movementId)))!;
    expect(held.arrivesAt).toBeGreaterThan(outbound.arrivesAt);
    expect((await arcsOf(t, germany)).find((arc) => arc.id === movementId)).toEqual(seen);
  });

  it('keeps the hour it was seen at when the rest window holds the column at its arrival', async () => {
    const t = boot();
    const { france, ussr, germany } = await launchedSeason(t, [
      'france',
      'ussr',
      'germany',
    ] as const);
    /** Le Soviétique se repose toute la journée : l'arrivée sur son sol est retenue. */
    const ussrId = await playerOf(t, ussr);
    await t.run((ctx) =>
      ctx.db.patch(ussrId, { restWindow: { startMinutes: 0, endMinutes: 1439 } }),
    );
    const pskov = pointOfRegion('RUS-2335');
    const from = { lon: pskov.lon - 2, lat: pskov.lat };
    const column = await postAt(t, france, 'infantry', from);
    await postAt(t, germany, 'infantry', { lon: from.lon - 0.3, lat: from.lat });
    const { movementId } = await t.mutation(api.movements.marchTo, {
      ...france,
      origin: { kind: 'point', point: from },
      troopIds: [column],
      point: pskov,
    });
    const outbound = (await t.run((ctx) => ctx.db.get(movementId)))!;
    expect(outbound.hostCountry).toBe('RUS');
    const seen = (await arcsOf(t, germany)).find((arc) => arc.id === movementId)!;
    expect(seen.seenTo).toBeLessThan(outbound.arrivesAt);

    await reach(t, outbound.arrivesAt);
    expect((await t.run((ctx) => ctx.db.get(movementId)))?.heldAt).toBe(outbound.arrivesAt);
    expect((await arcsOf(t, germany)).find((arc) => arc.id === movementId)).toEqual(seen);
  });
  /** **Une collecte retenue par un autre que son arrivée** : la colonne due sur une caisse que
   *  résout une autre colonne, ou l'expiration, à l'instant où son propre job n'a pas joué. */
  it('keeps the hour it was seen at when a crate holds a due collection for the rest window', async () => {
    const t = boot();
    const { france, ussr, germany } = await launchedSeason(t, [
      'france',
      'ussr',
      'germany',
    ] as const);
    const ussrId = await playerOf(t, ussr);
    await t.run((ctx) =>
      ctx.db.patch(ussrId, { restWindow: { startMinutes: 0, endMinutes: 1439 } }),
    );
    const pskov = pointOfRegion('RUS-2335');
    const franceId = await playerOf(t, france);
    const zero = { ammunition: 0, oil: 0, coal: 0, food: 0, steel: 0 };
    const { crateId, sightingId } = await t.run(async (ctx) => {
      const engagementId = await ctx.db.insert('engagements', {
        seasonId: france.seasonId,
        attackerId: franceId,
        defenderId: ussrId,
        cause: 'arrival',
        point: pskov,
        hostCountry: 'RUS',
        at: Date.now(),
        winner: 'attacker',
        outpostId: null,
        disabledUntil: null,
        troops: [],
      });
      const recoveryId = await ctx.db.insert('lootRecoveries', {
        seasonId: france.seasonId,
        engagementId,
        dispossessedPlayerId: ussrId,
        recoveringPlayerId: franceId,
        point: pskov,
        at: Date.now(),
        recovered: zero,
        remainder: zero,
      });
      const crateId = await ctx.db.insert('lootCrates', {
        seasonId: france.seasonId,
        recoveryId,
        point: pskov,
        appearedAt: Date.now(),
        expiresAt: Date.now() + 48 * 3_600_000,
        loot: { ...zero, steel: 100 },
      });
      const sightingId = await ctx.db.insert('lootCrateSightings', {
        seasonId: france.seasonId,
        playerId: franceId,
        crateId,
        point: pskov,
        loot: { ...zero, steel: 100 },
        seenAt: Date.now(),
        present: true,
        current: true,
      });
      return { crateId, sightingId };
    });
    const from = { lon: pskov.lon - 2, lat: pskov.lat };
    const column = await postAt(t, france, 'infantry', from);
    await postAt(t, germany, 'infantry', { lon: from.lon - 0.3, lat: from.lat });
    const { movementId } = await t.mutation(api.movements.collectLoot, {
      ...france,
      origin: { kind: 'point', point: from },
      troopIds: [column],
      sightingId,
    });
    const outbound = (await t.run((ctx) => ctx.db.get(movementId)))!;
    const seen = (await arcsOf(t, germany)).find((arc) => arc.id === movementId)!;
    expect(seen.seenTo).toBeLessThan(outbound.arrivesAt);

    await reach(t, outbound.arrivesAt - 1);
    vi.setSystemTime(outbound.arrivesAt);
    await t.run((ctx) =>
      resolveDueLootCollectionMissions(ctx, {
        seasonId: france.seasonId,
        crateId,
        at: outbound.arrivesAt,
        inclusive: true,
        now: outbound.arrivesAt,
      }),
    );
    expect((await t.run((ctx) => ctx.db.get(movementId)))?.heldAt).toBe(outbound.arrivesAt);
    expect((await arcsOf(t, germany)).find((arc) => arc.id === movementId)).toEqual(seen);
  });
});
