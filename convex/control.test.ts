import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import type { LonLat } from '../src/domain/geo';
import { SEAT_INKS } from '../src/domain/control';
import { outpostReachKm } from './constants';
import { regionFacts, regionOfOutpost } from './regions';
import schema from './schema';
import { surveyFoundation, surveyFromPoint } from './surveys';
import { modules } from './test.setup';
import { foundSeat, joinSeat, seatIn } from './seats.fixture';
import type { Seat } from './seats.fixture';

/** Le rayon d'un point neuf : la portée suit le niveau depuis le 31/08, et ces cas plantent
 *  tous un avant-poste de niveau 1. */
const REACH_KM = outpostReachKm(1);

const boot = () => convexTest(schema, modules);

const PARIS = 'FRA-5333';
const MARNE = 'FRA-5323';
const PRAHOVA = 'ROU-310'; // Romanian oil, nobody's home country
const RUHR = 'DEU-1572'; // German ground, far out of any Romanian reach
/** **Une région immense, et un point dedans loin de son pôle d'inaccessibilité** : Fort McMurray
 *  se tient à 378 km du point que `region-index.json` donne à l'Alberta, trois fois la portée
 *  d'un avant-poste neuf. Sa voisine la Saskatchewan a le sien à 659 km. */
const ALBERTA = 'CAN-632';
const FORT_MCMURRAY: LonLat = [-111.38, 56.73];
const SASKATCHEWAN = 'CAN-631';

async function launchedSeason(t: ReturnType<typeof boot>) {
  const { seat, code } = await foundSeat(t, 'Pierre', 48, 0.5);
  const guest = await joinSeat(t, code, 'Léa');
  const third = await joinSeat(t, code, 'Marc');
  await t.mutation(api.players.reserveNation, { ...seat, nation: 'france' });
  await t.mutation(api.players.declareReady, { ...seat, ready: true });
  await t.mutation(api.players.reserveNation, { ...guest, nation: 'ussr' });
  await t.mutation(api.players.declareReady, { ...guest, ready: true });
  await t.mutation(api.players.reserveNation, { ...third, nation: 'usa' });
  await t.mutation(api.players.declareReady, { ...third, ready: true });
  await t.mutation(api.seasons.launch, seat);
  return { seat, guest, third };
}

const seatOf = async (t: ReturnType<typeof boot>, seat: Seat) =>
  t.run(async (ctx) => {
    const player = await seatIn(ctx, seat);
    return player;
  });

/**
 * Posé à la main, puis relevé exactement comme la fondation le fait (`movements.foundOutpostHere`) :
 * ce qui est sous test est la couleur et sa mémoire, pas la marche qui plante le point — elle a
 * ses propres tests (`movements.test.ts`).
 */
async function plant(
  t: ReturnType<typeof boot>,
  seat: Seat,
  point: LonLat,
  /** La région où il se plante — omise, le point se relit par le repli, comme ceux d'avant le
   *  champ (précision du 04/09). */
  regionId?: string,
  hostCountry = 'ROU',
) {
  const player = await seatOf(t, seat);
  /** Le sol du point, exactement comme la fondation l'écrit : la région que la carte a nommée,
   *  ou rien — et c'est alors le repli qui répond, ici comme là-bas. */
  const ground = {
    point: { lon: point[0], lat: point[1] },
    hostCountry,
    ...(regionId === undefined ? {} : { regionId }),
  };
  return t.run(async (ctx) => {
    const outpostId = await ctx.db.insert('outposts', {
      seasonId: player.seasonId,
      playerId: player._id,
      ...ground,
      level: 1,
      specialization: 'relay',
      foundedAt: Date.now(),
      disabledUntil: null,
      immuneUntil: null,
    });
    await surveyFoundation(
      ctx,
      player.seasonId,
      point,
      outpostReachKm(1),
      regionOfOutpost(ground),
      Date.now(),
    );
    return outpostId;
  });
}

/** **Une troupe posée**, et le relevé qu'elle dresse en se posant — l'autre point
 *  d'échantillonnage, celui qui va voir. */
