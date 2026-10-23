import { describe, expect, it } from 'vitest';
import { buildingSpan, troopSpan } from '@/domain/piece-size';
import { clusterFootprints, GARRISON_FOOT, RING_SPAN, ringOffsets, yawOf } from './maquettes';
import { pileLayout } from './standing';

/** Where a placement's garrison stands: `GARRISON_FOOT` along its facing. */
const footOf = ({ at, facing }: { at: readonly [number, number]; facing: number }) => ({
  x: at[0] + GARRISON_FOOT * Math.sin(facing),
  z: at[1] + GARRISON_FOOT * Math.cos(facing),
  facing,
});

describe('yawOf', () => {
  it('turns a building the same way at every display, and two buildings apart', () => {
    expect(yawOf('building-FRA-75-hq')).toBe(yawOf('building-FRA-75-hq'));
    expect(yawOf('building-FRA-75-hq')).not.toBe(yawOf('building-FRA-92-farm'));
    for (const id of ['a', 'objective-1', 'installation-xyz']) {
      expect(yawOf(id)).toBeGreaterThanOrEqual(0);
      expect(yawOf(id)).toBeLessThan(2 * Math.PI);
    }
  });
});

describe('the ring at the common scale (ADR 0035 §5)', () => {
  it('keeps its layout, grown as a barracks grew: from 0.7 to a département', () => {
    expect(RING_SPAN / 0.7).toBeCloseTo(1.377, 3);
    expect(RING_SPAN).toBe(buildingSpan('barracks'));
  });
});

describe('ringOffsets', () => {
  it('stands one maquette on its mast, and a group a span apart around it', () => {
    expect(ringOffsets(1)).toEqual([[0, 0]]);
    for (const count of [2, 3, 5]) {
      const ring = ringOffsets(count);
      expect(ring).toHaveLength(count);
      const [ax, az] = ring[0]!;
      const [bx, bz] = ring[1]!;
      expect(Math.hypot(ax - bx, az - bz)).toBeCloseTo(RING_SPAN);
    }
  });
});

describe('clusterFootprints', () => {
  const S = RING_SPAN;
  const gap = (a: readonly [number, number], b: readonly [number, number]) =>
    Math.hypot(a[0] - b[0], a[1] - b[1]);

  it('leaves a site whose footprint touches none where it stands', () => {
    expect(
      clusterFootprints(
        [
          [0, 0],
          [3 * S, 0],
        ],
        S,
      ),
    ).toEqual([
      { at: [0, 0], facing: 0, scale: 1 },
      { at: [3 * S, 0], facing: 0, scale: 1 },
    ]);
  });

  it('rings sites that overlap around their barycentre, a span apart', () => {
    const placed = clusterFootprints(
      [
        [0, 0],
        [S / 2, 0],
      ],
      S,
    );
    expect(gap(placed[0]!.at, placed[1]!.at)).toBeCloseTo(S);
    expect((placed[0]!.at[0] + placed[1]!.at[0]) / 2).toBeCloseTo(S / 4);
    // Each garrison faces away from the ring's centre, on its own side.
    expect(placed[0]!.facing).toBeCloseTo(-Math.PI / 2);
    expect(placed[1]!.facing).toBeCloseTo(Math.PI / 2);
  });

  it('takes in a site the grown ring reaches', () => {
    // Three on one point ring out to touch a fourth that touched none of them.
    const placed = clusterFootprints(
      [
        [0, 0],
        [0, 0],
        [0, 0],
        [1.2 * S, 0],
      ],
      S,
    );
    const radius = Math.hypot(...ringOffsets(4)[0]!);
    const centre = placed.reduce((sum, { at }) => sum + at[0], 0) / placed.length;
    for (const { at } of placed)
      expect(Math.hypot(at[0] - centre, at[1])).toBeGreaterThanOrEqual(radius - 1e-9);
    expect(placed[3]!.at[0]).toBeGreaterThan(placed[0]!.at[0]);
  });

  it('leaves alone two sites whose maquettes do not touch, garrisons and all', () => {
    const points = [
      [0, 0],
      [1.4 * S, 0.3],
    ] as const;
    const placed = clusterFootprints(points, S, GARRISON_FOOT);
    placed.forEach(({ at, scale }, k) => {
      expect(at).toEqual(points[k]);
      expect(scale).toBe(1);
    });
  });

  it('never draws a ring member nearer its centre than its own point', () => {
    const points = [
      [0, 0],
      [0.9 * S, 0],
      [0.45 * S, 0.1],
    ] as const;
    const placed = clusterFootprints(points, S);
    const centre = [(0.9 * S) / 3 + (0.45 * S) / 3, 0.1 / 3] as const;
    placed.forEach(({ at }, k) =>
      expect(gap(at, centre)).toBeGreaterThanOrEqual(gap(points[k]!, centre) - 1e-9),
    );
    // Its order around the ring holds: the westmost stays west.
    expect(placed[0]!.at[0]).toBeLessThan(placed[1]!.at[0]);
  });

  it('stands no two maquettes nearer than a span, wherever the sites fall', () => {
    let seed = 7;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 4 * S;
    const points = Array.from({ length: 40 }, () => [random(), random()] as const);
    const placed = clusterFootprints(points, S);
    for (let i = 0; i < placed.length; i++)
      for (let j = i + 1; j < placed.length; j++)
        expect(gap(placed[i]!.at, placed[j]!.at)).toBeGreaterThan(S - 1e-9);
  });

  it('keeps a lone garrison out of a neighbour maquette when the footprint reaches its foot', () => {
    const placed = clusterFootprints(
      [
        [0, 0],
        [0, GARRISON_FOOT + S / 4],
      ],
      S,
      GARRISON_FOOT,
    );
    for (const site of placed) {
      const foot = footOf(site);
      const at = [foot.x, foot.z] as const;
      for (const other of placed)
        if (other !== site) expect(gap(at, other.at)).toBeGreaterThan(S / 2);
    }
  });

  describe('within bounds', () => {
    const everywhere = { maxShift: S / 2, onLand: () => true };

    it('never stands a maquette further from its point than the bound, and shrinks the group instead', () => {
      const points = Array.from({ length: 6 }, (_, k) => [k * 0.1, 0] as const);
      const free = clusterFootprints(points, S);
      expect(Math.max(...free.map(({ at }, k) => gap(at, points[k]!)))).toBeGreaterThan(S / 2);
      const bounded = clusterFootprints(points, S, S / 2, everywhere);
      bounded.forEach(({ at, scale }, k) => {
        expect(gap(at, points[k]!)).toBeLessThanOrEqual(S / 2 + 1e-9);
        expect(scale).toBeLessThan(1);
      });
    });

    it('leaves a pair that fits the bound at full size', () => {
      const bounded = clusterFootprints(
        [
          [0, 0],
          [0, 0],
        ],
        S,
        S / 2,
        everywhere,
      );
      for (const { scale } of bounded) expect(scale).toBe(1);
    });

    it('never stands a site on land, nor its garrison, off the land', () => {
      // Land is x <= 0: two sites on the shore would ring out over the sea.
      const onLand = (x: number) => x <= 1e-9;
      const bounded = clusterFootprints(
        [
          [0, 0],
          [0, 0.1],
        ],
        S,
        GARRISON_FOOT,
        { maxShift: S, onLand },
      );
      for (const { at, facing, scale } of bounded) {
        expect(onLand(at[0])).toBe(true);
        expect(onLand(at[0] + GARRISON_FOOT * scale * Math.sin(facing))).toBe(true);
      }
    });

    it('turns a lone garrison inland when its front is the sea', () => {
      const [lone] = clusterFootprints([[0, 0]], S, GARRISON_FOOT, {
        maxShift: S,
        onLand: (_x, z) => z <= 1e-9,
      });
      expect(lone!.at).toEqual([0, 0]);
      expect(Math.cos(lone!.facing)).toBeLessThanOrEqual(1e-9);
    });

    it('turns it away from the next site too', () => {
      const [lone] = clusterFootprints(
        [
          [0, 0],
          [3 * S, -1],
        ],
        S,
        GARRISON_FOOT,
        { maxShift: S, onLand: (_x, z) => z <= 1e-9 },
      );
      expect(Math.sin(lone!.facing)).toBeLessThan(0);
    });
  });
});

