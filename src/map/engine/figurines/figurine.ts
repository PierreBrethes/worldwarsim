import { CircleGeometry, Group, Mesh, MeshBasicMaterial, type Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Nation, UnitRole } from '@/domain/ids';
import { isNation } from '@/domain/nations';
import { DOMAIN_BY_ROLE, type UnitTier } from '@/domain/troops';
import { FIGURINE_FILES } from '@/emblems/figurines/manifest';
import { REGIONS_FULL_DISTANCE, REGIONS_GONE_DISTANCE } from '../regions';
import { frenchSoldier, squadOf } from './infantry';

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
   *  for its frame then, where a flowing pawn would just show it. */
  readonly ready: Promise<void>;
  /** Turns whatever spins on the model (`prop*`), and nothing else. */
  spin(elapsedSeconds: number): void;
};

/** What the engine codes itself while a role has no sculpted file: one model — a soldier, for
 *  infantry, which `squadOf` stands as many times as there are figures. */
const CODED: Readonly<Partial<Record<string, Partial<Record<UnitRole, () => Object3D>>>>> = {
  france: { infantry: frenchSoldier },
};

const loader = new GLTFLoader();
const scenes = new Map<string, Promise<Object3D>>();
function sceneOf(url: string): Promise<Object3D> {
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

type Maker = () => Object3D;

/** One mark's model: the sculpted file, loading, or the coded stand-in, or `null`. */
function makerOf(nation: Nation, role: UnitRole, tier: UnitTier): Maker | Promise<Maker> | null {
  const file = fileOf(nation, role, tier);
  if (file !== null) return sceneOf(file).then((scene) => () => scene.clone(true));
  // The coded geometry is a mark-1 stand-in: a mark 2 shown in mark-1 kit would show a mark the pile does not hold.
  return (tier === 1 ? CODED[nation]?.[role] : undefined) ?? null;
}

/**
 * **A group's figurine for a nation, or `null` when there is none** — the caller keeps its plate
 * or silhouette, as it does for a missing plate. `marks` are the figures that stand, front first
 * (`pilePieces`): one man each for infantry, the first mark's model for any other role. One
 * mark with neither file nor code and the whole answer is `null` — no figurine rather than the
 * wrong one. A sculpted file wins over coded geometry and loads in the background; `ready`
 * says when it has landed. Geometry and materials are shared between figurines of the same
 * file: nothing here is the caller's to dispose.
 */
export function figurineFor(
  nation: string | null,
  role: UnitRole,
  marks: ReadonlyArray<UnitTier>,
): Figurine | null {
  if (nation === null || !isNation(nation) || marks.length === 0) return null;
  const makers = (role === 'infantry' ? marks : marks.slice(0, 1)).map((tier) =>
    makerOf(nation, role, tier),
  );
  if (makers.some((maker) => maker === null)) return null;

  const object = new Group();
  const model = new Group();
  model.scale.setScalar(FIGURINE_SCALE);
  object.add(model);
  if (DOMAIN_BY_ROLE[role] !== 'air') object.add(contactShadow());

  const stand = (ready: ReadonlyArray<Maker>) =>
    model.add(role === 'infantry' ? squadOf(ready) : ready[0]!());
  const coded = makers.filter((maker): maker is Maker => typeof maker === 'function');
  let ready = Promise.resolve();
  if (coded.length === makers.length) stand(coded);
  else
    ready = Promise.all(makers).then(
      (loaded) => void stand(loaded as Maker[]),
      (error: unknown) => console.error(`figurine ${nation}/${role}`, error),
    );

  const spinning: Object3D[] = [];
  return {
    object,
    ready,
    spin(elapsedSeconds) {
      if (spinning.length === 0)
        model.traverse((part) => part.name.startsWith('prop') && spinning.push(part));
      for (const part of spinning) part.rotation.z += elapsedSeconds * 40;
    },
  };
}

/**
 * The board casts no shadows: a soft dark disc under the piece is what sets it down. Two
 * discs rather than a texture, so it builds without a canvas.
 */
const SHADOW_INNER = new MeshBasicMaterial({
  color: '#1a120a',
  transparent: true,
  opacity: 0.22,
  depthWrite: false,
});
const SHADOW_OUTER = new MeshBasicMaterial({
  color: '#1a120a',
  transparent: true,
  opacity: 0.12,
  depthWrite: false,
});
function contactShadow(): Group {
  const shadow = new Group();
  for (const [radius, material] of [
    [0.32, SHADOW_INNER],
    [0.48, SHADOW_OUTER],
  ] as const) {
    const disc = new Mesh(new CircleGeometry(radius, 24), material);
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.004;
    shadow.add(disc);
  }
  return shadow;
}
