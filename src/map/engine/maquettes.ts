import {
  Box3,
  type BufferGeometry,
  Group,
  InstancedMesh,
  type Material,
  Matrix4,
  Mesh,
  type Object3D,
  Quaternion,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { LonLat } from '@/domain/geo';
import { COUNTRY_THICKNESS, type WorldFrame } from './frame';
import { nearWeight, sceneOf } from './figurines/figurine';
import { washedOf } from './standing';

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

type Model = { readonly parts: ReadonlyArray<Part>; readonly scale: number };
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
      return { parts, scale: spanScale(box.getSize(new Vector3())) };
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
export function ringOffsets(count: number): Array<readonly [x: number, z: number]> {
  if (count < 2) return [[0, 0]];
  const radius = MAQUETTE_SPAN / (2 * Math.sin(Math.PI / count));
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
export function footOf([x, z]: readonly [number, number]): {
  x: number;
  z: number;
  facing: number;
} {
  const facing = Math.atan2(x, z);
  return {
    x: x + GARRISON_FOOT * Math.sin(facing),
    z: z + GARRISON_FOOT * Math.cos(facing),
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

/** The exemplars of one model in one ink, drawn as instances: one draw call per material. */
type Lot = {
  readonly items: Placed[];
  readonly group: Group;
  model: Model | null;
  meshes: InstancedMesh[];
};

const UP = new Vector3(0, 1, 0);
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
  ) {}

  /** Re-served at every step of any column: says whether anything changed, and only then
   *  rebuilds. */
  display(maquettes: ReadonlyArray<StandingMaquette>): boolean {
    const drawn = JSON.stringify(maquettes);
    if (drawn === this.drawn) return false;
    this.drawn = drawn;
    this.maquettes = maquettes;
    this.rebuild();
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
      const key = `${maquette.url} ${maquette.washed}`;
      let lot = this.lots.get(key);
      if (lot === undefined) {
        lot = { items: [], group: new Group(), model: null, meshes: [] };
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

  private place(): void {
    for (const { item } of this.byId.values()) {
      item.at.copy(item.ground);
      item.ring = [0, 0];
    }
    for (const members of this.groups) {
      const lead = this.byId.get(members[0] ?? '')?.item;
      if (lead === undefined) continue;
      const standing = members.filter((id) => this.byId.has(id)).sort();
      const offsets = ringOffsets(standing.length);
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
    lot.meshes = model.parts.map(({ geometry, material }) => {
      const mesh = new InstancedMesh(
        geometry,
        washed ? washedOf(material) : material,
        lot.items.length,
      );
      mesh.matrixAutoUpdate = false;
      // Instances spread over a continent: one sphere around them all would cull nothing.
      mesh.frustumCulled = false;
      return mesh;
    });
    lot.group.add(...lot.meshes);
    this.changed();
  }

  private clear(lot: Lot): void {
    lot.group.removeFromParent();
    // Geometry and materials are the model's, shared by every lot drawn from it.
    for (const mesh of lot.meshes) mesh.dispose();
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
    const foot = footOf(ring);
    return { at, step: [foot.x - ring[0], foot.z - ring[1]], facing: foot.facing };
  }

  /** `cleared` is a replay's ground: what stands inside it steps aside while it plays. */
  orient(cameraPosition: Vector3, cleared: { center: Vector3; reach: number } | null): void {
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
        matrix.compose(item.at, item.turn, scale.setScalar(near * lot.model!.scale));
        for (const mesh of lot.meshes) mesh.setMatrixAt(k, matrix);
      });
      if (!moved) continue;
      for (const mesh of lot.meshes) mesh.instanceMatrix.needsUpdate = true;
      lot.group.visible = lot.items.some((item) => item.near > 0);
    }
  }

  dispose(): void {
    for (const lot of this.lots.values()) this.clear(lot);
    this.lots.clear();
    this.byId.clear();
    this.group.removeFromParent();
  }
}
