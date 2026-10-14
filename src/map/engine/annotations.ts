import {
  type Box3,
  CanvasTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  type Raycaster,
  SRGBColorSpace,
  type Texture,
  type Vector3,
} from 'three';
import type { LonLat } from '@/domain/geo';
import { asClockTime } from '@/domain/duration';
import type { Medium } from '@/domain/routing';
import { surveyInk } from '@/domain/survey-ink';
import { FIGURINE_SCALE, nearWeight, type Figurine } from './figurines/figurine';
import { COUNTRY_THICKNESS, SEA_LEVEL, type WorldFrame } from './frame';
import { pieceScale } from './piece-scale';
import { boxOfObject, drawnHit, nearer, type PieceHit } from './piece-pick';
import { SILHOUETTES } from './silhouettes';

/** The annotation's side in model units — the landing's mark against a figurine. */
const SIDE = 3.2;
const PLANE = new PlaneGeometry(SIDE, SIDE).rotateX(-Math.PI / 2).translate(0, 0.03, 0);

const INK = '#2a2118';
const RED = '#8f3a2c';
const PX = 256;
/** Silhouettes are drawn around ±10 (`silhouettes.ts`); the domain takes the middle of the ring. */
const DOMAIN_SCALE = 6.4;

/** One canvas per medium and hour: an hour is a minute's worth of annotations, and the stale
 *  ones go first past the bound. */
const textures = new Map<string, Texture>();
const TEXTURES_KEPT = 64;

function textureOf(medium: Medium, hour: string): Texture {
  const key = `${medium}|${hour}`;
  const kept = textures.get(key);
  if (kept) return kept;
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
  textures.set(key, texture);
  if (textures.size > TEXTURES_KEPT) {
    const [oldest] = textures.keys();
    textures.get(oldest!)!.dispose();
    textures.delete(oldest!);
  }
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
  const material = new MeshBasicMaterial({
    map: textureOf(medium, asClockTime(seenAt)),
    transparent: true,
    depthWrite: false,
    opacity: surveyInk(seenMinutesAgo),
  });
  const mesh = new Mesh(PLANE, material);
  mesh.renderOrder = 4;
  const object = new Group();
  const piece = new Group();
  piece.scale.setScalar(FIGURINE_SCALE);
  piece.add(mesh);
  object.add(piece);
  return { object, piece };
}

/** Its material is its own — the ink of each age — and goes with it. */
export function eraseAnnotation(object: Group): void {
  object.removeFromParent();
  object.traverse((part) => {
    if (part instanceof Mesh) (part.material as MeshBasicMaterial).dispose();
  });
}

/** An enemy movement's « figurine »: its annotation slides along the stretch, upright to the eye. */
export const annotationFigurine = (medium: Medium, seenAt: number): Figurine => ({
  object: inkAnnotation(medium, seenAt, null).object,
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
};

/**
 * **The enemy's surveyed camps, annotated in ink** (F2, révision de l'ADR 0026 §4): up close the
 * annotation lies where the silhouette mast hung, and says no more — a point, a medium, an hour,
 * an age.
 */
export class CampLayer {
  readonly group = new Group();
  private placed = new Map<string, Placed>();

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
        if (entry) eraseAnnotation(entry.object);
        entry = {
          key,
          medium: camp.medium,
          lonLat: camp.lonLat,
          ...inkAnnotation(camp.medium, camp.seenAt, camp.seenMinutesAgo),
        };
        this.group.add(entry.object);
      }
      entry.lonLat = camp.lonLat;
      next.set(camp.id, entry);
    }
    for (const gone of this.placed.values()) eraseAnnotation(gone.object);
    this.placed = next;
    this.rebuild();
  }

  isDressed(id: string): boolean {
    return this.placed.has(id);
  }

  boxOf(id: string): Box3 | null {
    const placed = this.placed.get(id);
    return placed?.object.visible ? boxOfObject(placed.piece) : null;
  }

  under(ray: Raycaster): PieceHit | null {
    let best: PieceHit | null = null;
    for (const [id, { object, piece }] of this.placed) {
      if (!object.visible) continue;
      const distance = drawnHit(ray, piece);
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
    for (const { object } of this.placed.values()) {
      const near = nearWeight(object.position.distanceTo(cameraPosition));
      object.visible = near > 0;
      object.scale.setScalar(near * pieceScale.troops);
      object.rotation.set(0, yaw, 0);
    }
  }

  dispose(): void {
    this.group.removeFromParent();
  }
}
