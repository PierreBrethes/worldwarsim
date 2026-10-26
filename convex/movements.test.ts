import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { bearingDegrees, destinationPoint, distanceKm, type LonLat } from '../src/domain/geo';
import {
  ARRIVAL_RADIUS_KM,
  buildCost,
  buildMinutes,
  DEFAULT_REST_START_MINUTES,
  nominalStrength,
  OUTPOST_DISABLED_HOURS,
  outpostReachKm,
  REST_WINDOW_MINUTES,
  DETECTION_RANGE_KM,
} from './constants';
import { ConvexError } from 'convex/values';
import { internal } from './_generated/api';
import type { BuildingKey, UnitRole } from '../src/domain/ids';
import {
  landCostOf,
  legalMovementTypes,
  refusalOf,
  type Column,
  type MovementAim,
} from '../src/domain/movement-orders';
import { COST_BY_MEDIUM } from '../src/domain/routing';
import { foundationMinutes } from '../src/domain/level-speed';
import { regionFacts } from './regions';
import { regionAtRoutePoint } from './regionGeometry';
import { asPoint, pointOf } from './movement/forces';
import { coastAtPoint, hostAtPoint, landAtPoint, routeBetween } from './routes';
import schema from './schema';
import { modules } from './test.setup';
import {
  attacking,
  foundSeat,
  joinSeat,
  placeHq,
  seatIn,
  surveyCamp,
  surveyRegion,
  unclocked,
  pointIn,
} from './seats.fixture';
import type { Seat } from './seats.fixture';

/** Le rayon d'un point neuf : la portée suit le niveau depuis le 31/08, et ces cas plantent
 *  tous un avant-poste de niveau 1. */
const REACH_KM = outpostReachKm(1);

const boot = () => convexTest({ schema, modules, transactionLimits: true });

const MARNE = 'FRA-5323'; // where the barracks stands
const PRAHOVA = 'ROU-310'; // Romanian oil, 1 800 km east — nobody's home country
const RUHR = 'DEU-1572'; // German, and far out of any Romanian reach
const RIYADH = 'SAU-1097'; // Ar Riyad — a second neutral, to prove neutrals are not one country
const PSKOV = 'RUS-2335'; // Soviet, so somebody sleeps there
/** **Une région immense, et un point dedans qui est loin de son pôle d'inaccessibilité** : le
 *  Fort McMurray albertain se tient à 378 km du point que `region-index.json` donne à l'Alberta,
 *  soit trois fois la portée d'un avant-poste neuf. C'est le cas qui a fait écrire la précision
 *  du 04/09 — et l'Alberta porte du pétrole, comme la Sibérie de la partie de test. */
const ALBERTA = 'CAN-632';
const FORT_MCMURRAY: LonLat = [-111.38, 56.73];
/** À plus de 600 km à l'ouest : aucune cellule dans le rayon d'un point neuf. */
const BRITISH_COLUMBIA = 'CAN-633'; // voisine, son point à 659 km : hors de portée et elle le reste

async function launchedSeason(t: ReturnType<typeof boot>) {
  const { seat, code } = await foundSeat(t, 'Pierre', 0.5);
  const guest = await joinSeat(t, code, 'Léa');
  await t.mutation(api.players.reserveNation, { ...seat, nation: 'france' });
  await t.mutation(api.players.declareReady, { ...seat, ready: true });
  await t.mutation(api.players.reserveNation, { ...guest, nation: 'ussr' });
  await t.mutation(api.players.declareReady, { ...guest, ready: true });
  await t.mutation(api.seasons.launch, seat);
  await unclocked(t);
  await placeHq(t, seat);
  await placeHq(t, guest);
  await disbandTheGift(t, seat, guest);
  return { seat, guest };
}

/**
 * **The company the launch hands out, taken back** (`seasons.endow`, 25/08). Every count in
 * this file is about an army a test formed on purpose, so the endowment is cleared at the door
 * rather than added to twenty expectations. What it *is* is graved in `off-season.test.ts`,
 * where the endowment itself is under test.
 */
async function disbandTheGift(t: ReturnType<typeof boot>, ...seats: ReadonlyArray<Seat>) {
  for (const seat of seats) {
    const playerId = await playerOf(t, seat);
    await t.run(async (ctx) => {
      const held = await ctx.db
        .query('troops')
        .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
        .collect();
      for (const troop of held) await ctx.db.delete(troop._id);
    });
  }
}

async function playerOf(t: ReturnType<typeof boot>, seat: Seat) {
  return t.run(async (ctx) => {
    const player = await seatIn(ctx, seat);
    return player._id;
  });
}

/** A standing building and a formed troop, without paying for either: what is under test is
 *  the march, not the production that fed it. */
async function raise(
  t: ReturnType<typeof boot>,
  seat: Seat,
  key: BuildingKey,
  regionId: string,
  /** The quay a port stands on, when the test needs it away from its region's centroid. */
  point?: { lon: number; lat: number },
): Promise<Id<'buildings'>> {
  const playerId = await playerOf(t, seat);
  return t.run(async (ctx) => {
    const seasonId = (await ctx.db.get(playerId))!.seasonId;
    return ctx.db.insert('buildings', {
      seasonId,
      playerId,
      key,
      regionId,
      point: pointIn(regionId),
      level: 1,
      ...(point === undefined ? {} : { point }),
    });
  });
}

async function form(
  t: ReturnType<typeof boot>,
  seat: Seat,
  role: UnitRole,
  stationedAt: Id<'buildings'> | null,
): Promise<Id<'troops'>> {
  const playerId = await playerOf(t, seat);
  const strength = nominalStrength(role, 1);
  return t.run(async (ctx) => {
    const seasonId = (await ctx.db.get(playerId))!.seasonId;
    return ctx.db.insert('troops', {
      seasonId,
      playerId,
      role,
      tier: 1,
      nominalStrength: strength,
      currentStrength: strength,
      stationedAt,
    });
  });
}

/** **Une troupe posée à une adresse**, et à la force qu'on veut : `form` ne sait pendre qu'à un
 *  mât, et les cas du large ont besoin d'une pile mouillée avant qu'un ordre existe. */
async function postAt(
  t: ReturnType<typeof boot>,
  seat: Seat,
  role: UnitRole,
  at: { lon: number; lat: number },
  strengthFactor = 1,
): Promise<Id<'troops'>> {
  const troopId = await form(t, seat, role, null);
  await t.run(async (ctx) => {
    const troop = (await ctx.db.get(troopId))!;
    await ctx.db.patch(troopId, {
      stationedAt: at,
      currentStrength: Math.round(troop.nominalStrength * strengthFactor),
    });
  });
  return troopId;
}

async function outpostsOf(t: ReturnType<typeof boot>, seat: Seat) {
  const playerId = await playerOf(t, seat);
  return t.run(async (ctx) =>
    ctx.db
      .query('outposts')
      .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
      .collect(),
  );
}

async function movementsOf(t: ReturnType<typeof boot>, seat: Seat) {
  const playerId = await playerOf(t, seat);
  return t.run(async (ctx) =>
    ctx.db
      .query('movements')
      .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
      .collect(),
  );
}

async function engagementsIn(t: ReturnType<typeof boot>) {
  return t.run(async (ctx) => ctx.db.query('engagements').collect());
}

/** Le détail frappe par frappe pend à l'engagement (`strikes`), il n'est plus dans son document. */
async function strikesIn(t: ReturnType<typeof boot>, engagementId: Id<'engagements'>) {
  return t.run(async (ctx) =>
    (
      await ctx.db
        .query('strikes')
        .withIndex('byEngagement', (q) => q.eq('engagementId', engagementId))
        .collect()
    ).sort((a, b) => a.rank - b.rank),
  );
}

async function ammunitionOf(t: ReturnType<typeof boot>, seat: Seat): Promise<number> {
  const view = await t.query(api.view.playerView, seat);
  return view.me.resources.ammunition.stock;
}

/** The ammunition on the personal board, set where a case needs it — what the anchor rearms from. */
async function setAmmunition(t: ReturnType<typeof boot>, seat: Seat, stock: number) {
  const playerId = await playerOf(t, seat);
  await t.run(async (ctx) => {
    const row = await ctx.db
      .query('resources')
      .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
      .collect();
    const held = row.find((one) => one.key === 'ammunition');
    if (!held) throw new Error('no ammunition row');
    await ctx.db.patch(held._id, { stock, updatedAt: Date.now() });
  });
}

/**
 * **De quoi payer une fondation**, et rien de plus subtil : fonder se paie depuis la révision
 * du 15/09, et un scénario qui parle d'autre chose n'a pas à se soucier du stock d'ouverture.
 */
async function fundFoundation(t: ReturnType<typeof boot>, seat: Seat) {
  const playerId = await playerOf(t, seat);
  const cost = buildCost('outpost', 1);
  await t.run(async (ctx) => {
    for (const row of await ctx.db
      .query('resources')
      .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
      .collect()) {
      const due = cost[row.key] ?? 0;
      if (due > 0) await ctx.db.patch(row._id, { stock: due * 10, updatedAt: Date.now() });
    }
  });
}

/** An outpost planted without walking to it: what is under test is what happens *at* it. */
async function plant(
  t: ReturnType<typeof boot>,
  seat: Seat,
  point: LonLat,
  hostCountry: string,
  /** La région où il se plante, telle que la carte la nomme. Omise, le point se relit par le
   *  repli, comme ceux d'avant le champ (précision du 04/09). */
  regionId?: string,
): Promise<Id<'outposts'>> {
  const playerId = await playerOf(t, seat);
  return t.run(async (ctx) => {
    const seasonId = (await ctx.db.get(playerId))!.seasonId;
    return ctx.db.insert('outposts', {
      seasonId,
      playerId,
      point: { lon: point[0], lat: point[1] },
      hostCountry,
      ...(regionId === undefined ? {} : { regionId }),
      level: 1,
      specialization: 'relay',
      foundedAt: Date.now(),
      disabledUntil: null,
      immuneUntil: null,
    });
  });
}

async function garrison(t: ReturnType<typeof boot>, seat: Seat, outpostId: Id<'outposts'>) {
  const troopId = await form(t, seat, 'infantry', null);
  await t.run(async (ctx) => ctx.db.patch(troopId, { stationedAt: outpostId }));
  return troopId;
}

/** A column left standing on the map — the third form of an address (ADR 0019 §1). */
async function post(
  t: ReturnType<typeof boot>,
  seat: Seat,
  point: LonLat,
  role: UnitRole = 'infantry',
) {
  const troopId = await form(t, seat, role, null);
  await t.run(async (ctx) =>
    ctx.db.patch(troopId, { stationedAt: { lon: point[0], lat: point[1] } }),
  );
  return troopId;
}

/** A point a given distance due east of another, at this latitude. Written out rather than
 *  eyeballed: the tests below turn on being just inside or just outside `ARRIVAL_RADIUS_KM`. */
const eastOf = (point: LonLat, km: number): LonLat => [
  point[0] + km / (111.32 * Math.cos((point[1] * Math.PI) / 180)),
  point[1],
];

/** Away from anyone's rest window, so the march is the only thing being measured. */
const MIDDAY = new Date(2026, 7, 17, 12, 0, 0);

describe('a posted column founds an outpost where it stands', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  const asPoint = (point: LonLat) => ({ lon: point[0], lat: point[1] });

  it('plants the point under its feet and becomes its garrison', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const point = regionFacts(PRAHOVA)!.point;
    const posted = await post(t, seat, point);

    await t.mutation(api.movements.foundOutpostHere, {
      regionId: null,
      ...seat,
      point: asPoint(point),
      specialization: 'relay',
      troopIds: [posted],
    });

    const [outpost] = await outpostsOf(t, seat);
    expect(outpost).toBeDefined();
    expect(outpost!.hostCountry).toBe('ROU');
    expect(outpost!.specialization).toBe('relay');
    expect(outpost!.level).toBe(1);
    /** Exactly where the column stood: nothing walks, so nothing rounds the place either. */
    expect(outpost!.point).toEqual(asPoint(point));

    // The founding column becomes the garrison — one address, and it changed (ADR 0014).
    expect((await t.run(async (ctx) => ctx.db.get(posted)))!.stationedAt).toBe(outpost!._id);
    const view = await t.query(api.view.playerView, seat);
    expect(view.me.outposts[0]!.garrison).toBe(1);
    expect(view.me.armyPresent.infantry ?? 0).toBe(0);
    expect(view.me.troops).toHaveLength(1);

    /** **Founding is not a march**: no slot is spent, nothing is scheduled, nothing walks. */
    expect(view.me.slots.used).toBe(0);
    expect(await movementsOf(t, seat)).toHaveLength(0);
  });

  /**
   * The intention, graven. Romania and Arabia are two hosts, and every rule of fiche 03 that is
   * still unwritten — decreasing yield per host, finite trade capacity, relation per player,
   * expulsion of a country saturated with outposts — has this string for its key. It was worth
   * nothing while every country nobody plays answered the same one.
   */
  it('gives two outposts in two neutral countries two different hosts', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    await fundFoundation(t, seat);

    for (const regionId of [PRAHOVA, RIYADH]) {
      const point = regionFacts(regionId)!.point;
      await t.mutation(api.movements.foundOutpostHere, {
        regionId: null,
        ...seat,
        point: asPoint(point),
        specialization: 'relay',
        troopIds: [await post(t, seat, point)],
      });
    }

    const hosts = (await outpostsOf(t, seat)).map((outpost) => outpost.hostCountry);
    expect([...hosts].sort()).toEqual(['ROU', 'SAU']);
  });

  it('refuses a pile that is not infantry alone', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const point = regionFacts(PRAHOVA)!.point;
    const tank = await post(t, seat, point, 'armor');

    await expect(
      t.mutation(api.movements.foundOutpostHere, {
        regionId: null,
        ...seat,
        point: asPoint(point),
        specialization: 'relay',
        troopIds: [tank],
      }),
    ).rejects.toThrow('INFANTRY_ONLY');
  });

  /** An outpost is what carries a build site beyond one's own ground: on ground already
   *  carrying a building of mine it has nothing to offer (ADR 0004). */
  it('refuses ground that already carries a building of mine', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    await raise(t, seat, 'barracks', MARNE);
    const point = regionFacts(MARNE)!.point;
    const posted = await post(t, seat, point);

    await expect(
      t.mutation(api.movements.foundOutpostHere, {
        regionId: null,
        ...seat,
        point: asPoint(point),
        specialization: 'relay',
        troopIds: [posted],
      }),
    ).rejects.toThrow('FRIENDLY_TARGET');
  });

  /** The address survives the departure — it is what the column comes back to — so a column
   *  already walking would otherwise plant a point it left hours ago. */
  it('refuses a column that has left the point it still hangs from', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const point = regionFacts(PRAHOVA)!.point;
    const posted = await post(t, seat, point);

    await attacking(t, {
      ...seat,
      origin: { kind: 'point', point: asPoint(point) },
      troopIds: [posted],
      target: { kind: 'region', regionId: RUHR },
    });

    await expect(
      t.mutation(api.movements.foundOutpostHere, {
        regionId: null,
        ...seat,
        point: asPoint(point),
        specialization: 'relay',
        troopIds: [posted],
      }),
    ).rejects.toThrow('TROOP_NOT_AT_ORIGIN');
  });

  it('refuses a column standing somewhere else, and one with nothing in it', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const point = regionFacts(PRAHOVA)!.point;
    const posted = await post(t, seat, point);

    await expect(
      t.mutation(api.movements.foundOutpostHere, {
        regionId: null,
        ...seat,
        point: asPoint(regionFacts(RUHR)!.point),
        specialization: 'relay',
        troopIds: [posted],
      }),
    ).rejects.toThrow('TROOP_NOT_AT_ORIGIN');

    await expect(
      t.mutation(api.movements.foundOutpostHere, {
        regionId: null,
        ...seat,
        point: asPoint(point),
        specialization: 'relay',
        troopIds: [],
      }),
    ).rejects.toThrow('EMPTY_MOVEMENT');
  });
});

/**
 * **Fonder ouvre un chantier, pas un point** (révision du 15/09 de l'ADR 0020 §10). Le prix et
 * la durée remplacent l'entretien comme frein d'expansion, et ce qu'ils achètent est une fenêtre
 * où le camp est posé et visible (ADR 0024 §1) pendant que le point n'existe pas encore : un
 * voisin peut réagir. Sans elle, la fondation était le seul geste du jeu sans contre-coup.
 */
