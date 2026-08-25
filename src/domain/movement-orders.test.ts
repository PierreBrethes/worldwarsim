import { describe, expect, it } from 'vitest';
import { DECOY_COST } from '../../convex/constants';
import { fr } from '@/i18n/fr';
import type { BuildingKey, UnitRole } from './ids';
import {
  foundingRefusal,
  landCostOf,
  legalMovementTypes,
  motorized,
  movementSlots,
  ORDERABLE_TYPES,
  refusalOf,
  routeModeOf,
  type Column,
  type MovementAim,
} from './movement-orders';
import { COST_BY_MEDIUM } from './routing';

const column = (roles: ReadonlyArray<UnitRole>, held: Partial<Column> = {}): Column => ({
  roles,
  myRegionIds: new Set(),
  myOutpostIds: new Set(),
  departureBuildings: new Set<BuildingKey>(),
  ...held,
});

const region: MovementAim = { kind: 'region', regionId: 'TUN-1', country: 'Tunisia' };
const outpost: MovementAim = { kind: 'outpost', outpostId: 'op1', hostCountry: 'Libya' };

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
  it('names the ground as friendly rather than the column as wrong', () => {
    const held = column(['infantry'], { myOutpostIds: new Set(['op1']) });
    expect(refusalOf('raid', outpost, held)).toBe('FRIENDLY_TARGET');
  });

  it('refuses a raid on a region: a region has no point to disable', () => {
    expect(refusalOf('raid', region, column(['infantry']))).toBe('OUTPOST_TARGET_ONLY');
  });

  /** Nobody orders a return: the resolution creates it, so the rule has to say so out loud.
   *  The foundation joins them — it is not a march at all any more. The decoy left this list
   *  the day it was coded (ADR 0006); it refuses on its target, like a real order. */
  it('refuses the return, the agent, the recall and the foundation', () => {
    expect(refusalOf('outpost', region, column(['infantry']))).toBe('NOT_ORDERABLE');
    expect(refusalOf('return', region, column(['infantry']))).toBe('NOT_ORDERABLE');
    expect(refusalOf('agent', region, column(['infantry']))).toBe('NOT_ORDERABLE');
    expect(refusalOf('recall', region, column(['infantry']))).toBe('NOT_ORDERABLE');
  });
});

/**
 * **Le leurre : un mouvement sans troupe** (ADR 0006, fiche 04). Il occupe un slot comme un
 * vrai — c'est le forfait et le slot qui en font une décision — et il ne demande rien à la pile,
 * puisqu'il n'en emmène aucune. C'est la seule sorte que la pile vide ne refuse pas.
 */
describe('the decoy', () => {
  const empty: Column = {
    roles: [],
    myRegionIds: new Set(),
    myOutpostIds: new Set(),
    departureBuildings: new Set(),
  };
  const somewhere: MovementAim = { kind: 'point', lon: 25.2, lat: 44.6 };

  it('is the one order an empty manifest does not refuse', () => {
    expect(refusalOf('decoy', somewhere, empty)).toBeNull();
    expect(refusalOf('march', somewhere, empty)).toBe('EMPTY_MOVEMENT');
  });

  /** A feint goes where a march goes and nowhere else: one that could raid would be a raid. */
  it('goes to a point and to nothing else', () => {
    expect(refusalOf('decoy', region, empty)).toBe('POINT_TARGET_ONLY');
    expect(refusalOf('decoy', outpost, empty)).toBe('POINT_TARGET_ONLY');
  });

  /** **Le slot, comme un vrai** : le plafond ne connaît pas les sortes, il compte les
   *  mouvements — ce qui est exactement ce qui fait payer la feinte en attaques non lancées. */
  it('costs a slot like any other movement', () => {
    expect(movementSlots(0)).toBe(1);
    expect(ORDERABLE_TYPES).toContain('decoy');
  });

  /** **Le refus dit le forfait** : le serveur débite `DECOY_COST`, et le message que le joueur
   *  lit après le clic est celui qui chiffre ce qui manque, jamais une paraphrase. */
  it('says the flat rate when the alloy is short', () => {
    expect(
      fr.errors.INSUFFICIENT_RESOURCE({
        resource: 'alloy',
        needed: DECOY_COST.alloy,
        available: 0,
      }),
    ).toContain(String(DECOY_COST.alloy));
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
    expect(refusalOf('attack', region, quay)).toBeNull();
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
    expect(refusalOf('attack', region, quay)).toBeNull();
  });
});

