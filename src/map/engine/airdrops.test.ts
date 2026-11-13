import { describe, expect, it } from 'vitest';
import { metresOnBoard } from '@/domain/piece-size';
import { airdropPlan, inFlightFrame, nearestPiece, playDrop, takerOffset } from './airdrops';
import { airdrop, ENTRY_MS, FLY_ON_MS } from './timelines/airdrop';

describe('airdropPlan: what a largage plays where the view learns it (#508)', () => {
  const near = { motion: 'full', flown: true, whole: true } as const;

  it('plays the plane and the fall at true size where the plane was just seen, close in', () => {
    expect(airdropPlan({ ...near, delivered: true })).toBe('plane');
  });

  it('lets the plane pass door shut when nothing came down, and still plays it', () => {
    expect(airdropPlan({ ...near, delivered: false })).toBe('plane');
  });

  it('drops the pixel parachute far away, or where no pawn was kept (the absence tour)', () => {
    expect(airdropPlan({ ...near, delivered: true, whole: false })).toBe('pixels');
    expect(airdropPlan({ ...near, delivered: true, flown: false })).toBe('pixels');
  });

  it('puts a pixel parachute down at reduced motion, never at true size', () => {
    expect(airdropPlan({ ...near, delivered: true, motion: 'reduced' })).toBe('pixels');
  });

  it('draws no pixel packet when nothing came down', () => {
    expect(airdropPlan({ ...near, delivered: false, whole: false })).toBe('nothing');
    expect(airdropPlan({ ...near, delivered: false, flown: false })).toBe('nothing');
    expect(airdropPlan({ ...near, delivered: false, motion: 'reduced' })).toBe('nothing');
  });

  it('plays nothing at cut motion', () => {
    expect(airdropPlan({ ...near, delivered: true, motion: 'off' })).toBe('nothing');
  });
});

describe('the pass begins where the pawn stood (#508)', () => {
  it('has the plane a few metres short of the target, its door still shut', () => {
    const drop = airdrop({ delivered: true, motion: 'full' });
    const root = drop.plane(ENTRY_MS).root!;
    expect(Math.abs(root.travel![0])).toBeLessThan(metresOnBoard(60));
    expect(drop.plane(ENTRY_MS).bay_door).toBeUndefined();
  });
});

describe('inFlightFrame', () => {
  it("turns a board offset into the flight's frame, x along the flight, z to its right", () => {
    // Heading +x (π/2 from +z): the board's +x is along the flight.
    const [x, y, z] = inFlightFrame([3, 4], Math.PI / 2);
    expect([x, y, z].map((n) => Math.round(n * 1e6) / 1e6)).toEqual([3, 0, 4]);
  });

  it("is the inverse of the timeline's turn, at any heading", () => {
    const heading = 0.7;
    const [x, , z] = inFlightFrame([2, -5], heading);
    // `airdrop` turns the flight's frame back onto the board.
    const back = [
      x * Math.sin(heading) - z * Math.cos(heading),
      x * Math.cos(heading) + z * Math.sin(heading),
    ];
    expect(back[0]).toBeCloseTo(2);
    expect(back[1]).toBeCloseTo(-5);
  });
});

describe('nearestPiece: the piece that takes the crate', () => {
  const at = { x: 3, z: -2 };

  it('picks the closest piece to the target, within reach', () => {
    const pieces = [
      { id: 'origin', x: 0, z: 0 },
      { id: 'near', x: 4, z: -2 },
    ];
    expect(nearestPiece(pieces, at, 10)?.id).toBe('near');
  });

  it('breaks a tie by id', () => {
    const pieces = [
      { id: 'q/2', x: 4, z: -2 },
      { id: 'q/1', x: 2, z: -2 },
    ];
    expect(nearestPiece(pieces, at, 10)?.id).toBe('q/1');
  });

  it('takes none beyond its reach: the crate then melts where it lies', () => {
    expect(nearestPiece([{ id: 'a', x: 30, z: -2 }], at, 10)).toBeNull();
    expect(nearestPiece([], at, 10)).toBeNull();
  });
});

