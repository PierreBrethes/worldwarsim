import { describe, expect, it } from 'vitest';
import {
  heldRegions,
  knownRegions,
  surveyStops,
  type ControlledRegion,
  type Survey,
} from './control';
import type { LonLat } from './geo';

/** Sur l'équateur, un degré de longitude vaut ~111 km : les distances de ces cas se lisent. */
const at = (lon: number): LonLat => [lon, 0];

const region = (id: string, lon: number, country = 'ROU'): ControlledRegion => ({
  id,
  country,
  point: at(lon),
});

/**
 * **Ce qu'un disque touche, tendu à la main** (révision du 17/09) : `heldRegions` ne mesure plus
 * rien — elle reçoit par point la carte `région → distance à sa cellule la plus proche` que
 * `coveredByDisc` produit, et arbitre. Les cas de la mesure elle-même sont sur le raster réel
 * (`region-raster.test.ts`) ; ceux-ci sont ceux de l'arbitrage.
 */
const held = (
  regions: ReadonlyArray<ControlledRegion>,
  outposts: ReadonlyArray<{
    owner: string;
    covers: Record<string, number>;
    disabled?: boolean;
  }>,
  homeGrounds: ReadonlyArray<{ owner: string; country: string }> = [],
) =>
  heldRegions({
    regions,
    outposts: outposts.map(({ owner, covers, disabled }) => ({
      owner,
      covers: new Map(Object.entries(covers)),
      disabled: disabled ?? false,
    })),
    homeGrounds,
  });

describe('the colour follows the outpost', () => {
  it('holds a region the disc touches', () => {
    const map = held([region('near', 1)], [{ owner: 'pierre', covers: { near: 40 } }]);
    expect(map.get('near')).toBe('pierre');
  });

  it('leaves a region no disc touches to nobody', () => {
    const map = held([region('far', 10)], [{ owner: 'pierre', covers: { near: 40 } }]);
    expect(map.has('far')).toBe(false);
    expect(map.size).toBe(0);
  });

  /** ADR 0020 §7 : un point hors service décolore sa zone pendant toute la désactivation. */
  it('holds nothing while the outpost is out of service', () => {
    const map = held(
      [region('near', 1)],
      [{ owner: 'pierre', covers: { near: 0 }, disabled: true }],
    );
    expect(map.size).toBe(0);
  });

  it('hands a disputed region to the neighbour while the nearer point is out of service', () => {
    const map = held(
      [region('between', 1)],
      [
        { owner: 'pierre', covers: { between: 30 }, disabled: true },
        { owner: 'anna', covers: { between: 90 } },
      ],
    );
    expect(map.get('between')).toBe('anna');
  });

  it('holds nothing at all without an outpost', () => {
    expect(held([region('anywhere', 0)], []).size).toBe(0);
  });

  /** La réponse ne porte que sur les régions demandées : le classement en dépouille 4 589, la
   *  production une poignée, et un disque qui en touche d'autres n'en ajoute aucune. */
  it('answers on the regions asked for and on no others', () => {
    const map = held([region('asked', 0)], [{ owner: 'pierre', covers: { asked: 0, other: 0 } }]);
    expect([...map.keys()]).toEqual(['asked']);
  });
});

/**
 * **La précision du 04/09 est absorbée** (révision du 17/09) : la cellule du point est dans son
 * disque à distance nulle, donc un avant-poste tient la région où il se tient sans que la règle
 * ait une seconde branche — et deux rivaux plantés dans la même région y sont tous deux à zéro,
 * donc à égalité, donc personne, ce que le litige disait déjà.
 */
describe('a point holds the region it stands in', () => {
  it('holds it however vast the region is', () => {
    const map = held([region('vast', 10)], [{ owner: 'pierre', covers: { vast: 0 } }]);
    expect(map.get('vast')).toBe('pierre');
  });

  it('leaves a region two rivals stand in to nobody', () => {
    const map = held(
      [region('vast', 10)],
      [
        { owner: 'pierre', covers: { vast: 0 } },
        { owner: 'lea', covers: { vast: 0 } },
      ],
    );
    expect(map.has('vast')).toBe(false);
  });
});

describe('a disputed region goes to the nearest', () => {
  it('gives it to the closer outpost, whatever the order they arrive in', () => {
    const outposts = [
      { owner: 'lea', covers: { between: 160 } },
      { owner: 'pierre', covers: { between: 55 } },
    ];
    expect(held([region('between', 0.5)], outposts).get('between')).toBe('pierre');
    // The same list read backwards answers the same: the rule is the distance, not the order.
    expect(held([region('between', 0.5)], [...outposts].reverse()).get('between')).toBe('pierre');
  });

  /** Un départage arbitraire — l'ordre d'insertion, le nom du joueur — serait une règle que rien
   *  n'énonce et qu'aucun joueur ne pourrait lire sur la carte. */
  it('leaves an exact tie to nobody', () => {
    const map = held(
      [region('middle', 1)],
      [
        { owner: 'pierre', covers: { middle: 111 } },
        { owner: 'lea', covers: { middle: 111 } },
      ],
    );
    expect(map.has('middle')).toBe(false);
  });

  it('is not a dispute when both outposts are the same player’s', () => {
    const map = held(
      [region('middle', 1)],
      [
        { owner: 'pierre', covers: { middle: 111 } },
        { owner: 'pierre', covers: { middle: 111 } },
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
      [{ owner: 'lea', covers: { paris: 0 } }],
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
    const map = held(
      [region('bucarest', 0, 'ROU')],
      [{ owner: 'lea', covers: { bucarest: 0 } }],
      [],
    );
    expect(map.get('bucarest')).toBe('lea');
  });
});

describe('a captured building colours its region', () => {
  it('outranks the home ground and any outpost, for its capturer', () => {
    const map = heldRegions({
      regions: [region('lyon', 0, 'FRA'), region('bucarest', 5)],
      outposts: [{ owner: 'lea', covers: new Map([['bucarest', 0]]), disabled: false }],
      homeGrounds: [{ owner: 'pierre', country: 'FRA' }],
      occupations: [
        { regionId: 'lyon', owner: 'lea' },
        { regionId: 'bucarest', owner: 'pierre' },
      ],
    });
    expect(map.get('lyon')).toBe('lea');
    expect(map.get('bucarest')).toBe('pierre');
  });

  it('shows its owner and its loser the occupation as current', () => {
    const known = knownRegions({
      home: { owner: 'pierre', regionIds: ['paris', 'lyon'] },
      covered: new Set(),
      surveys: [],
      occupied: new Map([['lyon', 'lea']]),
    });
    expect(known).toEqual([
      { regionId: 'paris', owner: 'pierre', state: 'current' },
      { regionId: 'lyon', owner: 'lea', state: 'current' },
    ]);
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
