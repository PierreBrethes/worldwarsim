import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import type { LonLat } from '../src/domain/geo';
import { SEAT_INKS } from '../src/domain/control';
import { OUTPOST_REACH_KM } from './constants';
import { regionFacts } from './regions';
import schema from './schema';
import { surveyFoundation, surveyFromPoint } from './surveys';
import { modules } from './test.setup';

const boot = () => convexTest(schema, modules);

const PARIS = 'FRA-5333';
const MARNE = 'FRA-5323';
const PRAHOVA = 'ROU-310'; // Romanian oil, nobody's home country
const RUHR = 'DEU-1572'; // German ground, far out of any Romanian reach

async function launchedSeason(t: ReturnType<typeof boot>) {
  const { code, token } = await t.mutation(api.seasons.create, {
    nickname: 'Pierre',
    durationHours: 48,
    compensation: 0.5,
  });
  const { token: guest } = await t.mutation(api.seasons.join, { code, nickname: 'Léa' });
  const { token: third } = await t.mutation(api.seasons.join, { code, nickname: 'Marc' });
  await t.mutation(api.players.reserveNation, { token, nation: 'france' });
  await t.mutation(api.players.declareReady, { token, ready: true });
  await t.mutation(api.players.reserveNation, { token: guest, nation: 'ussr' });
  await t.mutation(api.players.declareReady, { token: guest, ready: true });
  await t.mutation(api.players.reserveNation, { token: third, nation: 'usa' });
  await t.mutation(api.players.declareReady, { token: third, ready: true });
  await t.mutation(api.seasons.launch, { token });
  return { token, guest, third };
}

const seatOf = async (t: ReturnType<typeof boot>, token: string) =>
  t.run(async (ctx) => {
    const player = await ctx.db
      .query('players')
      .withIndex('byToken', (q) => q.eq('token', token))
      .unique();
    if (!player) throw new Error('player not found');
    return player;
  });

/**
 * Posé à la main, puis relevé exactement comme la fondation le fait (`movements.foundOutpostHere`) :
 * ce qui est sous test est la couleur et sa mémoire, pas la marche qui plante le point — elle a
 * ses propres tests (`movements.test.ts`).
 */
async function plant(t: ReturnType<typeof boot>, token: string, point: LonLat) {
  const player = await seatOf(t, token);
  return t.run(async (ctx) => {
    const outpostId = await ctx.db.insert('outposts', {
      seasonId: player.seasonId,
      playerId: player._id,
      point: { lon: point[0], lat: point[1] },
      hostCountry: 'ROU',
      level: 1,
      specialization: 'relay',
      foundedAt: Date.now(),
      disabledUntil: null,
      immuneUntil: null,
    });
    await surveyFoundation(ctx, player.seasonId, point, Date.now());
    return outpostId;
  });
}

/** **Une troupe posée**, et le relevé qu'elle dresse en se posant — l'autre point
 *  d'échantillonnage, celui qui va voir. */
async function post(t: ReturnType<typeof boot>, token: string, point: LonLat) {
  const player = await seatOf(t, token);
  return t.run(async (ctx) => {
    const troopId = await ctx.db.insert('troops', {
      seasonId: player.seasonId,
      playerId: player._id,
      role: 'infantry',
      tier: 1,
      nominalStrength: 50,
      currentStrength: 50,
      stationedAt: { lon: point[0], lat: point[1] },
    });
    await surveyFromPoint(ctx, player._id, point, Date.now());
    return troopId;
  });
}

const leave = (t: ReturnType<typeof boot>, troopId: Id<'troops'>) =>
  t.run(async (ctx) => ctx.db.delete(troopId));

const raze = (t: ReturnType<typeof boot>, outpostId: Id<'outposts'>) =>
  t.run(async (ctx) => ctx.db.delete(outpostId));

const heldBy = async (t: ReturnType<typeof boot>, token: string, nickname: string) =>
  (await t.query(api.control.held, { token })).find((holder) => holder.nickname === nickname);

const regionIdsOf = async (t: ReturnType<typeof boot>, token: string, nickname: string) =>
  ((await heldBy(t, token, nickname))?.regions ?? []).map((region) => region.id);

const knownOf = async (t: ReturnType<typeof boot>, token: string, regionId: string) => {
  for (const holder of await t.query(api.control.held, { token })) {
    const region = holder.regions.find((candidate) => candidate.id === regionId);
    if (region) return { holder: holder.nickname, ...region };
  }
  return null;
};

