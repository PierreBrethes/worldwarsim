import {
  type Box3,
  BoxGeometry,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Plane,
  Raycaster,
  Vector3,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { WorldFrame } from './frame';
import { BUILDINGS, type UnitRole } from '@/domain/ids';
import { buildingFootprint, buildingSpan, troopSpan } from '@/domain/piece-size';
import { DOMAIN_BY_ROLE } from '@/domain/troops';
import {
  clusterFootprints,
  garrisonFoot,
  MaquetteLayer,
  MAX_SHIFT,
  RING_GAP,
  ringSpacing,
  SOCLE_TOP,
  yawOf,
} from './maquettes';
import { pileLayout } from './standing';
import { ANONYMOUS_SPAN, LAID_OUT_FOR, troopPinSpan } from './figurines/figurine';

/** The box the last works were dressed round. */
const dressed: { box: Box3 | null; scaffolded: boolean | undefined } = {
  box: null,
  scaffolded: undefined,
};

// The dressing of a site paints a canvas: a stub, this file has no DOM.
vi.mock('./works', async (original) => ({
  ...(await original<typeof import('./works')>()),
  WorksDressing: class {
    object = new Group();
    cut: Plane | null;
    constructor(
      works: { phase: string },
      box: Box3,
      _footprint: unknown,
      _socle: unknown,
      scaffolded?: boolean,
    ) {
      this.cut = works.phase === 'rising' ? new Plane(new Vector3(0, -1, 0), 0) : null;
      dressed.box = box;
      dressed.scaffolded = scaffolded;
    }
    place() {}
    pick() {
      return null;
    }
    dispose() {}
  },
}));

vi.mock('./figurines/figurine', async (original) => ({
  ...(await original<typeof import('./figurines/figurine')>()),
  // A box of a metre for every file but the barracks on its socle: the loader wants a DOM.
  sceneOf: async (url: string) => {
    if (url === 'socle.glb')
      return (await import('./gltf-scene.fixture')).sceneOfFile(
        'src/emblems/fixtures/barracks-socle.glb',
      );
    const door = new Group();
    door.name = 'fx_sortie';
    door.position.set(0, 0.1, 0.5);
    return new Group().add(new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial()), door);
  },
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

  it('lays its markers on the board as it is drawn: where a recruit comes out', async () => {
    const maquettes = await layer();
    const drawn = instance(maquettes);
    const site = maquettes.siteOf(ID)!;
    const door = site.marker('fx_sortie')!;
    expect(door.toArray()).toEqual([0, 0.1, 0.5]);
    const onBoard = site.toBoard(door);
    expect(onBoard.distanceTo(door.clone().applyMatrix4(drawn))).toBeLessThan(1e-6);
    expect(site.toModel(onBoard).distanceTo(door)).toBeLessThan(1e-9);
    expect(site.marker('fx_nowhere')).toBeNull();
    expect(maquettes.siteOf('building-hq@0,0')).toBeNull();
  });

  it('hands what it draws of a maquette, and where, for a raze to outlive it (#326)', async () => {
    const maquettes = await layer();
    const was = instance(maquettes);
    const drawn = maquettes.drawnOf(ID)!;
    same(drawn.matrix, was);
    expect(drawn.parts).toHaveLength(1);
    expect(drawn.box.max.y).toBeCloseTo(0.5);
    maquettes.display([]);
    same(drawn.matrix, was);
    expect(maquettes.drawnOf(ID)).toBeNull();
    const far = await layer();
    far.orient(new Vector3(0, 900, 0), null, 0);
    expect(far.drawnOf(ID)).toBeNull();
  });

  it('hands it still when a second view comes before any frame drew the first (#326)', async () => {
    const maquettes = await layer();
    maquettes.display([{ ...stand(), smoking: true }]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(maquettes.drawnOf(ID)).not.toBeNull();
  });

  it('lends only what is drawn whole: not a ghost, not an unknown id', async () => {
    expect((await layer()).pieceOf(ID)?.url).toBe('lent.glb');
    expect((await layer()).pieceOf('building-hq@0,0')).toBeNull();
    expect((await layer(true)).pieceOf(ID)).toBeNull();
    const atWork = new MaquetteLayer(
      frame,
      () => null,
      () => {},
      () => {},
      () => true,
    );
    atWork.display([
      {
        ...stand(),
        works: {
          phase: 'rising',
          level: 1,
          finishesAt: null,
          minutes: 5,
          pennant: null,
          stamp: null,
        },
      },
    ]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    atWork.orient(eye, null, 0);
    expect(atWork.pieceOf(ID)).toBeNull();
  });
});

describe('a razed maquette holds its place while it falls (#326)', () => {
  const frame = {
    projectLonLat: ([lon, lat]: readonly [number, number]) => new Vector3(lon, 0, lat),
  } as unknown as WorldFrame;
  const RAZED = 'building-barracks@0,0';
  const HQ = 'building-hq@0.1,0';
  const site = (id: string, lon: number) => ({
    id,
    at: { lonLat: [lon, 0] as const },
    url: `${id}.glb`,
    span: 1,
    washed: false,
  });
  const eye = new Vector3(0, 2, 2);
  const landed = () => new Promise((resolve) => setTimeout(resolve, 0));

  it('keeps the ring its neighbour stands on until it is released, drawn by nobody', async () => {
    const maquettes = new MaquetteLayer(
      frame,
      () => null,
      () => {},
      () => {},
      () => true,
    );
    maquettes.display([site(RAZED, 0), site(HQ, 0.1)]);
    await landed();
    maquettes.orient(eye, null, 0);
    expect(maquettes.drawnAt(HQ)).not.toBeNull();
    maquettes.hold(RAZED);
    expect(maquettes.drawnOf(RAZED)).toBeNull();
    maquettes.display([site(HQ, 0.1)]);
    await landed();
    maquettes.orient(eye, null, 0);
    expect(maquettes.drawnAt(HQ)).not.toBeNull();
    expect(maquettes.isDressed(RAZED)).toBe(false);
    expect(maquettes.drawnOf(RAZED)).toBeNull();
    // Its garrison, served at its point now, stands where it stood: at the foot of its place.
    const foot = maquettes.garrisonAt(RAZED, 0.1);
    expect(foot).not.toBeNull();
    expect(Math.hypot(...foot!.step)).toBeGreaterThan(0);
    expect(maquettes.heldAt(RAZED)).toEqual([0, 0]);
    maquettes.release(RAZED);
    maquettes.orient(eye, null, 0);
    expect(maquettes.drawnAt(HQ)).toBeNull();
    expect(maquettes.garrisonAt(RAZED, 0.1)).toBeNull();
    expect(maquettes.heldAt(RAZED)).toBeNull();
  });
});

describe('the sites a garrison stands at the foot of (#341)', () => {
  it('are my buildings by their points: no installation, no objective, no region anchor', () => {
    const maquettes = new MaquetteLayer(
      { projectLonLat: () => new Vector3() } as unknown as WorldFrame,
      () => null,
      () => {},
      () => {},
      () => true,
    );
    const at = (lon: number) => ({ lonLat: [lon, 0] as const });
    const site = (
      id: string,
      where: { lonLat: readonly [number, number] } | { regionId: string },
    ) => ({
      id,
      at: where,
      url: `${id}.glb`,
      span: 1,
      washed: false,
    });
    maquettes.display([
      site('building-hq@1,0', at(1)),
      site('installation-x', at(2)),
      site('objective-y', at(3)),
      site('building-mine', { regionId: 'r' }),
    ]);
    expect(maquettes.buildingPoints()).toEqual([{ id: 'building-hq@1,0', at: [1, 0] }]);
  });
});

describe('a site on its socle (ADR 0038)', () => {
  const frame = {
    projectLonLat: ([lon, lat]: readonly [number, number]) => new Vector3(lon, 0, lat),
  } as unknown as WorldFrame;
  const MINE = 'building-barracks@0,0';
  const eye = new Vector3(0, 0.3, 0.3);
  const site = (
    id: string,
    more: Partial<Parameters<MaquetteLayer['display']>[0][number]> = {},
  ) => ({
    id,
    at: { lonLat: [Number(id.length % 7) * 10, 0] as const },
    url: 'socle.glb',
    span: 1,
    metres: 50,
    washed: false,
    ...more,
  });
  const layerOf = async (maquettes: Parameters<MaquetteLayer['display']>[0]) => {
    const layer = new MaquetteLayer(
      frame,
      () => null,
      () => {},
      () => {},
      () => true,
    );
    layer.display(maquettes);
    // The file is read from disk: it lands in its own time.
    await vi.waitFor(() => expect(maquettes.every(({ id }) => layer.isDressed(id))).toBe(true));
    layer.orient(eye, null, 0);
    return layer;
  };
  const meshes = (layer: MaquetteLayer) => {
    const found: InstancedMesh[] = [];
    layer.group.traverse((node) => {
      if ((node as InstancedMesh).isInstancedMesh) found.push(node as InstancedMesh);
    });
    return found;
  };
  const nameOf = (mesh: InstancedMesh) => (mesh.material as MeshStandardMaterial).name;

  it('inks the liseré alone, by the side of each site, in one lot', async () => {
    const layer = await layerOf([
      site(MINE, { side: 'mine', ink: '#2a5ba8' }),
      site('installation-seen', { side: 'seen' }),
      site('installation-neutral', { side: 'neutral' }),
    ]);
    const all = meshes(layer);
    const liseres = all.filter((mesh) => nameOf(mesh) === 'lisere');
    expect(liseres).toHaveLength(1);
    const [lisere] = liseres;
    const colorAt = (k: number) => {
      const color = new Color();
      lisere!.getColorAt(k, color);
      return color;
    };
    expect(colorAt(0).getHex()).toBe(new Color('#2a5ba8').getHex());
    // Mixed on the paper as a printer would, in sRGB: 60 % of the ink, 40 % of the socle's paper.
    expect(colorAt(1).getHexString()).toBe('b48675');
    expect(colorAt(2).getHexString()).toBe('776e5e');
    for (const mesh of all.filter((each) => each !== lisere)) expect(mesh.instanceColor).toBeNull();
  });

  it('inks the copy a sequence stands in for it, and no other maquette of the file', async () => {
    const layer = await layerOf([site(MINE, { side: 'mine', ink: '#2a5ba8' })]);
    const shared = new MeshStandardMaterial({ name: 'lisere' });
    const copy = new Group().add(new Mesh(new BoxGeometry(1, 1, 1), shared));
    layer.standIn(MINE, copy);
    const worn = (copy.children[0] as Mesh).material as MeshStandardMaterial;
    expect(worn).not.toBe(shared);
    expect(worn.color.getHex()).toBe(new Color('#2a5ba8').getHex());
    expect(shared.color.getHex()).toBe(0xffffff);
    const disposed = vi.fn();
    worn.addEventListener('dispose', disposed);
    layer.standIn(MINE, null);
    expect(disposed).toHaveBeenCalled();
  });

  it('ranks my garrison on the yard from fx_rang, on the socle top, along the rank', async () => {
    const layer = await layerOf([site(MINE, { side: 'mine', ink: '#2a5ba8' })]);
    const drawn = layer.drawnOf(MINE)!;
    const rank = layer.garrisonAt(MINE, 0.1)!;
    expect(rank.rank).toBe(true);
    // A recruit's way goes round the building, on the socle: its frame says both.
    const frame = layer.siteOf(MINE)!;
    expect(frame.box.min.y).toBeCloseTo(0, 3);
    expect(frame.building.min.y).toBeCloseTo(SOCLE_TOP, 3);
    const first = new Vector3(-25, SOCLE_TOP, 17.4).applyMatrix4(drawn.matrix);
    expect(rank.at.x + rank.step[0]).toBeCloseTo(first.x, 6);
    expect(rank.at.z + rank.step[1]).toBeCloseTo(first.z, 6);
    expect(rank.at.y).toBeCloseTo(first.y, 6);
    expect(rank.at.y).toBeGreaterThan(0);
    // The rank runs along the marker's +z, the model's +x, turned as the maquette is.
    const along = new Vector3(1, 0, 0).applyAxisAngle(new Vector3(0, 1, 0), yawOf(MINE));
    expect(Math.cos(rank.facing)).toBeCloseTo(along.x, 6);
    expect(-Math.sin(rank.facing)).toBeCloseTo(along.z, 6);
  });

  it('keeps the foot and its facing without a socle, and for the hulls of a quay', async () => {
    const layer = await layerOf([
      site(MINE, { side: 'mine', ink: '#2a5ba8' }),
      site('building-hq@5,0', { url: 'plain.glb' }),
    ]);
    expect(layer.garrisonAt('building-hq@5,0', 0.1)!.rank).toBe(false);
    expect(layer.garrisonAt(MINE, 0.1, true)!.rank).toBe(false);
  });

  it('cuts the building alone at work, from the socle top, and stands the rest whole', async () => {
    const works = {
      phase: 'rising' as const,
      level: 1,
      finishesAt: null,
      minutes: 5,
      pennant: null,
      stamp: null,
    };
    const layer = await layerOf([site(MINE, { side: 'mine', ink: '#2a5ba8', works })]);
    expect(dressed.box!.min.y).toBeCloseTo(SOCLE_TOP, 3);
    const all = meshes(layer);
    const cut = (mesh: InstancedMesh) =>
      ((mesh.material as MeshStandardMaterial).clippingPlanes ?? []).length > 0;
    for (const name of ['socle', 'lisere'])
      expect(
        all.filter((mesh) => nameOf(mesh) === name && !cut(mesh) && mesh.name === ''),
      ).toHaveLength(1);
    expect(all.filter((mesh) => nameOf(mesh) === 'murs' || nameOf(mesh) === 'ardoise')).toEqual(
      all.filter((mesh) => (nameOf(mesh) === 'murs' || nameOf(mesh) === 'ardoise') && cut(mesh)),
    );
    expect(all.some((mesh) => nameOf(mesh) === 'ardoise' && cut(mesh))).toBe(true);
  });

  it('is picked by its socle while its building rises, the cut above the ground', async () => {
    const works = {
      phase: 'rising' as const,
      level: 1,
      finishesAt: null,
      minutes: 5,
      pennant: null,
      stamp: null,
    };
    const layer = await layerOf([site(MINE, { side: 'mine', ink: '#2a5ba8', works })]);
    const drawn = layer.drawnOf(MINE)!;
    // Down onto the yard, clear of the building: the cut, at the ground here, cuts no socle.
    const yard = new Vector3(-25, 0, 25).applyMatrix4(drawn.matrix);
    const down = new Raycaster(yard.clone().setY(5), new Vector3(0, -1, 0));
    expect(layer.under(down)?.id).toBe(MINE);
  });

  describe('its yard, by level and state (#366)', () => {
    const works = (phase: 'queued' | 'rising' | 'raising', level: number) => ({
      phase,
      level,
      finishesAt: null,
      minutes: 5,
      pennant: null,
      stamp: null,
    });
    const groupsOf = (layer: MaquetteLayer) =>
      meshes(layer)
        .map((mesh) => mesh.name)
        .filter((name) => name.startsWith('niveau_') || name === 'chantier' || name === 'ruines')
        .sort();
    const stood = async (more: Parameters<typeof site>[1]) =>
      groupsOf(await layerOf([site(MINE, { side: 'mine', ink: '#2a5ba8', ...more })]));

    it('shows niveau_1 alone at level 1, a group more each level, three at most', async () => {
      expect(await stood({ level: 1 })).toEqual(['niveau_1']);
      expect(await stood({ level: 2 })).toEqual(['niveau_1', 'niveau_2']);
      expect(await stood({ level: 3 })).toEqual(['niveau_1', 'niveau_2', 'niveau_3']);
      expect(await stood({ level: 6 })).toEqual(['niveau_1', 'niveau_2', 'niveau_3']);
      expect(await stood({})).toEqual(['niveau_1']);
    });

    it('shows a first rise as niveau_1 and chantier, and a raise as the level before and chantier', async () => {
      expect(await stood({ level: 1, works: works('rising', 1) })).toEqual([
        'chantier',
        'niveau_1',
      ]);
      expect(await stood({ level: 2, works: works('raising', 3) })).toEqual([
        'chantier',
        'niveau_1',
        'niveau_2',
      ]);
      expect(await stood({ level: 1, works: works('queued', 1) })).toEqual([]);
    });

    it('shows a survey, aged or not, niveau_1 alone, never chantier', async () => {
      expect(await stood({ side: 'seen' })).toEqual(['niveau_1']);
      expect(await stood({ side: 'seen', washed: true })).toEqual(['niveau_1']);
    });

    it('keeps two barracks of two levels apart, each with its own groups', async () => {
      const layer = await layerOf([
        site(MINE, { level: 1 }),
        site('building-barracks@5,0', { level: 3 }),
      ]);
      const count = (name: string) =>
        meshes(layer)
          .filter((mesh) => mesh.name === name)
          .reduce((sum, mesh) => sum + mesh.count, 0);
      expect(count('niveau_1')).toBe(2);
      expect(count('niveau_3')).toBe(1);
    });

    it('draws no ink scaffold when the file brings its chantier, and keeps it for one without', async () => {
      await layerOf([site(MINE, { level: 1, works: works('rising', 1) })]);
      expect(dressed.scaffolded).toBe(false);
    });

    it('hands the ruins, and the building to cut, for a raze to end on', async () => {
      const layer = await layerOf([site(MINE, { level: 3, side: 'mine', ink: '#2a5ba8' })]);
      const drawn = layer.drawnOf(MINE)!;
      expect(drawn.ruins).toBeDefined();
      expect(drawn.ruins!.stump).toBeCloseTo(SOCLE_TOP + 3, 6);
      expect(drawn.ruins!.parts.length).toBeGreaterThan(0);
      // The yard of the level it stood at falls away: ruins alone stand in its place.
      expect(drawn.ruins!.shell.length).toBeGreaterThan(0);
      for (const part of drawn.ruins!.shell) expect(drawn.parts).toContain(part);
      expect(drawn.parts.length).toBeLessThan(meshes(layer).length);
    });

    it('hands no ruins without a ruines group', async () => {
      const layer = await layerOf([site('building-hq@5,0', { url: 'plain.glb' })]);
      expect(layer.drawnOf('building-hq@5,0')!.ruins).toBeUndefined();
    });
  });

  it('stands a plan in the queue on its socle, the building not yet risen', async () => {
    const works = {
      phase: 'queued' as const,
      level: 1,
      finishesAt: null,
      minutes: 5,
      pennant: null,
      stamp: null,
    };
    const layer = await layerOf([site(MINE, { side: 'mine', ink: '#2a5ba8', works })]);
    const names = meshes(layer).map(nameOf);
    expect(names).toContain('socle');
    expect(names).not.toContain('ardoise');
  });

  it('spaces two socles 4 m apart at least, turned any way, wherever their points fall', () => {
    // A square socle 80 m wide turned at worst reaches half its diagonal (ADR 0038 §6).
    const metre = buildingFootprint('barracks') / 65;
    const reach = (Math.SQRT2 * 80 * metre) / 2;
    const spacing = ringSpacing(80 * metre, metre);
    for (const points of [
      [
        [0, 0],
        [0, 0],
      ],
      [
        [0, 0],
        [0, 0],
        [0, 0],
      ],
      [
        [0, 0],
        [30 * metre, 10 * metre],
        [-20 * metre, 40 * metre],
        [5 * metre, -5 * metre],
      ],
    ] as Point[][]) {
      const placed = clusterFootprints(points, spacing);
      for (let i = 0; i < placed.length; i++)
        for (let j = i + 1; j < placed.length; j++)
          expect(gap(placed[i]!.at, placed[j]!.at)).toBeGreaterThanOrEqual(
            2 * reach + 4 * metre - 1e-9,
          );
    }
  });

  it('spaces a site without a socle as before', () => {
    expect(ringSpacing(2, null)).toBe(2 * RING_GAP);
  });
});
