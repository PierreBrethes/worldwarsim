import {
  type Box3,
  CanvasTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  type Object3D,
  type Raycaster,
  SRGBColorSpace,
  type Texture,
  type Vector3,
} from 'three';
import type { LonLat } from '@/domain/geo';
import { asClockTime } from '@/domain/duration';
import type { Medium } from '@/domain/routing';
import { surveyInk } from '@/domain/survey-ink';
import {
  ANONYMOUS_SPAN,
  FIGURINE_SCALE,
  floorGrowth,
  troopWeight,
  type Figurine,
} from './figurines/figurine';
import { COUNTRY_THICKNESS, SEA_LEVEL, type WorldFrame } from './frame';
import { pieceScale } from './piece-scale';
import { boxOfObject, drawnHit, leastHit, nearer, type PieceHit } from './piece-pick';
import { SILHOUETTES } from './silhouettes';
import { InkRing, type RingState } from './ink-ring';
import type { MapMotion } from '@/domain/map-motion';
import { ADVERSE_INK } from './palette';

/** The annotation's side in model units — the landing's mark against a figurine. */
const SIDE = 3.2;
const PLANE = new PlaneGeometry(SIDE, SIDE).rotateX(-Math.PI / 2).translate(0, 0.03, 0);

const INK = '#2a2118';
const RED = ADVERSE_INK;
const PX = 256;
/** Silhouettes are drawn around ±10 (`silhouettes.ts`); the domain takes the middle of the ring. */
const DOMAIN_SCALE = 6.4;

/**
 * **One material per medium, hour and ink, counted** (`acquire`, `releaseInk`): annotations of the
 * same survey share it, and the last one to go frees it and its canvas — never one still shown.
 */
const inks = new Map<string, { material: MeshBasicMaterial; users: number }>();

function acquire(
  medium: Medium,
  hour: string,
  ink: number,
): { key: string; material: MeshBasicMaterial } {
  const key = `${medium}|${hour}|${ink.toFixed(2)}`;
  let held = inks.get(key);
  if (held === undefined) {
    held = {
      material: new MeshBasicMaterial({
        map: textureOf(medium, hour),
        transparent: true,
        depthWrite: false,
        opacity: ink,
      }),
      users: 0,
    };
    inks.set(key, held);
  }
  held.users += 1;
  return { key, material: held.material };
}

/** Lets go of the ink `object` was drawn with; anything else in it is left alone. */
export function releaseInk(object: Object3D): void {
  object.traverse((part) => {
    const key = part.userData.ink as string | undefined;
    if (key === undefined) return;
    delete part.userData.ink;
    const held = inks.get(key);
    if (held === undefined || --held.users > 0) return;
    held.material.map?.dispose();
    held.material.dispose();
    inks.delete(key);
  });
}

