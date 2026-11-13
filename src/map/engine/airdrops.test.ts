import { describe, expect, it } from 'vitest';
import { metresOnBoard } from '@/domain/piece-size';
import { airdropPlan, inFlightFrame, nearestPiece, takerOffset } from './airdrops';
import { airdrop, ENTRY_MS } from './timelines/airdrop';

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
  const at = { x: 0, z: 0 };

  it('picks the closest piece, within reach', () => {
    const pieces = [
      { id: 'b', x: 5, z: 0 },
      { id: 'a', x: 2, z: 1 },
    ];
    expect(nearestPiece(pieces, at, 10)?.id).toBe('a');
  });

  it('breaks a tie by id', () => {
    const pieces = [
      { id: 'q/2', x: 1, z: 0 },
      { id: 'q/1', x: -1, z: 0 },
    ];
    expect(nearestPiece(pieces, at, 10)?.id).toBe('q/1');
  });

  it('takes none beyond its reach: the crate then melts where it lies', () => {
    expect(nearestPiece([{ id: 'a', x: 20, z: 0 }], at, 10)).toBeNull();
    expect(nearestPiece([], at, 10)).toBeNull();
  });
});

describe("takerOffset: where the crate goes, in the flight's own scale", () => {
  it("says the nearest piece's offset from the target, undone of the size it is drawn at", () => {
    const metres = metresOnBoard(10);
    expect(takerOffset([{ id: 'a', x: 2 * metres, z: -metres }], { x: 0, z: 0 }, 2)).toEqual([
      metres,
      -metres / 2,
    ]);
  });

  it('says none for a pile that is gone, or too far', () => {
    expect(takerOffset([], { x: 0, z: 0 }, 1)).toBeNull();
    expect(takerOffset([{ id: 'a', x: metresOnBoard(500), z: 0 }], { x: 0, z: 0 }, 1)).toBeNull();
  });
});
