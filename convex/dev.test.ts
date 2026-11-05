import { convexTest } from 'convex-test';
import { describe, expect, it, vi } from 'vitest';
import { internal } from './_generated/api';
import { GAME_TABLES } from './dev';
import schema from './schema';
import { modules } from './test.setup';
import { foundSeat, joinSeat, placeHq, seatIn } from './seats.fixture';
import { api } from './_generated/api';
import { outpostReachKm } from './constants';
import { liaisonsOf } from '../src/domain/outposts';
import { worksMinutes } from '../src/domain/level-speed';
import { levelOf, playerBuildings } from './buildingReads';
import type { Id } from './_generated/dataModel';
import { distanceKm } from '../src/domain/geo';

const buildingsOf = (t: ReturnType<typeof convexTest>, playerId: Id<'players'>) =>
  t.run(async (ctx) => playerBuildings(ctx, playerId));

describe('dev.reset', () => {
  it('empties every game table, however many documents, and cancels pending jobs', async () => {
    const t = convexTest({ schema, modules });
    const { seat } = await foundSeat(t, 'Pierre', 0.5);
    await t.run(async (ctx) => {
      const player = await ctx.db
        .query('players')
        .withIndex('bySeason', (q) => q.eq('seasonId', seat.seasonId))
        .first();
      for (let k = 0; k < 450; k++)
        await ctx.db.insert('notices', {
          playerId: player!._id,
          at: k,
          kind: 'outpostFounded',
          hostCountry: 'BEL',
          point: { lon: 4, lat: 50 },
        });
      await ctx.scheduler.runAfter(60_000, internal.press.publish, { playerId: player!._id });
    });

    await t.action(internal.dev.reset, {});

    await t.run(async (ctx) => {
      for (const table of GAME_TABLES) expect(await ctx.db.query(table).first()).toBeNull();
      expect(await ctx.db.query('accounts').first()).not.toBeNull();
      const jobs = await ctx.db.system.query('_scheduled_functions').collect();
      expect(jobs.filter((job) => job.state.kind === 'pending')).toEqual([]);
    });
  });
});

async function twoNations() {
  const t = convexTest({ schema, modules });
  const { seat, code } = await foundSeat(t, 'Pierre', 0.5);
  const guest = await joinSeat(t, code, 'Léa');
  await t.mutation(api.players.reserveNation, { ...seat, nation: 'france' });
  await t.mutation(api.players.declareReady, { ...seat, ready: true });
  await t.mutation(api.players.reserveNation, { ...guest, nation: 'uk' });
  await t.mutation(api.players.declareReady, { ...guest, ready: true });
  await t.mutation(api.seasons.launch, seat);
  const playerId = await t.run(async (ctx) => (await seatIn(ctx, seat))._id);
  return { t, seat, guest, playerId };
}

describe('dev.spawnTroops', () => {
  it('stands a rank 2 at its own strength, and refuses a rank the role does not have', async () => {
    const { t, playerId } = await twoNations();
    const at = { lon: 2.3, lat: 48.8 };
    await t.mutation(internal.dev.spawnTroops, {
      playerId,
      role: 'infantry',
      count: 1,
      tier: 2,
      ...at,
    });
    await t.mutation(internal.dev.spawnTroops, {
      playerId,
      role: 'armor',
      count: 1,
      tier: 2,
      ...at,
    });
    await t.mutation(internal.dev.spawnTroops, { playerId, role: 'armor', count: 1, ...at });
    const spawned = await t.run((ctx) =>
      ctx.db
        .query('troops')
        .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
        .collect(),
    );
    const rank = (role: string, tier: number) =>
      spawned.find((troop) => troop.role === role && troop.tier === tier);
    expect(rank('infantry', 2)).toMatchObject({ nominalStrength: 30, currentStrength: 30 });
    expect(rank('armor', 2)).toMatchObject({ nominalStrength: 6 });
    expect(rank('armor', 1)).toMatchObject({ nominalStrength: 12 });
    await expect(
      t.mutation(internal.dev.spawnTroops, {
        playerId,
        role: 'artillery',
        count: 1,
        tier: 2,
        ...at,
      }),
    ).rejects.toThrow('no tier 2');
  });
});

