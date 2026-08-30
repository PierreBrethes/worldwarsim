import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { distanceKm, type LonLat } from '../src/domain/geo';
import type { BuildingKey, UnitRole } from '../src/domain/ids';
import { REST_WINDOW_MINUTES, SCOUT_RADIUS_KM, nominalStrength } from './constants';
import { regionFacts } from './regions';
import { routeBetween } from './routes';
import schema from './schema';
import { modules } from './test.setup';

/**
 * **Le journal dit ce qui s'est passé, et c'est le job qui l'écrit.** Une notice par événement,
 * pour le bon joueur, au moment où l'événement a lieu — jamais dérivée à la lecture, sinon le
 * journal répondrait « ce qui est vrai maintenant » et non « ce qui a changé depuis ma dernière
 * visite », qui est la boucle de retour d'un jeu asynchrone.
 *
 * Un test par sorte, et pour le relevé un test de plus : **il n'existe que chez l'observateur**.
 * C'est la seule sorte dont la fuite serait un défaut de brouillard et pas un défaut d'écran.
 */
const boot = () => convexTest(schema, modules);

const MARNE = 'FRA-5323';
const PRAHOVA = 'ROU-310';
const PSKOV = 'RUS-2335'; // Soviet: somebody sleeps there, which is what stalls an arrival.

/** Away from anyone's rest window, so nothing waits at a border unless a test asks it to. */
const MIDDAY = new Date(2026, 7, 17, 12, 0, 0);

const asPoint = (point: LonLat) => ({ lon: point[0], lat: point[1] });
const pointOf = (regionId: string): LonLat => regionFacts(regionId)!.point;
const eastOf = (point: LonLat, km: number): LonLat => [
  point[0] + km / (111.32 * Math.cos((point[1] * Math.PI) / 180)),
  point[1],
];

async function launchedSeason(t: ReturnType<typeof boot>) {
  const { code, token } = await t.mutation(api.seasons.create, {
    nickname: 'Pierre',
    format: 'skirmish',
    durationHours: 48,
    compensation: 0.5,
  });
  const { token: guest } = await t.mutation(api.seasons.join, { code, nickname: 'Léa' });
  await t.mutation(api.players.reserveNation, { token, nation: 'france' });
  await t.mutation(api.players.chooseDoctrine, { token, doctrine: 'hegemony' });
  await t.mutation(api.players.declareReady, { token, ready: true });
  await t.mutation(api.players.reserveNation, { token: guest, nation: 'ussr' });
  await t.mutation(api.players.chooseDoctrine, { token: guest, doctrine: 'domination' });
  await t.mutation(api.players.declareReady, { token: guest, ready: true });
  await t.mutation(api.seasons.launch, { token });
  return { token, guest };
}

async function playerOf(t: ReturnType<typeof boot>, token: string) {
  return t.run(async (ctx) => {
    const player = await ctx.db
      .query('players')
      .withIndex('byToken', (q) => q.eq('token', token))
      .unique();
    if (!player) throw new Error('player not found');
    return player._id;
  });
}

/** Only what the job under test filed: the launch endowment leaves none, but a second event in
 *  the same run would, and a test that read the whole table would drift with the game. */
async function noticesOf(t: ReturnType<typeof boot>, token: string, kind: Doc<'notices'>['kind']) {
  const playerId = await playerOf(t, token);
  const filed = await t.run(async (ctx) =>
    ctx.db
      .query('notices')
      .withIndex('byPlayer', (q) => q.eq('playerId', playerId))
      .collect(),
  );
  return filed.filter((notice) => notice.kind === kind);
}

async function raise(
  t: ReturnType<typeof boot>,
  token: string,
  key: BuildingKey,
  regionId: string,
): Promise<Id<'buildings'>> {
  const playerId = await playerOf(t, token);
  return t.run(async (ctx) => {
    const seasonId = (await ctx.db.get(playerId))!.seasonId;
    return ctx.db.insert('buildings', { seasonId, playerId, key, regionId, level: 1 });
  });
}

