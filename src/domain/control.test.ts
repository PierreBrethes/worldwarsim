import { describe, expect, it } from 'vitest';
import {
  coveredRegions,
  FADED_WASH,
  heldRegions,
  knownRegions,
  seatInk,
  SEAT_INKS,
  surveyStops,
  surveyWash,
  type ControlledRegion,
  type Survey,
} from './control';
import type { LonLat } from './geo';

/** **Le rayon du fixture, pas celui du jeu** : la portée suit le niveau du point depuis le
 *  31/08 (`outpostReachKm`), et ces cas se lisent en degrés d'équateur — les figer ici garde le
 *  test sur la règle plutôt que sur la valeur d'équilibrage du jour. */
const REACH_KM = 400;

/** Sur l'équateur, un degré de longitude vaut ~111 km : les distances de ces cas se lisent. */
const at = (lon: number): LonLat => [lon, 0];

const region = (id: string, lon: number, country = 'ROU'): ControlledRegion => ({
  id,
  country,
  point: at(lon),
});

const held = (
  regions: ReadonlyArray<ControlledRegion>,
  outposts: ReadonlyArray<{
    owner: string;
    point: LonLat;
    reachKm?: number;
    regionId?: string;
  }>,
  homeGrounds: ReadonlyArray<{ owner: string; country: string }> = [],
) =>
  heldRegions({
    regions,
    outposts: outposts.map((outpost) => ({ reachKm: REACH_KM, regionId: null, ...outpost })),
    homeGrounds,
  });

describe('the colour follows the outpost', () => {
  it('holds a region whose point falls inside the reach', () => {
    const map = held([region('near', 1)], [{ owner: 'pierre', point: at(0) }]);
    expect(map.get('near')).toBe('pierre');
  });

  it('leaves a region beyond the reach to nobody', () => {
    // Ten degrees out on the equator: well past the four hundred kilometres.
    const map = held([region('far', 10)], [{ owner: 'pierre', point: at(0) }]);
    expect(map.has('far')).toBe(false);
    expect(map.size).toBe(0);
  });

  it('holds nothing at all without an outpost', () => {
    expect(held([region('anywhere', 0)], []).size).toBe(0);
  });
});

/**
 * **Chaque point porte son rayon** (révision du 31/08) : il suit le niveau, donc deux avant-postes
 * de la même saison ne couvrent pas le même cercle, et « le plus proche » ne veut plus dire « le
 * plus proche tout court ».
 */
describe('the reach travels with the point', () => {
  it('holds nothing from a point whose own reach falls short', () => {
    const map = held([region('near', 1)], [{ owner: 'pierre', point: at(0), reachKm: 60 }]);
    expect(map.size).toBe(0);
  });

  it('gives the region to the point that reaches, never to a nearer one that does not', () => {
    const map = held(
      [region('between', 1)],
      [
        { owner: 'pierre', point: at(0.5), reachKm: 30 },
        { owner: 'lea', point: at(2), reachKm: 240 },
      ],
    );
    expect(map.get('between')).toBe('lea');
  });
});

/**
 * **La précision du 04/09** : une région se mesure à son pôle d'inaccessibilité, et celui d'une
 * grande région est à des centaines de kilomètres de la côte où l'on plante. Un avant-poste ne
 * tenait donc même pas le sol sous ses pieds.
 */
describe('a point holds the region it stands in', () => {
  it('holds it however far the region’s own point is', () => {
    // Dix degrés d'équateur : bien au-delà des quatre cents kilomètres de portée.
    const map = held([region('vast', 10)], [{ owner: 'pierre', point: at(0), regionId: 'vast' }]);
    expect(map.get('vast')).toBe('pierre');
  });

  it('does not widen the radius for anything else', () => {
    const map = held(
      [region('vast', 10), region('next', 11)],
      [{ owner: 'pierre', point: at(0), regionId: 'vast' }],
    );
    expect(map.has('next')).toBe(false);
  });

  /** Deux points adverses plantés dans la même région sont à égalité exacte : personne ne la
   *  tient, ce que la règle du litige dit déjà — la précision ne lui ajoute pas d'exception. */
  it('leaves a region two rivals stand in to nobody', () => {
    const map = held(
      [region('vast', 10)],
      [
        { owner: 'pierre', point: at(0), regionId: 'vast' },
        { owner: 'lea', point: at(20), regionId: 'vast' },
      ],
    );
    expect(map.has('vast')).toBe(false);
  });
});

