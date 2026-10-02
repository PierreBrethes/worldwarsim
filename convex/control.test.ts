import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import type { LonLat } from '../src/domain/geo';
import { SEAT_INKS } from '../src/domain/control';
import { outpostReachKm } from './constants';
import { regionFacts } from './regions';
import schema from './schema';
import { surveyFoundation, surveyFromPoint } from './surveys';
import { modules } from './test.setup';
import { foundSeat, joinSeat, seatIn } from './seats.fixture';
import type { Seat } from './seats.fixture';

/** Le rayon d'un point neuf : la portée suit le niveau depuis le 31/08, et ces cas plantent
 *  tous un avant-poste de niveau 1. */
const REACH_KM = outpostReachKm(1);

const boot = () => convexTest({ schema, modules, transactionLimits: true });

const PARIS = 'FRA-5333';
const MARNE = 'FRA-5323';
const PRAHOVA = 'ROU-310'; // Romanian oil, nobody's home country
const RUHR = 'DEU-1572'; // German ground, far out of any Romanian reach
/**
 * **Une région immense, et un point dedans loin de son pôle d'inaccessibilité** : Fort McMurray
 * se tient à 378 km du point que `region-index.json` donne à l'Alberta, trois fois la portée d'un
 * avant-poste neuf. La frontière de la Saskatchewan, elle, est à 84 km — le 110e méridien — alors
 * que son pôle est à 659 km. Les deux mesures se contredisent sur ce point-là, et c'est ce qui a
 * fait réviser la règle le 17/09 : le disque tient la voisine, le pôle ne tenait rien.
 */
const ALBERTA = 'CAN-632';
const FORT_MCMURRAY: LonLat = [-111.38, 56.73];
const SASKATCHEWAN = 'CAN-631';
/** La Colombie-Britannique commence à plus de 600 km à l'ouest : aucune cellule dans le rayon. */
const BRITISH_COLUMBIA = 'CAN-633';

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
    await surveyFoundation(ctx, player.seasonId, point, outpostReachKm(1), Date.now());
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
 * **Le disque, et non le pôle** (révision du 17/09 de l'ADR 0020 §1). Une région se mesurait à son
 * pôle d'inaccessibilité, et celui d'une région grande comme l'Alberta est à 378 km de l'endroit
 * où l'on plante : la précision du 04/09 lui avait donné le sol sous ses pieds, sans rien pouvoir
 * pour la voisine dont la frontière court à 84 km. Elle est absorbée ici — la cellule du point est
 * à distance nulle, donc la même règle rend les deux.
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

  /**
   * **La voisine qu'on touche est tenue, celle qu'on ne touche pas ne l'est pas** : la Saskatchewan
   * commence à 84 km du point et son pôle est à 659 — sous l'ancienne règle elle n'était à
   * personne, et le rayon ne servait à rien hors d'Europe. La Colombie-Britannique, à plus de
   * 600 km, reste hors de tout.
   */
  it('holds the neighbour the disc touches, and nothing past it', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    await plant(t, seat, FORT_MCMURRAY, ALBERTA, 'CAN');

    expect(await regionIdsOf(t, seat, 'Pierre')).toContain(SASKATCHEWAN);
    expect(await knownOf(t, seat, SASKATCHEWAN)).toMatchObject({
      holder: 'Pierre',
      state: 'current',
    });
    expect(await regionIdsOf(t, seat, 'Pierre')).not.toContain(BRITISH_COLUMBIA);
    expect(await knownOf(t, seat, BRITISH_COLUMBIA)).toBeNull();
  });
});

/**
 * **Une mesure, deux lecteurs** (révision du 17/09 de l'ADR 0020 §1). « Là où je tiens est là où
 * je peux bâtir » n'est une phrase vraie que si la couleur et le sol offert sortent de la même
 * fonction : `heldOver` et la vue lisent tous deux `regionsWithinReach`. Deux géométries — le
 * disque d'un côté, le pôle de l'autre — laisseraient le joueur voir une région à sa couleur sans
 * y trouver la moindre icône de construction, ce qui est exactement ce qui se passait avant.
 */
