import {
  Box3,
  type BufferGeometry,
  Group,
  InstancedMesh,
  type Material,
  Matrix4,
  Mesh,
  type Object3D,
  type Plane,
  Quaternion,
  type Raycaster,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { LonLat } from '@/domain/geo';
import type { StampWords } from '@/domain/ink-bursts';
import type { MapMotion } from '@/domain/map-motion';
import { COUNTRY_THICKNESS, type WorldFrame } from './frame';
import { nearWeight, sceneOf } from './figurines/figurine';
import { washedOf } from './standing';
import { pieceScale } from './piece-scale';
import { nearer, type PieceHit } from './piece-pick';
import type { AmbientLayer } from './ambience';
import { Smoke, type Plume } from './smoke';
import { groundFootprint, WorksDressing, type Works } from './works';

/**
 * **A factory at work smokes** (`table-etat-major.html`, `fac.userData.stacks`): a slow grey
 * thread from each chimney, leaning downwind. In board units at full near weight — a maquette is
 * `MAQUETTE_SPAN` wide.
 */
const FACTORY_SMOKE: Plume = {
  puffs: 9,
  life: 4.2,
  rise: 0.9,
  lean: 0.75,
  size: [0.1, 0.5],
  opacity: 0.5,
  color: '#6e685e',
};

/**
 * **What a maquette stands on and as** (ADR 0026 §1): a building, a surveyed installation or a
 * neutral objective, by its label's id — the label reads whether its plate gives way. A region
 * anchor waits for the regions to land, as the label does.
 */
export type StandingMaquette = {
  readonly id: string;
  readonly at: { readonly lonLat: LonLat } | { readonly regionId: string };
  readonly url: string;
  /** Known from a survey that has aged, or an emptied objective: a ghost of the building. */
  readonly washed: boolean;
  /** A site at work (mode chantier): its plan, its first level rising, or a raise. */
  readonly works?: Works;
  /** One of my producers at work: a thread of smoke rises from its chimneys. */
  readonly smoking?: boolean;
};

/**
 * **The widest side of a maquette's footprint, in board units.** Every model is brought to it:
 * a hangar and a well are the same size on the board, as their plates are on a mast. Half again
 * a tank's length (`FIGURINE_SCALE`), and about a French département — one building per region,
 * it stands on its own ground without spilling on the next. `@a-mesurer` on the board.
 */
export const MAQUETTE_SPAN = 0.7;

export const spanScale = (size: Vector3): number => MAQUETTE_SPAN / Math.max(size.x, size.z);

/** A fixed turn per id, so that a row of farms is not a parade, and a building never spins. */
export function yawOf(id: string): number {
  let hash = 2166136261;
  for (let k = 0; k < id.length; k++) hash = Math.imul(hash ^ id.charCodeAt(k), 16777619);
  return ((hash >>> 0) / 2 ** 32) * 2 * Math.PI;
}

type Part = { readonly geometry: BufferGeometry; readonly material: Material };

/**
 * **A sculpted scene flattened into one geometry per material**, every node's placement baked
 * in: a shipyard has some 270 meshes, and drawn one by one per exemplar it would cost as many
 * draw calls. Meshes whose attributes do not match stay apart.
 */
export function bakedParts(scene: Object3D): Part[] {
  scene.updateMatrixWorld(true);
  const groups = new Map<string, { material: Material; geometries: BufferGeometry[] }>();
  scene.traverse((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) return;
    // glTF gives one material per primitive, and the loader one mesh per primitive: an array
    // here is a file that broke the brief, and it keeps its plates rather than half its walls.
    if (Array.isArray(mesh.material)) throw new Error(`${mesh.name}: several materials`);
    const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    const key = [
      mesh.material.uuid,
      geometry.index === null,
      ...Object.keys(geometry.attributes).sort(),
    ].join();
    const group = groups.get(key) ?? { material: mesh.material, geometries: [] };
    group.geometries.push(geometry);
    groups.set(key, group);
  });
  return [...groups.values()].flatMap(({ material, geometries }) => {
    const merged = geometries.length === 1 ? geometries[0]! : mergeGeometries(geometries);
    return merged === null
      ? geometries.map((geometry) => ({ geometry, material }))
      : [{ geometry: merged, material }];
  });
}

