import { describe, expect, it } from 'vitest';
import type { BuildingKey, UnitRole } from './ids';
import {
  barredFrom,
  boardingRefusalDetails,
  boardingRefusalOf,
  disembarkRefusalOf,
  foundingRefusal,
  landCostOf,
  legalMovementTypes,
  motorized,
  isMaritime,
  movementSlots,
  lootCollectionRefusalOf,
  ORDERABLE_TYPES,
  plunderRefusalOf,
  refusalDetails,
  refusalOf,
  routeModeOf,
  type Column,
  type MovementAim,
} from './movement-orders';
import { COST_BY_MEDIUM } from './routing';
import { theatreById } from './theatres';

const column = (roles: ReadonlyArray<UnitRole>, held: Partial<Column> = {}): Column => ({
  roles,
  myRegionIds: new Set(),
  myOutpostIds: new Set(),
  departureBuildings: new Set<BuildingKey>(),
  afloat: false,
  coastal: false,
  ...held,
});

const region: MovementAim = {
  kind: 'region',
  regionId: 'TUN-1',
  country: 'Tunisia',
  lon: 9.5,
  lat: 34,
  surveyed: true,
};
const outpost: MovementAim = {
  kind: 'outpost',
  outpostId: 'op1',
  hostCountry: 'Libya',
  coastal: false,
};
const point: MovementAim = {
  kind: 'point',
  lon: 11.2,
  lat: 36.4,
  coastal: false,
  onLand: true,
  surveyed: true,
};
/** Le même sol, sans rien de relevé dessus : la marche y va, l'assaut n'a rien à viser. */
const blank: MovementAim = { ...point, surveyed: false };
/** Un camp relevé : la seule cible mobile d'un ordre, et il se vise comme une position. */
const camp: MovementAim = {
  kind: 'camp',
  campId: 'camp-1',
  lon: 11.2,
  lat: 36.4,
  hostCountry: 'Tunisia',
  onLand: true,
  coastal: false,
};
/** La plage : la seule cible qu'une colonne embarquée accepte depuis la décision 72a. */
const shore: MovementAim = {
  kind: 'point',
  lon: 10.3,
  lat: 36.8,
  coastal: true,
  onLand: true,
  surveyed: true,
};
const sea: MovementAim = {
  kind: 'point',
  lon: -30,
  lat: 40,
  coastal: false,
  onLand: false,
  surveyed: true,
};

/**
 * **Une attaque vise ce qu'on a relevé** (ADR 0024 §4). Un camp et un avant-poste *sont* le
 * relevé ; un point ne l'est que s'il porte quelque chose. Sur du vide, ce n'est pas une portée
 * qui manque : il n'y a rien à attaquer, et le mot le dit.
 */
describe('what an attack may be aimed at', () => {
  it('takes a surveyed camp, and only as an assault', () => {
    expect(legalMovementTypes(camp, column(['infantry']))).toEqual(['attack']);
  });

  it('takes a point carrying something surveyed', () => {
    expect(refusalOf('attack', point, column(['infantry']))).toBeNull();
  });

  it('refuses a point where the observer has seen nothing', () => {
    expect(refusalOf('attack', blank, column(['infantry']))).toBe('NOTHING_TO_ATTACK');
    expect(legalMovementTypes(blank, column(['infantry']))).toEqual(['march']);
  });

  /** On ne marche pas *sur* une force : la seule branche d'un camp est l'assaut. */
  it('refuses to march at a camp, and to raid it', () => {
    expect(refusalOf('march', camp, column(['infantry']))).toBe('POINT_TARGET_ONLY');
    expect(refusalOf('raid', camp, column(['infantry']))).toBe('OUTPOST_TARGET_ONLY');
  });

  /** ADR 0028 §1 : sans coups, ni attaque ni riposte — la marche reste offerte. */
  it('refuses the attack and the raid to a column out of rounds', () => {
    const dry = column(['infantry'], { outOfRounds: true });
    expect(refusalOf('attack', camp, dry)).toBe('NO_ROUNDS');
    expect(refusalOf('raid', outpost, dry)).toBe('NO_ROUNDS');
  });
});

describe('what a column may ask for', () => {
  it('offers the attack on a foreign region — founding is no longer a march', () => {
    expect(legalMovementTypes(region, column(['infantry']))).toEqual(['attack']);
  });

  it('offers the attack and the raid on a foreign outpost, never the foundation', () => {
    expect(legalMovementTypes(outpost, column(['infantry']))).toEqual(['attack', 'raid']);
  });

  it('offers nothing on ground of mine — a fan that opens empty stays shut', () => {
    const held = column(['infantry'], { myRegionIds: new Set(['TUN-1']) });
    expect(legalMovementTypes(region, held)).toEqual([]);
  });

  it('offers nothing to an empty column', () => {
    expect(legalMovementTypes(region, column([]))).toEqual([]);
  });

  /**
   * The non-regression case of ADR 0019: nothing under a land column's feet is consulted, so a
   * garrison standing on a bare outpost asks for exactly what a column at a barracks asks for.
   */
  it('offers a land column the same marches wherever it stands', () => {
    const posted = column(['infantry'], { departureBuildings: new Set<BuildingKey>() });
    expect(legalMovementTypes(region, posted)).toEqual(['attack']);
    expect(legalMovementTypes(outpost, posted)).toEqual(['attack', 'raid']);
  });

  it('never offers the recall — it left with the origin that justified it', () => {
    expect(legalMovementTypes(region, column(['infantry']))).not.toContain('recall');
  });
});

