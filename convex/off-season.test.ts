import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './_generated/api';
import type { Id, TableNames } from './_generated/dataModel';
import { distanceKm, type LonLat } from '../src/domain/geo';
import {
  HQ_LEVEL_AT_LAUNCH,
  DETECTION_RANGE_KM,
  STARTING_AMMUNITION,
  STARTING_KIT,
  SUPPLY_BY_ROLE,
  SUPPLY_STEP_COST,
  buildCost,
  nominalStrength,
} from './constants';
import { regionFacts } from './regions';
import { routeBetween } from './routes';
import { GAME_TABLES } from './dev';
import schema from './schema';
import { modules } from './test.setup';
import {
  attacking,
  foundSeat,
  joinSeat,
  placeHq,
  seatIn,
  seatsOf,
  setClock,
  unclocked,
} from './seats.fixture';
import type { Seat } from './seats.fixture';

const boot = () => convexTest({ schema, modules, transactionLimits: true });

const KIT = STARTING_KIT;

/** Moselle: French, inland, and a coal deposit — enough to build anything the tests raise. */
const MOSELLE = 'FRA-5328';
async function seasonWithTwoPlayers(t: ReturnType<typeof boot>) {
  const { seat, code } = await foundSeat(t, 'Pierre', 0.5);
  const guestToken = await joinSeat(t, code, 'Léa');
  return { code, creator: seat, guest: guestToken };
}

async function readyToLaunch(t: ReturnType<typeof boot>) {
  const { code, creator, guest } = await seasonWithTwoPlayers(t);
  await t.mutation(api.players.reserveNation, { ...creator, nation: 'france' });
  await t.mutation(api.players.declareReady, { ...creator, ready: true });
  await t.mutation(api.players.reserveNation, { ...guest, nation: 'ussr' });
  await t.mutation(api.players.declareReady, { ...guest, ready: true });
  return { code, creator, guest };
}

describe('creating and joining', () => {
  afterEach(() => vi.useRealTimers());

  it('creates a season and hands out an unambiguous 6-character code', async () => {
    const t = boot();
    const { seat, code } = await foundSeat(t, 'Pierre', 0);
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    const lobby = await t.query(api.seasons.lobby, seat);
    expect(lobby.me.creator).toBe(true);
    expect(lobby.players).toHaveLength(1);
  });

  it('rejects an unknown code', async () => {
    const t = boot();
    await expect(joinSeat(t, 'ZZZZZZ', 'X')).rejects.toThrow('UNKNOWN_GAME_CODE');
  });

  it('widens the playable region with the player count', async () => {
    const t = boot();
    const { code, creator } = await seasonWithTwoPlayers(t);
    expect((await t.query(api.seasons.lobby, creator)).playableRegion).toBe('europe');
    await joinSeat(t, code, 'Marc');
    await joinSeat(t, code, 'Jo');
    expect((await t.query(api.seasons.lobby, creator)).playableRegion).toBe('europe-med');
  });

  it('still accepts a new seat before launch after the two-hour mark', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2040-01-01T00:00:00Z'));
    const t = boot();
    const { code } = await foundSeat(t, 'Pierre', 0.5);
    vi.advanceTimersByTime(2 * 60 * 60 * 1000 + 1);

    await expect(joinSeat(t, code, 'Léa')).resolves.toHaveProperty('seasonId');
  });
});

/**
 * **Personne n'entre après le départ** (ADR 0027 §4) : la fenêtre de deux heures est partie avec
 * la saison à durée fixe. Le refus n'écrit rien — ni place, ni dotation.
 */
describe('nobody enters after the start', () => {
  it('refuses a new seat the moment the season is launched, and writes nothing', async () => {
    const t = boot();
    const { code, creator } = await readyToLaunch(t);
    await t.mutation(api.seasons.launch, creator);
    const rows = () =>
      t.run(async (ctx) => ({
        players: await ctx.db.query('players').collect(),
        resources: await ctx.db.query('resources').collect(),
      }));
    const before = await rows();

    await expect(joinSeat(t, code, 'Tard')).rejects.toThrow('REGISTRATION_CLOSED');
    expect(await rows()).toEqual(before);
  });

  it('keeps a concluded season closed', async () => {
    const t = boot();
    const { code, creator } = await readyToLaunch(t);
    await t.mutation(api.seasons.launch, creator);
    await t.run(async (ctx) => {
      const season = (await ctx.db.query('seasons').first())!;
      await ctx.db.patch(season._id, { status: 'concluded', concludedAt: Date.now() });
    });

    await expect(joinSeat(t, code, 'Tard')).rejects.toThrow('SEASON_CONCLUDED');
  });
});

