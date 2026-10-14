import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  Vector3,
  type Scene,
} from 'three';
import { stampAt } from '@/domain/ink-bursts';
import type { MapMotion } from '@/domain/map-motion';
import { wordedTexture } from '@/map/engine/ink';

/** Everything on the sheet lies this far over it, so the paper does not swallow it. */
export const SHEET_Y = 0.08;

export function canvasTexture(
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d')!);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

const PUFF = canvasTexture(64, 64, (ctx) => {
  const glow = ctx.createRadialGradient(32, 32, 2, 32, 32, 31);
  glow.addColorStop(0, 'rgba(255,255,255,1)');
  glow.addColorStop(0.55, 'rgba(255,255,255,.5)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 64, 64);
});
const DASH = canvasTexture(64, 16, (ctx) => {
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 2, 40, 12);
});
DASH.wrapS = RepeatWrapping;

export type Ribbon = Mesh<BufferGeometry, MeshBasicMaterial> & {
  /** Draws the ribbon up to a share of its length, as a pen would. */
  reveal(share: number): void;
};

/** A flat band along `points`, at `y` over the sheet, dashed when `dash` gives the dash length. */
export function ribbon(
  scene: Scene,
  points: ReadonlyArray<Vector3>,
  width: number,
  color: string,
  { opacity = 1, dash = 0, y = SHEET_Y + 0.017 } = {},
): Ribbon {
  const n = points.length;
  const position = new Float32Array(n * 6);
  const uv = new Float32Array(n * 4);
  const index: number[] = [];
  let travelled = 0;
  for (let i = 0; i < n; i++) {
    const p = points[i]!;
    const a = points[Math.max(0, i - 1)]!;
    const b = points[Math.min(n - 1, i + 1)]!;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const length = Math.hypot(dx, dz) || 1;
    const nx = ((-dz / length) * width) / 2;
    const nz = ((dx / length) * width) / 2;
    if (i) travelled += Math.hypot(p.x - points[i - 1]!.x, p.z - points[i - 1]!.z);
    position.set([p.x + nx, y, p.z + nz, p.x - nx, y, p.z - nz], i * 6);
    const u = dash ? travelled / dash : 0;
    uv.set([u, 0, u, 1], i * 4);
    if (i < n - 1) index.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(position, 3));
  geometry.setAttribute('uv', new BufferAttribute(uv, 2));
  geometry.setIndex(index);
  const mesh = new Mesh(
    geometry,
    new MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      side: DoubleSide,
      map: dash ? DASH : null,
    }),
  ) as Ribbon;
  mesh.renderOrder = 3;
  mesh.reveal = (share) =>
    geometry.setDrawRange(0, Math.floor((index.length * Math.min(1, Math.max(0, share))) / 6) * 6);
  mesh.reveal(0);
  scene.add(mesh);
  return mesh;
}

/** A quadratic bow from `a` to `b`, bent sideways by `k` of its length. */
export function bow(a: Vector3, b: Vector3, k = 0.14, n = 90): Vector3[] {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const cx = (a.x + b.x) / 2 - dz * k;
  const cz = (a.z + b.z) / 2 + dx * k;
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    const u = 1 - t;
    return new Vector3(
      u * u * a.x + 2 * u * t * cx + t * t * b.x,
      a.y,
      u * u * a.z + 2 * u * t * cz + t * t * b.z,
    );
  });
}

export function along(points: ReadonlyArray<Vector3>, share: number): Vector3 {
  const f = Math.min(1, Math.max(0, share)) * (points.length - 1);
  const i = Math.min(points.length - 2, Math.floor(f));
  return points[i]!.clone().lerp(points[i + 1]!, f - i);
}

export function headingAt(points: ReadonlyArray<Vector3>, share: number): number {
  const a = along(points, Math.max(0, share - 0.01));
  const b = along(points, Math.min(1, share + 0.01));
  return Math.atan2(b.x - a.x, b.z - a.z);
}

export const circle = (centre: Vector3, radius: number, n = 96): Vector3[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return new Vector3(centre.x + Math.cos(a) * radius, centre.y, centre.z + Math.sin(a) * radius);
  });

export const smooth = (x: number): number => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

type Puff = {
  readonly sprite: Sprite;
  age: number;
  readonly life: number;
  readonly size: number;
  readonly grow: number;
  readonly rise: number;
  readonly drift: readonly [number, number];
  readonly opacity: number;
};

/**
 * The ink of a moment on the sheet: grained stamps (the board's own, `wordedTexture` and
 * `stampAt`) and puffs of smoke, dust and fire. Smoke stops when the map's motion is not full.
 */