describe('refusals', () => {
  const warehouse = {
    kind: 'building',
    buildingId: 'warehouse-1',
    key: 'warehouse',
  } as const;

  it('keeps plunder closed publicly while defining its future target rule', () => {
    expect(ORDERABLE_TYPES).not.toContain('plunder');
    expect(plunderRefusalOf(warehouse, ['infantry'], false)).toBeNull();
    expect(plunderRefusalOf(warehouse, ['armor'], false)).toBe('INFANTRY_REQUIRED');
    expect(plunderRefusalOf(warehouse, ['infantry'], true)).toBe('FRIENDLY_TARGET');
    expect(plunderRefusalOf({ ...warehouse, key: 'hq' }, ['infantry'], false)).toBe(
      'WAREHOUSE_TARGET_ONLY',
    );
  });

  it('opens collection only when the selected column has room for loot', () => {
    expect(lootCollectionRefusalOf(1)).toBeNull();
    expect(lootCollectionRefusalOf(0)).toBe('NO_CARGO_CAPACITY');
    expect(lootCollectionRefusalOf(-1)).toBe('NO_CARGO_CAPACITY');
  });

  it('names the ground as friendly rather than the column as wrong', () => {
    const held = column(['infantry'], { myOutpostIds: new Set(['op1']) });
    expect(refusalOf('raid', outpost, held)).toBe('FRIENDLY_TARGET');
  });

  it('refuses a raid on a region: a region has no point to disable', () => {
    expect(refusalOf('raid', region, column(['infantry']))).toBe('OUTPOST_TARGET_ONLY');
  });

  /** Nobody orders a return: the resolution creates it, so the rule has to say so out loud.
   *  The foundation joins them — it is not a march at all any more. Le leurre les a rejoints
   *  le 29/08/2026, en quittant `MovementType` tout entier. */
  it('refuses the return, the agent, the recall and the foundation', () => {
    expect(refusalOf('outpost', region, column(['infantry']))).toBe('NOT_ORDERABLE');
    expect(refusalOf('return', region, column(['infantry']))).toBe('NOT_ORDERABLE');
    expect(refusalOf('agent', region, column(['infantry']))).toBe('NOT_ORDERABLE');
    expect(refusalOf('recall', region, column(['infantry']))).toBe('NOT_ORDERABLE');
  });
});

/**
 * **Une pile vide ne part plus.** C'était la porte du leurre, retiré du jeu le 29/08/2026 : le
 * refus redevient franc, pour toutes les sortes et sans exception — la porte dérobée que la
 * fiche 04 signalait, « à zéro troupe » pour obtenir une marche gratuite, est refermée.
 */
describe('an empty manifest', () => {
  const empty: Column = {
    roles: [],
    myRegionIds: new Set(),
    myOutpostIds: new Set(),
    departureBuildings: new Set(),
    afloat: false,
    coastal: false,
  };
  const somewhere: MovementAim = {
    kind: 'point',
    lon: 25.2,
    lat: 44.6,
    coastal: false,
    onLand: true,
    surveyed: true,
  };

  it('is refused for every orderable type, and for the same reason', () => {
    for (const type of ORDERABLE_TYPES) {
      expect(refusalOf(type, somewhere, empty)).toBe('EMPTY_MOVEMENT');
    }
  });

  it('leaves nothing in the fan of an armed board', () => {
    expect(legalMovementTypes(somewhere, empty)).toEqual([]);
  });

  /** Le plafond ne connaît pas les sortes, il compte les mouvements — et il en reste un même
   *  au joueur dont le quartier général est à terre (ADR 0006). */
  it('would still cost a slot, because the ceiling counts movements and not kinds', () => {
    expect(movementSlots(0)).toBe(1);
    expect(movementSlots(2)).toBe(3);
  });

  /** **Halifax** (P11) : les mouvements maritimes de son teneur ne prennent pas de slot. Est
   *  maritime ce qui navigue : des coques, et ce qu'elles portent. */
  it('calls maritime a column of hulls and what they carry, and nothing that walks or flies', () => {
    expect(
      isMaritime([
        { role: 'cargo', carried: false },
        { role: 'infantry', carried: true },
      ]),
    ).toBe(true);
    expect(isMaritime([{ role: 'escort', carried: false }])).toBe(true);
    expect(isMaritime([{ role: 'infantry', carried: false }])).toBe(false);
    expect(
      isMaritime([
        { role: 'escort', carried: false },
        { role: 'fighter', carried: false },
      ]),
    ).toBe(false);
    expect(isMaritime([])).toBe(false);
  });
});

/**
 * The one thing the departure still decides (ADR 0019 §2, ADR 0013 kept where it pays). The door
 * answers to **the pile**, and to nothing else: a hull owes a quay, a wing owes a strip, and a
 * column on foot owes nothing at all — which is what lets the fan be exact (ADR 0015).
 */
