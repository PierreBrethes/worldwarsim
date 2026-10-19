import { describe, expect, it } from 'vitest';
import type { UnitRole, UnitTier } from './ids';
import type { ArcView } from './player-view';
import { movementWear, pilePieces, pileSheet, SQUAD_DRAWN_WHOLE, unitPieces } from './pile-pieces';

let serial = 0;
const troop = (role: UnitRole, tier: UnitTier = 1, strength = 100, nominalStrength = 100) => ({
  id: `t${++serial}`,
  role,
  tier,
  strength,
  nominalStrength,
});

/** **Ce qui est à bord ne se voit pas** (15/10) : le transport porte le compte, et ses passagers
 *  partent avec lui quand on le prend. */
describe('passengers on the board', () => {
  it('hides what rides a transport and counts it on the transport', () => {
    const cargo = troop('cargo');
    const rifle = { ...troop('infantry'), carriedBy: cargo.id };
    const walker = troop('infantry');
    const { groups, troopIds } = pilePieces([rifle, walker, cargo]);
    expect(groups.map((group) => [group.role, group.troopIds, group.aboard])).toEqual([
      ['infantry', [walker.id], undefined],
      ['cargo', [cargo.id, rifle.id], 1],
    ]);
    expect(troopIds).toEqual([rifle.id, walker.id, cargo.id]);
  });

  it('counts a Blitz transport’s passengers on its piece', () => {
    const truck = troop('landTransport');
    const rifles = [truck.id, truck.id].map((carriedBy) => ({ ...troop('infantry'), carriedBy }));
    expect(unitPieces([truck, ...rifles]).groups.map((group) => group.aboard)).toEqual([2]);
  });
});

/** **Une escouade montre toutes ses troupes** (POC « Manipuler les pions », 16/10) : une pièce
 *  par troupe, sans « +N » ni « ×N » — on ne voit plus la première troupe seule. */
describe('pilePieces', () => {
  it('is empty for no troops', () => {
    expect(pilePieces([])).toEqual({ groups: [], troopIds: [], squad: false });
    expect(pileSheet([])).toEqual([]);
  });

  it('stands every troop on its own, roles by troop count then ROLE_ORDER, none left out', () => {
    const pile = [
      { ...troop('fighter'), id: 'f1' },
      { ...troop('armor'), id: 'a1' },
      { ...troop('infantry'), id: 'i1' },
      { ...troop('armor'), id: 'a2' },
      { ...troop('bomber'), id: 'b1' },
      { ...troop('landTransport'), id: 'l1' },
    ];
    const { groups, troopIds } = pilePieces(pile);
    expect(groups.map((g) => g.troopIds)).toEqual([['a1'], ['a2'], ['i1'], ['l1'], ['f1'], ['b1']]);
    expect(groups.every((g) => g.troops === 1)).toBe(true);
    expect(troopIds).toEqual(['f1', 'a1', 'i1', 'a2', 'b1', 'l1']);
    expect(pileSheet(pile).map((l) => l.role)).toEqual([
      'armor',
      'infantry',
      'landTransport',
      'fighter',
      'bomber',
    ]);
  });

  it('is a squad from two pieces on', () => {
    expect(pilePieces([troop('armor')]).squad).toBe(false);
    expect(pilePieces([troop('armor'), troop('infantry')]).squad).toBe(true);
  });

  it('reads each troop alone: its men, its marks and its wear', () => {
    const [squad, tank] = pilePieces([
      { ...troop('infantry', 2, 50), id: 'i1' },
      { ...troop('armor', 1, 20), id: 'a1' },
    ]).groups;
    expect(squad).toMatchObject({ role: 'infantry', figures: [2, 2], wear: 'smoking' });
    expect(tank).toMatchObject({ role: 'armor', figures: [1], wear: 'burning' });
  });

  it('shows 3, 2 or 1 infantry figures by strength', () => {
    const figures = (strength: number) =>
      pilePieces([troop('infantry', 1, strength)]).groups[0]?.figures.length;
    expect(figures(100)).toBe(3);
    expect(figures(67)).toBe(3);
    expect(figures(66)).toBe(2);
    expect(figures(34)).toBe(2);
    expect(figures(33)).toBe(1);
  });

  it('shows a single figure for a vehicle whatever its strength', () => {
    expect(
      pilePieces([troop('armor', 1, 100), troop('armor', 2, 100)]).groups.map((g) => g.figures),
    ).toEqual([[1], [2]]);
  });

  it('wears by the same thresholds', () => {
    const wear = (strength: number) => pilePieces([troop('armor', 1, strength)]).groups[0]?.wear;
    expect(wear(100)).toBe('whole');
    expect(wear(60)).toBe('smoking');
    expect(wear(34)).toBe('smoking');
    expect(wear(33)).toBe('burning');
  });

  it('shows only the mark the troop has', () => {
    const marks = (tier: UnitTier) => pilePieces([troop('infantry', tier)]).groups[0]?.figures;
    expect(marks(1)).toEqual([1, 1, 1]);
    expect(marks(2)).toEqual([2, 2, 2]);
  });

  it('treats a zero nominal strength as whole', () => {
    const [group] = pilePieces([troop('armor', 1, 0, 0)]).groups;
    expect(group?.wear).toBe('whole');
    expect(pileSheet([troop('armor', 1, 0, 0)])[0]?.health).toBe(100);
  });
});

