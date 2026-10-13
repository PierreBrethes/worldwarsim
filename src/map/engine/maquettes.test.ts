import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import {
  bakedParts,
  clusterFootprints,
  footOf,
  GARRISON_FOOT,
  MAQUETTE_SPAN,
  ringOffsets,
  spanScale,
  yawOf,
} from './maquettes';
import { pileLayout } from './standing';

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

describe('spanScale', () => {
  it('brings the widest side of the footprint to the span, whatever the height', () => {
    expect(spanScale(new Vector3(4, 9, 2)) * 4).toBeCloseTo(MAQUETTE_SPAN);
    expect(spanScale(new Vector3(1, 0.5, 2)) * 2).toBeCloseTo(MAQUETTE_SPAN);
  });
});

describe('bakedParts', () => {
  it('merges the meshes of one material into one part, their placement baked in', () => {
    const stone = new MeshStandardMaterial();
    const slate = new MeshStandardMaterial();
    const scene = new Group();
    const wall = new Mesh(new BoxGeometry(1, 1, 1), stone);
    wall.position.set(2, 0, 0);
    const tower = new Mesh(new BoxGeometry(1, 1, 1), stone);
    tower.position.set(0, 3, 0);
    const roof = new Mesh(new BoxGeometry(1, 1, 1), slate);
    scene.add(wall, tower, roof);

    const parts = bakedParts(scene);
    expect(parts.map((part) => part.material)).toEqual([stone, slate]);
    const walls = parts[0]!.geometry;
    walls.computeBoundingBox();
    expect(walls.boundingBox!.min.toArray()).toEqual([-0.5, -0.5, -0.5]);
    expect(walls.boundingBox!.max.toArray()).toEqual([2.5, 3.5, 0.5]);
  });

  it('bakes a rotated parent too', () => {
    const scene = new Group();
    scene.quaternion.copy(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2));
    const mesh = new Mesh(new BoxGeometry(2, 1, 1), new MeshStandardMaterial());
    scene.add(mesh);
    const [part] = bakedParts(scene);
    part!.geometry.computeBoundingBox();
    const size = part!.geometry.boundingBox!.getSize(new Vector3());
    expect(size.x).toBeCloseTo(1);
    expect(size.z).toBeCloseTo(2);
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
      expect(Math.hypot(ax - bx, az - bz)).toBeCloseTo(MAQUETTE_SPAN);
    }
  });
});

describe('clusterFootprints', () => {
  const S = MAQUETTE_SPAN;
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
      { at: [0, 0], ring: [0, 0] },
      { at: [3 * S, 0], ring: [0, 0] },
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
    expect(placed[0]!.ring).toEqual(ringOffsets(2)[0]);
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
    expect(placed[3]!.ring).not.toEqual([0, 0]);
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
});

/** The widest pile's half-width: three groups and the +N, half a squad past the last slot. */
const PILE_REACH = pileLayout(3, true).more! + 0.1;

describe('footOf', () => {
  it('stands a lone garrison in front of its maquette, facing the front', () => {
    expect(footOf([0, 0])).toEqual({ x: 0, z: GARRISON_FOOT, facing: 0 });
  });

  it('stands a ring garrison outward, never nearer a maquette than its own', () => {
    for (let count = 2; count <= 8; count++) {
      const ring = ringOffsets(count);
      for (const offset of ring) {
        const foot = footOf(offset);
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
    // A square model turned 45° reaches half a diagonal; the pile reaches back a third of a span.
    expect(GARRISON_FOOT - MAQUETTE_SPAN / 3).toBeGreaterThan((MAQUETTE_SPAN / 2) * Math.SQRT2);
  });
});
