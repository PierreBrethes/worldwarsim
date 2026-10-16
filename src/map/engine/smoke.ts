import {
  CanvasTexture,
  CircleGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  type Material,
  MeshStandardMaterial,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  Vector3,
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
  /** How far it drifts sideways for its rise, by the top: the wind's push. 0.35 when absent. */
  readonly lean?: number;
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
    lean: (plume.lean ?? 0.35) * plume.rise * phase * phase,
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
      // Dust and smoke are air over the piece, not the piece: the pointer passes through.
      puff.userData.ground = true;
      this.object.add(puff);
    }
    this.frame(0);
  }

  /** `fade` (0..1) dims the whole plume: the way out of a smoke that is about to be retired. */
  frame(time: number, fade = 1): void {
    this.object.children.forEach((child, rank) => {
      const puff = child as Sprite;
      const { height, lean, size, opacity } = puffAt(this.plume, rank, time);
      const step = Math.round((opacity * fade * OPACITY_STEPS) / this.plume.opacity);
      puff.visible = step > 0;
      puff.material = this.steps[step]!;
      puff.position.set(lean, height, 0);
      puff.scale.setScalar(size);
    });
  }
}

/** The prototype's dust (`KINDS.dust`): its sizes and speeds in its units, a third of ours. */
const DUST = { life: 1.2, from: 0.35, to: 1.5, opacity: 0.5, up: 0.5, spread: 0.6 } as const;
const DUST_INK = '#a8916a';

/**
 * **A puff of dust where a piece touches the felt** (POC « Manipuler les pions », `emit('dust')`):
 * a few soft discs thrown up and out, slowing, swelling and fading over 1.2 s. Its own materials,
 * freed with it.
 */
export class DustBurst {
  readonly object = new Group();
  private readonly puffs: { sprite: Sprite; drift: Vector3; spin: number }[] = [];

  constructor(count: number, size: number) {
    puffTexture ??= drawPuff();
    for (let k = 0; k < count; k++) {
      const sprite = new Sprite(
        new SpriteMaterial({
          map: puffTexture,
          color: DUST_INK,
          transparent: true,
          depthWrite: false,
        }),
      );
      sprite.renderOrder = 5;
      sprite.userData.ground = true;
      this.object.add(sprite);
      this.puffs.push({
        sprite,
        // Its speed in its size: the prototype's spread and rise, closed over its slowing.
        drift: new Vector3(
          (Math.random() - 0.5) * DUST.spread,
          DUST.up * (0.6 + Math.random() * 0.6),
          (Math.random() - 0.5) * DUST.spread,
        ).multiplyScalar(size),
        spin: Math.random() * 6,
      });
    }
    this.step(0, size);
  }

  /** At `age` seconds; `false` once it has faded. */
  step(age: number, size: number): boolean {
    const f = age / DUST.life;
    if (f >= 1) return false;
    const travelled = (1 - Math.exp(-1.2 * age)) / 1.2;
    for (const { sprite, drift, spin } of this.puffs) {
      sprite.position.copy(drift).multiplyScalar(travelled);
      sprite.scale.setScalar((DUST.from + (DUST.to - DUST.from) * (1 - (1 - f) ** 2)) * size);
      sprite.material.opacity = DUST.opacity * (1 - f) * (f < 0.1 ? f / 0.1 : 1);
      sprite.material.rotation = spin + f;
    }
    return true;
  }

  dispose(): void {
    for (const { sprite } of this.puffs) sprite.material.dispose();
    this.object.removeFromParent();
  }
}

/**
 * **A hull at sea leaves a wake** (proposition `table-etat-major`, point 15: the wake says the
 * sea). Two rows of foam fall back from the stern and open into a V, in board units and in the
 * pawn's own frame — front towards +z, as its figurine faces its road. Like a puff of smoke, a
 * foam patch is a function of the time: a stopped clock leaves a still wake that still says « at
 * sea ».
 */
export const WAKE_LIFE = 2.4;
const WAKE_PUFFS = 12;
const WAKE_STERN = 0.3;
const WAKE_LENGTH = 1.3;
const WAKE_OPACITY = 0.6;

export function wakePuffAt(rank: number, time: number) {
  const phase = (((time / WAKE_LIFE + Math.floor(rank / 2) / (WAKE_PUFFS / 2)) % 1) + 1) % 1;
  return {
    ahead: -(WAKE_STERN + WAKE_LENGTH * phase),
    side: (rank % 2 === 0 ? -1 : 1) * (0.06 + 0.4 * phase),
    size: 0.12 + 0.38 * Math.sqrt(phase),
    opacity: WAKE_OPACITY * (phase < 0.1 ? phase / 0.1 : 1 - (phase - 0.1) / 0.9),
  };
}

const FOAM = '#f4ecd8';
const WAKE_DISC = new CircleGeometry(0.5, 16).rotateX(-Math.PI / 2);
let wakeSteps: MeshBasicMaterial[] | null = null;

/** One wake, its pool fixed at birth; geometry, materials and texture are the module's. */
export class Wake {
  readonly object = new Group();

  constructor() {
    puffTexture ??= drawPuff();
    wakeSteps ??= Array.from(
      { length: OPACITY_STEPS + 1 },
      (_, k) =>
        new MeshBasicMaterial({
          map: puffTexture,
          color: FOAM,
          transparent: true,
          depthWrite: false,
          opacity: (WAKE_OPACITY * k) / OPACITY_STEPS,
        }),
    );
    for (let k = 0; k < WAKE_PUFFS; k++) {
      const puff = new Mesh(WAKE_DISC, wakeSteps[0]);
      puff.renderOrder = 3;
      // Foam on the water, not the hull: the pointer behind a ship is on the sea (`drawnHit`).
      puff.userData.ground = true;
      this.object.add(puff);
    }
    this.frame(0);
  }

  frame(time: number): void {
    this.object.children.forEach((child, rank) => {
      const puff = child as Mesh;
      const { ahead, side, size, opacity } = wakePuffAt(rank, time);
      const step = Math.round((opacity / WAKE_OPACITY) * OPACITY_STEPS);
      puff.visible = step > 0;
      puff.material = wakeSteps![step]!;
      puff.position.set(side, 0.004, ahead);
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
