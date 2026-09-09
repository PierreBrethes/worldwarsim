import { describe, expect, it } from 'vitest';
import { compassOf, type CompassTarget } from './compass-rose';
import { BUILDINGS, RESOURCES, type BuildingKey } from './ids';
import type { BuildSpec, Cost, PlayerView } from './player-view';

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
    siteSlots: [{ site: { outpostId: null }, taken: 0, total: 2 }],
    homeSlotRelief: null,
    foundation: [],
    buildings: [],
    // Only home ground travels in the view: a region absent from it is a region the player
    // has no business building on, which is what the enemy-region test leans on.
    regions: [
      {
        id: 'FRA-5333',
        name: 'Paris',
        deposit: null,
        coastal: false,
        buildings: [],
        site: { outpostId: null },
      },
      {
        id: 'FRA-9999',
        name: 'Nord',
        deposit: 'coal',
        coastal: true,
        buildings: [{ key: 'mine', level: 1 }],
        site: { outpostId: null },
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
  arcs: [],
  loadedAt: 0,
  opponents: [{ nation: 'italy' }, { nation: 'ussr' }],
} as unknown as PlayerView;

const labelsOf = (target: CompassTarget) =>
  compassOf(target, view)?.actions.map((action) => action.label) ?? null;

/**
 * **« Voir le pays » est retiré** (décision Pierre, 31/08) : il doublait le clic gauche, qui
 * sélectionne déjà ce qu'il touche. La rose ne s'ouvre donc plus que là où il y a quelque chose
 * à faire — bâtir, fonder, marcher — et reste close partout ailleurs.
 */
describe('radial menu', () => {
  it('stays shut on a country, mine or not — nothing is done to a whole country', () => {
    expect(compassOf({ kind: 'country', country: 'FRA' }, view)).toBeNull();
    expect(compassOf({ kind: 'country', country: 'ITA' }, view)).toBeNull();
    expect(compassOf({ kind: 'country', country: 'NOR' }, view)).toBeNull();
  });

  /**
   * A column in flight is observed and never commanded: no handler exists to redirect it — that
   * is the check. It carries no address either, so nothing can be founded under it.
   */
  it('offers no order on a movement in flight', () => {
    expect(
      compassOf(
        {
          kind: 'force',
          onLand: true,
          id: 'stack-home',
          country: 'FRA',
          name: '24 INF · 6 BLD',
          headcount: 30,
          station: null,
          regionId: null,
        },
        view,
      ),
    ).toBeNull();
  });

  it('stays shut on a force with no land under it — nothing left to offer', () => {
    expect(
      labelsOf({
        kind: 'force',
        onLand: true,
        id: 'stack-sea',
        country: null,
        name: '12 ESC',
        headcount: 12,
        station: null,
        regionId: null,
      }),
    ).toBeNull();
  });

  /** Le pays garde son nom et sa qualification : la région les lui emprunte pour son cartouche. */
  it('names the nation when it is one, the country in French otherwise', () => {
    expect(
      compassOf({ kind: 'region', id: 'GBR-1', name: 'Kent', country: 'GBR' }, view),
    ).toBeNull();
    expect(
      compassOf({ kind: 'region', id: 'FRA-5333', name: 'Paris', country: 'FRA' }, view)?.kicker,
    ).toBe('région · France');
  });

  it('adds the crane on one of my regions, and it is the whole fan', () => {
    const compass = compassOf(
      { kind: 'region', id: 'FRA-5333', name: 'Paris', country: 'FRA' },
      view,
    );
    expect(compass?.actions.map((action) => action.label)).toEqual(['Bâtir ici']);
    expect(compass?.actions[0]).toMatchObject({ pictogram: 'crane', regionId: 'FRA-5333' });
    expect(compass?.actions[0]?.cost).toBeNull();
    expect(compass?.name).toBe('Paris');
    expect(compass?.kicker).toBe('région · France');
  });

  it('withdraws the crane on an enemy region, and the fan closes with it', () => {
    expect(labelsOf({ kind: 'region', id: 'ITA-5422', name: 'Roma', country: 'ITA' })).toBeNull();
  });

  it('withdraws the crane where a building already stands — nothing can go up there', () => {
    expect(labelsOf({ kind: 'region', id: 'FRA-9999', name: 'Nord', country: 'FRA' })).toBeNull();
  });

  it('stays shut on an outpost that is not being marched at', () => {
    expect(
      compassOf(
        { kind: 'outpost', id: 'AP-01', hostCountry: 'NOR', name: 'relais', coastal: false },
        view,
      ),
    ).toBeNull();
  });
});

describe('in aim', () => {
  const column = {
    roles: ['infantry' as const],
    myRegionIds: new Set(['FRA-5333', 'FRA-9999']),
    myOutpostIds: new Set(['AP-01']),
    departureBuildings: new Set<BuildingKey>(['barracks']),
    afloat: false,
    coastal: false,
  };

  const aragon = {
    kind: 'point',
    lon: -0.9,
    lat: 41.6,
    regionId: 'ESP-1234',
    country: 'ESP',
    name: 'Aragón',
    onLand: true,
    coastal: false,
  } as const;

  it('shows the marches and nothing else — no crane, no "view"', () => {
    const compass = compassOf(aragon, view, column, true);
    expect(compass?.actions.map((action) => action.key)).toEqual(['aim', 'aim']);
    expect(compass?.actions.map((action) => action.label)).toEqual(['marche', 'attaque']);
    expect(compass?.kicker).toBe('visée armée · 1 troupe');
  });

  /**
   * **On n'ordonne un assaut que sur un objectif identifié** (décision Pierre, 29/08) : le
   * renseignement devient le préalable de l'attaque. La marche reste offerte partout — l'agression
   * à l'aveugle passe par elle, et en subit l'interception.
   */
  it('withholds the attack where the player’s view shows nothing to strike', () => {
    const compass = compassOf(aragon, view, column, false);
    expect(compass?.actions.map((action) => action.label)).toEqual(['marche']);
    expect(compass?.refusal).toBeNull();
  });

  it('carries the aim and the type on the action, priced in slots', () => {
    const compass = compassOf(aragon, view, column, true);
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
    const compass = compassOf(aragon, view, column, true);
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
      { kind: 'outpost', id: 'AP-01', hostCountry: 'NOR', name: 'relais', coastal: false },
      view,
      column,
      true,
    );
    expect(outpost?.actions).toEqual([]);
    expect(outpost?.refusal).toBe('on ne marche pas sur les siens');
  });

  /**
   * The server marches at a region or at an outpost. Beyond the regions' fade-in threshold the
   * map only knows the country, and no aim can be made of it — the player comes closer.
   */
  it('stays shut on a whole country', () => {
    expect(compassOf({ kind: 'country', country: 'ESP' }, view, column, true)).toBeNull();
  });

  /**
   * The rose reads `refusalOf` and nothing else: a shut gate empties the **marches** there too —
   * and a hull on a shore with no quay is exactly the column that cannot guess why. Depuis que le
   * leurre a quitté la plate, il ne reste que le motif — et c'est bien le cas que l'ADR 0019
   * voulait sortir du silence.
   */
  it('names the shut gate when the column cannot leave the ground it stands on', () => {
    const naval = { ...column, roles: ['cargo' as const] };
    const compass = compassOf(aragon, view, naval, true);
    expect(compass?.actions).toEqual([]);
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
      {
        kind: 'point',
        lon: -30,
        lat: 40,
        regionId: null,
        country: null,
        name: 'haute mer',
        onLand: false,
        coastal: false,
      },
      view,
      { ...unferried, departureBuildings: new Set<BuildingKey>(['port']) },
      true,
    );
    expect(compass?.actions).toEqual([]);
    expect(compass?.refusal).toBe('1 place à embarquer pour 0 à bord — il en manque 1');
  });

  it('opens the same fan for that column once a port stands there', () => {
    const naval = {
      ...column,
      roles: ['cargo' as const],
      departureBuildings: new Set<BuildingKey>(['port']),
    };
    const compass = compassOf({ ...aragon, coastal: true }, view, naval, true);
    expect(compass?.actions.map((action) => action.label)).toEqual(['marche', 'attaque']);
  });

  /** Aiming, the map hands back a place at every scale: a region is never a target of its own,
   *  and founding does not go through the rose at all any more. */
  it('offers nothing on a region target — the fan only aims at places', () => {
    expect(
      compassOf(
        { kind: 'region', id: 'ESP-1234', name: 'Aragón', country: 'ESP' },
        view,
        column,
        true,
      ),
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
    afloat: false,
    coastal: false,
  };

  it('opens a fan with no region under it at all — zoomed out, or at sea', () => {
    const compass = compassOf(
      {
        kind: 'point',
        lon: 25.2,
        lat: 44.6,
        regionId: null,
        country: 'ROU',
        name: 'Roumanie',
        onLand: true,
        coastal: false,
      },
      view,
      column,
      true,
    );
    expect(compass?.actions.map((action) => action.label)).toEqual(['marche', 'attaque']);
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
        onLand: true,
        coastal: false,
      },
      view,
      column,
      true,
    );
    expect(compass?.actions.map((action) => action.label)).toEqual(['marche', 'attaque']);
    expect(compass?.actions[0]).toMatchObject({ aim: { kind: 'point', lon: 25.2, lat: 44.6 } });
    expect(
      compass?.actions.some((action) => action.key === 'aim' && action.aim.kind === 'region'),
    ).toBe(false);
  });

  it('refuses infantry over water, where no country answers', () => {
    const compass = compassOf(
      {
        kind: 'point',
        lon: -30,
        lat: 40,
        regionId: null,
        country: null,
        name: 'haute mer',
        onLand: false,
        coastal: false,
      },
      view,
      column,
      true,
    );
    expect(compass?.actions).toEqual([]);
    expect(compass?.refusal).toBe(
      'une troupe terrestre doit viser la terre — embarquez-la pour traverser la mer',
    );
  });

  /**
   * The acceptance criterion of ADR 0019's second prompt: aiming from a zoomed-out board, at a
   * scale where no region is drawn, always answers something. Branches or motive, never silence.
   */
  it('answers a naval column standing on a portless shore, motive in hand', () => {
    const naval = { ...column, roles: ['cargo' as const] };
    const compass = compassOf(
      {
        kind: 'point',
        lon: 25.2,
        lat: 44.6,
        regionId: null,
        country: 'ROU',
        name: 'Roumanie',
        onLand: true,
        coastal: false,
      },
      view,
      naval,
      true,
    );
    expect(compass).not.toBeNull();
    /** Branches or motive, never silence. Ici, le motif. */
    expect(compass?.actions).toEqual([]);
    expect(compass?.refusal).toBe(
      'aucun port là d’où part la colonne — on n’embarque pas sans quai',
    );
  });
});