const surveyRows = async (t: ReturnType<typeof boot>, token: string) => {
  const player = await seatOf(t, token);
  return t.run(async (ctx) =>
    ctx.db
      .query('regionSightings')
      .withIndex('byPlayer', (q) => q.eq('playerId', player._id))
      .collect(),
  );
};

/** Un point à `km` à l'est d'un autre, à cette latitude — les cas ci-dessous se jouent juste
 *  en deçà ou juste au-delà de la portée. */
const eastOf = (point: LonLat, km: number): LonLat => [
  point[0] + km / (111.32 * Math.cos((point[1] * Math.PI) / 180)),
  point[1],
];

describe('the home ground is coloured from the launch', () => {
  it('holds the whole country of the caller, up to date and undated', async () => {
    const t = boot();
    const { token } = await launchedSeason(t);

    const mine = await heldBy(t, token, 'Pierre');
    expect(mine?.nation).toBe('france');
    expect((mine?.regions ?? []).map((region) => region.id)).toContain(PARIS);
    expect(await knownOf(t, token, MARNE)).toMatchObject({ holder: 'Pierre', state: 'current' });
  });

  /** Le sol d'un autre est un sol comme un autre : savoir qui joue l'URSS ne dit pas où elle
   *  tient, et une région jamais observée n'a aucune couleur — vierge, jamais neutre. */
  it('says nothing at all of a region nobody went to look at', async () => {
    const t = boot();
    const { token, guest } = await launchedSeason(t);

    expect(await knownOf(t, token, RUHR)).toBeNull();
    expect(await knownOf(t, token, PRAHOVA)).toBeNull();
    expect(await heldBy(t, token, 'Léa')).toBeUndefined();
    // Et réciproquement : Paris est français, la Russe ne le sait pas encore.
    expect(await knownOf(t, guest, PARIS)).toBeNull();
  });

  it('gives each seat its own ink, in the order they entered', async () => {
    const t = boot();
    const { token, guest } = await launchedSeason(t);
    expect((await heldBy(t, token, 'Pierre'))?.ink).toBe(SEAT_INKS[0]);
    expect((await heldBy(t, guest, 'Léa'))?.ink).toBe(SEAT_INKS[1]);
  });

  it('leaves a seat still choosing out of the answer entirely', async () => {
    const t = boot();
    const { code, token } = await t.mutation(api.seasons.create, {
      nickname: 'Pierre',
      durationHours: 48,
      compensation: 0.5,
    });
    await t.mutation(api.seasons.join, { code, nickname: 'Léa' });
    expect(await t.query(api.control.held, { token })).toEqual([]);
  });
});

describe('an outpost colours what it reaches', () => {
  it('takes the neutral regions inside the reach and none beyond it', async () => {
    const t = boot();
    const { token } = await launchedSeason(t);
    await plant(t, token, regionFacts(PRAHOVA)!.point);

    const mine = await regionIdsOf(t, token, 'Pierre');
    expect(mine).toContain(PRAHOVA);
    // Le sol allemand reste allemand : personne ne joue l'Allemagne, mais il est à mille
    // kilomètres de la Valachie et aucun avant-poste ne le couvre.
    expect(mine).not.toContain(RUHR);
    // Et le pays d'origine ne bouge pas : un avant-poste ajoute, il ne remplace pas.
    expect(mine).toContain(PARIS);
  });

  /** Poser un avant-poste chez quelqu'un donne le droit d'y bâtir, jamais celui d'y tenir le
   *  sol : une nation n'est jamais annexée (ADR 0004). */
  it('never takes a nation’s ground from under it', async () => {
    const t = boot();
    const { token, guest } = await launchedSeason(t);
    await plant(t, guest, regionFacts(PARIS)!.point);

    expect(await knownOf(t, token, PARIS)).toMatchObject({ holder: 'Pierre', state: 'current' });
    expect(await regionIdsOf(t, token, 'Léa')).not.toContain(PARIS);
  });

  it('gives a disputed region to the nearest outpost', async () => {
    const t = boot();
    const { token, guest } = await launchedSeason(t);
    const prahova = regionFacts(PRAHOVA)!.point;
    await plant(t, token, eastOf(prahova, OUTPOST_REACH_KM / 2));
    await plant(t, guest, eastOf(prahova, -OUTPOST_REACH_KM / 4));

    // Les deux points regardent la même région : chacun y lit le même tenant, le plus proche.
    expect(await knownOf(t, token, PRAHOVA)).toMatchObject({ holder: 'Léa', state: 'current' });
    expect(await knownOf(t, guest, PRAHOVA)).toMatchObject({ holder: 'Léa', state: 'current' });
  });
});