type Model = {
  readonly parts: ReadonlyArray<Part>;
  readonly scale: number;
  /** Its bounds in its own units, ground at zero: how high a site rises, where its scaffold stands. */
  readonly box: Box3;
  /** Its `fx_smoke` markers in its own units — the top of its bounds when it has none. */
  readonly chimneys: ReadonlyArray<Vector3>;
};
const models = new Map<string, Promise<Model>>();
function modelOf(url: string): Promise<Model> {
  let model = models.get(url);
  if (!model) {
    model = sceneOf(url).then((scene) => {
      const parts = bakedParts(scene);
      const box = new Box3();
      for (const { geometry } of parts) {
        geometry.computeBoundingBox();
        box.union(geometry.boundingBox!);
      }
      const chimneys: Vector3[] = [];
      scene.traverse((node) => {
        if (node.name.startsWith('fx_smoke')) chimneys.push(node.getWorldPosition(new Vector3()));
      });
      if (chimneys.length === 0) {
        const top = box.getCenter(new Vector3());
        chimneys.push(top.setY(box.max.y));
      }
      return { parts, scale: spanScale(box.getSize(new Vector3())), box, chimneys };
    });
    // Kept failed: the same file fails again, and it is said once, not at every rebuild.
    model.catch((error: unknown) => console.error(`maquette ${url}`, error));
    models.set(url, model);
  }
  return model;
}

/**
 * **Where the maquettes of one group stand**: on a ring around the point they share, one span
 * apart, so that none stands in another. Offsets in board units, in the order given.
 */
export function ringOffsets(
  count: number,
  span = MAQUETTE_SPAN,
): Array<readonly [x: number, z: number]> {
  if (count < 2) return [[0, 0]];
  const radius = ringRadius(count, span);
  return Array.from({ length: count }, (_, k) => {
    const angle = (2 * Math.PI * k) / count;
    return [radius * Math.sin(angle), radius * Math.cos(angle)] as const;
  });
}

const ringRadius = (count: number, span: number): number =>
  count < 2 ? 0 : span / (2 * Math.sin(Math.PI / count));

type Point = readonly [x: number, z: number];

/**
 * **Maquettes clear one another on the board, not on the screen**: sites whose footprints — a
 * disc of radius `footprint`, half a span at least — overlap are gathered on a ring around their barycentre, and a ring that
 * grows into another site, or another ring, takes it in. Whether their labels fold into one
 * cartouche is the screen's affair: off screen, or before the labels touch, the maquettes
 * already do. Per site, in the order given (the caller sorts, so a ring keeps its order): where
 * it stands, and its offset from the ring's centre, where its garrison's foot is read from.
 */
export function clusterFootprints(
  points: ReadonlyArray<Point>,
  span: number,
  footprint = span / 2,
): Array<{ at: Point; ring: Point }> {
  type Cluster = { members: number[]; centre: Point; reach: number };
  const clusterOf = (members: number[]): Cluster => {
    const sum = members.reduce<Point>(
      ([x, z], k) => [x + points[k]![0], z + points[k]![1]],
      [0, 0],
    );
    return {
      members,
      centre: [sum[0] / members.length, sum[1] / members.length],
      reach: ringRadius(members.length, span) + Math.max(footprint, span / 2),
    };
  };
  const clusters = points.map((_, k) => clusterOf([k]));
  const overlapping = (): [number, number] | null => {
    for (let i = 0; i < clusters.length; i++)
      for (let j = i + 1; j < clusters.length; j++) {
        const [a, b] = [clusters[i]!, clusters[j]!];
        const gap = Math.hypot(a.centre[0] - b.centre[0], a.centre[1] - b.centre[1]);
        if (gap < a.reach + b.reach) return [i, j];
      }
    return null;
  };
  for (let pair = overlapping(); pair !== null; pair = overlapping()) {
    const [i, j] = pair;
    const members = [...clusters[i]!.members, ...clusters[j]!.members].sort((a, b) => a - b);
    clusters.splice(j, 1);
    clusters[i] = clusterOf(members);
  }
  const placed = new Array<{ at: Point; ring: Point }>(points.length);
  for (const { members, centre } of clusters) {
    const offsets = ringOffsets(members.length, span);
    members.forEach((k, rank) => {
      const ring = members.length < 2 ? ([0, 0] as const) : offsets[rank]!;
      placed[k] = {
        at: members.length < 2 ? points[k]! : [centre[0] + ring[0], centre[1] + ring[1]],
        ring,
      };
    });
  }
  return placed;
}