describe('founding opens a construction site, and it has to be held', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  const asPoint = (point: LonLat) => ({ lon: point[0], lat: point[1] });
  const MINUTES = buildMinutes('outpost', 1);
  const COST = buildCost('outpost', 1);

  const found = (t: ReturnType<typeof boot>, seat: Seat, point: LonLat, troopIds: Array<string>) =>
    t.mutation(api.movements.foundOutpostHere, {
      regionId: null,
      ...seat,
      point: asPoint(point),
      specialization: 'relay',
      troopIds: troopIds as Array<Id<'troops'>>,
    });

  const stockOf = async (t: ReturnType<typeof boot>, seat: Seat, key: 'steel' | 'coal') =>
    (await t.query(api.view.playerView, seat)).me.resources[key].stock;

  const noticesOfSeat = async (t: ReturnType<typeof boot>, seat: Seat) => {
    const playerId = await playerOf(t, seat);
    return t.run(async (ctx) =>
      ctx.db
        .query('notices')
        .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
        .collect(),
    );
  };

  const drain = async (t: ReturnType<typeof boot>, seat: Seat) => {
    const playerId = await playerOf(t, seat);
    await t.run(async (ctx) => {
      for (const row of await ctx.db
        .query('resources')
        .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
        .collect()) {
        await ctx.db.patch(row._id, { stock: 0, updatedAt: Date.now() });
      }
    });
  };

  /** **Rien de grisé, et rien d'inséré** : la rose lit la même facture que `debit`. */
  it('refuses the order when the bill cannot be paid, and plants nothing', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const point = regionFacts(PRAHOVA)!.point;
    const posted = await post(t, seat, point);
    await drain(t, seat);

    await expect(found(t, seat, point, [posted])).rejects.toThrow('INSUFFICIENT_RESOURCE');
    expect(await outpostsOf(t, seat)).toHaveLength(0);
  });

  /**
   * **Le débit est exact, et le point ne fait rien.** Il ne tient aucune région, ne colore rien,
   * ne relève rien, n'ouvre aucun emplacement et ne relaie pas : c'est toute la fenêtre.
   */
  it('debits the bill and leaves a site that holds, colours and reaches nothing', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    await fundFoundation(t, seat);
    const point = regionFacts(PRAHOVA)!.point;
    const before = { steel: await stockOf(t, seat, 'steel'), coal: await stockOf(t, seat, 'coal') };

    await found(t, seat, point, [await post(t, seat, point)]);

    expect(await stockOf(t, seat, 'steel')).toBeCloseTo(before.steel - (COST.steel ?? 0), 5);
    expect(await stockOf(t, seat, 'coal')).toBeCloseTo(before.coal - (COST.coal ?? 0), 5);

    const [outpost] = await outpostsOf(t, seat);
    expect(outpost!.standsAt).toBe(MIDDAY.getTime() + MINUTES * 60_000);
    const view = await t.query(api.view.playerView, seat);
    expect(view.me.outposts[0]!.standsAt).toBe(outpost!.standsAt);

    /** Aucune couleur : le sol autour reste à personne — seul le sol national est tenu. */
    const coloured = (await t.query(api.control.held, seat)).flatMap((holder) =>
      holder.regions.map((region) => region.id),
    );
    expect(coloured).not.toContain(PRAHOVA);
    /** Aucun relevé : le chantier ne tient pas ce sol, donc il ne le voit pas. */
    const playerId = await playerOf(t, seat);
    expect(
      await t.run(async (ctx) =>
        ctx.db
          .query('regionSightings')
          .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
          .collect(),
      ),
    ).toHaveLength(0);
    /** Et aucun emplacement : sa propre région lui est refusée. */
    await expect(
      t.mutation(api.constructions.start, {
        ...seat,
        building: 'oilWell',
        regionId: PRAHOVA,
        point: pointIn(PRAHOVA),
      }),
    ).rejects.toThrow('OUT_OF_OUTPOST_REACH');
  });

  /** **Le QG accélère la fondation comme toute élévation** (ADR 0031) : la date écrite et la durée
   *  que la vue annonce sont celles de `foundationMinutes`. */
  it('dates the foundation at the headquarters level, and the view says the same length', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    await fundFoundation(t, seat);
    const playerId = await playerOf(t, seat);
    await t.run(async (ctx) => {
      const hq = (
        await ctx.db
          .query('buildings')
          .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
          .collect()
      ).find((building) => building.key === 'hq')!;
      await ctx.db.patch(hq._id, { level: 3 });
    });
    const point = regionFacts(PRAHOVA)!.point;

    await found(t, seat, point, [await post(t, seat, point)]);

    const [outpost] = await outpostsOf(t, seat);
    expect(foundationMinutes(3)).toBeLessThan(MINUTES);
    expect(outpost!.standsAt).toBe(MIDDAY.getTime() + foundationMinutes(3) * 60_000);
    expect((await t.query(api.view.playerView, seat)).outpostFoundation.minutes).toBe(
      foundationMinutes(3),
    );
  });

  /** **À `standsAt`, le point est un point** : il tient, il colore, il relève, il porte. */
  it('stands at its hour, and the ground takes its colour then', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    await fundFoundation(t, seat);
    const point = regionFacts(PRAHOVA)!.point;
    await found(t, seat, point, [await post(t, seat, point)]);

    vi.advanceTimersByTime(MINUTES * 60_000);
    await t.finishInProgressScheduledFunctions();

    const [outpost] = await outpostsOf(t, seat);
    expect(outpost!.standsAt).toBeUndefined();
    expect((await t.query(api.view.playerView, seat)).me.outposts[0]!.standsAt).toBeNull();

    const held = await t.query(api.control.held, seat);
    expect(held.flatMap((holder) => holder.regions.map((region) => region.id))).toContain(PRAHOVA);
    const started = await t.mutation(api.constructions.start, {
      ...seat,
      building: 'oilWell',
      regionId: PRAHOVA,
      point: pointIn(PRAHOVA),
    });
    expect(started.finishesAt).toBeGreaterThan(Date.now());
  });

  /** **Le lever est idempotent** : un second passage ne redépose rien et ne re-règle rien. */
  it('stands once, whatever wakes it twice', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    await fundFoundation(t, seat);
    const point = regionFacts(PRAHOVA)!.point;
    await found(t, seat, point, [await post(t, seat, point)]);
    const [outpost] = await outpostsOf(t, seat);

    vi.advanceTimersByTime(MINUTES * 60_000);
    await t.finishInProgressScheduledFunctions();
    await t.mutation(internal.outposts.standOutpost, { outpostId: outpost!._id });

    const stood = (await noticesOfSeat(t, seat)).filter((one) => one.kind === 'outpostStands');
    expect(stood).toHaveLength(1);
  });

  /**
   * **Le chantier meurt avec sa garnison, et rien n'est remboursé.** Une partie de la pile qui
   * reste le garde vivant : c'est une présence qu'on exige, pas un effectif.
   */
  it('dies when the whole garrison marches away, and lives on half of it', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    await fundFoundation(t, seat);
    const point = regionFacts(PRAHOVA)!.point;
    const first = await post(t, seat, point);
    const second = await post(t, seat, point);
    await found(t, seat, point, [first, second]);
    const [outpost] = await outpostsOf(t, seat);
    const paid = await stockOf(t, seat, 'steel');

    /** Une moitié part : le chantier tient. */
    await attacking(t, {
      ...seat,
      origin: { kind: 'outpost', outpostId: outpost!._id },
      troopIds: [first],
      target: { kind: 'region', regionId: RUHR },
    });
    expect(await outpostsOf(t, seat)).toHaveLength(1);

    /** La seconde part : il n'y a plus rien pour le tenir. */
    await attacking(t, {
      ...seat,
      origin: { kind: 'outpost', outpostId: outpost!._id },
      troopIds: [second],
      target: { kind: 'region', regionId: RUHR },
    });
    expect(await outpostsOf(t, seat)).toHaveLength(0);
    expect(await stockOf(t, seat, 'steel')).toBeCloseTo(paid, 5);
    expect((await noticesOfSeat(t, seat)).some((one) => one.kind === 'foundationLost')).toBe(true);
  });

  /**
   * **Et la passe le tue aussi.** On attaque un chantier comme n'importe quelle force posée —
   * pas d'immunité, rien à désactiver : il n'y a pas encore de point. La garnison tombe, la
   * promesse tombe avec elle.
   */
  it('dies when the pass destroys the garrison holding it', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    await fundFoundation(t, guest);
    const point = regionFacts(PRAHOVA)!.point;
    const holding = await post(t, guest, point);
    await found(t, guest, point, [holding]);
    /** Une garnison à bout : ce qui est sous test est la disparition du chantier, pas le barème
     *  de la passe (`src/domain/combat.ts` le tient déjà). */
    await t.run(async (ctx) => ctx.db.patch(holding, { currentStrength: 1 }));

    /** Le voisin part d'à côté : la fenêtre du chantier dure `buildMinutes('outpost', 1)`, et
     *  c'est elle qui est sous test — une colonne venue de France arriverait après le lever. */
    const nearby = eastOf(point, 60);
    const attacker = await post(t, seat, nearby);
    const sent = await attacking(t, {
      ...seat,
      origin: { kind: 'point', point: asPoint(nearby) },
      troopIds: [attacker],
      target: { kind: 'point', point: asPoint(point) },
    });
    expect(sent.minutes).toBeLessThan(MINUTES);
    /** On n'avance que jusqu'à l'arrivée : le lever est plus loin, et c'est tout le sujet. */
    vi.advanceTimersByTime(sent.minutes * 60_000);
    await t.finishInProgressScheduledFunctions();

    expect(await outpostsOf(t, guest)).toHaveLength(0);
    expect((await noticesOfSeat(t, guest)).some((one) => one.kind === 'foundationLost')).toBe(true);
  });

  /** **Un point d'avant le champ est debout** : le repli est `foundedAt`, toujours passé. Il
   *  porte donc son rayon sans qu'aucun lever ait eu lieu. */
  it('reads a point planted before the field as standing', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    await plant(t, seat, regionFacts(PRAHOVA)!.point, 'ROU', PRAHOVA);

    expect((await t.query(api.view.playerView, seat)).me.outposts[0]!.standsAt).toBeNull();
    const started = await t.mutation(api.constructions.start, {
      ...seat,
      building: 'oilWell',
      regionId: PRAHOVA,
      point: pointIn(PRAHOVA),
    });
    expect(started.finishesAt).toBeGreaterThan(Date.now());
  });
});

/**
 * Design sheet 07: the window forbids **arrivals** at a player who is resting. A column
 * reaching neutral ground wakes nobody and never waits.
 */
describe('the rest window holds an arrival at the border', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('waits for the window of the player whose home it reaches', async () => {
    // Marne to Pskov is some eight and a half hours on foot: leaving at 16h30 UTC lands in the
    // guest's night.
    vi.setSystemTime(new Date(Date.UTC(2026, 7, 17, 16, 30, 0)));
    const t = boot();
    const { seat } = await launchedSeason(t);
    const barracks = await raise(t, seat, 'barracks', MARNE);
    const troop = await form(t, seat, 'infantry', barracks);

    const sent = await attacking(t, {
      ...seat,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [troop],
      target: { kind: 'region', regionId: PSKOV },
    });

    vi.advanceTimersByTime(sent.minutes * 60_000);
    await t.finishInProgressScheduledFunctions();

    const [held] = await movementsOf(t, seat);
    expect(held).toBeDefined();
    expect(held!.type).toBe('attack');
    // The guest sleeps from 21h00 UTC: the column stands at the border until the window closes.
    const exit = new Date(held!.arrivesAt);
    expect(exit.getUTCHours() * 60 + exit.getUTCMinutes()).toBe(
      (DEFAULT_REST_START_MINUTES + REST_WINDOW_MINUTES) % 1440,
    );

    // Once it closes, the arrival resolves: empty ground, so the column simply walks back.
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await movementsOf(t, seat)).toHaveLength(0);
    expect((await t.run(async (ctx) => ctx.db.get(troop)))!.stationedAt).toBe(barracks);
  });

  /** La vue relisait `arrivesAt` repoussé comme une date de marche : le pion repartait à 5 % du
   *  trajet avec sept heures devant lui. `heldAt` est ce qui distingue les deux lectures. */
  it('serves the hold as taken rather than recomputing it from the pushed arrival', async () => {
    vi.setSystemTime(new Date(Date.UTC(2026, 7, 17, 16, 30, 0)));
    const t = boot();
    const { seat } = await launchedSeason(t);
    const barracks = await raise(t, seat, 'barracks', MARNE);
    const troop = await form(t, seat, 'infantry', barracks);

    const sent = await attacking(t, {
      ...seat,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [troop],
      target: { kind: 'region', regionId: PSKOV },
    });
    vi.advanceTimersByTime(sent.minutes * 60_000);
    await t.finishInProgressScheduledFunctions();

    const [held] = await movementsOf(t, seat);
    expect(held!.heldAt).toBe(Date.now());
    const [arc] = (await t.query(api.view.playerView, seat)).movements!;
    expect(arc!.heldAt).toBe(held!.heldAt);
    expect(arc!.holdUntil).toBe(held!.arrivesAt);

    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await movementsOf(t, seat)).toHaveLength(0);
  });

  it('lets a column reach neutral ground while its neighbour sleeps', async () => {
    vi.setSystemTime(new Date(Date.UTC(2026, 7, 17, 23, 0, 0)));
    const t = boot();
    const { seat } = await launchedSeason(t);
    const barracks = await raise(t, seat, 'barracks', MARNE);
    const troop = await form(t, seat, 'infantry', barracks);

    const sent = await attacking(t, {
      ...seat,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [troop],
      target: { kind: 'region', regionId: PRAHOVA },
    });
    vi.advanceTimersByTime(sent.minutes * 60_000);
    await t.finishInProgressScheduledFunctions();

    /** Nothing waited: the arrival resolved on the hour it was dated, and the column is already
     *  walking back rather than standing at a border. */
    const [back] = await movementsOf(t, seat);
    expect(back?.type).toBe('return');
    /** Le plein de Bakou se recompte depuis l'arrivée du retour, pas depuis l'ancien arrêt. */
    const walking = await t.run((ctx) => ctx.db.get(troop));
    expect(walking?.fuelAt).toBe(back!.arrivesAt);
  });
});

describe('an outpost opens a radius to build in', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  /** Founded on the spot by the column standing there — the walk is another test's subject. */
  /** **Fondé puis levé** : le chantier n'ouvre aucun rayon, et ce qu'on mesure ici est le
   *  rayon. On paie, on ordonne, on attend l'heure du lever (révision du 15/09). */
  async function withOutpostAtPrahova(t: ReturnType<typeof boot>) {
    const { seat } = await launchedSeason(t);
    await fundFoundation(t, seat);
    const point = regionFacts(PRAHOVA)!.point;
    await t.mutation(api.movements.foundOutpostHere, {
      regionId: null,
      ...seat,
      point: { lon: point[0], lat: point[1] },
      specialization: 'relay',
      troopIds: [await post(t, seat, point)],
    });
    vi.advanceTimersByTime(buildMinutes('outpost', 1) * 60_000);
    await t.finishInProgressScheduledFunctions();
    return seat;
  }

  /**
   * **Le rayon se mesure du point de l'avant-poste au point visé** (ADR 0029) — jamais au pôle
   * d'une région : un lieu à deux pas du mât se bâtit, quelle que soit la taille de l'Alberta.
   */
  it('accepts a point within the reach, however far the point of its region is', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    await plant(t, seat, FORT_MCMURRAY, 'CAN', ALBERTA);

    const started = await t.mutation(api.constructions.start, {
      ...seat,
      building: 'warehouse',
      regionId: ALBERTA,
      point: { lon: FORT_MCMURRAY[0], lat: FORT_MCMURRAY[1] - 0.5 },
    });
    expect(started.finishesAt).toBeGreaterThan(Date.now());
  });

  /** Ce que le disque ne couvre pas reste dehors, même dans la région où le mât se tient. */
  it('refuses a point past the reach, in its own region as in the next', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    await plant(t, seat, FORT_MCMURRAY, 'CAN', ALBERTA);

    await expect(
      t.mutation(api.constructions.start, {
        ...seat,
        building: 'warehouse',
        regionId: ALBERTA,
        point: pointIn(ALBERTA),
      }),
    ).rejects.toThrow('OUT_OF_OUTPOST_REACH');
    await expect(
      t.mutation(api.constructions.start, {
        ...seat,
        building: 'warehouse',
        regionId: BRITISH_COLUMBIA,
        point: pointIn(BRITISH_COLUMBIA),
      }),
    ).rejects.toThrow('OUT_OF_OUTPOST_REACH');
  });

  /** **Un avant-poste n'est pas un bâtiment** : l'espacement ne le compte pas, et le sol à son
   *  pied reste constructible — c'est tout l'intérêt de l'y planter. */
  it('lets a building stand at the foot of its mast', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    await plant(t, seat, FORT_MCMURRAY, 'CAN', ALBERTA);

    const started = await t.mutation(api.constructions.start, {
      ...seat,
      building: 'warehouse',
      regionId: ALBERTA,
      point: { lon: FORT_MCMURRAY[0] + 0.02, lat: FORT_MCMURRAY[1] },
    });
    expect(started.finishesAt).toBeGreaterThan(Date.now());
  });

  /** The whole point of the loop: the well the nation has no ground for at home. */
  it('accepts a foreign region within the reach', async () => {
    const t = boot();
    const seat = await withOutpostAtPrahova(t);
    const started = await t.mutation(api.constructions.start, {
      ...seat,
      building: 'oilWell',
      regionId: PRAHOVA,
      point: pointIn(PRAHOVA),
    });
    expect(started.finishesAt).toBeGreaterThan(Date.now());
  });

  /** Le refus ne chiffre plus une distance (révision du 17/09) : ce qui décide est *le cercle
   *  touche-t-il cette région*, et une distance au pôle annoncerait des centaines de kilomètres
   *  d'une frontière toute proche. Il nomme le rayon qu'il faudrait amener. */
  it('refuses one outside it, and names the widest reach he has', async () => {
    const t = boot();
    const seat = await withOutpostAtPrahova(t);
    /** La clé avant la portée, comme `placementRefusal` sous le fantôme : un aérodrome verrouillé
     *  hors de portée se dit verrouillé aux deux bouts. */
    await expect(
      t.mutation(api.constructions.start, {
        ...seat,
        building: 'airfield',
        regionId: RUHR,
        point: pointIn(RUHR),
      }),
    ).rejects.toThrow('RESEARCH_REQUIRED');
    const refused: Record<string, unknown> = await t
      .mutation(api.constructions.start, {
        ...seat,
        building: 'barracks',
        regionId: RUHR,
        point: pointIn(RUHR),
      })
      .then(() => ({}))
      .catch((error: { data: Record<string, unknown> }) => error.data);

    expect(refused).toMatchObject({
      code: 'OUT_OF_OUTPOST_REACH',
      reachKm: REACH_KM,
      hasOutposts: true,
    });
    expect(refused.nearestKm).toBeUndefined();
  });

  /**
   * **The two rules stack, they do not stand in for one another.** The reach says *where* a
   * building may go up, the research card says *whether the player has opened it* — so a region
   * an outpost has opened still refuses an airfield until the aviation card comes to its end.
   */
  it('stacks the research card on top of the reach', async () => {
    const t = boot();
    const seat = await withOutpostAtPrahova(t);

    await expect(
      t.mutation(api.constructions.start, {
        ...seat,
        building: 'airfield',
        regionId: PRAHOVA,
        point: pointIn(PRAHOVA),
      }),
    ).rejects.toThrow('RESEARCH_REQUIRED');

    await t.run(async (ctx) => {
      await ctx.db.patch((await seatIn(ctx, seat))._id, { researched: ['aviation'] });
    });

    // The reach keeps its own say: an opened card is not a passport.
    await expect(
      t.mutation(api.constructions.start, {
        ...seat,
        building: 'airfield',
        regionId: RUHR,
        point: pointIn(RUHR),
      }),
    ).rejects.toThrow('OUT_OF_OUTPOST_REACH');

    const started = await t.mutation(api.constructions.start, {
      ...seat,
      building: 'airfield',
      regionId: PRAHOVA,
      point: pointIn(PRAHOVA),
    });
    expect(started.finishesAt).toBeGreaterThan(Date.now());
  });

  it('keeps home free of any reach', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const started = await t.mutation(api.constructions.start, {
      ...seat,
      building: 'barracks',
      regionId: MARNE,
      point: pointIn(MARNE),
    });
    expect(started.finishesAt).toBeGreaterThan(Date.now());
  });
});

/**
 * The pass itself is proved in `src/domain/combat.test.ts`, against the numbers of the
 * chiffrage. What is under test here is everything around it: who is found standing where, what
 * the board looks like afterwards, and the account that is left behind.
 */
describe('an attack marches at somebody', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('finds nobody, files nothing, and walks the column home', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const barracks = await raise(t, seat, 'barracks', MARNE);
    const troop = await form(t, seat, 'infantry', barracks);

    await attacking(t, {
      ...seat,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [troop],
      target: { kind: 'region', regionId: PRAHOVA },
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(await engagementsIn(t)).toHaveLength(0);
    expect(await movementsOf(t, seat)).toHaveLength(0);
    // Home again, in the barracks it left: the walk cost time and nothing else.
    const back = await t.run(async (ctx) => ctx.db.get(troop));
    expect(back!.stationedAt).toBe(barracks);
  });

  it('engages the troops standing in the region and files the account', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const barracks = await raise(t, seat, 'barracks', MARNE);
    const troop = await form(t, seat, 'infantry', barracks);
    const theirs = await raise(t, guest, 'barracks', PRAHOVA);
    const defender = await form(t, guest, 'infantry', theirs);

    await attacking(t, {
      ...seat,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [troop],
      target: { kind: 'region', regionId: PRAHOVA },
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    // Fifty soldiers against fifty in his barracks: the garrison takes .7 of my strike — 18 —
    // and its 32 left riposte for 16.
    const [account] = await engagementsIn(t);
    expect(account).toBeDefined();
    expect(account!.cause).toBe('arrival');
    expect(await strikesIn(t, account!._id)).toHaveLength(2);
    expect((await t.run(async (ctx) => ctx.db.get(defender)))!.currentStrength).toBe(32);
    expect((await t.run(async (ctx) => ctx.db.get(troop)))!.currentStrength).toBe(34);

    // And both sides read it, each from its own side of the field.
    const mine = await t.query(api.view.playerView, seat);
    expect(mine.reports[0]!.side).toBe('attacker');
    expect(mine.reports[0]!.mine.lost).toBe(16);
    expect(mine.reports[0]!.theirs.lost).toBe(18);
    const theirsView = await t.query(api.view.playerView, guest);
    expect(theirsView.reports[0]!.side).toBe('defender');
    expect(theirsView.reports[0]!.mine.lost).toBe(18);
  });

  it('refuses to march on one of my own regions', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const barracks = await raise(t, seat, 'barracks', MARNE);
    const troop = await form(t, seat, 'infantry', barracks);

    await expect(
      attacking(t, {
        ...seat,
        origin: { kind: 'building', buildingId: barracks },
        troopIds: [troop],
        target: { kind: 'region', regionId: MARNE },
      }),
    ).rejects.toThrow('FRIENDLY_TARGET');
  });
});

/**
 * **The only bill there is** (question 18, settled 25/08). The recruitment stopped debiting
 * ammunition and the pass took it over, so this is where the resource has to be seen leaving
 * the national stock — and where a nation that let it run out has to be seen paying for it.
 */
/** ADR 0028 §3 : le plein se paie au départ, et une route plus longue que lui est refusée. */
describe('the fuel a route takes', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  async function setStock(t: ReturnType<typeof boot>, seat: Seat, key: string, stock: number) {
    const playerId = await playerOf(t, seat);
    await t.run(async (ctx) => {
      const row = (
        await ctx.db
          .query('resources')
          .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
          .collect()
      ).find((one) => one.key === key)!;
      await ctx.db.patch(row._id, { stock, updatedAt: Date.now() });
    });
  }

  const marchTo = (
    t: ReturnType<typeof boot>,
    seat: Seat,
    barracks: Id<'buildings'>,
    troop: Id<'troops'>,
    point: { lon: number; lat: number },
  ) =>
    t.mutation(api.movements.marchTo, {
      ...seat,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [troop],
      point,
    });
  /** Près de Ploiești : plus de deux mille kilomètres de route depuis la Marne. */
  const PLOIESTI = { lon: 26.0, lat: 44.95 };
  /** Berlin : moins de quatre crans de route. */
  const BERLIN = { lon: 13.4, lat: 52.5 };

  it('refuses a tank a road longer than its three steps, and says how many it needs', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const barracks = await raise(t, seat, 'barracks', MARNE);
    const tank = await form(t, seat, 'armor', barracks);

    await expect(marchTo(t, seat, barracks, tank, PLOIESTI)).rejects.toThrow('NOT_ENOUGH_FUEL');
  });

  it('bills a tank whose transport left without it, whatever its stale seat says', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const barracks = await raise(t, seat, 'barracks', MARNE);
    const tank = await form(t, seat, 'armor', barracks);
    const gone = await form(t, seat, 'cargo', null);
    await t.run(async (ctx) => ctx.db.patch(tank, { carriedBy: gone }));

    await marchTo(t, seat, barracks, tank, { lon: 4.35, lat: 50.85 });

    expect((await t.run(async (ctx) => ctx.db.get(tank)))!.fuel).toBeLessThan(3);
  });

  it('fills an empty truck at home before it leaves, and takes the road off its fuel', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    await setStock(t, seat, 'oil', 100);
    const barracks = await raise(t, seat, 'barracks', MARNE);
    const truck = await form(t, seat, 'landTransport', barracks);
    await t.run(async (ctx) => ctx.db.patch(truck, { fuel: 0 }));

    const { movementId } = await marchTo(t, seat, barracks, truck, BERLIN);

    const steps = await t.run(async (ctx) =>
      Math.ceil(((await ctx.db.get(movementId))!.distanceUnits * 111) / 500),
    );
    expect(steps).toBeLessThanOrEqual(4);
    expect((await t.run(async (ctx) => ctx.db.get(truck)))!.fuel).toBe(4 - steps);
    expect((await t.query(api.view.playerView, seat)).me.resources.oil.stock).toBe(60);
  });
});

