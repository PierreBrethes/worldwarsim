import {
  BoxGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Raycaster,
  Vector3,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { WorldFrame } from './frame';
import { BUILDINGS, type UnitRole } from '@/domain/ids';
import { buildingSpan, troopSpan } from '@/domain/piece-size';
import { DOMAIN_BY_ROLE } from '@/domain/troops';
import {
  clusterFootprints,
  garrisonFoot,
  MaquetteLayer,
  MAX_SHIFT,
  RING_GAP,
  yawOf,
} from './maquettes';
import { pileLayout } from './standing';
import { ANONYMOUS_SPAN, LAID_OUT_FOR, troopPinSpan } from './figurines/figurine';

vi.mock('./figurines/figurine', async (original) => ({
  ...(await original<typeof import('./figurines/figurine')>()),
  // A box of a metre for every file: the loader wants a DOM.
  sceneOf: () =>
    Promise.resolve(
      new Group().add(new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial())),
    ),
}));

/** A spacing and a garrison's foot for the shapes of the ring alone, whatever the building. */
const S = 1.2;
const FOOT = 1.1;

/** Where a placement's garrison stands: `foot` along its facing. */
const footOf = (
  { at, facing }: { at: readonly [number, number]; facing: number },
  foot = FOOT,
) => ({
  x: at[0] + foot * Math.sin(facing),
  z: at[1] + foot * Math.cos(facing),
  facing,
});

const gap = (a: readonly [number, number], b: readonly [number, number]) =>
  Math.hypot(a[0] - b[0], a[1] - b[1]);

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

/** Each site rings at its own size (ADR 0035 §5): a hangar and a port are wider than a barracks. */
describe('the ring at the common scale', () => {
  /** A footprint turned any way reaches half its diagonal: a square's, at worst. */
  const clear = (keys: ReadonlyArray<Parameters<typeof buildingSpan>[0]>, points: Point[]) => {
    const spans = keys.map(buildingSpan);
    const placed = clusterFootprints(
      points,
      spans.map((span) => span * RING_GAP),
    );
    for (let i = 0; i < placed.length; i++)
      for (let j = i + 1; j < placed.length; j++)
        expect(gap(placed[i]!.at, placed[j]!.at)).toBeGreaterThan(
          (spans[i]! + spans[j]!) / Math.SQRT2,
        );
    return placed;
  };

  it('stands a headquarters, an airfield and a port on one point, no turned footprint in another', () => {
    clear(
      ['hq', 'airfield', 'port'],
      [
        [0, 0],
        [0, 0],
        [0, 0],
      ],
    );
    clear(['barracks', 'hq', 'airfield', 'warehouse', 'port'], Array(5).fill([0.1, 0]));
  });

  it('rings two neighbouring ports, rather than drawing one in the other', () => {
    const placed = clear(
      ['port', 'port'],
      [
        [0, 0],
        [buildingSpan('port'), 0],
      ],
    );
    expect(placed[0]!.at).not.toEqual([0, 0]);
  });

  it('keeps a ring with a port at full size within its bound', () => {
    const spans = (['hq', 'airfield', 'port'] as const).map((key) => buildingSpan(key) * RING_GAP);
    const placed = clusterFootprints(
      [
        [0, 0],
        [0, 0],
        [0, 0],
      ],
      spans,
      1,
      {
        maxShift: MAX_SHIFT,
        onLand: () => true,
      },
    );
    for (const { scale } of placed) expect(scale).toBe(1);
  });
});

type Point = readonly [number, number];