function textureOf(medium: Medium, hour: string): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = PX;
  const ctx = canvas.getContext('2d')!;
  ctx.translate(PX / 2, PX / 2);
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  ctx.lineCap = 'round';
  ctx.setLineDash([14, 9]);
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(0, 0, 112, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  const domain = new Path2D();
  for (const outline of SILHOUETTES[medium])
    outline.forEach(([x, y], k) =>
      k === 0
        ? domain.moveTo(x * DOMAIN_SCALE, y * DOMAIN_SCALE + 10)
        : domain.lineTo(x * DOMAIN_SCALE, y * DOMAIN_SCALE + 10),
    );
  domain.closePath();
  ctx.save();
  ctx.clip(domain);
  ctx.lineWidth = 3.2;
  for (let x = -130; x < 130; x += 9) {
    ctx.beginPath();
    ctx.moveTo(x, 60);
    ctx.lineTo(x + 50, -60);
    ctx.stroke();
  }
  ctx.restore();
  ctx.lineWidth = 4.5;
  ctx.stroke(domain);

  ctx.textAlign = 'center';
  ctx.font = '700 78px "Bodoni Moda", Georgia, serif';
  ctx.fillStyle = RED;
  ctx.fillText('?', 62, -40);
  ctx.font = '500 26px "IBM Plex Mono", monospace';
  ctx.fillStyle = INK;
  ctx.fillText(hour, 0, 86);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/**
 * **A surveyed enemy force, written on the map** (F2, after the landing's « renseignement »):
 * a dashed ring, its medium hatched with the pen, a red « ? » and the hour it was seen, laid
 * flat and paling with the age of the survey. Exactly what the survey knows — never a role, a
 * nation or a strength. `piece` is what a pointer takes.
 */
export function inkAnnotation(
  medium: Medium,
  seenAt: number,
  seenMinutesAgo: number | null,
): { object: Group; piece: Group } {
  const { key, material } = acquire(medium, asClockTime(seenAt), surveyInk(seenMinutesAgo));
  const mesh = new Mesh(PLANE, material);
  mesh.userData.ink = key;
  mesh.renderOrder = 4;
  const object = new Group();
  const piece = new Group();
  piece.scale.setScalar(FIGURINE_SCALE);
  piece.add(mesh);
  object.add(piece);
  return { object, piece };
}

/** An annotation and its ring: the ring's plane is every ring's, only its material goes. */
function eraseRinged({ object, ring }: Placed): void {
  ring.material.dispose();
  eraseAnnotation(object);
}

export function eraseAnnotation(object: Group): void {
  object.removeFromParent();
  releaseInk(object);
}

/** An enemy movement's « figurine »: its annotation slides along the stretch, upright to the eye. */
export const annotationFigurine = (medium: Medium, seenAt: number): Figurine => ({
  object: inkAnnotation(medium, seenAt, null).object,
  span: ANONYMOUS_SPAN,
  ready: Promise.resolve(),
  spin() {},
  facesEye: true,
});

/** A surveyed enemy camp as the board writes it: its label id, its point, its medium, when it was
 *  seen — since when, in sight; last, out of it — and how long ago, `null` while in sight. */
export type SurveyedCamp = {
  readonly id: string;
  readonly lonLat: LonLat;
  readonly medium: Medium;
  readonly seenAt: number;
  readonly seenMinutesAgo: number | null;
};

type Placed = {
  readonly key: string;
  readonly medium: Medium;
  lonLat: LonLat;
  readonly object: Group;
  readonly piece: Group;
  /** Red and ticked when the hand would attack it (POC, `enemy`). */
  readonly ring: InkRing;
};

/** The ring round an annotation, in its model's units: just outside its dotted circle. */
const RING_RADIUS = (SIDE / 2) * FIGURINE_SCALE * 1.05;

/**
 * **The enemy's surveyed camps, annotated in ink** (F2, révision de l'ADR 0026 §4): up close the
 * annotation lies where the silhouette mast hung, and says no more — a point, a medium, an hour,
 * an age.
 */
export class CampLayer {
  readonly group = new Group();
  private placed = new Map<string, Placed>();
  private marked: { readonly id: string; readonly state: RingState } | null = null;
  motion: MapMotion = 'full';

  constructor(private readonly frame: WorldFrame) {}

  /** Diffed by sighting id: the view is re-served at every step of any column. */
  display(camps: ReadonlyArray<SurveyedCamp>): void {
    const next = new Map<string, Placed>();
    for (const camp of camps) {
      // By what the ink shows, not by the instants: a last known position's hour is re-derived
      // from its age at every view, and would otherwise redraw the mark each time.
      const key = `${camp.medium}|${asClockTime(camp.seenAt)}|${surveyInk(camp.seenMinutesAgo).toFixed(2)}`;
      let entry = this.placed.get(camp.id);
      this.placed.delete(camp.id);
      if (entry?.key !== key) {
        if (entry) eraseRinged(entry);
        const drawn = inkAnnotation(camp.medium, camp.seenAt, camp.seenMinutesAgo);
        const ring = new InkRing();
        ring.position.y = 0.035;
        ring.scale.setScalar(RING_RADIUS);
        drawn.object.add(ring);
        entry = { key, medium: camp.medium, lonLat: camp.lonLat, ...drawn, ring };
        this.group.add(entry.object);
      }
      entry.lonLat = camp.lonLat;
      next.set(camp.id, entry);
    }
    for (const gone of this.placed.values()) eraseRinged(gone);
    this.placed = next;
    this.rebuild();
  }

  isDressed(id: string): boolean {
    return this.placed.has(id);
  }

  /** **The camp the hand would drop onto**, and the ring it wears for it; `null` for none. */
  mark(id: string | null, state: RingState | null): void {
    this.marked = id === null || state === null ? null : { id, state };
  }

  positionOf(id: string): Vector3 | null {
    return this.placed.get(id)?.object.position ?? null;
  }

  /** Its ring pulses: the frames must keep coming. */
  get ringing(): boolean {
    return this.motion === 'full' && this.marked !== null;
  }

  boxOf(id: string): Box3 | null {
    const placed = this.placed.get(id);
    return placed?.object.visible ? boxOfObject(placed.piece) : null;
  }

  under(ray: Raycaster): PieceHit | null {
    let best: PieceHit | null = null;
    for (const [id, { object, piece }] of this.placed) {
      if (!object.visible) continue;
      const distance = drawnHit(ray, piece) ?? leastHit(ray, object.position);
      if (distance !== null) best = nearer(best, { id, distance });
    }
    return best;
  }

  /** A force at sea is written on the water, not on the crust's height. */
  rebuild(): void {
    for (const { lonLat, medium, object } of this.placed.values())
      object.position.copy(
        this.frame.projectLonLat(lonLat, medium === 'sea' ? SEA_LEVEL : COUNTRY_THICKNESS),
      );
  }

  orient(cameraPosition: Vector3, yaw: number): void {
    const seconds = performance.now() / 1000;
    for (const [id, { object, ring }] of this.placed) {
      const distance = object.position.distanceTo(cameraPosition);
      const near = troopWeight(distance, ANONYMOUS_SPAN);
      object.visible = near > 0;
      object.scale.setScalar(near * floorGrowth(distance, ANONYMOUS_SPAN) * pieceScale.size);
      object.rotation.set(0, yaw, 0);
      ring.style(
        this.marked?.id === id ? this.marked.state : null,
        seconds,
        this.motion !== 'full',
      );
      ring.scale.setScalar(RING_RADIUS * ring.beat);
    }
  }

  dispose(): void {
    this.group.removeFromParent();
  }
}