describe('nation reservation', () => {
  it('is first come first served, and releases', async () => {
    const t = boot();
    const { creator, guest } = await seasonWithTwoPlayers(t);
    await t.mutation(api.players.reserveNation, { ...creator, nation: 'france' });
    await expect(
      t.mutation(api.players.reserveNation, { ...guest, nation: 'france' }),
    ).rejects.toThrow('NATION_TAKEN');
    await t.mutation(api.players.reserveNation, { ...creator, nation: null });
    await t.mutation(api.players.reserveNation, { ...guest, nation: 'france' });
  });

  /**
   * **A lobby row says what a seat shows, never what arms it.** The reservation is public — it
   * is the whole point of the flag list — but the seat authenticates every mutation, and
   * `doctrine` is a legacy column no reader may serve again (ADR 0020 §9).
   */
  it('shows the seats without handing out what arms them', async () => {
    const t = boot();
    const { creator, guest } = await seasonWithTwoPlayers(t);
    await t.mutation(api.players.reserveNation, { ...guest, nation: 'ussr' });
    const lobby = await t.query(api.seasons.lobby, creator);
    expect(lobby.players).toHaveLength(2);
    for (const player of lobby.players) {
      expect(player).not.toHaveProperty('accountId');
      expect(player).not.toHaveProperty('token');
      expect(player).not.toHaveProperty('doctrine');
    }
    expect(lobby.me).not.toHaveProperty('doctrine');
  });

  it('requires a nation to be ready', async () => {
    const t = boot();
    const { creator } = await seasonWithTwoPlayers(t);
    await expect(t.mutation(api.players.declareReady, { ...creator, ready: true })).rejects.toThrow(
      'NATION_REQUIRED',
    );
  });
});

describe('launching', () => {
  it('belongs to the creator and requires everyone ready', async () => {
    const t = boot();
    const { creator, guest } = await seasonWithTwoPlayers(t);
    await expect(t.mutation(api.seasons.launch, guest)).rejects.toThrow('CREATOR_ONLY');
    await expect(t.mutation(api.seasons.launch, creator)).rejects.toThrow('PLAYERS_NOT_READY');
  });

  it('hands out the starting kit, plants nothing, and freezes the region', async () => {
    const t = boot();
    const { creator } = await readyToLaunch(t);
    await t.mutation(api.seasons.launch, creator);
    const view = await t.query(api.view.playerView, creator);
    expect(view.me.nation).toBe('france');
    expect(view.me.resources.steel.stock).toBe(KIT.steel);
    /**
     * **Rien n'est planté** (décision 1b du 13/09, révision des ADR 0015 et 0017 §2) : le
     * quartier général est la première dette du socle, et le joueur la pose où il veut sur son
     * sol. Une bâtisse par région, donc un gisement sous le QG est un gisement perdu — c'est ce
     * choix-là que la décision lui rend.
     */
    expect(view.me.buildings).toEqual([]);
    expect(view.me.troops).toEqual([]);
    expect(view.me.hqLevel).toBe(0);
    expect(view.me.foundation).toEqual([
      { key: 'hq', deposit: null },
      { key: 'mine', deposit: 'iron' },
      { key: 'mine', deposit: 'coal' },
      { key: 'farm', deposit: 'food' },
    ]);
    // Un slot survit au bâtiment : une nation a toujours un mouvement à faire (ADR 0006).
    expect(view.me.slots).toEqual({ total: 1, used: 0 });
    // The home regions that carry a deposit, and only those.
    expect(view.me.regions.some((region) => region.id === MOSELLE)).toBe(true);
    expect(view.season.playableRegion).toBe('europe');
    expect(view.opponents).toHaveLength(1);
    expect(view.opponents[0]).not.toHaveProperty('doctrine');
  });

  /**
   * **Une compagnie d'infanterie, en garnison au quartier général** (décision du 25/08). Elle
   * naissait à la dotation ; depuis le 13/09 elle naît **avec le QG**, parce que c'est lui qui
   * lui donne une adresse — et le joueur choisit laquelle.
   */
  it('gives one infantry with the headquarters, stationed at it', async () => {
    const t = boot();
    const { creator } = await readyToLaunch(t);
    await t.mutation(api.seasons.launch, creator);
    await placeHq(t, creator, MOSELLE);

    const view = await t.query(api.view.playerView, creator);
    const hq = view.me.buildings.find((building) => building.key === 'hq')!;
    expect(hq).toEqual(
      expect.objectContaining({ key: 'hq', regionId: MOSELLE, level: HQ_LEVEL_AT_LAUNCH }),
    );
    expect(view.me.troops).toEqual([
      expect.objectContaining({
        role: 'infantry',
        tier: 1,
        strength: nominalStrength('infantry', 1),
      }),
    ]);
    expect(view.me.troops[0]!.stationedAt).toEqual({ kind: 'building', buildingId: hq.id });
  });

  /** **Une élévation n'amène rien** : seule la première pose, celle que le socle offre, porte
   *  la compagnie. Sans quoi monter son QG serait la façon la moins chère de lever une armée. */
  it('gives no second company when the headquarters is raised', async () => {
    const t = boot();
    const { creator } = await readyToLaunch(t);
    await t.mutation(api.seasons.launch, creator);
    await placeHq(t, creator, MOSELLE);
    // L'élévation se paie : la facture n'est pas le sujet, seule la compagnie l'est.
    await t.run(async (ctx) => {
      const player = await seatIn(ctx, creator);
      for (const held of await ctx.db
        .query('resources')
        .withIndex('byPlayer', (q) => q.eq('playerId', player._id))
        .collect()) {
        await ctx.db.patch(held._id, { stock: 10_000, updatedAt: Date.now() });
      }
    });
    await t.mutation(api.constructions.start, { ...creator, building: 'hq', regionId: MOSELLE });

    const view = await t.query(api.view.playerView, creator);
    // Une élévation passe par la file : ce qui compte ici est qu'elle n'ait rien enrôlé.
    expect(view.me.construction).toEqual(expect.objectContaining({ key: 'hq', regionId: MOSELLE }));
    expect(view.me.troops).toHaveLength(1);
  });

  /**
   * **Le kit de munitions** (décision du 25/08). Since ADR 0028 the rounds are steps a troop
   * carries, taken back at the anchor: what this endowment buys is rearming. The figure belongs
   * to the starting line, never to a nation, like the steel and the oil beside it.
   */
  it('hands out the ammunition of the starting line, not a nation’s own figure', async () => {
    const t = boot();
    const { creator } = await readyToLaunch(t);
    await t.mutation(api.seasons.launch, creator);

    const view = await t.query(api.view.playerView, creator);
    expect(view.me.resources.ammunition.stock).toBe(STARTING_AMMUNITION);
    // Enough to rearm the given company twice over: an endowment that covered one rearming
    // would be a nation disarmed by its first contact.
    const rearm = SUPPLY_BY_ROLE.infantry.rounds * SUPPLY_STEP_COST;
    expect(view.me.resources.ammunition.stock).toBeGreaterThan(rearm * 2);
  });
});

