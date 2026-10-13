import {
  Box3,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  type Material,
  Matrix4,
  Mesh,
  type Object3D,
  Plane,
  Quaternion,
  type Raycaster,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { riseOf } from '@/domain/construction';
import type { LonLat } from '@/domain/geo';
import { COUNTRY_THICKNESS, type WorldFrame } from './frame';
import { nearWeight, sceneOf } from './figurines/figurine';
import { PALETTE } from './palette';
import { washedOf } from './standing';
import { pieceScale } from './piece-scale';
import { nearer, type PieceHit } from './piece-pick';

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
  /** A first level under the crane: it rises from the ground with its work (`riseOf`). */
  readonly rising?: { readonly finishesAt: number; readonly minutes: number };
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
      return { parts, scale: spanScale(box.getSize(new Vector3())), box };
    });
    // Kept failed: the same file fails again, and it is said once, not at every rebuild.
    model.catch((error: unknown) => console.error(`maquette ${url}`, error));
    models.set(url, model);
  }
  return model;
}

/**
 * **Where the maquettes of one folded group stand** (« N sites »): on a ring around the mast
 * they share, one span apart, so that none stands in another. Offsets in board units, in the
 * order given — the caller sorts, so a group keeps its order from one fold to the next.
 */
export function ringOffsets(count: number, scale = 1): Array<readonly [x: number, z: number]> {
  if (count < 2) return [[0, 0]];
  const radius = (MAQUETTE_SPAN * scale) / (2 * Math.sin(Math.PI / count));
  return Array.from({ length: count }, (_, k) => {
    const angle = (2 * Math.PI * k) / count;
    return [radius * Math.sin(angle), radius * Math.cos(angle)] as const;
  });
}

/**
 * **How far from its maquette a building's garrison stands**, in board units at full near
 * weight: a span off its centre, so that its figurines clear the corner of a square model turned
 * any way. `@a-mesurer` on the board.
 */
export const GARRISON_FOOT = 0.8;

/**
 * **Where a building's garrison stands, from the maquette's place on its ring**: outward from the
 * mast, so that it never stands nearer another maquette than its own; a lone maquette has its
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
  /** The ground, or its place on its group's ring. */
  readonly at: Vector3;
  /** Its offset from the ring's mast, where its garrison's foot is read from. */
  ring: readonly [number, number];
  readonly turn: Quaternion;
  /** Inside a replay's ground: it steps aside, and its plate with it. */
  cleared: boolean;
  near: number;
};

/**
 * **A site rising**: its lot alone, its materials cut by a plane that climbs with the work —
 * the shadow map honours the same cut (`clipShadows`) — and a scaffold inked at the cut.
 */
type Rising = {
  readonly finishesAt: number;
  readonly minutes: number;
  readonly cut: Plane;
  scaffold: LineSegments | null;
};

/** The exemplars of one model in one ink, drawn as instances: one draw call per material. */
type Lot = {
  readonly items: Placed[];
  readonly group: Group;
  model: Model | null;
  meshes: InstancedMesh[];
  readonly rising: Rising | null;
};

const UP = new Vector3(0, 1, 0);
const DOWN = new Vector3(0, -1, 0);
const SCAFFOLD_INK = new LineBasicMaterial({ color: PALETTE.border });

/** Four posts from the ground to a height of one and the ring that ties them at the top, around
 *  the footprint a little wide: the lot scales it up to the cut. */
