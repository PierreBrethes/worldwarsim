import { describe, expect, it } from 'vitest';
import { temporalPosition, unrollRoute, unrolledCost } from './route-timing';
import { COST_BY_MEDIUM, TRANSFER_COST, directRoute, type ComputedRoute } from './routing';

const combined = (land1: number, sea: number, land2: number): ComputedRoute => ({
  mode: 'combined',
  points: [[0, 0], [1, 0], [2, 0], [3, 0]],
  distanceUnits: land1 + sea + land2,
  costUnits:
    (land1 + land2) * COST_BY_MEDIUM.land + sea * COST_BY_MEDIUM.sea + 2 * TRANSFER_COST,
  legs: [
    { medium: 'land', distanceUnits: land1 },
    { medium: 'sea', distanceUnits: sea },
    { medium: 'land', distanceUnits: land2 },
  ],
});

describe('unrollRoute', () => {
  it('inserts a dock between two legs, never at the ends', () => {
    const segments = unrollRoute(combined(10, 20, 5));
    expect(segments.map((segment) => segment.kind)).toEqual([
      'leg', 'dock', 'leg', 'dock', 'leg',
    ]);
  });

  it('the dock before the sea is an embarkation, the one after a landing', () => {
    const docks = unrollRoute(combined(10, 20, 5)).filter((segment) => segment.kind === 'dock');
    expect(docks.map((dock) => dock.embarking)).toEqual([true, false]);
  });

  it('shares sum to 1 and docks count in', () => {
    const segments = unrollRoute(combined(10, 20, 5));
    expect(segments.reduce((sum, segment) => sum + segment.share, 0)).toBeCloseTo(1, 10);
    const dockShare = segments
      .filter((segment) => segment.kind === 'dock')
      .reduce((sum, dock) => sum + dock.share, 0);
    expect(dockShare).toBeCloseTo((2 * TRANSFER_COST) / unrolledCost(combined(10, 20, 5)), 10);
  });

  it('the re-unrolled cost is what the route computation billed', () => {
    const route = combined(10, 20, 5);
    expect(unrolledCost(route)).toBeCloseTo(route.costUnits, 10);
  });

  it('a costless route unrolls nothing rather than dividing by zero', () => {
    expect(unrollRoute(directRoute([0, 0], [1, 1], 'sea', 0))).toEqual([]);
  });
});

describe('temporalPosition', () => {
  const unrolled = unrollRoute(combined(10, 20, 5));

  it('keeps the pawn still through the whole dock crossing', () => {
    const landShare = unrolled[0]!.share;
    const dockShare = unrolled[1]!.share;
    for (const share of [0.05, 0.5, 0.95]) {
      expect(temporalPosition(unrolled, landShare + dockShare * share)).toEqual({
        kind: 'dock',
        legIndex: 1,
      });
    }
  });

  it('returns the local fraction of the crossed leg', () => {
    const position = temporalPosition(unrolled, unrolled[0]!.share / 2);
    expect(position).toEqual({ kind: 'leg', legIndex: 0, local: 0.5 });
  });

  it('clamps at both ends: nothing before departure, nothing past arrival', () => {
    expect(temporalPosition(unrolled, -1)).toEqual({ kind: 'leg', legIndex: 0, local: 0 });
    expect(temporalPosition(unrolled, 2)).toEqual({ kind: 'leg', legIndex: 2, local: 1 });
  });

  it('a single-medium route has neither dock nor jump', () => {
    const direct = unrollRoute(directRoute([0, 0], [10, 0], 'air', 40));
    expect(direct).toHaveLength(1);
    expect(temporalPosition(direct, 0.25)).toEqual({
      kind: 'leg',
      legIndex: 0,
      local: 0.25,
    });
  });
});