describe('lazy accrual', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /**
   * Nothing is extracted without an exploitation building: the rate comes from the map, not
   * from a stored number, and an empty map produces nothing. What a farm changes is in
   * `economy.test.ts`.
   *
   * The bread still moves, and only one thing moves it — la compagnie que le quartier général
   * amène mange dès sa première minute (`constructions.garrisonTheGift`, 13/09). So the served
   * rate is the upkeep of that one troop, net and negative, with nothing at all on the other
   * side of the subtraction. Le QG lui-même n'extrait rien : il n'a jamais rien produit.
   */
  it('extracts nothing as long as nothing is built, and only the given company moves the bread', async () => {
    const t = boot();
    const { creator } = await readyToLaunch(t);
    await t.mutation(api.seasons.launch, creator);
    await placeHq(t, creator);
    vi.advanceTimersByTime(2 * 3_600_000);
    const view = await t.query(api.view.playerView, creator);
    expect(view.me.upkeep.troops).toBe(1);
    expect(view.me.upkeep.foodPerHour).toBeGreaterThan(0);
    expect(view.me.resources.food.ratePerHour).toBe(-view.me.upkeep.foodPerHour);
    expect(view.me.resources.food.stock).toBe(KIT.food - 2 * view.me.upkeep.foodPerHour);
  });
});