function scaffoldOf(box: Box3): LineSegments {
  const [x0, x1, z0, z1] = [box.min.x, box.max.x, box.min.z, box.max.z].map((v) => v * 1.08) as [
    number,
    number,
    number,
    number,
  ];
  const corners = [
    [x0, z0],
    [x1, z0],
    [x1, z1],
    [x0, z1],
  ] as const;
  const points = corners.flatMap(([x, z], k) => {
    const [nx, nz] = corners[(k + 1) % 4]!;
    return [x, 0, z, x, 1, z, x, 1, z, nx, 1, nz];
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(points, 3));
  const scaffold = new LineSegments(geometry, SCAFFOLD_INK);
  scaffold.matrixAutoUpdate = false;
  return scaffold;
}
const matrix = new Matrix4();
const scale = new Vector3();

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
  private gathered = '';
  private groups: ReadonlyArray<ReadonlyArray<string>> = [];

  constructor(
    private readonly frame: WorldFrame,
    private readonly groundOfRegion: (regionId: string) => Vector3 | null,
    private readonly changed: () => void,
    /** A site seen rising has stood up under the player's eyes: the board stamps it. */
    private readonly posed: (at: Vector3) => void,
  ) {}

  /** Re-served at every step of any column: says whether anything changed, and only then
   *  rebuilds. */
  display(maquettes: ReadonlyArray<StandingMaquette>): boolean {
    const drawn = JSON.stringify(maquettes);
    if (drawn === this.drawn) return false;
    this.drawn = drawn;
    // Seen rising: stood up close, before the rebuild resets every near weight.
    const seen = new Set(
      this.maquettes
        .filter((m) => m.rising && (this.byId.get(m.id)?.item.near ?? 0) > 0)
        .map((m) => m.id),
    );
    this.maquettes = maquettes;
    this.rebuild();
    for (const maquette of maquettes) {
      const stood = this.byId.get(maquette.id);
      if (stood !== undefined && seen.has(maquette.id) && !maquette.rising)
        this.posed(stood.item.at);
    }
    return true;
  }

  /**
   * **The labels folded into one cartouche** (« N sites »), lead first: their maquettes gather
   * on a ring around the lead's mast. Says whether anything moved — the labels are measured
   * every second, and a frame asked each time would keep the board rendering.
   */
  gather(groups: ReadonlyArray<ReadonlyArray<string>>): boolean {
    const gathered = JSON.stringify(groups);
    if (gathered === this.gathered) return false;
    this.gathered = gathered;
    this.groups = groups;
    this.place();
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
      const key = maquette.rising
        ? `${maquette.url} rising ${maquette.id}`
        : `${maquette.url} ${maquette.washed}`;
      let lot = this.lots.get(key);
      if (lot === undefined) {
        lot = {
          items: [],
          group: new Group(),
          model: null,
          meshes: [],
          rising: maquette.rising
            ? { ...maquette.rising, cut: new Plane(DOWN, 0), scaffold: null }
            : null,
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
    for (const { item } of this.byId.values()) {
      item.at.copy(item.ground);
      item.ring = [0, 0];
    }
    for (const members of this.groups) {
      const lead = this.byId.get(members[0] ?? '')?.item;
      if (lead === undefined) continue;
      const standing = members.filter((id) => this.byId.has(id)).sort();
      const offsets = ringOffsets(standing.length, pieceScale.buildings);
      standing.forEach((id, k) => {
        const item = this.byId.get(id)!.item;
        item.ring = offsets[k]!;
        item.at.set(lead.ground.x + item.ring[0], lead.ground.y, lead.ground.z + item.ring[1]);
      });
    }
    for (const { item } of this.byId.values()) item.near = -1;
  }

  private landed(lot: Lot, model: Model, washed: boolean): void {
    if (![...this.lots.values()].includes(lot)) return;
    lot.model = model;
    const rising = lot.rising;
    lot.meshes = model.parts.map(({ geometry, material }) => {
      const mesh = new InstancedMesh(
        geometry,
        rising !== null ? cutOf(material, rising.cut) : washed ? washedOf(material) : material,
        lot.items.length,
      );
      mesh.matrixAutoUpdate = false;
      // Instances spread over a continent: one sphere around them all would cull nothing.
      mesh.frustumCulled = false;
      return mesh;
    });
    lot.group.add(...lot.meshes);
    if (rising !== null) {
      rising.scaffold = scaffoldOf(model.box);
      lot.group.add(rising.scaffold);
    }
    this.changed();
  }

  private clear(lot: Lot): void {
    lot.group.removeFromParent();
    // Geometry and materials are the model's, shared by every lot drawn from it — but for a
    // rising site's cut copies, and its scaffold's lines.
    for (const mesh of lot.meshes) {
      mesh.dispose();
      if (lot.rising !== null) (mesh.material as Material).dispose();
    }
    lot.rising?.scaffold?.geometry.dispose();
  }

  /** The maquette under `ray`, by the instance it hits: each is tried by its bounds first. */
  under(ray: Raycaster): PieceHit | null {
    let best: PieceHit | null = null;
    for (const lot of this.lots.values()) {
      if (!lot.group.visible) continue;
      for (const hit of ray.intersectObjects(lot.meshes, false)) {
        const item = hit.instanceId === undefined ? undefined : lot.items[hit.instanceId];
        // A rising site is drawn up to its cut: above it there is nothing to point at.
        const built = lot.rising === null || hit.point.y <= lot.rising.cut.constant;
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
   * beside a plate would stand beside nothing — or while a replay has cleared it away. Read at every frame, so that a fold or a region
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
        if (near === item.near) return;
        item.near = near;
        moved = true;
        matrix.compose(
          item.at,
          item.turn,
          scale.setScalar(near * lot.model!.scale * pieceScale.buildings),
        );
        for (const mesh of lot.meshes) mesh.setMatrixAt(k, matrix);
      });
      if (lot.rising !== null) this.rise(lot.rising, lot.items[0]!, lot.model, now);
      if (!moved) continue;
      for (const mesh of lot.meshes) {
        mesh.instanceMatrix.needsUpdate = true;
        // The pointer's test reads the bounds first: they must follow the instances.
        mesh.computeBoundingSphere();
      }
      lot.group.visible = lot.items.some((item) => item.near > 0);
    }
  }

  /** Slow — a first level lasts tens of minutes: the board's heartbeat moves it enough, and no
   *  frame is ever asked for it. */
  private rise(rising: Rising, item: Placed, model: Model, now: number): void {
    const share = riseOf((rising.finishesAt - now) / 60_000, rising.minutes);
    const height =
      model.box.max.y * model.scale * pieceScale.buildings * Math.max(item.near, 0) * share;
    rising.cut.constant = item.at.y + height;
    const scaffold = rising.scaffold;
    if (scaffold === null) return;
    scaffold.visible = share < 1 && item.near > 0;
    const width = Math.max(item.near, 0) * model.scale * pieceScale.buildings;
    scaffold.matrix.compose(item.at, item.turn, scale.set(width, Math.max(height, 1e-4), width));
  }

  dispose(): void {
    for (const lot of this.lots.values()) this.clear(lot);
    this.lots.clear();
    this.byId.clear();
    this.group.removeFromParent();
  }
}

/** A rising site's own copy of a material, cut above the work — its shadow with it. */
function cutOf(material: Material, cut: Plane): Material {
  const copy = material.clone();
  copy.clippingPlanes = [cut];
  copy.clipShadows = true;
  return copy;
}