describe('the rounds a troop carries into the pass', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  async function fight(t: ReturnType<typeof boot>, seat: Seat, guest: Seat) {
    const barracks = await raise(t, seat, 'barracks', MARNE);
    const troop = await form(t, seat, 'infantry', barracks);
    const theirs = await raise(t, guest, 'barracks', PRAHOVA);
    const defender = await form(t, guest, 'infantry', theirs);
    await attacking(t, {
      ...seat,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [troop],
      target: { kind: 'region', regionId: PRAHOVA },
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    return { troop, defender };
  }

  /** ADR 0028 §3 : chacune tire sur ses crans, et l'ancre les reprend sur le plateau personnel. */
  it('spends a step of each troop that fires, and refills it at the anchor only', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    await setAmmunition(t, seat, 500);
    await setAmmunition(t, guest, 500);

    const { troop, defender } = await fight(t, seat, guest);

    // Home again, the attacker took its spent step back off the board: ten ammunition. The
    // defender stands in Romania, nobody's soil — it lives on what it carries.
    expect((await t.run(async (ctx) => ctx.db.get(troop)))!.rounds).toBe(3);
    expect(await ammunitionOf(t, seat)).toBe(490);
    expect((await t.run(async (ctx) => ctx.db.get(defender)))!.rounds).toBe(2);
    expect(await ammunitionOf(t, guest)).toBe(500);
  });

  it('has a troop out of rounds take the strike without a riposte, and tells its owner', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    await setAmmunition(t, guest, 500);
    const barracks = await raise(t, seat, 'barracks', MARNE);
    const troop = await form(t, seat, 'infantry', barracks);
    const theirs = await raise(t, guest, 'barracks', PRAHOVA);
    const defender = await form(t, guest, 'infantry', theirs);
    await t.run(async (ctx) => ctx.db.patch(defender, { rounds: 0 }));

    await attacking(t, {
      ...seat,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [troop],
      target: { kind: 'region', regionId: PRAHOVA },
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect((await t.run(async (ctx) => ctx.db.get(troop)))!.currentStrength).toBe(50);
    const [engagement] = await engagementsIn(t);
    expect(engagement!.troops.find((row) => row.side === 'defender')!.dry).toBe(true);
    const dry = await t.run(async (ctx) =>
      ctx.db
        .query('notices')
        .filter((q) => q.eq(q.field('kind'), 'firedDry'))
        .collect(),
    );
    expect(dry).toMatchObject([{ playerId: await playerOf(t, guest), troops: 1 }]);
    // The attacker reads it in its account: one of theirs did not answer.
    const report = (await t.query(api.view.playerView, seat)).reports[0]!;
    expect(report.theirs.dry).toBe(1);
  });

  it('refuses the attack of a column out of rounds that its anchor cannot rearm', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    await setAmmunition(t, seat, 0);
    const barracks = await raise(t, seat, 'barracks', MARNE);
    const troop = await form(t, seat, 'infantry', barracks);
    await t.run(async (ctx) => ctx.db.patch(troop, { rounds: 0 }));

    await expect(
      attacking(t, {
        ...seat,
        origin: { kind: 'building', buildingId: barracks },
        troopIds: [troop],
        target: { kind: 'region', regionId: PRAHOVA },
      }),
    ).rejects.toThrow('NO_ROUNDS');
  });

  it('bills nothing to a garrison the strike wiped out, and never tells it it ran dry', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    await setAmmunition(t, guest, 0);
    const barracks = await raise(t, seat, 'barracks', MARNE);
    const troop = await form(t, seat, 'infantry', barracks);
    const theirs = await raise(t, guest, 'barracks', PRAHOVA);
    const defender = await form(t, guest, 'infantry', theirs);
    await t.run(async (ctx) => ctx.db.patch(defender, { currentStrength: 15 }));

    await attacking(t, {
      ...seat,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [troop],
      target: { kind: 'region', regionId: PRAHOVA },
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(await t.run(async (ctx) => ctx.db.get(defender))).toBeNull();
    const dry = await t.run(async (ctx) =>
      ctx.db
        .query('notices')
        .filter((q) => q.eq(q.field('kind'), 'firedDry'))
        .collect(),
    );
    expect(dry).toHaveLength(0);
  });

  it('takes no ammunition for a march that meets nobody', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    await setAmmunition(t, seat, 500);
    const barracks = await raise(t, seat, 'barracks', MARNE);
    const troop = await form(t, seat, 'infantry', barracks);

    await attacking(t, {
      ...seat,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [troop],
      target: { kind: 'region', regionId: PRAHOVA },
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(await engagementsIn(t)).toHaveLength(0);
    expect(await ammunitionOf(t, seat)).toBe(500);
  });
});

/**
 * The fan and the mutation read **one** rule (`src/domain/movement-orders.ts`): what the compass
 * rose does not offer is exactly what the server turns down. These are the server's half of that
 * promise — the fan's half is `src/domain/compass-rose.test.ts`.
 */
describe('what the server refuses is what the fan never offers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('refuses a march on ground of mine', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const barracks = await raise(t, seat, 'barracks', MARNE);
    const troop = await form(t, seat, 'infantry', barracks);

    await expect(
      attacking(t, {
        ...seat,
        origin: { kind: 'building', buildingId: barracks },
        troopIds: [troop],
        target: { kind: 'region', regionId: MARNE },
      }),
    ).rejects.toThrow('FRIENDLY_TARGET');
  });

  it('refuses a column with nothing in it', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const barracks = await raise(t, seat, 'barracks', MARNE);

    await expect(
      attacking(t, {
        ...seat,
        origin: { kind: 'building', buildingId: barracks },
        troopIds: [],
        target: { kind: 'region', regionId: PRAHOVA },
      }),
    ).rejects.toThrow('EMPTY_MOVEMENT');
  });
});

/** The aiming card shows what the march will cost **before** the slot is spent — same grid,
 *  same pace, same rest window as the mutation that follows it. */
describe('the preview says what the march will be', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('answers the real route and the same duration the march takes', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const barracks = await raise(t, seat, 'barracks', MARNE);
    const troop = await form(t, seat, 'infantry', barracks);
    await surveyRegion(t, seat, PRAHOVA);

    const preview = await t.query(api.movements.preview, {
      ...seat,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [troop],
      target: { kind: 'region', regionId: PRAHOVA },
      type: 'attack',
    });
    expect(preview).not.toBeNull();
    expect(preview!.route.points.length).toBeGreaterThan(1);
    expect(preview!.destinationName).toBe(regionFacts(PRAHOVA)!.name);
    expect(preview!.holdUntil).toBeNull();

    const sent = await attacking(t, {
      ...seat,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [troop],
      target: { kind: 'region', regionId: PRAHOVA },
    });
    expect(sent.minutes).toBeCloseTo(preview!.minutes, 6);
  });

  it('names the hour the column would be let in when the arrival bites a rest window', async () => {
    // Leaving at 16h30 UTC, the eight-hour march lands in the guest's night — the same clock
    // the border test leans on.
    vi.setSystemTime(new Date(Date.UTC(2026, 7, 17, 16, 30, 0)));
    const t = boot();
    const { seat } = await launchedSeason(t);
    const barracks = await raise(t, seat, 'barracks', MARNE);
    const troop = await form(t, seat, 'infantry', barracks);
    await surveyRegion(t, seat, PSKOV);

    const preview = await t.query(api.movements.preview, {
      ...seat,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [troop],
      target: { kind: 'region', regionId: PSKOV },
      type: 'attack',
    });
    expect(preview!.holdUntil).not.toBeNull();
    expect(preview!.holdUntil!).toBeGreaterThan(preview!.arrivesAt);
  });
});

/**
 * **The pace is one reading of one pile, and three surfaces answer with it.** The fan, the
 * preview and the mutation all go through `landCostOf` — a second table of what rolls is how a
 * card would promise a duration the march does not take, which is exactly the display lie the
 * previous three prompts were spent on.
 */
describe('a column whose infantry rides goes faster', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  const origin = (barracks: Id<'buildings'>) =>
    ({ kind: 'building', buildingId: barracks }) as const;
  const target = { kind: 'region', regionId: RUHR } as const;

  /** A query, so it spends no slot: two piles can be priced in one season, which is what the
   *  comparison needs — only one movement flies at a time (ADR 0006). */
  const priced = async (
    t: ReturnType<typeof boot>,
    seat: Seat,
    barracks: Id<'buildings'>,
    troopIds: ReadonlyArray<Id<'troops'>>,
  ) => {
    await surveyRegion(t, seat, RUHR);
    const answer = await t.query(api.movements.preview, {
      ...seat,
      origin: origin(barracks),
      troopIds: [...troopIds],
      target,
      type: 'attack',
    });
    return answer!;
  };

  it('takes 1,15/1,6 of the walk on the very same road', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const barracks = await raise(t, seat, 'barracks', MARNE);
    const walkers = [await form(t, seat, 'infantry', barracks)];
    const riders = [
      await form(t, seat, 'infantry', barracks),
      await form(t, seat, 'infantry', barracks),
      await form(t, seat, 'landTransport', barracks),
    ];

    const from = regionFacts(MARNE)!.point;
    const to = regionFacts(RUHR)!.point;
    const onFoot = routeBetween(from, to, 'land', COST_BY_MEDIUM.land)!;
    const rolling = routeBetween(from, to, 'land', COST_BY_MEDIUM.landMotorized)!;
    // The same road, priced twice: scaling every land edge by the same factor cannot move the
    // shortest path. The polyline itself is compared by its length rather than vertex by
    // vertex — equal-cost cells are tie-broken in whatever order the heap emptied.
    expect(rolling.distanceUnits).toBeCloseTo(onFoot.distanceUnits, 9);
    expect(rolling.costUnits).toBeCloseTo(
      (onFoot.costUnits * COST_BY_MEDIUM.landMotorized) / COST_BY_MEDIUM.land,
      6,
    );

    const walked = await priced(t, seat, barracks, walkers);
    const rode = await priced(t, seat, barracks, riders);
    expect(walked.route.landCost).toBe(COST_BY_MEDIUM.land);
    expect(rode.route.landCost).toBe(COST_BY_MEDIUM.landMotorized);
    expect(rode.route.costUnits).toBeCloseTo(
      (walked.route.costUnits * COST_BY_MEDIUM.landMotorized) / COST_BY_MEDIUM.land,
      6,
    );
    expect(rode.minutes).toBeLessThan(walked.minutes);
  });

  it('walks again on one infantry too many', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const barracks = await raise(t, seat, 'barracks', MARNE);
    const crowded = await priced(t, seat, barracks, [
      await form(t, seat, 'infantry', barracks),
      await form(t, seat, 'infantry', barracks),
      await form(t, seat, 'infantry', barracks),
      await form(t, seat, 'landTransport', barracks),
    ]);
    const alone = await priced(t, seat, barracks, [await form(t, seat, 'infantry', barracks)]);
    expect(crowded.route.landCost).toBe(COST_BY_MEDIUM.land);
    expect(crowded.minutes).toBe(alone.minutes);
  });

  it('says the same duration in the fan, the preview and the march it sends', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const barracks = await raise(t, seat, 'barracks', MARNE);
    const roles: ReadonlyArray<UnitRole> = ['infantry', 'infantry', 'landTransport'];
    const column: Array<Id<'troops'>> = [];
    for (const role of roles) column.push(await form(t, seat, role, barracks));

    // The fan reads the same composition through the same module: legal here means the
    // mutation takes it, and the duration below is the one the card was showing.
    expect(
      legalMovementTypes(
        { kind: 'region', regionId: RUHR, country: 'Germany', lon: 7.5, lat: 51.5, surveyed: true },
        {
          roles,
          myRegionIds: new Set(),
          myOutpostIds: new Set(),
          departureBuildings: new Set<BuildingKey>(['barracks']),
          afloat: false,
          coastal: false,
        },
      ),
    ).toContain('attack');

    const preview = await priced(t, seat, barracks, column);
    const sent = await attacking(t, {
      ...seat,
      origin: origin(barracks),
      troopIds: column,
      target,
    });
    expect(sent.minutes).toBeCloseTo(preview.minutes, 6);
    expect(landCostOf(roles)).toBe(preview.route.landCost);
  });
});

describe('a raid deactivates an outpost, it never takes it', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  const prahovaPoint = () => regionFacts(PRAHOVA)!.point;

  it('clears the garrison and puts the point out of service', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const barracks = await raise(t, seat, 'barracks', MARNE);
    const first = await form(t, seat, 'infantry', barracks);
    const second = await form(t, seat, 'infantry', barracks);
    /** La seconde compagnie part entamée : à pleine force les deux frappes effacent exactement
     *  les cinquante hommes de la garnison, et c'est la déroute qu'on lit ici. */
    await t.run(async (ctx) => ctx.db.patch(second, { currentStrength: 30 }));
    const outpostId = await plant(t, guest, prahovaPoint(), 'ROU');
    const held = await garrison(t, guest, outpostId);
    /** La garnison encaisse ×0,7 (C1) : entière, elle tiendrait — à trente, la frappe la casse. */
    await t.run(async (ctx) => ctx.db.patch(held, { currentStrength: 30 }));

    await t.mutation(api.movements.raid, {
      ...seat,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [first, second],
      outpostId,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const [account] = await engagementsIn(t);
    const outpost = await t.run(async (ctx) => ctx.db.get(outpostId));
    expect(outpost).not.toBeNull();
    // Never taken: the point is still his, it is only out of service.
    expect(outpost!.playerId).toBe(await playerOf(t, guest));
    expect(outpost!.disabledUntil).toBe(account!.at + OUTPOST_DISABLED_HOURS * 3_600_000);
    expect(outpost!.immuneUntil).toBeGreaterThan(outpost!.disabledUntil!);

    // Behind its walls the garrison takes .7 of each blow — 18, then 11 — where the open ground
    // would have taken 25 and 5; one man is left, and he ripostes for one.
    const strikes = await strikesIn(t, account!._id);
    expect(strikes.map((one) => [one.phase, one.losses])).toEqual([
      ['strike', 18],
      ['strike', 11],
      ['riposte', 1],
    ]);

    // The garrison broke contact rather than dying, and it is still standing on its point.
    const broken = await t.run(async (ctx) => ctx.db.get(held));
    expect(broken!.currentStrength).toBeGreaterThan(0);
    expect(broken!.stationedAt).toBe(outpostId);

    // Its owner reads the point as out of service, counting down like every other due time.
    // L'horloge est ramenée juste après la passe : la fin de la désactivation est désormais un
    // rendez-vous planifié (ADR 0020 §6, `production.restoreAfterDisabling`), et le drainage des
    // travaux ci-dessus a donc porté le temps au-delà de la fenêtre. C'est le décompte pendant
    // la fenêtre qu'on lit ici.
    vi.setSystemTime(account!.at + 60_000);
    const owner = await t.query(api.view.playerView, guest);
    const left = owner.me.outposts[0]!.disabledMinutesLeft!;
    expect(left).toBeGreaterThan(0);
    expect(left).toBeLessThanOrEqual(OUTPOST_DISABLED_HOURS * 60);
  });

  /** Décision de Pierre du 14/10 (C4) : un point en chantier ou désactivé n'a pas de murs. */
  it.each([
    ['under construction', { standsAt: MIDDAY.getTime() + 30 * 86_400_000 }],
    ['out of service', { disabledUntil: MIDDAY.getTime() + 30 * 86_400_000 }],
  ] as const)('gives a garrison no walls on a point %s', async (_, state) => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const barracks = await raise(t, seat, 'barracks', MARNE);
    const first = await form(t, seat, 'infantry', barracks);
    const second = await form(t, seat, 'infantry', barracks);
    await t.run(async (ctx) => ctx.db.patch(second, { currentStrength: 30 }));
    const outpostId = await plant(t, guest, prahovaPoint(), 'ROU');
    await garrison(t, guest, outpostId);
    await t.run(async (ctx) => ctx.db.patch(outpostId, state));

    await attacking(t, {
      ...seat,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [first, second],
      target: { kind: 'outpost', outpostId },
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    // Bare, it takes the blows whole — 25 and 15, where walls would let through 18 and 11 — and
    // its ten left riposte for five.
    const [account] = await engagementsIn(t);
    const strikes = await strikesIn(t, account!._id);
    expect(strikes.map((one) => [one.phase, one.losses])).toEqual([
      ['strike', 25],
      ['strike', 15],
      ['riposte', 5],
    ]);
  });

  it('walks up to an ungarrisoned point and puts it out without a battle', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const barracks = await raise(t, seat, 'barracks', MARNE);
    const troop = await form(t, seat, 'infantry', barracks);
    const outpostId = await plant(t, guest, prahovaPoint(), 'ROU');

    await t.mutation(api.movements.raid, {
      ...seat,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [troop],
      outpostId,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(await engagementsIn(t)).toHaveLength(0);
    const outpost = await t.run(async (ctx) => ctx.db.get(outpostId));
    expect(outpost!.disabledUntil).not.toBeNull();
  });

  it('refuses a raid on one of mine', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const barracks = await raise(t, seat, 'barracks', MARNE);
    const troop = await form(t, seat, 'infantry', barracks);
    const outpostId = await plant(t, seat, prahovaPoint(), 'ROU');

    await expect(
      t.mutation(api.movements.raid, {
        ...seat,
        origin: { kind: 'building', buildingId: barracks },
        troopIds: [troop],
        outpostId,
      }),
    ).rejects.toThrow('FRIENDLY_TARGET');
  });
});

/**
 * The non-regression suite of ADR 0019: where a column stands stopped deciding what it may ask
 * for. A garrison on an outpost is a column like any other — it attacks, it raids, it founds.
 */
describe('a garrison marches out of its outpost', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('attacks a foreign region straight from the point it holds', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    await raise(t, seat, 'barracks', MARNE);
    const outpostId = await plant(t, seat, regionFacts(PRAHOVA)!.point, 'ROU');
    const held = await garrison(t, seat, outpostId);

    const sent = await attacking(t, {
      ...seat,
      origin: { kind: 'outpost', outpostId },
      troopIds: [held],
      target: { kind: 'region', regionId: RUHR },
    });
    expect(sent.minutes).toBeGreaterThan(0);
    expect((await t.query(api.view.playerView, seat)).me.slots.used).toBe(1);
  });

  it("refuses a troop that is not this outpost's own garrison", async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const barracks = await raise(t, seat, 'barracks', MARNE);
    const stray = await form(t, seat, 'infantry', barracks);
    const outpostId = await plant(t, seat, regionFacts(PRAHOVA)!.point, 'ROU');

    await expect(
      attacking(t, {
        ...seat,
        origin: { kind: 'outpost', outpostId },
        troopIds: [stray],
        target: { kind: 'region', regionId: RUHR },
      }),
    ).rejects.toThrow('TROOP_NOT_AT_ORIGIN');
  });
});

/**
 * The second half of ADR 0019 §1: a destination is the place the player designated, never the
 * centre of the region that happens to contain it.
 */