describe('the doors of the domains', () => {
  it('refuses a sea column leaving ground with no port, whatever its route', () => {
    expect(refusalOf('attack', region, column(['cargo']))).toBe('NO_PORT_AT_DEPARTURE');
  });

  it('lets the same column leave once a port stands there', () => {
    const quay = column(['cargo'], { departureBuildings: new Set<BuildingKey>(['port']) });
    expect(refusalOf('attack', sea, quay)).toBeNull();
  });

  it('refuses an air column leaving ground with no airfield', () => {
    expect(refusalOf('attack', region, column(['bomber']))).toBe('NO_AIRFIELD_AT_DEPARTURE');
  });

  it('reads every domain the column carries, not just the first', () => {
    const quay = column(['infantry', 'cargo', 'bomber'], {
      departureBuildings: new Set<BuildingKey>(['barracks', 'port']),
    });
    expect(refusalOf('attack', region, quay)).toBe('NO_AIRFIELD_AT_DEPARTURE');
  });

  it('asks a walking column for nothing at all — a barracks is not a gate', () => {
    expect(refusalOf('attack', region, column(['infantry', 'armor']))).toBeNull();
  });

  /**
   * The correction: the door is back on the pile, and it is exact there. A land column owes
   * nothing because it walks — where the land stops, so does it, and `NO_LAND_ROUTE` says so.
   */
  it('asks nothing of a walking column, whatever water lies ahead', () => {
    expect(refusalOf('attack', region, column(['infantry']))).toBeNull();
  });

  it('asks the port of the ship that carries it, not of the infantry it carries', () => {
    const overseas = column(['infantry', 'cargo']);
    expect(refusalOf('attack', region, overseas)).toBe('NO_PORT_AT_DEPARTURE');
    const quay = column(['infantry', 'cargo'], {
      departureBuildings: new Set<BuildingKey>(['barracks', 'port']),
    });
    expect(refusalOf('attack', shore, quay)).toBeNull();
  });

  /**
   * A fleet posted on the open sea has no ground under it and never will: reading the quay on it
   * stranded every hull that reached the water for the rest of the season. What separates the
   * two cases below is the water under the pile, never what the pile carries.
   */
  it('asks no port of a fleet already at sea — there is no quay to leave from out there', () => {
    const posted = column(['escort', 'cargo'], { afloat: true });
    expect(refusalOf('attack', shore, posted)).toBeNull();
    expect(refusalOf('march', sea, posted)).toBeNull();
  });

  it('still asks it of the same fleet at a quayless coast — afloat is the point, not the pile', () => {
    expect(refusalOf('attack', region, column(['escort', 'cargo']))).toBe('NO_PORT_AT_DEPARTURE');
  });

  /**
   * **The port was paid at the first departure** (ADR 0019 §2), when the boots left the ground
   * for the water. Asking a second quay of a transport that never touched one again made every
   * mixed column moored offshore a *mouvement fantôme*: troops the game holds, places and feeds,
   * and that no order can ever move. The water under the pile decides, not what it carries.
   */
  it('lets a combined column posted at sea march on towards a coast', () => {
    const posted = column(['infantry', 'cargo'], { afloat: true });
    expect(refusalOf('march', shore, posted)).toBeNull();
    expect(refusalOf('attack', shore, posted)).toBeNull();
  });

  it('still refuses the same combined column on a quayless inland point', () => {
    const ashore = column(['infantry', 'cargo']);
    expect(refusalOf('march', shore, ashore)).toBe('NO_PORT_AT_DEPARTURE');
    expect(refusalOf('attack', region, ashore)).toBe('NO_PORT_AT_DEPARTURE');
  });

  /**
   * **La plage rend son quai** (décision 72a, 04/09). Une colonne débarquée se tient sur un point
   * de côte : elle y est venue par la mer, et lui réclamer un port l'échouerait là pour la saison
   * — le *mouvement fantôme* que la révision du 27/08 avait déjà chassé du large. Le point
   * intérieur, lui, reste refusé : la règle ne fabrique pas de quai.
   */
  it('asks no port of a column standing on the beach it landed on', () => {
    const landed = column(['infantry', 'cargo'], { coastal: true });
    expect(refusalOf('march', shore, landed)).toBeNull();
    const inland = column(['cargo']);
    expect(refusalOf('march', point, inland)).toBe('NO_PORT_AT_DEPARTURE');
  });

  it('exempts nothing of the sky: nothing is ever posted there', () => {
    const posted = column(['bomber'], { afloat: true });
    expect(refusalOf('attack', region, posted)).toBe('NO_AIRFIELD_AT_DEPARTURE');
  });
});

/**
 * **Une pile en mer part par sa coque, ou elle ne part pas** (regle 3 du 18/09). Rester en mer
 * est devenu un ordre, donc l'infanterie dont le transport a coule a une adresse sur l'eau et
 * aucun moyen d'en bouger : c'est le *mouvement fantome* une quatrieme fois, et il se refuse par
 * un mot plutot que par un `NO_LAND_ROUTE` qui parlerait d'une route qu'on ne cherchait pas.
 */
describe('la coque, seule porte du large', () => {
  it('refuses a land pile stranded on the water, whatever it aims at', () => {
    const adrift = column(['infantry'], { afloat: true });
    expect(refusalOf('march', shore, adrift)).toBe('NO_HULL_AT_SEA');
    expect(refusalOf('march', sea, adrift)).toBe('NO_HULL_AT_SEA');
    expect(legalMovementTypes(shore, adrift)).toEqual([]);
  });

  it('lets the same pile go the moment a hull stands in it', () => {
    const aboard = column(['infantry', 'cargo'], { afloat: true });
    expect(refusalOf('march', sea, aboard)).toBeNull();
    expect(refusalOf('march', shore, aboard)).toBeNull();
  });

  /** L'aerodrome passe avant : rien n'est jamais poste dans le ciel, donc une aile a flot est
   *  une aile a une station, et c'est son champ qui lui manque. */
  it('names the missing aerodrome before the missing hull', () => {
    expect(refusalOf('march', shore, column(['bomber'], { afloat: true }))).toBe(
      'NO_AIRFIELD_AT_DEPARTURE',
    );
  });

  /** A terre, rien ne change : la phrase est pour l'eau et pour elle seule. */
  it('says nothing of the kind to a column on dry ground', () => {
    expect(refusalOf('march', point, column(['infantry']))).toBeNull();
  });
});