describe('constructions', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** The warehouse, not the mine: the mine belongs to the foundation, and what a foundation
   *  placement costs and waits is nothing at all. */
  it('debits the materials and raises the building in time', async () => {
    const t = boot();
    const { creator } = await readyToLaunch(t);
    await t.mutation(api.seasons.launch, creator);
    await placeHq(t, creator);

    const opening = await t.query(api.view.playerView, creator);
    await t.mutation(api.constructions.start, {
      ...creator,
      building: 'warehouse',
      regionId: MOSELLE,
    });

    const before = await t.query(api.view.playerView, creator);
    expect(before.me.construction?.name).toBe('warehouse');
    expect(before.me.resources.steel.stock).toBe(
      opening.me.resources.steel.stock - (buildCost('warehouse', 1).steel ?? 0),
    );

    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const after = await t.query(api.view.playerView, creator);
    expect(after.me.construction).toBeNull();
    expect(after.me.buildings).toContainEqual(
      expect.objectContaining({ key: 'warehouse', regionId: MOSELLE, level: 1 }),
    );
  });

  /** A key the season still owes is placed for nothing and stands at once — no bill, no
   *  construction to wait on, and the region is still the player's to choose. */
  it('places a foundation building for nothing, standing at once', async () => {
    const t = boot();
    const { creator } = await readyToLaunch(t);
    await t.mutation(api.seasons.launch, creator);
    await placeHq(t, creator);

    const opening = await t.query(api.view.playerView, creator);
    await t.mutation(api.constructions.start, {
      ...creator,
      building: 'mine',
      regionId: MOSELLE,
    });

    const after = await t.query(api.view.playerView, creator);
    expect(after.me.construction).toBeNull();
    expect(after.me.buildings).toContainEqual(
      expect.objectContaining({ key: 'mine', regionId: MOSELLE, level: 1 }),
    );
    expect(after.me.resources.steel.stock).toBe(opening.me.resources.steel.stock);
    // La mine du charbon est soldée par une mine sur du charbon ; celle du fer reste due.
    expect(after.me.foundation).toEqual([
      { key: 'mine', deposit: 'iron' },
      { key: 'farm', deposit: 'food' },
    ]);
  });

  /** Nothing rises above the headquarters. Le QG est redevenu le premier bâtiment d'une saison
   *  (décision 1b du 13/09) ; ce que la règle gouverne reste la hauteur du reste — le niveau où
   *  il se pose, et pas un de plus. */
  it('refuses to raise a building above the headquarters', async () => {
    const t = boot();
    const { creator } = await readyToLaunch(t);
    await t.mutation(api.seasons.launch, creator);
    await unclocked(t);
    await placeHq(t, creator);
    for (let level = 1; level <= HQ_LEVEL_AT_LAUNCH; level += 1) {
      await t.mutation(api.constructions.start, {
        ...creator,
        building: 'mine',
        regionId: MOSELLE,
      });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
    }
    await expect(
      t.mutation(api.constructions.start, { ...creator, building: 'mine', regionId: MOSELLE }),
    ).rejects.toThrow('CAPPED_BY_HQ');
  });
});

describe('rest window', () => {
  it('is declared in the lobby and rejects an impossible hour', async () => {
    const t = boot();
    const { creator } = await readyToLaunch(t);
    await t.mutation(api.players.setRestWindow, { ...creator, startMinutes: 22 * 60 });
    await expect(
      t.mutation(api.players.setRestWindow, { ...creator, startMinutes: -1 }),
    ).rejects.toThrow('INVALID_REST_WINDOW');
  });

  /**
   * Seven hours, fixed (design sheet 07). The player chooses when he sleeps, never for how
   * long: a self-set duration is a self-set span of invulnerability.
   */
  it('always spans seven hours, midnight wrap included', async () => {
    const t = boot();
    const { creator } = await readyToLaunch(t);

    await t.mutation(api.players.setRestWindow, { ...creator, startMinutes: 9 * 60 });
    await t.mutation(api.seasons.launch, creator);
    expect((await t.query(api.view.playerView, creator)).me.restWindow).toEqual({
      startMinutes: 9 * 60,
      endMinutes: 16 * 60,
    });
  });

  it('wraps past midnight rather than clipping at the end of the day', async () => {
    const t = boot();
    const { creator } = await readyToLaunch(t);
    await t.mutation(api.players.setRestWindow, { ...creator, startMinutes: 23 * 60 });
    await t.mutation(api.seasons.launch, creator);
    expect((await t.query(api.view.playerView, creator)).me.restWindow).toEqual({
      startMinutes: 23 * 60,
      endMinutes: 6 * 60,
    });
  });

  /**
   * The window is public: left editable it becomes a shield one slides over an arrival one
   * has seen coming. It freezes at launch, like the nation.
   */
  it('freezes at launch', async () => {
    const t = boot();
    const { creator } = await readyToLaunch(t);
    await t.mutation(api.seasons.launch, creator);
    await expect(
      t.mutation(api.players.setRestWindow, { ...creator, startMinutes: 3 * 60 }),
    ).rejects.toThrow('REST_WINDOW_FROZEN');
  });
});

/**
 * **A concluded season writes nothing more.** Concluding does not empty the scheduler: the jobs
 * already in it wake up all the same. Without a guard, a skirmish won at noon keeps resolving
 * engagements, delivering batches and finishing sites all evening — and every measurement taken
 * after a test is measuring a game nobody was playing.
 *
 * The jobs **return**, they do not fail: Convex never retries a mutation that throws, so a
 * refusal here would sit in the dashboard as an error that is not one. Nothing is cleaned up
 * either — the rows stay exactly as they are, and `destroy` purges them whole.
 */
