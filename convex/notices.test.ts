import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { distanceKm, type LonLat } from '../src/domain/geo';
import type { BuildingKey, UnitRole } from '../src/domain/ids';
import { DETECTION_RANGE_KM, REST_WINDOW_MINUTES, nominalStrength } from './constants';
import { regionFacts, pointOfRegion } from './regions';
import { routeBetween } from './routes';
import schema from './schema';
import { modules } from './test.setup';
import { attacking, foundSeat, joinSeat, seatIn, unclocked } from './seats.fixture';
import type { Seat } from './seats.fixture';

/**
 * **Le journal dit ce qui s'est passé, et c'est le job qui l'écrit.** Une notice par événement,
 * pour le bon joueur, au moment où l'événement a lieu — jamais dérivée à la lecture, sinon le
 * journal répondrait « ce qui est vrai maintenant » et non « ce qui a changé depuis ma dernière
 * visite », qui est la boucle de retour d'un jeu asynchrone.
 *
 * Un test par sorte, et pour le relevé un test de plus : **il n'existe que chez l'observateur**.
 * C'est la seule sorte dont la fuite serait un défaut de brouillard et pas un défaut d'écran.
 */
const boot = () => convexTest({ schema, modules, transactionLimits: true });

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
  const { seat, code } = await foundSeat(t, 'Pierre', 0.5);
  const guest = await joinSeat(t, code, 'Léa');
  await t.mutation(api.players.reserveNation, { ...seat, nation: 'france' });
  await t.mutation(api.players.declareReady, { ...seat, ready: true });
  await t.mutation(api.players.reserveNation, { ...guest, nation: 'ussr' });
  await t.mutation(api.players.declareReady, { ...guest, ready: true });
  await t.mutation(api.seasons.launch, seat);
  await unclocked(t);
  return { seat, guest };
}

async function playerOf(t: ReturnType<typeof boot>, seat: Seat) {
  return t.run(async (ctx) => {
    const player = await seatIn(ctx, seat);
    return player._id;
  });
}

/** Only what the job under test filed: the launch endowment leaves none, but a second event in
 *  the same run would, and a test that read the whole table would drift with the game. */
