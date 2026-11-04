import {
  BoxGeometry,
  type Box3,
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
} from 'three';
import { progressAt, type CaptureClock } from '@/domain/capture';
import { PALETTE } from './palette';
import type { StandingMaquette } from './maquettes';

/**
 * **Ce qu'un site porte de la prise** (#279, storyboard `storyboard-prise`) : l'agrafe qui compte
 * une capture autour de son socle, les scellés d'un site hors service, et la hauteur de son
 * drapeau à la hampe. Tout est en mètres du modèle, placé par la maquette.
 */

/** **The staple runs this far off the socle's edge**, in metres (storyboard, question 2). */
const STAPLE_OFF = 3;
const STAPLE_WIDTH = 1.6;
const STAPLE_CORNER = 9;
/** Just over the ground, under the socle's flank. */
const STAPLE_LIFT = 0.08;
/** **The staple moves by steps**: a clock that turns by minutes asks a frame only when its share
 *  changes, 32 times over a capture at most (Précisions du 04/11). */
export const STAPLE_STEPS = 32;
const STAPLE_OPACITY = 0.8;
/** A capture stopped for want of infantry: its staple frozen and pale, at the capturer's alone. */
const STAPLE_PALE = 0.3;

/** **Round a rounded rectangle**, from the middle of its front (+z) toward −x (storyboard). */
function roundedPath(x0: number, z0: number, x1: number, z1: number, r: number, n = 6) {
  const points: Array<readonly [number, number]> = [[(x0 + x1) / 2, z1]];
  const arc = (cx: number, cz: number, from: number) => {
    for (let k = 0; k <= n; k++) {
      const a = from + (k / n) * (Math.PI / 2);
      points.push([cx + r * Math.cos(a), cz + r * Math.sin(a)]);
    }
  };
  arc(x0 + r, z1 - r, Math.PI / 2);
  arc(x0 + r, z0 + r, Math.PI);
  arc(x1 - r, z0 + r, -Math.PI / 2);
  arc(x1 - r, z1 - r, 0);
  points.push([(x0 + x1) / 2, z1]);
  return points;
}

/** **The staple of a capture round `socle`**: a neutral ink, the same at both sides — it says
 *  nothing of who captures. Drawn up to its share by `traceStaple`. */
