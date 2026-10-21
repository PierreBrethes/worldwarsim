import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  Mesh,
  ShaderMaterial,
  type IUniform,
} from 'three';
import { contourLines, DEFAULT_CONTOUR_WEIGHT, type ContourWeight } from '@/domain/contours';
import type { DisplayedRegion } from '@/domain/world';
import type { AmbientLayer } from './ambience';
import { COUNTRY_THICKNESS, onLand, type WorldFrame } from './frame';

type Point = readonly [number, number];

/**
 * **Les deux jeux de la maquette** (`WWS/prototypes/carte-refonte/main.js`, #194), en pixels
 * d'écran : demi-épaisseur du trait, écart entre deux lignes voisines, période et part encrée
 * du tiret. @a-mesurer
 */
const WEIGHTS: Record<ContourWeight, { half: number; gap: number; period: number; duty: number }> =
  {
    thin: { half: 0.7, gap: 0.8, period: 9, duty: 0.58 },
    thick: { half: 1.5, gap: 1.2, period: 22, duty: 0.62 },
  };
/** Ton contour, plus épais que les autres dans les deux réglages. @a-mesurer */
const MINE_WIDTH = 1.7;
/** Pixels par seconde ; dix pas par seconde. @a-mesurer */
const DASH_SPEED = 7;
const DASH_HZ = 10;
const CURRENT_OPACITY = 0.95;
/** Un relevé : pâle et immobile (ADR 0033 §3). @a-mesurer */
const SURVEYED_OPACITY = 0.42;
const INNER = { color: '#7d7466', opacity: 0.55, width: 0.45 };
/** Over the hatch of a suspended zone, under the hover's contour. */
const LIFT = 0.0032;

const VERTEX = `
attribute vec2 aNormal; attribute float aSide, aArc;
uniform float uPx, uHalf, uGap, uWidth, uCentered;
varying float vArc, vSide;
void main() {
  float stroke = uHalf * uWidth;
  vec2 off = aNormal * ((uCentered > 0.5 ? 0.0 : stroke + uGap) + aSide * stroke) * uPx;
  vArc = aArc / uPx; vSide = aSide;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position + vec3(off.x, 0.0, off.y), 1.0);
}`;

const FRAGMENT = `
uniform vec3 uColor; uniform float uOpacity, uPeriod, uDuty, uSolid, uTime, uSpeed;
varying float vArc, vSide;
void main() {
  if (uSolid < 0.5 && fract((vArc - uTime * uSpeed) / uPeriod) > uDuty) discard;
  gl_FragColor = vec4(uColor, (1.0 - smoothstep(0.55, 1.0, abs(vSide))) * uOpacity);
  #include <colorspace_fragment>
}`;

export type ContourBlock = {
  readonly ink: string;
  readonly mine: boolean;
  readonly surveyed: boolean;
  readonly regionIds: ReadonlySet<string>;
};

/**
 * **Qui tient quoi, au contour** (ADR 0033) : un ruban par bloc, à l'encre de son tenant, sur sa
 * frontière extérieure et en retrait chez lui — deux nations voisines tracent donc deux lignes
 * côte à côte. Largeur et tiret se disent en pixels d'écran, et les tirets tournent tous dans le
 * même sens : c'est une couche d'`Ambience`, qui ne fait que pousser `uTime`.
 */
export class ContourLayer implements AmbientLayer {
  readonly fx = 'contours' as const;
  readonly hz = DASH_HZ;
  readonly group = new Group();
  private readonly shared: Record<string, IUniform<number>> = {
    uPx: { value: 0.02 },
    uHalf: { value: 0 },
    uGap: { value: 0 },
    uPeriod: { value: 0 },
    uDuty: { value: 0 },
    uTime: { value: 0 },
  };
  private moving = false;

  constructor(
    private readonly world: WorldFrame,
    /** Au doigt, les tirets avancent avec les images que la carte dessine déjà, sans en demander. */
    readonly passive: boolean,
  ) {
    this.weight = DEFAULT_CONTOUR_WEIGHT;
  }

  set weight(weight: ContourWeight) {
    const { half, gap, period, duty } = WEIGHTS[weight];
    this.shared.uHalf!.value = half;
    this.shared.uGap!.value = gap;
    this.shared.uPeriod!.value = period;
    this.shared.uDuty!.value = duty;
  }