async function noticesOf(t: ReturnType<typeof boot>, seat: Seat, kind: Doc<'notices'>['kind']) {
  const playerId = await playerOf(t, seat);
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
  seat: Seat,
  key: BuildingKey,
  regionId: string,
): Promise<Id<'buildings'>> {
  const playerId = await playerOf(t, seat);
  return t.run(async (ctx) => {
    const seasonId = (await ctx.db.get(playerId))!.seasonId;
    return ctx.db.insert('buildings', {
      seasonId,
      playerId,
      key,
      regionId,
      point: pointOfRegion(regionId),
      level: 1,
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

async function post(t: ReturnType<typeof boot>, seat: Seat, point: LonLat) {
  const troopId = await form(t, seat, 'infantry', null);
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
    const { seat, guest } = await launchedSeason(t);
    const barracks = await raise(t, seat, 'barracks', MARNE);
    const playerId = await playerOf(t, seat);
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

    expect(await noticesOf(t, seat, 'recruitmentDelivered')).toMatchObject([
      { role: 'infantry', site: { building: 'barracks', regionId: MARNE } },
    ]);
    expect(await noticesOf(t, guest, 'recruitmentDelivered')).toEqual([]);
  });

  it('files an arrival for a march, and none for the attack an engagement accounts for', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const barracks = await raise(t, seat, 'barracks', MARNE);

    const sent = await t.mutation(api.movements.marchTo, {
      ...seat,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [await form(t, seat, 'infantry', barracks)],
      point: asPoint(pointOf(PRAHOVA)),
    });
    vi.advanceTimersByTime(sent.minutes * 60_000);
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(await noticesOf(t, seat, 'columnArrived')).toMatchObject([
      { movementType: 'march', hostCountry: 'ROU', troops: 1 },
    ]);

    await attacking(t, {
      ...seat,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [await form(t, seat, 'infantry', barracks)],
      target: { kind: 'region', regionId: PRAHOVA },
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    /** The attack itself files nothing — it leaves an engagement, or on empty ground the honest
     *  nothing of a march made for nothing — and only its **walk back** is an arrival the
     *  journal owes. Saying the arrival twice is exactly what the type list here prevents. */
    expect(
      (await noticesOf(t, seat, 'columnArrived')).map((notice) =>
        notice.kind === 'columnArrived' ? notice.movementType : null,
      ),
    ).toEqual(['march', 'return']);
  });

  /** « Localiser » needs a point on every dispatch that happened somewhere: the row's own point
   *  when it stored one, else the point of the region it names. */
  it('serves each notice its place', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const barracks = await raise(t, seat, 'barracks', MARNE);
    const destination = pointOf(PRAHOVA);
    const sent = await t.mutation(api.movements.marchTo, {
      ...seat,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [await form(t, seat, 'infantry', barracks)],
      point: asPoint(destination),
    });
    vi.advanceTimersByTime(sent.minutes * 60_000);
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const playerId = await playerOf(t, seat);
    await t.run(async (ctx) =>
      ctx.db.insert('notices', {
        playerId,
        at: Date.now(),
        kind: 'constructionFinished',
        building: 'barracks',
        regionId: MARNE,
        level: 1,
      }),
    );
    const { notices } = await t.query(api.view.playerView, seat);
    const place = (kind: string) => notices.find((notice) => notice.kind === kind)?.place;
    expect(place('columnArrived')).toEqual({ lon: destination[0], lat: destination[1] });
    expect(place('constructionFinished')).toEqual({ lon: 4.22, lat: 48.97 });
  });

  /**
   * **Le seul événement du jeu qui ne laissait aucune trace.** Une attaque qui arrive sur un sol
   * vide n'ouvre pas de passe, donc ne dépose pas de compte rendu — et sans cette ligne le
   * joueur relit « rien à signaler » après la plus longue marche de sa saison.
   */
  it('files the honest nothing of a column that arrived on empty ground', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const barracks = await raise(t, seat, 'barracks', MARNE);

    await attacking(t, {
      ...seat,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [await form(t, seat, 'infantry', barracks)],
      target: { kind: 'region', regionId: PRAHOVA },
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(await noticesOf(t, seat, 'columnFoundNothing')).toMatchObject([
      { movementType: 'attack', hostCountry: 'ROU', troops: 1 },
    ]);
    /** Personne d'autre : il n'y avait personne, justement. */
    expect(await noticesOf(t, guest, 'columnFoundNothing')).toEqual([]);
  });

  /**
   * **Et elle dit ce qu'elle a sous les yeux** (retours du 11/09, ligne 5). En prod, une colonne
   * est arrivée sur une région adverse qui portait une mine de charbon : personne à combattre,
   * « n'a trouvé personne », et rien qui dise que l'ordre « saboter » existait à deux pas. La
   * dépêche porte la clé du bâtiment que **le relevé de ce couloir-ci** vient d'écrire — c'est
   * l'ordre des deux écritures qui est sous test autant que la clé.
   */
  it('names the installation a bredouille column has just surveyed', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const barracks = await raise(t, seat, 'barracks', MARNE);
    await raise(t, guest, 'mine', PSKOV);

    await attacking(t, {
      ...seat,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [await form(t, seat, 'infantry', barracks)],
      target: { kind: 'region', regionId: PSKOV },
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(await noticesOf(t, seat, 'columnFoundNothing')).toMatchObject([
      { movementType: 'attack', hostCountry: 'RUS', installation: 'mine' },
    ]);
  });

  /** Sans rien de relevé sur place, la dépêche est celle d'avant : la région roumaine est vide. */
  it('leaves the dispatch untouched where nothing of the other side stands', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const barracks = await raise(t, seat, 'barracks', MARNE);

    await attacking(t, {
      ...seat,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [await form(t, seat, 'infantry', barracks)],
      target: { kind: 'region', regionId: PRAHOVA },
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(
      (await noticesOf(t, seat, 'columnFoundNothing')).map((notice) =>
        notice.kind === 'columnFoundNothing' ? notice.installation : 'absent',
      ),
    ).toEqual([undefined]);
  });

  /** **Ce qu'on découvre au réveil** (fiche 11 §4.1) : la colonne attend à la frontière, et
   *  l'heure à laquelle elle passera est le seul fait qui mérite une manchette. */
  it('files the hour a column held by a rest window will go through', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    // The Soviet sleeps across the hour the column would land in, so the border holds it.
    const guestId = await playerOf(t, guest);
    await t.run(async (ctx) =>
      ctx.db.patch(guestId, {
        restWindow: { startMinutes: 0, endMinutes: REST_WINDOW_MINUTES },
      }),
    );
    // Some eight hours on foot: leaving at 18h00 UTC lands around 02h00.
    vi.setSystemTime(new Date(Date.UTC(2026, 7, 17, 18, 0, 0)));

    const barracks = await raise(t, seat, 'barracks', MARNE);
    const sent = await t.mutation(api.movements.marchTo, {
      ...seat,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [await form(t, seat, 'infantry', barracks)],
      point: asPoint(pointOf(PSKOV)),
    });
    vi.advanceTimersByTime(sent.minutes * 60_000);
    await t.finishInProgressScheduledFunctions();

    const [stalled] = await noticesOf(t, seat, 'movementStalled');
    expect(stalled).toMatchObject({ kind: 'movementStalled', hostCountry: 'RUS' });
    if (stalled?.kind !== 'movementStalled') throw new Error('no stall filed');
    expect(stalled.resolvesAt).toBeGreaterThan(Date.now());
  });

  it('files a founding for the player who planted the point', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const desert = pointOf(PRAHOVA);
    await t.mutation(api.movements.foundOutpostHere, {
      regionId: null,
      ...seat,
      point: asPoint(desert),
      specialization: 'relay',
      troopIds: [await post(t, seat, desert)],
    });

    expect(await noticesOf(t, seat, 'outpostFounded')).toMatchObject([
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
    const { seat, guest } = await launchedSeason(t);
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

    const barracks = await raise(t, seat, 'barracks', MARNE);
    const sent = await t.mutation(api.movements.raid, {
      ...seat,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [await form(t, seat, 'infantry', barracks)],
      outpostId,
    });
    vi.advanceTimersByTime(sent.minutes * 60_000);
    await t.finishInProgressScheduledFunctions();

    expect(await noticesOf(t, guest, 'outpostDisabled')).toMatchObject([
      { hostCountry: 'ROU', specialization: 'relay' },
    ]);
    expect(await noticesOf(t, seat, 'outpostDisabled')).toEqual([]);
  });

  /**
   * **Le relevé n'existe que chez l'observateur.** C'est la seule sorte dont la fuite serait un
   * défaut de brouillard : celui qui marche ne doit rien lire de ce qu'on a vu de lui.
   */
  it('files a sighting for the sentry that saw a thread, and for nobody else', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const road = routeBetween(pointOf(MARNE), pointOf(PRAHOVA), 'land')!;
    const halfway = road.points[Math.floor(road.points.length / 2)]!;
    const camp = eastOf(halfway, 40);
    expect(
      road.points.reduce((closest, step) => Math.min(closest, distanceKm(step, camp)), Infinity),
    ).toBeLessThan(DETECTION_RANGE_KM.infantry);
    await post(t, guest, camp);

    const barracks = await raise(t, seat, 'barracks', MARNE);
    await attacking(t, {
      ...seat,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [await form(t, seat, 'infantry', barracks)],
      target: { kind: 'region', regionId: PRAHOVA },
    });

    expect(await noticesOf(t, guest, 'movementSighted')).toEqual([]);
    expect((await t.query(api.view.playerView, guest)).detected).toEqual([]);
    const guestPlayer = await playerOf(t, guest);
    const [window] = await t.run(async (ctx) =>
      ctx.db
        .query('sightings')
        .withIndex('byPlayer', (q) => q.eq('playerId', guestPlayer))
        .collect(),
    );
    expect(window).toBeDefined();
    vi.advanceTimersByTime(window!.from - Date.now());
    await t.finishInProgressScheduledFunctions();

    const [sighted] = await noticesOf(t, guest, 'movementSighted');
    expect(sighted).toBeDefined();
    const [detected] = (await t.query(api.view.playerView, guest)).detected;
    expect(detected).toBeDefined();
    expect(detected).not.toHaveProperty('type');
    expect(detected).not.toHaveProperty('stack');
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
        'point',
      ].sort(),
    );
    /** The button may only point where the arc already starts: never the departure, never the
     *  destination. */
    expect(sighted!.kind === 'movementSighted' ? sighted!.point?.lon : null).toBeCloseTo(
      (detected as unknown as { from: { lon: number } }).from.lon,
      3,
    );
    expect(sighted).toMatchObject({ detector: 'troop', detectorRegion: null });
    expect(await noticesOf(t, seat, 'movementSighted')).toEqual([]);

    vi.advanceTimersByTime(window!.to - Date.now() + 1);
    await t.finishInProgressScheduledFunctions();
    const [memory] = (await t.query(api.view.playerView, guest)).detected;
    expect(memory).toBeDefined();
    expect(memory!.seenTo).toBeLessThan(Date.now());
    expect(memory).not.toHaveProperty('type');
    expect(memory).not.toHaveProperty('stack');
  });

  /**
   * **Une passe tirée à sec.** Le compte rendu montre les pertes, jamais leur raison : sans
   * cette ligne un défaut de ravitaillement se lit comme une défaite.
   */
  it('files a dry pass for the side whose troops had no rounds left', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);

    const point = pointOf(PRAHOVA);
    const posted = await post(t, guest, point);
    // Abroad, nothing rearms it: it lives on what it carries (ADR 0028 §3).
    await t.run(async (ctx) => ctx.db.patch(posted, { rounds: 0 }));
    const barracks = await raise(t, seat, 'barracks', MARNE);
    const sent = await attacking(t, {
      ...seat,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [await form(t, seat, 'infantry', barracks)],
      target: { kind: 'point', point: asPoint(point) },
    });
    vi.advanceTimersByTime(sent.minutes * 60_000);
    await t.finishInProgressScheduledFunctions();

    expect(await noticesOf(t, guest, 'firedDry')).toMatchObject([
      { hostCountry: 'ROU', troops: 1 },
    ]);
    expect(await noticesOf(t, seat, 'firedDry')).toEqual([]);
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
    const { seat } = await launchedSeason(t);
    expect((await t.query(api.view.playerView, seat)).journalReadAt).toBeNull();

    await t.mutation(api.journal.markRead, seat);
    const stamped = (await t.query(api.view.playerView, seat)).journalReadAt;
    expect(stamped).toBe(Date.now());

    vi.advanceTimersByTime(3_600_000);
    await t.mutation(api.journal.markRead, seat);
    expect((await t.query(api.view.playerView, seat)).journalReadAt).toBeGreaterThan(stamped!);
  });
});