describe('a march aimed at a point', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  /** Deliberately off the Prahova centroid: the whole test is that the gap survives the trip. */
  const AIMED: LonLat = [25.2, 44.6];

  it('walks to that point and to no centroid', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const barracks = await raise(t, seat, 'barracks', MARNE);
    const troop = await form(t, seat, 'infantry', barracks);

    await attacking(t, {
      ...seat,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [troop],
      target: { kind: 'point', point: { lon: AIMED[0], lat: AIMED[1] } },
    });

    const [movement] = await t.run(async (ctx) => ctx.db.query('movements').collect());
    expect(movement!.to).toEqual({ lon: AIMED[0], lat: AIMED[1] });
    expect(distanceKm(pointOf(movement!.to), regionFacts(PRAHOVA)!.point)).toBeGreaterThan(50);
    /**
     * The host is read off the geometry, never sent by the client. Romania is nobody's home
     * country, and it is still Romania: the empty string is the open sea's answer alone
     * (`hostAtPoint`), because the rules keyed on a host cannot be written on a string that
     * makes Arabia and Bolivia the same place.
     */
    expect(movement!.hostCountry).toBe('ROU');
  });

  /**
   * **Un point nu se nomme par la région sous lui** : le serveur rendait le code du pays, et le
   * bord de l'écran imprimait « ROU ». La vue et l'aperçu disent la même chose.
   */
  it('names a march to bare ground after the region under it, never by the country code', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const barracks = await raise(t, seat, 'barracks', MARNE);
    const troop = await form(t, seat, 'infantry', barracks);
    const order = {
      ...seat,
      origin: { kind: 'building' as const, buildingId: barracks },
      troopIds: [troop],
      target: { kind: 'point' as const, point: { lon: AIMED[0], lat: AIMED[1] } },
    };
    const region = regionFacts(regionAtRoutePoint(AIMED)!)!;
    expect(region.country).toBe('ROU');

    const preview = await t.query(api.movements.preview, { ...order, type: 'march' });
    await attacking(t, order);
    const [movement] = (await t.query(api.view.playerView, seat)).movements;

    expect(movement!.destinationName).toBe(region.name);
    expect(preview!.destinationName).toBe(region.name);
  });

  it('answers the same route in the preview as the march will take', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const barracks = await raise(t, seat, 'barracks', MARNE);
    const troop = await form(t, seat, 'infantry', barracks);

    const seen = await t.query(api.movements.preview, {
      ...seat,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [troop],
      target: { kind: 'point', point: { lon: AIMED[0], lat: AIMED[1] } },
      type: 'march',
    });
    expect(seen).not.toBeNull();
    const last = seen!.route.points[seen!.route.points.length - 1]!;
    expect(distanceKm(pointOf(last), AIMED)).toBeLessThan(60);
  });

  /** Empty ground is still empty: nothing stands within reach, so there is nothing to fight. */
  it('finds nobody there and comes home rather than fighting', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const barracks = await raise(t, seat, 'barracks', MARNE);
    const troop = await form(t, seat, 'infantry', barracks);

    await attacking(t, {
      ...seat,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [troop],
      target: { kind: 'point', point: { lon: AIMED[0], lat: AIMED[1] } },
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(await t.run(async (ctx) => (await ctx.db.query('engagements').collect()).length)).toBe(
      0,
    );
    expect(await t.run(async (ctx) => (await ctx.db.get(troop))!.stationedAt)).toBe(barracks);
  });
});

/**
 * **What a point answers when something stands on it.** The arrival stopped needing a region to
 * find defenders: it reads what holds ground within `ARRIVAL_RADIUS_KM` of where it stopped,
 * which is the same distance reading the interception has always used (ADR 0018 §3).
 */
describe('an arrival on a point finds who stands there', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  /** Deliberately far from the Prahova centroid: the defenders are found by where they stand,
   *  never by the region the point happens to fall in. */
  const AIMED: LonLat = [25.2, 44.6];

  it('engages the column posted there, centroid or no centroid', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const barracks = await raise(t, seat, 'barracks', MARNE);
    const first = await form(t, seat, 'infantry', barracks);
    const second = await form(t, seat, 'infantry', barracks);
    /** Entamée : à pleine force les deux compagnies effacent la colonne, et il n'y a plus
     *  d'effectif à relire. */
    await t.run(async (ctx) => ctx.db.patch(second, { currentStrength: 30 }));
    const posted = await post(t, guest, eastOf(AIMED, 10));
    expect(distanceKm(AIMED, regionFacts(PRAHOVA)!.point)).toBeGreaterThan(50);

    await attacking(t, {
      ...seat,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [first, second],
      target: { kind: 'point', point: { lon: AIMED[0], lat: AIMED[1] } },
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const [account] = await engagementsIn(t);
    expect(account).toBeDefined();
    expect(account!.defenderId).toBe(await playerOf(t, guest));
    expect((await t.run(async (ctx) => ctx.db.get(posted)))!.currentStrength).toBeLessThan(
      nominalStrength('infantry', 1),
    );
  });

  /**
   * A garrison answers for the ground around its point too, and the account names the outpost.
   *
   * It stands there **before** the departure, which is the point of the test: an outpost at the
   * end of the road sits well inside the two hundred kilometres of the interception net, so it
   * used to fight the same order twice — once on approach, once on arrival. The test used to
   * dodge that by planting the point after the column left. One engagement is one pass
   * (ADR 0014), and this is where the arrival answers for what stands at the destination.
   */
  it('brings the garrison of a point standing within reach, and once', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const barracks = await raise(t, seat, 'barracks', MARNE);
    const troop = await form(t, seat, 'infantry', barracks);
    const outpostId = await plant(t, guest, eastOf(AIMED, 10), 'ROU');
    await garrison(t, guest, outpostId);

    await attacking(t, {
      ...seat,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [troop],
      target: { kind: 'point', point: { lon: AIMED[0], lat: AIMED[1] } },
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const accounts = await engagementsIn(t);
    expect(accounts).toHaveLength(1);
    expect(accounts[0]!.outpostId).toBe(outpostId);
    expect(accounts[0]!.cause).toBe('arrival');
    /** An attack is not a raid: the point is not put out of service by one (ADR 0004). */
    expect((await t.run(async (ctx) => ctx.db.get(outpostId)))!.disabledUntil).toBeNull();
  });

  it('finds nobody when the same column stands beyond the radius', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const barracks = await raise(t, seat, 'barracks', MARNE);
    const troop = await form(t, seat, 'infantry', barracks);
    await post(t, guest, eastOf(AIMED, ARRIVAL_RADIUS_KM + 15));

    await attacking(t, {
      ...seat,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [troop],
      target: { kind: 'point', point: { lon: AIMED[0], lat: AIMED[1] } },
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(await engagementsIn(t)).toHaveLength(0);
  });

  /** A posted column is an address like any other: it is ordered out of where it stands, and
   *  what it stands on carries no gate — it walks (ADR 0019 §1 and §2). */
  it('marches out of the point it stands on', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const point = regionFacts(PRAHOVA)!.point;
    const posted = await post(t, seat, point);

    const sent = await attacking(t, {
      ...seat,
      origin: { kind: 'point', point: { lon: point[0], lat: point[1] } },
      troopIds: [posted],
      target: { kind: 'region', regionId: RUHR },
    });
    expect(sent.minutes).toBeGreaterThan(0);

    /** Sans caserne, l'origine se nomme par le point quitté — et non par le pays d'arrivée. */
    const [movement] = (await t.query(api.view.playerView, seat)).movements;
    expect(movement!.originName).toBe(regionFacts(PRAHOVA)!.name);
    expect(movement!.originCountry).toBe('ROU');
  });

  it('refuses a column ordered out of a point it does not stand on', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const point = regionFacts(PRAHOVA)!.point;
    const posted = await post(t, seat, point);

    await expect(
      attacking(t, {
        ...seat,
        origin: { kind: 'point', point: { lon: point[0] + 1, lat: point[1] } },
        troopIds: [posted],
        target: { kind: 'region', regionId: RUHR },
      }),
    ).rejects.toThrow('TROOP_NOT_AT_ORIGIN');
  });

  /** A posted column observes from its role's range, but only defends the point where it stands. */
  it('walks past a camp on its road without opening a pass', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const barracks = await raise(t, seat, 'barracks', MARNE);
    const troop = await form(t, seat, 'infantry', barracks);
    const road = routeBetween(regionFacts(MARNE)!.point, regionFacts(PRAHOVA)!.point, 'land')!;
    await post(t, guest, road.points[Math.floor(road.points.length / 2)]!);

    await attacking(t, {
      ...seat,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [troop],
      target: { kind: 'region', regionId: PRAHOVA },
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(await engagementsIn(t)).toHaveLength(0);
    expect((await t.run(async (ctx) => ctx.db.get(troop)))!.stationedAt).toBe(barracks);
  });

  /** A detector added after departure is reassessed, but being detected still starts no pass. */
  it('walks past a camp pitched after it left', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const barracks = await raise(t, seat, 'barracks', MARNE);
    const troop = await form(t, seat, 'infantry', barracks);
    const road = routeBetween(regionFacts(MARNE)!.point, regionFacts(PRAHOVA)!.point, 'land')!;

    await attacking(t, {
      ...seat,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [troop],
      target: { kind: 'region', regionId: PRAHOVA },
    });
    await post(t, guest, road.points[Math.floor(road.points.length / 2)]!);
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(await engagementsIn(t)).toHaveLength(0);
  });

  /** The inventory reads a posted column like any other: on a card of its own, at the place it
   *  was left in, and counted against the ceiling. */
  it('is served in the inventory with the country it stands in', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    await post(t, seat, regionFacts(RIYADH)!.point);

    const view = await t.query(api.view.playerView, seat);
    expect(view.me.troops).toHaveLength(1);
    expect(view.me.troops[0]!.stationedAt).toMatchObject({ kind: 'point', country: 'SAU' });
    expect(view.me.armyPresent).toEqual({ infantry: 1 });
  });
});

/**
 * **La marche** (ADR 0019 §7): the plainest order there is, and the one the game had no word
 * for. It goes to a point and the column stays — every other order comes back. Its cost, its
 * irreversibility and its domain doors are those of any other movement; what it does not have
 * is a refusal for allegiance, and what it does have is an address at the end.
 */
describe('a march goes to a point and the column stays there', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  /** Far from the Prahova centroid on purpose: what a march finds is read off distances, never
   *  off the region the coordinate happens to fall in. */
  const AIMED: LonLat = [25.2, 44.6];
  const asPoint = (point: LonLat) => ({ lon: point[0], lat: point[1] });

  it('stands the column on empty ground — no return, no engagement', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const barracks = await raise(t, seat, 'barracks', MARNE);
    const troop = await form(t, seat, 'infantry', barracks);

    await t.mutation(api.movements.marchTo, {
      ...seat,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [troop],
      point: asPoint(AIMED),
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect((await t.run(async (ctx) => ctx.db.get(troop)))!.stationedAt).toEqual(asPoint(AIMED));
    expect(await movementsOf(t, seat)).toHaveLength(0);
    expect(await engagementsIn(t)).toHaveLength(0);
  });

  it('refuses a point the map does not carry', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const barracks = await raise(t, seat, 'barracks', MARNE);
    const troop = await form(t, seat, 'infantry', barracks);

    for (const point of [
      { lon: 361.99, lat: 44.6 },
      { lon: 25.2, lat: 91 },
      { lon: Number.NaN, lat: 44.6 },
      { lon: 25.2, lat: Number.POSITIVE_INFINITY },
    ]) {
      await expect(
        t.mutation(api.movements.marchTo, {
          ...seat,
          origin: { kind: 'building', buildingId: barracks },
          troopIds: [troop],
          point,
        }),
      ).rejects.toThrow('POINT_OFF_MAP');
    }
    expect(await movementsOf(t, seat)).toHaveLength(0);
  });

  /**
   * **Rien ne se bat sans ordre** (ADR 0024 §3, révision de l'ADR 0019 §3). L'embuscade
   * automatique a disparu : une marche s'arrête à dix kilomètres d'un camp adverse et il ne se
   * passe rien. Ce que les deux gagnent à la place est une information — chacun relève l'autre
   * (§1), et c'est sur elle que l'attaque se décide.
   */
  it('stops beside the camp it walks into, and the two only see each other', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const barracks = await raise(t, seat, 'barracks', MARNE);
    const troop = await form(t, seat, 'infantry', barracks);
    const camped = await post(t, guest, eastOf(AIMED, 10));

    await t.mutation(api.movements.marchTo, {
      ...seat,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [troop],
      point: asPoint(AIMED),
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(await engagementsIn(t)).toHaveLength(0);
    expect((await t.run(async (ctx) => ctx.db.get(troop)))!.stationedAt).toEqual(asPoint(AIMED));
    expect((await t.run(async (ctx) => ctx.db.get(camped)))!.stationedAt).toEqual(
      asPoint(eastOf(AIMED, 10)),
    );
    /** Deux camps, et chacun relève l'autre : c'est ce qui rend le §3 jouable. */
    expect((await t.query(api.view.playerView, seat)).camps).toHaveLength(1);
    expect((await t.query(api.view.playerView, guest)).camps).toHaveLength(1);
  });

  it('finds nobody a step beyond the radius, and simply stands there', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const barracks = await raise(t, seat, 'barracks', MARNE);
    const troop = await form(t, seat, 'infantry', barracks);
    await post(t, guest, eastOf(AIMED, ARRIVAL_RADIUS_KM + 15));

    await t.mutation(api.movements.marchTo, {
      ...seat,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [troop],
      point: asPoint(AIMED),
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(await engagementsIn(t)).toHaveLength(0);
    expect((await t.run(async (ctx) => ctx.db.get(troop)))!.stationedAt).toEqual(asPoint(AIMED));
  });

  /**
   * **Chez lui, dans le rayon de son avant-poste, et rien ne se passe** (ADR 0024 §3). La
   * garnison qui attendait au bout de la route ouvrait une passe que personne n'avait voulue ;
   * elle se contente désormais de voir passer, et c'est à son maître d'ordonner l'assaut.
   */
  it('stands inside the reach of a garrisoned outpost without opening a pass', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const barracks = await raise(t, seat, 'barracks', MARNE);
    const troop = await form(t, seat, 'infantry', barracks);
    const outpostId = await plant(t, guest, eastOf(AIMED, 20), 'ROU');
    await garrison(t, guest, outpostId);

    await t.mutation(api.movements.marchTo, {
      ...seat,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [troop],
      point: asPoint(AIMED),
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(await engagementsIn(t)).toHaveLength(0);
    expect((await t.run(async (ctx) => ctx.db.get(troop)))!.stationedAt).toEqual(asPoint(AIMED));
  });

  /** A precise posted address remains passive while a movement crosses its detection range. */
  it('keeps a camp passive at its exact stored point', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const barracks = await raise(t, seat, 'barracks', MARNE);
    const troop = await form(t, seat, 'infantry', barracks);
    const road = routeBetween(regionFacts(MARNE)!.point, AIMED, 'land')!;
    const middle = road.points[Math.floor(road.points.length / 2)]!;
    const camped = await post(t, guest, [middle[0] + Math.PI / 1000, middle[1] - Math.E / 1000]);

    await t.mutation(api.movements.marchTo, {
      ...seat,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [troop],
      point: asPoint(AIMED),
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(await engagementsIn(t)).toHaveLength(0);
    expect((await t.run(async (ctx) => ctx.db.get(camped)))!.stationedAt).toEqual({
      lon: middle[0] + Math.PI / 1000,
      lat: middle[1] - Math.E / 1000,
    });
  });

  /**
   * **L'assaut sur un camp relevé** (ADR 0024 §4) : c'est désormais le seul chemin vers cette
   * passe-là. L'attaquant frappe d'abord, le camp visé riposte avec ce qui lui reste sans que
   * personne l'ordonne — et, posé en terrain libre, il encaisse tout.
   */
  it('opens the pass on a surveyed camp: the strike, then the riposte', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const barracks = await raise(t, seat, 'barracks', MARNE);
    const first = await form(t, seat, 'infantry', barracks);
    const second = await form(t, seat, 'infantry', barracks);
    /** Entamée : à pleine force les deux compagnies effacent le camp, et il n'y a plus
     *  d'effectif à relire. */
    await t.run(async (ctx) => ctx.db.patch(second, { currentStrength: 30 }));
    const camped = await post(t, guest, eastOf(AIMED, 10));
    await post(t, guest, eastOf(AIMED, 10));
    const campId = await surveyCamp(t, seat, asPoint(eastOf(AIMED, 10)));

    const sent = await attacking(t, {
      ...seat,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [first, second],
      target: { kind: 'camp', campId },
    });
    vi.advanceTimersByTime(sent.minutes * 60_000);
    await t.finishInProgressScheduledFunctions();

    const [account] = await engagementsIn(t);
    expect(account).toBeDefined();
    expect(account!.attackerId).toBe(await playerOf(t, seat));
    expect(account!.defenderId).toBe(await playerOf(t, guest));
    expect(account!.cause).toBe('arrival');
    /** Le camp rend les coups sans que personne l'ordonne (ADR 0024 §3), mais après la frappe. */
    const strikes = await strikesIn(t, account!._id);
    expect(strikes.map((strike) => [strike.bySide, strike.phase])).toEqual([
      ['attacker', 'strike'],
      ['attacker', 'strike'],
      ['defender', 'riposte'],
      ['defender', 'riposte'],
    ]);
    /** 25 + 15 sur la première compagnie du camp, qui riposte de ses 10 hommes restants (5) ;
     *  la seconde, intacte, de ses 50 (25) — trente en tout, sans bonus en terrain libre. */
    expect((await t.run(async (ctx) => ctx.db.get(first)))!.currentStrength).toBe(20);
    expect((await t.run(async (ctx) => ctx.db.get(camped)))!.currentStrength).toBeLessThan(
      nominalStrength('infantry', 1),
    );
  });

  /** **On n'attaque pas du vide** (ADR 0024 §4) : sur un sol où le joueur n'a rien relevé, le
   *  serveur refuse du mot que la rose aurait dit avant le clic (ADR 0015). */
  it('refuses an assault on ground the player has surveyed nothing on', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const barracks = await raise(t, seat, 'barracks', MARNE);
    const troop = await form(t, seat, 'infantry', barracks);

    await expect(
      t.mutation(api.movements.attack, {
        ...seat,
        origin: { kind: 'building', buildingId: barracks },
        troopIds: [troop],
        target: { kind: 'point', point: asPoint(AIMED) },
      }),
    ).rejects.toThrow('NOTHING_TO_ATTACK');
    expect(await movementsOf(t, seat)).toHaveLength(0);
  });

  /**
   * **L'allonge de l'ordre, et le trou du 13/09 fermé** (ADR 0024 §4). Une région ciblée
   * engageait la garnison de ses mâts mais pas la pile campée à vingt kilomètres du point
   * d'arrivée : une seule lecture répond désormais pour les deux.
   */
  it('engages the camp standing within the arrival radius of a region aimed at', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const barracks = await raise(t, seat, 'barracks', MARNE);
    const troop = await form(t, seat, 'infantry', barracks);
    const centroid = regionFacts(PRAHOVA)!.point;
    await post(t, guest, eastOf(centroid, 20));

    await attacking(t, {
      ...seat,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [troop],
      target: { kind: 'region', regionId: PRAHOVA },
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const [account] = await engagementsIn(t);
    expect(account).toBeDefined();
    expect(account!.attackerId).toBe(await playerOf(t, seat));
    expect(account!.defenderId).toBe(await playerOf(t, guest));
  });

  /** **Le camp est parti avant l'arrivée** : l'attaque vise une position, pas une unité, et il
   *  n'y a pas de poursuite. Elle est bredouille, comme sur une région vide. */
  it('comes back empty-handed when the camp has struck its tents', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const barracks = await raise(t, seat, 'barracks', MARNE);
    const troop = await form(t, seat, 'infantry', barracks);
    const camped = await post(t, guest, eastOf(AIMED, 10));
    const campId = await surveyCamp(t, seat, asPoint(eastOf(AIMED, 10)));

    await attacking(t, {
      ...seat,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [troop],
      target: { kind: 'camp', campId },
    });
    /** Levé le camp, bien avant que la colonne arrive. */
    await t.run(async (ctx) => ctx.db.patch(camped, { stationedAt: asPoint(eastOf(AIMED, 900)) }));
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(await engagementsIn(t)).toHaveLength(0);
    const playerId = await playerOf(t, seat);
    const notices = await t.run(async (ctx) =>
      ctx.db
        .query('notices')
        .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
        .collect(),
    );
    expect(notices.some((notice) => notice.kind === 'columnFoundNothing')).toBe(true);
    expect((await t.run(async (ctx) => ctx.db.get(troop)))!.stationedAt).toBe(barracks);
  });

  /** A march stays observational even when its road crosses a posted detector. */
  it('crosses a camp standing on its road without opening a pass', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const barracks = await raise(t, seat, 'barracks', MARNE);
    const troop = await form(t, seat, 'infantry', barracks);
    const road = routeBetween(regionFacts(MARNE)!.point, AIMED, 'land')!;
    await post(t, guest, road.points[Math.floor(road.points.length / 2)]!);

    await t.mutation(api.movements.marchTo, {
      ...seat,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [troop],
      point: asPoint(AIMED),
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(await engagementsIn(t)).toHaveLength(0);
    expect((await t.run(async (ctx) => ctx.db.get(troop)))!.stationedAt).toEqual(asPoint(AIMED));
  });

  /**
   * **A slot like any other** (ADR 0006): the march is an order, and orders are what the
   * regulator counts. Nothing about "going nowhere in particular" exempts it.
   *
   * **And the ceiling is the research's**: two at the start, one per Transmissions card — the
   * very number the banner reads.
   */
  it('spends a slot, and is refused once the research has no more to give', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const barracks = await raise(t, seat, 'barracks', MARNE);

    const send = async (km: number) =>
      t.mutation(api.movements.marchTo, {
        ...seat,
        origin: { kind: 'building', buildingId: barracks },
        troopIds: [await form(t, seat, 'infantry', barracks)],
        point: asPoint(eastOf(AIMED, km)),
      });

    await send(0);
    await send(200);
    const held = await t.query(api.view.playerView, seat);
    expect(held.me.slots).toEqual({ used: 2, total: 2 });

    const refused: Record<string, unknown> = await send(400)
      .then(() => ({}))
      .catch((error: { data: Record<string, unknown> }) => error.data);
    expect(refused).toMatchObject({ code: 'MOVEMENT_IN_FLIGHT', maximum: 2 });

    // The same order goes through the moment a Transmissions card is acquired.
    const playerId = await playerOf(t, seat);
    await t.run((ctx) => ctx.db.patch(playerId, { researched: ['transmissions1'] }));
    expect((await t.query(api.view.playerView, seat)).me.slots.total).toBe(3);
    await send(100);
  });

  /**
   * **A camp does not show** (ADR 0019 §6): no detection at a distance, not by a territory's
   * radius nor by another camp's. What is seen from afar is what *moves* — and a posted troop
   * is the first mobile thing the fog has ever had to hide.
   */
  it('shows an opponent nothing of a column posted next door', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const camped = await post(t, guest, eastOf(regionFacts(MARNE)!.point, 30));
    await raise(t, seat, 'barracks', MARNE);
    await form(t, seat, 'infantry', null);

    const view = await t.query(api.view.playerView, seat);
    expect(view.me.troops).toHaveLength(1);
    expect(JSON.stringify(view)).not.toContain(camped);
    expect(JSON.stringify(view)).not.toContain(await playerOf(t, guest));
  });

  /**
   * **The aim says what the player does not know, and promises nothing else.** Ground outside
   * his country and outside the reach of his outposts is unrecognised — which says nothing
   * about what stands there, and nothing about recognised ground being safe.
   */
  it('answers the aim with whether the player watches that ground', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const barracks = await raise(t, seat, 'barracks', MARNE);
    const troop = await form(t, seat, 'infantry', barracks);
    const order = {
      ...seat,
      origin: { kind: 'building', buildingId: barracks } as const,
      troopIds: [troop],
      type: 'march' as const,
    };

    const abroad = await t.query(api.movements.preview, {
      ...order,
      target: { kind: 'point', point: asPoint(AIMED) },
    });
    expect(abroad!.recognised).toBe(false);

    const home = await t.query(api.movements.preview, {
      ...order,
      target: { kind: 'point', point: asPoint(regionFacts(MARNE)!.point) },
    });
    expect(home!.recognised).toBe(true);

    /** The second source, and the one the reach was written for: an outpost watches around it. */
    await plant(t, seat, eastOf(AIMED, 20), 'ROU');
    const watched = await t.query(api.movements.preview, {
      ...order,
      target: { kind: 'point', point: asPoint(AIMED) },
    });
    expect(watched!.recognised).toBe(true);
  });
});

