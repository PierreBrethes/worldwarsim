import {
  Box3,
  BoxGeometry,
  Quaternion,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  type MeshBasicMaterial,
  MeshStandardMaterial,
  type Object3D,
  Plane,
  Raycaster,
  Vector3,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { WorldFrame } from './frame';
import { BUILDINGS, type UnitRole } from '@/domain/ids';
import { buildingMaquette } from '@/emblems/buildings/manifest';
import { AIRFIELD, CRANE, MOLE } from '@/emblems/kits/manifest';
import {
  buildingFootprint,
  buildingMetres,
  buildingReach,
  buildingSpan,
  DRAWN_SHARE,
  troopSpan,
} from '@/domain/piece-size';
import { DOMAIN_BY_ROLE } from '@/domain/troops';
import {
  clusterFootprints,
  garrisonFoot,
  MaquetteLayer,
  MAX_SHIFT,
  RING_GAP,
  type SeaFront,
  ringSpacing,
  SOCLE_TOP,
  yawOf,
} from './maquettes';
import { GROUP_SPACING, pileLayout } from '@/domain/pile-layout';
import { articulatedOf } from './sequences';
import { warmPieces } from './halo';
import { sceneOfFile } from './gltf-scene.fixture';
import {
  ANONYMOUS_SPAN,
  LAID_OUT_FOR,
  pieceStands,
  pieceWeight,
  troopPinSpan,
} from './figurines/figurine';
import { pieceScale } from './piece-scale';

// The geometry and the thresholds are read at the full common scale: the share pieces are drawn
// at multiplies every size alike, and has its own tests (`figurine.test.ts`).
pieceScale.size = 1;

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

vi.mock('./figurines/figurine', async (original) => {
  // A box of a metre for every file but the barracks and the HQ: the loader wants
  // a DOM.
  const sceneOf = async (url: string) => {
    const { sceneOfFile } = await import('./gltf-scene.fixture');
    if (url === 'socle.glb') return sceneOfFile('src/emblems/buildings/barracks.glb');
    if (url === 'port.glb') return sceneOfFile('src/emblems/buildings/port.glb');
    if (url === 'airfield.glb') {
      // With its runway laid as the engine lays it, a plain slab in its place (`dressedScene`).
      const { AIRFIELD } = await import('@/emblems/kits/manifest');
      const site = sceneOfFile('src/emblems/buildings/airfield.glb');
      const { x1, length, z, half } = AIRFIELD.runway;
      const runway = new Mesh(new BoxGeometry(length, 0.1, 2 * half), new MeshStandardMaterial());
      runway.name = 'piste';
      runway.position.set(x1 - length / 2, 0, z);
      return site.add(runway);
    }
    if (url === 'hq.glb')
      return sceneOfFile(
        (await import('@/emblems/buildings/manifest')).buildingMaquette('hq', null)!,
      );
    const door = new Group();
    door.name = 'fx_sortie';
    door.position.set(0, 0.1, 0.5);
    return new Group().add(new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial()), door);
  };
  return {
    ...(await original<typeof import('./figurines/figurine')>()),
    sceneOf,
    // A lasting state adds a second material: its lot draws two meshes.
    posedScene: async (url: string, pose?: string) => {
      const scene = await sceneOf(url);
      if (pose !== undefined)
        scene.add(new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial({ name: pose })));
      return scene;
    },
  };
});

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

  it("measures a ring's reach member by member, not the widest one's half at the farthest one", () => {
    // A wide site at the centre, two narrow ones 40 away: the ring reaches 80.8, not 90 (Marseille
    // taken into Paris's ring, 04/11). A narrow site 95 away stays on its own.
    const placed = clusterFootprints(
      [
        [0, 0],
        [40, 0],
        [-40, 0],
        [95, 0],
      ],
      [100, 20, 20, 20],
    );
    expect(placed[3]).toEqual({ at: [95, 0], facing: 0, scale: 1 });
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

    it('shrinks only the sites whose footprints touch, not one a wide ring took in', () => {
      // Six sites in a line ring too wide for the bound; a seventh, a footprint and a bit past the
      // last, touches none of them — only their ring reaches it (Naples dragging Rome, 11/11).
      const line = Array.from({ length: 6 }, (_, k) => [k * 0.1, 0] as const);
      const far = [0.5 + 1.1 * S, 0] as const;
      const points = [...line, far];
      expect(clusterFootprints(points, S)[6]!.at).not.toEqual(far);
      const bounded = clusterFootprints(points, S, S / 2, everywhere);
      line.forEach((_, k) => expect(bounded[k]!.scale).toBeLessThan(1));
      expect(bounded[6]).toEqual({ at: far, facing: 0, scale: 1 });
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

  it('bakes a lasting state in a lot of its own, and lends it with its pose (#273)', async () => {
    const maquettes = new MaquetteLayer(
      frame,
      () => null,
      () => {},
      () => {},
      () => true,
    );
    maquettes.display([
      { ...stand(), pose: 'observing' },
      { ...stand(), id: 'building-researchCenter@3,48' },
    ]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    maquettes.orient(eye, null, 0);
    const lots: number[] = [];
    maquettes.group.traverse((node) => {
      if ((node as InstancedMesh).isInstancedMesh) lots.push((node as InstancedMesh).count);
    });
    expect(lots).toEqual([1, 1]);
    expect(maquettes.pieceOf(ID)?.pose).toBe('observing');
    expect(maquettes.pieceOf('building-researchCenter@3,48')?.pose).toBeUndefined();
  });

  it('offers a loop its sites at work drawn whole, with their metre on the board (#273)', async () => {
    const maquettes = new MaquetteLayer(
      frame,
      () => null,
      () => {},
      () => {},
      () => true,
    );
    const works = {
      phase: 'raising' as const,
      level: 2,
      finishesAt: null,
      minutes: 5,
      pennant: null,
      stamp: null,
    };
    maquettes.display([
      { ...stand(), working: true, metres: 50 },
      { ...stand(), id: 'idle', working: false },
      { ...stand(), id: 'raised', working: true, works },
      { ...stand(true), id: 'ghost', working: true },
    ]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    maquettes.orient(eye, null, 0);
    const [site, ...others] = maquettes.working();
    expect(others).toEqual([]);
    expect(site!.id).toBe(ID);
    // Its file is 1 m wide for 50: it is drawn at its metre.
    expect(site!.metre).toBeCloseTo(
      new Vector3().setFromMatrixScale(maquettes.drawnOf(ID)!.matrix).x,
      9,
    );
    // Neither the copy it lends nor a view served again lets it drop for a frame: the loop
    // would give its copy back and take it again, a frame at rest each time.
    maquettes.standIn(ID, copyOf());
    expect(maquettes.working().map(({ id }) => id)).toEqual([ID]);
    maquettes.display([{ ...stand(), working: true, metres: 50, level: 2 }]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(maquettes.working().map(({ id }) => id)).toEqual([ID]);
    // No longer drawn whole: it rests.
    maquettes.orient(new Vector3(0, 900, 0), null, 0);
    expect(maquettes.working()).toEqual([]);
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

describe('a garrison at the foot of a site drawn smaller (#433)', () => {
  const frame = {
    projectLonLat: ([lon, lat]: readonly [number, number]) => new Vector3(lon, 0, lat),
  } as unknown as WorldFrame;
  // A dozen sites on one point make a ring too wide to keep: each stands at its smallest size.
  const crowded = async (id: string) => {
    const maquettes = new MaquetteLayer(
      frame,
      () => null,
      () => {},
      () => {},
      () => true,
    );
    const ids = [id, ...Array.from({ length: 11 }, (_, k) => `building-hq${k}@0,0`)];
    maquettes.display(
      ids.map((one) => ({
        id: one,
        at: { lonLat: [0, 0] as const },
        url: one.startsWith('building-port') ? 'port.glb' : `${one}.glb`,
        span: 1,
        washed: false,
      })),
    );
    await vi.waitFor(() => expect(maquettes.isDressed(id)).toBe(true));
    maquettes.orient(new Vector3(0, 2, 2), null, 0);
    return maquettes;
  };
  const reach = (step: readonly [number, number]) => Math.hypot(...step);

  it('stands a pile on land off a model without `fx_rang` by its own half, not by its half at the site scale', async () => {
    const maquettes = await crowded('building-barracks@0,0');
    const bare = maquettes.garrisonAt('building-barracks@0,0', 0)!;
    expect(bare.scale).toBeCloseTo(0.6, 9);
    const pile = reach(maquettes.garrisonAt('building-barracks@0,0', 1)!.step);
    // The bare foot is the site's 8/7 of its span at 0.6; a pile of span 1 adds its 1/2, whole.
    expect((pile - reach(bare.step)) / reach(bare.step)).toBeCloseTo(0.5 / ((8 / 7) * 0.6), 9);
  });

  it("follows the player's size: at 80 % the foot of a garrison is 0.8 of what it was", async () => {
    const ID = 'building-barracks@3,4';
    const maquettes = new MaquetteLayer(
      frame,
      () => null,
      () => {},
      () => {},
      () => true,
    );
    maquettes.display([
      { id: ID, at: { lonLat: [3, 4] as const }, url: `${ID}.glb`, span: 1, washed: false },
    ]);
    await vi.waitFor(() => expect(maquettes.isDressed(ID)).toBe(true));
    const foot = () => {
      maquettes.orient(new Vector3(3, 2, 6), null, 0);
      return reach(maquettes.garrisonAt(ID, 0)!.step);
    };
    const whole = foot();
    pieceScale.size = 0.8;
    try {
      maquettes.resize();
      expect(foot() / whole).toBeCloseTo(0.8, 9);
    } finally {
      pieceScale.size = 1;
    }
  });

  it('hands the scale of a port to its hulls, and docks a cargo drawn at it clear of the port', async () => {
    const PORT = 'building-port@0,0';
    const maquettes = await crowded(PORT);
    const { scale } = maquettes.garrisonAt(PORT, 0, true)!;
    expect(scale).toBeCloseTo(0.6, 9);
    // The hull, a group's spacing to seaward of where its quay is read, past the port's edge.
    const cargo = troopSpan('cargo');
    const quay = maquettes.quayAt(0, 0, cargo)!;
    expect(quay.scale).toBeCloseTo(0.6, 9);
    const off = (GROUP_SPACING * cargo * scale) / LAID_OUT_FOR;
    const site = maquettes.siteOf(PORT)!;
    const edge = site.toBoard(site.marker('fx_bord_eau')!);
    const [fx, fz] = quay.front;
    const beyond = (quay.at.x + fx * off - edge.x) * fx + (quay.at.z + fz * off - edge.z) * fz;
    expect(beyond).toBeGreaterThan(0);
    expect(beyond).toBeLessThan(cargo * scale);
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

  it('inks the liseré and the flag alone, by the side of each site, in one lot', async () => {
    const layer = await layerOf([
      site(MINE, { side: 'mine', ink: '#2a5ba8', flag: '#2a5ba8' }),
      site('installation-seen', { side: 'seen' }),
      site('installation-neutral', { side: 'neutral' }),
    ]);
    const all = meshes(layer);
    const [flag, ...more] = all.filter((mesh) => nameOf(mesh) === 'drapeau');
    expect(more).toEqual([]);
    const flagAt = new Color();
    flag!.getColorAt(0, flagAt);
    expect(flagAt.getHex()).toBe(new Color('#2a5ba8').getHex());
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
    for (const mesh of all.filter((each) => each !== lisere && each !== flag))
      expect(mesh.instanceColor).toBeNull();
  });

  /** **The flag** (#279): mine at the top of my pole, none on a pole a survey shows; it runs
   *  down the 4 m its pole leaves it, placed with the rest of its site. */
  it('flies my flag atop its pole, none on a bare one, and runs it down', async () => {
    const layer = await layerOf([
      site(MINE, { side: 'mine', ink: '#2a5ba8', flag: '#2a5ba8' }),
      site('installation-seen', { side: 'seen' }),
    ]);
    const all = meshes(layer);
    const flag = all.find((mesh) => nameOf(mesh) === 'drapeau')!;
    const sign = all.find((mesh) => nameOf(mesh) === 'lisere')!;
    const at = (mesh: InstancedMesh, k: number) => {
      const placed = new Matrix4();
      mesh.getMatrixAt(k, placed);
      return placed;
    };
    expect(at(flag, 0).equals(at(sign, 0))).toBe(true);
    expect(at(flag, 1).determinant()).toBe(0);
    expect(layer.settling).toBe(false);

    // Its time held still: a loaded machine would otherwise run it further down.
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      layer.runFlag(MINE, { from: 1, to: 0, start: Date.now() - 500, ms: 1000 });
      layer.orient(eye, null, 1);
    } finally {
      vi.useRealTimers();
    }
    expect(layer.settling).toBe(true);
    // Halfway down its time, slowly first: a quarter of the way.
    const down = new Vector3(0, -1, 0).applyMatrix4(at(sign, 0));
    expect(new Vector3().applyMatrix4(at(flag, 0)).distanceTo(down)).toBeLessThan(1e-6);
  });

  it('runs a staple round the socle to the share of its capture, pale once stopped', async () => {
    const clock = { progress: 0.5, at: Date.now(), rate: 0, durationMs: 1, rest: null };
    const layer = await layerOf([
      site('installation-seen', {
        side: 'seen',
        capture: { clock, side: 'capturer', stopped: false },
      }),
      site('installation-stopped', {
        side: 'seen',
        capture: { clock, side: 'capturer', stopped: true },
      }),
    ]);
    const staples: Mesh[] = [];
    layer.group.traverse((node) => node.name === 'agrafe' && staples.push(node as Mesh));
    const [running, stopped] = staples;
    const segments = running!.geometry.attributes.position!.count / 6;
    expect(running!.geometry.drawRange.count).toBe(Math.floor(segments / 2) * 6);
    expect((running!.material as MeshBasicMaterial).opacity).toBeGreaterThan(
      (stopped!.material as MeshBasicMaterial).opacity,
    );
  });

  it('seals a site out of service at its mark, and no other', async () => {
    const layer = await layerOf([
      site(MINE, { side: 'mine', ink: '#2a5ba8', seal: [0, 5.2, 8, 0, 3.4] }),
      site('installation-seen', { side: 'seen' }),
    ]);
    const seals: Object3D[] = [];
    layer.group.traverse((node) => node.name === 'scelles' && seals.push(node));
    expect(seals).toHaveLength(1);
    const drawn = layer.drawnOf(MINE)!;
    const mark = new Vector3(0, 5.2, 8).applyMatrix4(drawn.matrix);
    expect(new Vector3().applyMatrix4(seals[0]!.matrix).distanceTo(mark)).toBeLessThan(1e-6);
  });

  /** **The pile that captures stands at the foot of its sign** (#279, décision 1). */
  it('stands the pile that captures a survey at the foot of its sign, off its footing', async () => {
    const clock = { progress: 0, at: Date.now(), rate: 1, durationMs: 1, rest: null };
    const seen = 'installation-seen';
    const layer = await layerOf([
      site(seen, { side: 'seen', capture: { clock, side: 'capturer', stopped: false } }),
    ]);
    expect(layer.buildingPoints().map(({ id }) => id)).toEqual([seen]);
    const drawn = layer.drawnOf(seen)!;
    const stand = layer.garrisonAt(seen, 0.1)!;
    expect(stand.rank).toBe(false);
    // The barracks' sign stands at (−22, 17): 7 m of it toward the socle's middle.
    const foot = new Vector3(-22, 0, 17);
    const at = foot
      .clone()
      .add(foot.clone().negate().setLength(7))
      .setY(SOCLE_TOP)
      .applyMatrix4(drawn.matrix);
    expect(stand.at.x + stand.step[0]).toBeCloseTo(at.x, 6);
    expect(stand.at.z + stand.step[1]).toBeCloseTo(at.z, 6);
    expect(stand.at.y).toBeCloseTo(at.y, 6);
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

  it('glows the same by night on the instance and on the copy a sequence stands in, liseré and flag', async () => {
    const layer = await layerOf([site(MINE, { side: 'mine', ink: '#2a5ba8', flag: '#2a5ba8' })]);
    const glow = (material: MeshStandardMaterial) => {
      warmPieces(new Group().add(new Mesh(new BoxGeometry(1, 1, 1), material)), 1);
      return material.emissive.toArray();
    };
    const at = new Map<string, number[]>();
    layer.group.traverse((node) => {
      const material = (node as InstancedMesh).isInstancedMesh
        ? ((node as InstancedMesh).material as MeshStandardMaterial)
        : null;
      if (material && ['lisere', 'drapeau'].includes(material.name))
        at.set(material.name, glow(material));
    });
    expect([...at.keys()].sort()).toEqual(['drapeau', 'lisere']);
    const copy = new Group();
    for (const name of at.keys())
      copy.add(new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial({ name })));
    layer.standIn(MINE, copy);
    for (const mesh of copy.children as Mesh[]) {
      const worn = mesh.material as MeshStandardMaterial;
      expect(worn.color.getHex()).toBe(new Color('#2a5ba8').getHex());
      expect(glow(worn)).toEqual(at.get(worn.name));
    }
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
    const first = new Vector3(12, SOCLE_TOP, 26.5).applyMatrix4(drawn.matrix);
    expect(rank.at.x + rank.step[0]).toBeCloseTo(first.x, 6);
    expect(rank.at.z + rank.step[1]).toBeCloseTo(first.z, 6);
    expect(rank.at.y).toBeCloseTo(first.y, 6);
    expect(rank.at.y).toBeGreaterThan(0);
    // The rank runs along the marker's +x and deepens along its +z, turned as the maquette is,
    // over the 30 m of its rectangle. The barracks' marker is turned half a turn, its +z toward
    // the building.
    const turn = (v: Vector3) => v.applyAxisAngle(new Vector3(0, 1, 0), yawOf(MINE));
    const along = turn(new Vector3(-1, 0, 0));
    expect(Math.cos(rank.facing)).toBeCloseTo(along.x, 6);
    expect(-Math.sin(rank.facing)).toBeCloseTo(along.z, 6);
    const deep = turn(new Vector3(0, 0, -1));
    expect(rank.deep[0]).toBeCloseTo(deep.x, 6);
    expect(rank.deep[1]).toBeCloseTo(deep.z, 6);
    expect(rank.width).toBeCloseTo((30 * drawn.matrix.getMaxScaleOnAxis()) / 1, 6);
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
    for (const name of ['socle_papier', 'lisere'])
      expect(
        all.filter((mesh) => nameOf(mesh) === name && !cut(mesh) && mesh.name === ''),
      ).toHaveLength(1);
    // The building is its stone and its dark, the file's materials of one atlas merged by look.
    const walls = all.filter(
      (mesh) => mesh.name === '' && ['pierre', 'fond_sombre'].includes(nameOf(mesh)),
    );
    expect(walls.length).toBeGreaterThan(0);
    expect(walls.every(cut)).toBe(true);
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
        // A group is one mesh per material of the file.
        .filter((name, k, all) => all.indexOf(name) === k)
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

    it('keeps two barracks of two levels apart, each with its own groups', async () => {
      const layer = await layerOf([
        site(MINE, { level: 1 }),
        site('building-barracks@5,0', { level: 3 }),
      ]);
      // One material of each group, to count its copies once.
      const MARK: Record<string, string> = { niveau_1: 'borne', niveau_3: 'terre' };
      const count = (name: string) =>
        meshes(layer)
          .filter((mesh) => mesh.name === name && nameOf(mesh) === MARK[name])
          .reduce((sum, mesh) => sum + mesh.count, 0);
      expect(count('niveau_1')).toBe(2);
      expect(count('niveau_3')).toBe(1);
    });

    it('draws no ink scaffold when the file brings its chantier, and keeps it for one without', async () => {
      await layerOf([site(MINE, { level: 1, works: works('rising', 1) })]);
      expect(dressed.scaffolded).toBe(false);
    });

    it('keeps the ink scaffold for a file with no chantier of its own', async () => {
      dressed.scaffolded = undefined;
      await layerOf([site('building-hq@5,0', { url: 'plain.glb', works: works('rising', 1) })]);
      expect(dressed.scaffolded).toBe(true);
    });

    it('hands the raze a liseré in the ink of its holder, not the file’s white', async () => {
      const layer = await layerOf([site(MINE, { level: 1, side: 'mine', ink: '#2a5ba8' })]);
      const lisere = layer.drawnOf(MINE)!.parts.find((part) => part.material.name === 'lisere')!;
      expect((lisere.material as MeshStandardMaterial).color.getHex()).toBe(
        new Color('#2a5ba8').getHex(),
      );
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

    it('keeps the yard of its level on the copy a sequence stands in for it', async () => {
      const layer = await layerOf([site(MINE, { level: 3, side: 'mine', ink: '#2a5ba8' })]);
      const copy = new Group();
      layer.standIn(MINE, copy);
      // The rig bakes niveau_1 into its base: the two groups that come later stand with it,
      // a mesh per material (one each: the atlas materials merged by look).
      expect(copy.children).toHaveLength(2);
      const low = await layerOf([site(MINE, { level: 1, side: 'mine', ink: '#2a5ba8' })]);
      const bare = new Group();
      low.standIn(MINE, bare);
      expect(bare.children).toHaveLength(0);
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
    const names = meshes(layer)
      .filter((mesh) => mesh.name === '')
      .map(nameOf);
    expect(names).toContain('socle_papier');
    expect(names).not.toContain('pierre');
  });

  it('spaces two socles 4 m apart at least, turned any way, wherever their points fall', () => {
    // A socle turned at worst reaches its farthest corner from the point (ADR 0038 §6): the
    // warehouse's yard runs 25 m past its façade, so half its side would be 5 m short.
    const metre = buildingSpan('warehouse') / buildingMetres('warehouse');
    const reach = buildingReach('warehouse');
    expect(reach).toBeGreaterThan((buildingFootprint('warehouse') * Math.SQRT2) / 2);
    const spacing = ringSpacing(buildingFootprint('warehouse'), { reach, metre });
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

  describe('read at a distance on its socle (ADR 0038 §7, #465)', () => {
    // Its 50 m to one board unit: the fixture's socle of 80 m is 1.6 units. Whatever its size, it
    // stands whole to d ≈ 43 and gives way to its pin by d ≈ 51, with my piles, at the full common
    // scale (nearer by the share pieces are drawn at: d ≈ 11 and 13).
    const socled = (more: Parameters<typeof site>[1] = {}) =>
      site(MINE, {
        side: 'mine',
        ink: '#2a5ba8',
        flag: '#2a5ba8',
        socle: true,
        footprint: 1.6,
        ...more,
      });
    const FULL = 1 / 50;
    const seenFrom = (layer: MaquetteLayer, distance: number) => {
      const at = layer.siteOf(MINE)!.toBoard(new Vector3());
      layer.orient(at.clone().setY(at.y + distance), null, 0);
      return layer;
    };
    const drawnAs = (layer: MaquetteLayer, which: (mesh: InstancedMesh) => boolean) =>
      meshes(layer)
        .filter(which)
        .map((mesh) => {
          const placed = new Matrix4();
          mesh.getMatrixAt(0, placed);
          return placed;
        });
    const scaleOf = (placed: Matrix4) => new Vector3().setFromMatrixScale(placed).x;
    const isSocle = (mesh: InstancedMesh) =>
      mesh.name === '' && ['socle_papier', 'socle_flanc', 'lisere'].includes(nameOf(mesh));
    const isBuilding = (mesh: InstancedMesh) => mesh.name === '' && !isSocle(mesh);

    it('stands whole up close: its building and its dressing, every mesh at one size', async () => {
      const layer = seenFrom(await layerOf([socled()]), 20);
      for (const which of [isBuilding, isSocle, () => true]) {
        const drawn = drawnAs(layer, which);
        expect(drawn.length).toBeGreaterThan(0);
        for (const placed of drawn) expect(scaleOf(placed)).toBeCloseTo(FULL, 9);
      }
    });

    it('shrinks whole into its pin with my piles, never a socle alone', async () => {
      const layer = await layerOf([socled()]);
      seenFrom(layer, 43);
      for (const placed of drawnAs(layer, () => true)) expect(scaleOf(placed)).toBeCloseTo(FULL, 9);
      seenFrom(layer, 47);
      const drawn = drawnAs(layer, () => true);
      const shrunk = scaleOf(drawn[0]!);
      expect(shrunk).toBeGreaterThan(0);
      expect(shrunk).toBeLessThan(FULL);
      for (const placed of drawn) expect(scaleOf(placed)).toBeCloseTo(shrunk, 9);
      seenFrom(layer, 52);
      for (const placed of drawnAs(layer, () => true)) expect(scaleOf(placed)).toBe(0);
    });

    it('hands its pin what it gives up: never both, never neither (ADR 0038 §7)', async () => {
      const layer = await layerOf([socled()]);
      const by = layer.spanOf(MINE)!;
      for (let d = 30; d < 60; d += 0.5) {
        seenFrom(layer, d);
        const drawn = scaleOf(drawnAs(layer, isSocle)[0]!) / FULL;
        expect(drawn + 1 - pieceStands(d, by)).toBeCloseTo(1, 2);
      }
    });

    it('hands a raze from afar its whole site, ruins and all, at the size it shrank to', async () => {
      const layer = seenFrom(await layerOf([socled()]), 47);
      const drawn = layer.drawnOf(MINE)!;
      const named = drawn.parts.map((part) => part.material.name);
      expect(named).toContain('fond_sombre');
      expect(named).toContain('lisere');
      expect(drawn.ruins).toBeDefined();
    });

    it('hands a raze from afar, its pin standing, its place whole for a ring of ink (#465)', async () => {
      const layer = seenFrom(await layerOf([socled()]), 60);
      expect(layer.drawnOf(MINE)).toBeNull();
      const whole = layer.wholeOf(MINE)!;
      expect(whole.parts).toEqual([]);
      expect(new Vector3().setFromMatrixScale(whole.matrix).x).toBeCloseTo(FULL, 9);
      expect(layer.wholeOf('building-hq@0,0')).toBeNull();
    });

    it('lets the smoke rest once its building has shrunk away', async () => {
      const layer = seenFrom(await layerOf([socled({ smoking: true })]), 20);
      expect(layer.smoke.idle!()).toBe(false);
      seenFrom(layer, 60);
      expect(layer.smoke.idle!()).toBe(true);
    });

    it('pins a site flagged on a socle whose file has none by its span, as it draws it', async () => {
      const layer = await layerOf([socled({ url: 'plain.glb' })]);
      expect(layer.spanOf(MINE)).toBe(1);
    });

    it('hands the pin and the plate its socle, and a site without one its span', async () => {
      const layer = await layerOf([socled(), site('building-hq@5,0', { url: 'plain.glb' })]);
      expect(layer.spanOf(MINE)).toBe('socle');
      expect(layer.spanOf('building-hq@5,0')).toBe(1);
    });

    it('weighs a site without a socle by its span, as before, all of it at one size', async () => {
      const layer = await layerOf([site(MINE, { url: 'plain.glb', span: 0.964 })]);
      seenFrom(layer, 60);
      const drawn = drawnAs(layer, () => true);
      const weight = pieceWeight(60, 0.964);
      expect(weight).toBeGreaterThan(0);
      expect(weight).toBeLessThan(1);
      for (const placed of drawn)
        expect(scaleOf(placed)).toBeCloseTo((Math.round(weight * 100) / 100) * 0.964 * FULL, 9);
    });
  });
});

describe('a copy for a sequence or a loop (#273)', () => {
  it('keeps its sign a node, to grow on its foot as the instance does', async () => {
    const rig = await articulatedOf('socle.glb', 'barracks');
    expect(rig.getObjectByName('signe')).toBeDefined();
  });

  it("stocks the HQ's copy with two crates inside its walls, for a loading (#271)", async () => {
    const rig = await articulatedOf('hq.glb', 'hq');
    rig.updateMatrixWorld(true);
    const file = sceneOfFile(buildingMaquette('hq', null)!);
    const walls = new Box3().setFromObject(file.getObjectByName('batiment')!);
    for (const name of ['caisse_1', 'caisse_2']) {
      const crate = rig.getObjectByName(name);
      expect(crate, name).toBeDefined();
      expect(walls.containsPoint(crate!.getWorldPosition(new Vector3()).setY(3)), name).toBe(true);
    }
  });
});

describe('an airfield and its runway (#269)', () => {
  const frame = {
    projectLonLat: ([lon, lat]: readonly [number, number]) => new Vector3(lon, 0, lat),
  } as unknown as WorldFrame;
  const airfield = (lon: number) => ({
    id: `building-airfield@${lon},0`,
    at: { lonLat: [lon, 0] as const },
    url: 'airfield.glb',
    span: buildingSpan('airfield'),
    metres: buildingMetres('airfield'),
    footprint: buildingFootprint('airfield'),
    reach: buildingReach('airfield'),
    socle: true,
    washed: false,
  });

  it('keeps its runway on land, by steps of 15°, and gives its takeoff by the turn it kept (#436)', async () => {
    // The sea east of a coast close by: most hashed turns lay the runway on it.
    const coast = 0.5;
    const onLand = (x: number) => x < coast;
    for (const lon of [0, 0.01, 0.02, 0.03, 0.04, 0.05]) {
      const site = airfield(lon);
      const layer = new MaquetteLayer(
        frame,
        () => null,
        () => {},
        () => {},
        onLand,
      );
      layer.display([site]);
      await vi.waitFor(() => expect(layer.isDressed(site.id)).toBe(true));
      const drawn = layer.siteOf(site.id)!;
      const { x1, length, z, half } = AIRFIELD.runway;
      for (const [x, dz] of [
        [x1, -half],
        [x1, half],
        [x1 - length, -half],
        [x1 - length, half],
      ] as const)
        expect(drawn.toBoard(new Vector3(x, 0, z + dz)).x, site.id).toBeLessThan(coast);
      // Toward its free end, the way it turned, whatever its hash said.
      const free = drawn.toBoard(new Vector3(-1, 0, 0)).sub(drawn.toBoard(new Vector3()));
      const takeoff = layer.runwayAt(lon, 0)!;
      expect(takeoff[0]).toBeCloseTo(free.x / Math.hypot(free.x, free.z), 6);
      expect(takeoff[1]).toBeCloseTo(free.z / Math.hypot(free.x, free.z), 6);
    }
  });
});

describe('a port faces its water, a coastal site its land (#436)', () => {
  const frame = {
    projectLonLat: ([lon, lat]: readonly [number, number]) => new Vector3(lon, 0, lat),
  } as unknown as WorldFrame;
  const PORT = 'building-port@0,0';
  /** The sea lies east of `COAST`, on the board's +x. */
  const COAST = 0.1;
  const port = {
    id: PORT,
    at: { lonLat: [0, 0] as const },
    url: 'port.glb',
    span: buildingSpan('port'),
    metres: buildingMetres('port'),
    footprint: buildingFootprint('port'),
    reach: buildingReach('port'),
    socle: true,
    washed: false,
  };
  const layerOf = async (
    maquettes: Parameters<MaquetteLayer['display']>[0],
    shore: (x: number, z: number) => SeaFront | null,
    onLand: (x: number, z: number) => boolean = (x) => x < COAST,
  ) => {
    const layer = new MaquetteLayer(
      frame,
      () => null,
      () => {},
      () => {},
      onLand,
      shore,
    );
    layer.display(maquettes);
    await vi.waitFor(() => expect(maquettes.every(({ id }) => layer.isDressed(id))).toBe(true));
    layer.orient(new Vector3(0, 0.5, 0.5), null, 0);
    return layer;
  };
  const east: SeaFront = { seaward: [1, 0], line: [COAST, 0.3] };

  it('lays its water edge on the coast line, its quay to the sea, and steps back from its point alone', async () => {
    const layer = await layerOf([port], () => east);
    const site = layer.siteOf(PORT)!;
    const edge = site.toBoard(site.marker('fx_bord_eau')!);
    expect(edge.x).toBeCloseTo(COAST, 6);
    expect(edge.z).toBeCloseTo(0, 6);
    const back = site.toBoard(site.marker('fx_bord_eau')!.setZ(0));
    expect(edge.x - back.x).toBeGreaterThan(0);
    expect(edge.z - back.z).toBeCloseTo(0, 6);
    // Its pin follows the maquette; its point does not move.
    const drawn = layer.drawnAt(PORT)!;
    expect(drawn.x).toBeLessThan(0);
    expect(drawn.z).toBeCloseTo(0, 9);
    expect(layer.buildingPoints()).toEqual([{ id: PORT, at: [0, 0] }]);
  });

  it('docks its hulls in the water off its edge, whichever way its hash would have turned it', async () => {
    const layer = await layerOf([port], () => east);
    const cargo = troopSpan('cargo');
    const off = (GROUP_SPACING * cargo) / LAID_OUT_FOR;
    const quay = layer.quayAt(0, 0, cargo)!;
    expect(quay.at.x + quay.front[0] * off).toBeGreaterThan(COAST);
    expect(quay.at.z).toBeCloseTo(0, 6);
    const { at, step, facing } = layer.garrisonAt(PORT, cargo, true)!;
    // Its hull, a group's spacing to seaward of the pile's point (`formationOf`).
    expect(at.x + step[0] + off).toBeGreaterThan(COAST);
    expect(facing).toBeCloseTo(Math.PI / 2, 9);
  });

  it('docks a hull square to its edge, its stern within a tenth of its span of it (#436)', async () => {
    // The sea to the south: a hull, which keeps its turn at a quay (ADR 0028), lies bow to it.
    const south: SeaFront = { seaward: [0, 1], line: [0.3, COAST] };
    const layer = await layerOf(
      [port],
      () => south,
      (_, z) => z < COAST,
    );
    const cargo = troopSpan('cargo');
    const { at, step } = layer.garrisonAt(PORT, cargo, true)!;
    // The formation steps its hulls a group's spacing to seaward of the pile's point.
    const hull = at.z + step[1] + (GROUP_SPACING * cargo) / LAID_OUT_FOR;
    expect(Math.abs(hull - cargo / 2 - COAST)).toBeLessThan(cargo / 10);
    // The thread leaves from where the hull stands.
    const quay = layer.quayAt(0, 0, cargo)!;
    const off = (GROUP_SPACING * cargo) / LAID_OUT_FOR;
    expect(quay.at.z + quay.front[1] * off).toBeCloseTo(hull, 9);
  });

  it('steps back no nearer a neighbour inland than the ring would stand them (#436)', async () => {
    const portSpacing = ringSpacing(buildingFootprint('port'), {
      reach: buildingReach('port'),
      metre: buildingSpan('port') / buildingMetres('port'),
    });
    const barracksSpacing = ringSpacing(82 / 50, {
      reach: ((82 / 50) * Math.SQRT2) / 2,
      metre: 1 / 50,
    });
    const apart = (portSpacing + barracksSpacing) / 2;
    const BARRACKS = 'building-barracks@-9,0';
    const barracks = {
      id: BARRACKS,
      at: { lonLat: [-apart - 0.02, 0] as const },
      url: 'socle.glb',
      span: 1,
      metres: 50,
      footprint: 82 / 50,
      socle: true,
      washed: false,
    };
    const layer = await layerOf(
      [port, barracks],
      () => east,
      () => true,
    );
    // Apart at their points: no ring. The port alone steps back toward the barracks.
    expect(layer.drawnAt(BARRACKS)).toBeNull();
    const drawn = layer.drawnAt(PORT)!;
    expect(drawn.x).toBeLessThan(0);
    expect(drawn.x - (-apart - 0.02)).toBeGreaterThanOrEqual(apart - 1e-9);
  });

  it('only turns to the sea before the coast has landed, on its point', async () => {
    const layer = await layerOf([port], () => ({ seaward: [0, -1], line: null }));
    expect(layer.drawnAt(PORT)).toBeNull();
    const site = layer.siteOf(PORT)!;
    const edge = site.toBoard(site.marker('fx_bord_eau')!);
    expect(edge.z).toBeLessThan(0);
    expect(edge.x).toBeCloseTo(0, 6);
  });

  it('never steps further from its point than its bound, for a coast far off', async () => {
    const layer = await layerOf([port], () => ({ seaward: [1, 0], line: [-20, 0] }));
    const bound =
      MAX_SHIFT *
      ringSpacing(buildingFootprint('port'), {
        reach: buildingReach('port'),
        metre: buildingSpan('port') / buildingMetres('port'),
      });
    expect(Math.hypot(layer.drawnAt(PORT)!.x, layer.drawnAt(PORT)!.z)).toBeCloseTo(bound, 6);
  });

  it('keeps the hashed turn of a socle a twentieth wet: the bar is a tenth (#436)', async () => {
    const id = 'building-barracks@3,0';
    const hashed = new Matrix4().compose(
      new Vector3(),
      new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yawOf(id)),
      new Vector3().setScalar(1 / 50),
    );
    // The barracks' socle, in metres (its file): the sea starts where a twentieth of it lies past.
    const xs: number[] = [];
    for (let i = 0; i < 40; i++)
      for (let j = 0; j < 40; j++)
        xs.push(
          new Vector3(
            -33.8 + (81.6 * (i + 0.5)) / 40,
            0,
            -16.3 + (46.6 * (j + 0.5)) / 40,
          ).applyMatrix4(hashed).x,
        );
    const sea = xs.sort((a, b) => a - b)[Math.floor(xs.length * 0.95)]!;
    const layer = await layerOf(
      [
        {
          id,
          at: { lonLat: [0, 0] as const },
          url: 'socle.glb',
          span: 1,
          metres: 50,
          footprint: 82 / 50,
          socle: true,
          washed: false,
        },
      ],
      () => null,
      (x) => x < sea,
    );
    const corner = new Vector3(47.8, 0, 30.3);
    const drawn = layer.siteOf(id)!.toBoard(corner.clone());
    const kept = corner.clone().applyMatrix4(hashed);
    expect(drawn.x).toBeCloseTo(kept.x, 6);
    expect(drawn.z).toBeCloseTo(kept.z, 6);
  });

  describe('in mirror when the side of its mole is blocked (#476)', () => {
    /** The coast bends under the mole: land to the board's -z, where the east-facing port's +x is. */
    const bent = (x: number, z: number) => x < COAST || z < 0;
    const moleAt = (layer: MaquetteLayer, id = PORT) =>
      layer.siteOf(id)!.toBoard(new Vector3(MOLE.x, 0, MOLE.quay + 100));
    const second = {
      ...port,
      id: 'building-port@10,0',
      at: { lonLat: [10, 0] as const },
    };

    it('lays its mole on the free side, and keeps the plain one on a straight coast', async () => {
      const plain = await layerOf([port], () => east);
      expect(moleAt(plain).z).toBeLessThan(0);
      const layer = await layerOf([port], () => east, bent);
      expect(moleAt(layer).z).toBeGreaterThan(0);
    });

    it('keeps its crane and its hulls on the mirrored side, in the water off the mole', async () => {
      const layer = await layerOf([port], () => east, bent);
      const site = layer.siteOf(PORT)!;
      // The crane flips to the mole's side; the hull berthed against the mole's inner face
      // stands in the roads of the same side, the water, not on the coast.
      expect(site.toBoard(new Vector3(CRANE.x, 0, CRANE.z)).z).toBeGreaterThan(0);
      const hull = site.toBoard(new Vector3(MOLE.inner - 8, 0, MOLE.quay + 40));
      expect(bent(hull.x, hull.z)).toBe(false);
      // Model metres out, model metres back.
      const back = site.toModel(site.toBoard(new Vector3(12, 3, 34)));
      expect(back.x).toBeCloseTo(12, 6);
      expect(back.z).toBeCloseTo(34, 6);
      // A garrison's frame (where the rests are laid) reads the same site.
      const frame = layer.garrisonAt(PORT, troopSpan('cargo'), true)!;
      const [a, b] = [
        frame.toBoard(new Vector3(MOLE.x, 0, 200)),
        site.toBoard(new Vector3(MOLE.x, 0, 200)),
      ];
      expect(a.distanceTo(b)).toBeLessThan(1e-9);
    });

    it('draws its geometry mirrored, its faces still outward', async () => {
      const layer = await layerOf([port], () => east, bent);
      const plain = await layerOf([port], () => east);
      const bounds = (l: MaquetteLayer) => {
        const box = new Box3();
        for (const { geometry } of l.drawnOf(PORT)!.parts) {
          geometry.computeBoundingBox();
          box.union(geometry.boundingBox!);
        }
        return box;
      };
      const [m, p] = [bounds(layer), bounds(plain)];
      expect(m.min.x).toBeCloseTo(-p.max.x, 6);
      expect(m.max.x).toBeCloseTo(-p.min.x, 6);
      // A reflection turns the volume the faces enclose inside out, unless the faces are turned
      // about too: the signed volume stays the same.
      const volume = (l: MaquetteLayer) => {
        let sum = 0;
        for (const { geometry } of l.drawnOf(PORT)!.parts) {
          const at = geometry.getAttribute('position');
          const corner = (k: number) => (geometry.index ? geometry.index.getX(k) : k);
          const count = geometry.index ? geometry.index.count : at.count;
          for (let k = 0; k + 2 < count; k += 3) {
            const [a, b, c] = [0, 1, 2].map((i) =>
              new Vector3().fromBufferAttribute(at, corner(k + i)),
            );
            sum += a!.dot(b!.clone().cross(c!)) / 6;
          }
        }
        return sum;
      };
      expect(Math.abs(volume(plain))).toBeGreaterThan(1);
      expect(volume(layer)).toBeCloseTo(volume(plain), 0);
    });

    it("turns the copy a sequence stands in for it the same way, in its file's metres", async () => {
      const layer = await layerOf([port], () => east, bent);
      const copy = new Group().add(new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial()));
      layer.standIn(PORT, copy);
      layer.orient(new Vector3(0, 0.5, 0.5), null, 1);
      copy.updateMatrixWorld(true);
      const site = layer.siteOf(PORT)!;
      const point = new Vector3(MOLE.x, 0, 200);
      expect(copy.localToWorld(point.clone()).distanceTo(site.toBoard(point))).toBeLessThan(1e-9);
      expect(copy.matrixWorld.determinant()).toBeLessThan(0);
    });

    it('never mixes a mirrored port and a plain one in a lot: each its own side', async () => {
      // Land bends under the first port's mole only: the second stands on a straight coast.
      const layer = await layerOf(
        [port, second],
        () => east,
        (x, z) => x < COAST || (z < 0 && x < 5),
      );
      expect(moleAt(layer).z).toBeGreaterThan(0);
      expect(moleAt(layer, second.id).z).toBeLessThan(0);
    });

    it('waits for the coast: with its line unknown it stays plain', async () => {
      const layer = await layerOf([port], () => ({ seaward: [1, 0], line: null }), bent);
      expect(moleAt(layer).z).toBeLessThan(0);
    });

    it('decides two neighbouring ports once both are posed: the same sides, whichever lands first', async () => {
      const near = { ...second, at: { lonLat: [0.12, 0.02] as const } };
      const sides = async (order: Parameters<MaquetteLayer['display']>[0]) => {
        const layer = await layerOf(
          order,
          () => east,
          (x, z) => x < COAST || (z < 0.01 && x < 0.2),
        );
        const rebuild = vi.spyOn(layer, 'rebuild');
        layer.resize();
        await new Promise((r) => setTimeout(r, 20));
        layer.resize();
        await new Promise((r) => setTimeout(r, 20));
        // Settled: placing again redraws nothing.
        expect(rebuild).not.toHaveBeenCalled();
        return [PORT, near.id].map((id) => moleAt(layer, id).z > 0);
      };
      const [a, b] = [await sides([port, near]), await sides([near, port])];
      expect(a).toEqual(b);
    });

    it('draws the key of a port again when its side turns, its place unmoved', async () => {
      let land = (x: number, z: number) => x < COAST || z > 5;
      const layer = await layerOf(
        [port],
        () => east,
        (x, z) => land(x, z),
      );
      const before = layer.runwaysKey();
      land = bent;
      layer.resize();
      await vi.waitFor(() => expect(layer.isDressed(PORT)).toBe(true));
      expect(moleAt(layer).z).toBeGreaterThan(0);
      expect(layer.runwaysKey()).not.toBe(before);
    });

    it('turns the heading of a hull at rest over with the port, by the real frame', async () => {
      const heading = async (onLand: (x: number, z: number) => boolean) => {
        const layer = await layerOf([port], () => east, onLand);
        const site = layer.siteOf(PORT)!;
        const at = site.toBoard(new Vector3(30, 0, 200));
        // A hull whose stem points to the model's +x.
        const ahead = site.toBoard(new Vector3(31, 0, 200)).sub(at);
        return Math.atan2(ahead.x, ahead.z);
      };
      const [plain, mirrored] = [await heading((x) => x < COAST), await heading(bent)];
      // The port faces east: its model's +x points along the board's -z, and +z once in mirror.
      expect(Math.cos(plain)).toBeCloseTo(-1, 9);
      expect(Math.cos(mirrored)).toBeCloseTo(1, 9);
    });

    it('forgets a port that is gone, and one whose coast line is lost goes back to plain', async () => {
      let line: SeaFront['line'] = [COAST, 0.3];
      const layer = await layerOf([port], () => ({ seaward: [1, 0], line }), bent);
      expect(moleAt(layer).z).toBeGreaterThan(0);
      line = null;
      layer.resize();
      await vi.waitFor(() => expect(layer.isDressed(PORT)).toBe(true));
      expect(moleAt(layer).z).toBeLessThan(0);
      layer.display([]);
      expect((layer as unknown as { mirrored: Set<string> }).mirrored.size).toBe(0);
    });

    it('turns up when the coast lands: the next placement mirrors the port it already drew', async () => {
      let line: SeaFront['line'] = null;
      const layer = await layerOf([port], () => ({ seaward: [1, 0], line }), bent);
      expect(moleAt(layer).z).toBeLessThan(0);
      line = [COAST, 0.3];
      layer.resize();
      await vi.waitFor(() => expect(layer.isDressed(PORT)).toBe(true));
      layer.orient(new Vector3(0, 0.5, 0.5), null, 0);
      expect(moleAt(layer).z).toBeGreaterThan(0);
    });
  });

  it('turns a socle its hashed turn wets onto the land, and leaves a dry one as it was', async () => {
    const SEA = 0.6;
    const ids = Array.from({ length: 12 }, (_, k) => `building-barracks@${k},0`);
    const sites = ids.map((id) => ({
      id,
      at: { lonLat: [0, 0] as const },
      url: 'socle.glb',
      span: 1,
      metres: 50,
      footprint: 82 / 50,
      socle: true,
      washed: false,
    }));
    /** The share of a socle at sea under a turn, on a grid finer than the layer's. */
    const wetUnder = (box: Box3, toBoard: (point: Vector3) => Vector3) => {
      let wet = 0;
      for (let i = 0; i <= 20; i++)
        for (let j = 0; j <= 20; j++) {
          const point = new Vector3(
            box.min.x + ((box.max.x - box.min.x) * i) / 20,
            0,
            box.min.z + ((box.max.z - box.min.z) * j) / 20,
          );
          if (toBoard(point).x >= SEA) wet++;
        }
      return wet / 441;
    };
    // Each alone on its own board: a ring would carry them apart.
    let turned = 0;
    for (const site of sites) {
      const layer = await layerOf(
        [site],
        () => null,
        (x) => x < SEA,
      );
      const drawn = layer.siteOf(site.id)!;
      const hashed = new Matrix4().compose(
        new Vector3(),
        new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yawOf(site.id)),
        new Vector3().setScalar(
          drawn.toBoard(new Vector3(1, 0, 0)).distanceTo(drawn.toBoard(new Vector3())),
        ),
      );
      const before = wetUnder(drawn.box, (point) => point.clone().applyMatrix4(hashed));
      const after = wetUnder(drawn.box, drawn.toBoard);
      expect(after, site.id).toBeLessThanOrEqual(0.12);
      // Near the threshold the layer's coarser grid may read either way.
      if (before > 0.15) turned++;
      if (before < 0.06) expect(after, site.id).toBeCloseTo(before, 9);
    }
    expect(turned).toBeGreaterThan(0);
  });
});

// `clusterFootprints` takes spacings already multiplied by `pieceScale.size` (`MaquetteLayer`), so
// the delivered scale reaches it as a shrunk geometry: a group must come out the same at 0.25.
describe.each([1, DRAWN_SHARE])('a group of sites drawn at %s of the common scale', (k) => {
  const spacing = S * k;
  const everywhere = { maxShift: 0.5, onLand: () => true };
  const at = (x: number) => [x * k, 0] as const;

  it('shrinks only the sites that touch another, not one a wide ring took in', () => {
    const line = Array.from({ length: 6 }, (_, i) => at(i * 0.1));
    const far = at(0.5 + 1.1 * S);
    const bounded = clusterFootprints([...line, far], spacing, spacing / 2, everywhere);
    line.forEach((_, i) => expect(bounded[i]!.scale).toBeLessThan(1));
    expect(bounded[6]).toEqual({ at: far, facing: 0, scale: 1 });
  });

  it('shrinks by the steps and no further: 1, 0.8 or 0.6, where a tighter bound keeps each at its point', () => {
    const line = Array.from({ length: 6 }, (_, i) => at(i * 0.1));
    for (const maxShift of [0.5, 0.05]) {
      const placed = clusterFootprints(line, spacing, spacing / 2, {
        maxShift,
        onLand: () => true,
      });
      for (const { scale } of placed)
        expect([1, 0.8, 0.6].some((c) => Math.abs(c - scale) < 1e-9)).toBe(true);
    }
    const tight = clusterFootprints(line, spacing, spacing / 2, {
      maxShift: 0.05,
      onLand: () => true,
    });
    tight.forEach(({ at: place, scale }, i) => {
      expect(scale).toBeCloseTo(0.6, 9);
      expect(place).toEqual(line[i]);
    });
  });
});