/** A pile's half-width along its row: four pieces, half a squad past the last slot. */
const PILE_REACH = pileLayout(4).at(-1)! + 0.1;

describe('the garrison foot', () => {
  it('stands a lone garrison in front of its maquette, facing the front', () => {
    expect(footOf(clusterFootprints([[0, 0]], RING_SPAN)[0]!)).toEqual({
      x: 0,
      z: GARRISON_FOOT,
      facing: 0,
    });
  });

  it('stands a ring garrison outward, never nearer a maquette than its own', () => {
    for (let count = 2; count <= 8; count++) {
      const placed = clusterFootprints(
        Array.from({ length: count }, () => [0, 0] as const),
        RING_SPAN,
      );
      const ring = placed.map(({ at }) => at);
      for (const site of placed) {
        const offset = site.at;
        const foot = footOf(site);
        expect(Math.hypot(foot.x - offset[0], foot.z - offset[1])).toBeCloseTo(GARRISON_FOOT);
        expect(foot.x - offset[0]).toBeCloseTo(GARRISON_FOOT * Math.sin(foot.facing));
        // The row runs across the facing, its widest pile reaching the +N counter's edge.
        const [ax, az] = [Math.cos(foot.facing), -Math.sin(foot.facing)];
        for (const [x, z] of ring) {
          const along = Math.max(
            -PILE_REACH,
            Math.min(PILE_REACH, (x - foot.x) * ax + (z - foot.z) * az),
          );
          const nearest = Math.hypot(foot.x + along * ax - x, foot.z + along * az - z);
          expect(nearest).toBeGreaterThanOrEqual(GARRISON_FOOT - 1e-9);
        }
      }
    }
  });

  it('keeps the garrison clear of its own maquette at any turn', () => {
    // A square model turned 45° reaches half a diagonal — a hangar's, the widest of a ring —;
    // the pile reaches back a tank's length at most.
    for (const key of ['barracks', 'airfield', 'warehouse', 'hq'] as const)
      expect(GARRISON_FOOT - troopSpan('armor')).toBeGreaterThan(buildingSpan(key) / Math.SQRT2);
  });
});