describe('dev.finishRecruitments', () => {
  it('brings a queued rank 2 out of its barracks now, not at the end of its training', async () => {
    vi.useFakeTimers();
    try {
      const { t, seat, playerId } = await twoNations();
      await placeHq(t, seat);
      const regionId = 'FRA-5323';
      const barracks = await t.run(async (ctx) => {
        const player = (await ctx.db.get(playerId))!;
        await ctx.db.patch(playerId, { researched: ['infantryMk2'] });
        return ctx.db.insert('buildings', {
          seasonId: player.seasonId,
          playerId,
          key: 'barracks',
          regionId,
          point: { lon: 4.1, lat: 49.0 },
          level: 1,
        });
      });
      await t.mutation(internal.dev.fillStocks, { seasonId: seat.seasonId, stock: 4000 });
      await t.mutation(api.troops.recruit, {
        ...seat,
        buildingId: barracks,
        role: 'infantry',
        tier: 2,
      });
      const standing = () =>
        t.run(async (ctx) =>
          (
            await ctx.db
              .query('troops')
              .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
              .collect()
          ).filter((troop) => troop.tier === 2),
        );
      expect(await standing()).toHaveLength(0);

      expect(await t.mutation(internal.dev.finishRecruitments, { playerId })).toBe(1);
      await vi.advanceTimersByTimeAsync(1);
      await t.finishInProgressScheduledFunctions();

      const [recruit] = await standing();
      expect(recruit).toMatchObject({ role: 'infantry', tier: 2, stationedAt: barracks });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('dev scenes read by the capture', () => {
  it('stands a review of every nation at its own capital', async () => {
    const { t, seat } = await twoNations();
    const capitals = await t.mutation(internal.dev.reviewScene, { seasonId: seat.seasonId });
    expect(Object.keys(capitals).sort()).toEqual(['france', 'uk']);
    const standing = await t.run((ctx) => ctx.db.query('troops').collect());
    for (const [nation, [lon, lat]] of Object.entries(capitals)) {
      const there = standing.filter(
        (troop) =>
          troop.stationedAt !== null &&
          typeof troop.stationedAt === 'object' &&
          'lon' in troop.stationedAt &&
          troop.stationedAt.lon === lon &&
          troop.stationedAt.lat === lat,
      );
      expect(there.map((troop) => troop.role).sort(), nation).toEqual([
        'armor',
        'infantry',
        'infantry',
      ]);
    }
  });

  it('puts a mine out of every outpost reach, which the view says', async () => {
    const { t, seat, playerId } = await twoNations();
    const at = await t.mutation(internal.dev.unreachedMineScene, { playerId });
    const view = await t.query(api.view.playerView, seat);
    expect(view.me.buildings.find((building) => building.key === 'mine')).toMatchObject({
      point: at,
      unreached: true,
    });
    expect(view.me.buildings.find((building) => building.key === 'hq')?.unreached).toBeUndefined();
  });
});

describe('dev.absenceScene', () => {
  it('opens a fresh absence: both marks behind the dispatches, first steps passed, a dozen placed near the capital', async () => {
    const { t, seat, playerId } = await twoNations();
    await t.mutation(api.journal.markToured, seat);
    await t.mutation(api.journal.markRead, seat);
    const capital = await t.mutation(internal.dev.absenceScene, { playerId });
    const view = await t.query(api.view.playerView, seat);
    expect(view.absenceTourAt).toBeNull();
    expect(view.firstSteps.shown).toBe('skipped');
    const fresh = view.notices.filter((notice) => notice.at > (view.journalReadAt ?? 0));
    expect(fresh).toHaveLength(12);
    for (const notice of fresh) {
      expect(notice.place).not.toBeNull();
      expect(distanceKm(capital, [notice.place!.lon, notice.place!.lat])).toBeLessThan(250);
    }
    expect(new Set(fresh.map((notice) => notice.kind)).size).toBeGreaterThan(3);
  });
});

describe('dev.levelsScene', () => {
  it('keeps the cards the player already holds', async () => {
    const { t, playerId } = await twoNations();
    await t.mutation(internal.dev.grantCards, { playerId, cards: ['infantryMk2'] });

    await t.mutation(internal.dev.levelsScene, { playerId });

    const { researched } = (await t.run((ctx) => ctx.db.get(playerId)))!;
    expect(researched).toEqual(['infantryMk2', 'transmissions1', 'transmissions2']);
  });
});

describe('dev.liaisonsScene', () => {
  /** La scène de #370 : deux points en liaison, un seul, et, sans charbon, des vigies aveugles. */
  it('sets two outposts in liaison, one alone, and blinds the lookouts without coal', async () => {
    const { t, seat, playerId } = await twoNations();
    await t.mutation(internal.dev.liaisonsScene, { playerId, dryCoal: true });

    const { me } = await t.query(api.view.playerView, seat);
    expect(me.outposts.map((outpost) => outpost.specialty)).toEqual([
      'general',
      'general',
      'general',
    ]);
    expect(me.upkeep.listeningCoalPerHour).toBe(3);
    expect(me.upkeep.listeningSilent).toBe(true);
    const points = me.outposts.map((outpost) => ({
      id: outpost.id,
      point: outpost.lonLat,
      reachKm: outpostReachKm(outpost.level),
    }));
    const pairs = liaisonsOf(points);
    expect(pairs).toHaveLength(1);
    const alone = points.find((point) => !pairs[0]!.includes(point.id));
    expect(alone!.point).toEqual([7.59, 47.56]);
  });
});

describe('dev.specialtiesScene', () => {
  /** La scène de #371 : un point à élever, un ancien qui choisit, un Magasin qui change, un Guet. */
  it('sets a point to raise, an old generalist, a changing Magasin and a Guet', async () => {
    const { t, seat, playerId } = await twoNations();
    await t.mutation(internal.dev.specialtiesScene, { playerId });

    const { me } = await t.query(api.view.playerView, seat);
    expect(
      me.outposts.map(({ level, specialty, changingTo, depotCapacity }) => ({
        level,
        specialty,
        changingTo,
        depotCapacity,
      })),
    ).toEqual([
      { level: 1, specialty: 'general', changingTo: null, depotCapacity: 400 },
      { level: 2, specialty: 'general', changingTo: null, depotCapacity: 800 },
      { level: 2, specialty: 'store', changingTo: 'lookout', depotCapacity: 800 },
      { level: 2, specialty: 'lookout', changingTo: null, depotCapacity: 800 },
    ]);
    expect(me.construction).toMatchObject({
      specialty: 'lookout',
      respecialize: true,
      minutes: worksMinutes('outpost', 2, levelOf(await buildingsOf(t, playerId), 'hq')),
    });
  });

  /** Avec un chantier déjà en cours (`--chantiers`), le changement attend son tour : un seul
   *  chantier à la fois, et il agit encore en Magasin tant qu'il n'est pas parti. */
  it('queues the change behind a running works rather than running two', async () => {
    const { t, seat, playerId } = await twoNations();
    await t.run(async (ctx) => {
      await ctx.db.insert('constructions', {
        playerId,
        building: 'farm',
        regionId: 'FRA-5312',
        level: 1,
        rank: 0,
        finishesAt: Date.now() + 3_600_000,
        point: { lon: 5.9, lat: 46.7 },
      });
    });
    await t.mutation(internal.dev.specialtiesScene, { playerId });

    const { me } = await t.query(api.view.playerView, seat);
    expect(me.construction).toMatchObject({ key: 'farm' });
    expect(me.constructionQueue).toMatchObject([{ specialty: 'lookout', respecialize: true }]);
    expect(me.outposts[2]).toMatchObject({ specialty: 'store', changingTo: null });
  });
});

describe('dev.guetScene', () => {
  /** La scène de #373 : un Guet qui lit une colonne, un camp et un souvenir ; un généraliste non. */
  it('lets the Guet read a column, a camp and a last known position, and the generalist none', async () => {
    const { t, seat, playerId } = await twoNations();
    const enemyId = await t.run(
      async (ctx) =>
        (await ctx.db.query('players').collect()).find((player) => player._id !== playerId)!._id,
    );
    await t.mutation(internal.dev.guetScene, { playerId, enemyId });

    const view = await t.query(api.view.playerView, seat);
    expect(view.detected.map((arc) => arc.identification)).toEqual([
      { pierced: true, stack: { infantry: 3, armor: 1 }, readAt: null },
    ]);
    const camps = view.camps.map(({ lastKnown, identification }) => ({
      lastKnown,
      identification,
    }));
    expect(camps).toEqual(
      expect.arrayContaining([
        {
          lastKnown: false,
          identification: { pierced: true, stack: { infantry: 2, artillery: 1 }, readAt: null },
        },
        {
          lastKnown: true,
          identification: {
            pierced: true,
            stack: { infantry: 1, armor: 1 },
            readAt: expect.any(Number),
          },
        },
        { lastKnown: false, identification: { pierced: false } },
      ]),
    );
  });
});

describe('dev.watchLineScene', () => {
  /** La scène de #377 : une colonne que la seule ligne de la ronde Sedan–Nancy a relevée. */
  it('sights the column by the patrol line alone, its dispatch due', async () => {
    const { t, seat, playerId } = await twoNations();
    const enemyId = await t.run(
      async (ctx) =>
        (await ctx.db.query('players').collect()).find((player) => player._id !== playerId)!._id,
    );
    await t.mutation(internal.dev.watchLineScene, { playerId, enemyId });

    const view = await t.query(api.view.playerView, seat);
    expect(view.detected.map((arc) => arc.detector)).toEqual(['patrol']);
    const [row] = await t.run(async (ctx) =>
      ctx.db
        .query('sightings')
        .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
        .collect(),
    );
    const [crossing] = row!.crossings!;
    expect(crossing!.at).toBeLessThan(Date.now());
    await t.mutation(internal.movements.fileCrossing, {
      sightingId: row!._id,
      troopId: crossing!.troopId,
      at: crossing!.at,
    });
    const notices = await t.run(async (ctx) =>
      (await ctx.db.query('notices').collect()).filter((one) => one.kind === 'movementSighted'),
    );
    expect(notices).toMatchObject([{ playerId, detector: 'patrol' }]);
  });
});

describe('dev.twoSentriesScene', () => {
  /** La scène de #412 : une colonne dans le trou entre deux vigies, puis sous la seconde. */
  it.each([false, true])('serves one stretch of the column, reappeared: %s', async (reappeared) => {
    const { t, seat, playerId } = await twoNations();
    const enemyId = await t.run(
      async (ctx) =>
        (await ctx.db.query('players').collect()).find((player) => player._id !== playerId)!._id,
    );
    await t.mutation(internal.dev.twoSentriesScene, { playerId, enemyId, reappeared });
    const [row] = await t.run(async (ctx) =>
      ctx.db
        .query('sightings')
        .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
        .collect(),
    );
    const [first, second] = row!.windows!;
    const [arc] = (await t.query(api.view.playerView, seat)).detected;
    expect(arc!.seenFrom).toBe((reappeared ? second : first)!.from);
    expect(Date.now()).toBeGreaterThan(first!.to);
    expect(Date.now() > second!.from).toBe(reappeared);
  });
});

describe('dev.twoSentriesScene, reappeared', () => {
  /** **La dépêche tardive** : relue au départ, la ligne a deux rendez-vous échus ; la
   *  réapparition peut élaguer le premier tronçon avant que la dépêche ne parte. Elle se dit
   *  quand même à sa date, sous Cologne, jamais sous Erfurt. */
  it('words the dispatch at its own date when the reappearance woke first', async () => {
    const { t, playerId } = await twoNations();
    const enemyId = await t.run(
      async (ctx) =>
        (await ctx.db.query('players').collect()).find((player) => player._id !== playerId)!._id,
    );
    await t.mutation(internal.dev.twoSentriesScene, { playerId, enemyId, reappeared: true });
    const row = async () =>
      (
        await t.run(async (ctx) =>
          ctx.db
            .query('sightings')
            .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
            .collect(),
        )
      )[0]!;
    const before = await row();
    await t.mutation(internal.movements.wakeSighting, {
      sightingId: before._id,
      expectedAt: before.openJobAt!,
    });
    expect((await row()).windows).toEqual([before.windows![1]]);
    await t.mutation(internal.movements.revealSighting, { sightingId: before._id });

    const [dispatch] = await t.run(async (ctx) =>
      (await ctx.db.query('notices').collect()).filter((one) => one.kind === 'movementSighted'),
    );
    expect(dispatch!.at).toBe(before.from);
    const point: [number, number] = [dispatch!.point!.lon, dispatch!.point!.lat];
    expect(distanceKm(point, [6.96, 50.94])).toBeLessThan(100);
    expect(distanceKm(point, [11.03, 50.98])).toBeGreaterThan(200);
  });
});

describe('dev.storesScene', () => {
  /** La scène de #372 : deux colonnes à sec traversent un Magasin plein et un presque vide. */
  it('lands two dry columns through a full and a nearly empty Magasin, and files what each took', async () => {
    vi.useFakeTimers();
    const { t, playerId } = await twoNations();
    await t.mutation(internal.dev.storesScene, { playerId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const notices = await t.run(async (ctx) =>
      (await ctx.db.query('notices').collect()).filter((one) => one.kind === 'storeResupplied'),
    );
    expect(notices.map((one) => [one.hostCountry, one.outcome])).toEqual(
      expect.arrayContaining([
        ['CHE', 'served'],
        ['AUT', 'short'],
      ]),
    );
    vi.useRealTimers();
  });
});

describe('dev.fortScene', () => {
  /** La scène de #374 : une colonne adverse retenue à Namur, une française qui passe le Fort sec. */
  it('holds the enemy column at Namur thirty seconds on, and not the one by the dry Fort', async () => {
    vi.useFakeTimers();
    const { t, playerId } = await twoNations();
    const enemyId = await t.run(
      async (ctx) =>
        (await ctx.db.query('players').collect()).find((one) => one._id !== playerId)!._id,
    );
    await t.mutation(internal.dev.fortScene, { playerId, enemyId });

    const columns = await t.run(async (ctx) => ctx.db.query('movements').collect());
    const held = columns.find((one) => one.playerId === enemyId)!;
    expect(held.fortEntry!.at - Date.now()).toBeGreaterThan(25_000);
    expect(held.fortEntry!.at - Date.now()).toBeLessThan(35_000);
    expect(columns.find((one) => one.playerId === playerId)!.fortEntry).toBeUndefined();

    vi.setSystemTime(held.fortEntry!.at);
    await t.mutation(internal.movements.holdAtFort, {
      movementId: held._id,
      expectedAt: held.fortEntry!.at,
    });
    const kinds = await t.run(async (ctx) =>
      (await ctx.db.query('notices').collect()).map((one) => one.kind),
    );
    expect(kinds).toEqual(expect.arrayContaining(['fortHeld', 'fortSlowed']));
    vi.useRealTimers();
  });
});

describe('dev.backfillListeningSilent', () => {
  /** Une base d'avant le champ : le joueur déjà muet n'a pas `listeningSilent`, lu « entend ». */
  it('re-reads every belligerent of a launched season, and writes the silent one silent', async () => {
    vi.useFakeTimers();
    const { t, playerId } = await twoNations();
    await t.run(async (ctx) => {
      const player = (await ctx.db.get(playerId))!;
      await ctx.db.insert('outposts', {
        seasonId: player.seasonId,
        playerId,
        point: { lon: 26, lat: 45 },
        hostCountry: 'ROU',
        level: 1,
        foundedAt: Date.now() - 1,
        disabledUntil: null,
        immuneUntil: null,
      });
      for (const row of await ctx.db
        .query('resources')
        .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
        .collect())
        if (row.key === 'coal') await ctx.db.patch(row._id, { stock: 0, updatedAt: Date.now() });
      await ctx.db.patch(playerId, { listeningSilent: undefined });
    });

    expect(await t.mutation(internal.dev.backfillListeningSilent, {})).toEqual({ players: 2 });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect((await t.run((ctx) => ctx.db.get(playerId)))!.listeningSilent).toBe(true);
    vi.useRealTimers();
  });
});

describe('dev.takingScene', () => {
  /** La scène de #279 : deux raids tenus au site, qui s'achèvent à leur heure. */
  it('holds a plunder and a sabotage at their sites, and lets each complete on time', async () => {
    vi.useFakeTimers();
    try {
      const { t, playerId } = await twoNations();
      const enemyId = await t.run(
        async (ctx) =>
          (await ctx.db.query('players').collect()).find((player) => player._id !== playerId)!._id,
      );
      const places = await t.mutation(internal.dev.takingScene, {
        playerId,
        enemyId,
        captureInMs: 60_000,
        crateInMs: 30_000,
        raidInMs: 90_000,
      });
      // Each site its own region: two on one point stand on each other.
      const sites = [places.prise, places.pillage, places.sabotage].map(String);
      expect(new Set(sites).size).toBe(3);
      const raids = () =>
        t.run(async (ctx) =>
          (await ctx.db.query('movements').collect()).filter((m) => m.plunder !== undefined),
        );
      expect((await raids()).map((m) => m.plunder?.phase)).toEqual(['presence', 'presence']);
      vi.advanceTimersByTime(110_001);
      await t.finishInProgressScheduledFunctions();
      const reports = await t.run(async (ctx) =>
        Promise.all(
          (await ctx.db.query('plunderReports').collect()).map(
            async (report) => (await ctx.db.get(report.buildingId))?.key,
          ),
        ),
      );
      expect(reports.sort()).toEqual(['mine', 'warehouse']);
      // Each raid leaves by a column home: one that stays where it raided cues nothing.
      const homes = await t.run(async (ctx) =>
        (await ctx.db.query('movements').collect())
          .filter((m) => m.type === 'return')
          .map((m) => String([m.from.lon, m.from.lat])),
      );
      expect(homes).toEqual(expect.arrayContaining([places.pillage, places.sabotage].map(String)));
    } finally {
      vi.useRealTimers();
    }
  });
});

/** **Les grands moments, à la demande** (#442) : une prise qui s'achève par la porte du jeu, et
 *  la course qui se clôt, de quoi voir le cachet, la chute d'un QG et la victoire aux points. */
describe('dev.captureSoon and dev.raceEndsSoon', () => {
  it('takes a point, then a headquarters, at their hour', async () => {
    vi.useFakeTimers();
    try {
      const { t, seat, guest, playerId } = await twoNations();
      await placeHq(t, guest);
      const guestId = await t.run(async (ctx) => (await seatIn(ctx, guest))._id);
      for (const key of ['narvik', 'baku', 'istanbul'] as const)
        await t.mutation(internal.dev.holdPoint, { playerId, key });
      await t.mutation(internal.dev.captureSoon, { playerId, point: 'tangier', inSeconds: 5 });
      vi.advanceTimersByTime(5_000);
      await t.finishInProgressScheduledFunctions();
      const taken = await t.query(api.view.playerView, seat);
      expect(taken.notices.find((notice) => notice.kind === 'pointTaken')).toMatchObject({
        key: 'tangier',
        held: 4,
      });
      expect(taken.season.race?.leaderNation).toBe('france');

      await t.mutation(internal.dev.captureSoon, { playerId, hqOf: guestId, inSeconds: 2 });
      vi.advanceTimersByTime(2_000);
      await t.finishInProgressScheduledFunctions();
      const fallen = await t.run((ctx) => ctx.db.get(guestId));
      expect(fallen?.eliminatedAt).toEqual(expect.any(Number));
    } finally {
      vi.useRealTimers();
    }
  });

  it('closes the race on points at its hour', async () => {
    vi.useFakeTimers();
    try {
      const { t, seat, playerId } = await twoNations();
      for (const key of ['narvik', 'baku', 'istanbul', 'tangier'] as const)
        await t.mutation(internal.dev.holdPoint, { playerId, key });
      await t.mutation(internal.dev.raceEndsSoon, { seasonId: seat.seasonId, inSeconds: 3 });
      vi.advanceTimersByTime(3_000);
      await t.finishInProgressScheduledFunctions();
      const season = await t.run((ctx) => ctx.db.get(seat.seasonId));
      expect(season).toMatchObject({ status: 'concluded', verdict: { reason: 'points' } });
    } finally {
      vi.useRealTimers();
    }
  });
});
