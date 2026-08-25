import { describe, expect, it } from 'vitest';
import { compassOf, type CompassTarget } from './compass-rose';
import { BUILDINGS, RESOURCES, type BuildingKey } from './ids';
import type { BuildSpec, PlayerView } from './player-view';

const view = {
  me: {
    nation: 'france',
    slots: { total: 4, used: 1 },
    outposts: [
      {
        id: 'AP-01',
        hostCountry: 'NOR',
        lonLat: [0, 0],
        specialization: 'relay',
        garrison: 4,
        isMine: true,
      },
    ],
    hqLevel: 1,
    buildingCap: 5,
    foundation: [],
    buildings: [],
    // Only home ground travels in the view: a region absent from it is a region the player
    // has no business building on, which is what the enemy-region test leans on.
    regions: [
      { id: 'FRA-5333', name: 'Paris', deposit: null, coastal: false, buildings: [] },
      {
        id: 'FRA-9999',
        name: 'Nord',
        deposit: 'coal',
        coastal: true,
        buildings: [{ key: 'mine', level: 1 }],
      },
    ],
    construction: null,
    constructionQueue: [],
    resources: Object.fromEntries(
      RESOURCES.map((key) => [key, { stock: 1000, ratePerHour: 0, cap: 1000 }]),
    ),
  },
  buildCatalog: Object.fromEntries(
    BUILDINGS.map((key) => [key, { cost: { alloy: 10 }, minutes: 20, unlockedAtHqLevel: 1 }]),
  ) as Record<BuildingKey, BuildSpec>,
  loadedAt: 0,
  opponents: [{ nation: 'italy' }, { nation: 'ussr' }],
} as unknown as PlayerView;

const labelsOf = (target: CompassTarget) =>
  compassOf(target, view)?.actions.map((action) => action.label) ?? null;

describe('radial menu', () => {
  it('only offers "view" on my own territory', () => {
    expect(labelsOf({ kind: 'country', country: 'FRA' })).toEqual(['Voir le pays']);
  });

  it('only offers "view" on an enemy nation — attack has no wired destination', () => {
    expect(labelsOf({ kind: 'country', country: 'ITA' })).toEqual(['Voir le pays']);
  });

  it('says a neutral country is held without offering anything more there', () => {
    const compass = compassOf({ kind: 'country', country: 'NOR' }, view);
    expect(compass?.actions.map((action) => action.label)).toEqual(['Voir le pays']);
    expect(compass?.kicker).toBe('pays neutre · avant-poste tenu');
  });

  /**
   * A column in flight is observed and never commanded: the fan on one of my forces holds the
   * land underneath and nothing else. No handler exists to redirect it — that is the check.
   */
  it('offers no order on a movement in flight', () => {
    const compass = compassOf(
      { kind: 'force', id: 'stack-home', country: 'FRA', name: '24 INF · 6 BLD', headcount: 30 },
      view,
    );
    expect(compass?.actions.map((action) => action.key)).toEqual(['view']);
    expect(compass?.kicker).toBe('ma force · 30 unités');
    expect(compass?.name).toBe('24 INF · 6 BLD');
  });

  it('stays shut on a force with no land under it — nothing left to offer', () => {
    expect(
      labelsOf({ kind: 'force', id: 'stack-sea', country: null, name: '12 ESC', headcount: 12 }),
    ).toBeNull();
  });

  it('names the nation when it is one, the country in French otherwise', () => {
    expect(compassOf({ kind: 'country', country: 'GBR' }, view)?.name).toBe('Royaume-Uni');
    expect(compassOf({ kind: 'country', country: 'ESP' }, view)?.name).toBe('Espagne');
  });

  it('gives the target’s nature to the context line', () => {
    expect(compassOf({ kind: 'country', country: 'FRA' }, view)?.kicker).toBe('mon territoire');
    expect(compassOf({ kind: 'country', country: 'ITA' }, view)?.kicker).toBe('nation adverse');
    expect(compassOf({ kind: 'country', country: 'ESP' }, view)?.kicker).toBe(
      'pays neutre · sans avant-poste',
    );
  });

  it('no action carries a cost we cannot quantify', () => {
    const compass = compassOf({ kind: 'country', country: 'ESP' }, view);
    expect(compass?.actions.find((action) => action.key === 'view')?.cost).toBeNull();
  });

  it('adds the crane on one of my regions, without taking the country’s actions away', () => {
    const compass = compassOf(
      { kind: 'region', id: 'FRA-5333', name: 'Paris', country: 'FRA' },
      view,
    );
    expect(compass?.actions.map((action) => action.label)).toEqual(['Bâtir ici', 'Voir le pays']);
    expect(compass?.actions[0]).toMatchObject({ pictogram: 'crane', regionId: 'FRA-5333' });
    expect(compass?.name).toBe('Paris');
    expect(compass?.kicker).toBe('région · France');
  });

  it('withdraws the crane on an enemy region, leaving the fan as it was', () => {
    expect(labelsOf({ kind: 'region', id: 'ITA-5422', name: 'Roma', country: 'ITA' })).toEqual([
      'Voir le pays',
    ]);
  });

  it('withdraws the crane where a building already stands — nothing can go up there', () => {
    expect(labelsOf({ kind: 'region', id: 'FRA-9999', name: 'Nord', country: 'FRA' })).toEqual([
      'Voir le pays',
    ]);
  });

  it('an outpost points back to its host country', () => {
    const compass = compassOf(
      { kind: 'outpost', id: 'AP-01', hostCountry: 'NOR', name: 'relais logistique' },
      view,
    );
    expect(compass?.kicker).toBe('avant-poste · Norvège');
    expect(compass?.actions).toEqual([expect.objectContaining({ key: 'view', country: 'NOR' })]);
  });
});