/**
 * **How far from its maquette a building's garrison stands**, in board units at full near
 * weight: a span off its centre, so that its figurines clear the corner of a square model turned
 * any way. `@a-mesurer` on the board.
 */
export const GARRISON_FOOT = 0.8;

/**
 * **Where a building's garrison stands, from the maquette's place on its ring**: outward from the
 * ring's centre, so that it never stands nearer another maquette than its own; a lone one has its
 * garrison in front, towards +z. Fixed by the ring, never by the camera — a pile that slid with
 * the view would read as moving. `facing` turns the pile's row to stand across that line.
 */
export function footOf(
  [x, z]: readonly [number, number],
  scale = 1,
): {
  x: number;
  z: number;
  facing: number;
} {
  const facing = Math.atan2(x, z);
  return {
    x: x + GARRISON_FOOT * scale * Math.sin(facing),
    z: z + GARRISON_FOOT * scale * Math.cos(facing),
    facing,
  };
}

type Placed = {
  readonly id: string;
  readonly ground: Vector3;
  /** The ground, or its place on the ring it clears its neighbours on. */
  readonly at: Vector3;
  /** Its offset from its ring's centre, where its garrison's foot is read from. */
  ring: readonly [number, number];
  readonly turn: Quaternion;
  /** Inside a replay's ground: it steps aside, and its plate with it. */
  cleared: boolean;
  near: number;
  readonly smoking: boolean;
  /** One per chimney once the model has landed, empty for a site that does not produce. */
  smokes: Smoke[];
  /** When it stood up under the eyes (`Date.now()`): it bounces once. */
  settledAt: number | null;
};

/** **A site at work**: its lot alone, dressed once its model has landed (`WorksDressing`). */
type AtWork = { readonly works: Works; dressing: WorksDressing | null };

/** The exemplars of one model in one ink, drawn as instances: one draw call per material. */
type Lot = {
  readonly items: Placed[];
  readonly group: Group;
  model: Model | null;
  meshes: InstancedMesh[];
  readonly atWork: AtWork | null;
};

const UP = new Vector3(0, 1, 0);
/** A site that stands under the eyes gives a little: up, down, still. */
const BOUNCE_MS = 450;
const matrix = new Matrix4();
const scale = new Vector3();
const placedBox = new Box3();

/**
 * **My buildings, the installations I surveyed and the neutral objectives, in maquettes up
 * close** — the twin of `StandingLayer` for what never moves. Full at the country level, gone
 * beyond the region fade: far away the label's plate is the building. A lot appears once its
 * model has landed and asks for its frame through `changed`; until then the plate stays.
 */
export class MaquetteLayer {
  readonly group = new Group();
  private lots = new Map<string, Lot>();
  private byId = new Map<string, { item: Placed; lot: Lot }>();
  private maquettes: ReadonlyArray<StandingMaquette> = [];
  private drawn = '';
  motion: MapMotion = 'full';

  constructor(
    private readonly frame: WorldFrame,
    private readonly groundOfRegion: (regionId: string) => Vector3 | null,
    private readonly changed: () => void,
    /** A site seen at work has stood up under the player's eyes: the board stamps it. */
    private readonly posed: (at: Vector3, words: StampWords) => void,
  ) {}