/** **Au-delà de douze troupes, une figurine par rôle** (ADR 0028 §6) : le fanion porte le compte. */
describe('a big squad', () => {
  it('draws twelve troops one by one, and carries no count', () => {
    const pieces = pilePieces(Array.from({ length: SQUAD_DRAWN_WHOLE }, () => troop('infantry')));
    expect(pieces.groups).toHaveLength(SQUAD_DRAWN_WHOLE);
    expect(pieces.count).toBeUndefined();
  });

  it('draws one figurine per role beyond twelve, each lifting its role, and counts them all', () => {
    const rifles = Array.from({ length: 10 }, () => troop('infantry', 1, 40));
    const tanks = Array.from({ length: 3 }, () => troop('armor'));
    const truck = troop('landTransport');
    const rider = { ...troop('infantry'), carriedBy: truck.id };
    const pieces = pilePieces([...rifles, ...tanks, truck, rider]);
    expect(pieces.groups.map((group) => [group.role, group.troops])).toEqual([
      ['infantry', 10],
      ['armor', 3],
      ['landTransport', 1],
    ]);
    expect(pieces.groups[0]!.troopIds).toEqual(rifles.map((one) => one.id));
    expect(pieces.groups[0]!.figures).toHaveLength(2);
    expect(pieces.groups[2]).toMatchObject({ troopIds: [truck.id, rider.id], aboard: 1 });
    expect(pieces.count).toBe(15);
    expect(pieces.squad).toBe(true);
  });

  it('counts the riders at the threshold as on the pennant', () => {
    const truck = troop('landTransport');
    const riders = [1, 2].map(() => ({ ...troop('infantry'), carriedBy: truck.id }));
    const walkers = Array.from({ length: 10 }, () => troop('infantry'));
    const pieces = pilePieces([...walkers, truck, ...riders]);
    expect(pieces.groups.map((group) => group.role)).toEqual(['infantry', 'landTransport']);
    expect(pieces.count).toBe(13);
  });
});

describe('pileSheet', () => {
  it('reads health, notches and ink', () => {
    const line = (strength: number) => pileSheet([troop('armor', 1, strength)])[0];
    expect(line(100)).toMatchObject({ health: 100, notches: 10, ink: 'ink' });
    expect(line(67)).toMatchObject({ health: 67, notches: 7, ink: 'ink' });
    expect(line(66.6)).toMatchObject({ health: 67, notches: 7, ink: 'ochre' });
    expect(line(34)).toMatchObject({ health: 34, notches: 3, ink: 'ochre' });
    expect(line(33.3)).toMatchObject({ health: 33, notches: 3, ink: 'red' });
  });

  it('counts troops and cumulates strength per role', () => {
    expect(pileSheet([troop('armor', 1, 100), troop('armor', 1, 0)])).toEqual([
      {
        role: 'armor',
        troops: 2,
        troopIds: [`t${serial - 1}`, `t${serial}`],
        health: 50,
        notches: 5,
        ink: 'ochre',
      },
    ]);
  });
});

describe('movementWear', () => {
  const mine = (troopIds: ReadonlyArray<string>) =>
    ({ state: 'mine', troopIds }) as unknown as ArcView;

  it('reads the wear of the face each medium wears, from the troops the movement carries', () => {
    const hull = troop('cargo', 1, 40);
    const tanks = [troop('armor', 1, 20), troop('armor', 1, 30)];
    const elsewhere = troop('fighter', 1, 10);
    const wear = movementWear(mine([hull.id, ...tanks.map((t) => t.id)]), [
      hull,
      ...tanks,
      elsewhere,
    ]);
    expect(wear).toEqual({ land: 'burning', sea: 'smoking', air: 'whole' });
  });

  it('leaves infantry unsmoking: it says its strength by its men', () => {
    const men = [troop('infantry', 1, 10), troop('infantry', 1, 10), troop('armor', 1, 10)];
    expect(movementWear(mine(men.map((t) => t.id)), men)?.land).toBe('whole');
  });

  it('serves nothing for a movement that is not mine', () => {
    const hull = troop('cargo', 1, 10);
    const enemy = { state: 'enemyDetected', troopIds: [hull.id] } as unknown as ArcView;
    expect(movementWear(enemy, [hull])).toBeNull();
  });
});

describe('unitPieces (Blitz: one piece per unit)', () => {
  it('stands two infantry side by side, each its own piece', () => {
    const [a, b] = [troop('infantry'), troop('infantry', 1, 40)];
    const { groups, squad } = unitPieces([a, b]);
    expect(groups.map((group) => group.troopIds)).toEqual([[a.id], [b.id]]);
    expect(groups.map((group) => [group.troops, group.figures.length])).toEqual([
      [1, 3],
      [1, 2],
    ]);
    expect(squad).toBe(false);
  });

  it('draws a transport for its passengers, which go with it', () => {
    const cargo = troop('cargo', 1, 20);
    const rider = { ...troop('infantry'), carriedBy: cargo.id };
    const { groups, troopIds } = unitPieces([rider, cargo]);
    expect(groups).toEqual([
      {
        role: 'cargo',
        troops: 1,
        troopIds: [cargo.id, rider.id],
        figures: [1],
        wear: 'burning',
        aboard: 1,
      },
    ]);
    expect(troopIds).toEqual([rider.id, cargo.id]);
  });

  it('keeps a plane in the air, and only a plane', () => {
    const { groups } = unitPieces([troop('bomber'), troop('infantry')]);
    expect(groups.map((group) => [group.role, group.aloft])).toEqual([
      ['infantry', undefined],
      ['bomber', true],
    ]);
  });
});