describe('in aim', () => {
  const column = {
    roles: ['infantry' as const],
    myRegionIds: new Set(['FRA-5333', 'FRA-9999']),
    myOutpostIds: new Set(['AP-01']),
    departureBuildings: new Set<BuildingKey>(['barracks']),
  };

  const aragon = {
    kind: 'point',
    lon: -0.9,
    lat: 41.6,
    regionId: 'ESP-1234',
    country: 'ESP',
    name: 'Aragón',
  } as const;

  it('shows the marches and nothing else — no crane, no "view"', () => {
    const compass = compassOf(aragon, view, column);
    expect(compass?.actions.map((action) => action.key)).toEqual(['aim', 'aim', 'aim']);
    expect(compass?.actions.map((action) => action.label)).toEqual(['marche', 'attaque', 'leurre']);
    expect(compass?.kicker).toBe('visée armée · 1 troupe');
  });

  /**
   * **Le leurre suit la marche et rien d'autre** (fiche 04) : il vise un point, jamais un
   * avant-poste — une feinte qui pourrait raider serait un raid — et il ne demande rien à la
   * pile, puisqu'il n'en emmène aucune.
   */
  it('offers the decoy wherever a march is aimed, and never at an outpost', () => {
    const point = compassOf(aragon, view, column);
    expect(point?.actions.at(-1)).toMatchObject({
      type: 'decoy',
      pictogram: 'silhouette',
      aim: { kind: 'point', lon: -0.9, lat: 41.6 },
    });
    const outpost = compassOf(
      { kind: 'outpost', id: 'AP-42', hostCountry: 'NOR', name: 'relais' },
      view,
      column,
    );
    expect(outpost?.actions.some((action) => action.key === 'aim' && action.type === 'decoy')).toBe(
      false,
    );
  });

  it('carries the aim and the type on the action, priced in slots', () => {
    const compass = compassOf(aragon, view, column);
    expect(compass?.actions[1]).toMatchObject({
      pictogram: 'rifles',
      type: 'attack',
      aim: { kind: 'point', lon: -0.9, lat: 41.6 },
      cost: '1 slot · 3 libres',
    });
  });

  /** The plainest order, and the only one that asks nothing of the ground it goes to
   *  (ADR 0019 §7): it walks on my own soil exactly as on somebody else's. */
  it('offers the march on any point, priced like the rest', () => {
    const compass = compassOf(aragon, view, column);
    expect(compass?.actions[0]).toMatchObject({
      type: 'march',
      aim: { kind: 'point', lon: -0.9, lat: 41.6 },
      cost: '1 slot · 3 libres',
    });
  });

  /**
   * Contextual, never greyed out — and never mute either: on my own ground no branch is drawn,
   * and the rose says why instead of not opening (ADR 0019).
   */
  it('draws no branch on an outpost of mine, and states the motive', () => {
    const outpost = compassOf(
      { kind: 'outpost', id: 'AP-01', hostCountry: 'NOR', name: 'relais' },
      view,
      column,
    );
    expect(outpost?.actions).toEqual([]);
    expect(outpost?.refusal).toBe('on ne marche pas sur les siens');
  });

  /**
   * The server marches at a region or at an outpost. Beyond the regions' fade-in threshold the
   * map only knows the country, and no aim can be made of it — the player comes closer.
   */
  it('stays shut on a whole country', () => {
    expect(compassOf({ kind: 'country', country: 'ESP' }, view, column)).toBeNull();
  });

  /**
   * The rose reads `refusalOf` and nothing else: a shut gate empties the **marches** there too —
   * and a hull on a shore with no quay is exactly the column that cannot guess why. The decoy
   * stays on the plate, since it asks nothing of the pile; the motive shows beside it rather
   * than instead of it.
   */
  it('names the shut gate when the column cannot leave the ground it stands on', () => {
    const naval = { ...column, roles: ['cargo' as const] };
    const compass = compassOf(aragon, view, naval);
    expect(compass?.actions.map((action) => action.label)).toEqual(['leurre']);
    expect(compass?.refusal).toBe(
      'aucun port là d’où part la colonne — on n’embarque pas sans quai',
    );
  });

  /**
   * Several types refuse for several reasons and one sentence shows: the one about the column,
   * because the map already says the rest. Here the raid answers "an outpost and nothing else",
   * which the player reads off the map — the missing berths, he does not.
   */
  it('shows the motive that belongs to the column rather than to the target', () => {
    const unferried = { ...column, roles: ['infantry' as const, 'escort' as const] };
    const compass = compassOf(
      { kind: 'point', lon: -30, lat: 40, regionId: null, country: null, name: 'haute mer' },
      view,
      { ...unferried, departureBuildings: new Set<BuildingKey>(['port']) },
    );
    expect(compass?.actions.map((action) => action.label)).toEqual(['leurre']);
    expect(compass?.refusal).toBe('1 place à embarquer pour 0 à bord — il en manque 1');
  });

  it('opens the same fan for that column once a port stands there', () => {
    const naval = {
      ...column,
      roles: ['cargo' as const],
      departureBuildings: new Set<BuildingKey>(['port']),
    };
    const compass = compassOf(aragon, view, naval);
    expect(compass?.actions.map((action) => action.label)).toEqual(['marche', 'attaque', 'leurre']);
  });

  /** Aiming, the map hands back a place at every scale: a region is never a target of its own,
   *  and founding does not go through the rose at all any more. */
  it('offers nothing on a region target — the fan only aims at places', () => {
    expect(
      compassOf({ kind: 'region', id: 'ESP-1234', name: 'Aragón', country: 'ESP' }, view, column),
    ).toBeNull();
  });
});