  show(regions: ReadonlyArray<DisplayedRegion>, blocks: ReadonlyArray<ContourBlock>): void {
    this.clear();
    const blockOf = new Map<string, number>();
    blocks.forEach(({ regionIds }, index) => {
      for (const id of regionIds) if (!blockOf.has(id)) blockOf.set(id, index);
    });
    const { outlines, inner } = contourLines(regions, (id) => {
      const index = blockOf.get(id);
      return index === undefined ? undefined : String(index);
    });
    this.add(inner, { ...INNER, centered: true, solid: true, speed: 0 }, 0);
    for (const [index, lines] of outlines) {
      const block = blocks[Number(index)]!;
      this.add(
        lines,
        {
          color: block.ink,
          opacity: block.surveyed ? SURVEYED_OPACITY : CURRENT_OPACITY,
          width: block.mine ? MINE_WIDTH : 1,
          centered: false,
          solid: false,
          speed: block.surveyed ? 0 : DASH_SPEED,
        },
        block.mine ? 2 : 1,
      );
    }
    this.moving = blocks.some(({ surveyed, regionIds }) => !surveyed && regionIds.size > 0);
  }

  /** What a CSS pixel measures on the sheet, at the centre of the view. */
  animate(unitsPerPixel: number): void {
    this.shared.uPx!.value = unitsPerPixel;
  }

  idle(): boolean {
    return !this.moving;
  }

  frame(time: number): void {
    this.shared.uTime!.value = time;
  }

  dispose(): void {
    this.clear();
    this.group.removeFromParent();
  }

  private clear(): void {
    for (const child of this.group.children) {
      const mesh = child as Mesh<BufferGeometry, ShaderMaterial>;
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.group.clear();
  }

  private add(
    lines: ReadonlyArray<ReadonlyArray<Point>>,
    style: {
      color: string;
      opacity: number;
      width: number;
      centered: boolean;
      solid: boolean;
      speed: number;
    },
    order: number,
  ): void {
    if (lines.length === 0) return;
    const material = onLand(
      new ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        transparent: true,
        depthWrite: false,
        uniforms: {
          ...this.shared,
          uColor: { value: new Color(style.color) },
          uOpacity: { value: style.opacity },
          uWidth: { value: style.width },
          uCentered: { value: style.centered ? 1 : 0 },
          uSolid: { value: style.solid ? 1 : 0 },
          uSpeed: { value: style.speed },
        },
      }),
    );
    const mesh = new Mesh(this.ribbon(lines), material);
    mesh.renderOrder = 1 + order;
    mesh.frustumCulled = false;
    this.group.add(mesh);
  }

  /** Two vertices per point, pushed apart in the shader along the mitred normal. */
  private ribbon(lines: ReadonlyArray<ReadonlyArray<Point>>): BufferGeometry {
    const position: number[] = [];
    const normal: number[] = [];
    const side: number[] = [];
    const arc: number[] = [];
    const index: number[] = [];
    const height = COUNTRY_THICKNESS + LIFT;
    for (const points of lines) {
      const n = points.length;
      if (n < 2) continue;
      const closed = points[0]![0] === points[n - 1]![0] && points[0]![1] === points[n - 1]![1];
      const normals: Array<readonly [number, number]> = [];
      for (let i = 0; i < n - 1; i++) {
        const dx = points[i + 1]![0] - points[i]![0];
        const dz = points[i + 1]![1] - points[i]![1];
        const length = Math.hypot(dx, dz) || 1;
        normals.push([-dz / length, dx / length]);
      }
      const base = position.length / 3;
      let along = 0;
      for (let i = 0; i < n; i++) {
        const [x, y] = points[i]!;
        if (i > 0) along += Math.hypot(x - points[i - 1]![0], y - points[i - 1]![1]);
        const before = normals[i - 1] ?? (closed ? normals[n - 2]! : normals[i]!);
        const after = normals[i] ?? (closed ? normals[0]! : normals[i - 1]!);
        let mx = before[0] + after[0];
        let mz = before[1] + after[1];
        const ml = Math.hypot(mx, mz) || 1;
        mx /= ml;
        mz /= ml;
        // The mitre, held short at a sharp corner so a spike never shoots across the map.
        const k = 1 / Math.max(0.35, mx * after[0] + mz * after[1]);
        for (const s of [-1, 1]) {
          position.push(x - this.world.centerX, height, y - this.world.centerY);
          normal.push(mx * k, mz * k);
          side.push(s);
          arc.push(along);
        }
        if (i < n - 1) {
          const v = base + i * 2;
          index.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
        }
      }
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(position, 3));
    geometry.setAttribute('aNormal', new Float32BufferAttribute(normal, 2));
    geometry.setAttribute('aSide', new Float32BufferAttribute(side, 1));
    geometry.setAttribute('aArc', new Float32BufferAttribute(arc, 1));
    geometry.setIndex(index);
    return geometry;
  }
}