/**
 * **Fonder est passé au clic droit** (décision Pierre, 29/08) : le geste a quitté la fenêtre de
 * garnison, qui sert à composer une pile et non à donner un ordre. La branche vit sur la pile
 * elle-même, parce qu'on fonde où l'on se tient (ADR 0019 §1).
 */
describe('joining a transport from the map', () => {
  const beach = {
    kind: 'point',
    lonLat: [142.1, 47],
    country: 'RUS',
    afloat: false,
    coastal: true,
  } as const;
  const origin = { ...beach, lonLat: [142.3, 47] } as const;
  const target = {
    kind: 'force',
    id: 'cargo-stack',
    onLand: true,
    country: 'RUS',
    name: 'cargo',
    headcount: 1,
    station: beach,
    regionId: 'RUS-2616',
  } as const;
  const column = {
    roles: ['infantry' as const],
    myRegionIds: new Set<string>(),
    myOutpostIds: new Set<string>(),
    departureBuildings: new Set<BuildingKey>(),
    afloat: false,
    coastal: false,
  };
  const withTransport = (role = 'cargo', passengers = 0): PlayerView =>
    ({
      ...view,
      me: {
        ...view.me,
        troops: [
          { id: 'transport', role, stationedAt: beach },
          ...Array.from({ length: passengers }, (_, rank) => ({
            id: `passenger-${rank}`,
            role: 'infantry',
            stationedAt: beach,
          })),
        ],
      },
    }) as unknown as PlayerView;

  it('offers a garrison march to the exact address of a friendly cargo', () => {
    const compass = compassOf(target, withTransport(), column, false, origin);
    expect(compass?.actions).toHaveLength(1);
    expect(compass?.actions[0]).toMatchObject({
      key: 'aim',
      type: 'march',
      label: 'entrer en garnison',
      pictogram: 'doorway',
      aim: { kind: 'point', lon: 142.1, lat: 47, onLand: true, coastal: true },
    });
  });

  it('does not offer an infantry march to an offshore cargo', () => {
    const compass = compassOf({ ...target, onLand: false }, withTransport(), column, false, origin);
    expect(compass?.actions).toEqual([]);
    expect(compass?.refusal).toContain('une troupe terrestre doit viser la terre');
  });

  it('offers no boarding when the cargo has no remaining places', () => {
    const compass = compassOf(target, withTransport('cargo', 6), column, false, origin);
    expect(compass?.actions).toEqual([]);
  });

  it('offers infantry a truck with a free seat, but never puts armour in it', () => {
    expect(
      compassOf(target, withTransport('landTransport', 1), column, false, origin)?.actions,
    ).toHaveLength(1);
    expect(
      compassOf(target, withTransport('landTransport', 2), column, false, origin)?.actions,
    ).toEqual([]);
    expect(
      compassOf(
        target,
        withTransport('landTransport'),
        { ...column, roles: ['armor'] },
        false,
        origin,
      )?.actions,
    ).toEqual([]);
  });

  it('offers no transport action on an escort, an unknown stack, or the origin itself', () => {
    expect(compassOf(target, withTransport('escort'), column, false, origin)).toBeNull();
    expect(
      compassOf(target, { ...view, me: { ...view.me, troops: [] } }, column, false, origin),
    ).toBeNull();
    expect(compassOf(target, withTransport(), column, false, beach)).toBeNull();
  });

  it('can rejoin a nearby transport without treating it as the origin', () => {
    const nearby = { ...beach, lonLat: [142.101, 47.001] } as const;
    expect(compassOf(target, withTransport(), column, false, nearby)?.actions).toHaveLength(1);
  });

  it('never offers to board a transport already moving', () => {
    const moving = {
      ...withTransport(),
      arcs: [{ state: 'mine', troopIds: ['transport'] }],
    } as unknown as PlayerView;
    expect(compassOf(target, moving, column, false, origin)).toBeNull();
  });
});