/**
 * Crossing is an investment, not a surcharge (design sheet 09): a land troop rides or it stays.
 * The numbers are `LIFT_CAPACITY` and `LIFT_COST`, and they are assumed, never simulated.
 */
describe('the places aboard', () => {
  const quay = (roles: ReadonlyArray<UnitRole>) =>
    column(roles, { departureBuildings: new Set<BuildingKey>(['barracks', 'port', 'airfield']) });

  it('takes six infantry aboard one cargo, and refuses the seventh', () => {
    const six: ReadonlyArray<UnitRole> = Array<UnitRole>(6).fill('infantry');
    expect(refusalOf('attack', region, quay([...six, 'cargo']))).toBeNull();
    expect(refusalOf('attack', region, quay([...six, 'infantry', 'cargo']))).toBe(
      'NOT_ENOUGH_LIFT',
    );
  });

  it('charges an armour two places where an infantry costs one', () => {
    expect(refusalOf('attack', region, quay(['armor', 'armor', 'armor', 'cargo']))).toBeNull();
    expect(
      refusalOf('attack', region, quay(['armor', 'armor', 'armor', 'infantry', 'cargo'])),
    ).toBe('NOT_ENOUGH_LIFT');
  });

  it('counts an escort as no ferry at all', () => {
    expect(refusalOf('attack', region, quay(['infantry', 'escort']))).toBe('NOT_ENOUGH_LIFT');
  });

  it('gives an air transport two places and no more', () => {
    expect(refusalOf('attack', region, quay(['infantry', 'infantry', 'airTransport']))).toBeNull();
    expect(
      refusalOf('attack', region, quay(['infantry', 'infantry', 'infantry', 'airTransport'])),
    ).toBe('NOT_ENOUGH_LIFT');
  });

  it('asks nothing of a pile that never leaves its own medium', () => {
    const many: ReadonlyArray<UnitRole> = Array<UnitRole>(9).fill('armor');
    expect(refusalOf('attack', region, quay(many))).toBeNull();
    expect(refusalOf('attack', region, quay(['escort', 'escort', 'carrier']))).toBeNull();
  });
});

/**
 * **Founding is what a column does where it stands**, so the rule reads the pile and the ground
 * under it, and nothing else — no aim, no gate, no route (ADR 0019 §1).
 */
describe('planting a point', () => {
  it('takes a pile of nothing but infantry', () => {
    expect(foundingRefusal(['infantry', 'infantry'], false)).toBeNull();
    expect(foundingRefusal(['infantry', 'armor'], false)).toBe('INFANTRY_ONLY');
    expect(foundingRefusal(['cargo'], false)).toBe('INFANTRY_ONLY');
  });

  it('refuses ground that already carries a building of mine', () => {
    expect(foundingRefusal(['infantry'], true)).toBe('FRIENDLY_TARGET');
  });

  it('refuses a column with nothing in it', () => {
    expect(foundingRefusal([], false)).toBe('EMPTY_MOVEMENT');
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
  const somewhere: MovementAim = { kind: 'point', lon: 25.2, lat: 44.6 };

  it('takes a march, at any scale and with no region drawn', () => {
    expect(legalMovementTypes(somewhere, column(['infantry']))).toEqual([
      'march',
      'attack',
      'decoy',
    ]);
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
    const aimed: MovementAim = { kind: 'outpost', outpostId: 'AP-01', hostCountry: 'ROU' };
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
