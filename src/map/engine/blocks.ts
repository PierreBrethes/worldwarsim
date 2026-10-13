import {
  CanvasTexture,
  CapsuleGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RingGeometry,
  SRGBColorSpace,
  type Raycaster,
  type Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { LonLat } from '@/domain/geo';
import type { MapMotion } from '@/domain/map-motion';
import type { Medium } from '@/domain/routing';
import { COUNTRY_THICKNESS, SEA_LEVEL, type WorldFrame } from './frame';
import { contactShadow, FIGURINE_SCALE, nearWeight, type Figurine } from './figurines/figurine';
import { silhouettePaths } from './silhouettes';
import { pieceScale } from './piece-scale';
import { drawnHit, nearer, type PieceHit } from './piece-pick';

/** A surveyed enemy camp as the board stands it: its label id, its point, its medium, its age. */
export type SurveyedCamp = {
  readonly id: string;
  readonly lonLat: LonLat;
  readonly medium: Medium;
  readonly washed: boolean;
};

/**
 * **The camps a hand sets down** (ADR 0026 §4): seen now, and not seen at the last display —
 * new, or a last known position covered again. `known` holds the covered ids only. The first
 * display is the loading — everything already stands; a camp turning to its last known
 * position stays put.
 */
export function appearedCamps(
  known: ReadonlySet<string> | null,
  camps: ReadonlyArray<{ readonly id: string; readonly washed: boolean }>,
): string[] {
  if (known === null) return [];
  return camps.filter((camp) => !camp.washed && !known.has(camp.id)).map((camp) => camp.id);
}

/** The prototype's block (`table-etat-major.html`, `block`), in model units. */
const HEIGHT = 1.9;
const DEPTH = 0.6;
const BODY = new RoundedBoxGeometry(1.5, HEIGHT, DEPTH, 3, 0.1);
BODY.translate(0, HEIGHT / 2, 0);
const BACK = new PlaneGeometry(1.3, 1.6);
BACK.translate(0, HEIGHT / 2, DEPTH / 2 + 0.004);
const WASHED_INK_OPACITY = 0.7;
const WOOD = new MeshStandardMaterial({ color: '#1e1a15', roughness: 0.45 });
const WASHED_OPACITY = 0.35;
const WOOD_WASHED = new MeshStandardMaterial({
  color: '#1e1a15',
  roughness: 0.45,
  transparent: true,
  opacity: WASHED_OPACITY,
  depthWrite: false,
});

const DASHES = 14;
const RING = mergeGeometries(
  Array.from(
    { length: DASHES },
    (_, k) => new RingGeometry(1.75, 1.85, 6, 1, (k / DASHES) * Math.PI * 2, Math.PI / DASHES),
  ),
)!;
RING.rotateX(-Math.PI / 2);
RING.translate(0, 0.02, 0);
const RING_INK = new MeshBasicMaterial({
  color: '#2a2118',
  transparent: true,
  opacity: 0.5,
  depthWrite: false,
});

/** One canvas per medium, drawn on first use — the engine module loads before any document
 *  is needed, and the tests import it without one. Each silhouette is fitted to the back plane. */
const pictograms = new Map<string, MeshBasicMaterial>();
function pictogramOf(medium: Medium, washed: boolean): MeshBasicMaterial {
  const key = `${medium}:${washed}`;
  let material = pictograms.get(key);
  if (material) return material;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 160;
  const ctx = canvas.getContext('2d')!;
  const paths = silhouettePaths(medium).map((d) => new Path2D(d));
  const box = silhouetteBox(medium);
  const pad = 8;
  const scale = Math.min((128 - 2 * pad) / box.w, (160 - 2 * pad) / box.h);
  ctx.setTransform(
    scale,
    0,
    0,
    scale,
    (128 - box.w * scale) / 2 - box.x * scale,
    (160 - box.h * scale) / 2 - box.y * scale,
  );
  ctx.fillStyle = '#e4d8bd';
  for (const path of paths) ctx.fill(path);
  const map = new CanvasTexture(canvas);
  map.colorSpace = SRGBColorSpace;
  material = new MeshBasicMaterial({
    map,
    transparent: true,
    depthWrite: false,
    ...(washed ? { opacity: WASHED_INK_OPACITY } : {}),
  });
  pictograms.set(key, material);
  return material;
}

/** The bounding box of a medium's silhouette, read off its path coordinates. */
function silhouetteBox(medium: Medium): { x: number; y: number; w: number; h: number } {
  const numbers = silhouettePaths(medium)
    .join(' ')
    .match(/-?\d+(?:\.\d+)?/g)!
    .map(Number);
  const xs = numbers.filter((_, k) => k % 2 === 0);
  const ys = numbers.filter((_, k) => k % 2 === 1);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** `piece` is what a hand lifts; the shadow and the ring stay on the ground. */
function block(medium: Medium, washed: boolean): { object: Group; piece: Group } {
  const object = new Group();
  const piece = new Group();
  piece.scale.setScalar(FIGURINE_SCALE);
  piece.add(
    new Mesh(BODY, washed ? WOOD_WASHED : WOOD),
    new Mesh(BACK, pictogramOf(medium, washed)),
  );
  object.add(piece);
  if (medium !== 'air') object.add(contactShadow());
  if (washed) {
    const ring = new Mesh(RING, RING_INK);
    ring.scale.setScalar(FIGURINE_SCALE);
    ring.userData.ground = true;
    object.add(ring);
  }
  return { object, piece };
}

/** A last known position's block: at the end of its frozen stretch, and on the review page. */
export const washedBlock = (medium: Medium): Group => block(medium, true).object;

/** An enemy movement's « figurine »: the block of its medium, back to the eye, no heading. */
export function blockFigurine(medium: Medium): Figurine {
  return {
    object: block(medium, false).object,
    ready: Promise.resolve(),
    spin() {},
    facesEye: true,
  };
}

const PALM = new RoundedBoxGeometry(1.5, 0.5, 1.6, 4, 0.24);
const FINGER = new CapsuleGeometry(0.16, 0.9, 4, 12);
FINGER.translate(0, -0.45, 0);
const THUMB = new CapsuleGeometry(0.18, 0.75, 4, 12);
THUMB.translate(0, -0.375, 0);
const WRIST = new CylinderGeometry(0.5, 0.6, 2.2, 18);
WRIST.rotateX(Math.PI / 2);
WRIST.translate(0, 0, -1.1);
const SLEEVE = new CylinderGeometry(0.68, 0.7, 1, 18);
SLEEVE.rotateX(Math.PI / 2);
SLEEVE.translate(0, 0, -2.5);
const SKIN = new MeshStandardMaterial({ color: '#d6ae88', roughness: 0.7 });
const CUFF = new MeshStandardMaterial({ color: '#efe7d3', roughness: 0.85 });

/** The prototype's hand (`lpHand`), its fingers straightened: it is seen for half a second. */
function hand(): Group {
  const object = new Group();
  object.add(new Mesh(PALM, SKIN));
  for (const x of [-0.54, -0.18, 0.18, 0.52]) {
    const finger = new Mesh(FINGER, SKIN);
    finger.position.set(x, -0.05, 0.62);
    finger.rotation.x = -0.2;
    object.add(finger);
  }
  const thumb = new Mesh(THUMB, SKIN);
  thumb.position.set(0.7, -0.05, -0.3);
  thumb.rotation.set(0.35, 0, -0.75);
  const arm = new Group();
  arm.position.set(0, 0.25, -0.85);
  arm.rotation.x = 0.55;
  arm.add(new Mesh(WRIST, SKIN), new Mesh(SLEEVE, CUFF));
  object.add(thumb, arm);
  object.scale.setScalar(FIGURINE_SCALE * 0.6);
  return object;
}

/** The prototype's landing (`liftTick`), in seconds and model units: down with the hand, a drop, a small bounce. */
const DESCENT = 0.35;
const FALL = 0.14;
const BOUNCE = 0.12;
const HAND_GONE = 0.75;
const FROM = 7;
const LIFT = 1.1;
const HAND_ABOVE = HEIGHT + 0.55;

function landing(d: number): { lift: number; hand: number } {
  if (d < DESCENT) {
    const lift = LIFT + (FROM - LIFT) * (1 - d / DESCENT) ** 2;
    return { lift, hand: lift + HAND_ABOVE };
  }
  const hand = LIFT + HAND_ABOVE + (d - DESCENT) * 13;
  const t = d - DESCENT;
  if (t < FALL) return { lift: LIFT * (1 - t / FALL) ** 2, hand };
  if (t < FALL + BOUNCE) return { lift: Math.sin(((t - FALL) / BOUNCE) * Math.PI) * 0.11, hand };
  return { lift: 0, hand };
}

type Placed = {
  readonly key: string;
  readonly medium: Medium;
  lonLat: LonLat;
  readonly object: Group;
  readonly piece: Group;
  landing: { readonly hand: Group; readonly since: number } | null;
};

/**
 * **The enemy's surveyed camps, in blocks seen from behind** (ADR 0026 §4): up close the block
 * stands where the silhouette mast hung, and says no more — a point, a medium, an age. A
 * landing lasts less than `SETTLE_MS`, so the frames the display asked for carry it.
 */
export class CampLayer {
  readonly group = new Group();
  motion: MapMotion = 'full';
  private known: ReadonlySet<string> | null = null;
  private placed = new Map<string, Placed>();

  constructor(private readonly frame: WorldFrame) {}

  /** Diffed by sighting id: the view is re-served at every step of any column. */
  display(camps: ReadonlyArray<SurveyedCamp>, now: number): void {
    const appeared = new Set(this.motion === 'full' ? appearedCamps(this.known, camps) : []);
    this.known = new Set(camps.filter((camp) => !camp.washed).map((camp) => camp.id));
    const next = new Map<string, Placed>();
    for (const camp of camps) {
      const key = `${camp.medium}:${camp.washed}`;
      let entry = this.placed.get(camp.id);
      this.placed.delete(camp.id);
      if (entry?.key !== key) {
        entry?.object.removeFromParent();
        entry = {
          key,
          medium: camp.medium,
          lonLat: camp.lonLat,
          ...block(camp.medium, camp.washed),
          landing: null,
        };
        this.group.add(entry.object);
      }
      entry.lonLat = camp.lonLat;
      if (appeared.has(camp.id)) {
        const held = hand();
        entry.object.add(held);
        entry.landing = { hand: held, since: now };
      }
      next.set(camp.id, entry);
    }
    for (const gone of this.placed.values()) gone.object.removeFromParent();
    this.placed = next;
    this.rebuild();
  }

  isDressed(id: string): boolean {
    return this.placed.has(id);
  }

  /** The block under `ray`, the hand that lays it down aside. */
  under(ray: Raycaster): PieceHit | null {
    let best: PieceHit | null = null;
    for (const [id, { object, piece }] of this.placed) {
      if (!object.visible) continue;
      const distance = drawnHit(ray, piece);
      if (distance !== null) best = nearer(best, { id, distance });
    }
    return best;
  }

  /** A force at sea floats on the water, not on the crust's height. */
  rebuild(): void {
    for (const { lonLat, medium, object } of this.placed.values())
      object.position.copy(
        this.frame.projectLonLat(lonLat, medium === 'sea' ? SEA_LEVEL : COUNTRY_THICKNESS),
      );
  }

  orient(cameraPosition: Vector3, yaw: number, now: number): void {
    for (const entry of this.placed.values()) {
      const { object, piece } = entry;
      const near = nearWeight(object.position.distanceTo(cameraPosition));
      object.visible = near > 0;
      object.scale.setScalar(near * pieceScale.troops);
      object.rotation.set(0, yaw, 0);
      if (entry.landing === null) continue;
      const d = (now - entry.landing.since) / 1000;
      if (this.motion !== 'full' || d >= HAND_GONE) {
        entry.landing.hand.removeFromParent();
        entry.landing = null;
        piece.position.y = 0;
        continue;
      }
      const at = landing(d);
      piece.position.y = at.lift * FIGURINE_SCALE;
      entry.landing.hand.position.y = at.hand * FIGURINE_SCALE;
    }
  }

  /** Geometry, materials and pictograms are the module's, shared by every block. */
  dispose(): void {
    this.group.removeFromParent();
  }
}