describe('founding from the map', () => {
  const camp = {
    kind: 'force',
    onLand: true,
    id: 'stack-point:12.0000,20.0000',
    country: 'LBY',
    name: '2 INF',
    headcount: 2,
    station: { kind: 'point', lonLat: [12, 20], country: 'LBY', afloat: false, coastal: false },
    regionId: 'LBY-001',
  } as const;

  const posted = (roles: ReadonlyArray<string>) =>
    ({
      ...view,
      me: {
        ...view.me,
        troops: roles.map((role, rank) => ({
          id: `T-${rank}`,
          role,
          stationedAt: {
            kind: 'point',
            lonLat: [12, 20],
            country: 'LBY',
            afloat: false,
            coastal: false,
          },
        })),
      },
    }) as unknown as PlayerView;

  it('offers the founding on a posted column, carrying its point and its manifest', () => {
    const compass = compassOf(camp, posted(['infantry', 'infantry']));
    expect(compass?.actions.map((action) => action.key)).toEqual(['found']);
    expect(compass?.actions[0]).toMatchObject({
      pictogram: 'post',
      point: [12, 20],
      troopIds: ['T-0', 'T-1'],
    });
  });

  /**
   * La même fonction que le serveur refuse avec (`foundingRefusal`) : un char ne plante rien.
   * **Et la rose ne s'ouvre plus du tout** (décision Pierre, 31/08) : cette pile n'a rien à faire
   * sur place, donc le clic gauche n'ouvre que le cartouche et le clic droit reste inerte — la
   * destination, elle, se nomme ailleurs.
   */
  it('withdraws it from a column no infantry stands in, and the fan closes with it', () => {
    expect(compassOf(camp, posted(['armor']))).toBeNull();
  });

  /** Un avant-poste porte un chantier hors de chez soi (ADR 0004) : sur son propre sol, il
   *  n'apporte rien, et le serveur répond `FRIENDLY_TARGET`. */
  it('withdraws it on ground already carrying one of my buildings', () => {
    const home = posted(['infantry']);
    const compass = compassOf({ ...camp, regionId: 'FRA-9999' }, {
      ...home,
      me: { ...home.me, buildings: [{ regionId: 'FRA-9999' }] },
    } as unknown as PlayerView);
    expect(compass).toBeNull();
  });

  /**
   * **Désigner une troupe l'arme** (correctif du 30/08), et la rose lui rend malgré tout son
   * éventail ordinaire : la pile qu'on tient n'est pas une destination, et lui retirer « fonder »
   * parce qu'elle est en visée reviendrait à rendre le geste inaccessible dès qu'on la sélectionne.
   */
  it('keeps the founding on the pile itself while a column is armed', () => {
    const armed = {
      roles: ['infantry' as const],
      myRegionIds: new Set<string>(),
      myOutpostIds: new Set<string>(),
      departureBuildings: new Set<BuildingKey>(),
      afloat: false,
      coastal: false,
    };
    const compass = compassOf(camp, posted(['infantry']), armed, true);
    expect(compass?.actions.map((action) => action.key)).toEqual(['found']);
  });

  /**
   * **Un observateur regarde, il ne vise plus** (31/08). Le serveur refuse déjà tout
   * (`requirePlayable`) : une rose qui garderait « fonder » ou « bâtir » promettrait au défait
   * l'ordre qu'il ne peut plus obtenir — et rien n'est grisé, jamais (ADR 0015).
   */
  it('leaves an observer nothing at all — not even a fan to open', () => {
    const armed = {
      roles: ['infantry' as const],
      myRegionIds: new Set<string>(),
      myOutpostIds: new Set<string>(),
      departureBuildings: new Set<BuildingKey>(),
      afloat: false,
      coastal: false,
    };
    const standing = posted(['infantry']);
    const observing = {
      ...standing,
      me: { ...standing.me, defeated: true },
    } as unknown as PlayerView;
    expect(compassOf(camp, observing, armed, true)).toBeNull();
    expect(
      compassOf({ kind: 'region', id: 'FRA-5333', name: 'Paris', country: 'FRA' }, observing),
    ).toBeNull();
  });

  /** Une pile en route n'est plus posée : son manifeste est vide, il n'y a rien à planter. */
  it('withdraws it while the column is walking', () => {
    const walking = posted(['infantry']);
    const compass = compassOf(camp, {
      ...walking,
      arcs: [{ state: 'mine', troopIds: ['T-0'] }],
    } as unknown as PlayerView);
    expect(compass).toBeNull();
  });
});