describe('a survey is a memory, and it goes stale', () => {
  it('keeps the holder it saw once the truth has changed behind its back', async () => {
    const t = boot();
    const { token, guest, third } = await launchedSeason(t);
    const prahova = regionFacts(PRAHOVA)!.point;

    // B tient la Valachie, A va la relever, puis s'en va.
    const russian = await plant(t, guest, eastOf(prahova, -OUTPOST_REACH_KM / 4));
    const sentry = await post(t, token, prahova);
    expect(await knownOf(t, token, PRAHOVA)).toMatchObject({ holder: 'Léa', state: 'current' });
    await leave(t, sentry);
    expect(await knownOf(t, token, PRAHOVA)).toMatchObject({ holder: 'Léa', state: 'surveyed' });

    // B la perd au profit de C — un point plus proche — et A n'en sait rien.
    await raze(t, russian);
    await plant(t, third, prahova);
    expect(await knownOf(t, third, PRAHOVA)).toMatchObject({ holder: 'Marc', state: 'current' });
    // B non plus n'en sait rien : son point n'est plus là pour regarder, et un relevé ne se
    // corrige qu'en y retournant — fût-il le sien.
    expect(await knownOf(t, guest, PRAHOVA)).toMatchObject({ holder: 'Léa', state: 'surveyed' });
    expect(await knownOf(t, token, PRAHOVA)).toMatchObject({ holder: 'Léa', state: 'surveyed' });

    // Il y renvoie une troupe : la couleur passe à C, franche.
    await post(t, token, prahova);
    expect(await knownOf(t, token, PRAHOVA)).toMatchObject({ holder: 'Marc', state: 'current' });
  });

  it('dates the survey at the moment it was taken, never at the reading', async () => {
    const t = boot();
    const { token, guest } = await launchedSeason(t);
    const prahova = regionFacts(PRAHOVA)!.point;
    await plant(t, guest, prahova);

    const before = Date.now();
    const sentry = await post(t, token, prahova);
    await leave(t, sentry);

    const known = await knownOf(t, token, PRAHOVA);
    expect(known?.state).toBe('surveyed');
    expect(known?.state === 'surveyed' && known.seenAt).toBeGreaterThanOrEqual(before);
    expect(known?.state === 'surveyed' && known.seenAt).toBeLessThanOrEqual(Date.now());
  });

  /** Sinon un mouvement long à travers un continent réécrit des centaines de lignes pour rien. */
  it('writes nothing at all on a second pass that saw the same thing', async () => {
    const t = boot();
    const { token, guest } = await launchedSeason(t);
    const prahova = regionFacts(PRAHOVA)!.point;
    await plant(t, guest, prahova);

    const player = await seatOf(t, token);
    const first = await t.run((ctx) => surveyFromPoint(ctx, player._id, prahova, Date.now()));
    const second = await t.run((ctx) => surveyFromPoint(ctx, player._id, prahova, Date.now()));

    expect(first).toBeGreaterThan(0);
    expect(second).toBe(0);
  });

  /** Une région que personne ne tient ne fonde pas de ligne : les trois quarts du monde ne sont
   *  à personne, et une ligne « rien ici » par région traversée copierait le planisphère. */
  it('files no row for ground nobody holds, and puts out the one it corrects', async () => {
    const t = boot();
    const { token, guest } = await launchedSeason(t);
    const prahova = regionFacts(PRAHOVA)!.point;

    const sentry = await post(t, token, prahova);
    expect(await surveyRows(t, token)).toHaveLength(0);

    const russian = await plant(t, guest, prahova);
    await leave(t, sentry);
    await post(t, token, prahova);
    expect((await surveyRows(t, token)).map((row) => row.regionId)).toContain(PRAHOVA);

    await raze(t, russian);
    await post(t, token, prahova);
    expect(await knownOf(t, token, PRAHOVA)).toBeNull();
  });

  it('never lets a player read another’s lines', async () => {
    const t = boot();
    const { token, guest, third } = await launchedSeason(t);
    const prahova = regionFacts(PRAHOVA)!.point;
    await plant(t, third, prahova);

    const sentry = await post(t, guest, prahova);
    await leave(t, sentry);

    // La Russe a relevé, et elle seule : le Français n'a rien vu passer.
    expect(await knownOf(t, guest, PRAHOVA)).toMatchObject({ holder: 'Marc', state: 'surveyed' });
    expect(await knownOf(t, token, PRAHOVA)).toBeNull();
    expect(await surveyRows(t, token)).toHaveLength(0);
  });
});