describe('clusterFootprints', () => {
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
    const radius = S / (2 * Math.sin(Math.PI / 4));
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
    const placed = clusterFootprints(points, S, FOOT);
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
        [0, FOOT + S / 4],
      ],
      S,
      FOOT,
    );
    for (const site of placed) {
      const foot = footOf(site);
      const at = [foot.x, foot.z] as const;
      for (const other of placed)
        if (other !== site) expect(gap(at, other.at)).toBeGreaterThan(S / 2);
    }
  });

  describe('within bounds', () => {
    // The bound is a share of the ring's widest spacing.
    const everywhere = { maxShift: 0.5, onLand: () => true };

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
        FOOT,
        { maxShift: 1, onLand },
      );
      for (const { at, facing, scale } of bounded) {
        expect(onLand(at[0])).toBe(true);
        expect(onLand(at[0] + FOOT * scale * Math.sin(facing))).toBe(true);
      }
    });

    it('turns a lone garrison inland when its front is the sea', () => {
      const [lone] = clusterFootprints([[0, 0]], S, FOOT, {
        maxShift: 1,
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
        FOOT,
        { maxShift: 1, onLand: (_x, z) => z <= 1e-9 },
      );
      expect(Math.sin(lone!.facing)).toBeLessThan(0);
    });
  });
});

/** A pile's half-width along its row: four pieces, half a squad past the last slot. */
const PILE_REACH = pileLayout(4).at(-1)! + 0.1;

describe('the garrison foot', () => {
  it('stands a lone garrison in front of its maquette, facing the front', () => {
    expect(footOf(clusterFootprints([[0, 0]], S, FOOT)[0]!)).toEqual({
      x: 0,
      z: FOOT,
      facing: 0,
    });
  });

  it('stands a ring garrison outward, never nearer a maquette than its own', () => {
    for (let count = 2; count <= 8; count++) {
      const placed = clusterFootprints(
        Array.from({ length: count }, () => [0, 0] as const),
        S,
        FOOT,
      );
      const ring = placed.map(({ at }) => at);
      for (const site of placed) {
        const offset = site.at;
        const foot = footOf(site);
        expect(Math.hypot(foot.x - offset[0], foot.z - offset[1])).toBeCloseTo(FOOT);
        expect(foot.x - offset[0]).toBeCloseTo(FOOT * Math.sin(foot.facing));
        // The row runs across the facing, its widest pile reaching the +N counter's edge.
        const reach = PILE_REACH;
        const [ax, az] = [Math.cos(foot.facing), -Math.sin(foot.facing)];
        for (const [x, z] of ring) {
          const along = Math.max(-reach, Math.min(reach, (x - foot.x) * ax + (z - foot.z) * az));
          const nearest = Math.hypot(foot.x + along * ax - x, foot.z + along * az - z);
          expect(nearest).toBeGreaterThanOrEqual(FOOT - 1e-9);
        }
      }
    }
  });

  it('docks the hulls of a port along its quay, beside it and not a port away', () => {
    const [port, cargo] = [buildingSpan('port'), troopSpan('cargo')];
    const foot = garrisonFoot(port, cargo, true);
    expect(foot - cargo / 2).toBeGreaterThanOrEqual(port / 2);
    expect(foot - cargo / 2).toBeLessThan(port / Math.SQRT2);
  });

  it('keeps a garrison grown to its floor clear of the other maquettes of its ring, and of their garrisons', () => {
    // At d ≈ 30 a pile is drawn as large as the floor's span (ADR 0035 §10), whatever it holds.
    const pile = troopPinSpan(0);
    const reach = (PILE_REACH * pile) / LAID_OUT_FOR;
    const keys = ['barracks', 'hq', 'airfield', 'warehouse', 'port'] as const;
    const spans = keys.map(buildingSpan);
    const placed = clusterFootprints(
      keys.map(() => [0, 0] as const),
      spans.map((span) => span * RING_GAP),
      spans.map((span) => garrisonFoot(span, ANONYMOUS_SPAN)),
    );
    const feet = placed.map((site, k) => footOf(site, garrisonFoot(spans[k]!, pile) * site.scale));
    feet.forEach((foot, i) => {
      // The row runs across the facing.
      const [ax, az] = [Math.cos(foot.facing), -Math.sin(foot.facing)];
      placed.forEach(({ at: [x, z] }, j) => {
        if (j === i) return;
        const along = Math.max(-reach, Math.min(reach, (x - foot.x) * ax + (z - foot.z) * az));
        const nearest = Math.hypot(foot.x + along * ax - x, foot.z + along * az - z);
        expect(nearest - pile / 2).toBeGreaterThan(spans[j]! / Math.SQRT2);
        expect(Math.hypot(feet[j]!.x - foot.x, feet[j]!.z - foot.z)).toBeGreaterThan(2 * reach);
      });
    });
  });

  it('keeps every garrison clear of its own maquette at any turn, on land', () => {
    // A model turned 45° reaches half its diagonal; the pile reaches back half its largest piece.
    const roles = Object.keys(DOMAIN_BY_ROLE) as UnitRole[];
    for (const key of BUILDINGS)
      for (const role of roles)
        expect(
          garrisonFoot(buildingSpan(key), troopSpan(role)) - troopSpan(role) / 2,
        ).toBeGreaterThan(buildingSpan(key) / Math.SQRT2);
  });
});