async function post(t: ReturnType<typeof boot>, seat: Seat, point: LonLat) {
  const player = await seatOf(t, seat);
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

const heldBy = async (t: ReturnType<typeof boot>, seat: Seat, nickname: string) =>
  (await t.query(api.control.held, seat)).find((holder) => holder.nickname === nickname);

const regionIdsOf = async (t: ReturnType<typeof boot>, seat: Seat, nickname: string) =>
  ((await heldBy(t, seat, nickname))?.regions ?? []).map((region) => region.id);

const knownOf = async (t: ReturnType<typeof boot>, seat: Seat, regionId: string) => {
  for (const holder of await t.query(api.control.held, seat)) {
    const region = holder.regions.find((candidate) => candidate.id === regionId);
    if (region) return { holder: holder.nickname, ...region };
  }
  return null;
};

const surveyRows = async (t: ReturnType<typeof boot>, seat: Seat) => {
  const player = await seatOf(t, seat);
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
    const { seat } = await launchedSeason(t);

    const mine = await heldBy(t, seat, 'Pierre');
    expect(mine?.nation).toBe('france');
    expect((mine?.regions ?? []).map((region) => region.id)).toContain(PARIS);
    expect(await knownOf(t, seat, MARNE)).toMatchObject({ holder: 'Pierre', state: 'current' });
  });

  /** Le sol d'un autre est un sol comme un autre : savoir qui joue l'URSS ne dit pas où elle
   *  tient, et une région jamais observée n'a aucune couleur — vierge, jamais neutre. */
  it('says nothing at all of a region nobody went to look at', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);

    expect(await knownOf(t, seat, RUHR)).toBeNull();
    expect(await knownOf(t, seat, PRAHOVA)).toBeNull();
    expect(await heldBy(t, seat, 'Léa')).toBeUndefined();
    // Et réciproquement : Paris est français, la Russe ne le sait pas encore.
    expect(await knownOf(t, guest, PARIS)).toBeNull();
  });

  it('gives each seat its own ink, in the order they entered', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    expect((await heldBy(t, seat, 'Pierre'))?.ink).toBe(SEAT_INKS[0]);
    expect((await heldBy(t, guest, 'Léa'))?.ink).toBe(SEAT_INKS[1]);
  });

  it('leaves a seat still choosing out of the answer entirely', async () => {
    const t = boot();
    const { seat, code } = await foundSeat(t, 'Pierre', 48, 0.5);
    await joinSeat(t, code, 'Léa');
    expect(await t.query(api.control.held, seat)).toEqual([]);
  });
});

describe('an outpost colours what it reaches', () => {
  it('takes the neutral regions inside the reach and none beyond it', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    await plant(t, seat, regionFacts(PRAHOVA)!.point);

    const mine = await regionIdsOf(t, seat, 'Pierre');
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
    const { seat, guest } = await launchedSeason(t);
    await plant(t, guest, regionFacts(PARIS)!.point);

    expect(await knownOf(t, seat, PARIS)).toMatchObject({ holder: 'Pierre', state: 'current' });
    expect(await regionIdsOf(t, seat, 'Léa')).not.toContain(PARIS);
  });

  it('gives a disputed region to the nearest outpost', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const prahova = regionFacts(PRAHOVA)!.point;
    await plant(t, seat, eastOf(prahova, REACH_KM / 2));
    await plant(t, guest, eastOf(prahova, -REACH_KM / 4));

    // Les deux points regardent la même région : chacun y lit le même tenant, le plus proche.
    expect(await knownOf(t, seat, PRAHOVA)).toMatchObject({ holder: 'Léa', state: 'current' });
    expect(await knownOf(t, guest, PRAHOVA)).toMatchObject({ holder: 'Léa', state: 'current' });
  });
});

/**
 * **La précision du 04/09** : une région se mesure à son pôle d'inaccessibilité, et celui d'une
 * région grande comme l'Alberta est à 378 km de l'endroit où l'on plante. Un avant-poste ne
 * tenait donc même pas le sol sous ses pieds — le constat de la partie du 04/09, en Extrême-Orient
 * soviétique.
 */
describe('an outpost holds the region it stands in', () => {
  it('colours it from the foundation, whatever the distance to its point', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    await plant(t, seat, FORT_MCMURRAY, ALBERTA, 'CAN');

    expect(await regionIdsOf(t, seat, 'Pierre')).toContain(ALBERTA);
    expect(await knownOf(t, seat, ALBERTA)).toMatchObject({
      holder: 'Pierre',
      state: 'current',
    });
  });

  /** Un avant-poste d'avant-wipe ne porte pas le champ : il se relit par la géographie, bornée
   *  au pays où il se tient. Le repli part au prochain wipe. */
  it('reads a point planted before the field by its nearest region of the right country', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    await plant(t, seat, FORT_MCMURRAY, undefined, 'CAN');

    expect(await regionIdsOf(t, seat, 'Pierre')).toContain(ALBERTA);
  });

  /** La règle métrique ne bouge pas : on ajoute l'évidence qu'elle oubliait, et rien d'autre. */
  it('leaves the neighbouring region, whose point is out of the radius, to nobody', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    await plant(t, seat, FORT_MCMURRAY, ALBERTA, 'CAN');

    expect(await regionIdsOf(t, seat, 'Pierre')).not.toContain(SASKATCHEWAN);
    expect(await knownOf(t, seat, SASKATCHEWAN)).toBeNull();
  });
});