/**
 * **Un débarquement se vise, il ne se traverse pas** (décision 72a, 04/09). Une colonne embarquée
 * ne nomme qu'un bord d'eau ; ce qu'elle fera de l'intérieur des terres est l'ordre d'après, donné
 * par le joueur depuis la plage. Le refus se lit sur la seule cible, sans route et sans grille —
 * c'est ce que le `coastal` de la visée porte, et c'est ce qui tient le fan et le serveur ensemble
 * (ADR 0015).
 */
describe('where a landing column may put its boots down', () => {
  it('keeps a landed infantry on land and a cargo on the water or shore', () => {
    expect(legalMovementTypes(sea, column(['infantry'], { coastal: true }))).toEqual([]);
    expect(refusalOf('march', sea, column(['infantry']))).toBe('LAND_TARGET_REQUIRED');
    const cargo = column(['cargo'], { coastal: true });
    expect(legalMovementTypes(point, cargo)).toEqual([]);
    expect(refusalOf('march', point, cargo)).toBe('SEA_TARGET_REQUIRED');
    expect(legalMovementTypes(sea, cargo)).toEqual(['march', 'attack']);
    expect(legalMovementTypes(shore, cargo)).toEqual(['march', 'attack']);
  });
  const landing = (held: Partial<Column> = {}) =>
    column(['infantry', 'cargo'], {
      departureBuildings: new Set<BuildingKey>(['barracks', 'port']),
      ...held,
    });

  it('takes the beach and refuses the ground behind it', () => {
    expect(refusalOf('march', shore, landing())).toBeNull();
    expect(refusalOf('march', point, landing())).toBe('LANDING_NEEDS_A_COAST');
  });

  it('answers the same on the five targets, and closes the fan on three of them', () => {
    const inlandPost: MovementAim = {
      kind: 'outpost',
      outpostId: 'AP-02',
      hostCountry: 'ITA',
      coastal: false,
    };
    const shorePost: MovementAim = { ...inlandPost, coastal: true };
    expect(legalMovementTypes(sea, landing())).toEqual(['march', 'attack']);
    expect(legalMovementTypes(shore, landing())).toEqual(['march', 'attack']);
    expect(legalMovementTypes(shorePost, landing())).toEqual(['attack', 'raid']);
    expect(legalMovementTypes(point, landing())).toEqual([]);
    expect(legalMovementTypes(inlandPost, landing())).toEqual([]);
    expect(legalMovementTypes(region, landing())).toEqual([]);
  });

  /**
   * **Un cargo peut rester en mer avec des unites dedans** (decision de Pierre, 18/09, qui revise
   * la 72a). Le large est une destination comme une autre pour une colonne embarquee ; ce qui
   * reste refuse est l'interieur des terres, parce que la jambe terrestre apres la mer n'existe
   * toujours pas. Le debarquement, lui, n'a pas bouge : il se vise.
   */
  it('takes the open sea and stays there, passengers aboard', () => {
    expect(refusalOf('march', sea, landing())).toBeNull();
    expect(refusalOf('march', shore, landing())).toBeNull();
    expect(refusalOf('march', point, landing())).toBe('LANDING_NEEDS_A_COAST');
  });

  /** La coque seule et la botte seule ne changent pas d'un mot : la revision ne touche que la
   *  colonne embarquee, qui est la seule a avoir eu deux milieux a concilier. */
  it('leaves the hull alone and the boots alone exactly where they were', () => {
    const cargo = column(['cargo'], { departureBuildings: new Set<BuildingKey>(['port']) });
    expect(legalMovementTypes(sea, cargo)).toEqual(['march', 'attack']);
    expect(refusalOf('march', point, cargo)).toBe('SEA_TARGET_REQUIRED');
    const boots = column(['infantry']);
    expect(refusalOf('march', sea, boots)).toBe('LAND_TARGET_REQUIRED');
    expect(refusalOf('march', point, boots)).toBeNull();
  });

  /** Un port ami *est* la côte : la colonne y entre en garnison, coques et passagers ensemble. */
  it('takes a port of its own, and no other mast', () => {
    const port: MovementAim = { kind: 'building', buildingId: 'B-1', key: 'port' };
    expect(refusalOf('march', port, landing())).toBeNull();
  });

  /**
   * **La porte de départ passe avant la plage**, et c'est l'ordre que la rose montre : un joueur
   * lit sur la carte qu'il vise l'intérieur, il ne lit nulle part que sa pile n'a pas de quai.
   */
  it('names the missing quay before the missing coast', () => {
    expect(refusalOf('march', point, landing({ departureBuildings: new Set<BuildingKey>() }))).toBe(
      'NO_PORT_AT_DEPARTURE',
    );
  });

  /** Une colonne de terre pure ne change en rien : elle vise ce qu'elle visait. */
  it('leaves a column that only walks exactly where it was', () => {
    expect(legalMovementTypes(point, column(['infantry']))).toEqual(['march', 'attack']);
    expect(legalMovementTypes(region, column(['infantry', 'landTransport']))).toEqual(['attack']);
  });
});

/**
 * Crossing is an investment, not a surcharge (design sheet 09): a land troop rides or it stays.
 * The numbers are `LIFT_CAPACITY` and `LIFT_COST` (ADR 0025), assumed, never simulated — and a
 * passenger sits in **one** transport, so capacities never add up from one hull to the next.
 */