  /** Re-served at every step of any column: says whether anything changed, and only then
   *  rebuilds. */
  display(maquettes: ReadonlyArray<StandingMaquette>): boolean {
    const drawn = JSON.stringify(maquettes);
    if (drawn === this.drawn) return false;
    this.drawn = drawn;
    // Seen at work: stood up close, before the rebuild resets every near weight. A plan is
    // not seen standing up — it becomes a rising site, not a building.
    const seen = new Map(
      this.maquettes.flatMap((m) =>
        m.works?.stamp && (this.byId.get(m.id)?.item.near ?? 0) > 0
          ? [[m.id, m.works.stamp] as const]
          : [],
      ),
    );
    this.maquettes = maquettes;
    this.rebuild();
    for (const maquette of maquettes) {
      const stood = this.byId.get(maquette.id);
      const stamp = seen.get(maquette.id);
      if (stood === undefined || stamp === undefined || maquette.works) continue;
      this.posed(stood.item.at, stamp);
      if (this.motion === 'full') stood.item.settledAt = Date.now();
    }
    return true;
  }

  /** Every maquette set back on its point — the regions landed under the region anchors. A
   *  region anchor that has not landed stands nothing yet. */
  rebuild(): void {
    for (const lot of this.lots.values()) this.clear(lot);
    this.lots.clear();
    this.byId.clear();
    for (const maquette of this.maquettes) {
      const ground =
        'lonLat' in maquette.at
          ? this.frame.projectLonLat(maquette.at.lonLat, COUNTRY_THICKNESS)
          : this.groundOfRegion(maquette.at.regionId);
      if (ground === null) continue;
      ground.setY(COUNTRY_THICKNESS);
      const key = maquette.works
        ? `${maquette.url} works ${maquette.id}`
        : `${maquette.url} ${maquette.washed}`;
      let lot = this.lots.get(key);
      if (lot === undefined) {
        lot = {
          items: [],
          group: new Group(),
          model: null,
          meshes: [],
          atWork: maquette.works ? { works: maquette.works, dressing: null } : null,
        };
        this.lots.set(key, lot);
        this.group.add(lot.group);
        const landing = lot;
        // A model that fails to load leaves the plates; `modelOf` has said why.
        modelOf(maquette.url).then(
          (model) => this.landed(landing, model, maquette.washed),
          () => {},
        );
      }
      const item: Placed = {
        id: maquette.id,
        ground,
        at: ground.clone(),
        ring: [0, 0],
        turn: new Quaternion().setFromAxisAngle(UP, yawOf(maquette.id)),
        cleared: false,
        near: -1,
        // A site at work and a ghost of a survey do not produce.
        smoking: maquette.smoking === true && !maquette.works && !maquette.washed,
        smokes: [],
        settledAt: null,
      };
      lot.items.push(item);
      this.byId.set(maquette.id, { item, lot });
    }
    this.place();
  }

  /** The ring and every matrix follow the size: both are rebuilt on the next `orient`. */
  resize(): void {
    this.place();
  }

  private place(): void {
    const items = [...this.byId.values()]
      .map(({ item }) => item)
      .sort((a, b) => (a.id < b.id ? -1 : 1));
    const placed = clusterFootprints(
      items.map(({ ground }) => [ground.x, ground.z] as const),
      MAQUETTE_SPAN * pieceScale.buildings,
      // A lone site's garrison stands this far in front: its footprint reaches it.
      GARRISON_FOOT * pieceScale.buildings,
    );
    items.forEach((item, k) => {
      const { at, ring } = placed[k]!;
      item.ring = ring;
      item.at.set(at[0], item.ground.y, at[1]);
      item.near = -1;
    });
  }