describe('a survey is a memory, and it goes stale', () => {
  it('keeps the holder it saw once the truth has changed behind its back', async () => {
    const t = boot();
    const { seat, guest, third } = await launchedSeason(t);
    const prahova = regionFacts(PRAHOVA)!.point;

    // B tient la Valachie, A va la relever, puis s'en va.
    const russian = await plant(t, guest, eastOf(prahova, -REACH_KM / 4));
    const sentry = await post(t, seat, prahova);
    expect(await knownOf(t, seat, PRAHOVA)).toMatchObject({ holder: 'Léa', state: 'current' });
    await leave(t, sentry);
    expect(await knownOf(t, seat, PRAHOVA)).toMatchObject({ holder: 'Léa', state: 'surveyed' });

    // B la perd au profit de C — un point plus proche — et A n'en sait rien.
    await raze(t, russian);
    await plant(t, third, prahova);
    expect(await knownOf(t, third, PRAHOVA)).toMatchObject({ holder: 'Marc', state: 'current' });
    // B non plus n'en sait rien : son point n'est plus là pour regarder, et un relevé ne se
    // corrige qu'en y retournant — fût-il le sien.
    expect(await knownOf(t, guest, PRAHOVA)).toMatchObject({ holder: 'Léa', state: 'surveyed' });
    expect(await knownOf(t, seat, PRAHOVA)).toMatchObject({ holder: 'Léa', state: 'surveyed' });

    // Il y renvoie une troupe : la couleur passe à C, franche.
    await post(t, seat, prahova);
    expect(await knownOf(t, seat, PRAHOVA)).toMatchObject({ holder: 'Marc', state: 'current' });
  });

  it('dates the survey at the moment it was taken, never at the reading', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const prahova = regionFacts(PRAHOVA)!.point;
    await plant(t, guest, prahova);

    const before = Date.now();
    const sentry = await post(t, seat, prahova);
    await leave(t, sentry);

    const known = await knownOf(t, seat, PRAHOVA);
    expect(known?.state).toBe('surveyed');
    expect(known?.state === 'surveyed' && known.seenAt).toBeGreaterThanOrEqual(before);
    expect(known?.state === 'surveyed' && known.seenAt).toBeLessThanOrEqual(Date.now());
  });

  /** Sinon un mouvement long à travers un continent réécrit des centaines de lignes pour rien. */
  it('writes nothing at all on a second pass that saw the same thing', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const prahova = regionFacts(PRAHOVA)!.point;
    await plant(t, guest, prahova);

    const player = await seatOf(t, seat);
    const first = await t.run((ctx) => surveyFromPoint(ctx, player._id, prahova, Date.now()));
    const second = await t.run((ctx) => surveyFromPoint(ctx, player._id, prahova, Date.now()));

    expect(first).toBeGreaterThan(0);
    expect(second).toBe(0);
  });

  /** Une région que personne ne tient ne fonde pas de ligne : les trois quarts du monde ne sont
   *  à personne, et une ligne « rien ici » par région traversée copierait le planisphère. */
  it('files no row for ground nobody holds, and puts out the one it corrects', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const prahova = regionFacts(PRAHOVA)!.point;

    const sentry = await post(t, seat, prahova);
    expect(await surveyRows(t, seat)).toHaveLength(0);

    const russian = await plant(t, guest, prahova);
    await leave(t, sentry);
    await post(t, seat, prahova);
    expect((await surveyRows(t, seat)).map((row) => row.regionId)).toContain(PRAHOVA);

    await raze(t, russian);
    await post(t, seat, prahova);
    expect(await knownOf(t, seat, PRAHOVA)).toBeNull();
  });

  it('never lets a player read another’s lines', async () => {
    const t = boot();
    const { seat, guest, third } = await launchedSeason(t);
    const prahova = regionFacts(PRAHOVA)!.point;
    await plant(t, third, prahova);

    const sentry = await post(t, guest, prahova);
    await leave(t, sentry);

    // La Russe a relevé, et elle seule : le Français n'a rien vu passer.
    expect(await knownOf(t, guest, PRAHOVA)).toMatchObject({ holder: 'Marc', state: 'surveyed' });
    expect(await knownOf(t, seat, PRAHOVA)).toBeNull();
    expect(await surveyRows(t, seat)).toHaveLength(0);
  });
});