describe('the places aboard', () => {
  const quay = (roles: ReadonlyArray<UnitRole>) =>
    column(roles, { departureBuildings: new Set<BuildingKey>(['barracks', 'port', 'airfield']) });
  const airfield: MovementAim = { kind: 'building', buildingId: 'B-air', key: 'airfield' };

  it('takes twelve infantry aboard one cargo, and refuses the thirteenth', () => {
    const twelve: ReadonlyArray<UnitRole> = Array<UnitRole>(12).fill('infantry');
    expect(refusalOf('attack', shore, quay([...twelve, 'cargo']))).toBeNull();
    expect(refusalOf('attack', shore, quay([...twelve, 'infantry', 'cargo']))).toBe(
      'NOT_ENOUGH_LIFT',
    );
  });

  it('charges an armour three places: four ride a cargo, a fifth does not', () => {
    const four: ReadonlyArray<UnitRole> = Array<UnitRole>(4).fill('armor');
    expect(refusalOf('attack', shore, quay([...four, 'cargo']))).toBeNull();
    expect(refusalOf('attack', shore, quay([...four, 'armor', 'cargo']))).toBe('NOT_ENOUGH_LIFT');
  });

  it('gives a carrier six places — two armour', () => {
    expect(refusalOf('attack', shore, quay(['armor', 'armor', 'carrier']))).toBeNull();
    expect(refusalOf('attack', shore, quay(['armor', 'armor', 'infantry', 'carrier']))).toBe(
      'NOT_ENOUGH_LIFT',
    );
  });

  it('counts an escort as no ferry at all', () => {
    expect(refusalOf('attack', shore, quay(['infantry', 'escort']))).toBe('NOT_ENOUGH_LIFT');
  });

  it('gives an air transport two places, and never flies an armour, however many wings', () => {
    expect(refusalOf('march', airfield, quay(['infantry', 'infantry', 'airTransport']))).toBeNull();
    expect(
      refusalOf('march', airfield, quay(['infantry', 'infantry', 'infantry', 'airTransport'])),
    ).toBe('NOT_ENOUGH_LIFT');
    expect(
      refusalOf('march', airfield, quay(['armor', 'airTransport', 'airTransport', 'airTransport'])),
    ).toBe('NOT_ENOUGH_LIFT');
  });

  it('asks nothing of a pile that never leaves its own medium', () => {
    const many: ReadonlyArray<UnitRole> = Array<UnitRole>(9).fill('armor');
    expect(refusalOf('attack', region, quay(many))).toBeNull();
    expect(refusalOf('attack', sea, quay(['escort', 'escort', 'carrier']))).toBeNull();
  });
});

/**
 * **One flies down into an aerodrome of one's own, and nowhere else** (ADR 0025 §4). A wing
 * alone still goes where it likes; it is the passengers that ask for a field under them.
 */
describe('where a column that flies its passengers may land', () => {
  const field = column(['infantry', 'airTransport'], {
    departureBuildings: new Set<BuildingKey>(['airfield']),
  });
  const airfield: MovementAim = { kind: 'building', buildingId: 'B-air', key: 'airfield' };

  it('lands on an aerodrome of mine', () => {
    expect(legalMovementTypes(airfield, field)).toEqual(['march']);
  });

  it('refuses any other ground, and says it needs an aerodrome', () => {
    expect(legalMovementTypes(point, field)).toEqual([]);
    expect(refusalOf('march', point, field)).toBe('AIRFIELD_TARGET_REQUIRED');
    expect(refusalOf('march', shore, field)).toBe('AIRFIELD_TARGET_REQUIRED');
  });

  it('leaves a wing with no passenger free to fly anywhere', () => {
    const wing = column(['bomber'], { departureBuildings: new Set<BuildingKey>(['airfield']) });
    expect(refusalOf('march', point, wing)).toBeNull();
  });
});

/**
 * **Founding is what a column does where it stands**, so the rule reads the pile and the ground
 * under it, and nothing else — no aim, no gate, no route (ADR 0019 §1).
 */
describe('planting a point', () => {
  it('takes a pile of nothing but infantry', () => {
    expect(foundingRefusal(['infantry', 'infantry'], false, true)).toBeNull();
    expect(foundingRefusal(['infantry', 'armor'], false, true)).toBe('INFANTRY_ONLY');
    expect(foundingRefusal(['cargo'], false, true)).toBe('INFANTRY_ONLY');
  });

  it('refuses ground that already carries a building of mine', () => {
    expect(foundingRefusal(['infantry'], true, true)).toBe('FRIENDLY_TARGET');
  });

  it('refuses a column with nothing in it', () => {
    expect(foundingRefusal([], false, true)).toBe('EMPTY_MOVEMENT');
  });

  /**
   * **On ne fonde pas en mer** (regle 5 du 18/09). Le trou s'est ouvert avec le large comme
   * destination : une infanterie mouillee au large est une colonne posee sur un sol que personne
   * ne possede, donc « hors de chez moi » — la seule condition que la regle posait.
   */
  it('refuses the open sea, which no hull makes buildable', () => {
    expect(foundingRefusal(['infantry'], false, false)).toBe('NO_FOUNDING_AT_SEA');
    expect(foundingRefusal(['infantry'], false, true)).toBeNull();
  });

  /** L'ordre des mots : ce que la colonne porte se lit avant le sol sous elle, parce que c'est
   *  ce que le joueur peut changer sans bouger. */
  it('names the armour before the water', () => {
    expect(foundingRefusal(['infantry', 'armor'], false, false)).toBe('INFANTRY_ONLY');
  });
});

/** ADR 0012's four modes, and which pile asks for which. */
describe('the terrain a column travels on', () => {
  it('keeps a walking column on the land, where it belongs with no ship', () => {
    expect(routeModeOf(['infantry', 'armor'])).toBe('land');
  });

  it('keeps a hull at sea', () => {
    expect(routeModeOf(['escort', 'cargo'])).toBe('naval');
  });

  it('flies as soon as a wing is in the pile', () => {
    expect(routeModeOf(['bomber'])).toBe('air');
    expect(routeModeOf(['infantry', 'fighter'])).toBe('air');
  });

  /** The mixed case stopped being unreachable: it is the only way to another continent. */
  it('gives a land-and-sea pile the combined trip, which is what it is', () => {
    expect(routeModeOf(['infantry', 'cargo'])).toBe('combined');
  });
});

