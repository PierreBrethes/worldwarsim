import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { distanceKm, type LonLat } from '../src/domain/geo';
import type { BuildingKey, UnitRole } from '../src/domain/ids';
import { journalUrl, push, reportUrl, telegraphUrl, type PushType } from '../src/domain/push';
import { DETECTION_RANGE_KM, nominalStrength } from './constants';
import { notifyPlayer } from './notifications';
import { accountOf } from './seats';
import { regionFacts, pointOfRegion } from './regions';
import { routeBetween } from './routes';
import schema from './schema';
import { modules } from './test.setup';
import { attacking, foundSeat, joinSeat, seatIn } from './seats.fixture';
import type { Seat } from './seats.fixture';

const webpush = vi.hoisted(() => ({
  sent: [] as Array<{ endpoint: string; payload: Record<string, unknown> }>,
  failWith: null as number | null,
}));

vi.mock('web-push', () => ({
  default: {
    sendNotification: async (subscription: { endpoint: string }, payload: string) => {
      if (webpush.failWith !== null)
        throw Object.assign(new Error('refused'), { statusCode: webpush.failWith });
      webpush.sent.push({
        endpoint: subscription.endpoint,
        payload: JSON.parse(payload) as Record<string, unknown>,
      });
    },
  },
}));

/**
 * **Ce qui sonne, et ce qui se tait.** Aucun test ne part sur le réseau : `web-push` est
 * bouchonné et ce qu'on lit est ce qu'il aurait envoyé. Le branchement de chaque événement est
 * éprouvé sur le vrai scénario qui le produit ; le vidage (groupe, repos, présence, télégraphe),
 * lui, sur des lignes déposées à la main, parce qu'il ne dépend pas de leur origine.
 */
const boot = () => convexTest({ schema, modules, transactionLimits: true });

const MARNE = 'FRA-5323';
const PRAHOVA = 'ROU-310';
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
/** La plage de repos par défaut court de 21h à 4h UTC : midi est loin d'elle, 22h dedans. */
const NOON = Date.UTC(2026, 7, 17, 12, 0, 0);
const NIGHT = Date.UTC(2026, 7, 17, 22, 0, 0);

const asPoint = (point: LonLat) => ({ lon: point[0], lat: point[1] });
const pointOf = (regionId: string): LonLat => regionFacts(regionId)!.point;
const eastOf = (point: LonLat, km: number): LonLat => [
  point[0] + km / (111.32 * Math.cos((point[1] * Math.PI) / 180)),
  point[1],
];

type Bench = ReturnType<typeof boot>;

async function subscribe(t: Bench, seat: Seat, endpoint: string) {
  await t.mutation(api.notifications.subscribe, {
    token: seat.token,
    endpoint,
    p256dh: 'p256dh',
    auth: 'auth',
    userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/126.0 Mobile Safari/537.36',
  });
}

async function lobby(t: Bench) {
  const { seat, code } = await foundSeat(t, 'Pierre', 0.5);
  const guest = await joinSeat(t, code, 'Léa');
  await t.mutation(api.players.reserveNation, { ...seat, nation: 'france' });
  await t.mutation(api.players.declareReady, { ...seat, ready: true });
  await t.mutation(api.players.reserveNation, { ...guest, nation: 'ussr' });
  await t.mutation(api.players.declareReady, { ...guest, ready: true });
  return { seat, guest };
}

/** Une saison lancée, les deux joueurs abonnés d'un appareil chacun. */
async function launchedSeason(t: Bench) {
  const { seat, guest } = await lobby(t);
  await subscribe(t, seat, 'https://fcm.googleapis.com/pierre');
  await subscribe(t, guest, 'https://fcm.googleapis.com/lea');
  await t.mutation(api.seasons.launch, seat);
  await advance(t, 2 * MINUTE);
  const objectives = await t.run(async (ctx) => ctx.db.query('objectives').collect());
  expect(objectives.map((objective) => objective.regionId)).not.toContain(PRAHOVA);
  webpush.sent.length = 0;
  return { seat, guest };
}

/** Les envois dus, puis ceux qu'ils déclenchent — jamais l'horloge au-delà de ce qui est dû. */
async function drain(t: Bench) {
  for (let pass = 0; pass < 3; pass += 1) {
    await t.finishInProgressScheduledFunctions();
    vi.advanceTimersByTime(1);
  }
  await t.finishInProgressScheduledFunctions();
}

async function advance(t: Bench, ms: number) {
  vi.advanceTimersByTime(ms);
  await drain(t);
}