describe("takerOffset: where the crate goes, in the flight's own scale", () => {
  const metres = metresOnBoard(10);
  const at = { x: 3, z: -2 };

  it('says the offset from the target, undone of the size the pieces are drawn at', () => {
    const [x, z] = takerOffset([{ id: 'a', x: 3 + 2 * metres, z: -2 - metres }], at, 2)!;
    expect(x).toBeCloseTo(metres, 9);
    expect(z).toBeCloseTo(-metres / 2, 9);
  });

  it('reaches 80 m of the size the pieces are drawn at, not 80 m of the common scale', () => {
    // 120 m of the board away: out of reach at size 1, within it at size 2.
    const far = [{ id: 'a', x: 3 + metresOnBoard(120), z: -2 }];
    expect(takerOffset(far, at, 1)).toBeNull();
    expect(takerOffset(far, at, 2)).not.toBeNull();
    expect(takerOffset([{ id: 'a', x: 3 + metresOnBoard(200), z: -2 }], at, 2)).toBeNull();
  });

  it('says none for a pile that is gone', () => {
    expect(takerOffset([], at, 1)).toBeNull();
  });
});

describe('playDrop: how a largage is wired where the view learns it (#508)', () => {
  const wires = (over: Partial<Parameters<typeof playDrop>[0]> = {}) => {
    const calls: string[] = [];
    const given: { to: unknown }[] = [];
    const base: Parameters<typeof playDrop>[0] = {
      plan: 'plane',
      delivered: true,
      squad: true,
      taker: () => {
        calls.push('taker');
        return [1, 2];
      },
      play: async (to) => {
        calls.push('play');
        given.push({ to });
        return true;
      },
      holdBack: (until) => calls.push(`hold ${until}`),
      pixels: () => calls.push('pixels'),
      now: () => 1000,
    };
    return { calls, given, wire: { ...base, ...over } };
  };

  it('holds the plane home once the copy is in the scene, for the length of its pass', async () => {
    const { calls, wire } = wires();
    await playDrop(wire);
    expect(calls).toEqual(['taker', 'play', `hold ${1000 + FLY_ON_MS}`]);
  });

  it('gives the copy the piece that takes the crate only for a delivered drop on a squad', async () => {
    for (const [delivered, squad] of [
      [true, false],
      [false, true],
      [false, false],
    ] as const) {
      const { given, wire } = wires({ delivered, squad });
      await playDrop(wire);
      expect(given).toEqual([{ to: null }]);
    }
    const { given, wire } = wires();
    await playDrop(wire);
    expect(given).toEqual([{ to: [1, 2] }]);
  });

  it('holds nothing and falls back on the pixel parachute when the copy does not come', async () => {
    const { calls, wire } = wires({ play: async () => false });
    await playDrop(wire);
    expect(calls).toEqual(['taker', 'pixels']);
  });

  it('does the same when cooking it rejects', async () => {
    const { calls, wire } = wires({
      play: async () => {
        throw new Error('glb');
      },
    });
    await playDrop(wire);
    expect(calls).toEqual(['taker', 'pixels']);
  });

  it('lays no packet when nothing came down and the copy does not come', async () => {
    const { calls, wire } = wires({ delivered: false, play: async () => false });
    await playDrop(wire);
    expect(calls).toEqual([]);
  });

  it('puts the pixel parachute down for the pixel plan, and plays nothing for none', async () => {
    const pixels = wires({ plan: 'pixels' });
    await playDrop(pixels.wire);
    expect(pixels.calls).toEqual(['pixels']);
    const none = wires({ plan: 'nothing' });
    await playDrop(none.wire);
    expect(none.calls).toEqual([]);
  });
});
