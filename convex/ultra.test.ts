import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import type { LonLat } from '../src/domain/geo';
import type { Nation, UnitRole } from '../src/domain/ids';
import { positionAt } from '../src/domain/interception';
import { windowsOf } from '../src/domain/sighting-windows';
import { nominalStrength } from './constants';
import { forgetMovement } from './movement/arrival';
import { capitalRegionOf } from './regions';
import { marchingForce, reassessDetection } from './movement/detection';
import schema from './schema';
import { modules } from './test.setup';
import { foundSeat, joinSeat, placeHq, seatIn, unclocked, type Seat } from './seats.fixture';

/**
 * **Ultra** (ADR 0047 §3) : une station d'écoute britannique qui relève une colonne navale en lit
 * la destination, au seul observateur britannique, et ce qu'elle a entendu reste su.
 */
const boot = () => convexTest({ schema, modules, transactionLimits: true });
type Bench = ReturnType<typeof boot>;

const MIDDAY = new Date(2026, 7, 17, 12, 0, 0);
/** Le large de la Biscaye, d'ouest en est : rien à terre sous la route. */
const WEST = { lon: -20, lat: 45 };
const EAST = { lon: -8, lat: 45 };

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

/** Une flotte française — une escorte et un cargo, ou les rôles demandés — partie vers l'est. */
async function sailing(
  t: Bench,
  seat: Seat,
  roles: ReadonlyArray<UnitRole> = ['escort', 'cargo'],
  [from, to] = [WEST, EAST],
) {
  const troopIds = [];
  for (const role of roles) troopIds.push(await postAt(t, seat, role, from));
  const filed = await t.mutation(api.movements.marchTo, {
    ...seat,
    origin: { kind: 'point', point: from },
    troopIds,
    point: to,
  });
  const movement = (await t.run((ctx) => ctx.db.get(filed.movementId)))!;
  /** Le point de la route à cette part du trajet, décalé vers le nord. */
  const along = (share: number, northKm = 0): LonLat => {
    const at = movement.departedAt + (movement.arrivesAt - movement.departedAt) * share;
    const [lon, lat] = positionAt(marchingForce(movement), at);
    return [lon, lat + northKm / 111.32];
  };
  return { movement, along };
}

/** Une station d'écoute posée à ce point, au nom d'une région de son teneur. */
async function station(t: Bench, seat: Seat, at: LonLat, nation: Nation) {
  const playerId = await playerOf(t, seat);
  return t.run(async (ctx) =>
    ctx.db.insert('buildings', {
      seasonId: (await ctx.db.get(playerId))!.seasonId,
      playerId,
      key: 'listening',
      regionId: capitalRegionOf(nation),
      point: { lon: at[0], lat: at[1] },
      level: 1,
    }),
  );
}

/** Un avant-poste de vigie, debout. */
async function vigie(t: Bench, seat: Seat, at: LonLat) {
  const playerId = await playerOf(t, seat);
  return t.run(async (ctx) =>
    ctx.db.insert('outposts', {
      seasonId: (await ctx.db.get(playerId))!.seasonId,
      playerId,
      point: { lon: at[0], lat: at[1] },
      hostCountry: 'GBR',
      level: 1,
      foundedAt: Date.now() - 1,
      disabledUntil: null,
      immuneUntil: null,
    }),
  );
}

/** Ce qui suit la pose d'un détecteur : la réévaluation de son joueur. */
const reassess = (t: Bench, seat: Seat, changed?: ReadonlyArray<Id<'players'>>) =>
  t.run((ctx) => reassessDetection(ctx, seat.seasonId, Date.now(), changed));

const rowsOf = async (t: Bench, seat: Seat) => {
  const playerId = await playerOf(t, seat);
  return t.run((ctx) =>
    ctx.db
      .query('sightings')
      .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
      .collect(),
  );
};

const arcsOf = async (t: Bench, seat: Seat) =>
  (await t.query(api.view.playerView, seat)).detected ?? [];

/** Ce que la France lit de sa propre flotte : le point et le nom qu'Ultra doit rendre. */
async function ownDestination(t: Bench, seat: Seat, movement: Doc<'movements'>) {
  const own = (await t.query(api.view.playerView, seat)).movements.find(
    (one) => one.id === movement._id,
  )!;
  return { point: own.to, name: own.destinationName };
}

