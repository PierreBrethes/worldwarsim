import { CircleGeometry, Group, Mesh, MeshBasicMaterial, type Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Nation, UnitRole } from '@/domain/ids';
import { isNation } from '@/domain/nations';
import { DOMAIN_BY_ROLE, type UnitTier } from '@/domain/troops';
import { FIGURINE_FILES } from '@/emblems/figurines/manifest';
import { REGIONS_FULL_DISTANCE, REGIONS_GONE_DISTANCE } from '../regions';
import { squadOf } from './infantry';

/**
 * Model units to board units. The brief sizes a tank at 2.6, so it stands about two thirds of
 * a board unit long: a piece among the regions and the masts, not a monument over them — at
 * 0.4 a squad stood taller than a département at the closest zoom. `@a-mesurer` on the board.
 */
export const FIGURINE_SCALE = 0.26;

/**
 * **How much figurine, rather than plate, a pawn wears at this camera distance**: 1 at the
 * country level and closer, 0 beyond the region fade, eased between. One distance says « we
 * are down at the country » for both layers (ADR 0026 §3).
 */
export function nearWeight(distance: number): number {
  const t = (REGIONS_GONE_DISTANCE - distance) / (REGIONS_GONE_DISTANCE - REGIONS_FULL_DISTANCE);
  const k = Math.min(1, Math.max(0, t));
  return k * k * (3 - 2 * k);
}

export type Figurine = {
  /** Origin on the ground at the pawn's point, front towards +z, already at board scale. */
  readonly object: Group;
  /** Settles once every sculpted file has landed in `object` — a piece that stands still asks
   *  for its frame then, where a flowing pawn would just show it. Rejects when a file fails. */
  readonly ready: Promise<void>;
  /** Turns whatever spins on the model (`prop*`), and nothing else. */
  spin(elapsedSeconds: number): void;
  /** Turns its back to the eye rather than its front to the road: an enemy block (ADR 0026 §4). */
  readonly facesEye?: boolean;
};

const loader = new GLTFLoader();
const scenes = new Map<string, Promise<Object3D>>();
/** One load per file, shared by every figurine and maquette drawn from it. */
export function sceneOf(url: string): Promise<Object3D> {
  let scene = scenes.get(url);
  if (!scene) {
    scene = loader.loadAsync(url).then((gltf) => gltf.scene);
    scenes.set(url, scene);
  }
  return scene;
}

function fileOf(nation: Nation, role: UnitRole, tier: UnitTier): string | null {
  const entry = FIGURINE_FILES[nation]?.[role];
  if (entry === undefined) return null;
  return typeof entry === 'string' ? entry : (entry[tier - 1] ?? null);
}

/**
 * **A group's figurine for a nation, or `null` when there is none** — the caller keeps its plate
 * or silhouette, as it does for a missing plate. `marks` are the figures that stand, front first
 * (`pilePieces`): one man each for infantry, the first mark's model for any other role. One
 * mark without a file and the whole answer is `null` — no figurine rather than the wrong one.
 * Files load in the background; `ready` says when they have landed. Geometry and materials are shared between figurines of the same
 * file: nothing here is the caller's to dispose.
 */
export function figurineFor(
  nation: string | null,
  role: UnitRole,
  marks: ReadonlyArray<UnitTier>,
): Figurine | null {
  if (nation === null || !isNation(nation) || marks.length === 0) return null;
  const files = (role === 'infantry' ? marks : marks.slice(0, 1)).map((tier) =>
    fileOf(nation, role, tier),
  );
  if (files.some((file) => file === null)) return null;

  const object = new Group();
  const model = new Group();
  model.scale.setScalar(FIGURINE_SCALE);
  object.add(model);
  if (DOMAIN_BY_ROLE[role] !== 'air') object.add(contactShadow());

  const ready = Promise.all(files.map((file) => sceneOf(file!))).then(
    (scenes) => {
      const makers = scenes.map((scene, k) => ({
        make: () => scene.clone(true),
        marches: marks[k] === 1,
      }));
      model.add(role === 'infantry' ? squadOf(makers) : makers[0]!.make());
    },
    (error: unknown) => {
      console.error(`figurine ${nation}/${role}`, error);
      throw error;
    },
  );
  // A moving pawn never waits on `ready`: its failure is logged above, not left unhandled.
  ready.catch(() => undefined);

  const spinning: Object3D[] = [];
  return {
    object,
    ready,
    spin(elapsedSeconds) {
      // Only the hub turns: its blades and cone ride along, and turning them too would twist
      // each on its own axis.
      if (spinning.length === 0)
        model.traverse(
          (part) =>
            part.name.startsWith('prop') &&
            !part.parent?.name.startsWith('prop') &&
            spinning.push(part),
        );
      for (const part of spinning) part.rotation.z += elapsedSeconds * 40;
    },
  };
}

/**
 * The lamp's shadow falls aside (`lamp.ts`); what sets the piece down right under its feet is
 * this soft disc, kept faint so the two do not double. Two discs rather than a texture, so it
 * builds without a canvas.
 */
const SHADOW_INNER = new MeshBasicMaterial({
  color: '#1a120a',
  transparent: true,
  opacity: 0.12,
  depthWrite: false,
});
const SHADOW_OUTER = new MeshBasicMaterial({
  color: '#1a120a',
  transparent: true,
  opacity: 0.06,
  depthWrite: false,
});
const SHADOW_DISCS = (
  [
    [0.32, SHADOW_INNER],
    [0.48, SHADOW_OUTER],
  ] as const
).map(([radius, material]) => [new CircleGeometry(radius, 24), material] as const);
export function contactShadow(): Group {
  const shadow = new Group();
  for (const [geometry, material] of SHADOW_DISCS) {
    const disc = new Mesh(geometry, material);
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.004;
    shadow.add(disc);
  }
  return shadow;
}
