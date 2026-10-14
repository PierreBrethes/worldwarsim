import {
  CanvasTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Medium } from '@/domain/routing';
import { contactShadow, FIGURINE_SCALE, type Figurine } from './figurines/figurine';
import { silhouettePaths } from './silhouettes';

/** The prototype's block (`table-etat-major.html`, `block`), in model units. */
const HEIGHT = 1.9;
const DEPTH = 0.6;
const BODY = new RoundedBoxGeometry(1.5, HEIGHT, DEPTH, 3, 0.1);
BODY.translate(0, HEIGHT / 2, 0);
const BACK = new PlaneGeometry(1.3, 1.6);
BACK.translate(0, HEIGHT / 2, DEPTH / 2 + 0.004);
const WOOD = new MeshStandardMaterial({ color: '#1e1a15', roughness: 0.45 });

/** One canvas per medium, drawn on first use — the engine module loads before any document
 *  is needed, and the tests import it without one. Each silhouette is fitted to the back plane. */
const pictograms = new Map<Medium, MeshBasicMaterial>();
function pictogramOf(medium: Medium): MeshBasicMaterial {
  let material = pictograms.get(medium);
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
  material = new MeshBasicMaterial({ map, transparent: true, depthWrite: false });
  pictograms.set(medium, material);
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

/**
 * **The enemy of an account from before the fire was seen** (F1): a block of its medium, back to
 * the eye, no heading — what the replay of such an account still stands, one per troop. The board
 * itself writes a survey in ink (`annotations.ts`).
 */
export function blockFigurine(medium: Medium): Figurine {
  const object = new Group();
  const piece = new Group();
  piece.scale.setScalar(FIGURINE_SCALE);
  piece.add(new Mesh(BODY, WOOD), new Mesh(BACK, pictogramOf(medium)));
  object.add(piece);
  if (medium !== 'air') object.add(contactShadow());
  return { object, ready: Promise.resolve(), spin() {}, facesEye: true };
}