describe('a concluded season', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 17, 12, 0, 0));
  });
  afterEach(() => vi.useRealTimers());

  /** Romanian oil, far enough east of Moselle that the column is still walking. */
  const PRAHOVA = 'ROU-310';

  it('lets no scheduled job write once it is won', async () => {
    const t = boot();
    const { creator, guest } = await readyToLaunch(t);
    await t.mutation(api.seasons.launch, creator);

    const playerId = await playerIdOf(t, creator);
    const barracks = await t.run(async (ctx) =>
      ctx.db.insert('buildings', {
        seasonId: (await ctx.db.get(playerId))!.seasonId,
        playerId,
        key: 'barracks',
        regionId: MOSELLE,
        level: 1,
      }),
    );
    // Somebody standing at the far end, so an arrival that resolved would leave an account.
    const theirs = await playerIdOf(t, guest);
    await t.run(async (ctx) => {
      const seasonId = (await ctx.db.get(theirs))!.seasonId;
      const holding = await ctx.db.insert('buildings', {
        seasonId,
        playerId: theirs,
        key: 'barracks',
        regionId: PRAHOVA,
        level: 1,
      });
      await ctx.db.insert('troops', {
        seasonId,
        playerId: theirs,
        role: 'infantry',
        tier: 1,
        nominalStrength: nominalStrength('infantry', 1),
        currentStrength: nominalStrength('infantry', 1),
        stationedAt: holding,
      });
    });

    const marching = await t.run(async (ctx) =>
      ctx.db.insert('troops', {
        seasonId: (await ctx.db.get(playerId))!.seasonId,
        playerId,
        role: 'infantry',
        tier: 1,
        nominalStrength: nominalStrength('infantry', 1),
        currentStrength: nominalStrength('infantry', 1),
        stationedAt: barracks,
      }),
    );
    await attacking(t, {
      ...creator,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [marching],
      target: { kind: 'region', regionId: PRAHOVA },
    });

    // A batch and a site both dated after the conclusion: the two other jobs that write.
    await t.run(async (ctx) => {
      await ctx.db.insert('recruitments', {
        playerId,
        buildingId: barracks,
        role: 'infantry',
        tier: 1,
        rank: 0,
        finishesAt: Date.now() + 3_600_000,
      });
      await ctx.db.insert('constructions', {
        playerId,
        building: 'barracks',
        regionId: MOSELLE,
        level: 1,
        rank: 0,
        finishesAt: Date.now() + 3_600_000,
      });
    });

    const tables = Object.keys(schema.tables) as ReadonlyArray<TableNames>;
    await t.run(async (ctx) => {
      const season = (await ctx.db.query('seasons').first())!;
      await ctx.db.patch(season._id, {
        status: 'concluded',
        winnerId: playerId,
        concludedAt: Date.now(),
      });
    });
    const before = await dumpRows(t, tables);

    await t.finishAllScheduledFunctions(vi.runAllTimers);

    // Not "no engagement" and not "no delivery": **nothing at all**, which is the only shape
    // that still holds for a job added tomorrow.
    expect(await dumpRows(t, tables)).toEqual(before);
    expect(await t.run(async (ctx) => ctx.db.query('engagements').collect())).toEqual([]);
  });

  /** **Et la même chose par l'autre porte.** Une saison close à la main (`seasons.conclude`) est
   *  une saison close : le garde-fou lit le statut, jamais qui l'a mis là. */
  it('lets no scheduled job write once its founder has closed it', async () => {
    const t = boot();
    const { creator } = await readyToLaunch(t);
    await t.mutation(api.seasons.launch, creator);

    const playerId = await playerIdOf(t, creator);
    const barracks = await t.run(async (ctx) =>
      ctx.db.insert('buildings', {
        seasonId: (await ctx.db.get(playerId))!.seasonId,
        playerId,
        key: 'barracks',
        regionId: MOSELLE,
        level: 1,
      }),
    );
    const marching = await t.run(async (ctx) =>
      ctx.db.insert('troops', {
        seasonId: (await ctx.db.get(playerId))!.seasonId,
        playerId,
        role: 'infantry',
        tier: 1,
        nominalStrength: nominalStrength('infantry', 1),
        currentStrength: nominalStrength('infantry', 1),
        stationedAt: barracks,
      }),
    );
    await t.mutation(api.movements.marchTo, {
      ...creator,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [marching],
      point: { lon: regionFacts(PRAHOVA)!.point[0], lat: regionFacts(PRAHOVA)!.point[1] },
    });

    await t.mutation(api.seasons.conclude, creator);
    const tables = Object.keys(schema.tables) as ReadonlyArray<TableNames>;
    const before = await dumpRows(t, tables);

    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(await dumpRows(t, tables)).toEqual(before);
  });

  async function playerIdOf(t: ReturnType<typeof boot>, seat: Seat) {
    return t.run(async (ctx) => {
      const player = await seatIn(ctx, seat);
      return player._id;
    });
  }

  async function dumpRows(t: ReturnType<typeof boot>, tables: ReadonlyArray<TableNames>) {
    const dumped: Record<string, unknown> = {};
    for (const table of tables) {
      dumped[table] = await t.run(async (ctx) => ctx.db.query(table).collect());
    }
    return dumped;
  }
});

