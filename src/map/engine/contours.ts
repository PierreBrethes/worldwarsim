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
import { NIGHT_HERE_GLSL, type NightUniforms } from './night-here';

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
/** **Un relevé : pâle, immobile, et pointillé court** (ADR 0033 §3) — son propre motif, pour qu'un
 *  trait fin se lise encore et ne se confonde jamais avec une région jamais vue ; un plancher de
 *  largeur, pour que le pointillé ne fonde pas en « fins ». @a-mesurer */
const SURVEYED = { opacity: 0.8, duty: 0.35, width: 1.6 };
const INNER = { color: '#7d7466', opacity: 0.55, width: 0.45 };
/** Over the hatch of a suspended zone, under the hover's contour. The lift alone is two depth steps
 *  from far away, where the sheet ate whole stretches of the line: the polygon offset holds it. */
const LIFT = 0.0032;

const VERTEX = `
attribute vec2 aNormal; attribute float aSide, aArc;
uniform float uPx, uHalf, uGap, uWidth, uCentered;
varying float vArc, vSide;
varying vec2 vWorld;
void main() {
  float stroke = uHalf * uWidth;
  vec2 off = aNormal * ((uCentered > 0.5 ? 0.0 : stroke + uGap) + aSide * stroke) * uPx;
  vArc = aArc / uPx; vSide = aSide;
  vWorld = position.xz + off;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position + vec3(off.x, 0.0, off.y), 1.0);
}`;

/**
 * La nuit, au pixel (`nightAtWorld`), l'encre d'une nation s'éclaircit vers un bleu pâle pour rester
 * lisible sous le voile de la lune, qui multiplie tout ce qui est dessous ; les fins traits gris
 * (`uLift` nul) ne font que subir le voile, et s'assombrissent avec la carte.
 */
const FRAGMENT = `
${NIGHT_HERE_GLSL}
uniform vec3 uColor; uniform float uOpacity, uPeriod, uDuty, uOwnDuty, uSolid, uTime, uSpeed, uLift;
varying float vArc, vSide;
varying vec2 vWorld;
void main() {
  float duty = uOwnDuty > 0.0 ? uOwnDuty : uDuty;
  if (uSolid < 0.5 && fract((vArc - uTime * uSpeed) / uPeriod) > duty) discard;
  vec3 ink = mix(uColor, uColor * 0.55 + vec3(0.2, 0.23, 0.34), nightAtWorld(vWorld) * uLift);
  gl_FragColor = vec4(ink, (1.0 - smoothstep(0.55, 1.0, abs(vSide))) * uOpacity);
  #include <colorspace_fragment>
}`;

export type ContourTerritory = {
  readonly ink: string;
  readonly mine: boolean;
  readonly surveyed: boolean;
  readonly regionIds: ReadonlySet<string>;
};

/**
 * **Qui tient quoi, au contour** (ADR 0033) : un ruban par territoire, à l'encre de son tenant, sur sa
 * frontière extérieure et en retrait chez lui — deux nations voisines tracent donc deux lignes
 * côte à côte. Largeur et tiret se disent en pixels d'écran, et les tirets tournent tous dans le
 * même sens : c'est une couche d'`Ambience`, qui ne fait que pousser `uTime`.
 */
export class ContourLayer implements AmbientLayer {
  readonly fx = 'contours' as const;
  readonly hz = DASH_HZ;
  readonly group = new Group();
  private readonly shared: Record<string, IUniform> = {
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
    night: NightUniforms,
  ) {
    Object.assign(this.shared, night);
    this.weight = DEFAULT_CONTOUR_WEIGHT;
  }

  set weight(weight: ContourWeight) {
    const { half, gap, period, duty } = WEIGHTS[weight];
    this.shared.uHalf!.value = half;
    this.shared.uGap!.value = gap;
    this.shared.uPeriod!.value = period;
    this.shared.uDuty!.value = duty;
  }

  show(
    regions: ReadonlyArray<DisplayedRegion>,
    territories: ReadonlyArray<ContourTerritory>,
  ): void {
    this.clear();
    const territoryOf = new Map<string, number>();
    territories.forEach(({ regionIds }, index) => {
      for (const id of regionIds) if (!territoryOf.has(id)) territoryOf.set(id, index);
    });
    const { outlines, inner } = contourLines(regions, (id) => {
      const index = territoryOf.get(id);
      return index === undefined ? undefined : String(index);
    });
    this.add(inner, { ...INNER, centered: true, solid: true, speed: 0 }, 0);
    for (const [index, lines] of outlines) {
      const territory = territories[Number(index)]!;
      this.add(
        lines,
        {
          color: territory.ink,
          opacity: territory.surveyed ? SURVEYED.opacity : CURRENT_OPACITY,
          duty: territory.surveyed ? SURVEYED.duty : 0,
          width: territory.mine ? MINE_WIDTH : territory.surveyed ? SURVEYED.width : 1,
          centered: false,
          solid: false,
          speed: territory.surveyed ? 0 : DASH_SPEED,
        },
        territory.mine ? 2 : 1,
      );
    }
    this.moving = territories.some(({ surveyed, regionIds }) => !surveyed && regionIds.size > 0);
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
      /** Its own dash share, `0` for the weight's. */
      duty?: number;
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
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -4,
        uniforms: {
          ...this.shared,
          uColor: { value: new Color(style.color) },
          uOpacity: { value: style.opacity },
          uWidth: { value: style.width },
          uCentered: { value: style.centered ? 1 : 0 },
          uSolid: { value: style.solid ? 1 : 0 },
          uSpeed: { value: style.speed },
          uOwnDuty: { value: style.duty ?? 0 },
          uLift: { value: style.centered ? 0 : 1 },
        },
      }),
    );
    const mesh = new Mesh(this.ribbon(lines), material);
    // Over the hatch (0), under the hover's contour (1).
    mesh.renderOrder = 0.5 + order / 10;
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