const playerOf = (t: Bench, seat: Seat) => t.run(async (ctx) => (await seatIn(ctx, seat))._id);

const queued = (t: Bench, seat: Seat) =>
  t.run(async (ctx) => {
    const player = await seatIn(ctx, seat);
    return (await ctx.db.query('pushQueue').collect()).filter(
      (row) => row.accountId === player.accountId,
    );
  });

async function enqueue(t: Bench, seat: Seat, type: PushType, phrase = `phrase ${type}`) {
  const playerId = await playerOf(t, seat);
  await t.run(async (ctx) =>
    notifyPlayer(ctx, playerId, {
      type,
      phrase,
      url: type === 'telegraph' ? telegraphUrl : journalUrl,
      at: Date.now(),
    }),
  );
}

async function raise(t: Bench, seat: Seat, key: BuildingKey, regionId: string) {
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

async function form(t: Bench, seat: Seat, role: UnitRole, stationedAt: Id<'buildings'> | null) {
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

async function post(t: Bench, seat: Seat, point: LonLat) {
  const troopId = await form(t, seat, 'infantry', null);
  await t.run(async (ctx) => ctx.db.patch(troopId, { stationedAt: asPoint(point) }));
  return troopId;
}

const types = async (t: Bench, seat: Seat) => (await queued(t, seat)).map((row) => row.type);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOON);
  webpush.sent.length = 0;
  webpush.failWith = null;
  vi.stubEnv('VAPID_PUBLIC_KEY', 'public');
  vi.stubEnv('VAPID_PRIVATE_KEY', 'private');
  vi.stubEnv('VAPID_SUBJECT', 'mailto:test@example.org');
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

/** Les appareils du compte, lus dans la table. */
const devicesOf = (t: ReturnType<typeof boot>, token: string) =>
  t.run(async (ctx) => {
    const account = await accountOf(ctx, token);
    return ctx.db
      .query('pushSubscriptions')
      .withIndex('byAccount', (q) => q.eq('accountId', account!._id))
      .collect();
  });

describe('les abonnements', () => {
  it('rattachent un appareil au compte, avec un libellé lisible', async () => {
    const t = boot();
    const { seat } = await foundSeat(t, 'Pierre');
    await subscribe(t, seat, 'https://fcm.googleapis.com/a');

    expect(
      await t.query(api.notifications.subscribed, {
        token: seat.token,
        endpoint: 'https://fcm.googleapis.com/a',
      }),
    ).toBe(true);
    expect(
      await t.query(api.notifications.subscribed, {
        token: seat.token,
        endpoint: 'https://fcm.googleapis.com/b',
      }),
    ).toBe(false);
    expect(await devicesOf(t, seat.token)).toMatchObject([
      { endpoint: 'https://fcm.googleapis.com/a', deviceLabel: 'Chrome sur Android' },
    ]);
  });

  it('changent de compte quand l’appareil s’abonne pour un autre', async () => {
    const t = boot();
    const { seat, code } = await foundSeat(t, 'Pierre');
    const guest = await joinSeat(t, code, 'Léa');
    await subscribe(t, seat, 'https://fcm.googleapis.com/shared');
    await subscribe(t, guest, 'https://fcm.googleapis.com/shared');

    expect(
      await t.query(api.notifications.subscribed, {
        token: seat.token,
        endpoint: 'https://fcm.googleapis.com/shared',
      }),
    ).toBe(false);
    expect(
      await t.query(api.notifications.subscribed, {
        token: guest.token,
        endpoint: 'https://fcm.googleapis.com/shared',
      }),
    ).toBe(true);
    expect(
      await t.run(async (ctx) => (await ctx.db.query('pushSubscriptions').collect()).length),
    ).toBe(1);
  });

  it('se retirent, mais pas depuis le compte d’un autre', async () => {
    const t = boot();
    const { seat, code } = await foundSeat(t, 'Pierre');
    const guest = await joinSeat(t, code, 'Léa');
    await subscribe(t, seat, 'https://fcm.googleapis.com/a');

    await t.mutation(api.notifications.unsubscribe, {
      token: guest.token,
      endpoint: 'https://fcm.googleapis.com/a',
    });
    expect(
      await t.query(api.notifications.subscribed, {
        token: seat.token,
        endpoint: 'https://fcm.googleapis.com/a',
      }),
    ).toBe(true);
    await t.mutation(api.notifications.unsubscribe, {
      token: seat.token,
      endpoint: 'https://fcm.googleapis.com/a',
    });
    expect(
      await t.query(api.notifications.subscribed, {
        token: seat.token,
        endpoint: 'https://fcm.googleapis.com/a',
      }),
    ).toBe(false);
  });

  it('partent avec la déconnexion de l’appareil, et de lui seul', async () => {
    const t = boot();
    const { seat } = await foundSeat(t, 'Pierre');
    await subscribe(t, seat, 'https://fcm.googleapis.com/phone');
    await subscribe(t, seat, 'https://fcm.googleapis.com/laptop');

    await t.mutation(api.accounts.logout, {
      token: seat.token,
      endpoint: 'https://fcm.googleapis.com/phone',
    });
    const left = await t.run(async (ctx) =>
      (await ctx.db.query('pushSubscriptions').collect()).map((row) => row.endpoint),
    );
    expect(left).toEqual(['https://fcm.googleapis.com/laptop']);
  });

  it('donnent toutes les préférences cochées, et gardent ce qu’on décoche', async () => {
    const t = boot();
    const { seat } = await foundSeat(t, 'Pierre');
    expect(await t.query(api.notifications.preferences, { token: seat.token })).toEqual({
      attack: true,
      outpost: true,
      sighting: true,
      dryFire: true,
      season: true,
      telegraph: true,
    });
    await t.mutation(api.notifications.setPreference, {
      token: seat.token,
      type: 'sighting',
      enabled: false,
    });
    expect(await t.query(api.notifications.preferences, { token: seat.token })).toMatchObject({
      sighting: false,
      attack: true,
    });
  });
});

describe('ce qui entre dans la file', () => {
  it('saison : le lancement, pour chaque joueur assis', async () => {
    const t = boot();
    const { seat, guest } = await lobby(t);
    await subscribe(t, seat, 'https://fcm.googleapis.com/pierre');
    await subscribe(t, guest, 'https://fcm.googleapis.com/lea');
    await t.mutation(api.seasons.launch, seat);

    expect(await types(t, seat)).toEqual(['season']);
    expect(await types(t, guest)).toEqual(['season']);
    expect((await queued(t, seat))[0]!.phrase).toBe(push.seasonLaunched);
  });

  it('saison : la clôture', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    await t.mutation(api.seasons.conclude, seat);

    expect(await types(t, guest)).toEqual(['season']);
    expect((await queued(t, guest))[0]!.phrase).toBe(push.seasonConcluded);
  });

  it('télégraphe : un message des autres, jamais le sien', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    await drain(t);
    await t.run(async (ctx) => {
      for (const row of await ctx.db.query('pushQueue').collect()) await ctx.db.delete(row._id);
    });
    await t.mutation(api.messages.post, { ...seat, text: 'alors, on se décide ?' });

    expect(await types(t, guest)).toEqual(['telegraph']);
    expect(await types(t, seat)).toEqual([]);
  });

  it('attaque : le défenseur, pas l’attaquant — et tir à sec chez qui n’avait plus de coups', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    await t.run(async (ctx) => {
      for (const row of await ctx.db.query('pushQueue').collect()) await ctx.db.delete(row._id);
    });

    const point = pointOf(PRAHOVA);
    const posted = await post(t, guest, point);
    await t.run(async (ctx) => ctx.db.patch(posted, { rounds: 0 }));
    const barracks = await raise(t, seat, 'barracks', MARNE);
    const sent = await attacking(t, {
      ...seat,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [await form(t, seat, 'infantry', barracks)],
      target: { kind: 'point', point: asPoint(point) },
    });
    vi.advanceTimersByTime(sent.minutes * MINUTE);
    await t.finishInProgressScheduledFunctions();

    expect(await types(t, guest)).toEqual(expect.arrayContaining(['attack', 'dryFire']));
    expect(await types(t, seat)).toEqual([]);
  });

  it('attaque seule : l’adresse ouvre sa dépêche, et l’écran verrouillé n’en dit pas plus', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    await t.run(async (ctx) => {
      for (const row of await ctx.db.query('pushQueue').collect()) await ctx.db.delete(row._id);
    });
    webpush.sent.length = 0;
    const point = pointOf(PRAHOVA);
    await post(t, guest, point);
    const barracks = await raise(t, seat, 'barracks', MARNE);
    const sent = await attacking(t, {
      ...seat,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [await form(t, seat, 'infantry', barracks)],
      target: { kind: 'point', point: asPoint(point) },
    });
    vi.advanceTimersByTime(sent.minutes * MINUTE);
    await t.finishInProgressScheduledFunctions();
    const engagement = (await t.run(async (ctx) => ctx.db.query('engagements').first()))!;
    await advance(t, MINUTE);

    const toGuest = webpush.sent.filter(
      (entry) => entry.endpoint === 'https://fcm.googleapis.com/lea',
    );
    expect(toGuest).toHaveLength(1);
    /** La colonne relevée en approche part dans la même minute : le résumé la compte, et
     *  l'adresse mène quand même à la seule attaque du lot. Le corps ne nomme personne. */
    expect(toGuest[0]!.payload.url).toBe(reportUrl(engagement._id));
    expect(String(toGuest[0]!.payload.body)).toContain('une passe de résolution');
    expect(String(toGuest[0]!.payload.body)).not.toMatch(/France|URSS|Pierre/);
  });

  it('attaques groupées : le résumé garde le journal', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    webpush.sent.length = 0;
    const playerId = await playerOf(t, seat);
    for (const reportId of ['engagement-a', 'engagement-b'])
      await t.run(async (ctx) =>
        notifyPlayer(ctx, playerId, {
          type: 'attack',
          phrase: push.attack,
          url: reportUrl(reportId),
          at: Date.now(),
        }),
      );
    await advance(t, MINUTE);

    expect(webpush.sent).toHaveLength(1);
    expect(webpush.sent[0]!.payload.url).toBe(journalUrl);
  });

  it('avant-poste : son propriétaire, quand un raid le désactive', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const guestId = await playerOf(t, guest);
    await t.run(async (ctx) => {
      for (const row of await ctx.db.query('pushQueue').collect()) await ctx.db.delete(row._id);
      await ctx.db.insert('outposts', {
        seasonId: (await ctx.db.get(guestId))!.seasonId,
        playerId: guestId,
        point: asPoint(pointOf(PRAHOVA)),
        hostCountry: 'ROU',
        level: 1,
        specialization: 'relay',
        foundedAt: Date.now(),
        disabledUntil: null,
        immuneUntil: null,
      });
    });
    const outpostId = (await t.run(async (ctx) => ctx.db.query('outposts').first()))!._id;
    const barracks = await raise(t, seat, 'barracks', MARNE);
    const sent = await t.mutation(api.movements.raid, {
      ...seat,
      origin: { kind: 'building', buildingId: barracks },
      troopIds: [await form(t, seat, 'infantry', barracks)],
      outpostId,
    });
    vi.advanceTimersByTime(sent.minutes * MINUTE);
    await t.finishInProgressScheduledFunctions();

    expect(await types(t, guest)).toContain('outpost');
    expect(await types(t, seat)).not.toContain('outpost');
  });

  it('colonne relevée : l’observateur, quand la fenêtre s’ouvre', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    await t.run(async (ctx) => {
      for (const row of await ctx.db.query('pushQueue').collect()) await ctx.db.delete(row._id);
    });
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
    expect(await types(t, guest)).toEqual([]);

    const guestPlayer = await playerOf(t, guest);
    const [window] = await t.run(async (ctx) =>
      ctx.db
        .query('sightings')
        .withIndex('byPlayer', (q) => q.eq('playerId', guestPlayer))
        .collect(),
    );
    vi.advanceTimersByTime(window!.from - Date.now());
    await t.finishInProgressScheduledFunctions();

    expect(await types(t, guest)).toEqual(['sighting']);
    expect(await types(t, seat)).toEqual([]);
  });

  it('rien quand le type est décoché, ni quand le compte n’a aucun appareil', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    await drain(t);
    await t.run(async (ctx) => {
      for (const row of await ctx.db.query('pushQueue').collect()) await ctx.db.delete(row._id);
    });
    await t.mutation(api.notifications.setPreference, {
      token: seat.token,
      type: 'attack',
      enabled: false,
    });
    await t.mutation(api.notifications.unsubscribe, {
      token: guest.token,
      endpoint: 'https://fcm.googleapis.com/lea',
    });

    await enqueue(t, seat, 'attack');
    await enqueue(t, seat, 'outpost');
    await enqueue(t, guest, 'outpost');

    expect(await types(t, seat)).toEqual(['outpost']);
    expect(await types(t, guest)).toEqual([]);
  });
});