async function form(
  t: ReturnType<typeof boot>,
  token: string,
  role: UnitRole,
  stationedAt: Id<'buildings'> | null,
): Promise<Id<'troops'>> {
  const playerId = await playerOf(t, token);
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

async function post(t: ReturnType<typeof boot>, token: string, point: LonLat) {
  const troopId = await form(t, token, 'infantry', null);
  await t.run(async (ctx) => ctx.db.patch(troopId, { stationedAt: asPoint(point) }));
  return troopId;
}

describe('what the jobs file for the journal', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('files a delivery when a batch becomes a company, with the site it came out of', async () => {
    const t = boot();
    const { token, guest } = await launchedSeason(t);
    const barracks = await raise(t, token, 'barracks', MARNE);
    const playerId = await playerOf(t, token);
    await t.run(async (ctx) => {
      const recruitmentId = await ctx.db.insert('recruitments', {
        playerId,
        buildingId: barracks,
        role: 'infantry',
        tier: 1,
        rank: 0,
        finishesAt: Date.now() + 60_000,
      });
      await ctx.scheduler.runAfter(60_000, internal.troops.deliver, { recruitmentId });
    });

    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(await noticesOf(t, token, 'recruitmentDelivered')).toMatchObject([
      { role: 'infantry', site: { building: 'barracks', regionId: MARNE } },
    ]);
    expect(await noticesOf(t, guest, 'recruitmentDelivered')).toEqual([]);
  });

  it('files an arrival for a march, and none for the attack an engagement accounts for', async () => {
    const t = boot();
    const { token } = await launchedSeason(t);
    const barracks = await raise(t, token, 'barracks', MARNE);

    const sent = await t.mutation(api.movements.marchTo, {
      token,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [await form(t, token, 'infantry', barracks)],
      point: asPoint(pointOf(PRAHOVA)),
    });
    vi.advanceTimersByTime(sent.minutes * 60_000);
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(await noticesOf(t, token, 'columnArrived')).toMatchObject([
      { movementType: 'march', hostCountry: 'ROU', troops: 1 },
    ]);

    await t.mutation(api.movements.attack, {
      token,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [await form(t, token, 'infantry', barracks)],
      target: { kind: 'region', regionId: PRAHOVA },
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    /** The attack itself files nothing — it leaves an engagement, or on empty ground the honest
     *  nothing of a march made for nothing — and only its **walk back** is an arrival the
     *  journal owes. Saying the arrival twice is exactly what the type list here prevents. */
    expect(
      (await noticesOf(t, token, 'columnArrived')).map((notice) =>
        notice.kind === 'columnArrived' ? notice.movementType : null,
      ),
    ).toEqual(['march', 'return']);
  });

  /**
   * **Le seul événement du jeu qui ne laissait aucune trace.** Une attaque qui arrive sur un sol
   * vide n'ouvre pas de passe, donc ne dépose pas de compte rendu — et sans cette ligne le
   * joueur relit « rien à signaler » après la plus longue marche de sa saison.
   */
  it('files the honest nothing of a column that arrived on empty ground', async () => {
    const t = boot();
    const { token, guest } = await launchedSeason(t);
    const barracks = await raise(t, token, 'barracks', MARNE);

    await t.mutation(api.movements.attack, {
      token,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [await form(t, token, 'infantry', barracks)],
      target: { kind: 'region', regionId: PRAHOVA },
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(await noticesOf(t, token, 'columnFoundNothing')).toMatchObject([
      { movementType: 'attack', hostCountry: 'ROU', troops: 1 },
    ]);
    /** Personne d'autre : il n'y avait personne, justement. */
    expect(await noticesOf(t, guest, 'columnFoundNothing')).toEqual([]);
  });

  /** **Ce qu'on découvre au réveil** (fiche 11 §4.1) : la colonne attend à la frontière, et
   *  l'heure à laquelle elle passera est le seul fait qui mérite une manchette. */
  it('files the hour a column held by a rest window will go through', async () => {
    const t = boot();
    const { token, guest } = await launchedSeason(t);
    // The Soviet sleeps across the hour the column would land in, so the border holds it.
    const guestId = await playerOf(t, guest);
    await t.run(async (ctx) =>
      ctx.db.patch(guestId, {
        restWindow: { startMinutes: 0, endMinutes: REST_WINDOW_MINUTES },
      }),
    );
    vi.setSystemTime(new Date(2026, 7, 17, 1, 0, 0));

    const barracks = await raise(t, token, 'barracks', MARNE);
    const sent = await t.mutation(api.movements.marchTo, {
      token,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [await form(t, token, 'infantry', barracks)],
      point: asPoint(pointOf(PSKOV)),
    });
    vi.advanceTimersByTime(sent.minutes * 60_000);
    await t.finishInProgressScheduledFunctions();

    const [stalled] = await noticesOf(t, token, 'movementStalled');
    expect(stalled).toMatchObject({ kind: 'movementStalled', hostCountry: 'RUS' });
    if (stalled?.kind !== 'movementStalled') throw new Error('no stall filed');
    expect(stalled.resolvesAt).toBeGreaterThan(Date.now());
  });

  it('files a founding for the player who planted the point', async () => {
    const t = boot();
    const { token, guest } = await launchedSeason(t);
    const desert = pointOf(PRAHOVA);
    await t.mutation(api.movements.foundOutpostHere, {
      token,
      point: asPoint(desert),
      specialization: 'relay',
      troopIds: [await post(t, token, desert)],
    });

    expect(await noticesOf(t, token, 'outpostFounded')).toMatchObject([
      { hostCountry: 'ROU', specialization: 'relay' },
    ]);
    expect(await noticesOf(t, guest, 'outpostFounded')).toEqual([]);
  });

  /**
   * **Pour le propriétaire, et lui seul.** Un raid qui ne rencontre aucune garnison ne dépose
   * aucun compte rendu : sans cette notice le point cesse de payer et rien nulle part ne dit
   * pourquoi.
   */
  it('files a deactivation for the owner of the point a raid put out of service', async () => {
    const t = boot();
    const { token, guest } = await launchedSeason(t);
    const point = pointOf(PRAHOVA);
    const guestId = await playerOf(t, guest);
    await t.run(async (ctx) =>
      ctx.db.insert('outposts', {
        seasonId: (await ctx.db.get(guestId))!.seasonId,
        playerId: guestId,
        point: asPoint(point),
        hostCountry: 'ROU',
        level: 1,
        specialization: 'relay',
        foundedAt: Date.now(),
        disabledUntil: null,
        immuneUntil: null,
      }),
    );
    const outpostId = (
      await t.run(async (ctx) =>
        ctx.db
          .query('outposts')
          .withIndex('byPlayer', (q) => q.eq('playerId', guestId))
          .collect(),
      )
    )[0]!._id;

    const barracks = await raise(t, token, 'barracks', MARNE);
    const sent = await t.mutation(api.movements.raid, {
      token,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [await form(t, token, 'infantry', barracks)],
      outpostId,
    });
    vi.advanceTimersByTime(sent.minutes * 60_000);
    await t.finishInProgressScheduledFunctions();

    expect(await noticesOf(t, guest, 'outpostDisabled')).toMatchObject([
      { hostCountry: 'ROU', specialization: 'relay' },
    ]);
    expect(await noticesOf(t, token, 'outpostDisabled')).toEqual([]);
  });

  /**
   * **Le relevé n'existe que chez l'observateur.** C'est la seule sorte dont la fuite serait un
   * défaut de brouillard : celui qui marche ne doit rien lire de ce qu'on a vu de lui.
   */
  it('files a sighting for the sentry that saw a thread, and for nobody else', async () => {
    const t = boot();
    const { token, guest } = await launchedSeason(t);
    const road = routeBetween(pointOf(MARNE), pointOf(PRAHOVA), 'land')!;
    const halfway = road.points[Math.floor(road.points.length / 2)]!;
    const camp = eastOf(halfway, 40);
    expect(
      road.points.reduce((closest, step) => Math.min(closest, distanceKm(step, camp)), Infinity),
    ).toBeLessThan(SCOUT_RADIUS_KM);
    await post(t, guest, camp);

    const barracks = await raise(t, token, 'barracks', MARNE);
    await t.mutation(api.movements.attack, {
      token,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [await form(t, token, 'infantry', barracks)],
      target: { kind: 'region', regionId: PRAHOVA },
    });

    const [sighted] = await noticesOf(t, guest, 'movementSighted');
    expect(sighted).toBeDefined();
    // A place, a heading and what caught it — nothing else exists to file: no type, no nation.
    // The detector is the observer's own, so naming it leaks nothing about what walked past.
    expect(Object.keys(sighted!).sort()).toEqual(
      [
        '_creationTime',
        '_id',
        'at',
        'detector',
        'detectorRegion',
        'headingDegrees',
        'hostCountry',
        'kind',
        'playerId',
      ].sort(),
    );
    expect(sighted).toMatchObject({ detector: 'troop', detectorRegion: null });
    expect(await noticesOf(t, token, 'movementSighted')).toEqual([]);
  });

  /**
   * **Une passe tirée à sec.** Le compte rendu montre les pertes, jamais leur raison : sans
   * cette ligne un défaut de ravitaillement se lit comme une défaite.
   */
  it('files a dry pass for the side whose magazine could not cover it', async () => {
    const t = boot();
    const { token, guest } = await launchedSeason(t);
    const dry = await playerOf(t, token);
    await t.run(async (ctx) => {
      const held = await ctx.db
        .query('resources')
        .withIndex('byPlayer', (q) => q.eq('playerId', dry))
        .collect();
      const magazine = held.find((row) => row.key === 'ammunition')!;
      await ctx.db.patch(magazine._id, { stock: 0, updatedAt: Date.now() });
    });

    const point = pointOf(PRAHOVA);
    await post(t, guest, point);
    const barracks = await raise(t, token, 'barracks', MARNE);
    const sent = await t.mutation(api.movements.attack, {
      token,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [await form(t, token, 'infantry', barracks)],
      target: { kind: 'point', point: asPoint(point) },
    });
    vi.advanceTimersByTime(sent.minutes * 60_000);
    await t.finishInProgressScheduledFunctions();

    expect(await noticesOf(t, token, 'firedDry')).toMatchObject([{ hostCountry: 'ROU' }]);
    expect(await noticesOf(t, guest, 'firedDry')).toEqual([]);
  });
});

/**
 * **Lu, c'est ce qu'on a eu le temps de voir.** L'heure se pose à la fermeture de la fenêtre, et
 * le bandeau ne compte que ce qui est postérieur — un compteur qui ne redescend jamais cesse
 * d'être lu au bout d'une journée.
 */
describe('read and unread', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(MIDDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('stamps the hour the window was closed, and nothing before that', async () => {
    const t = boot();
    const { token } = await launchedSeason(t);
    expect((await t.query(api.view.playerView, { token })).journalReadAt).toBeNull();

    await t.mutation(api.journal.markRead, { token });
    const stamped = (await t.query(api.view.playerView, { token })).journalReadAt;
    expect(stamped).toBe(Date.now());

    vi.advanceTimersByTime(3_600_000);
    await t.mutation(api.journal.markRead, { token });
    expect((await t.query(api.view.playerView, { token })).journalReadAt).toBeGreaterThan(stamped!);
  });
});