/**
 * ADR 0013 makes the distant action expensive, never impossible (ADR 0019 §2), and design sheet
 * 09 says how: **a land troop crosses aboard a transport, or it does not cross**. The door is
 * back on the pile — which is what lets the fan be exact — and the crossing is now a fleet one
 * builds, protects and can lose rather than a supplement on a trip.
 */
describe('the door of the sea, read on the pile', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  const NORD = 'FRA-5330'; // coastal, facing the Channel
  /** Dunkerque: the region's own point lies inland since the atlas (ADR 0034) drew its 87-point
   *  outline, and a quay has to stand on the shore. */
  const NORD_QUAY = { lon: 2.37, lat: 51.05 };
  const KENT: LonLat = [0.73, 51.21]; // across the water, and only across it
  const DOGGER: LonLat = [2.5, 54.5]; // open sea, hosted by nobody
  const HELIGOLAND: LonLat = [6.5, 54.6]; // another patch of the same water
  const MIDLANDS: LonLat = [-1.5, 52.4]; // English, and no water within a grid cell of it

  /** Le débarquement de référence : un fantassin et sa coque, partis du quai du Nord, posés
   *  ensemble sur la plage du Kent. Ce que chacun demande ensuite est l'objet des cas d'après. */
  const landAtKent = async (t: ReturnType<typeof boot>, seat: Seat) => {
    await raise(t, seat, 'barracks', NORD);
    const quay = await raise(t, seat, 'port', NORD, NORD_QUAY);
    const infantry = await form(t, seat, 'infantry', quay);
    const cargo = await form(t, seat, 'cargo', quay);
    const beach = { lon: KENT[0], lat: KENT[1] };
    await t.mutation(api.movements.marchTo, {
      ...seat,
      origin: { kind: 'building', buildingId: quay },
      troopIds: [infantry, cargo],
      point: beach,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    await t.mutation(api.movements.disembark, { ...seat, troopIds: [infantry] });
    return { infantry, cargo, beach };
  };

  /**
   * The whole column leaves from the quay: the transport is moored there and its passengers
   * board it there. `stationedAt` is one address per movement — the day a column may be composed
   * from several is `adresse-sur-la-carte.md`, not this prompt.
   */
  const embark = async (
    t: ReturnType<typeof boot>,
    seat: Seat,
    roles: ReadonlyArray<UnitRole>,
    { port = true }: { port?: boolean } = {},
  ) => {
    await raise(t, seat, 'barracks', NORD);
    const quay = port
      ? await raise(t, seat, 'port', NORD, NORD_QUAY)
      : await raise(t, seat, 'depot', NORD);
    const troopIds: Array<Id<'troops'>> = [];
    for (const role of roles) troopIds.push(await form(t, seat, role, quay));
    return attacking(t, {
      ...seat,
      origin: { kind: 'building', buildingId: quay },
      troopIds,
      target: { kind: 'point', point: { lon: KENT[0], lat: KENT[1] } },
    });
  };

  /**
   * **The stranding this closes.** A fleet that reached the open sea had its address written on
   * water, and the quay was then read on ground it would never stand on again: the hulls were
   * posted there for the rest of the season with no order able to leave. `afloat` is read off
   * the departure point — `hostAtPoint` answers the empty string out there and nowhere else —
   * and it is computed at every order, never written down beside `stationedAt`.
   */
  it('lets a fleet posted on the open sea sail again with no quay under it', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const quay = await raise(t, seat, 'port', NORD);
    const troopIds = [await form(t, seat, 'escort', quay), await form(t, seat, 'cargo', quay)];

    await t.mutation(api.movements.marchTo, {
      ...seat,
      origin: { kind: 'building', buildingId: quay },
      troopIds,
      point: { lon: DOGGER[0], lat: DOGGER[1] },
    });
    /** Read before the arrival clears the row: nobody hosts that water, which is the whole of
     *  what `afloat` will find at the second departure. */
    const [sailing] = await t.run(async (ctx) => ctx.db.query('movements').collect());
    expect(sailing!.hostCountry).toBe('');
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const posted = await t.run(async (ctx) => ctx.db.get(troopIds[0]!));
    expect(posted!.stationedAt).toEqual({ lon: DOGGER[0], lat: DOGGER[1] });

    await expect(
      t.mutation(api.movements.marchTo, {
        ...seat,
        origin: { kind: 'point', point: { lon: DOGGER[0], lat: DOGGER[1] } },
        troopIds,
        point: { lon: HELIGOLAND[0], lat: HELIGOLAND[1] },
      }),
    ).resolves.toBeDefined();
  });

  /**
   * **Le quai part de l'eau, la plage la reçoit** (décisions 71a puis 72a). Depuis que le port
   * se pose sur une cellule de côte, la colonne embarque au premier pas ; depuis que le
   * débarquement est une opération, elle ne remet pas les bottes à terre avant sa cible. Entre
   * les deux il n'y a que de la mer — c'est un débarquement, et non plus une marche qui mouille.
   */
  it('carries infantry across the Channel aboard a cargo and lands them on the shore', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    await embark(t, seat, ['infantry', 'infantry', 'cargo']);

    const [movement] = await t.run(async (ctx) => ctx.db.query('movements').collect());
    expect(movement!.legs.every((leg) => leg.medium === 'sea')).toBe(true);
    /** The transfers are billed: a crossing costs more than its distance weighted by medium. */
    expect(movement!.costUnits).toBeGreaterThan(movement!.distanceUnits);
    /** The United Kingdom is a playable nation, so the ground has a host to owe a window to. */
    expect(movement!.hostCountry).toBe('GBR');
  });

  /**
   * The same two, with nothing to ride: they route on the land alone, and the land stops at the
   * shore. `NO_LAND_ROUTE` at last says exactly what happened — no renaming needed.
   */
  it('leaves the same two on the shore when no ship carries them', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    await expect(embark(t, seat, ['infantry', 'infantry'])).rejects.toThrow('NO_LAND_ROUTE');
  });

  it('refuses a thirteenth passenger for twelve places, and says how many of each', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const thirteen: ReadonlyArray<UnitRole> = Array<UnitRole>(13).fill('infantry');

    const refused = await embark(t, seat, [...thirteen, 'cargo']).catch(
      (problem: unknown) => problem,
    );
    expect(refused).toBeInstanceOf(ConvexError);
    expect(
      (refused as ConvexError<{ code: string; needed: number; offered: number }>).data,
    ).toMatchObject({
      code: 'NOT_ENOUGH_LIFT',
      needed: 13,
      offered: 12,
    });
  });

  /** **On embarque dans un transport, et on y reste** (révision de l'ADR 0025, 15/10) : au point
   *  du transport, sur-le-champ, sans slot ni mouvement. */
  it('boards two armour standing at the quay onto the cargo, at once', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const quay = await raise(t, seat, 'port', NORD);
    const armour = [await form(t, seat, 'armor', quay), await form(t, seat, 'armor', quay)];
    const cargo = await form(t, seat, 'cargo', quay);

    await t.mutation(api.movements.board, { ...seat, troopIds: armour, carrierId: cargo });

    const aboard = await t.run(async (ctx) => Promise.all(armour.map((id) => ctx.db.get(id))));
    expect(aboard.map((troop) => troop!.carriedBy)).toEqual([cargo, cargo]);
    expect(await t.run(async (ctx) => ctx.db.query('movements').collect())).toEqual([]);
  });

  it('refuses a gun or a truck aboard an air transport, at an airfield, and keeps the infantry', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const field = await raise(t, seat, 'airfield', NORD);
    const wing = await form(t, seat, 'airTransport', field);
    for (const role of ['artillery', 'landTransport'] as const) {
      const heavy = await form(t, seat, role, field);
      await expect(
        t.mutation(api.movements.board, { ...seat, troopIds: [heavy], carrierId: wing }),
      ).rejects.toThrow('AIR_TRANSPORT_SEATS_INFANTRY');
    }
    const rifle = await form(t, seat, 'infantry', field);
    await t.mutation(api.movements.board, { ...seat, troopIds: [rifle], carrierId: wing });
    expect((await t.run((ctx) => ctx.db.get(rifle)))!.carriedBy).toBe(wing);
  });

  it('boards nobody who stands at another address', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const barracks = await raise(t, seat, 'barracks', NORD);
    const quay = await raise(t, seat, 'port', NORD);
    const armour = await form(t, seat, 'armor', barracks);
    const cargo = await form(t, seat, 'cargo', quay);

    await expect(
      t.mutation(api.movements.board, { ...seat, troopIds: [armour], carrierId: cargo }),
    ).rejects.toThrow('TROOP_NOT_AT_ORIGIN');
  });

  it('sets passengers ashore at the quay, and never on the open sea', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const quay = await raise(t, seat, 'port', NORD);
    const cargo = await form(t, seat, 'cargo', quay);
    const rifle = await form(t, seat, 'infantry', quay);
    await t.run((ctx) => ctx.db.patch(rifle, { carriedBy: cargo }));

    await t.mutation(api.movements.disembark, { ...seat, troopIds: [rifle] });
    expect((await t.run((ctx) => ctx.db.get(rifle)))!.carriedBy).toBeUndefined();

    const sea = { lon: DOGGER[0], lat: DOGGER[1] };
    const hull = await postAt(t, seat, 'cargo', sea);
    const swimmer = await postAt(t, seat, 'infantry', sea);
    await t.run((ctx) => ctx.db.patch(swimmer, { carriedBy: hull }));
    await expect(
      t.mutation(api.movements.disembark, { ...seat, troopIds: [swimmer] }),
    ).rejects.toThrow('DISEMBARK_AT_SEA');
  });

  /** **Dissoudre une escouade** (#130) : ses pièces se posent à part, sur-le-champ, sans slot ;
   *  un passager reste à bord de son transport. */
  it('spreads a squad into lone pieces around its point, its riders aboard', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const field = { lon: 4.8, lat: 46.5 }; // Burgundy, far inland
    const truck = await postAt(t, seat, 'landTransport', field);
    const rider = await postAt(t, seat, 'infantry', field);
    const armour = await postAt(t, seat, 'armor', field);
    await t.run((ctx) => ctx.db.patch(rider, { carriedBy: truck }));

    await t.mutation(api.movements.disband, { ...seat, point: field });

    const [kept, aboard, apart] = await t.run((ctx) =>
      Promise.all([truck, rider, armour].map((id) => ctx.db.get(id))),
    );
    expect(kept!.stationedAt).toEqual(field);
    expect(aboard!.stationedAt).toEqual(field);
    expect(aboard!.carriedBy).toBe(truck);
    expect(apart!.stationedAt).not.toEqual(field);
    expect(await t.run(async (ctx) => ctx.db.query('movements').collect())).toEqual([]);

    await expect(t.mutation(api.movements.disband, { ...seat, point: field })).rejects.toThrow(
      'NOT_A_SQUAD',
    );
  });

  /** **Les passagers suivent leur transport** : il part avec sa cargaison, et un passager ne
   *  part pas sans lui. */
  it('takes a transport’s cargo along, and keeps a passenger from leaving without it', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const quay = await raise(t, seat, 'port', NORD);
    const cargo = await form(t, seat, 'cargo', quay);
    const rifle = await form(t, seat, 'infantry', quay);
    await t.run((ctx) => ctx.db.patch(rifle, { carriedBy: cargo }));
    const origin = { kind: 'building' as const, buildingId: quay };
    const point = { lon: DOGGER[0], lat: DOGGER[1] };

    await expect(
      t.mutation(api.movements.marchTo, { ...seat, origin, troopIds: [rifle], point }),
    ).rejects.toThrow('STILL_ABOARD');
    await t.mutation(api.movements.marchTo, { ...seat, origin, troopIds: [cargo], point });
    const [movement] = await t.run(async (ctx) => ctx.db.query('movements').collect());
    expect([...movement!.troopIds].sort()).toEqual([cargo, rifle].sort());
  });

  /** **Une colonne mixte embarque au départ** : ses fusiliers montent dans son camion. */
  it('seats a column’s riflemen in its truck as it leaves', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const barracks = await raise(t, seat, 'barracks', MARNE);
    const truck = await form(t, seat, 'landTransport', barracks);
    const riflemen = [
      await form(t, seat, 'infantry', barracks),
      await form(t, seat, 'infantry', barracks),
    ];

    await t.mutation(api.movements.marchTo, {
      ...seat,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [truck, ...riflemen],
      point: { lon: 4.0, lat: 49.0 },
    });

    const seated = await t.run(async (ctx) => Promise.all(riflemen.map((id) => ctx.db.get(id))));
    expect(seated.map((troop) => troop!.carriedBy)).toEqual([truck, truck]);
  });

  /** **Lâchée de loin sur un transport**, la troupe y marche et monte en arrivant. */
  it('boards the transport it marched to, on arrival', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const barracks = await raise(t, seat, 'barracks', MARNE);
    const quay = await raise(t, seat, 'port', NORD);
    const rifle = await form(t, seat, 'infantry', barracks);
    const cargo = await form(t, seat, 'cargo', quay);

    await t.mutation(api.movements.enterGarrison, {
      ...seat,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [rifle],
      buildingId: quay,
      boardsOn: cargo,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const arrived = (await t.run((ctx) => ctx.db.get(rifle)))!;
    expect(arrived.stationedAt).toBe(quay);
    expect(arrived.carriedBy).toBe(cargo);
  });

  /**
   * And the fan knows it **without a route**: `legalMovementTypes` reads the same pile the
   * mutation reads, so nothing is ever offered that the server then turns down (ADR 0015). No
   * Dijkstra runs on either side of this assertion.
   */
  it('refuses a cargo leaving ground with no port, and the fan says so with no route', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    await expect(embark(t, seat, ['infantry', 'cargo'], { port: false })).rejects.toThrow(
      'NO_PORT_AT_DEPARTURE',
    );

    const aim: MovementAim = {
      kind: 'point',
      lon: KENT[0],
      lat: KENT[1],
      coastal: true,
      ground: 'land',
      surveyed: true,
    };
    const quayless: Column = {
      roles: ['infantry', 'cargo'],
      myRegionIds: new Set([NORD]),
      myOutpostIds: new Set(),
      departureBuildings: new Set<BuildingKey>(['barracks', 'depot']),
      afloat: false,
      coastal: false,
    };
    expect(refusalOf('attack', aim, quayless)).toBe('NO_PORT_AT_DEPARTURE');
    /** Et la porte ferme le fan entier : plus rien à demander depuis ce sol-là. */
    expect(legalMovementTypes(aim, quayless)).toEqual([]);
  });

  /**
   * **Un débarquement se choisit, il ne se traverse pas** (décision 72a, 04/09). Le cargo suivait
   * ses passagers sur la jambe terrestre : la mer n'était qu'un morceau du chemin et la plage se
   * choisissait toute seule. Elle se nomme désormais, et le reste est l'ordre d'après.
   */
  it('refuses a landing anywhere but on a coast, and the fan says so with no route', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    await raise(t, seat, 'barracks', NORD);
    const quay = await raise(t, seat, 'port', NORD);
    const troopIds = [await form(t, seat, 'infantry', quay), await form(t, seat, 'cargo', quay)];

    await expect(
      t.mutation(api.movements.marchTo, {
        ...seat,
        origin: { kind: 'building', buildingId: quay },
        troopIds,
        point: { lon: MIDLANDS[0], lat: MIDLANDS[1] },
      }),
    ).rejects.toThrow('LANDING_NEEDS_A_COAST');

    /** Les quatre cibles, et la même réponse des deux côtés du fil — aucun Dijkstra ne tourne
     *  sous cette assertion (ADR 0015). */
    const landing: Column = {
      roles: ['infantry', 'cargo'],
      myRegionIds: new Set([NORD]),
      myOutpostIds: new Set(),
      departureBuildings: new Set<BuildingKey>(['barracks', 'port']),
      afloat: false,
      coastal: false,
    };
    const beach: MovementAim = {
      kind: 'point',
      lon: KENT[0],
      lat: KENT[1],
      coastal: true,
      ground: 'land',
      surveyed: true,
    };
    const inland: MovementAim = {
      kind: 'point',
      lon: MIDLANDS[0],
      lat: MIDLANDS[1],
      coastal: false,
      ground: 'land',
      surveyed: true,
    };
    expect(coastAtPoint(KENT)).toBe(true);
    expect(coastAtPoint(MIDLANDS)).toBe(false);
    expect(legalMovementTypes(beach, landing)).toEqual(['march', 'attack']);
    expect(legalMovementTypes(inland, landing)).toEqual([]);
    expect(refusalOf('march', inland, landing)).toBe('LANDING_NEEDS_A_COAST');
    expect(
      refusalOf(
        'attack',
        { kind: 'region', regionId: RUHR, country: 'DEU', lon: 7.5, lat: 51.5, surveyed: true },
        landing,
      ),
    ).toBe('LANDING_NEEDS_A_COAST');
  });

  /**
   * **Tout le monde descend au même endroit** (règle 3 de la décision 72a) : deux adresses
   * rendraient le rembarquement impossible à composer (`sameStation`). Ce que chacun fait de la
   * plage lui appartient ensuite — le fantassin marche, la coque reprend la mer.
   */
  it('puts hulls and passengers ashore at one address, and each is ordered on from it', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const { infantry, cargo, beach } = await landAtKent(t, seat);

    const ashore = await t.run(async (ctx) => [
      (await ctx.db.get(infantry))!.stationedAt,
      (await ctx.db.get(cargo))!.stationedAt,
    ]);
    expect(ashore).toEqual([beach, beach]);

    /** Le fantassin s'enfonce dans les terres, seul et à pied : plus rien ne le porte. */
    await expect(
      t.mutation(api.movements.marchTo, {
        ...seat,
        origin: { kind: 'point', point: beach },
        troopIds: [infantry],
        point: { lon: MIDLANDS[0], lat: MIDLANDS[1] },
      }),
    ).resolves.toBeDefined();
  });

  /**
   * **La plage tient lieu du quai qu'elle n'a pas** (ADR 0019 §2, révision du 04/09). Sans cela
   * une coque débarquée resterait échouée là pour la saison — le *mouvement fantôme* que la
   * révision du 27/08 avait chassé du large, revenu par la côte.
   */
  it('lets the hull sail again off the beach it landed on, with no quay under it', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const { cargo, beach } = await landAtKent(t, seat);

    await expect(
      t.mutation(api.movements.marchTo, {
        ...seat,
        origin: { kind: 'point', point: beach },
        troopIds: [cargo],
        point: { lon: DOGGER[0], lat: DOGGER[1] },
      }),
    ).resolves.toBeDefined();
  });

  /**
   * **Deux géométries, deux réponses — et une coque échouée entre les deux.** La visée lisait
   * « à terre » sur la grille de routage (`ground`) ; le départ lisait « à flot » sur le polygone
   * (`hostAtPoint`). Toute bande côtière plus étroite qu'une demi-cellule est de la terre pour
   * l'un et de la mer pour l'autre : la coque y était envoyée sans refus — la cible n'est pas à
   * terre — puis n'en repartait plus, ni à flot ni sur une plage, un quai réclamé à un point
   * que Dijkstra tient pour de l'eau. Le *mouvement fantôme*, une troisième fois. `afloat` se lit
   * désormais sur la grille, la même lecture que la visée, et la porte répond ce que la visée a
   * promis (ADR 0015).
   *
   * **Les deux géométries n'en font plus qu'une** (ADR 0023) : l'hôte se lit sur la même maille
   * que la route, et cette bande de Sussex qui était britannique pour le polygone et de l'eau
   * pour la grille est de l'eau pour les deux. Le scénario reste — une coque s'y pose et doit en
   * repartir — mais ce qu'il vérifiait au premier chiffre est devenu l'accord des deux lectures.
   *
   * **Puis la terre de l'atlas revient** (#224) : la bande est britannique, à terre, et une plage
   * où la coque accoste dans sa propre cellule d'eau ouverte. Les trois lectures disent toujours
   * la même chose, et la coque repart.
   */
  it('lets a hull sail again from a shoreline the polygon calls land and the grid calls water', async () => {
    /** Sussex shore: inside the British polygon, in a cell whose centre is in the Channel. */
    const SUSSEX: LonLat = [0.1, 50.78];
    expect(hostAtPoint(SUSSEX)).toBe('GBR');
    expect(landAtPoint(SUSSEX)).toBe(true);
    expect(coastAtPoint(SUSSEX)).toBe(true);

    const t = boot();
    const { seat } = await launchedSeason(t);
    const quay = await raise(t, seat, 'port', NORD);
    const cargo = await form(t, seat, 'cargo', quay);
    const shore = { lon: SUSSEX[0], lat: SUSSEX[1] };
    await t.mutation(api.movements.marchTo, {
      ...seat,
      origin: { kind: 'building', buildingId: quay },
      troopIds: [cargo],
      point: shore,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await t.run(async (ctx) => ctx.db.get(cargo)))!.stationedAt).toEqual(shore);

    const origin = { kind: 'point' as const, point: shore };
    const target = { kind: 'point' as const, point: { lon: DOGGER[0], lat: DOGGER[1] } };
    expect(
      await t.query(api.movements.preview, {
        ...seat,
        origin,
        troopIds: [cargo],
        type: 'march',
        target,
      }),
    ).not.toBeNull();
    await expect(
      t.mutation(api.movements.marchTo, {
        ...seat,
        origin,
        troopIds: [cargo],
        point: target.point,
      }),
    ).resolves.toBeDefined();
  });

  /** **Un lac n'est ni la mer ni la terre** (ADR 0034) : la flotte s'y voit refuser le lac, du
   *  mot que la rose dit avant le geste ; une escadre, elle, le survole et s'y pose. */
  it('refuses a fleet the Caspian, and lets a squadron fly there', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const caspian = { lon: 50.5, lat: 42 };
    const quay = await raise(t, seat, 'port', NORD);
    const cargo = await form(t, seat, 'cargo', quay);
    await expect(
      t.mutation(api.movements.marchTo, {
        ...seat,
        origin: { kind: 'building', buildingId: quay },
        troopIds: [cargo],
        point: caspian,
      }),
    ).rejects.toThrow('LAKE_TARGET');

    /** Une piste à Qazax, assez près pour le plein d'un chasseur. */
    const field = await raise(t, seat, 'airfield', 'AZE-1684');
    const fighter = await form(t, seat, 'fighter', field);
    await expect(
      t.mutation(api.movements.marchTo, {
        ...seat,
        origin: { kind: 'building', buildingId: field },
        troopIds: [fighter],
        point: caspian,
      }),
    ).resolves.toBeDefined();
  });

  it('refuses the landed infantry a sea destination in both preview and send', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const { infantry, beach } = await landAtKent(t, seat);
    const origin = { kind: 'point' as const, point: beach };
    const point = { lon: 1.9, lat: 52 };

    expect(
      await t.query(api.movements.preview, {
        ...seat,
        origin,
        troopIds: [infantry],
        type: 'march',
        target: { kind: 'point', point },
      }),
    ).toBeNull();
    await expect(
      t.mutation(api.movements.marchTo, {
        ...seat,
        origin,
        troopIds: [infantry],
        point,
      }),
    ).rejects.toThrow('LAND_TARGET_REQUIRED');
    expect((await t.run(async (ctx) => ctx.db.get(infantry)))!.stationedAt).toEqual(beach);
  });

  it('refuses the landed cargo an inland destination and keeps it free to sail', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const { cargo, beach } = await landAtKent(t, seat);
    const origin = { kind: 'point' as const, point: beach };
    const point = { lon: MIDLANDS[0], lat: MIDLANDS[1] };

    expect(
      await t.query(api.movements.preview, {
        ...seat,
        origin,
        troopIds: [cargo],
        type: 'march',
        target: { kind: 'point', point },
      }),
    ).toBeNull();
    await expect(
      t.mutation(api.movements.marchTo, {
        ...seat,
        origin,
        troopIds: [cargo],
        point,
      }),
    ).rejects.toThrow('SEA_TARGET_REQUIRED');
    await expect(
      t.mutation(api.movements.marchTo, {
        ...seat,
        origin,
        troopIds: [cargo],
        point: { lon: DOGGER[0], lat: DOGGER[1] },
      }),
    ).resolves.toBeDefined();
  });

  /** Et la pile se recompose : les deux repartent ensemble par où ils sont venus — d'une plage
   *  vers une autre, puisqu'une colonne embarquée ne se pose plus sur l'eau. */
  it('re-embarks the pair from the same address, coast to coast', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const { infantry, cargo, beach } = await landAtKent(t, seat);

    await expect(
      t.mutation(api.movements.marchTo, {
        ...seat,
        origin: { kind: 'point', point: beach },
        troopIds: [infantry, cargo],
        point: NORD_QUAY,
      }),
    ).resolves.toBeDefined();
  });

  it('lands at Sakhalin, rejoins the cargo at its exact address and sails back to Japan', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const quayPoint = { lon: 141.82, lat: 43.53 };
    const quay = await raise(t, seat, 'port', 'JPN-1847', quayPoint);
    const cargo = await form(t, seat, 'cargo', quay);
    const infantry = await form(t, seat, 'infantry', quay);
    const coast = Array.from({ length: 21 }, (_, i) => [142 + i * 0.05, 47] as LonLat).find(
      (point) => coastAtPoint(point) && hostAtPoint(point) === 'RUS',
    );
    expect(coast).toBeDefined();
    const beach = asPoint(coast!);
    await t.mutation(api.movements.marchTo, {
      ...seat,
      origin: { kind: 'building', buildingId: quay },
      troopIds: [cargo, infantry],
      point: beach,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    await t.mutation(api.movements.disembark, { ...seat, troopIds: [infantry] });

    const inland = regionFacts('RUS-2616')!.point;
    expect(landAtPoint(inland)).toBe(true);
    await t.mutation(api.movements.marchTo, {
      ...seat,
      origin: { kind: 'point', point: beach },
      troopIds: [infantry],
      point: asPoint(inland),
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await t.run(async (ctx) => ctx.db.get(cargo)))!.stationedAt).toEqual(beach);

    await t.mutation(api.movements.marchTo, {
      ...seat,
      origin: { kind: 'point', point: asPoint(inland) },
      troopIds: [infantry],
      point: beach,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await t.run(async (ctx) => ctx.db.get(infantry)))!.stationedAt).toEqual(beach);

    const { movementId } = await t.mutation(api.movements.marchTo, {
      ...seat,
      origin: { kind: 'point', point: beach },
      troopIds: [cargo, infantry],
      point: quayPoint,
    });
    const movement = await t.run(async (ctx) => ctx.db.get(movementId));
    expect(movement!.legs.every((leg) => leg.medium === 'sea')).toBe(true);
  });

  /**
   * **La règle ne fabrique pas de quai.** Un cargo posé à l'intérieur des terres est impossible
   * après ce chantier, mais une donnée d'avant-wipe peut l'être : il reste refusé, exactement
   * comme avant, parce que c'est la côte qui l'exempte et rien d'autre.
   */
  it('fabricates no quay for a hull left inland', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const quay = await raise(t, seat, 'port', NORD);
    const cargo = await form(t, seat, 'cargo', quay);
    const stranded = { lon: MIDLANDS[0], lat: MIDLANDS[1] };
    await t.run(async (ctx) => ctx.db.patch(cargo, { stationedAt: stranded }));

    await expect(
      t.mutation(api.movements.marchTo, {
        ...seat,
        origin: { kind: 'point', point: stranded },
        troopIds: [cargo],
        point: { lon: DOGGER[0], lat: DOGGER[1] },
      }),
    ).rejects.toThrow('NO_PORT_AT_DEPARTURE');
  });

  it('asks no port of a column that only walks', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const barracks = await raise(t, seat, 'barracks', MARNE);
    const troop = await form(t, seat, 'infantry', barracks);

    await attacking(t, {
      ...seat,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [troop],
      target: { kind: 'region', regionId: RUHR },
    });

    const [movement] = await t.run(async (ctx) => ctx.db.query('movements').collect());
    expect(movement!.legs.every((leg) => leg.medium === 'land')).toBe(true);
  });
});