/**
 * **L'horloge est optionnelle** (révision du 27/08 de l'ADR 0017), et depuis le 31/08 elle est le
 * seul choix du fondement (ADR 0020 §11). Ce qui se vérifie ici et nulle part ailleurs : qu'une
 * saison peut naître sans horloge, et que la seule fin qu'elle a alors — la main de son
 * fondateur — refuse tout le monde d'autre.
 */
describe('a season without a clock', () => {
  it('is founded with no clock at all', async () => {
    const t = boot();
    const { seat } = await foundSeat(t, 'Pierre', 0.5);
    await setClock(t, seat.seasonId, null);
    const lobby = await t.query(api.seasons.lobby, seat);
    expect(lobby.durationHours).toBeNull();
  });

  it('is closed by its founder, by nobody else, and only once it runs', async () => {
    const t = boot();
    const { creator, guest } = await readyToLaunch(t);

    // Un salon n'a rien à clore : il se supprime (`destroy`), il ne se conclut pas.
    await expect(t.mutation(api.seasons.conclude, creator)).rejects.toThrow('SEASON_NOT_LAUNCHED');

    await t.mutation(api.seasons.launch, creator);
    /** Le doyen s'entend dire *pourquoi* il ne clôt pas : le fondateur est là. La porte
     *  s'ouvrirait pour lui après `FOUNDER_ABSENCE_HOURS` (`founder-absence.test.ts`). */
    await expect(t.mutation(api.seasons.conclude, guest)).rejects.toThrow('FOUNDER_STILL_PRESENT');

    await t.mutation(api.seasons.conclude, creator);
    const season = await t.run(async (ctx) => (await ctx.db.query('seasons').first())!);
    expect(season.status).toBe('concluded');
    // Personne n'a gagné, et le journal ne doit désigner personne.
    expect(season.winnerId).toBeNull();
    expect(season.concludedAt).not.toBeNull();

    /** Une dépêche par belligérant : c'est le seul écran qui annonce la fin. Elle arrive avec
     *  celle de l'**édition finale** — la conclusion écrit un dernier classement avant de fermer
     *  (`convex/press.ts`), et une édition dépose sa convocation chez chacun comme les autres.
     *  La une des Sept du lancement (`pointsDrawn`) est la seule autre. */
    const notices = await t.run(async (ctx) => ctx.db.query('notices').collect());
    expect(notices.map((notice) => notice.kind).sort()).toEqual([
      'editionPublished',
      'editionPublished',
      'pointsDrawn',
      'pointsDrawn',
      'seasonClosed',
      'seasonClosed',
    ]);

    // Elle se relit, elle ne se joue plus.
    await expect(
      t.mutation(api.constructions.start, {
        ...creator,
        building: 'barracks',
        regionId: MOSELLE,
      }),
    ).rejects.toThrow('SEASON_CONCLUDED');
    expect((await t.query(api.view.playerView, creator)).season.outcome.concludedAt).not.toBeNull();
  });
});