export class Moments {
  private readonly stamps: { mesh: Mesh<PlaneGeometry, MeshBasicMaterial>; age: number }[] = [];
  private readonly puffs: Puff[] = [];

  constructor(
    private readonly scene: Scene,
    private readonly motion: MapMotion,
  ) {}

  get busy(): boolean {
    return this.stamps.length > 0 || this.puffs.length > 0;
  }

  stamp(word: string, hour: string, at: Vector3, size = 1.6): void {
    const mesh = new Mesh(
      new PlaneGeometry(size, size),
      new MeshBasicMaterial({
        map: wordedTexture({ word, hour }),
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = -0.12;
    mesh.position.copy(at).setY(SHEET_Y + 0.027);
    mesh.renderOrder = 4;
    this.scene.add(mesh);
    this.stamps.push({ mesh, age: 0 });
  }

  puff(
    at: Vector3,
    {
      color = '#ffffff',
      size = 0.27,
      grow = 1.6,
      life = 1.6,
      rise = 0.23,
      drift = [0, 0] as readonly [number, number],
      opacity = 0.5,
      glow = false,
    } = {},
  ): void {
    if (this.motion !== 'full' || this.puffs.length > 160) return;
    const sprite = new Sprite(
      new SpriteMaterial({
        map: PUFF,
        color,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: glow ? AdditiveBlending : NormalBlending,
      }),
    );
    sprite.position.copy(at);
    sprite.scale.setScalar(size);
    this.scene.add(sprite);
    this.puffs.push({ sprite, age: 0, life, size, grow, rise, drift, opacity });
  }

  tick(seconds: number): void {
    for (let i = this.stamps.length - 1; i >= 0; i--) {
      const stamp = this.stamps[i]!;
      stamp.age += seconds * 1000;
      const now = stampAt(stamp.age, this.motion);
      if (now === null) {
        this.scene.remove(stamp.mesh);
        stamp.mesh.material.map?.dispose();
        stamp.mesh.material.dispose();
        this.stamps.splice(i, 1);
        continue;
      }
      stamp.mesh.scale.setScalar(now.scale);
      stamp.mesh.material.opacity = now.opacity;
    }
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const puff = this.puffs[i]!;
      puff.age += seconds;
      const k = puff.age / puff.life;
      puff.sprite.position.x += puff.drift[0] * seconds;
      puff.sprite.position.y += puff.rise * seconds;
      puff.sprite.position.z += puff.drift[1] * seconds;
      puff.sprite.scale.setScalar(puff.size * (1 + puff.grow * k));
      puff.sprite.material.opacity = puff.opacity * Math.sin(Math.PI * Math.min(1, k));
      if (k >= 1) {
        this.scene.remove(puff.sprite);
        puff.sprite.material.dispose();
        this.puffs.splice(i, 1);
      }
    }
  }

  clear(): void {
    for (const { mesh } of this.stamps) this.scene.remove(mesh);
    this.stamps.length = 0;
  }
}

/**
 * **Un relevé s'écrit sur la carte, il ne s'y tient pas** (choix F2 de la page publique) : un
 * cercle pointillé à plat, le domaine hachuré à la plume, un « ? » pour ce qu'il ne dit pas et
 * l'heure. Il pâlit avec l'âge, comme l'encre d'un vieux relevé.
 */
export function surveyMark(hour: string, size: number): Mesh<PlaneGeometry, MeshBasicMaterial> {
  const texture = canvasTexture(256, 256, (ctx) => {
    ctx.translate(128, 128);
    ctx.strokeStyle = ctx.fillStyle = '#2a2118';
    ctx.lineCap = 'round';
    ctx.setLineDash([14, 9]);
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(0, 0, 112, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, 16, 62, 46, 0, Math.PI, 0);
    ctx.rect(-74, 14, 148, 12);
    ctx.clip();
    ctx.lineWidth = 3.2;
    for (let x = -130; x < 130; x += 9) {
      ctx.beginPath();
      ctx.moveTo(x, 40);
      ctx.lineTo(x + 46, -50);
      ctx.stroke();
    }
    ctx.restore();
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.ellipse(0, 16, 62, 46, 0, Math.PI, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-76, 20);
    ctx.lineTo(76, 20);
    ctx.stroke();
    ctx.font = 'italic 700 74px "Bodoni Moda", serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#8f3a2c';
    ctx.fillText('?', 58, -38);
    ctx.font = '500 26px "IBM Plex Mono", monospace';
    ctx.fillStyle = '#2a2118';
    ctx.fillText(hour, 0, 74);
  });
  const mesh = new Mesh(
    new PlaneGeometry(size, size),
    new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = 4;
  return mesh;
}