export function stapleOf(socle: Box3): Mesh {
  const { min, max } = socle;
  const path = roundedPath(
    min.x - STAPLE_OFF,
    min.z - STAPLE_OFF,
    max.x + STAPLE_OFF,
    max.z + STAPLE_OFF,
    STAPLE_CORNER,
  );
  const half = STAPLE_WIDTH / 2;
  const y = STAPLE_LIFT;
  const positions: number[] = [];
  for (let k = 0; k + 1 < path.length; k++) {
    const [ax, az] = path[k]!;
    const [bx, bz] = path[k + 1]!;
    const length = Math.hypot(bx - ax, bz - az) || 1;
    const [nx, nz] = [(-(bz - az) / length) * half, ((bx - ax) / length) * half];
    positions.push(
      ...[ax - nx, y, az - nz, bx - nx, y, bz - nz, bx + nx, y, bz + nz],
      ...[ax - nx, y, az - nz, bx + nx, y, bz + nz, ax + nx, y, az + nz],
    );
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  const mesh = new Mesh(
    geometry,
    new MeshBasicMaterial({
      color: PALETTE.border,
      transparent: true,
      opacity: STAPLE_OPACITY,
      depthWrite: false,
      side: DoubleSide,
    }),
  );
  mesh.name = 'agrafe';
  mesh.matrixAutoUpdate = false;
  mesh.userData.shadowless = true;
  return mesh;
}

/** **The staple's share at `now`**, by steps of `STAPLE_STEPS`: what the capture has done. */
export const stapleShare = (clock: CaptureClock, now: number): number =>
  Math.floor(progressAt(clock, now) * STAPLE_STEPS) / STAPLE_STEPS;

/** Draws `staple` up to `share`, pale when its capture is stopped. Whether anything changed. */
export function traceStaple(staple: Mesh, share: number, pale: boolean): boolean {
  const segments = staple.geometry.attributes.position!.count / 6;
  const count = Math.floor(segments * share) * 6;
  const material = staple.material as MeshBasicMaterial;
  const opacity = pale ? STAPLE_PALE : STAPLE_OPACITY;
  if (staple.geometry.drawRange.count === count && material.opacity === opacity) return false;
  staple.geometry.setDrawRange(0, count);
  material.opacity = opacity;
  staple.visible = count > 0;
  return true;
}

const PLANK_WOOD = new MeshStandardMaterial({ color: '#b08a55', roughness: 0.85 });
/** The planks cross this much off the horizontal. */
const PLANK_TILT = 0.6;
/** **The seals drawn larger than the storyboard's planks**, to read at the board's closest zoom,
 *  at 1440 as on a phone. `@a-mesurer` */
export const SEAL_SCALE = 2.5;
/** **How high the middle of the seals stands**, over a mark that sits lower: its lower ends
 *  clear the socle (`top`), by 20 cm. */
export const sealHeight = (y: number, length: number, top: number): number =>
  Math.max(y, top + (Math.sin(PLANK_TILT) * length * SEAL_SCALE) / 2 + 0.2);

/** **Les scellés** (décision 5) : deux planches de `length` mètres clouées en croix devant la
 *  porte, origine au milieu de la croix, face vers +z. Un état, pas une animation. */
export function sealsOf(length: number): Group {
  const plank = new BoxGeometry(length, 0.4, 0.15);
  const seals = new Group();
  seals.name = 'scelles';
  for (const tilt of [PLANK_TILT, -PLANK_TILT]) {
    const nailed = new Mesh(plank, PLANK_WOOD);
    nailed.rotation.z = tilt;
    // One over the other where they cross, not through it.
    nailed.position.z = tilt > 0 ? 0 : 0.15 * SEAL_SCALE;
    nailed.castShadow = true;
    seals.add(nailed);
  }
  for (const plank of seals.children) plank.scale.multiplyScalar(SEAL_SCALE);
  seals.matrixAutoUpdate = false;
  return seals;
}

/**
 * **How far a flag travels down its pole**, in metres: the 6 m pole less the 2 m cloth — it
 * lowers to the top of its sign and is gone (storyboard, « le drapeau descend »).
 */
export const FLAG_DROP = 4;
/** The flag of the side that loses goes down so long; the taker's goes up so long after the
 *  pole stood bare (storyboard `T.lower`, `T.bare`, `T.hoist`). */
export const LOWER_MS = 1200;
export const BARE_MS = 300;
export const HOIST_MS = 1600;

/** **A flag moving on its pole**: its height from `from` to `to` (1 at the top, 0 gone),
 *  starting at `start`, over `ms`. */
export type FlagMotion = {
  readonly from: number;
  readonly to: number;
  readonly start: number;
  readonly ms: number;
};

/** Its height at `now`: lowered slowly first (`in2`), hoisted fast first (`out3`). */
export function flagHeight({ from, to, start, ms }: FlagMotion, now: number): number {
  const t = Math.min(1, Math.max(0, (now - start) / ms));
  const eased = to < from ? t * t : 1 - (1 - t) ** 3;
  return from + (to - from) * eased;
}

/**
 * **Ce que la vue dit d'une prise, de deux vues** (#279, Précisions du 04/11) : sans lire le
 * journal. Chez le capteur, la capture disparaît et le site entre dans mes bâtiments : son
 * drapeau monte (`hoisted`, mes maquettes neuves). Chez le teneur, la capture disparaît et le site
 * quitte mes bâtiments : son drapeau descend sur la maquette d'avant (`lowered`). Une capture qui
 * disparaît sans changer la main est levée : rien. À la chute d'un QG, seul le site visé joue.
 */
export function flagCues(
  before: ReadonlyArray<StandingMaquette>,
  after: ReadonlyArray<StandingMaquette>,
): { hoisted: ReadonlyArray<string>; lowered: ReadonlyArray<StandingMaquette> } {
  const still = (buildingId: string) =>
    after.some((maquette) => maquette.buildingId === buildingId && maquette.capture !== undefined);
  const mineIn = (buildingId: string) =>
    after.find((maquette) => maquette.buildingId === buildingId && maquette.side === 'mine');
  const ended = (side: 'capturer' | 'defender') =>
    before.filter(
      (maquette): maquette is StandingMaquette & { buildingId: string } =>
        maquette.capture?.side === side &&
        maquette.buildingId !== undefined &&
        !still(maquette.buildingId),
    );
  return {
    hoisted: ended('capturer').flatMap(({ buildingId }) => mineIn(buildingId)?.id ?? []),
    lowered: ended('defender').filter(
      ({ buildingId, side }) => side === 'mine' && mineIn(buildingId) === undefined,
    ),
  };
}
