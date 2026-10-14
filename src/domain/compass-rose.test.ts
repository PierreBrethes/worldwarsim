import { theatreById } from './theatres';
import { describe, expect, it } from 'vitest';
import { compassOf, soleOrderOf, type CompassTarget } from './compass-rose';
import { BUILDINGS, RESOURCES, type BuildingKey } from './ids';
import type { BuildSpec, Cost, PlayerView } from './player-view';
import { fr } from '../i18n/fr';

const view = {
  me: {
    nation: 'france',
    slots: { total: 4, used: 1 },
    outposts: [
      {
        id: 'AP-01',
        hostCountry: 'NOR',
        lonLat: [0, 0],
        regionId: 'NOR-1',
        specialization: 'relay',
        specializationLocked: false,
        level: 1,
        standsAt: null,
        garrison: 4,
        disabledMinutesLeft: null,
        isMine: true,
        nextLevelCost: { alloy: 90 },
        nextLevelMinutes: 90,
        atMaxLevel: false,
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
  outpostFoundation: { cost: { alloy: 65, coal: 20 }, minutes: 65 },
  arcs: [],
  camps: [],
  /** Un relevé d'installation en Aragon : c'est lui qui ouvre « attaquer » sur ce sol-là. */
  surveyedInstallations: [
    { id: 'mine-enemy', key: 'mine', regionId: 'ESP-1234' },
    { id: 'well-enemy', key: 'oilWell', regionId: 'ROU-310' },
  ],
  loadedAt: 0,
  mode: 'mondiale',
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

  /** **Un point adverse ne se fait rien au repos** (décision du 31/08, inchangée le 16/09) : il
   *  n'est pas à nous, et le clic droit y reste inerte comme sur un pays. */
  it('stays shut on an outpost that is not mine', () => {
    expect(
      compassOf(
        { kind: 'outpost', id: 'AP-99', hostCountry: 'NOR', name: 'relais', coastal: false },
        view,
      ),
    ).toBeNull();
  });
});

/**
 * **Un point à soi se commande au clic droit** (décision de Pierre, 16/09, Registre 27). Le
 * panneau de garnison garde ses portes : la rose en ajoute une, du nord dans le sens des
 * aiguilles — élever, les deux métiers, démanteler.
 */
describe('my own outpost, unarmed', () => {
  const mine: CompassTarget = {
    kind: 'outpost',
    id: 'AP-01',
    hostCountry: 'NOR',
    name: 'relais',
    coastal: false,
  };
  const withOutpost = (changes: Record<string, unknown>) =>
    ({
      ...view,
      me: { ...view.me, outposts: [{ ...view.me.outposts[0], ...changes }] },
    }) as unknown as PlayerView;

  it('carries the raise, both trades and the dismantling, in that order', () => {
    const compass = compassOf(mine, view);
    expect(compass?.actions.map((action) => action.key)).toEqual([
      'raiseOutpost',
      'specialize',
      'specialize',
      'dismantle',
    ]);
    expect(compass?.actions.map((action) => action.label)).toEqual([
      'monter',
      'relais logistique',
      'écoute',
      'démanteler',
    ]);
    expect(compass?.kicker).toBe('mon avant-poste · niveau 1');
  });

  /** Le métier en cours est **marqué**, jamais retiré ni grisé : c'est l'état du point, et c'est
   *  ce qui décide du geste suivant. */
  it('marks the trade the point already works', () => {
    const trades = (compassOf(mine, view)?.actions ?? []).filter(
      (action) => action.key === 'specialize',
    );
    expect(trades.map((trade) => trade.current)).toEqual([true, false]);
    expect(trades.map((trade) => trade.specialization)).toEqual(['relay', 'listening']);
    expect(trades.every((trade) => trade.sealed === null)).toBe(true);
  });

  /** Scellé, rien ne disparaît et rien ne se grise : la branche porte la phrase du serveur, et
   *  le joueur lit pourquoi avant de cliquer (ADR 0015). */
  it('keeps both trades when the point serves a column, and says why it refuses', () => {
    const sealed = compassOf(mine, withOutpost({ specializationLocked: true }));
    const trades = (sealed?.actions ?? []).filter((action) => action.key === 'specialize');
    expect(trades).toHaveLength(2);
    expect(trades[1]?.sealed).toBe(
      'une passe s’est déjà servie de cet avant-poste — sa spécialisation ne change plus',
    );
  });

  /** **Servir une colonne retient aussi le démantèlement** : on ne retire pas la route sous les
   *  pieds d'une marche dont l'allure est déjà payée. */
  it('withdraws the dismantling while a column leans on the point', () => {
    const sealed = compassOf(mine, withOutpost({ specializationLocked: true }));
    expect(sealed?.actions.some((action) => action.key === 'dismantle')).toBe(false);
    expect(sealed?.refusal).toBe(
      'une colonne marche dans la portée de ce point — il ne se démantèle pas sous elle',
    );
  });

  it('draws no raise at the maximum level, and keeps the rest', () => {
    const topped = compassOf(mine, withOutpost({ level: 3, atMaxLevel: true }));
    expect(topped?.actions.map((action) => action.key)).toEqual([
      'specialize',
      'specialize',
      'dismantle',
    ]);
    expect(topped?.refusal).toBe('Niveau maximal atteint (3).');
  });

  /** On ne monte pas un avant-poste sous le feu (3a) : la branche part, la phrase reste. */
  it('states the motive when the point is out of service', () => {
    const halted = compassOf(mine, withOutpost({ disabledMinutesLeft: 120 }));
    expect(halted?.actions.some((action) => action.key === 'raiseOutpost')).toBe(false);
    expect(halted?.refusal).toBe('Hors service : on ne monte pas un avant-poste sous le feu.');
  });

  /** **Un chantier n'a ni niveau à monter ni métier à régler** : il a une heure à attendre, et
   *  le panneau la porte. Il se démantèle pourtant — on retire alors une promesse. */
  it('offers nothing but the dismantling on a foundation still under construction', () => {
    const site = compassOf(mine, withOutpost({ standsAt: 5_000 }));
    expect(site?.actions.map((action) => action.key)).toEqual(['dismantle']);
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
    const compass = compassOf(aragon, view, column);
    expect(compass?.actions.map((action) => action.key)).toEqual(['aim', 'aim']);
    expect(compass?.actions.map((action) => action.label)).toEqual(['marche', 'attaque']);
    expect(compass?.kicker).toBe('visée armée · 1 troupe');
  });

  /**
   * **On n'attaque que ce qu'on a relevé** (ADR 0024 §4) : sur un sol où le joueur n'a rien vu,
   * la branche n'existe pas. La marche reste offerte partout — l'agression à l'aveugle passe par
   * elle, et elle ne déclenche plus rien en arrivant (§3).
   */
  it('withholds the attack where the player has surveyed nothing', () => {
    const compass = compassOf({ ...aragon, regionId: 'ESP-0000' }, view, column);
    expect(compass?.actions.map((action) => action.label)).toEqual(['marche']);
    expect(compass?.refusal).toBeNull();
  });

  /** **Un camp relevé est une cible, et la seule branche est l'assaut** : on ne marche pas sur
   *  une force, on l'attaque — ou on la laisse. */
  it('offers the assault, and it alone, on a surveyed camp', () => {
    const compass = compassOf(
      { kind: 'camp', id: 'camp-1', point: [-0.9, 41.6], country: 'ESP', name: 'camp inconnu' },
      view,
      column,
    );
    expect(compass?.actions.map((action) => action.label)).toEqual(['attaque']);
    expect(compass?.actions[0]).toMatchObject({
      type: 'attack',
      aim: { kind: 'camp', campId: 'camp-1' },
    });
  });

  /**
   * **Un objectif neutre est une cible sans relevé** — c'est l'exception nommée de l'ADR 0024 §4,
   * et elle tient parce qu'il est public par nature. Une seule branche y mène.
   */
  it('offers the assault on a neutral objective, with no survey to show for it', () => {
    const compass = compassOf(
      {
        kind: 'objective',
        id: 'obj-1',
        point: [-0.9, 41.6],
        country: 'ESP',
        name: 'réserves abandonnées',
        tier: 'forces irrégulières légères',
      },
      view,
      column,
    );
    expect(compass?.actions.map((action) => action.label)).toEqual(['attaque']);
    expect(compass?.actions[0]).toMatchObject({
      type: 'attack',
      aim: { kind: 'objective', objectiveId: 'obj-1' },
    });
  });

  /** **Sans colonne armée, le motif tient la place de la branche** : ce qui manque est une
   *  colonne, pas un droit — et c'est la seule cible adverse qui parle au repos, parce qu'elle
   *  n'a rien à cacher. */
  it('says what is missing on an objective nobody is aiming at', () => {
    const compass = compassOf(
      {
        kind: 'objective',
        id: 'obj-1',
        point: [-0.9, 41.6],
        country: 'ESP',
        name: 'réserves abandonnées',
        tier: 'forces irrégulières légères',
      },
      view,
      null,
    );
    expect(compass?.actions).toEqual([]);
    expect(compass?.refusal).toBe(fr.objectives.needsAColumn);
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
  /**
   * **Une pile armée sur un point à soi n'a qu'une branche** (décision du 16/09) : entrer en
   * garnison. Ni l'attaque ni le raid — `FRIENDLY_TARGET` les refuse déjà — et aucune des
   * branches du repos : viser veut dire « celle-ci, et comment », rien d'autre.
   */
  it('offers the garrison, and it alone, on an outpost of mine', () => {
    const outpost = compassOf(
      { kind: 'outpost', id: 'AP-01', hostCountry: 'NOR', name: 'relais', coastal: false },
      view,
      column,
    );
    expect(outpost?.actions.map((action) => action.key)).toEqual(['aim']);
    expect(outpost?.actions[0]).toMatchObject({
      label: 'entrer en garnison',
      pictogram: 'doorway',
      type: 'march',
      aim: { kind: 'outpost', outpostId: 'AP-01' },
    });
    expect(outpost?.refusal).toBeNull();
  });

  /** **Un point adverse ne bouge pas** : la plate de visée d'aujourd'hui, assaut et raid, et pas
   *  de marche — on ne marche pas *sur* un point qu'on vient combattre. */
  it('keeps the assault and the raid on an outpost that is not mine, and adds capture', () => {
    const enemy = compassOf(
      { kind: 'outpost', id: 'AP-99', hostCountry: 'NOR', name: 'relais', coastal: false },
      view,
      column,
    );
    expect(enemy?.actions.map((action) => action.label)).toEqual([
      'attaque',
      'raid d’avant-poste',
      'capturer',
    ]);
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
   * and a hull on a shore with no quay is exactly the column that cannot guess why. Depuis que le
   * leurre a quitté la plate, il ne reste que le motif — et c'est bien le cas que l'ADR 0019
   * voulait sortir du silence.
   */
  it('names the shut gate when the column cannot leave the ground it stands on', () => {
    const naval = { ...column, roles: ['cargo' as const] };
    const compass = compassOf(aragon, view, naval);
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
    const compass = compassOf({ ...aragon, coastal: true }, view, naval);
    expect(compass?.actions.map((action) => action.label)).toEqual(['marche', 'attaque']);
  });

  /** Aiming, the map hands back a place at every scale: a region is never a target of its own,
   *  and founding does not go through the rose at all any more. */
  it('offers nothing on a region target — the fan only aims at places', () => {
    expect(
      compassOf({ kind: 'region', id: 'ESP-1234', name: 'Aragón', country: 'ESP' }, view, column),
    ).toBeNull();
  });

  it('offers plunder or sabotage on the exact surveyed installation', () => {
    const warehouse = compassOf(
      {
        kind: 'installation',
        id: 'warehouse-enemy',
        key: 'warehouse',
        regionId: 'ROU-310',
        name: 'Entrepôt',
      },
      view,
      column,
    );
    expect(warehouse?.actions).toEqual([
      expect.objectContaining({
        key: 'plunder',
        label: 'piller',
        buildingId: 'warehouse-enemy',
        aim: { kind: 'building', buildingId: 'warehouse-enemy', key: 'warehouse' },
      }),
      expect.objectContaining({ key: 'capture' }),
    ]);

    const producer = compassOf(
      {
        kind: 'installation',
        id: 'mine-enemy',
        key: 'mine',
        regionId: 'ROU-310',
        name: 'Mine',
      },
      view,
      column,
    );
    expect(producer?.actions[0]).toMatchObject({ key: 'plunder', label: 'saboter' });
  });

  it('offers capture but no plunder on a Blitz neutral', () => {
    const city = compassOf(
      { kind: 'installation', id: 'city-1', key: 'city', regionId: 'ROU-310', name: 'Ville' },
      { ...view, mode: 'blitz' },
      column,
    );
    expect(city?.actions.map((action) => action.key)).toEqual(['capture']);
  });

  it('offers capture of a Blitz headquarters, twice as long as a building (B10)', () => {
    const hq = compassOf(
      { kind: 'installation', id: 'hq-enemy', key: 'hq', regionId: 'ROU-310', name: 'QG' },
      { ...view, mode: 'blitz' },
      {
        ...column,
        blitz: {
          theatre: theatreById('europe')!,
          reloading: false,
          occupiedBuildingIds: new Set<string>(),
        },
      },
    );
    expect(hq?.actions).toEqual([
      expect.objectContaining({ key: 'capture', consequence: expect.stringContaining('00:06:00') }),
    ]);
  });

  it('offers capture on a surveyed installation, with its duration at full strength', () => {
    const barracks = compassOf(
      {
        kind: 'installation',
        id: 'barracks-enemy',
        key: 'barracks',
        regionId: 'ROU-310',
        name: 'Caserne',
      },
      view,
      column,
    );
    expect(barracks?.actions).toEqual([
      expect.objectContaining({
        key: 'capture',
        label: 'capturer',
        target: { kind: 'building', id: 'barracks-enemy' },
        consequence: expect.stringContaining('06:00:00'),
      }),
    ]);
  });

  it('announces the duration at the strength the column really has', () => {
    const worn = compassOf(
      {
        kind: 'installation',
        id: 'barracks-enemy',
        key: 'barracks',
        regionId: 'ROU-310',
        name: 'Caserne',
      },
      view,
      { ...column, captureRate: 0.5 },
    );
    expect(worn?.actions[0]).toMatchObject({
      key: 'capture',
      consequence: expect.stringContaining('12:00:00'),
    });
  });

  it('says why a headquarters is not captured', () => {
    const hq = compassOf(
      { kind: 'installation', id: 'hq-enemy', key: 'hq', regionId: 'ROU-310', name: 'QG' },
      view,
      column,
    );
    expect(hq).toMatchObject({ actions: [], refusal: fr.errors.HQ_NOT_CAPTURABLE() });
  });

  it('offers collection only on the selected private sighting and with free capacity', () => {
    const target = {
      kind: 'loot' as const,
      id: 'sighting-1',
      point: [12.4, 44.2] as const,
      current: false,
      seenAt: 123,
    };
    expect(compassOf(target, view, column, null, 20)?.actions[0]).toMatchObject({
      key: 'collect',
      label: 'ramasser',
      sightingId: 'sighting-1',
    });
    expect(compassOf(target, view, column, null, 0)).toMatchObject({
      actions: [],
      refusal: 'aucune capacité libre pour ramener ce butin',
    });
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

  /** Au dézoom la carte ne dessine aucune région, donc le relevé ne répond pas : la marche
   *  reste, l'assaut se retire — on n'attaque que ce qu'on a vu (ADR 0024 §4). */
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
    );
    expect(compass?.actions.map((action) => action.label)).toEqual(['marche']);
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
describe('boarding a transport from the map (ADR 0025 §3)', () => {
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

  it('offers to board a friendly cargo a few kilometres off, at once', () => {
    const compass = compassOf(target, withTransport(), column, origin);
    expect(compass?.name).toBe('Cargo');
    expect(compass?.actions).toHaveLength(1);
    expect(compass?.actions[0]).toMatchObject({
      key: 'board',
      pictogram: 'anchor',
      label: 'embarquer',
      transport: beach,
    });
  });

  it('boards a cargo moored offshore as well — the littoral, not the quay', () => {
    const compass = compassOf({ ...target, onLand: false }, withTransport(), column, origin);
    expect(compass?.actions[0]).toMatchObject({ key: 'board' });
  });

  it('says how many places are missing when the cargo is full', () => {
    const compass = compassOf(target, withTransport('cargo', 12), column, origin);
    expect(compass?.actions).toEqual([]);
    expect(compass?.refusal).toContain('il en manque 1');
  });

  it('says it is too far beyond the boarding radius', () => {
    const far = { ...origin, lonLat: [144, 47] } as const;
    const compass = compassOf(target, withTransport(), column, far);
    expect(compass?.actions).toEqual([]);
    expect(compass?.refusal).toContain('trop loin pour embarquer');
  });

  it('lists the transports in reach on the pile one holds, so a crowd is no obstacle', () => {
    const own = { ...target, id: 'own-stack', station: origin };
    const compass = compassOf(own, withTransport(), column, origin);
    expect(compass?.actions.find((action) => action.key === 'board')).toMatchObject({
      label: 'embarquer · Cargo',
      transport: beach,
    });
  });

  it('offers infantry a truck with a free seat, but never puts armour in it', () => {
    expect(
      compassOf(target, withTransport('landTransport', 1), column, origin)?.actions,
    ).toHaveLength(1);
    expect(compassOf(target, withTransport('landTransport', 2), column, origin)?.actions).toEqual(
      [],
    );
    expect(
      compassOf(target, withTransport('landTransport'), { ...column, roles: ['armor'] }, origin)
        ?.actions,
    ).toEqual([]);
  });

  /** La pile qu'on tient garde son éventail ordinaire : viser la sienne n'est pas un embarquement,
   *  et ce qu'elle rend est ce qu'un clic droit au repos rendrait — ici le motif de la fondation,
   *  puisqu'un cargo ne plante rien. */
  it('offers no transport action on an escort, an unknown stack, or the origin itself', () => {
    expect(compassOf(target, withTransport('escort'), column, origin)).toBeNull();
    expect(
      compassOf(target, { ...view, me: { ...view.me, troops: [] } }, column, origin),
    ).toBeNull();
    const itself = compassOf(target, withTransport(), column, beach);
    expect(itself?.actions).toEqual([]);
    expect(itself?.refusal).toBe('un cargo ne fonde pas — seule l’infanterie plante un point');
  });

  it('can rejoin a nearby transport without treating it as the origin', () => {
    const nearby = { ...beach, lonLat: [142.101, 47.001] } as const;
    expect(compassOf(target, withTransport(), column, nearby)?.actions).toHaveLength(1);
  });

  it('never offers to board a transport already moving', () => {
    const moving = {
      ...withTransport(),
      arcs: [{ state: 'mine', troopIds: ['transport'] }],
    } as unknown as PlayerView;
    expect(compassOf(target, moving, column, origin)).toBeNull();
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

  /** Le cargo n'a rien à faire là : pas d'ordre seul, la rose garde le motif. */
  it('skips the rose only for a single order', () => {
    const cargo = compassOf(camp, posted(['cargo']))!;
    expect(soleOrderOf(cargo)).toBeNull();
    expect(cargo.refusal).toBe('un cargo ne fonde pas — seule l’infanterie plante un point');
    const aim = {
      key: 'aim',
      label: 'marcher',
      consequence: '',
    } as unknown as Parameters<typeof soleOrderOf>[0]['actions'][number];
    expect(soleOrderOf({ kicker: '', name: '', actions: [aim], refusal: null })).toBe(aim);
    expect(soleOrderOf({ kicker: '', name: '', actions: [aim, aim], refusal: null })).toBeNull();
    const board = { key: 'board' } as unknown as typeof aim;
    expect(soleOrderOf({ kicker: '', name: '', actions: [board], refusal: null })).toBeNull();
  });

  it('founds nothing in a Blitz, so the sheet in hand has no founding to offer', () => {
    const blitz = { ...posted(['infantry']), mode: 'blitz' } as PlayerView;
    expect(compassOf(camp, blitz, null, null, 0, ['T-0'])?.actions ?? []).toEqual([]);
  });

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
   * **Et le refus se lit** : la branche part, la rose reste, et le motif nomme le rôle fautif —
   * un menu qui se ferait muet laisserait le joueur chercher ce qu'il a manqué (ADR 0015).
   */
  it('withdraws it from a column no infantry stands in, and names the offending role', () => {
    const compass = compassOf(camp, posted(['armor']));
    expect(compass?.actions).toEqual([]);
    expect(compass?.refusal).toBe('un blindé ne fonde pas — seule l’infanterie plante un point');
  });

  /** Un avant-poste porte un chantier hors de chez soi (ADR 0004) : sur son propre sol, il
   *  n'apporte rien, et le serveur répond `FRIENDLY_TARGET`. Le motif nomme la région, parce que
   *  « on ne marche pas sur les siens » répondrait à côté d'un geste qui n'est pas une marche. */
  it('withdraws it on ground already carrying one of my buildings, and names the region', () => {
    const home = posted(['infantry']);
    const compass = compassOf({ ...camp, regionId: 'FRA-9999' }, {
      ...home,
      me: { ...home.me, buildings: [{ regionId: 'FRA-9999' }] },
    } as unknown as PlayerView);
    expect(compass?.actions).toEqual([]);
    expect(compass?.refusal).toBe('Nord porte déjà un de vos bâtiments');
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
    const compass = compassOf(camp, posted(['infantry']), armed);
    expect(compass?.actions.map((action) => action.key)).toEqual(['found']);
  });

  /** **Fonder porte sur la composition tenue**, pas sur toute la pile : décocher le blindé
   *  rend la branche, et le manifeste n'emporte que l'infanterie. */
  it('founds with the composition in hand, not the whole pile', () => {
    const armed = {
      roles: ['infantry' as const],
      myRegionIds: new Set<string>(),
      myOutpostIds: new Set<string>(),
      departureBuildings: new Set<BuildingKey>(),
      afloat: false,
      coastal: false,
    };
    const pile = posted(['infantry', 'armor']);
    const inHand = (ids: ReadonlyArray<string>) =>
      compassOf(camp, pile, armed, camp.station, 0, ids);
    expect(inHand(['T-0'])?.actions[0]).toMatchObject({ key: 'found', troopIds: ['T-0'] });
    const whole = inHand(['T-0', 'T-1']);
    expect(whole?.actions).toEqual([]);
    expect(whole?.refusal).toBe('un blindé ne fonde pas — seule l’infanterie plante un point');
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
    expect(compassOf(camp, observing, armed)).toBeNull();
    expect(
      compassOf({ kind: 'region', id: 'FRA-5333', name: 'Paris', country: 'FRA' }, observing),
    ).toBeNull();
  });

  /** Une pile en route n'est plus posée : son manifeste est vide, il n'y a rien à planter — et
   *  c'est ce que le motif dit, plutôt que de refermer la rose sur un silence. */
  it('withdraws it while the column is walking, and says the address is empty', () => {
    const walking = posted(['infantry']);
    const compass = compassOf(camp, {
      ...walking,
      arcs: [{ state: 'mine', troopIds: ['T-0'] }],
    } as unknown as PlayerView);
    expect(compass?.actions).toEqual([]);
    expect(compass?.refusal).toBe('un mouvement part avec au moins une troupe');
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
    key: 'mine' as BuildingKey,
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
    expect(compass?.actions.map((action) => action.key)).toEqual(['upgrade', 'demolish']);
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

  it('offers nothing on a mast in a Blitz, where nothing is built or raised', () => {
    expect(compassOf(mast, { ...standing({}), mode: 'blitz' })).toBeNull();
  });

  /** Le sol ne disparaît pas sous le mât : la région garde la branche qu'elle offrirait seule. */
  it('keeps the crane of the region the building stands on', () => {
    const empty = standing({ regionId: 'FRA-5333' });
    const compass = compassOf({ ...mast, regionId: 'FRA-5333' }, empty);
    expect(compass?.actions.map((action) => action.label)).toEqual([
      'améliorer',
      'Bâtir ici',
      'raser',
    ]);
    expect(compass?.actions[1]).toMatchObject({ pictogram: 'crane', regionId: 'FRA-5333' });
  });

  /**
   * File et plafond : **la branche disparaît** et la rose parle par son motif — règle générale de
   * l'ADR 0015, rien de grisé. La phrase est celle du serveur, jamais une paraphrase.
   */
  it('withdraws the branch when a work already stands in that region, and says so', () => {
    const compass = compassOf(
      mast,
      standing(
        {},
        { construction: { regionId: 'FRA-9999', key: 'mine', outpostId: null, minutesLeft: 10 } },
      ),
    );
    /** Raser ne dépend d'aucune file : ce qu'on efface n'attend pas son tour. */
    expect(compass?.actions.map((action) => action.key)).toEqual(['demolish']);
    expect(compass?.refusal).toBe(
      'un chantier vise déjà cette région — annulez-le ou attendez son tour',
    );
  });

  it('withdraws it under the headquarters ceiling, with the ceiling’s own sentence', () => {
    const compass = compassOf(mast, standing({ cappedByHq: true }));
    expect(compass?.actions.map((action) => action.key)).toEqual(['demolish']);
    expect(compass?.refusal).toBe('plafonné par le QG — montez le quartier général d’abord');
  });

  /**
   * **Raser, et le seul mât qui ne le porte pas** (demande du 15/09). La branche vient en
   * dernier — ce qu'on efface n'est jamais ce qu'on cherche en ouvrant un menu — et le quartier
   * général n'en a pas : rien de grisé, la rose du QG garde ce qu'elle a.
   */
  it('offers « raser » last, and never on the headquarters', () => {
    const razed = compassOf(mast, standing({}))?.actions.at(-1);
    expect(razed).toMatchObject({ key: 'demolish', pictogram: 'rubble', buildingId: 'B-01' });

    const hq = compassOf({ ...mast, key: 'hq' }, standing({ key: 'hq', name: 'Quartier général' }));
    expect(hq?.actions.some((action) => action.key === 'demolish')).toBe(false);
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
    const compass = compassOf(mast, standing({}), armed);
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
    const onMine = compassOf(mast, standing({}), armour);
    expect(onMine?.actions).toEqual([]);
    expect(onMine?.refusal).toBe('un blindé n’entre pas dans une mine');

    const onBarracks = compassOf(
      { ...mast, key: 'barracks' },
      housing('barracks', 'Caserne'),
      armour,
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
    );
    expect(onBarracks?.refusal).toBe('un cargo n’entre pas dans une caserne');
    const onPort = compassOf({ ...mast, key: 'port' }, housing('port', 'Port'), fleet);
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
    expect(compassOf({ ...mast, id: 'B-gone' }, standing({}), armed)).toBeNull();
  });

  /** Le clic droit reste inerte pour un défait, sur un bâtiment comme partout ailleurs. */
  it('opens nothing for an observer', () => {
    const observing = standing({}, { defeated: true });
    expect(compassOf(mast, observing)).toBeNull();
  });
});