/**
 * The form that answers everywhere (ADR 0019 §1). It is not resolved into what stands there, so
 * the rule can say almost nothing about it — and that silence is the point.
 */
describe('a point as a destination', () => {
  const somewhere: MovementAim = {
    kind: 'point',
    lon: 25.2,
    lat: 44.6,
    coastal: false,
    onLand: true,
    surveyed: true,
  };

  it('takes a march, at any scale and with no region drawn', () => {
    expect(legalMovementTypes(somewhere, column(['infantry']))).toEqual(['march', 'attack']);
  });

  /**
   * **The march refuses no ground for allegiance** (ADR 0019 §7) — that is the whole of what
   * separates it from an attack, and it is what makes "go and stand there" orderable on one's
   * own soil. Its target is a place and only a place: an outpost is something one comes to
   * fight, and marching *at* one would be an attack under another word.
   */
  it('takes the march on my own ground as on anybody else’s', () => {
    const home = column(['infantry'], { myRegionIds: new Set(['ROU-310']) });
    expect(refusalOf('march', somewhere, home)).toBeNull();
  });

  it('takes no march at an outpost — a march goes to a place', () => {
    const aimed: MovementAim = {
      kind: 'outpost',
      outpostId: 'AP-01',
      hostCountry: 'ROU',
      coastal: false,
    };
    expect(refusalOf('march', aimed, column(['infantry']))).toBe('POINT_TARGET_ONLY');
  });

  it('holds the march to the same domain doors as the rest', () => {
    expect(refusalOf('march', somewhere, column(['cargo']))).toBe('NO_PORT_AT_DEPARTURE');
  });

  it('takes no raid: a coordinate has no point to disable', () => {
    expect(refusalOf('raid', somewhere, column(['infantry']))).toBe('OUTPOST_TARGET_ONLY');
  });

  /** Refusing to resolve it cuts both ways: it is never friendly ground either. */
  it('is never mine, even dropped on a region I hold', () => {
    const home = column(['infantry'], { myRegionIds: new Set(['ROU-310']) });
    expect(refusalOf('attack', somewhere, home)).toBeNull();
  });

  it('still answers to the door of its domain', () => {
    expect(refusalOf('attack', somewhere, column(['cargo']))).toBe('NO_PORT_AT_DEPARTURE');
  });
});

/**
 * The pace, and the one effect the land transport has. It is read on the whole column, like the
 * route: one infantry too many puts everybody at a walk, and there is no half-motorized column.
 */
describe('the pace of a land column', () => {
  it('rolls when the infantry fits in the trucks', () => {
    expect(motorized(['infantry', 'infantry', 'landTransport'])).toBe(true);
    expect(landCostOf(['infantry', 'infantry', 'landTransport'])).toBe(
      COST_BY_MEDIUM.landMotorized,
    );
  });

  it('walks on one infantry too many, and the whole column walks', () => {
    expect(motorized(['infantry', 'infantry', 'infantry', 'landTransport'])).toBe(false);
    expect(landCostOf(['infantry', 'infantry', 'infantry', 'landTransport'])).toBe(
      COST_BY_MEDIUM.land,
    );
  });

  it('rolls with no truck at all when nothing in it walks', () => {
    // The armour is motorized by nature, and so is the truck: only the foot soldier asks for
    // a seat. A tank column drives.
    expect(motorized(['armor', 'armor'])).toBe(true);
    expect(motorized(['landTransport'])).toBe(true);
  });

  it('walks on a single infantry with nothing to ride', () => {
    expect(motorized(['infantry'])).toBe(false);
  });

  it('counts the trucks, not the transports of the other media', () => {
    // A hull lifts across the water; it does not drive anybody down a road.
    expect(motorized(['infantry', 'infantry', 'cargo'])).toBe(false);
    expect(motorized(['infantry', 'infantry', 'airTransport'])).toBe(false);
  });

  it('leaves the crossing ledger alone — a truck is no ferry', () => {
    // The land seats live outside `LIFT_CAPACITY` precisely so that this stays refused: a
    // column of two infantry and a truck has nothing to cross the water aboard.
    expect(routeModeOf(['infantry', 'infantry', 'landTransport'])).toBe('land');
  });
});

/**
 * **Entering a garrison is a march aimed at a building of one's own** (decisions 64b, 70b). The
 * infantry enters everything; every other role only its own domain's buildings; a mixed column
 * only if each of its roles may. One table, `GARRISON_KEYS_BY_ROLE`, read here and by the
 * server — never two.
 */