describe('a maquette lent to a sequence (ADR 0036)', () => {
  const ID = 'building-barracks@2,48';
  const frame = { projectLonLat: () => new Vector3(0, 0, 0) } as unknown as WorldFrame;
  const stand = (washed = false) => ({
    id: ID,
    at: { lonLat: [2, 48] as const },
    url: washed ? 'washed.glb' : 'lent.glb',
    span: 1,
    washed,
  });
  const eye = new Vector3(0, 2, 2);
  const layer = async (washed = false) => {
    const maquettes = new MaquetteLayer(
      frame,
      () => null,
      () => {},
      () => {},
      () => true,
    );
    maquettes.display([stand(washed)]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    maquettes.orient(eye, null, 0);
    return maquettes;
  };
  const instance = (maquettes: MaquetteLayer) => {
    let found: InstancedMesh | undefined;
    maquettes.group.traverse((node) => {
      if ((node as InstancedMesh).isInstancedMesh) found = node as InstancedMesh;
    });
    return new Matrix4().fromArray(found!.instanceMatrix.array);
  };
  const same = (a: Matrix4, b: Matrix4) =>
    a.elements.forEach((value, k) => expect(value).toBeCloseTo(b.elements[k]!, 5));
  const copyOf = () =>
    new Group().add(new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial()));

  it('shrinks the instance to nothing and hands the copy its matrix', async () => {
    const maquettes = await layer();
    const was = instance(maquettes);
    expect(was.determinant()).toBeGreaterThan(0);
    const copy = copyOf();
    maquettes.standIn(ID, copy);
    maquettes.orient(eye, null, 0);
    expect(instance(maquettes).determinant()).toBe(0);
    same(copy.matrix, was);
    maquettes.standIn(ID, null);
    maquettes.orient(eye, null, 0);
    same(instance(maquettes), was);
    expect(copy.parent).toBeNull();
  });

  it('is picked through the copy, and keeps it over a rebuild', async () => {
    const maquettes = await layer();
    const copy = copyOf();
    maquettes.standIn(ID, copy);
    maquettes.orient(eye, null, 0);
    const down = new Raycaster(new Vector3(0, 5, 0), new Vector3(0, -1, 0));
    expect(maquettes.under(down)?.id).toBe(ID);
    maquettes.rebuild();
    await new Promise((resolve) => setTimeout(resolve, 0));
    maquettes.orient(eye, null, 0);
    expect(copy.parent).toBe(maquettes.group);
    expect(instance(maquettes).determinant()).toBe(0);
    expect(copy.matrix.determinant()).toBeGreaterThan(0);
  });

  it('lends only what is drawn whole: not a ghost, not an unknown id', async () => {
    expect((await layer()).pieceOf(ID)?.url).toBe('lent.glb');
    expect((await layer()).pieceOf('building-hq@0,0')).toBeNull();
    expect((await layer(true)).pieceOf(ID)).toBeNull();
  });
});
