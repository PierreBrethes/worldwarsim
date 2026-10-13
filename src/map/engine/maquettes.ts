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
    if (!mesh.isMesh || Array.isArray(mesh.material)) return;
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
    models.set(url, model);
  }
  return model;
}

type Placed = {
  readonly id: string;
  readonly position: Vector3 | null;
  readonly turn: Quaternion;
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
const ORIGIN = new Vector3();

/**
 * **My buildings, the installations I surveyed and the neutral objectives, in maquettes up
 * close** — the twin of `StandingLayer` for what never moves. Full at the country level, gone
 * beyond the region fade: far away the label's plate is the building. A lot appears once its
 * model has landed and asks for its frame through `changed`; until then the plate stays.
 */
export class MaquetteLayer {
  readonly group = new Group();
  private lots = new Map<string, Lot>();
  private maquettes: ReadonlyArray<StandingMaquette> = [];
  private drawn = '';

  constructor(
    private readonly frame: WorldFrame,
    private readonly groundOfRegion: (regionId: string) => Vector3 | null,
    private readonly changed: () => void,
  ) {}

  /** Re-served at every step of any column: nothing is rebuilt unless what stands changed. */
  display(maquettes: ReadonlyArray<StandingMaquette>): void {
    const drawn = JSON.stringify(maquettes);
    if (drawn === this.drawn) return;
    this.drawn = drawn;
    this.maquettes = maquettes;
    this.rebuild();
  }

  /** Every maquette set back on its point — the regions landed under the region anchors. */
  rebuild(): void {
    for (const lot of this.lots.values()) this.clear(lot);
    this.lots.clear();
    for (const maquette of this.maquettes) {
      const key = `${maquette.url} ${maquette.washed}`;
      let lot = this.lots.get(key);
      if (lot === undefined) {
        lot = { items: [], group: new Group(), model: null, meshes: [] };
        this.lots.set(key, lot);
        this.group.add(lot.group);
        this.load(lot, maquette.url, maquette.washed);
      }
      const position =
        'lonLat' in maquette.at
          ? this.frame.projectLonLat(maquette.at.lonLat, COUNTRY_THICKNESS)
          : this.groundOfRegion(maquette.at.regionId);
      position?.setY(COUNTRY_THICKNESS);
      lot.items.push({
        id: maquette.id,
        position,
        turn: new Quaternion().setFromAxisAngle(UP, yawOf(maquette.id)),
        near: -1,
      });
    }
  }

  private load(lot: Lot, url: string, washed: boolean): void {
    // A model that fails to load leaves the plates.
    modelOf(url).then(
      (model) => {
        if (![...this.lots.values()].includes(lot)) return;
        lot.model = model;
        lot.meshes = model.parts.map(({ geometry, material }) => {
          const mesh = new InstancedMesh(
            geometry,
            washed ? washedOf(material) : material,
            lot.items.length,
          );
          mesh.matrixAutoUpdate = false;
          return mesh;
        });
        lot.group.add(...lot.meshes);
        this.changed();
      },
      (error: unknown) => console.error(`maquette ${url}`, error),
    );
  }

  private clear(lot: Lot): void {
    lot.group.removeFromParent();
    // Geometry and materials are the model's, shared by every lot drawn from it.
    for (const mesh of lot.meshes) mesh.dispose();
  }

  isDressed(id: string): boolean {
    for (const lot of this.lots.values())
      if (lot.model !== null && lot.items.some((item) => item.id === id && item.position !== null))
        return true;
    return false;
  }

  /** `cleared` is a replay's ground: what stands inside it steps aside while it plays. */
  orient(cameraPosition: Vector3, cleared: { center: Vector3; reach: number } | null): void {
    for (const lot of this.lots.values()) {
      if (lot.model === null) continue;
      let moved = false;
      lot.items.forEach((item, k) => {
        const near =
          item.position === null ||
          (cleared !== null && item.position.distanceTo(cleared.center) < cleared.reach)
            ? 0
            : Math.round(nearWeight(item.position.distanceTo(cameraPosition)) * 100) / 100;
        if (near === item.near) return;
        item.near = near;
        moved = true;
        matrix.compose(
          item.position ?? ORIGIN,
          item.turn,
          scale.setScalar(near * lot.model!.scale),
        );
        for (const mesh of lot.meshes) mesh.setMatrixAt(k, matrix);
      });
      if (!moved) continue;
      for (const mesh of lot.meshes) {
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
      }
      lot.group.visible = lot.items.some((item) => item.near > 0);
    }
  }

  dispose(): void {
    for (const lot of this.lots.values()) this.clear(lot);
    this.lots.clear();
    this.group.removeFromParent();
  }
}