/**
 * The defect ADR 0019 names: zoomed out no region is drawn, so the aim used to find a country
 * and answer nothing. A point is a place at every scale, which is what closes it.
 */
describe('aiming at a point', () => {
  const column = {
    roles: ['infantry' as const],
    myRegionIds: new Set(['FRA-5333']),
    myOutpostIds: new Set(['AP-01']),
    departureBuildings: new Set<BuildingKey>(['barracks']),
  };

  it('opens a fan with no region under it at all — zoomed out, or at sea', () => {
    const compass = compassOf(
      { kind: 'point', lon: 25.2, lat: 44.6, regionId: null, country: 'ROU', name: 'Roumanie' },
      view,
      column,
    );
    expect(compass?.actions.map((action) => action.label)).toEqual(['marche', 'attaque', 'leurre']);
    expect(compass?.actions[1]).toMatchObject({
      type: 'attack',
      aim: { kind: 'point', lon: 25.2, lat: 44.6 },
    });
  });

  /**
   * The criterion of ADR 0019 §1: aiming at a point gives a point, at every scale — and nothing
   * else. The region drawn under the click is no aim of its own since founding stopped being a
   * march: what is left aims at places.
   */
  it('marches at the point and never at the region drawn under it', () => {
    const compass = compassOf(
      {
        kind: 'point',
        lon: 25.2,
        lat: 44.6,
        regionId: 'ROU-310',
        country: 'ROU',
        name: 'Prahova',
      },
      view,
      column,
    );
    expect(compass?.actions.map((action) => action.label)).toEqual(['marche', 'attaque', 'leurre']);
    expect(compass?.actions[0]).toMatchObject({ aim: { kind: 'point', lon: 25.2, lat: 44.6 } });
    expect(
      compass?.actions.some((action) => action.key === 'aim' && action.aim.kind === 'region'),
    ).toBe(false);
  });

  it('still opens over water, where no country answers', () => {
    const compass = compassOf(
      { kind: 'point', lon: -30, lat: 40, regionId: null, country: null, name: 'haute mer' },
      view,
      column,
    );
    expect(compass?.actions.map((action) => action.label)).toEqual(['marche', 'attaque', 'leurre']);
  });

  /**
   * The acceptance criterion of ADR 0019's second prompt: aiming from a zoomed-out board, at a
   * scale where no region is drawn, always answers something. Branches or motive, never silence.
   */
  it('answers a naval column standing on a portless shore, motive in hand', () => {
    const naval = { ...column, roles: ['cargo' as const] };
    const compass = compassOf(
      { kind: 'point', lon: 25.2, lat: 44.6, regionId: null, country: 'ROU', name: 'Roumanie' },
      view,
      naval,
    );
    expect(compass).not.toBeNull();
    /** Branches or motive, never silence — and depuis le leurre, souvent les deux. */
    expect(compass?.actions.map((action) => action.label)).toEqual(['leurre']);
    expect(compass?.refusal).toBe(
      'aucun port là d’où part la colonne — on n’embarque pas sans quai',
    );
  });
});
