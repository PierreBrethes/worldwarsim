import {
  CanvasTexture,
  Group,
  type Material,
  MeshStandardMaterial,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
} from 'three';
import type { Wear } from '@/domain/pile-pieces';

/**
 * **A vehicle says its health in smoke** (ADR 0026 §5): thin under two thirds of its strength,
 * thick under one third, where the hull also blackens. Sizes are in model units, a tank being
 * 2.6 long, from the model's `fx_smoke` marker.
 */
export type Plume = {
  readonly puffs: number;
  /** Seconds from the marker to the top, where the puff fades out and is born again. */
  readonly life: number;
  readonly rise: number;
  readonly size: readonly [number, number];
  readonly opacity: number;
  readonly color: string;
};

export const PLUME_BY_WEAR: Readonly<Record<Wear, Plume | null>> = {
  whole: null,
  smoking: { puffs: 5, life: 3, rise: 2.6, size: [0.4, 1.5], opacity: 0.6, color: '#5f5a52' },
  burning: { puffs: 8, life: 3.6, rise: 3.8, size: [0.5, 2.3], opacity: 0.75, color: '#2b2722' },
};

/**
 * **A puff is a function of the time, not a particle that lives**: each loops on the plume's
 * life, staggered by its rank. A time that stops — reduced or cut motion — leaves a still
 * column that still says the wear, and nothing accumulates between two frames.
 */
export function puffAt(plume: Plume, rank: number, time: number) {
  const phase = (((time / plume.life + rank / plume.puffs) % 1) + 1) % 1;
  const [from, to] = plume.size;
  return {
    height: plume.rise * phase,
    // It leans downwind as it rises: the column bends rather than standing like a post.
    lean: 0.35 * plume.rise * phase * phase,
    size: from + (to - from) * Math.sqrt(phase),
    opacity: plume.opacity * (phase < 0.15 ? phase / 0.15 : 1 - (phase - 0.15) / 0.85),
  };
}

/**
 * Opacity is stepped onto a few materials shared by every plume of a wear, rather than a
 * material per puff: eight steps do not read on a puff that fades over three seconds.
 */
const OPACITY_STEPS = 8;
const materials = new Map<Plume, SpriteMaterial[]>();
let puffTexture: CanvasTexture | null = null;

function materialsOf(plume: Plume): SpriteMaterial[] {
  let steps = materials.get(plume);
  if (steps) return steps;
  puffTexture ??= drawPuff();
  steps = Array.from(
    { length: OPACITY_STEPS + 1 },
    (_, k) =>
      new SpriteMaterial({
        map: puffTexture,
        color: plume.color,
        transparent: true,
        depthWrite: false,
        opacity: (plume.opacity * k) / OPACITY_STEPS,
      }),
  );
  materials.set(plume, steps);
  return steps;
}

/** The prototype's soft disc (`table-etat-major.html`, `puffTex`); none without a document. */
function drawPuff(): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(32, 32, 2, 32, 32, 31);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.55, 'rgba(255,255,255,.55)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** One plume, its pool fixed at birth. Materials and texture are shared: nothing to dispose. */
export class Smoke {
  readonly object = new Group();
  private readonly steps: SpriteMaterial[];

  constructor(private readonly plume: Plume) {
    this.steps = materialsOf(plume);
    for (let k = 0; k < plume.puffs; k++) {
      const puff = new Sprite(this.steps[0]);
      puff.renderOrder = 3;
      this.object.add(puff);
    }
    this.frame(0);
  }

  frame(time: number): void {
    this.object.children.forEach((child, rank) => {
      const puff = child as Sprite;
      const { height, lean, size, opacity } = puffAt(this.plume, rank, time);
      const step = Math.round((opacity / this.plume.opacity) * OPACITY_STEPS);
      puff.visible = step > 0;
      puff.material = this.steps[step]!;
      puff.position.set(lean, height, 0);
      puff.scale.setScalar(size);
    });
  }
}

/**
 * **A burnt hull, without blackening every other hull of its file**: figurines share their
 * model's materials, so a burning one wears a darkened copy — one per source material, kept
 * for the page's life like the models themselves.
 */
const burnt = new WeakMap<Material, Material>();
export function charred<M extends Material>(material: M): M {
  let copy = burnt.get(material) as M | undefined;
  if (copy) return copy;
  copy = material.clone() as M;
  if (copy instanceof MeshStandardMaterial) copy.color.multiplyScalar(0.3);
  burnt.set(material, copy);
  return copy;
}