describe('a march aimed at a building of mine', () => {
  const mine: MovementAim = { kind: 'building', buildingId: 'B-mine', key: 'mine' };
  const barracks: MovementAim = { kind: 'building', buildingId: 'B-barracks', key: 'barracks' };
  const port: MovementAim = { kind: 'building', buildingId: 'B-port', key: 'port' };
  const airfield: MovementAim = { kind: 'building', buildingId: 'B-air', key: 'airfield' };
  const quay = { departureBuildings: new Set<BuildingKey>(['port']) };

  it('lets the infantry into any building, mine included', () => {
    expect(legalMovementTypes(mine, column(['infantry']))).toEqual(['march']);
    expect(legalMovementTypes(port, column(['infantry']))).toEqual(['march']);
  });

  it('keeps armour out of a mine and lets it into a barracks, naming role and building', () => {
    expect(refusalOf('march', mine, column(['armor']))).toBe('NOT_A_GARRISON_FOR');
    expect(barredFrom(['armor'], 'mine')).toEqual({ role: 'armor', building: 'mine' });
    expect(refusalOf('march', barracks, column(['armor']))).toBeNull();
  });

  it('opens the port and the aerodrome to every land troop (ADR 0025 §5)', () => {
    expect(refusalOf('march', port, column(['armor', 'landTransport']))).toBeNull();
    expect(refusalOf('march', airfield, column(['armor', 'landTransport']))).toBeNull();
  });

  it('sends a cargo to a port and nowhere else, and a bomber to an aerodrome', () => {
    expect(refusalOf('march', barracks, column(['cargo'], quay))).toBe('NOT_A_GARRISON_FOR');
    expect(refusalOf('march', port, column(['cargo'], quay))).toBeNull();
    expect(refusalOf('march', airfield, column(['bomber']))).toBe('NO_AIRFIELD_AT_DEPARTURE');
    expect(refusalOf('march', port, column(['bomber']))).toBe('NOT_A_GARRISON_FOR');
  });

  it('refuses a mixed column as soon as one of its roles may not enter', () => {
    expect(refusalOf('march', port, column(['infantry', 'cargo'], quay))).toBeNull();
    expect(refusalOf('march', barracks, column(['infantry', 'cargo'], quay))).toBe(
      'NOT_A_GARRISON_FOR',
    );
    expect(barredFrom(['infantry', 'cargo'], 'barracks')).toEqual({
      role: 'cargo',
      building: 'barracks',
    });
  });

  it('still reads the door under the column before letting it enter', () => {
    expect(refusalOf('march', port, column(['cargo']))).toBe('NO_PORT_AT_DEPARTURE');
  });

  it('refuses the attack and the raid on it — a building of mine is friendly ground', () => {
    expect(refusalOf('attack', mine, column(['infantry']))).toBe('FRIENDLY_TARGET');
    expect(refusalOf('raid', mine, column(['infantry']))).toBe('OUTPOST_TARGET_ONLY');
  });

  it('carries the role and the building in the refusal details, the berths otherwise', () => {
    expect(refusalDetails(mine, column(['armor']))).toEqual({
      needed: 3,
      offered: 0,
      role: 'armor',
      building: 'mine',
    });
    expect(refusalDetails(point, column(['infantry']))).toEqual({ needed: 1, offered: 0 });
  });
});

/**
 * **On embarque dans un transport, et on y reste** (ADR 0025, révisée le 15/10) : une troupe
 * terrestre monte dans **ce** transport s'il a de la place — par mer n'importe où, par air dans
 * un aérodrome seulement, et dans un camion si elle est d'infanterie.
 */
describe('boarding a transport', () => {
  type Seat = { id: string; role: UnitRole; carriedBy?: string | undefined };
  const cargo: Seat = { id: 'C', role: 'cargo' };
  const board = (
    riders: ReadonlyArray<Seat>,
    carrier: Seat = cargo,
    others: ReadonlyArray<Seat> = [],
    atAirfield = false,
  ) => boardingRefusalOf({ riders, carrier, pile: [carrier, ...riders, ...others], atAirfield });
  const armor = (id: string, carriedBy?: string): Seat => ({ id, role: 'armor', carriedBy });
  const rifle = (id: string, carriedBy?: string): Seat => ({ id, role: 'infantry', carriedBy });

  it('seats two armour on a cargo', () => {
    expect(board([armor('A-1'), armor('A-2')])).toBeNull();
  });

  it('counts the passengers already aboard, and not those who only stand there', () => {
    const riding = [armor('A-3', 'C'), armor('A-4', 'C'), armor('A-5', 'C')];
    expect(board([armor('A-1'), armor('A-2')], cargo, riding)).toBe('NOT_ENOUGH_LIFT');
    expect(
      board([armor('A-1'), armor('A-2')], cargo, [armor('A-3'), armor('A-4'), armor('A-5')]),
    ).toBeNull();
  });

  it('weighs a loaded truck with its riflemen', () => {
    const truck: Seat = { id: 'T', role: 'landTransport' };
    const wing: Seat = { id: 'W', role: 'airTransport' };
    expect(board([truck], wing, [rifle('I', 'T')], true)).toBe('NOT_ENOUGH_LIFT');
    expect(
      boardingRefusalDetails({
        riders: [truck],
        carrier: wing,
        pile: [wing, truck, rifle('I', 'T')],
        atAirfield: true,
      }),
    ).toEqual({ needed: 3, offered: 2 });
  });

  it('boards an air transport only on an aerodrome, and never an armour', () => {
    const wing: Seat = { id: 'W', role: 'airTransport' };
    expect(board([rifle('I-1'), rifle('I-2')], wing, [], true)).toBeNull();
    expect(board([rifle('I-1')], wing)).toBe('AIRFIELD_BOARDING_ONLY');
    expect(board([armor('A')], wing, [], true)).toBe('NOT_ENOUGH_LIFT');
  });

  it('seats only riflemen in a truck, two of them', () => {
    const truck: Seat = { id: 'T', role: 'landTransport' };
    expect(board([rifle('I-1'), rifle('I-2')], truck)).toBeNull();
    expect(board([rifle('I-1')], truck, [rifle('I-2', 'T'), rifle('I-3', 'T')])).toBe(
      'NOT_ENOUGH_LIFT',
    );
    expect(board([armor('A')], truck)).toBe('TRUCK_SEATS_INFANTRY');
  });

  it('needs something that lifts, and only land troops board', () => {
    expect(board([armor('A')], { id: 'E', role: 'escort' })).toBe('NO_TRANSPORT_HERE');
    expect(board([{ id: 'F', role: 'fighter' }])).toBe('LAND_TROOPS_ONLY');
    expect(board([])).toBe('EMPTY_MOVEMENT');
  });
});

