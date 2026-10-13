import { describe, expect, it } from 'vitest';
import type { RegionType } from '@/domain/ids';
import {
  DRAW_S,
  drawVariation,
  inkOn,
  mulberry,
  penShare,
  PICTOGRAMS,
  SKETCH_S,
  sketchRegion,
  STAGGER_S,
  terrainCluster,
  zoomFade,
} from './terrain';
import { HELD_OPACITY, PALETTE } from './palette';

const TYPES: ReadonlyArray<RegionType> = [
  'plain',
  'forest',
  'jungle',
  'mountain',
  'desert',
  'tundra',
];

const square = (side: number) => ({
  box: [0, 0, side, side] as const,
  area: side * side,
  center: [side / 2, side / 2] as const,
  covers: (x: number, y: number) => x >= 0 && y >= 0 && x <= side && y <= side,
});

describe('the terrain sketched on a hovered region', () => {
  it('draws something for every type', () => {
    for (const type of TYPES) {
      const pictograms = sketchRegion({ type, seed: 42, ...square(4) });
      expect(pictograms.length, type).toBeGreaterThan(0);
      expect(pictograms.every((p) => p.strokes.length > 0)).toBe(true);
    }
  });

  it('keeps every pictogram anchor inside the region', () => {
    const halfDisc = {
      box: [-3, -3, 3, 3] as const,
      area: (Math.PI * 9) / 2,
      center: [1, 0] as const,
      covers: (x: number, y: number) => x * x + y * y <= 9 && x >= 0,
    };
    const pictograms = sketchRegion({ type: 'forest', seed: 7, ...halfDisc });
    expect(pictograms.length).toBeGreaterThan(0);
    for (const { anchor } of pictograms) expect(halfDisc.covers(anchor[0], anchor[1])).toBe(true);
  });

  it('stays bounded however large the region', () => {
    expect(sketchRegion({ type: 'desert', seed: 1, ...square(60) }).length).toBeLessThanOrEqual(34);
  });

  it('draws the same region the same way every time', () => {
    const a = sketchRegion({ type: 'mountain', seed: 99, ...square(3) });
    const b = sketchRegion({ type: 'mountain', seed: 99, ...square(3) });
    expect(a).toEqual(b);
    expect(sketchRegion({ type: 'mountain', seed: 100, ...square(3) })).not.toEqual(a);
  });

  it('starts at the centre and staggers the pen toward the edges', () => {
    const pictograms = sketchRegion({ type: 'plain', seed: 3, ...square(6) });
    const distance = ({ anchor }: { anchor: readonly [number, number] }) =>
      Math.hypot(anchor[0] - 3, anchor[1] - 3);
    expect(pictograms[0]!.delay).toBe(0);
    expect(pictograms.at(-1)!.delay).toBeCloseTo(STAGGER_S);
    expect(distance(pictograms[0]!)).toBeLessThan(distance(pictograms.at(-1)!));
  });
});

describe('the pen', () => {
  it('waits for its delay, then draws in DRAW_S, easing out', () => {
    expect(penShare(0.2, 0.1)).toBe(0);
    expect(penShare(0.2, 0.2 + DRAW_S / 2)).toBeCloseTo(0.75);
    expect(penShare(0.2, 0.2 + DRAW_S)).toBe(1);
  });

  it('has finished every stroke by SKETCH_S', () => {
    expect(SKETCH_S).toBeCloseTo(DRAW_S + STAGGER_S);
    expect(penShare(STAGGER_S, SKETCH_S)).toBe(1);
  });
});

describe('inkOn', () => {
  it('reads the ground as painted: ink over paper at the opacity it is laid', () => {
    const held = HELD_OPACITY;
    expect(inkOn('#276893', held)).toBe(PALETTE.paper);
    expect(inkOn('#276893', held * 0.35)).toBe(PALETTE.border);
    expect(inkOn('#e8d27a', held)).toBe(PALETTE.border);
  });

  it('draws in ink on the bare sheet and over a suspended zone, which is only a hatch', () => {
    expect(inkOn(null, 0)).toBe(PALETTE.border);
  });
});