describe('a disputed region goes to the nearest', () => {
  it('gives it to the closer outpost, whatever the order they arrive in', () => {
    const outposts = [
      { owner: 'lea', point: at(2) },
      { owner: 'pierre', point: at(0) },
    ];
    expect(held([region('between', 0.5)], outposts).get('between')).toBe('pierre');
    expect(held([region('between', 1.5)], outposts).get('between')).toBe('lea');
    // The same list read backwards answers the same: the rule is the distance, not the order.
    expect(held([region('between', 0.5)], [...outposts].reverse()).get('between')).toBe('pierre');
  });

  /** Un départage arbitraire — l'ordre d'insertion, le nom du joueur — serait une règle que rien
   *  n'énonce et qu'aucun joueur ne pourrait lire sur la carte. */
  it('leaves an exact tie to nobody', () => {
    const map = held(
      [region('middle', 1)],
      [
        { owner: 'pierre', point: at(0) },
        { owner: 'lea', point: at(2) },
      ],
    );
    expect(map.has('middle')).toBe(false);
  });

  it('is not a dispute when both outposts are the same player’s', () => {
    const map = held(
      [region('middle', 1)],
      [
        { owner: 'pierre', point: at(0) },
        { owner: 'pierre', point: at(2) },
      ],
    );
    expect(map.get('middle')).toBe('pierre');
  });
});

describe('the home ground outranks any outpost', () => {
  /** Poser un avant-poste chez quelqu'un donne le droit d'y bâtir, jamais celui d'y tenir le
   *  sol : une nation n'est jamais annexée (ADR 0004). */
  it('keeps a national region to its nation under an enemy outpost', () => {
    const map = held(
      [region('paris', 0, 'FRA')],
      [{ owner: 'lea', point: at(0) }],
      [{ owner: 'pierre', country: 'FRA' }],
    );
    expect(map.get('paris')).toBe('pierre');
  });

  it('colours the whole home country from the launch, outpost or not', () => {
    const map = held(
      [region('paris', 0, 'FRA'), region('nice', 5, 'FRA')],
      [],
      [{ owner: 'pierre', country: 'FRA' }],
    );
    expect([...map.values()]).toEqual(['pierre', 'pierre']);
  });

  it('leaves a nation nobody plays to the outposts', () => {
    const map = held([region('bucarest', 0, 'ROU')], [{ owner: 'lea', point: at(0) }], []);
    expect(map.get('bucarest')).toBe('lea');
  });
});

