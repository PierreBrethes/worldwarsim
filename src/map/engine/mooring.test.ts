import { describe, expect, it } from 'vitest';
import { MOLE } from '@/emblems/kits/manifest';
import {
  bollardsOf,
  type HullMarks,
  lineRun,
  LINE_GAP_MS,
  LINE_MS,
  MOORING_MS,
  mooringLines,
  RELEASE_MS,
  railOf,
} from './mooring';

/** A hull at the mole as the model carries it: stem to the land (-z), its marks at 70 m from the
 *  middle, the mole's side at +x, the flank marks `[babord, tribord]` 10 m either side. */
const hull = (x: number, z: number, mole = 1): HullMarks => ({
  fore: [
    { x: x - mole * 10, y: 5, z: z - 70 },
    { x: x + mole * 10, y: 5, z: z - 70 },
  ],
  aft: [
    { x: x - mole * 10, y: 5, z: z + 70 },
    { x: x + mole * 10, y: 5, z: z + 70 },
  ],
});

describe('the mole’s bollards (#500)', () => {
  it('stand one every third module of the mole, their tops 0.6 m above its deck', () => {
    const bollards = bollardsOf();
    expect(bollards.map(({ z }) => z - MOLE.quay)).toEqual([5, 35, 65, 95, 125, 155]);
    for (const { x, y } of bollards) {
      expect(x).toBeCloseTo(MOLE.inner + 0.8);
      expect(y).toBeCloseTo(MOLE.lift + 0.5 + 0.6);
    }
  });
});

describe('the lines run in order (storyboard « Amarrage », « Largue »)', () => {
  it('four lines start 0.3 s apart and each runs 0.4 s, the hull moored at 1.6 s', () => {
    expect(MOORING_MS).toBe(1600);
    expect([0, 1, 2, 3].map((i) => lineRun(i, 0, false))).toEqual([0, 0, 0, 0]);
    expect(lineRun(0, LINE_MS / 2, false)).toBeCloseTo(0.5);
    expect(lineRun(0, LINE_MS, false)).toBe(1);
    expect(lineRun(1, LINE_GAP_MS, false)).toBe(0);
    expect(lineRun(3, 3 * LINE_GAP_MS + LINE_MS, false)).toBe(1);
  });

  it('are cast off from the stern to the stem, the hull free at 1.2 s', () => {
    expect(RELEASE_MS).toBe(1200);
    expect([0, 1, 2, 3].map((i) => lineRun(i, 0, true))).toEqual([1, 1, 1, 1]);
    expect(lineRun(3, LINE_MS, true)).toBe(0);
    expect(lineRun(0, 3 * LINE_GAP_MS + LINE_MS, true)).toBe(0);
  });
});

describe('the lines of a hull at the mole (#500)', () => {
  const bollards = bollardsOf();

  it('run from the stem and the stern, two each, to the bollards on the mole’s side', () => {
    const lines = mooringLines(hull(40, 190), bollards);
    expect(lines).toHaveLength(4);
    for (const { from, to } of lines) {
      expect(from.x).toBeGreaterThan(40);
      expect(to.x).toBeCloseTo(MOLE.inner + 0.8);
    }
    expect(lines.slice(0, 2).map(({ from }) => from.z)).toEqual([120, 120]);
    expect(lines.slice(2).map(({ from }) => from.z)).toEqual([260, 260]);
    expect(new Set(lines.map(({ to }) => to.z)).size).toBe(4);
  });

  it('take the flank the geometry puts at the mole, whatever it is named: in mirror, the other', () => {
    const mirrored = (marks: HullMarks): HullMarks => ({
      fore: [
        { ...marks.fore[0], x: -marks.fore[0].x },
        { ...marks.fore[1], x: -marks.fore[1].x },
      ],
      aft: [
        { ...marks.aft[0], x: -marks.aft[0].x },
        { ...marks.aft[1], x: -marks.aft[1].x },
      ],
    });
    const there = mirrored(hull(40, 190));
    // The port turned over: its mole, its bollards and its hull stand at -x.
    const lines = mooringLines(
      there,
      bollards.map((each) => ({ ...each, x: -each.x })),
    );
    for (const { from, to } of lines) {
      expect(from.x).toBeLessThan(-40);
      expect(to.x).toBeCloseTo(-(MOLE.inner + 0.8));
    }
  });

  it('go to the first hull’s rail when the second lies at its side, and not all to one point', () => {
    const first = hull(55, 190);
    const second = hull(55 - 24, 190);
    const rail = railOf(second, first);
    expect(rail[0]!.x).toBeCloseTo(55 - 10);
    const lines = mooringLines(second, rail);
    for (const { from, to } of lines) {
      expect(from.x).toBeCloseTo(55 - 24 + 10);
      expect(to.x).toBeCloseTo(55 - 10);
    }
    expect(new Set(lines.map(({ to }) => to.z)).size).toBeGreaterThan(2);
  });
});