  private landed(lot: Lot, model: Model, washed: boolean): void {
    if (![...this.lots.values()].includes(lot)) return;
    lot.model = model;
    const atWork = lot.atWork;
    if (atWork !== null) {
      atWork.dressing = new WorksDressing(
        atWork.works,
        model.box,
        groundFootprint(
          model.parts.map(({ geometry }) => geometry),
          model.box,
        ),
      );
      lot.group.add(atWork.dressing.object);
    }
    const cut = atWork?.dressing?.cut ?? null;
    // A plan in the queue has no volume yet.
    const parts = atWork?.works.phase === 'queued' ? [] : model.parts;
    lot.meshes = parts.map(({ geometry, material }) => {
      const mesh = new InstancedMesh(
        geometry,
        cut !== null ? cutOf(material, cut) : washed ? washedOf(material) : material,
        lot.items.length,
      );
      mesh.matrixAutoUpdate = false;
      // Instances spread over a continent: one sphere around them all would cull nothing.
      mesh.frustumCulled = false;
      return mesh;
    });
    if (lot.meshes.length > 0) lot.group.add(...lot.meshes);
    for (const item of lot.items) {
      if (!item.smoking) continue;
      item.smokes = model.chimneys.map(() => new Smoke(FACTORY_SMOKE));
      lot.group.add(...item.smokes.map((smoke) => smoke.object));
      // Its smoke is placed with its matrix: the next `orient` places both.
      item.near = -1;
    }
    this.changed();
  }

  private clear(lot: Lot): void {
    lot.group.removeFromParent();
    // Geometry and materials are the model's, shared by every lot drawn from it — but for a
    // rising site's cut copies, and its works' dressing.
    const cut = lot.atWork?.dressing?.cut ?? null;
    for (const mesh of lot.meshes) {
      mesh.dispose();
      if (cut !== null) (mesh.material as Material).dispose();
    }
    lot.atWork?.dressing?.dispose();
  }

  /** The world box of a maquette as drawn now — its model's bounds under its instance's placement. */
  boxOf(id: string): Box3 | null {
    const dressed = this.byId.get(id);
    const model = dressed?.lot.model;
    if (dressed === undefined || !model || dressed.item.near <= 0 || !dressed.lot.group.visible)
      return null;
    const { item } = dressed;
    matrix.compose(
      item.at,
      item.turn,
      scale.setScalar(item.near * model.scale * pieceScale.buildings),
    );
    placedBox.copy(model.box).applyMatrix4(matrix);
    // A rising site is drawn up to its cut only, a plan lies flat: the box the poster clears
    // stops there too.
    const atWork = dressed.lot.atWork;
    const cut = atWork?.dressing?.cut ?? null;
    if (atWork?.works.phase === 'queued') placedBox.max.y = placedBox.min.y;
    else if (cut !== null)
      placedBox.max.y = Math.max(placedBox.min.y, Math.min(placedBox.max.y, cut.constant));
    return placedBox;
  }

  /** The maquette under `ray`, by the instance it hits: each is tried by its bounds first. */
  under(ray: Raycaster): PieceHit | null {
    let best: PieceHit | null = null;
    for (const lot of this.lots.values()) {
      if (!lot.group.visible) continue;
      const dressing = lot.atWork?.dressing ?? null;
      const plan = dressing?.pick(ray) ?? null;
      const site = lot.items[0];
      if (plan !== null && site !== undefined && site.near > 0 && !site.cleared)
        best = nearer(best, { id: site.id, distance: plan });
      const cut = dressing?.cut ?? null;
      for (const hit of ray.intersectObjects(lot.meshes, false)) {
        const item = hit.instanceId === undefined ? undefined : lot.items[hit.instanceId];
        // A rising site is drawn up to its cut: above it there is nothing to point at.
        const built = cut === null || hit.point.y <= cut.constant;
        if (item !== undefined && item.near > 0 && !item.cleared && built)
          best = nearer(best, { id: item.id, distance: hit.distance });
      }
    }
    return best;
  }

  /** Its maquette stands, so its plate gives way — not while a replay has cleared it away. */
  isDressed(id: string): boolean {
    const dressed = this.byId.get(id);
    return dressed !== undefined && dressed.lot.model !== null && !dressed.item.cleared;
  }

  /**
   * **Where the garrison of a maquette stands**, `null` while its model has not landed — a pile
   * beside a plate would stand beside nothing — or while a replay has cleared it away. Read at every frame, so that a ring or a region
   * that lands carries the pile along. The step is at full near weight: the caller scales it as
   * the maquette is scaled.
   */
  garrisonAt(id: string): { at: Vector3; step: readonly [number, number]; facing: number } | null {
    const dressed = this.byId.get(id);
    if (dressed === undefined || dressed.lot.model === null || dressed.item.cleared) return null;
    const { at, ring } = dressed.item;
    const foot = footOf(ring, pieceScale.buildings);
    return { at, step: [foot.x - ring[0], foot.z - ring[1]], facing: foot.facing };
  }