/**
 * **L'élévation rendue à la carte** (décisions 54a, 56a, 57a) : le clic droit sur un mât ouvre la
 * même rose, avec une branche de plus. Les états sont ceux d'`upgradeHold` et d'aucune autre
 * table — un seul dit à la fois, dans l'ordre du contrat 04 : file, plafond, matière.
 */
describe('raising a level from the map', () => {
  const mine = {
    id: 'B-01',
    key: 'mine' as const,
    name: 'Mine',
    regionId: 'FRA-9999',
    level: 1,
    nextLevelCost: { alloy: 54 } as Cost,
    nextLevelMinutes: 54,
    cappedByHq: false,
  };

  const standing = (building: Partial<typeof mine>, me: Record<string, unknown> = {}): PlayerView =>
    ({
      ...view,
      me: { ...view.me, buildings: [{ ...mine, ...building }], ...me },
    }) as unknown as PlayerView;

  const mast = {
    kind: 'building',
    id: 'B-01',
    key: 'mine',
    level: 1,
    regionId: 'FRA-9999',
  } as const;

  it('offers the raise, its flat figure and its bill against the stock', () => {
    const compass = compassOf(mast, standing({}));
    expect(compass?.kicker).toBe('bâtiment · niveau 1');
    expect(compass?.name).toBe('Mine');
    expect(compass?.actions.map((action) => action.key)).toEqual(['upgrade']);
    expect(compass?.actions[0]).toMatchObject({
      pictogram: 'chevron',
      label: 'améliorer',
      buildingKey: 'mine',
      regionId: 'FRA-9999',
      figure: '54',
      bill: [{ text: 'alliage 54 / 1000', lacking: false }],
      duration: '00:54:00',
      consequence: 'passer Mine au niveau 2',
      hold: null,
    });
    expect(compass?.refusal).toBeNull();
  });

  /** Le sol ne disparaît pas sous le mât : la région garde la branche qu'elle offrirait seule. */
  it('keeps the crane of the region the building stands on', () => {
    const empty = standing({ regionId: 'FRA-5333' });
    const compass = compassOf({ ...mast, regionId: 'FRA-5333' }, empty);
    expect(compass?.actions.map((action) => action.label)).toEqual(['améliorer', 'Bâtir ici']);
    expect(compass?.actions[1]).toMatchObject({ pictogram: 'crane', regionId: 'FRA-5333' });
  });

  /**
   * File et plafond : **la branche disparaît** et la rose parle par son motif — règle générale de
   * l'ADR 0015, rien de grisé. La phrase est celle du serveur, jamais une paraphrase.
   */
  it('withdraws the branch when a work already stands in that region, and says so', () => {
    const compass = compassOf(
      mast,
      standing({}, { construction: { regionId: 'FRA-9999', key: 'mine', minutesLeft: 10 } }),
    );
    expect(compass?.actions).toEqual([]);
    expect(compass?.refusal).toBe(
      'un chantier vise déjà cette région — annulez-le ou attendez son tour',
    );
  });

  it('withdraws it under the headquarters ceiling, with the ceiling’s own sentence', () => {
    const compass = compassOf(mast, standing({ cappedByHq: true }));
    expect(compass?.actions).toEqual([]);
    expect(compass?.refusal).toBe('plafonné par le QG — montez le quartier général d’abord');
  });

  /**
   * **La seule branche grisée du jeu** (exception assumée 54a) : une matière qui manque est
   * transitoire et se date, quand un ordre illégal ne se rattrape jamais. Elle reste donc, avec
   * sa raison et son échéance — et le motif de la rose ne parle pas par-dessus elle.
   */
  it('greys the branch for a missing matter, with the reason and the date', () => {
    const short = standing(
      { nextLevelCost: { alloy: 108, coal: 72 } },
      {
        resources: {
          ...(view.me.resources as Record<string, unknown>),
          coal: { stock: 20, ratePerHour: 10, cap: 1000 },
        },
      },
    );
    const compass = compassOf(mast, short);
    expect(compass?.refusal).toBeNull();
    /** L'ordre est celui de `RESOURCES`, comme la ligne d'élévation des fenêtres facture déjà
     *  (`CostLine`) : le même prix lu à deux endroits ne doit pas s'écrire dans deux ordres. */
    expect(compass?.actions[0]).toMatchObject({
      figure: '72 · 108',
      bill: [
        { text: 'charbon 72 / 20', lacking: true },
        { text: 'alliage 108 / 1000', lacking: false },
      ],
      hold: {
        reason: 'il faut 72 de charbon (20 disponibles)',
        availability: 'disponible dans 05:12:00',
      },
    });
  });

  /** Rien ne produit la matière : un compte à rebours mentirait, la phrase nomme ce qu'il faut
   *  bâtir — la même que la ligne d'élévation des fenêtres. */
  it('names the building to raise when nothing produces the matter at all', () => {
    const never = standing(
      { nextLevelCost: { alloy: 108 } },
      {
        resources: {
          ...(view.me.resources as Record<string, unknown>),
          alloy: { stock: 0, ratePerHour: 0, cap: 1000 },
        },
      },
    );
    expect(compassOf(mast, never)?.actions[0]).toMatchObject({
      hold: { availability: 'jamais : aucune fonderie' },
    });
  });

  /**
   * **Un mât à soi est une destination en visée** (décisions 64b, 69a, 70b) : la colonne vient
   * y entrer, la branche le dit, et la seule marche offerte est celle-là — ni « améliorer », ni
   * la grue du sol, qui appartiennent à la rose au repos.
   */
  it('offers « entrer en garnison » to an armed infantry, and nothing else', () => {
    const armed = {
      roles: ['infantry' as const],
      myRegionIds: new Set(['FRA-9999']),
      myOutpostIds: new Set<string>(),
      departureBuildings: new Set<BuildingKey>(['barracks']),
      afloat: false,
      coastal: false,
    };
    const compass = compassOf(mast, standing({}), armed, true);
    expect(compass?.kicker).toBe('visée armée · 1 troupe');
    expect(compass?.name).toBe('Mine');
    expect(compass?.actions).toHaveLength(1);
    expect(compass?.actions[0]).toMatchObject({
      key: 'aim',
      type: 'march',
      label: 'entrer en garnison',
      pictogram: 'doorway',
      aim: { kind: 'building', buildingId: 'B-01', key: 'mine' },
    });
    expect(compass?.refusal).toBeNull();
  });

  /** The same mast under another key: the fixture's building is a mine, and these cases need
   *  a barracks and a port standing in its place. */
  const housing = (key: BuildingKey, name: string): PlayerView =>
    ({ ...view, me: { ...view.me, buildings: [{ ...mine, key, name }] } }) as unknown as PlayerView;

  /** La table 70b, dans les mots du serveur : le motif nomme le rôle et le bâtiment, et la rose
   *  s'ouvre dessus plutôt que de griser une branche (ADR 0015). */
  it('opens on the motive for a role the building is shut to', () => {
    const armour = {
      roles: ['armor' as const],
      myRegionIds: new Set(['FRA-9999']),
      myOutpostIds: new Set<string>(),
      departureBuildings: new Set<BuildingKey>(['barracks']),
      afloat: false,
      coastal: false,
    };
    const onMine = compassOf(mast, standing({}), armour, true);
    expect(onMine?.actions).toEqual([]);
    expect(onMine?.refusal).toBe('un blindé n’entre pas dans une mine');

    const onBarracks = compassOf(
      { ...mast, key: 'barracks' },
      housing('barracks', 'Caserne'),
      armour,
      true,
    );
    expect(onBarracks?.actions.map((action) => action.label)).toEqual(['entrer en garnison']);
  });

  it('sends a cargo to a port and keeps it out of a barracks', () => {
    const fleet = {
      roles: ['cargo' as const],
      myRegionIds: new Set(['FRA-9999']),
      myOutpostIds: new Set<string>(),
      departureBuildings: new Set<BuildingKey>(['port']),
      afloat: false,
      coastal: false,
    };
    const onBarracks = compassOf(
      { ...mast, key: 'barracks' },
      housing('barracks', 'Caserne'),
      fleet,
      true,
    );
    expect(onBarracks?.refusal).toBe('un cargo n’entre pas dans une caserne');
    const onPort = compassOf({ ...mast, key: 'port' }, housing('port', 'Port'), fleet, true);
    expect(onPort?.actions.map((action) => action.label)).toEqual(['entrer en garnison']);
  });

  /** Seuls les siens sont dessinés ; un mât que la vue ne porte plus n'ouvre rien en visée. */
  it('opens nothing on a mast the view no longer carries', () => {
    const armed = {
      roles: ['infantry' as const],
      myRegionIds: new Set<string>(),
      myOutpostIds: new Set<string>(),
      departureBuildings: new Set<BuildingKey>(),
      afloat: false,
      coastal: false,
    };
    expect(compassOf({ ...mast, id: 'B-gone' }, standing({}), armed, true)).toBeNull();
  });

  /** Le clic droit reste inerte pour un défait, sur un bâtiment comme partout ailleurs. */
  it('opens nothing for an observer', () => {
    const observing = standing({}, { defeated: true });
    expect(compassOf(mast, observing)).toBeNull();
  });
});