/** **On débarque où l'on est** (15/10) : à terre ou à quai, jamais au large, et d'un avion dans un
 *  de ses aérodromes seulement. */
describe('disembarking', () => {
  const off = (held: Partial<Parameters<typeof disembarkRefusalOf>[0]> = {}) =>
    disembarkRefusalOf({ carrier: 'cargo', afloat: false, atAirfield: false, ...held });

  it('sets a passenger ashore where its transport stands', () => {
    expect(off()).toBeNull();
    expect(off({ carrier: 'landTransport' })).toBeNull();
    expect(off({ carrier: 'airTransport', atAirfield: true })).toBeNull();
  });

  it('refuses the open sea, a wing off its field, and a troop on foot', () => {
    expect(off({ afloat: true })).toBe('DISEMBARK_AT_SEA');
    expect(off({ carrier: 'airTransport' })).toBe('AIRFIELD_TARGET_REQUIRED');
    expect(off({ carrier: null })).toBe('NOT_ABOARD');
  });
});

describe('a Blitz order (lot 5)', () => {
  const europe = theatreById('europe')!;
  const blitz = (
    roles: ReadonlyArray<UnitRole>,
    held: Partial<NonNullable<Column['blitz']>> = {},
    standing: Partial<Column> = {},
  ) =>
    column(roles, {
      ...standing,
      blitz: { theatre: europe, reloading: false, occupiedBuildingIds: new Set(), ...held },
    });
  const paris: MovementAim = { ...point, lon: 2.35, lat: 48.85 };
  const newYork: MovementAim = { ...point, lon: -74, lat: 40.7 };
  const track: MovementAim = {
    kind: 'track',
    movementId: 'm1',
    lon: 4,
    lat: 50,
    hostCountry: 'BEL',
    onLand: true,
    coastal: false,
  };
  const enemyCamp: MovementAim = { ...camp, lon: 4, lat: 50 };

  it('sends one troop and never two', () => {
    expect(refusalOf('march', paris, blitz(['infantry', 'infantry']))).toBe('ONE_UNIT_ONLY');
    expect(refusalOf('march', paris, blitz(['infantry']))).toBeNull();
  });

  it('counts units and not roles: a transport leaves with what it carries', () => {
    const atSea = { ...sea, lon: 4, lat: 52 };
    expect(
      refusalOf('march', atSea, blitz(['cargo', 'infantry'], {}, { afloat: true })),
    ).toBeNull();
    expect(refusalOf('march', paris, blitz(['landTransport', 'infantry', 'infantry']))).toBeNull();
    expect(refusalOf('march', atSea, blitz(['cargo', 'escort'], {}, { afloat: true }))).toBe(
      'ONE_UNIT_ONLY',
    );
  });

  it('keeps a plane in the air: it leaves from where it is, without an airfield', () => {
    expect(refusalOf('march', paris, blitz(['bomber']))).toBeNull();
    expect(refusalOf('march', paris, column(['bomber']))).toBe('NO_AIRFIELD_AT_DEPARTURE');
  });

  it('still takes its passengers aboard and sets them down at an airfield only', () => {
    const airfield: MovementAim = { kind: 'building', buildingId: 'b1', key: 'airfield' };
    expect(refusalOf('march', airfield, blitz(['airTransport', 'infantry']))).toBe(
      'NO_AIRFIELD_AT_DEPARTURE',
    );
    const fromAirfield = blitz(
      ['airTransport', 'infantry'],
      {},
      {
        departureBuildings: new Set<BuildingKey>(['airfield']),
      },
    );
    expect(refusalOf('march', paris, fromAirfield)).toBe('AIRFIELD_TARGET_REQUIRED');
    expect(refusalOf('march', airfield, fromAirfield)).toBeNull();
    expect(refusalOf('march', paris, blitz(['airTransport']))).toBeNull();
  });

  it('aims nowhere outside its theatre', () => {
    expect(refusalOf('march', newYork, blitz(['infantry']))).toBe('OUTSIDE_THEATRE');
    expect(refusalOf('march', newYork, column(['infantry']))).toBeNull();
  });

  it('attacks a unit, not a place', () => {
    expect(refusalOf('attack', paris, blitz(['infantry']))).toBe('UNIT_TARGET_ONLY');
    expect(refusalOf('attack', enemyCamp, blitz(['infantry']))).toBeNull();
    expect(refusalOf('attack', track, blitz(['infantry']))).toBeNull();
  });

  it('leaves the artillery its bombardment, never a charge', () => {
    expect(refusalOf('attack', enemyCamp, blitz(['artillery']))).toBe('INDIRECT_FIRE_ONLY');
    expect(refusalOf('march', paris, blitz(['artillery']))).toBeNull();
  });

  it('chases a column only in a Blitz', () => {
    expect(refusalOf('attack', track, column(['infantry']))).toBe('NOTHING_TO_ATTACK');
  });

  it('moves while reloading, but does not attack', () => {
    const reloading = blitz(['infantry'], { reloading: true });
    expect(refusalOf('attack', enemyCamp, reloading)).toBe('RELOADING');
    expect(refusalOf('march', paris, reloading)).toBeNull();
  });

  it('enters a building of mine only while it stands empty', () => {
    const barracks: MovementAim = { kind: 'building', buildingId: 'b1', key: 'barracks' };
    expect(
      refusalOf('march', barracks, blitz(['infantry'], { occupiedBuildingIds: new Set(['b1']) })),
    ).toBe('BUILDING_OCCUPIED');
    expect(refusalOf('march', barracks, blitz(['infantry']))).toBeNull();
  });
});