describe('a posted force never starts a pass at a distance', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('lets an attack pass a garrison and resolve only at its destination', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const barracks = await raise(t, seat, 'barracks', MARNE);
    const troop = await form(t, seat, 'infantry', barracks);

    // Halfway down the road the column is about to take, so it walks straight into the radius.
    const road = routeBetween(regionFacts(MARNE)!.point, regionFacts(PRAHOVA)!.point, 'land')!;
    const ambush = road.points[Math.floor(road.points.length / 2)]!;
    const outpostId = await plant(t, guest, ambush, 'ROU');
    const waiting = await garrison(t, guest, outpostId);

    await attacking(t, {
      ...seat,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [troop],
      target: { kind: 'region', regionId: PRAHOVA },
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(await engagementsIn(t)).toHaveLength(0);
    expect((await t.run(async (ctx) => ctx.db.get(troop)))!.currentStrength).toBe(
      nominalStrength('infantry', 1),
    );
    expect((await t.run(async (ctx) => ctx.db.get(waiting)))!.currentStrength).toBe(
      nominalStrength('infantry', 1),
    );
  });

  it('lets a neighbouring garrison observe a raid resolved once at the aimed outpost', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const barracks = await raise(t, seat, 'barracks', MARNE);
    const column = [
      await form(t, seat, 'infantry', barracks),
      await form(t, seat, 'infantry', barracks),
      await form(t, seat, 'infantry', barracks),
    ];
    const aimed = regionFacts(PRAHOVA)!.point;
    const raided = await plant(t, guest, aimed, 'ROU');
    const held = await garrison(t, guest, raided);
    const neighbour = await plant(t, guest, eastOf(aimed, 20), 'ROU');
    const watching = await garrison(t, guest, neighbour);

    await t.mutation(api.movements.raid, {
      ...seat,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: column,
      outpostId: raided,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const accounts = await engagementsIn(t);
    const onTheRoad = accounts.filter((account) => account.cause === 'interception');
    const atTheEnd = accounts.filter((account) => account.cause === 'arrival');
    expect(onTheRoad).toHaveLength(0);
    expect(atTheEnd).toHaveLength(1);
    expect(atTheEnd[0]!.outpostId).toBe(raided);
    expect((await t.run(async (ctx) => ctx.db.get(raided)))!.disabledUntil).not.toBeNull();

    expect((await t.run(async (ctx) => ctx.db.get(watching)))!.currentStrength).toBe(
      nominalStrength('infantry', 1),
    );
    expect(atTheEnd[0]!.troops.some((one) => one.troopId === held)).toBe(true);
  });
});

describe('a routed column walks itself home', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('breaks contact, takes the road back, and does not hold a slot doing it', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const barracks = await raise(t, seat, 'barracks', MARNE);
    const worn = await form(t, seat, 'infantry', barracks);
    // Thirty soldiers walking at fifty: the riposte takes it under the quarter it breaks at.
    await t.run(async (ctx) => ctx.db.patch(worn, { currentStrength: 30 }));
    const theirs = await raise(t, guest, 'barracks', PRAHOVA);
    await form(t, guest, 'infantry', theirs);

    const sent = await attacking(t, {
      ...seat,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [worn],
      target: { kind: 'region', regionId: PRAHOVA },
    });
    vi.advanceTimersByTime(sent.minutes * 60_000);
    await t.finishInProgressScheduledFunctions();

    const [account] = await engagementsIn(t);
    expect(account!.troops.find((one) => one.troopId === worn)!.state).toBe('routed');

    const [back] = await movementsOf(t, seat);
    expect(back!.type).toBe('return');
    expect(back!.troopIds).toEqual([worn]);

    // It is not an order, so it does not eat the one movement a player may have in flight.
    const other = await form(t, seat, 'infantry', barracks);
    await expect(
      attacking(t, {
        ...seat,
        origin: { kind: 'building', buildingId: barracks },
        troopIds: [other],
        target: { kind: 'region', regionId: RUHR },
      }),
    ).resolves.toBeDefined();

    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const home = await t.run(async (ctx) => ctx.db.get(worn));
    expect(home!.stationedAt).toBe(barracks);
    expect(home!.currentStrength).toBeLessThan(30);
  });
});

/**
 * **A rout refluxes to the nearest anchor** (ADR 0019 §3, amended 19/08). A force whose address
 * is a point has lost the only ground it hung from; where it goes is the nearest of the anchors
 * its owner already has — the capital, which stands for the national soil, or one of his own
 * outposts. The point that opens the terrain and feeds the army also **rallies** it.
 *
 * The case with no outpost at all is the one that did not change, and it is tested where it was
 * written: *walks the beaten camp home and stands the column on the ground it took* above — the
 * capital for a route, a `null` address at the end of it.
 */
describe('a rout refluxes to the nearest anchor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  const asPoint = (point: LonLat) => ({ lon: point[0], lat: point[1] });
  /** Arabia: neutral ground, and some three thousand kilometres from Moskva — so an outpost a
   *  few hundred kilometres away is unambiguously the nearer anchor. */
  const ARABIA: LonLat = [46.72, 24.63];

  /**
   * **Deux colonnes qui attaquent le camp relevé**, ce qui est le seul chemin vers une passe
   * depuis l'ADR 0024 §3 : la marche ne heurte plus rien, et c'est l'ordre qui ouvre le feu.
   */
  async function assault(t: ReturnType<typeof boot>, seat: Seat, at: LonLat, onto: LonLat) {
    const troopIds = [await post(t, seat, at), await post(t, seat, at)];
    /** La seconde colonne part entamée : à pleine force les deux frappes effacent exactement les
     *  cinquante hommes du camp, et il n'y aurait plus de déroute à suivre. */
    await t.run(async (ctx) => ctx.db.patch(troopIds[1]!, { currentStrength: 30 }));
    const campId = await surveyCamp(t, seat, asPoint(onto));
    const sent = await attacking(t, {
      ...seat,
      origin: { kind: 'point', point: asPoint(at) },
      troopIds,
      target: { kind: 'camp', campId },
    });
    vi.advanceTimersByTime(sent.minutes * 60_000);
    await t.finishInProgressScheduledFunctions();
    return troopIds;
  }

  it('walks the beaten camp to its own outpost and leaves it there as the garrison', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const rally = await plant(t, guest, eastOf(ARABIA, 300), 'SAU');
    /** Deux colonnes sur cinquante hommes : elles ne l'effacent pas, elles le cassent — la salve
     *  du camp part quand même, et la déroute se lit une fois la passe finie. */
    const camped = await post(t, guest, ARABIA);
    /** Deux compagnies au pays : la déroute ne doit pas conclure la saison sous lui. */
    await form(t, guest, 'infantry', null);
    await form(t, guest, 'infantry', null);

    await assault(t, seat, eastOf(ARABIA, -200), ARABIA);

    const [back] = await movementsOf(t, guest);
    expect(back).toBeDefined();
    expect(back!.type).toBe('return');
    expect(back!.target).toEqual({ kind: 'outpost', outpostId: rally });
    expect(back!.troopIds).toEqual([camped]);
    /** Nobody ordered this march: it holds no slot, and it walks — the arrival is in the future. */
    expect((await t.query(api.view.playerView, guest)).me.slots.used).toBe(0);
    expect(back!.arrivesAt).toBeGreaterThan(Date.now());

    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await t.run(async (ctx) => ctx.db.get(camped)))!.stationedAt).toBe(rally);
  });

  /** **A deactivated outpost rallies all the same** — it hosts its garrison while out of service
   *  (ADR 0004), so what the deactivation suspends is its effects, never its address. */
  it('rallies to an outpost that a raid has put out of service', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const rally = await plant(t, guest, eastOf(ARABIA, 300), 'SAU');
    await t.run(async (ctx) =>
      ctx.db.patch(rally, { disabledUntil: Date.now() + OUTPOST_DISABLED_HOURS * 3_600_000 }),
    );
    const camped = await post(t, guest, ARABIA);
    /** Deux compagnies au pays, bien à l'écart : la déroute ne doit pas passer le guest sous la
     *  barre de la Domination — la saison se conclurait, et le retour serait refusé à une
     *  saison que plus personne ne joue (`seasonStillPlays`). */
    await form(t, guest, 'infantry', null);
    await form(t, guest, 'infantry', null);

    await assault(t, seat, eastOf(ARABIA, -200), ARABIA);

    const [back] = await movementsOf(t, guest);
    expect(back!.target).toEqual({ kind: 'outpost', outpostId: rally });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await t.run(async (ctx) => ctx.db.get(camped)))!.stationedAt).toBe(rally);
  });

  /**
   * **The column that marched out of a camp walks back too.** It used to be skipped by the road
   * home — it hung from a point, and no building answered for it — so it reappeared at its point
   * of departure the instant the pass was resolved. Travel time is real for the beaten.
   */
  it('walks the column that left a camp, and never teleports it to where it started', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    /** **450 km et pas 600** : la grille tient le Golfe pour de l'eau à 500, et depuis le 18/09
     *  une pile terrestre mouillée ne part plus du tout (`NO_HULL_AT_SEA`) — le camp que ce cas
     *  veut est un camp, pas un mouillage. */
    const camp = eastOf(ARABIA, 450);
    const walker = await post(t, guest, camp);
    // Worn down before the pass: it fires its salvo and breaks all the same.
    await t.run(async (ctx) => ctx.db.patch(walker, { currentStrength: 30 }));
    // Two companies of the guest's kept at home, well clear of the road: the rout must not put
    // him under the victory bar, or the season concludes and the walk home is rightly refused
    // a season nobody plays any more (`seasonStillPlays`).
    await form(t, guest, 'infantry', null);
    await form(t, guest, 'infantry', null);
    // A French column holding the ground it attacks: it opens the pass and breaks on it.
    await post(t, seat, ARABIA);
    const campId = await surveyCamp(t, guest, asPoint(ARABIA));

    const sent = await attacking(t, {
      ...guest,
      origin: { kind: 'point', point: asPoint(camp) },
      troopIds: [walker],
      target: { kind: 'camp', campId },
    });
    vi.advanceTimersByTime(sent.minutes * 60_000);
    await t.finishInProgressScheduledFunctions();

    const [back] = await movementsOf(t, guest);
    expect(back).toBeDefined();
    expect(back!.type).toBe('return');
    expect(back!.troopIds).toEqual([walker]);
    /** It leaves from the ground it broke on, not from the camp it had already left. */
    expect(back!.from).toEqual(asPoint(ARABIA));
    expect(back!.arrivesAt).toBeGreaterThan(Date.now());

    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const home = await t.run(async (ctx) => ctx.db.get(walker));
    /** No outpost of its own: the capital, and national soil hanging from nothing that stands. */
    expect(home!.stationedAt).toBeNull();
    expect(home!.stationedAt).not.toEqual(asPoint(camp));
  });

  /**
   * **A return never engages.** It can land on ground that turned against it while it walked;
   * survivors do not open a second pass for one defeat (ADR 0014). The column comes down where
   * it arrives, at its own risk — and what walks past it afterwards will find it standing.
   */
  it('lands without a fight on a rally point somebody else is now camped on', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const rally = await plant(t, guest, eastOf(ARABIA, 300), 'SAU');
    const camped = await post(t, guest, ARABIA);
    /** Deux compagnies au pays, bien à l'écart : la déroute ne doit pas passer le guest sous la
     *  barre de la Domination — la saison se conclurait, et le retour serait refusé à une
     *  saison que plus personne ne joue (`seasonStillPlays`). */
    await form(t, guest, 'infantry', null);
    await form(t, guest, 'infantry', null);

    await assault(t, seat, eastOf(ARABIA, -200), ARABIA);
    expect(await engagementsIn(t)).toHaveLength(1);

    // The winner walks up to the rally point while the beaten column is still on the road.
    await post(t, seat, eastOf(ARABIA, 300));

    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await t.run(async (ctx) => ctx.db.get(camped)))!.stationedAt).toBe(rally);
    expect(await engagementsIn(t)).toHaveLength(1);
  });

  /** **The anchor is read once, at the rout.** One razed while the return flies does not move
   *  the destination: the column walks to the ground it was sent to and stands on it. */
  it('stands on the ground it reached when the rally point is gone', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const rally = await plant(t, guest, eastOf(ARABIA, 300), 'SAU');
    const camped = await post(t, guest, ARABIA);
    /** Deux compagnies au pays, bien à l'écart : la déroute ne doit pas passer le guest sous la
     *  barre de la Domination — la saison se conclurait, et le retour serait refusé à une
     *  saison que plus personne ne joue (`seasonStillPlays`). */
    await form(t, guest, 'infantry', null);
    await form(t, guest, 'infantry', null);

    await assault(t, seat, eastOf(ARABIA, -200), ARABIA);
    const [back] = await movementsOf(t, guest);
    await t.run(async (ctx) => ctx.db.delete(rally));

    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await t.run(async (ctx) => ctx.db.get(camped)))!.stationedAt).toEqual(back!.to);
  });
});