describe('scrapping a season', () => {
  it('belongs to the founder and leaves nothing behind', async () => {
    const t = boot();
    const { creator, guest } = await readyToLaunch(t);
    await t.mutation(api.seasons.launch, creator);

    await expect(t.mutation(api.seasons.destroy, guest)).rejects.toThrow('CREATOR_ONLY');
    await t.mutation(api.seasons.destroy, creator);

    // Neither seat answers any more — which is what sends every player home.
    await expect(t.query(api.seasons.lobby, creator)).rejects.toThrow('NO_SEAT');
    await expect(t.query(api.seasons.lobby, guest)).rejects.toThrow('NO_SEAT');
    // And the home screen simply lists one game fewer: a scrapped season is not an error.
    expect(await seatsOf(t, creator)).toEqual([]);
    expect(await seatsOf(t, guest)).toEqual([]);
  });

  /**
   * **The purge is checked against the exhaustive game partition.** A table that `erasePlayer`
   * forgets leaves rows nobody can reach — no game seat names them and no season owns them. The
   * season below is the widest one the game can produce today: a march, an outpost, an engagement,
   * a sighting, a queue and a lot.
   *
   * Every game table is empty afterward. Accounts and sessions belong to the durable identity
   * partition and are covered by `auth.test.ts` instead.
   */
  describe('a season that used every game table', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 7, 17, 12, 0, 0));
    });
    afterEach(() => vi.useRealTimers());

    /** Romanian oil, far enough east of the Marne for the road to be worth watching. */
    const PRAHOVA = 'ROU-310';
    /** Ar Riyad: neutral, and nowhere near the road — an outpost planted for its own sake. */
    const RIYADH = 'SAU-1097';

    const pointOf = (regionId: string): LonLat => regionFacts(regionId)!.point;
    const asPoint = (point: LonLat) => ({ lon: point[0], lat: point[1] });

    async function playerOf(t: ReturnType<typeof boot>, seat: Seat) {
      return t.run(async (ctx) => {
        const player = await seatIn(ctx, seat);
        return player._id;
      });
    }

    async function raise(t: ReturnType<typeof boot>, seat: Seat, regionId: string) {
      const playerId = await playerOf(t, seat);
      return t.run(async (ctx) =>
        ctx.db.insert('buildings', {
          seasonId: (await ctx.db.get(playerId))!.seasonId,
          playerId,
          key: 'barracks',
          regionId,
          level: 1,
        }),
      );
    }

    async function form(
      t: ReturnType<typeof boot>,
      seat: Seat,
      stationedAt: Id<'buildings'> | { lon: number; lat: number } | null,
    ) {
      const playerId = await playerOf(t, seat);
      const strength = nominalStrength('infantry', 1);
      return t.run(async (ctx) =>
        ctx.db.insert('troops', {
          seasonId: (await ctx.db.get(playerId))!.seasonId,
          playerId,
          role: 'infantry',
          tier: 1,
          nominalStrength: strength,
          currentStrength: strength,
          stationedAt,
        }),
      );
    }

    it('leaves not one row behind, in any table of the schema', async () => {
      const t = boot();
      const { creator, guest } = await readyToLaunch(t);
      await t.mutation(api.seasons.launch, creator);
      await unclocked(t);

      // A sentry of the guest's, forty kilometres off the road the column will walk: close
      // enough to file a sighting, far enough not to meet anybody.
      const road = routeBetween(pointOf(MOSELLE), pointOf(PRAHOVA), 'land')!;
      const halfway = road.points[Math.floor(road.points.length / 2)]!;
      const camp: LonLat = [
        halfway[0] + 40 / (111.32 * Math.cos((halfway[1] * Math.PI) / 180)),
        halfway[1],
      ];
      expect(
        road.points.reduce((closest, step) => Math.min(closest, distanceKm(step, camp)), Infinity),
      ).toBeLessThan(DETECTION_RANGE_KM.infantry);
      await form(t, guest, asPoint(camp));

      // Somebody to meet at the far end, so an account gets filed.
      const theirs = await raise(t, guest, PRAHOVA);
      await form(t, guest, theirs);

      const barracks = await raise(t, creator, MOSELLE);
      await attacking(t, {
        ...creator,
        origin: { kind: 'building', buildingId: barracks },
        troopIds: [await form(t, creator, barracks)],
        target: { kind: 'region', regionId: PRAHOVA },
      });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      expect(await t.run(async (ctx) => ctx.db.query('engagements').collect())).toHaveLength(1);

      // An outpost, planted where a column of its own stands. It is paid in food now.
      await t.run(async (ctx) => {
        const player = await seatIn(ctx, creator);
        const rows = await ctx.db
          .query('resources')
          .withIndex('byPlayer', (q) => q.eq('playerId', player._id))
          .collect();
        for (const row of rows) {
          if (row.key === 'food')
            await ctx.db.patch(row._id, { stock: 1_000, updatedAt: Date.now() });
        }
      });
      const desert = pointOf(RIYADH);
      await t.mutation(api.movements.foundOutpostHere, {
        regionId: null,
        ...creator,
        point: asPoint(desert),
        specialization: 'relay',
        troopIds: [await form(t, creator, asPoint(desert))],
      });

      // And a second column still on the road when the season is scrapped, watched by the
      // same sentry: a live movement, and the sightings that go with it.
      await attacking(t, {
        ...creator,
        origin: { kind: 'building', buildingId: barracks },
        troopIds: [await form(t, creator, barracks)],
        target: { kind: 'region', regionId: PRAHOVA },
      });

      // A queue, a lot, a construction and a notice, put down without paying for them: what is
      // under test is the purge, not the economy that would have fed them.
      const playerId = await playerOf(t, creator);
      const guestId = await playerOf(t, guest);
      await t.run(async (ctx) => {
        const player = (await ctx.db.get(playerId))!;
        const engagement = (await ctx.db.query('engagements').first())!;
        const empty = {
          food: 0,
          coal: 0,
          oil: 0,
          steel: 0,
          ammunition: 0,
        };
        const reportId = await ctx.db.insert('plunderReports', {
          seasonId: player.seasonId,
          attackerId: playerId,
          defenderId: guestId,
          buildingId: theirs,
          building: 'barracks',
          regionId: PRAHOVA,
          hostCountry: 'ROU',
          at: Date.now(),
          disabledUntil: Date.now() + 3_600_000,
          engagementId: engagement._id,
          taken: empty,
          storageLost: empty,
        });
        await ctx.db.insert('captures', {
          seasonId: player.seasonId,
          playerId,
          defenderId: guestId,
          target: { kind: 'building', buildingId: theirs },
          site: { kind: 'building', building: 'barracks', regionId: PRAHOVA },
          point: asPoint(pointOf(PRAHOVA)),
          progress: 0,
          progressAt: Date.now(),
          rate: 1,
          durationMs: 3_600_000,
          rest: null,
          completesAt: Date.now() + 3_600_000,
        });
        const recoveryId = await ctx.db.insert('lootRecoveries', {
          seasonId: player.seasonId,
          engagementId: engagement._id,
          dispossessedPlayerId: guestId,
          recoveringPlayerId: playerId,
          point: asPoint(pointOf(PRAHOVA)),
          at: Date.now(),
          sourcePlunderReportId: reportId,
          recovered: empty,
          remainder: { ...empty, food: 1 },
        });
        const { materializeRecoveryRemainder } = await import('./crateStock');
        const crateId = await materializeRecoveryRemainder(ctx, recoveryId);
        if (crateId === null) throw new Error('loot crate not materialized');
        const crate = (await ctx.db.get(crateId))!;
        const sighting = await ctx.db
          .query('lootCrateSightings')
          .withIndex('byPlayerCrate', (q) => q.eq('playerId', playerId).eq('crateId', crateId))
          .unique();
        if (sighting === null) {
          await ctx.db.insert('lootCrateSightings', {
            seasonId: player.seasonId,
            playerId,
            crateId,
            point: crate.point,
            loot: crate.loot,
            seenAt: Date.now(),
            present: true,
            current: false,
          });
        }
        const carrier = await ctx.db
          .query('troops')
          .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
          .first();
        if (carrier === null) throw new Error('carrier not found');
        const movement = await ctx.db
          .query('movements')
          .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
          .first();
        if (movement === null) throw new Error('movement not found');
        const collectionId = await ctx.db.insert('lootCollections', {
          seasonId: player.seasonId,
          collectorPlayerId: playerId,
          sourceCrateId: crateId,
          sourceRecoveryId: recoveryId,
          movementId: movement._id,
          at: Date.now(),
          collected: { ...empty, food: 1 },
        });
        await ctx.db.insert('stationedLoot', {
          seasonId: player.seasonId,
          playerId,
          troopIds: [carrier._id],
          stationedAt: carrier.stationedAt,
          loot: { ...empty, food: 1 },
          collectionId,
        });
        /** Un camp relevé : le jumeau immobile du relevé de fil, et une table comme une autre. */
        await ctx.db.insert('campSightings', {
          playerId,
          seasonId: player.seasonId,
          stationKey: `${playerId}@0,0`,
          ownerId: playerId,
          point: { lon: 0, lat: 0 },
          medium: 'land',
          since: Date.now(),
          until: null,
          detector: 'troop',
          detectorId: null,
          detectorRegion: null,
          noticeFiled: true,
        });
        await ctx.db.insert('recruitments', {
          playerId,
          buildingId: barracks,
          role: 'infantry',
          tier: 1,
          rank: 0,
          finishesAt: Date.now() + 3_600_000,
        });
        await ctx.db.insert('orders', {
          playerId,
          chain: 'arsenal',
          ordered: 200,
          produced: 0,
          placedAt: Date.now(),
        });
        await ctx.db.insert('constructions', {
          playerId,
          building: 'barracks',
          regionId: MOSELLE,
          level: 1,
          rank: 0,
          finishesAt: Date.now() + 3_600_000,
        });
        await ctx.db.insert('notices', {
          playerId,
          at: Date.now(),
          kind: 'constructionCancelled',
          building: 'farm',
          regionId: MOSELLE,
        });
      });

      // And one line of the telegraph: the channel is a table of the season like any other.
      await t.mutation(api.messages.post, { ...creator, text: 'je marche sur Prahova' });

      // The notification queue hangs from the season, the heartbeat from the player.
      await t.mutation(api.notifications.present, creator);
      await t.mutation(api.messages.markRead, creator);
      await t.run(async (ctx) => {
        const seat = await seatIn(ctx, creator);
        await ctx.db.insert('pushQueue', {
          accountId: seat.accountId!,
          seasonId: seat.seasonId,
          type: 'attack',
          at: Date.now(),
          phrase: 'une passe',
          label: 'une passe',
          url: '/plateau?windows=journal',
        });
      });

      const tables = GAME_TABLES as ReadonlyArray<TableNames>;
      const before = await countRows(t, tables);
      // Every table carries something, or the emptiness below proves nothing about it.
      expect(Object.entries(before).filter(([, rows]) => rows === 0)).toEqual([]);

      await t.mutation(api.seasons.destroy, creator);

      const after = await countRows(t, tables);
      expect(after).toEqual(Object.fromEntries(tables.map((table) => [table, 0])));
    });

    async function countRows(
      t: ReturnType<typeof boot>,
      tables: ReadonlyArray<TableNames>,
    ): Promise<Record<string, number>> {
      const counted: Record<string, number> = {};
      for (const table of tables) {
        counted[table] = await t.run(async (ctx) => (await ctx.db.query(table).collect()).length);
      }
      return counted;
    }
  });
});