  /** `cleared` is a replay's ground: what stands inside it steps aside while it plays. */
  orient(
    cameraPosition: Vector3,
    cleared: { center: Vector3; reach: number } | null,
    now: number,
  ): void {
    for (const lot of this.lots.values()) {
      if (lot.model === null) continue;
      let moved = false;
      lot.items.forEach((item, k) => {
        item.cleared = cleared !== null && item.at.distanceTo(cleared.center) < cleared.reach;
        const near = item.cleared
          ? 0
          : Math.round(nearWeight(item.at.distanceTo(cameraPosition)) * 100) / 100;
        const bounce = item.settledAt === null ? null : bounceAt(now - item.settledAt);
        // Its last bounce sets it back on its feet: one more placement, then still.
        if (item.settledAt !== null && bounce === null) item.settledAt = null;
        if (near === item.near && item.settledAt === null && bounce === null) return;
        item.near = near;
        moved = true;
        const size = near * lot.model!.scale * pieceScale.buildings;
        matrix.compose(item.at, item.turn, scale.set(size, size * (bounce ?? 1), size));
        for (const mesh of lot.meshes) mesh.setMatrixAt(k, matrix);
        item.smokes.forEach((smoke, c) => {
          smoke.object.position.copy(lot.model!.chimneys[c]!).applyMatrix4(matrix);
          smoke.object.scale.setScalar(near * pieceScale.buildings);
        });
      });
      const site = lot.items[0];
      if (lot.atWork?.dressing && site !== undefined)
        lot.atWork.dressing.place(
          site.at,
          site.turn,
          Math.max(site.near, 0) * lot.model.scale * pieceScale.buildings,
          now,
        );
      if (!moved) continue;
      for (const mesh of lot.meshes) {
        mesh.instanceMatrix.needsUpdate = true;
        // The pointer's test reads the bounds first: they must follow the instances.
        mesh.computeBoundingSphere();
      }
      lot.group.visible = lot.items.some((item) => item.near > 0);
    }
  }

  /**
   * **The factories' smoke, an ambience** (`ambience.ts`): it loops for good, so it steps at its
   * own low beat rather than holding the board at sixty frames. Idle when no smoking maquette
   * stands close; still at reduced motion, gone at cut motion.
   */
  readonly smoke: AmbientLayer = {
    fx: 'smoke',
    hz: 8,
    idle: () =>
      ![...this.byId.values()].some(({ item }) => item.smokes.length > 0 && item.near > 0),
    frame: (time, motion) => {
      for (const { item } of this.byId.values())
        for (const smoke of item.smokes) {
          smoke.object.visible = item.near > 0 && motion !== 'off';
          if (smoke.object.visible) smoke.frame(time);
        }
    },
  };

  /** A site stood up under the eyes is bouncing: the board keeps drawing until it is still. */
  get settling(): boolean {
    return [...this.byId.values()].some(({ item }) => item.settledAt !== null);
  }

  dispose(): void {
    for (const lot of this.lots.values()) this.clear(lot);
    this.lots.clear();
    this.byId.clear();
    this.group.removeFromParent();
  }
}

/** Up a tenth, down a little, still: the vertical give of a site that just stood up. */
const bounceAt = (elapsed: number): number | null =>
  elapsed >= BOUNCE_MS
    ? null
    : 1 + 0.1 * Math.sin((2 * Math.PI * elapsed) / BOUNCE_MS) * (1 - elapsed / BOUNCE_MS);

/** A rising site's own copy of a material, cut above the work — its shadow with it. */
function cutOf(material: Material, cut: Plane): Material {
  const copy = material.clone();
  copy.clippingPlanes = [cut];
  copy.clipShadows = true;
  return copy;
}