describe('the seat inks', () => {
  it('gives the eight seats eight distinct inks', () => {
    expect(new Set(SEAT_INKS).size).toBe(8);
    expect(SEAT_INKS.every((ink) => /^#[0-9a-f]{6}$/.test(ink))).toBe(true);
  });

  it('answers an ink for every rank, the ninth included', () => {
    expect(seatInk(0)).toBe(SEAT_INKS[0]);
    expect(seatInk(7)).toBe(SEAT_INKS[7]);
    expect(seatInk(8)).toBe(SEAT_INKS[0]);
  });
});

describe('what a set of ranges covers', () => {
  const world = [region('here', 0), region('near', 1), region('far', 10)];

  it('takes the regions inside a range and none beyond it', () => {
    const covered = coveredRegions(world, [{ point: at(0), radiusKm: 200, regionId: null }]);
    expect([...covered]).toEqual(['here', 'near']);
  });

  /** Ce qu'un point tient, il le voit : la région où il se tient est couverte avant toute
   *  mesure, sinon la bande de latitude la retirerait la première. */
  it('covers the region a range stands in, whatever the distance to its point', () => {
    const covered = coveredRegions(world, [{ point: at(0), radiusKm: 50, regionId: 'far' }]);
    expect([...covered].sort()).toEqual(['far', 'here']);
  });

  it('covers nothing at all without a single range', () => {
    expect(coveredRegions(world, []).size).toBe(0);
  });

  it('unions the ranges rather than intersecting them', () => {
    const covered = coveredRegions(world, [
      { point: at(0), radiusKm: 50, regionId: null },
      { point: at(10), radiusKm: 50, regionId: null },
    ]);
    expect([...covered].sort()).toEqual(['far', 'here']);
  });

  /** La bande de latitude est un filtre, jamais une règle : une région à la bonne latitude et à
   *  l'autre bout du monde doit rester dehors. */
  it('keeps the latitude band from letting a far meridian through', () => {
    const covered = coveredRegions(
      [{ id: 'antipode', country: 'ROU', point: [179, 0] }],
      [{ point: at(0), radiusKm: 400, regionId: null }],
    );
    expect(covered.size).toBe(0);
  });
});

describe('the stops a route surveys from', () => {
  const line = (count: number): ReadonlyArray<LonLat> =>
    Array.from({ length: count }, (_, step) => [step * 0.05, 0] as LonLat);

  it('keeps the first and the last, whatever the spacing', () => {
    const stops = surveyStops(line(100), 60);
    expect(stops[0]).toEqual([0, 0]);
    expect(stops.at(-1)).toEqual([99 * 0.05, 0]);
  });

  /** Une maille de grille tous les cinq kilomètres ne vaut pas une halte : sans ce pas, un
   *  trajet transcontinental testerait ses centaines de sommets contre 4 589 régions. */
  it('thins a dense polyline to a handful of stops', () => {
    const points = line(100);
    const stops = surveyStops(points, 60);
    expect(stops.length).toBeLessThan(points.length / 4);
    expect(stops.length).toBeGreaterThan(1);
  });

  it('answers a single stop for a single point, and nothing for none', () => {
    expect(surveyStops([[3, 4]], 60)).toEqual([[3, 4]]);
    expect(surveyStops([], 60)).toEqual([]);
  });
});

describe('what a player knows of a region', () => {
  const survey = (regionId: string, owner: string | null, seenAt = 1_000): Survey => ({
    regionId,
    owner,
    seenAt,
  });

  it('holds its own ground up to date, and never dates it', () => {
    const known = knownRegions({
      home: { owner: 'pierre', regionIds: ['paris'] },
      covered: new Set(),
      surveys: [],
    });
    expect(known).toEqual([{ regionId: 'paris', owner: 'pierre', state: 'current' }]);
  });

  /** Une nation n'est jamais annexée (ADR 0004) : un relevé qui la dirait à quelqu'un d'autre
   *  est une ligne périmée, jamais une vérité à afficher. */
  it('lets no survey overrule the caller’s own ground', () => {
    const known = knownRegions({
      home: { owner: 'pierre', regionIds: ['paris'] },
      covered: new Set(),
      surveys: [survey('paris', 'lea')],
    });
    expect(known).toEqual([{ regionId: 'paris', owner: 'pierre', state: 'current' }]);
  });

  it('dates a survey outside its ranges and leaves the covered one franche', () => {
    const known = knownRegions({
      home: { owner: 'pierre', regionIds: [] },
      covered: new Set(['watched']),
      surveys: [survey('watched', 'lea', 500), survey('remembered', 'lea', 500)],
    });
    expect(known).toEqual([
      { regionId: 'watched', owner: 'lea', state: 'current' },
      { regionId: 'remembered', owner: 'lea', state: 'surveyed', seenAt: 500 },
    ]);
  });

  /** Vierge et « vue tenue par personne » se ressemblent à l'écran, et c'est voulu : ni l'une ni
   *  l'autre n'a de couleur. */
  it('returns nothing for ground seen held by nobody', () => {
    const known = knownRegions({
      home: { owner: 'pierre', regionIds: [] },
      covered: new Set(),
      surveys: [survey('empty', null)],
    });
    expect(known).toEqual([]);
  });
});

describe('a survey fades with its age', () => {
  const DAY = 24 * 3_600_000;

  it('is franche the instant it is taken', () => {
    expect(surveyWash(0, DAY)).toBe(1);
  });

  it('never goes below the floor, however old', () => {
    expect(surveyWash(DAY, DAY)).toBe(FADED_WASH);
    expect(surveyWash(DAY * 30, DAY)).toBe(FADED_WASH);
  });

  /** Cranté, sinon la géométrie fusionnée se referait à chaque battement pour un pixel. */
  it('answers in steps rather than a continuum', () => {
    const washes = new Set(
      Array.from({ length: 200 }, (_, step) => surveyWash((step * DAY) / 200, DAY)),
    );
    expect(washes.size).toBeLessThanOrEqual(5);
  });

  it('fades monotonically', () => {
    expect(surveyWash(DAY / 4, DAY)).toBeGreaterThan(surveyWash(DAY / 2, DAY));
    expect(surveyWash(DAY / 2, DAY)).toBeGreaterThan(surveyWash(DAY, DAY) - 0.0001);
  });
});