describe('the order of the pen', () => {
  it('runs from the given centre, not from the mean of the anchors', () => {
    const corner = { ...square(6), center: [0, 0] as const };
    const pictograms = sketchRegion({ type: 'plain', seed: 3, ...corner });
    const distance = ({ anchor }: { anchor: readonly [number, number] }) =>
      Math.hypot(anchor[0], anchor[1]);
    expect(distance(pictograms[0]!)).toBeLessThan(distance(pictograms.at(-1)!));
  });

  it('draws nothing, without a NaN, where no anchor fits', () => {
    const nowhere = { ...square(4), covers: () => false };
    expect(sketchRegion({ type: 'forest', seed: 1, ...nowhere })).toEqual([]);
  });
});

describe('zoomFade', () => {
  it('is fully opaque a hair past the disappearance threshold', () => {
    expect(zoomFade(0)).toBe(0);
    expect(zoomFade(0.08)).toBe(1);
    expect(zoomFade(0.5)).toBe(1);
  });
});

describe('the variations of a drawing', () => {
  const seeds = Array.from({ length: 60 }, (_, i) => i + 1);
  // Generous boxes around the base, in the prototype's pixels (y down).
  const BOX: Record<RegionType, readonly [number, number, number, number]> = {
    plain: [-26, -22, 26, 6],
    forest: [-32, -32, 32, 8],
    jungle: [-34, -45, 38, 10],
    mountain: [-56, -34, 56, 4],
    desert: [-34, -20, 30, 12],
    tundra: [-24, -16, 24, 8],
  };

  it('draws the same strokes from the same seed', () => {
    for (const type of TYPES)
      expect(terrainCluster(type, mulberry(5))).toEqual(terrainCluster(type, mulberry(5)));
  });

  it('draws different strokes from different seeds', () => {
    for (const type of TYPES) {
      const drawn = new Set(seeds.map((s) => JSON.stringify(terrainCluster(type, mulberry(s)))));
      expect(drawn.size, type).toBeGreaterThan(50);
    }
  });

  it('keeps every variant in its box', () => {
    for (const type of TYPES) {
      const [x0, y0, x1, y1] = BOX[type];
      for (const s of seeds)
        for (const [x, y] of terrainCluster(type, mulberry(s)).flat()) {
          expect(x, `${type} ${s}`).toBeGreaterThanOrEqual(x0);
          expect(x, `${type} ${s}`).toBeLessThanOrEqual(x1);
          expect(y, `${type} ${s}`).toBeGreaterThanOrEqual(y0);
          expect(y, `${type} ${s}`).toBeLessThanOrEqual(y1);
        }
    }
  });

  it('gives a massif one to three peaks, all three occurring', () => {
    const summits = (s: number) => {
      const outline = PICTOGRAMS.mountain(0, 0, mulberry(s))[0]!;
      return outline.filter(
        ([, y], i) =>
          i > 0 && i < outline.length - 1 && y < outline[i - 1]![1] && y < outline[i + 1]![1],
      ).length;
    };
    const counts = new Set(seeds.map(summits));
    expect([...counts].sort()).toEqual([1, 2, 3]);
  });

  it('mirrors, scales within 10 % and turns within 4°', () => {
    const all = seeds.map((s) => drawVariation(mulberry(s)));
    expect(new Set(all.map((v) => v.mirror))).toEqual(new Set([-1, 1]));
    for (const { scale, angle } of all) {
      expect(scale).toBeGreaterThanOrEqual(0.9);
      expect(scale).toBeLessThanOrEqual(1.1);
      expect(Math.abs(angle)).toBeLessThanOrEqual((4 * Math.PI) / 180);
    }
  });

  it('varies the count of fronds, blades and furrows', () => {
    const strokesOf = (kind: keyof typeof PICTOGRAMS) =>
      new Set(seeds.map((s) => PICTOGRAMS[kind](0, 0, mulberry(s)).length));
    for (const kind of ['palm', 'fern', 'tussock', 'fields', 'dune', 'conifer'] as const)
      expect(strokesOf(kind).size, kind).toBeGreaterThan(1);
  });
});
