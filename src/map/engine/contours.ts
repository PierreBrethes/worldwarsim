import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  Mesh,
  ShaderMaterial,
  type IUniform,
} from 'three';
import type { Atlas, Detail } from '@/domain/atlas';
import {
  contourLines,
  DEFAULT_CONTOUR_WEIGHT,
  type ContourLine,
  type ContourWeight,
} from '@/domain/contours';
import type { AmbientLayer } from './ambience';
import { COUNTRY_THICKNESS, type WorldFrame } from './frame';
import { NIGHT_HERE_GLSL, type NightUniforms } from './night-here';

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
/** Over the hatch of a suspended zone, and over the coast and the ink (`BORDER_LIFT`, 0.004), which
 *  the line now lies on wherever the other side is not a territory (#217); the hover's contour
 *  still comes after it (render order), the contour writing no depth. The lift alone is two depth
 *  steps from far away, where the sheet ate whole stretches of the line: the polygon offset holds
 *  it. */
const LIFT = 0.0045;

const VERTEX = `
attribute vec2 aNormal; attribute float aSide, aArc, aInset;
uniform float uPx, uHalf, uGap, uWidth;
varying float vArc, vSide;
varying vec2 vWorld;
void main() {
  float stroke = uHalf * uWidth;
  vec2 off = aNormal * (aInset * (stroke + uGap) + aSide * stroke) * uPx;
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
 * frontière extérieure — posé dessus face au vide, en retrait chez lui face à un autre territoire,
 * où deux nations voisines tracent donc deux lignes côte à côte. Largeur et tiret se disent en pixels d'écran, et les tirets tournent tous dans le
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
  private territories: ReadonlyArray<ContourTerritory> = [];
  private drawn: { atlas: Atlas; detail: Detail } | null = null;

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

  show(territories: ReadonlyArray<ContourTerritory>, atlas: Atlas, detail: Detail): void {
    this.territories = territories;
    this.drawn = null;
    this.level(atlas, detail);
  }

  /** The same territories on the arcs of another level: the coast and the ink switched too. */
  level(atlas: Atlas, detail: Detail): void {
    if (this.drawn?.atlas === atlas && this.drawn.detail === detail) return;
    this.drawn = { atlas, detail };
    this.clear();
    const territories = this.territories;
    const territoryOf = new Map<string, number>();
    territories.forEach(({ regionIds }, index) => {
      for (const id of regionIds) if (!territoryOf.has(id)) territoryOf.set(id, index);
    });
    const { outlines, inner } = contourLines(
      atlas,
      (id) => {
        const index = territoryOf.get(id);
        return index === undefined ? undefined : String(index);
      },
      detail,
    );
    this.add(
      inner.map((points) => ({ points, inset: false })),
      { ...INNER, lift: 0, solid: true, speed: 0 },
      0,
    );
    for (const [index, lines] of outlines) {
      const territory = territories[Number(index)]!;
      this.add(
        lines,
        {
          color: territory.ink,
          opacity: territory.surveyed ? SURVEYED.opacity : CURRENT_OPACITY,
          duty: territory.surveyed ? SURVEYED.duty : 0,
          width: territory.mine ? MINE_WIDTH : territory.surveyed ? SURVEYED.width : 1,
          lift: 1,
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
    lines: ReadonlyArray<ContourLine>,
    style: {
      color: string;
      opacity: number;
      width: number;
      /** How far the ink pales towards the moon's blue at night: `0` for the grey lines. */
      lift: number;
      solid: boolean;
      speed: number;
      /** Its own dash share, `0` for the weight's. */
      duty?: number;
    },
    order: number,
  ): void {
    if (lines.length === 0) return;
    // Not clipped to the land (`onLand`): the line lies on the coast, on the atlas's own arcs, and
    // half of it would be cut off over the sea.
    const material = new ShaderMaterial({
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
        uSolid: { value: style.solid ? 1 : 0 },
        uSpeed: { value: style.speed },
        uOwnDuty: { value: style.duty ?? 0 },
        uLift: { value: style.lift },
      },
    });
    const mesh = new Mesh(this.ribbon(lines), material);
    // Over the hatch (0), under the hover's contour (1).
    mesh.renderOrder = 0.5 + order / 10;
    mesh.frustumCulled = false;
    this.group.add(mesh);
  }

  /** Two vertices per point, pushed apart in the shader along the mitred normal. */
  private ribbon(lines: ReadonlyArray<ContourLine>): BufferGeometry {
    const position: number[] = [];
    const normal: number[] = [];
    const side: number[] = [];
    const arc: number[] = [];
    const inset: number[] = [];
    const index: number[] = [];
    const height = COUNTRY_THICKNESS + LIFT;
    for (const { points: flat, inset: setBack } of lines) {
      const n = flat.length / 2;
      if (n < 2) continue;
      const points = Array.from({ length: n }, (_, i) => [flat[2 * i]!, flat[2 * i + 1]!] as const);
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
          inset.push(setBack ? 1 : 0);
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
    geometry.setAttribute('aInset', new Float32BufferAttribute(inset, 1));
    geometry.setIndex(index);
    return geometry;
  }
}