describe('la couleur et le sol à bâtir ne peuvent pas diverger', () => {
  it('sert à bâtir chaque région que la carte lui donne', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    await plant(t, seat, FORT_MCMURRAY, ALBERTA, 'CAN');

    const held = await regionIdsOf(t, seat, 'Pierre');
    const view = await t.query(api.view.playerView, seat);
    const served = new Map(view.me.regions.map((region) => [region.id, region]));

    /** Le sol canadien du point : ni sa nation, ni celle de personne — tout ce qu'il y tient, il
     *  le tient par le disque, et c'est tout ce que ce cas compare. */
    const byTheDisc = held.filter((regionId) => regionId.startsWith('CAN-'));
    expect(byTheDisc).toContain(ALBERTA);
    expect(byTheDisc).toContain(SASKATCHEWAN);
    /**
     * **Servie *et* rattachée à un site.** La première version de ce cas ne vérifiait que la
     * présence dans `me.regions`, et c'est ce qui a laissé passer le trou du 17/09 : la vue
     * offrait la région, `siteFor` la mesurait encore au pôle et rendait `null`, donc le clic
     * droit n'y ouvrait rien et le serveur l'aurait refusée. Le site est ce qui fait la phrase.
     */
    for (const regionId of byTheDisc) {
      expect(served.get(regionId)?.site).toEqual({ outpostId: expect.any(String) });
    }
    /** Il dépouille les 4 589 régions deux fois — la couleur, puis la vue. Trois secondes seul,
     *  davantage quand la suite tourne à côté : le budget par défaut n'a jamais eu de marge. */
  }, 30_000);
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

/**
 * **Hors service, la zone se lit encore** (ADR 0020 §7, rendu du 15/09). Le point ne tient rien —
 * le classement ne le compte pas, ce qu'il couvre ne produit plus, une région disputée revient au
 * voisin — mais sa zone disparaissait de la carte de son propriétaire, qui n'avait plus rien à
 * lire là où il tenait la veille. Une quatrième forme, `suspended`, et elle n'est *pas* une
 * possession : c'est le souvenir d'une couleur et l'heure de son retour.
 */
describe('a disabled outpost suspends its zone rather than erasing it', () => {
  const disable = (t: ReturnType<typeof boot>, outpostId: Id<'outposts'>, hours = 6) =>
    t.run(async (ctx) => {
      const until = Date.now() + hours * 3_600_000;
      await ctx.db.patch(outpostId, { disabledUntil: until });
      return until;
    });

  it('serves the zone as suspended, with the hour it comes back', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const point = await plant(t, seat, regionFacts(PRAHOVA)!.point);
    expect(await knownOf(t, seat, PRAHOVA)).toMatchObject({ holder: 'Pierre', state: 'current' });

    const until = await disable(t, point);
    expect(await knownOf(t, seat, PRAHOVA)).toMatchObject({
      holder: 'Pierre',
      state: 'suspended',
      until,
    });
    /** Le sol national ne se suspend pas : aucun avant-poste ne le tient, donc aucun ne le perd. */
    expect(await knownOf(t, seat, PARIS)).toMatchObject({ holder: 'Pierre', state: 'current' });
  });

  /** Le relevé d'hier dit encore que ce sol est à lui : le peindre plein pendant la désactivation
   *  serait exactement le mensonge que la hachure existe pour éviter. */
  it('takes the stale survey of its own ground out of the holding', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const point = await plant(t, seat, regionFacts(PRAHOVA)!.point);
    await disable(t, point);

    const mine = (await heldBy(t, seat, 'Pierre'))!;
    const rows = mine.regions.filter((region) => region.id === PRAHOVA);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.state).toBe('suspended');
  });

  /** **À l'adversaire, rien** (ADR 0005) : lui donner l'heure du retour lui donnerait la durée
   *  d'un raid qu'il n'a pas forcément mené. Il voit un sol que personne ne tient, décoloré. */
  it('says nothing of the suspension to whoever observes the zone', async () => {
    const t = boot();
    const { seat, guest } = await launchedSeason(t);
    const prahova = regionFacts(PRAHOVA)!.point;
    const point = await plant(t, seat, prahova);
    await post(t, guest, prahova);
    await disable(t, point);

    for (const holder of await t.query(api.control.held, guest)) {
      for (const region of holder.regions) expect(region.state).not.toBe('suspended');
    }
    /** Ce qu'il lit reste son relevé, franc ou daté selon qu'il regarde — et **jamais** une
     *  suspension : la hachure et son heure n'existent que chez le propriétaire du point. */
    expect(await knownOf(t, guest, PRAHOVA)).toMatchObject({ holder: 'Pierre' });
  });

  /** **Les deux à la fois, et sans conflit** : une région disputée revient au voisin pendant la
   *  désactivation — c'est ce qu'un raid vient chercher — et elle reste suspendue chez moi. Deux
   *  lignes, deux tenants, et rien à départager au rendu : la hachure passe sous la couleur
   *  pleine. Que le voisin le *sache* est une autre question, celle de son relevé (§5) : il ne
   *  l'apprend qu'en y retournant, et son point s'en charge au prochain événement. */
  it('leaves a disputed region to the neighbour while holding its memory', async () => {
    const t = boot();
    const { seat, guest, third } = await launchedSeason(t);
    const prahova = regionFacts(PRAHOVA)!.point;
    const mine = await plant(t, seat, eastOf(prahova, REACH_KM / 4));
    await plant(t, guest, eastOf(prahova, REACH_KM / 2));
    expect(await knownOf(t, seat, PRAHOVA)).toMatchObject({ holder: 'Pierre', state: 'current' });

    await disable(t, mine);
    const suspended = (await heldBy(t, seat, 'Pierre'))!.regions.find(
      (region) => region.id === PRAHOVA,
    );
    expect(suspended?.state).toBe('suspended');
    // Un tiers qui vient regarder n'y trouve plus le Français : la région est bien à la Russe.
    await post(t, third, prahova);
    expect(await knownOf(t, third, PRAHOVA)).toMatchObject({ holder: 'Léa', state: 'current' });
  });

  /** La fenêtre se referme sur elle-même : passée l'heure, la couleur revient seule, sans que
   *  rien ne l'écrive — la vue se réinvalide au règlement de `disabledUntil`. */
  it('comes back full the moment the window closes', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const point = await plant(t, seat, regionFacts(PRAHOVA)!.point);
    await disable(t, point, -1);

    expect(await knownOf(t, seat, PRAHOVA)).toMatchObject({ holder: 'Pierre', state: 'current' });
  });

  /** **Un chantier n'est pas hors service** (révision du 15/09) : il n'a pas de couleur à se
   *  rappeler, il a une heure à attendre, et le mât la porte déjà. */
  it('suspends nothing for a foundation still under construction', async () => {
    const t = boot();
    const { seat } = await launchedSeason(t);
    const point = await plant(t, seat, regionFacts(PRAHOVA)!.point);
    await t.run(async (ctx) => ctx.db.patch(point, { standsAt: Date.now() + 3_600_000 }));

    for (const holder of await t.query(api.control.held, seat)) {
      for (const region of holder.regions) expect(region.state).not.toBe('suspended');
    }
  });
});