/**
 * **Nobody teleports** (ADR 0019 §3, amended 19/08). The travel time is the central lever the
 * simulation measured, and it owns no exception: the same `return` carries the beaten and the
 * winners back to the address they left.
 */
describe('a column that comes out of a pass walks back, winner or beaten', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  const asPoint = (point: LonLat) => ({ lon: point[0], lat: point[1] });
  /** Deliberately off the Prahova centroid, and far enough from it to be another place. */
  const AIMED: LonLat = [25.2, 44.6];

  it('walks the winners of an attack back to the camp they left', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const camp = regionFacts(PRAHOVA)!.point;
    const column = [await post(t, seat, camp), await post(t, seat, camp)];
    const standing = await post(t, guest, AIMED);
    // Twenty soldiers: the first strike of the pass clears the ground, so the attack wins it.
    await t.run(async (ctx) => ctx.db.patch(standing, { currentStrength: 20 }));

    const sent = await attacking(t, {
      ...seat,
      origin: { kind: 'point', point: asPoint(camp) },
      troopIds: column,
      target: { kind: 'point', point: asPoint(AIMED) },
    });
    vi.advanceTimersByTime(sent.minutes * 60_000);
    await t.finishInProgressScheduledFunctions();

    const [account] = await engagementsIn(t);
    expect(account!.winner).toBe('attacker');
    expect(await t.run(async (ctx) => ctx.db.get(standing))).toBeNull();

    /** **The winners march.** They used to be skipped by the road home — a point answered to
     *  nobody — and so stood on their camp again the instant the pass was resolved, while the
     *  beaten walked. The trip is real for both. */
    const [back] = await movementsOf(t, seat);
    expect(back).toBeDefined();
    expect(back!.type).toBe('return');
    expect(back!.target).toEqual({ kind: 'point', point: asPoint(camp) });
    expect(back!.to).toEqual(asPoint(camp));
    expect([...back!.troopIds].sort()).toEqual([...column].sort());
    expect(back!.arrivesAt).toBeGreaterThan(Date.now());

    await t.finishAllScheduledFunctions(vi.runAllTimers);
    for (const troop of column) {
      expect((await t.run(async (ctx) => ctx.db.get(troop)))!.stationedAt).toEqual(asPoint(camp));
    }
  });

  it('walks the winners of an attack back into the outpost they garrison', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const outpostId = await plant(t, seat, regionFacts(PRAHOVA)!.point, 'ROU');
    const column = [await garrison(t, seat, outpostId), await garrison(t, seat, outpostId)];
    const standing = await post(t, guest, AIMED);
    await t.run(async (ctx) => ctx.db.patch(standing, { currentStrength: 20 }));

    const sent = await attacking(t, {
      ...seat,
      origin: { kind: 'outpost', outpostId },
      troopIds: column,
      target: { kind: 'point', point: asPoint(AIMED) },
    });
    vi.advanceTimersByTime(sent.minutes * 60_000);
    await t.finishInProgressScheduledFunctions();

    expect((await engagementsIn(t))[0]!.winner).toBe('attacker');

    const [back] = await movementsOf(t, seat);
    expect(back).toBeDefined();
    expect(back!.type).toBe('return');
    expect(back!.target).toEqual({ kind: 'outpost', outpostId });
    expect(back!.to).toEqual(asPoint(regionFacts(PRAHOVA)!.point));
    expect(back!.arrivesAt).toBeGreaterThan(Date.now());

    await t.finishAllScheduledFunctions(vi.runAllTimers);
    for (const troop of column) {
      expect((await t.run(async (ctx) => ctx.db.get(troop)))!.stationedAt).toBe(outpostId);
    }
  });
});

/**
 * **A posted troop is the fourth source of detection** (ADR 0019 §5, design sheet 04): it reveals
 * what passes within its role's range to its owner, and it pierces nothing — a thread, a
 * bearing, an estimated schedule, a medium, never the type nor the composition.
 *
 * The rows are maintained at board events and read only through the observer's own index, which
 * keeps the fan-out bounded (`WWS/docs/technique/brouillard-et-fanout.md`).
 */
describe('a posted troop sees what passes within its radius', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  /** The road the column will actually walk, and how close a point stands to it: the tests turn
   *  on the radius, so the geography is measured rather than assumed. */
  const road = () => routeBetween(regionFacts(MARNE)!.point, regionFacts(PRAHOVA)!.point, 'land')!;
  const nearestOn = (points: ReadonlyArray<LonLat>, point: LonLat) =>
    points.reduce((closest, step) => Math.min(closest, distanceKm(step, point)), Infinity);
  /** A point off the road's halfway vertex, square to it: the pulled road runs east (#231). */
  const abreastOfHalfway = (km: number): LonLat => {
    const points = road().points;
    const halfway = points[Math.floor(points.length / 2)]!;
    const ahead = points[Math.floor(points.length / 2) + 1]!;
    return destinationPoint(halfway, km, bearingDegrees(halfway, ahead) + 90);
  };

  async function marchAcross(t: ReturnType<typeof boot>, seat: Seat) {
    const barracks = await raise(t, seat, 'barracks', MARNE);
    const troop = await form(t, seat, 'infantry', barracks);
    return attacking(t, {
      ...seat,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [troop],
      target: { kind: 'region', regionId: PRAHOVA },
    });
  }

  it('serves the thread of what walks past, and neither its type nor its composition', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    // Forty kilometres off the road: inside the sentry's passive detection range.
    const camp = abreastOfHalfway(40);
    expect(nearestOn(road().points, camp)).toBeLessThan(DETECTION_RANGE_KM.infantry);
    await post(t, guest, camp);

    const sent = await marchAcross(t, seat);
    vi.advanceTimersByTime(sent.minutes * 60_000 * 0.5);

    const watched = await t.query(api.view.playerView, guest);
    expect(watched.detected).toHaveLength(1);
    const [seen] = watched.detected;
    expect(seen!.points.length).toBeGreaterThan(1);
    expect(seen!.arrivesAt).toBe(sent.arrivesAt);
    /** The fog checked by what is missing: an unidentified movement has nothing to leak because
     *  nothing was fetched (design sheet 04, convention §8). */
    expect(seen).not.toHaveProperty('type');
    expect(seen).not.toHaveProperty('roles');
    expect(seen).not.toHaveProperty('troopIds');
    expect(seen).not.toHaveProperty('playerId');

    /** And no engagement came of it: a posted detector never starts a pass at a distance. */
    expect(await engagementsIn(t)).toHaveLength(0);
  });

  it('sees nothing of the same column from beyond the radius', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const camp = abreastOfHalfway(150);
    expect(nearestOn(road().points, camp)).toBeGreaterThan(DETECTION_RANGE_KM.infantry);
    await post(t, guest, camp);

    const sent = await marchAcross(t, seat);
    vi.advanceTimersByTime(sent.minutes * 60_000 * 0.5);

    expect((await t.query(api.view.playerView, guest)).detected).toEqual([]);
  });
});

/**
 * **La porte dérobée, refermée** (29/08/2026). Elle était la tolérance du leurre : un manifeste
 * vide était un ordre. Le leurre retiré, « à zéro troupe » n'est plus une façon d'obtenir une
 * marche gratuite — un ordre qui porte des troupes en porte au moins une.
 */
describe('an empty manifest buys nothing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  const asPoint = (point: LonLat) => ({ lon: point[0], lat: point[1] });

  it('refuses a march with no troop named', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const barracks = await raise(t, seat, 'barracks', MARNE);

    await expect(
      t.mutation(api.movements.marchTo, {
        ...seat,
        origin: { kind: 'building', buildingId: barracks },
        troopIds: [],
        point: asPoint(regionFacts(PRAHOVA)!.point),
      }),
    ).rejects.toThrow('EMPTY_MOVEMENT');
  });

  it('refuses an attack with no troop named, and spends no slot doing it', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const barracks = await raise(t, seat, 'barracks', MARNE);

    await expect(
      attacking(t, {
        ...seat,
        origin: { kind: 'building', buildingId: barracks },
        troopIds: [],
        target: { kind: 'point', point: asPoint(regionFacts(PRAHOVA)!.point) },
      }),
    ).rejects.toThrow('EMPTY_MOVEMENT');
    expect((await t.query(api.view.playerView, seat)).me.slots.used).toBe(0);
  });
});

/**
 * **Un manifeste nomme chaque troupe une fois.** Le client n'en écrit jamais deux fois la même,
 * mais rien ne l'y obligeait côté serveur : trois fois l'id d'un fantassin donnait trois lignes
 * d'attaquant de pleine force dans la passe, et une attaque perdue à un contre un se gagnait.
 */
describe('a manifest names each troop once', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  const asPoint = (point: LonLat) => ({ lon: point[0], lat: point[1] });

  it('refuses an attack naming the same troop twice, and spends no slot doing it', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const barracks = await raise(t, seat, 'barracks', MARNE);
    const troop = await form(t, seat, 'infantry', barracks);

    await expect(
      attacking(t, {
        ...seat,
        origin: { kind: 'building', buildingId: barracks },
        troopIds: [troop, troop],
        target: { kind: 'point', point: asPoint(regionFacts(PRAHOVA)!.point) },
      }),
    ).rejects.toThrow('DUPLICATE_TROOP');
    expect((await t.query(api.view.playerView, seat)).me.slots.used).toBe(0);
  });

  it('refuses a march, even when the repeated troop is not the first one named', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const barracks = await raise(t, seat, 'barracks', MARNE);
    const first = await form(t, seat, 'infantry', barracks);
    const second = await form(t, seat, 'infantry', barracks);

    await expect(
      t.mutation(api.movements.marchTo, {
        ...seat,
        origin: { kind: 'building', buildingId: barracks },
        troopIds: [first, second, first],
        point: asPoint(regionFacts(PRAHOVA)!.point),
      }),
    ).rejects.toThrow('DUPLICATE_TROOP');
  });

  it('refuses a founding column naming the same troop twice', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const point = regionFacts(PRAHOVA)!.point;
    const posted = await post(t, seat, point);

    await expect(
      t.mutation(api.movements.foundOutpostHere, {
        regionId: null,
        ...seat,
        point: asPoint(point),
        specialization: 'relay',
        troopIds: [posted, posted],
      }),
    ).rejects.toThrow('DUPLICATE_TROOP');
    expect(await outpostsOf(t, seat)).toHaveLength(0);
  });

  it('answers a preview of a repeated manifest with nothing, as it does for any refusal', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const barracks = await raise(t, seat, 'barracks', MARNE);
    const troop = await form(t, seat, 'infantry', barracks);
    await surveyRegion(t, seat, PRAHOVA);

    const preview = await t.query(api.movements.preview, {
      ...seat,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [troop, troop],
      target: { kind: 'region', regionId: PRAHOVA },
      type: 'attack',
    });
    expect(preview).toBeNull();
  });

  it('still lets a distinct manifest through', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const barracks = await raise(t, seat, 'barracks', MARNE);
    const first = await form(t, seat, 'infantry', barracks);
    const second = await form(t, seat, 'infantry', barracks);

    await attacking(t, {
      ...seat,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [first, second],
      target: { kind: 'point', point: asPoint(regionFacts(PRAHOVA)!.point) },
    });
    expect((await movementsOf(t, seat))[0]!.troopIds).toEqual([first, second]);
  });
});

/**
 * **Le métier d'un point se règle sur le point** (décision Pierre, 29/08). Le serveur exige une
 * spécialisation à la fondation et le clic droit n'en demande aucune : il pose « relais », et le
 * panneau de l'avant-poste rattrape — tant qu'aucune passe ne s'en est servie.
 */
describe('an outpost changes trade until a pass has read it', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  const asPoint = (point: LonLat) => ({ lon: point[0], lat: point[1] });

  it('takes the change, and says so in the view', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const outpostId = await plant(t, seat, regionFacts(PRAHOVA)!.point, 'ROU');

    expect((await t.query(api.view.playerView, seat)).me.outposts[0]).toMatchObject({
      specialization: 'relay',
      specializationLocked: false,
    });

    await t.mutation(api.movements.respecialize, {
      ...seat,
      outpostId,
      specialization: 'listening',
    });

    expect((await t.run(async (ctx) => ctx.db.get(outpostId)))!.specialization).toBe('listening');
  });

  /**
   * Un départ **à portée** est ce qui scelle : il peut lire le relais immédiatement et fait
   * entrer le poste d'écoute dans la réévaluation événementielle.
   */
  it('seals it once a departure passes within its reach', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const barracks = await raise(t, seat, 'barracks', MARNE);
    const troop = await form(t, seat, 'infantry', barracks);
    const outpostId = await plant(t, seat, regionFacts(MARNE)!.point, 'FRA');

    await t.mutation(api.movements.marchTo, {
      ...seat,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [troop],
      point: asPoint(regionFacts(PRAHOVA)!.point),
    });

    expect((await t.query(api.view.playerView, seat)).me.outposts[0]).toMatchObject({
      specializationLocked: true,
    });
    const refused = await t
      .mutation(api.movements.respecialize, { ...seat, outpostId, specialization: 'listening' })
      .catch((problem: unknown) => (problem as ConvexError<{ code: string }>).data);
    expect(refused).toMatchObject({ code: 'SPECIALIZATION_SEALED' });
  });

  /** Un départ à l'autre bout du monde n'a rien lu de ce point-là : sceller sur lui scellerait
   *  chaque avant-poste dans la minute qui suit sa fondation. */
  it('leaves it open when the departure never comes near', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const barracks = await raise(t, seat, 'barracks', MARNE);
    const troop = await form(t, seat, 'infantry', barracks);
    const outpostId = await plant(t, seat, regionFacts(RIYADH)!.point, 'SAU');

    await t.mutation(api.movements.marchTo, {
      ...seat,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [troop],
      point: asPoint(regionFacts(RUHR)!.point),
    });

    expect((await t.query(api.view.playerView, seat)).me.outposts[0]).toMatchObject({
      specializationLocked: false,
    });
    await t.mutation(api.movements.respecialize, {
      ...seat,
      outpostId,
      specialization: 'listening',
    });
    expect((await t.run(async (ctx) => ctx.db.get(outpostId)))!.specialization).toBe('listening');
  });
});

/**
 * **Entering a garrison** (decisions 64b, 69a, 70b): a march aimed at a building of one's own,
 * which ends with `stationedAt` on the building rather than on the ground in front of it. It is
 * what lets the infantry board the cargo moored at that port on the next order — the case the
 * test game of 04/09 could not play.
 */
