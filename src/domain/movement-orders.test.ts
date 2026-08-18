import { describe, expect, it } from 'vitest';
import type { BuildingKey, UnitRole } from './ids';
import {
  legalMovementTypes,
  refusalOf,
  routeModeOf,
  type Column,
  type MovementAim,
} from './movement-orders';

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
  it('offers the attack and the foundation on a foreign region', () => {
    expect(legalMovementTypes(region, column(['infantry']))).toEqual(['attack', 'outpost']);
  });

  it('offers the attack and the raid on a foreign outpost, never the foundation', () => {
    expect(legalMovementTypes(outpost, column(['infantry']))).toEqual(['attack', 'raid']);
  });

  it('drops the foundation as soon as the column is not infantry alone', () => {
    expect(legalMovementTypes(region, column(['infantry', 'armor']))).toEqual(['attack']);
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
    expect(legalMovementTypes(region, posted)).toEqual(['attack', 'outpost']);
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

  it('refuses a foundation on an outpost', () => {
    expect(refusalOf('outpost', outpost, column(['infantry']))).toBe('REGION_TARGET_ONLY');
  });

  /** Nobody orders a return: the resolution creates it, so the rule has to say so out loud. */
  it('refuses the return, the agent, the decoy and the recall as unorderable', () => {
    expect(refusalOf('return', region, column(['infantry']))).toBe('NOT_ORDERABLE');
    expect(refusalOf('agent', region, column(['infantry']))).toBe('NOT_ORDERABLE');
    expect(refusalOf('decoy', region, column(['infantry']))).toBe('NOT_ORDERABLE');
    expect(refusalOf('recall', region, column(['infantry']))).toBe('NOT_ORDERABLE');
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

  /** The foundation crosses too, and the ship that ferried the founders is not one of them. */
  it('lets a cargo ferry founders overseas, and still refuses an armour among them', () => {
    expect(refusalOf('outpost', region, quay(['infantry', 'infantry', 'cargo']))).toBeNull();
    expect(refusalOf('outpost', region, quay(['infantry', 'armor', 'cargo']))).toBe(
      'INFANTRY_ONLY',
    );
    expect(refusalOf('outpost', region, quay(['cargo']))).toBe('INFANTRY_ONLY');
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
    expect(legalMovementTypes(somewhere, column(['infantry']))).toEqual(['attack']);
  });

  it('takes no foundation: an outpost stands on ground that produces', () => {
    expect(refusalOf('outpost', somewhere, column(['infantry']))).toBe('REGION_TARGET_ONLY');
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