describe('le vidage', () => {
  it('révoque sans l’appeler un abonnement dont l’adresse n’est plus d’un service connu', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    await t.run(async (ctx) => {
      const [device] = await ctx.db.query('pushSubscriptions').collect();
      await ctx.db.patch(device!._id, { endpoint: 'https://127.0.0.1.nip.io/x' });
    });
    webpush.sent.length = 0;
    await enqueue(t, seat, 'attack');
    await advance(t, MINUTE);

    expect(webpush.sent.map((entry) => entry.endpoint)).not.toContain('https://127.0.0.1.nip.io/x');
    const left = await t.run((ctx) => ctx.db.query('pushSubscriptions').collect());
    expect(left.map((row) => row.endpoint)).not.toContain('https://127.0.0.1.nip.io/x');
  });

  it('groupe ce qui arrive dans la même minute en une seule notification', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    webpush.sent.length = 0;
    await enqueue(t, seat, 'attack');
    await advance(t, 20_000);
    await enqueue(t, seat, 'outpost');
    await enqueue(t, seat, 'sighting');
    await advance(t, MINUTE);

    expect(webpush.sent).toHaveLength(1);
    expect(webpush.sent[0]!.endpoint).toBe('https://fcm.googleapis.com/pierre');
    expect(webpush.sent[0]!.payload).toMatchObject({
      title: 'La Manchette',
      body: '3 alarmes : une passe de résolution, un avant-poste désactivé ou détruit, une colonne relevée.',
      url: journalUrl,
      icon: '/icons/icon-192.png',
    });
    expect(String(webpush.sent[0]!.payload.tag)).toMatch(/:alarms$/);
    expect(await queued(t, seat)).toEqual([]);
  });

  it('envoie la phrase d’un événement seul', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    webpush.sent.length = 0;
    await enqueue(t, seat, 'dryFire', push.dryFire);
    await advance(t, MINUTE);

    expect(webpush.sent.map((entry) => entry.payload.body)).toEqual([push.dryFire]);
  });

  it('ne sonne pas pendant le repos, et sonne à sa fin', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    webpush.sent.length = 0;
    vi.setSystemTime(NIGHT);
    await enqueue(t, seat, 'attack');
    await enqueue(t, seat, 'sighting');
    await advance(t, MINUTE);

    expect(webpush.sent).toEqual([]);
    expect(await queued(t, seat)).toHaveLength(2);

    await advance(t, 5 * HOUR);
    expect(webpush.sent).toEqual([]);
    await advance(t, 2 * HOUR);

    expect(webpush.sent).toHaveLength(1);
    expect(webpush.sent[0]!.payload.body).toBe(
      '2 alarmes : une passe de résolution, une colonne relevée.',
    );
    expect(await queued(t, seat)).toEqual([]);
  });

  it('retient aussi le télégraphe pendant le repos', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    webpush.sent.length = 0;
    vi.setSystemTime(NIGHT);
    await enqueue(t, seat, 'telegraph');
    await advance(t, 2 * HOUR);

    expect(webpush.sent).toEqual([]);
    await advance(t, 6 * HOUR);
    expect(webpush.sent.map((entry) => entry.payload.body)).toEqual([push.telegraphOne]);
  });

  it('ne dérange pas un joueur en jeu, télégraphe excepté', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    webpush.sent.length = 0;
    await t.mutation(api.notifications.present, seat);
    await enqueue(t, seat, 'attack');
    await enqueue(t, seat, 'telegraph');
    await advance(t, MINUTE);

    expect(webpush.sent.map((entry) => entry.payload.body)).toEqual([push.telegraphOne]);
    expect(await queued(t, seat)).toEqual([]);
  });

  it('envoie à nouveau quand le joueur n’a plus donné signe depuis deux minutes', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    webpush.sent.length = 0;
    await t.mutation(api.notifications.present, seat);
    await advance(t, 3 * MINUTE);
    await enqueue(t, seat, 'attack', 'une passe');
    await advance(t, MINUTE);

    expect(webpush.sent.map((entry) => entry.payload.body)).toEqual(['une passe']);
  });

  it('fait attendre le télégraphe une heure, puis le compte en une notification', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    webpush.sent.length = 0;
    await enqueue(t, seat, 'telegraph');
    await advance(t, MINUTE);
    expect(webpush.sent.map((entry) => entry.payload.body)).toEqual([push.telegraphOne]);

    await enqueue(t, seat, 'telegraph');
    await advance(t, 20 * MINUTE);
    await enqueue(t, seat, 'telegraph');
    await advance(t, 20 * MINUTE);
    expect(webpush.sent).toHaveLength(1);
    expect(await queued(t, seat)).toHaveLength(2);

    await advance(t, HOUR);
    expect(webpush.sent.map((entry) => entry.payload.body)).toEqual([
      push.telegraphOne,
      push.telegraphMany(2),
    ]);
    expect(webpush.sent[1]!.payload.url).toBe(telegraphUrl);
  });

  it('ne retient pas une alarme derrière l’attente du télégraphe', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    webpush.sent.length = 0;
    await enqueue(t, seat, 'telegraph');
    await advance(t, MINUTE);
    await enqueue(t, seat, 'telegraph');
    await advance(t, MINUTE);
    await enqueue(t, seat, 'attack', 'une passe');
    await advance(t, MINUTE);

    expect(webpush.sent.map((entry) => entry.payload.body)).toEqual([
      push.telegraphOne,
      'une passe',
    ]);
  });

  it('supprime l’abonnement qu’un 410 révoque, et le garde sur une autre panne', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const subscribed = () =>
      t.query(api.notifications.subscribed, {
        token: seat.token,
        endpoint: 'https://fcm.googleapis.com/pierre',
      });

    webpush.failWith = 500;
    await enqueue(t, seat, 'attack');
    await advance(t, MINUTE);
    expect(await subscribed()).toBe(true);

    webpush.failWith = 410;
    await enqueue(t, seat, 'attack');
    await advance(t, MINUTE);
    expect(await subscribed()).toBe(false);
  });

  it('date le dernier envoi réussi sur l’appareil', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    await enqueue(t, seat, 'attack');
    await advance(t, MINUTE);

    const [device] = await devicesOf(t, seat.token);
    expect(device!.lastSentAt).not.toBeNull();
    expect(device!.lastSentAt!).toBeGreaterThanOrEqual(NOON + 2 * MINUTE);
  });

  it('refuse une adresse que le serveur n’a pas à appeler', async () => {
    const t = boot();
    const { seat } = await foundSeat(t, 'Pierre');
    for (const endpoint of [
      'http://fcm.googleapis.com/a',
      'https://10.0.0.5/a',
      'https://backend/a',
      'https://127.0.0.1.nip.io/a',
      'https://evil.example.com/a',
    ]) {
      await expect(subscribe(t, seat, endpoint)).rejects.toThrow('PUSH_ENDPOINT_INVALID');
    }
    expect(await devicesOf(t, seat.token)).toEqual([]);
  });

  it('ne garde que les dix derniers appareils d’un compte', async () => {
    const t = boot();
    const { seat } = await foundSeat(t, 'Pierre');
    for (let rank = 0; rank < 12; rank += 1) {
      vi.setSystemTime(NOON + rank * MINUTE);
      await subscribe(t, seat, `https://fcm.googleapis.com/${rank}`);
    }
    const kept = await devicesOf(t, seat.token);
    expect(kept.map((device) => device.endpoint).sort()).toEqual(
      Array.from({ length: 10 }, (_, rank) => `https://fcm.googleapis.com/${rank + 2}`).sort(),
    );
  });

  it('ne laisse partir qu’un essai à la fois', async () => {
    const t = boot();
    const { seat } = await foundSeat(t, 'Pierre');
    await subscribe(t, seat, 'https://fcm.googleapis.com/pierre');
    await t.mutation(api.notifications.sendTest, { token: seat.token });
    await t.mutation(api.notifications.sendTest, { token: seat.token });
    await drain(t);
    expect(webpush.sent).toHaveLength(1);

    vi.setSystemTime(Date.now() + 11_000);
    await t.mutation(api.notifications.sendTest, { token: seat.token });
    await drain(t);
    expect(webpush.sent).toHaveLength(2);
  });

  it('envoie la notification d’essai sans passer par la file', async () => {
    const t = boot();
    const { seat } = await foundSeat(t, 'Pierre');
    await subscribe(t, seat, 'https://fcm.googleapis.com/pierre');
    await t.mutation(api.notifications.sendTest, { token: seat.token });
    await drain(t);

    expect(webpush.sent).toHaveLength(1);
    expect(webpush.sent[0]!.payload.body).toMatch(/essai/);
  });
});

describe('le nettoyage', () => {
  it('emporte les lignes de file d’une saison détruite', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    await enqueue(t, seat, 'attack');
    await t.mutation(api.seasons.destroy, seat);

    expect(await t.run(async (ctx) => ctx.db.query('pushQueue').collect())).toEqual([]);
    expect(await t.run(async (ctx) => ctx.db.query('presences').collect())).toEqual([]);
  });
});
