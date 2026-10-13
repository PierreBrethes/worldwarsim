import { describe, expect, it } from 'vitest';
import type { RegionType } from '@/domain/ids';
import { DRAW_S, inkOn, penShare, SKETCH_S, sketchRegion, STAGGER_S } from './terrain';
import { PALETTE } from './palette';

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
  it('draws in paper on a dark seat, in ink on the bare sheet and a light seat', () => {
    expect(inkOn('#1f3f66')).toBe(PALETTE.paper);
    expect(inkOn(null)).toBe(PALETTE.border);
    expect(inkOn('#e8d27a')).toBe(PALETTE.border);
  });
});