describe('a column enters a garrison of its own', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  const NORD = 'FRA-5330'; // coastal, facing the Channel
  const KENT: LonLat = [0.73, 51.21];
  /** Thirty-odd kilometres inland of the port's region point — posted, not stationed. */
  const nearby = (): { lon: number; lat: number } => {
    const [lon, lat] = regionFacts(NORD)!.point;
    return { lon: lon + 0.4, lat };
  };

  async function post(
    t: ReturnType<typeof boot>,
    seat: Seat,
    role: UnitRole,
    at: { lon: number; lat: number },
  ): Promise<Id<'troops'>> {
    const playerId = await playerOf(t, seat);
    const strength = nominalStrength(role, 1);
    return t.run(async (ctx) => {
      const seasonId = (await ctx.db.get(playerId))!.seasonId;
      return ctx.db.insert('troops', {
        seasonId,
        playerId,
        role,
        tier: 1,
        nominalStrength: strength,
        currentStrength: strength,
        stationedAt: at,
      });
    });
  }

  async function noticesOf(t: ReturnType<typeof boot>, seat: Seat) {
    const playerId = await playerOf(t, seat);
    return t.run(async (ctx) =>
      ctx.db
        .query('notices')
        .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
        .collect(),
    );
  }

  it('stations the infantry at the port it marched into, and says so by name', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const port = await raise(t, seat, 'port', NORD);
    const camp = nearby();
    const infantry = await post(t, seat, 'infantry', camp);

    await t.mutation(api.movements.enterGarrison, {
      ...seat,
      origin: { kind: 'point', point: camp },
      troopIds: [infantry],
      buildingId: port,
    });
    const [filed] = await movementsOf(t, seat);
    expect(filed!.type).toBe('march');
    expect(filed!.target).toEqual({ kind: 'building', buildingId: port });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect((await t.run(async (ctx) => ctx.db.get(infantry)))!.stationedAt).toBe(port);
    expect(await movementsOf(t, seat)).toHaveLength(0);
    const entered = (await noticesOf(t, seat)).filter(
      (notice) => notice.kind === 'garrisonEntered',
    );
    expect(entered).toHaveLength(1);
    expect(entered[0]).toMatchObject({ building: 'port', regionId: NORD, troops: 1 });
    expect((await noticesOf(t, seat)).some((notice) => notice.kind === 'columnArrived')).toBe(
      false,
    );
    /** The modal of the port reads the same address the view serves. */
    const view = await t.query(api.view.playerView, seat);
    expect(view.me.troops.find((troop) => troop.id === infantry)?.stationedAt).toEqual({
      kind: 'building',
      buildingId: port,
    });
  });

  /** **The case that opened the yard**: infantry at the port, cargo at the port, one order. */
  it('lets the infantry sail with the cargo moored at that port on its next order', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const port = await raise(t, seat, 'port', NORD);
    const camp = nearby();
    const infantry = await post(t, seat, 'infantry', camp);
    const cargo = await form(t, seat, 'cargo', port);

    await t.mutation(api.movements.enterGarrison, {
      ...seat,
      origin: { kind: 'point', point: camp },
      troopIds: [infantry],
      buildingId: port,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    await expect(
      t.mutation(api.movements.marchTo, {
        ...seat,
        origin: { kind: 'building', buildingId: port },
        troopIds: [cargo, infantry],
        point: { lon: KENT[0], lat: KENT[1] },
      }),
    ).resolves.toBeDefined();
    const [crossing] = await movementsOf(t, seat);
    expect(crossing!.legs.some((leg) => leg.medium === 'sea')).toBe(true);
  });

  it('refuses the role the building is shut to, naming both', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const mine = await raise(t, seat, 'mine', NORD);
    const camp = nearby();
    const armour = await post(t, seat, 'armor', camp);

    const refused = await t
      .mutation(api.movements.enterGarrison, {
        ...seat,
        origin: { kind: 'point', point: camp },
        troopIds: [armour],
        buildingId: mine,
      })
      .catch((problem: unknown) => problem);
    expect(refused).toBeInstanceOf(ConvexError);
    expect(
      (refused as ConvexError<{ code: string; role: string; building: string }>).data,
    ).toMatchObject({
      code: 'NOT_A_GARRISON_FOR',
      role: 'armor',
      building: 'mine',
    });
    /** And the fan agrees without asking: same function, same table (ADR 0015). */
    const column: Column = {
      roles: ['armor'],
      myRegionIds: new Set([NORD]),
      myOutpostIds: new Set(),
      departureBuildings: new Set(),
      afloat: false,
      coastal: false,
    };
    const aim: MovementAim = { kind: 'building', buildingId: mine, key: 'mine' };
    expect(legalMovementTypes(aim, column)).toEqual([]);
    expect(refusalOf('march', aim, column)).toBe('NOT_A_GARRISON_FOR');
  });

  it('stands the column on the point when the building fell during the march', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const port = await raise(t, seat, 'port', NORD);
    const camp = nearby();
    const infantry = await post(t, seat, 'infantry', camp);

    await t.mutation(api.movements.enterGarrison, {
      ...seat,
      origin: { kind: 'point', point: camp },
      troopIds: [infantry],
      buildingId: port,
    });
    await t.run(async (ctx) => ctx.db.delete(port));
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const [lon, lat] = regionFacts(NORD)!.point;
    expect((await t.run(async (ctx) => ctx.db.get(infantry)))!.stationedAt).toEqual({ lon, lat });
    const notices = await noticesOf(t, seat);
    expect(notices.some((notice) => notice.kind === 'garrisonEntered')).toBe(false);
    expect(notices.find((notice) => notice.kind === 'columnArrived')).toMatchObject({
      movementType: 'march',
      troops: 1,
    });
  });

  it("answers somebody else's building as unknown — the fog does not confirm it stands", async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const theirs = await raise(t, guest, 'barracks', PSKOV);
    const camp = nearby();
    const infantry = await post(t, seat, 'infantry', camp);

    await expect(
      t.mutation(api.movements.enterGarrison, {
        ...seat,
        origin: { kind: 'point', point: camp },
        troopIds: [infantry],
        buildingId: theirs,
      }),
    ).rejects.toThrow('UNKNOWN_BUILDING');
    await expect(
      t.query(api.movements.preview, {
        ...seat,
        origin: { kind: 'point', point: camp },
        troopIds: [infantry],
        target: { kind: 'building', buildingId: theirs },
        type: 'march',
      }),
    ).rejects.toThrow('UNKNOWN_BUILDING');
  });

  /**
   * **Elle marche jusqu'au quai, pas jusqu'au centre de la région** (ADR 0013, révision du
   * 04/09). The whole point of the coast point is that it is where the building *is*: the march
   * that ends in it ends there, and the arc drawn on the board ends there too.
   */
  it('walks to the port\u2019s own quay rather than to its region\u2019s point', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const quay = { lon: 1.92, lat: 50.56 };
    const port = await raise(t, seat, 'port', NORD, quay);
    const camp = nearby();
    const infantry = await post(t, seat, 'infantry', camp);

    await t.mutation(api.movements.enterGarrison, {
      ...seat,
      origin: { kind: 'point', point: camp },
      troopIds: [infantry],
      buildingId: port,
    });
    const [filed] = await movementsOf(t, seat);
    const arrival = filed!.points[filed!.points.length - 1]!;
    expect(distanceKm([arrival.lon, arrival.lat], [quay.lon, quay.lat])).toBeLessThan(40);
    expect(distanceKm([arrival.lon, arrival.lat], regionFacts(NORD)!.point)).toBeGreaterThan(40);
  });

  it('previews the route to the building and names its region', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const port = await raise(t, seat, 'port', NORD);
    const camp = nearby();
    const infantry = await post(t, seat, 'infantry', camp);

    const preview = await t.query(api.movements.preview, {
      ...seat,
      origin: { kind: 'point', point: camp },
      troopIds: [infantry],
      target: { kind: 'building', buildingId: port },
      type: 'march',
    });
    expect(preview).not.toBeNull();
    expect(preview!.destinationName).toBe(regionFacts(NORD)!.name);
    expect(preview!.route.mode).toBe('land');
  });
});

/**
 * **« Un cargo peut rester en mer avec des unités dedans »** (décision de Pierre, 18/09/2026, qui
 * révise la 72a du 04/09). Le large devient une destination, donc une adresse, donc un endroit où
 * l'on vit — et une passe de résolution y a une conséquence que la terre n'a pas : ce qu'aucune
 * coque ne porte plus coule.
 */
describe('rester en mer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  const NORD = 'FRA-5330';
  const DOGGER: LonLat = [2.5, 54.5]; // plein mer, hôte de personne
  const HELIGOLAND: LonLat = [6.5, 54.6]; // un autre morceau de la même eau
  const KENT: LonLat = [0.73, 51.21]; // une plage, en face
  const MIDLANDS: LonLat = [-1.5, 52.4]; // anglais, et pas une cellule d'eau à un pas

  /** Une pile embarquée mouillée au large : l'état que ce lot rend possible, et le point de
   *  départ de tous les cas d'après. */
  const anchorOffshore = async (t: ReturnType<typeof boot>, seat: Seat) => {
    await raise(t, seat, 'barracks', NORD);
    const quay = await raise(t, seat, 'port', NORD);
    const infantry = await form(t, seat, 'infantry', quay);
    const cargo = await form(t, seat, 'cargo', quay);
    const water = { lon: DOGGER[0], lat: DOGGER[1] };
    await t.mutation(api.movements.marchTo, {
      ...seat,
      origin: { kind: 'building', buildingId: quay },
      troopIds: [infantry, cargo],
      point: water,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    return { infantry, cargo, water };
  };

  /** Règle 2 : une seule adresse, sur l'eau, et la pile s'y lit comme à terre. */
  it('puts hulls and passengers at one address on the open sea', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const { infantry, cargo, water } = await anchorOffshore(t, seat);

    expect(landAtPoint(DOGGER)).toBe(false);
    const moored = await t.run(async (ctx) => [
      (await ctx.db.get(infantry))!.stationedAt,
      (await ctx.db.get(cargo))!.stationedAt,
    ]);
    expect(moored).toEqual([water, water]);

    const view = await t.query(api.view.playerView, seat);
    const stations = view.me.troops
      .filter((troop) => [infantry, cargo].includes(troop.id as Id<'troops'>))
      .map((troop) => troop.stationedAt);
    expect(stations).toHaveLength(2);
    for (const station of stations) {
      expect(station).toMatchObject({ kind: 'point', afloat: true, coastal: false });
    }
  });

  /** Règle 3 : elle repart par sa coque — vers une autre eau, ou vers une plage. L'intérieur
   *  des terres reste refusé : la jambe terrestre après la mer n'existe toujours pas. */
  it('sails on from the water it sits in, to another sea point or to a beach', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const { infantry, cargo, water } = await anchorOffshore(t, seat);
    const origin = { kind: 'point' as const, point: water };

    await expect(
      t.mutation(api.movements.marchTo, {
        ...seat,
        origin,
        troopIds: [infantry, cargo],
        point: { lon: HELIGOLAND[0], lat: HELIGOLAND[1] },
      }),
    ).resolves.toBeDefined();
    /** En mer il n'y a pas de région : le nom est celui du large, la chaîne vide, que le client
     *  lit « en mer » (`placeLabel`). */
    const [sailing] = (await t.query(api.view.playerView, seat)).movements;
    expect(sailing!.destinationName).toBe(hostAtPoint(HELIGOLAND));
    expect(regionAtRoutePoint(HELIGOLAND)).toBeNull();
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const second = { kind: 'point' as const, point: { lon: HELIGOLAND[0], lat: HELIGOLAND[1] } };
    await expect(
      t.mutation(api.movements.marchTo, {
        ...seat,
        origin: second,
        troopIds: [infantry, cargo],
        point: { lon: MIDLANDS[0], lat: MIDLANDS[1] },
      }),
    ).rejects.toThrow('LANDING_NEEDS_A_COAST');
    await expect(
      t.mutation(api.movements.marchTo, {
        ...seat,
        origin: second,
        troopIds: [infantry, cargo],
        point: { lon: KENT[0], lat: KENT[1] },
      }),
    ).resolves.toBeDefined();
  });

  /** Règle 3, l'autre moitié : sans coque, la pile ne part pas — et elle le lit. */
  it('refuses the passengers an order once nothing floats under them', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const { infantry, cargo, water } = await anchorOffshore(t, seat);
    await t.run(async (ctx) => ctx.db.delete(cargo));

    for (const point of [
      { lon: KENT[0], lat: KENT[1] },
      { lon: HELIGOLAND[0], lat: HELIGOLAND[1] },
    ]) {
      await expect(
        t.mutation(api.movements.marchTo, {
          ...seat,
          origin: { kind: 'point', point: water },
          troopIds: [infantry],
          point,
        }),
      ).rejects.toThrow('NO_HULL_AT_SEA');
    }
  });

  /** Règle 5 : on ne fonde pas en mer. Le trou s'est ouvert avec le large — le sol de personne
   *  satisfaisait la seule condition que la fondation posait. */
  it('plants no point on the water, and says why', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const { infantry, cargo, water } = await anchorOffshore(t, seat);
    await t.run(async (ctx) => ctx.db.delete(cargo));

    await expect(
      t.mutation(api.movements.foundOutpostHere, {
        ...seat,
        point: water,
        regionId: null,
        specialization: 'relay',
        troopIds: [infantry],
      }),
    ).rejects.toThrow('NO_FOUNDING_AT_SEA');
  });

  /**
   * Règle 4 : la coque coule, ses passagers avec elle. **Détruits, jamais déroutés** — il n'y a
   * rien où se replier, et c'est ce qui fait le prix du large et l'intérêt d'une escorte.
   */
  it('drowns the passengers of a hull sent to the bottom, and files the dispatch', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const water = { lon: DOGGER[0], lat: DOGGER[1] };
    const cargo = await postAt(t, guest, 'cargo', water);
    const aboard = await postAt(t, guest, 'infantry', water);

    const quay = await raise(t, seat, 'port', NORD);
    const hunters = [await form(t, seat, 'escort', quay), await form(t, seat, 'escort', quay)];
    const campId = await surveyCamp(t, seat, water);
    await t.mutation(api.movements.attack, {
      ...seat,
      origin: { kind: 'building', buildingId: quay },
      troopIds: hunters,
      target: { kind: 'camp', campId },
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const left = await t.run(async (ctx) => [await ctx.db.get(cargo), await ctx.db.get(aboard)]);
    expect(left).toEqual([null, null]);

    const drowned = await t.run(async (ctx) =>
      ctx.db
        .query('notices')
        .filter((q) => q.eq(q.field('kind'), 'drownedAtSea'))
        .collect(),
    );
    expect(drowned).toHaveLength(1);
    expect(drowned[0]).toMatchObject({ men: nominalStrength('infantry', 1), machines: 0 });

    /** **Le compte de la passe dit la vérité** : le fantassin y est détruit, parce qu'il l'est. */
    const [account] = await t.run(async (ctx) => ctx.db.query('engagements').collect());
    expect(account!.troops.find((one) => one.troopId === aboard)!.state).toBe('destroyed');
  });

  /** **Le vainqueur se lit après le large** : une cargaison noyée n'est plus debout, et la passe
   *  qui coule le dernier banc a dégagé le terrain. */
  it('gives the field to the hunter whose strike drowned what it did not shoot', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const water = { lon: DOGGER[0], lat: DOGGER[1] };
    await postAt(t, guest, 'cargo', water, 4 / 8);
    const aboard = await postAt(t, guest, 'infantry', water);

    const quay = await raise(t, seat, 'port', NORD);
    const campId = await surveyCamp(t, seat, water);
    await t.mutation(api.movements.attack, {
      ...seat,
      origin: { kind: 'building', buildingId: quay },
      troopIds: [await form(t, seat, 'escort', quay)],
      target: { kind: 'camp', campId },
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const [account] = await t.run(async (ctx) => ctx.db.query('engagements').collect());
    expect(account!.troops.find((one) => one.troopId === aboard)!.state).toBe('destroyed');
    expect(account!.winner).toBe('attacker');
  });

  /**
   * Règle 4, sa seconde moitié : **une coque déroutée emporte ses passagers dans son repli**, et
   * ce qu'aucune coque ne porte coule. Douze à bord, un treizième à l'eau.
   */
  it('takes twelve aboard the routed hull and drowns the thirteenth', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const water = { lon: DOGGER[0], lat: DOGGER[1] };
    /** À 7 sur 8, une seule salve d'escorte la met sous le quart : elle rompt le contact. */
    const cargo = await postAt(t, guest, 'cargo', water, 7 / 8);
    const riders: Array<Id<'troops'>> = [];
    for (let rank = 0; rank < 13; rank += 1) riders.push(await postAt(t, guest, 'infantry', water));
    /** Douze à bord, le treizième sans banc — on est à bord parce qu'on a embarqué (15/10). */
    await t.run(async (ctx) => {
      for (const rider of riders.slice(0, 12)) await ctx.db.patch(rider, { carriedBy: cargo });
    });

    const quay = await raise(t, seat, 'port', NORD);
    const campId = await surveyCamp(t, seat, water);
    await t.mutation(api.movements.attack, {
      ...seat,
      origin: { kind: 'building', buildingId: quay },
      troopIds: [await form(t, seat, 'escort', quay)],
      target: { kind: 'camp', campId },
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const [account] = await t.run(async (ctx) => ctx.db.query('engagements').collect());
    expect(account!.troops.find((one) => one.troopId === cargo)!.state).toBe('routed');
    const left = await t.run(async (ctx) =>
      (await Promise.all(riders.map((id) => ctx.db.get(id)))).filter((troop) => troop !== null),
    );
    expect(left).toHaveLength(12);
    /** **Les douze suivent la coque**, et pas un pas de plus : ils sont sur son repli, à la même
     *  adresse qu'elle — c'est la déroute ordinaire de l'ADR 0019 §3, sans une ligne de plus. */
    const withTheHull = await t.run(async (ctx) => (await ctx.db.get(cargo))!.stationedAt);
    for (const rider of left) expect(rider!.stationedAt).toEqual(withTheHull);
    const drowned = await t.run(async (ctx) =>
      ctx.db
        .query('notices')
        .filter((q) => q.eq(q.field('kind'), 'drownedAtSea'))
        .collect(),
    );
    expect(drowned[0]).toMatchObject({ men: nominalStrength('infantry', 1), machines: 0 });
  });
});

/**
 * **Un navire rejoint le quai** (#221) : le port se pose sur la vraie côte, et sur le front de
 * mer de Calais la grille de routage n'a que de l'eau. La coque y entre quand même : sa route
 * vise la cellule de mer du quai, comme pour tout port posé sur l'eau.
 */
describe('le quai sur la vraie côte', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('brings a cargo back from the open sea to a port standing on Calais harbour', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const port = await raise(t, seat, 'port', 'FRA-5334', { lon: 1.85, lat: 50.97 });
    const offshore = { lon: 2.5, lat: 54.5 };
    const cargo = await postAt(t, seat, 'cargo', offshore);

    await t.mutation(api.movements.enterGarrison, {
      ...seat,
      origin: { kind: 'point', point: offshore },
      troopIds: [cargo],
      buildingId: port,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await t.run((ctx) => ctx.db.get(cargo)))!.stationedAt).toBe(port);
  });

  /** **Hambourg s'amarre à l'embouchure** : sur l'Elbe, la grille n'a que de la terre sans eau
   *  ouverte à côté. La coque vise l'eau ouverte la plus proche, à l'aller comme au retour. */
  it('brings a cargo into a port on the Elbe, moored at the mouth, and sails it out again', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const elbe = { lon: 9.395, lat: 53.83 };
    const port = await raise(t, seat, 'port', 'DEU-1579', elbe);
    const offshore = { lon: 2.5, lat: 54.5 };
    const cargo = await postAt(t, seat, 'cargo', offshore);

    const preview = await t.query(api.movements.preview, {
      ...seat,
      origin: { kind: 'point', point: offshore },
      troopIds: [cargo],
      target: { kind: 'building', buildingId: port },
      type: 'march',
    });
    expect(preview).not.toBeNull();
    await t.mutation(api.movements.enterGarrison, {
      ...seat,
      origin: { kind: 'point', point: offshore },
      troopIds: [cargo],
      buildingId: port,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await t.run((ctx) => ctx.db.get(cargo)))!.stationedAt).toBe(port);

    await t.mutation(api.movements.marchTo, {
      ...seat,
      origin: { kind: 'building', buildingId: port },
      troopIds: [cargo],
      point: offshore,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await t.run((ctx) => ctx.db.get(cargo)))!.stationedAt).toEqual(offshore);
  });
});

/**
 * **Malte et les petites îles** (#224, décisions de Pierre du 21/10) : la grille de 25 km les noie,
 * l'atlas leur rend leur terre. Une colonne embarquée y débarque, y fonde, y tient garnison ; on
 * n'y marche toujours pas depuis le continent, et le refus le dit.
 */
describe('les petites îles', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  const VAR = 'FRA-5351';
  const TOULON = { lon: 5.93, lat: 43.1 };
  const VALLETTA = 'MLT-5949';
  const AT_VALLETTA = pointIn(VALLETTA);
  const YAREN = 'NRU-4983'; // Nauru, à 300 km de toute autre terre
  const OFF_NAURU = { lon: 167.2, lat: -0.55 };

  /** La traversée a mangé le stock : ce qui est sous test est le sol, pas la facture. */
  const stockUp = async (t: ReturnType<typeof boot>, seat: Seat) => {
    const playerId = await playerOf(t, seat);
    await t.run(async (ctx) => {
      for (const row of await ctx.db
        .query('resources')
        .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
        .collect())
        await ctx.db.patch(row._id, { stock: 10_000, updatedAt: Date.now() });
    });
  };

  const embark = async (t: ReturnType<typeof boot>, seat: Seat) => {
    const quay = await raise(t, seat, 'port', VAR, TOULON);
    return {
      infantry: await form(t, seat, 'infantry', quay),
      cargo: await form(t, seat, 'cargo', quay),
      quay,
    };
  };

  it('lands a column on Malta, ashore, and founds an outpost there', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const { infantry, cargo, quay } = await embark(t, seat);

    await t.mutation(api.movements.marchTo, {
      ...seat,
      origin: { kind: 'building', buildingId: quay },
      troopIds: [infantry, cargo],
      point: AT_VALLETTA,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const view = await t.query(api.view.playerView, seat);
    const landed = view.me.troops.find((troop) => troop.id === infantry)!;
    expect(landed.stationedAt).toMatchObject({ kind: 'point', afloat: false, coastal: true });

    await t.run(async (ctx) => ctx.db.delete(cargo));
    await stockUp(t, seat);
    await t.mutation(api.movements.foundOutpostHere, {
      ...seat,
      point: AT_VALLETTA,
      regionId: VALLETTA,
      specialization: 'relay',
      troopIds: [infantry],
    });
    const [outpost] = await outpostsOf(t, seat);
    expect(outpost).toMatchObject({ hostCountry: 'MLT', regionId: VALLETTA });
  });

  it('opens an isolated atoll like any other island', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const infantry = await postAt(t, seat, 'infantry', OFF_NAURU);
    const cargo = await postAt(t, seat, 'cargo', OFF_NAURU);
    const atYaren = pointIn(YAREN);

    await t.mutation(api.movements.marchTo, {
      ...seat,
      origin: { kind: 'point', point: OFF_NAURU },
      troopIds: [infantry, cargo],
      point: atYaren,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    await t.run(async (ctx) => ctx.db.delete(cargo));
    await stockUp(t, seat);
    await t.mutation(api.movements.foundOutpostHere, {
      ...seat,
      point: atYaren,
      regionId: YAREN,
      specialization: 'relay',
      troopIds: [infantry],
    });
    expect((await outpostsOf(t, seat))[0]).toMatchObject({ hostCountry: 'NRU' });
  });

  it('sends nobody on foot against a camp on Malta, and says so', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const infantry = await postAt(t, seat, 'infantry', TOULON);
    await postAt(t, guest, 'infantry', AT_VALLETTA);
    const campId = await surveyCamp(t, seat, AT_VALLETTA);
    await expect(
      attacking(t, {
        ...seat,
        origin: { kind: 'point', point: TOULON },
        troopIds: [infantry],
        target: { kind: 'camp', campId },
      }),
    ).rejects.toThrow('NO_FOOTING');
  });

  it('still walks nobody to Malta from the mainland, and says so', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const infantry = await postAt(t, seat, 'infantry', TOULON);
    await expect(
      t.mutation(api.movements.marchTo, {
        ...seat,
        origin: { kind: 'point', point: TOULON },
        troopIds: [infantry],
        point: AT_VALLETTA,
      }),
    ).rejects.toThrow('NO_FOOTING');
  });
});