const at = (time: number) => vi.setSystemTime(time);

/** L'heure qui passe, le planificateur jouant ses jobs : Ultra s'écrit à son réveil (#726). */
async function reach(t: Bench, time: number) {
  vi.advanceTimersByTime(time - Date.now());
  await t.finishInProgressScheduledFunctions();
}

describe('Ultra (ADR 0047 §3)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('serves the destination from the instant a British station hears, a vigie first or not', async () => {
    const t = boot();
    const { uk, france } = await launchedSeason(t);
    const { movement, along } = await sailing(t, france);
    await vigie(t, uk, along(0.2));
    await station(t, uk, along(0.6, 50), 'uk');
    await reassess(t, uk);

    const [row] = await rowsOf(t, uk);
    const windows = windowsOf(row!);
    expect(row).toMatchObject({ detector: 'outpost' });
    expect(windows).toHaveLength(2);
    expect(row!.ultraFrom).toBe(windows[1]!.from);

    /** Sous la seule vigie : le tronçon, sans destination. */
    await reach(t, windows[0]!.from + 1);
    expect((await arcsOf(t, uk))[0]).not.toHaveProperty('destination');
    await reach(t, row!.ultraFrom! - 1);
    expect((await arcsOf(t, uk))[0]).not.toHaveProperty('destination');

    await reach(t, row!.ultraFrom!);
    const [heard] = await arcsOf(t, uk);
    expect(heard!.destination).toEqual(await ownDestination(t, france, movement));
    expect(heard).toMatchObject({ detector: 'outpost' });
  });

  it('marks a row already open when a British station comes to hear it', async () => {
    const t = boot();
    const { uk, france } = await launchedSeason(t);
    const { movement, along } = await sailing(t, france);
    await vigie(t, uk, along(0.2));
    await reassess(t, uk);
    const [open] = await rowsOf(t, uk);
    at(open!.from + 1);

    await station(t, uk, along(0.6, 50), 'uk');
    await reassess(t, uk);

    const [row] = await rowsOf(t, uk);
    expect(row!._id).toBe(open!._id);
    expect(row!.ultraFrom).toBe(windowsOf(row!)[1]!.from);
    await reach(t, row!.ultraFrom!);
    expect((await arcsOf(t, uk))[0]!.destination).toEqual(
      await ownDestination(t, france, movement),
    );
  });

  it('serves nothing of a land column a British station hears', async () => {
    const t = boot();
    const { uk, france } = await launchedSeason(t);
    const { along } = await sailing(
      t,
      france,
      ['infantry', 'armor'],
      [
        { lon: 2, lat: 47 },
        { lon: 5, lat: 47 },
      ],
    );
    await station(t, uk, along(0.5, 30), 'uk');
    await reassess(t, uk);

    const [row] = await rowsOf(t, uk);
    expect(row).toMatchObject({ detector: 'station' });
    expect(row).not.toHaveProperty('ultraFrom');
    at(row!.from + 1);
    expect((await arcsOf(t, uk))[0]).not.toHaveProperty('destination');
  });

  it('wakes the row at the instant a station starts hearing inside a window already open', async () => {
    const t = boot();
    const { uk, france } = await launchedSeason(t);
    const { along } = await sailing(t, france);
    /** La vigie et la station se chevauchent : une seule fenêtre, et Ultra s'ouvre en son milieu. */
    await vigie(t, uk, along(0.4));
    await station(t, uk, along(0.5, 50), 'uk');
    await reassess(t, uk);

    const [row] = await rowsOf(t, uk);
    expect(windowsOf(row!)).toHaveLength(1);
    expect(row!.ultraFrom).toBeGreaterThan(row!.from);
    const job = await t.run((ctx) => ctx.db.system.get(row!.ultraJobId!));
    expect(job).toMatchObject({
      name: 'movements:wakeUltra',
      scheduledTime: row!.ultraFrom,
      args: [{ sightingId: row!._id, expectedAt: row!.ultraFrom }],
    });

    /** Un réveil périmé, ou trop tôt, ne fait rien. */
    for (const expectedAt of [row!.ultraFrom! - 1, row!.ultraFrom!]) {
      await t.mutation(internal.movements.wakeUltra, { sightingId: row!._id, expectedAt });
    }
    expect((await rowsOf(t, uk))[0]!.ultraJobId).toBe(row!.ultraJobId);

    at(row!.ultraFrom!);
    await t.mutation(internal.movements.wakeUltra, {
      sightingId: row!._id,
      expectedAt: row!.ultraFrom!,
    });
    const [woken] = await rowsOf(t, uk);
    expect(woken).not.toHaveProperty('ultraJobId');
    expect(woken!.ultraFrom).toBe(row!.ultraFrom);
  });

  /** **Une ligne née dite** (un cap changé, une seconde jambe) s'ouvre sans dépêche, mais elle
   *  s'écrit à son ouverture : une vue en cache ne relit pas l'heure, et Ultra s'ouvre souvent à
   *  la même. La carte qui récrit ses fenêtres lui garde ce réveil. */
  it('writes a row born told at its opening, without a second dispatch', async () => {
    const t = boot();
    const { uk, france } = await launchedSeason(t);
    const ukId = await playerOf(t, uk);
    const { movement, along } = await sailing(t, france);
    await station(t, uk, along(0.5, 50), 'uk');
    await t.run((ctx) =>
      reassessDetection(ctx, uk.seasonId, Date.now(), undefined, {
        movementId: movement._id,
        by: new Set([ukId]),
      }),
    );
    const [born] = await rowsOf(t, uk);
    expect(born).toMatchObject({ noticeFiled: true, ultraFrom: born!.from });
    expect(born!.from).toBeGreaterThan(Date.now());
    const notices = () => t.run(async (ctx) => (await ctx.db.query('notices').collect()).length);
    const told = await notices();
    const opening = (await t.run((ctx) => ctx.db.system.get(born!.revealJobId!)))!;
    expect(opening).toMatchObject({ name: 'movements:revealSighting', scheduledTime: born!.from });
    at(born!.from);
    await t.mutation(internal.movements.revealSighting, { sightingId: born!._id });
    expect((await rowsOf(t, uk))[0]).not.toHaveProperty('revealJobId');
    expect(await notices()).toBe(told);
  });

  it('keeps the opening wake of a row born told when its windows move', async () => {
    const t = boot();
    const { uk, france } = await launchedSeason(t);
    const ukId = await playerOf(t, uk);
    const { movement, along } = await sailing(t, france);
    await station(t, uk, along(0.5, 50), 'uk');
    await t.run((ctx) =>
      reassessDetection(ctx, uk.seasonId, Date.now(), undefined, {
        movementId: movement._id,
        by: new Set([ukId]),
      }),
    );
    const [born] = await rowsOf(t, uk);

    /** Une ligne dite à venir écrite avant ce réveil n'en a pas : la passe suivante le lui pose. */
    await t.run(async (ctx) => {
      await ctx.scheduler.cancel(born!.revealJobId!);
      await ctx.db.patch(born!._id, { revealJobId: undefined });
    });
    await reassess(t, uk);
    const [mended] = await rowsOf(t, uk);
    expect(mended).toMatchObject({ from: born!.from, noticeFiled: true });
    expect(await t.run((ctx) => ctx.db.system.get(mended!.revealJobId!))).toMatchObject({
      scheduledTime: born!.from,
    });

    await vigie(t, uk, along(0.4));
    await reassess(t, uk);

    const [rewritten] = await rowsOf(t, uk);
    expect(rewritten!.from).toBeLessThan(born!.from);
    const job = await t.run((ctx) => ctx.db.system.get(rewritten!.revealJobId!));
    expect(job).toMatchObject({ scheduledTime: rewritten!.from, state: { kind: 'pending' } });
  });

  it('cancels the wake with the movement, and with the row', async () => {
    const t = boot();
    const { uk, france } = await launchedSeason(t);
    const sailed = [await sailing(t, france), await sailing(t, france)];
    const detectors: Array<Id<'outposts'> | Id<'buildings'>> = [];
    for (const { along } of sailed) {
      detectors.push(await vigie(t, uk, along(0.4)), await station(t, uk, along(0.5, 50), 'uk'));
    }
    await reassess(t, uk);
    const rows = await rowsOf(t, uk);
    const stateOf = (row: Doc<'sightings'>) =>
      t.run(async (ctx) => (await ctx.db.system.get(row.ultraJobId!))!.state.kind);
    expect(await Promise.all(rows.map(stateOf))).toEqual(['pending', 'pending']);

    await t.run((ctx) => forgetMovement(ctx, sailed[0]!.movement._id, Date.now()));
    await t.run(async (ctx) => {
      for (const id of detectors) await ctx.db.delete(id);
    });
    await reassess(t, uk);

    expect(await Promise.all(rows.map(stateOf))).toEqual(['canceled', 'canceled']);
  });

  it('keeps the destination on the frozen arc once the movement is gone', async () => {
    const t = boot();
    const { uk, france } = await launchedSeason(t);
    const { movement, along } = await sailing(t, france);
    await station(t, uk, along(0.5, 30), 'uk');
    await reassess(t, uk);
    const destination = await ownDestination(t, france, movement);
    const [row] = await rowsOf(t, uk);
    await reach(t, row!.from + (row!.to - row!.from) / 2);

    await t.run((ctx) => forgetMovement(ctx, movement._id, Date.now()));

    const [frozen] = await rowsOf(t, uk);
    expect(frozen!.frozen!.destination).toEqual(destination);
    expect(frozen).not.toHaveProperty('ultraJobId');
    expect((await arcsOf(t, uk))[0]!.destination).toEqual(destination);
  });

  it('freezes no destination for a row the station had not heard yet', async () => {
    const t = boot();
    const { uk, france } = await launchedSeason(t);
    const { movement, along } = await sailing(t, france);
    await vigie(t, uk, along(0.2));
    await station(t, uk, along(0.6, 50), 'uk');
    await reassess(t, uk);
    const [row] = await rowsOf(t, uk);
    at(windowsOf(row!)[0]!.from + 1);

    await t.run((ctx) => forgetMovement(ctx, movement._id, Date.now()));

    const [frozen] = await rowsOf(t, uk);
    expect(frozen!.frozen).not.toHaveProperty('destination');
    expect((await arcsOf(t, uk))[0]).not.toHaveProperty('destination');
  });

  it('follows the holder of the station: lost to a German capture, gained by a British one', async () => {
    const t = boot();
    const { uk, france, germany } = await launchedSeason(t);
    const [ukId, germanyId] = [await playerOf(t, uk), await playerOf(t, germany)];
    const { along } = await sailing(t, france);
    const british = await station(t, uk, along(0.6, 50), 'uk');
    const german = await station(t, germany, along(0.3, 50), 'germany');
    await reassess(t, uk);
    expect((await rowsOf(t, uk))[0]!.ultraFrom).toBeDefined();
    expect((await rowsOf(t, germany))[0]).not.toHaveProperty('ultraFrom');

    /** L'Allemagne prend la station britannique avant que la flotte n'y passe, et le Royaume-Uni
     *  la station allemande : la réévaluation ciblée de la capture, sur les deux joueurs. */
    await t.run(async (ctx) => {
      await ctx.db.patch(british, { playerId: germanyId });
      await ctx.db.patch(german, { playerId: ukId });
    });
    await reassess(t, uk, [ukId, germanyId]);

    const [heard] = await rowsOf(t, uk);
    expect(heard).toMatchObject({ detector: 'station', detectorId: german });
    expect(heard!.ultraFrom).toBe(windowsOf(heard!)[0]!.from);
    const [deaf] = await rowsOf(t, germany);
    expect(deaf).toMatchObject({ detectorId: british });
    expect(deaf).not.toHaveProperty('ultraFrom');
  });

  it('keeps what was heard when the station falls afterwards', async () => {
    const t = boot();
    const { uk, france, germany } = await launchedSeason(t);
    const [ukId, germanyId] = [await playerOf(t, uk), await playerOf(t, germany)];
    const { movement, along } = await sailing(t, france);
    const british = await station(t, uk, along(0.5, 30), 'uk');
    await reassess(t, uk);
    const [row] = await rowsOf(t, uk);
    await reach(t, row!.to + 1);

    await t.run((ctx) => ctx.db.patch(british, { playerId: germanyId }));
    await reassess(t, uk, [ukId, germanyId]);

    const [kept] = await rowsOf(t, uk);
    expect(kept!.ultraFrom).toBe(row!.ultraFrom);
    expect((await arcsOf(t, uk))[0]!.destination).toEqual(
      await ownDestination(t, france, movement),
    );
  });

  it('serves the destination to no one else, and nothing new to the one observed', async () => {
    const t = boot();
    const { uk, france, germany } = await launchedSeason(t);
    const { along } = await sailing(t, france);
    await station(t, uk, along(0.5, 30), 'uk');
    await station(t, germany, along(0.5, -30), 'germany');
    await reassess(t, uk);
    const [row] = await rowsOf(t, uk);
    await reach(t, row!.from + 1);

    expect((await arcsOf(t, uk))[0]).toHaveProperty('destination');
    expect(await arcsOf(t, germany)).toHaveLength(1);
    for (const seat of [germany, france]) {
      const view = JSON.stringify(await t.query(api.view.playerView, seat));
      expect(view).not.toContain('"destination"');
    }
    const notices = await t.run((ctx) => ctx.db.query('notices').collect());
    expect(JSON.stringify(notices)).not.toContain('destination');
  });

  it('hears nothing in a Blitz', async () => {
    const t = boot();
    const { uk, france } = await launchedSeason(t);
    const { along } = await sailing(t, france);
    await station(t, uk, along(0.5, 30), 'uk');
    await t.run((ctx) => ctx.db.patch(uk.seasonId, { mode: 'blitz' }));
    await reassess(t, uk);

    const [row] = await rowsOf(t, uk);
    expect(row).toMatchObject({ detector: 'station' });
    expect(row).not.toHaveProperty('ultraFrom');
  });

  it('gives a fleet standing at sea no destination: a camp has none', async () => {
    const t = boot();
    const { uk, france } = await launchedSeason(t);
    await postAt(t, france, 'escort', WEST);
    await station(t, uk, [WEST.lon, WEST.lat + 0.3], 'uk');
    await reassess(t, uk);

    const camps = (await t.query(api.view.playerView, uk)).camps ?? [];
    expect(camps).toHaveLength(1);
    expect(JSON.stringify(camps)).not.toContain('destination');
  });

  it('rewrites nothing on a reassessment that changes nothing', async () => {
    const t = boot();
    const { uk, france } = await launchedSeason(t);
    const { along } = await sailing(t, france);
    await vigie(t, uk, along(0.4));
    await station(t, uk, along(0.5, 50), 'uk');
    await reassess(t, uk);
    const before = await rowsOf(t, uk);
    const jobs = () => t.run((ctx) => ctx.db.system.query('_scheduled_functions').collect());
    const scheduled = (await jobs()).length;
    const patched: Array<string> = [];
    const watched = (changed?: ReadonlyArray<Id<'players'>>) =>
      t.run(async (ctx) => {
        const patch = ctx.db.patch.bind(ctx.db);
        ctx.db.patch = (async (id: Id<'sightings'>, value: Partial<Doc<'sightings'>>) => {
          if (before.some((row) => row._id === id)) patched.push(Object.keys(value).join());
          return patch(id, value);
        }) as typeof ctx.db.patch;
        await reassessDetection(ctx, uk.seasonId, Date.now(), changed);
      });

    await watched();
    at(before[0]!.from + 1);
    await watched();

    expect(patched).toEqual([]);

    expect(await rowsOf(t, uk)).toEqual(before);
    expect((await jobs()).length).toBe(scheduled);
  });

  /** Une station qui écoute à l'instant relit la destination à chaque passe : la même ne se
   *  réécrit pas, sans quoi chaque vue britannique se recalcule pour rien. */
  it('rewrites no destination the station already heard at the same instant', async () => {
    const t = boot();
    const { uk, france } = await launchedSeason(t);
    const { movement, along } = await sailing(t, france);
    await station(t, uk, along(0, 30), 'uk');
    at(movement.departedAt);
    await reassess(t, uk);
    const [row] = await rowsOf(t, uk);
    expect(row!.heardDestination).toEqual(await ownDestination(t, france, movement));

    const patched: Array<string> = [];
    await t.run(async (ctx) => {
      const patch = ctx.db.patch.bind(ctx.db);
      ctx.db.patch = (async (id: Id<'sightings'>, value: Partial<Doc<'sightings'>>) => {
        if (id === row!._id) patched.push(Object.keys(value).join());
        return patch(id, value);
      }) as typeof ctx.db.patch;
      await reassessDetection(ctx, uk.seasonId, Date.now());
    });
    expect(patched).toEqual([]);
  });
});
