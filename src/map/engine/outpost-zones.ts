import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  Mesh,
  ShaderMaterial,
  Vector3,
} from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import type { LonLat } from '@/domain/geo';
import type { MapMotion } from '@/domain/map-motion';
import { COUNTRY_THICKNESS, type WorldFrame } from './frame';
import { NIGHT_HERE_GLSL, type NightUniforms } from './night-here';
import { PALETTE } from './palette';
import { circleAround, KM_PER_DEGREE, LIFT, lonLatAround, SEGMENTS } from './reach';

/** One of my outposts on watch (`isOnWatch`), as the layer draws it. */
export type ZonePoint = {
  /** Its station key (`stationKeyOf`): what a hover and an open garrison name. */
  readonly id: string;
  readonly lonLat: LonLat;
  readonly reachKm: number;
  /** `null` without coal (`listeningSilent`): no lookout ring, the liaisons stay. */
  readonly lookoutKm: number | null;
  /** A Guet watches its whole reach (ADR 0037 §5). */
  readonly wholeLookout: boolean;
};

/**
 * **What is in hand** (#375, décisions du 02/11): a pile lifted graduates every point with its
 * lookout, a building held every point's reach alone; a hover or an open garrison, its point.
 */
export type ZoneFocus = {
  readonly points: 'all' | ReadonlyArray<string>;
  readonly lookout: boolean;
} | null;

/** A km label the board writes at a ring's top (or foot, for a Guet's whole lookout). */
export type ZoneLabel = {
  readonly lonLat: LonLat;
  readonly km: number;
  readonly kind: 'reach' | 'lookout' | 'whole';
};

const INK = PALETTE.border;
/**
 * **Le lavis se lit sans peser** (ADR 0033 : une carte sans aplat) : à peine plus qu'un papier
 * teinté, sous les tirets des régions tenues. Un peu plus quand une pile ou un bâtiment est en
 * main, où il dit où l'ordre porte. @a-mesurer
 */
const REST_WASH = 0.07;
/** The wash by night, a paper the moon lights. @a-mesurer */
const MOON = PALETTE.paper;
const HAND_WASH = 0.11;
/** A liaison at rest, a thin pen; sharper under the hand. In CSS pixels. @a-mesurer */
const LIAISON_REST = { opacity: 0.5, width: 1.2 };
const LIAISON_SHARP = { opacity: 0.85, width: 2 };
const COMPASS_OPACITY = 0.8;
/** Under `SETTLE_MS`: the hover's fade needs no word to the frame loop. @a-mesurer */
const FADE_MS = 180;
/** Graduations every ten degrees, longer every thirty, as a share of the radius. @a-mesurer */
const TICK_SHORT = 0.025;
const TICK_LONG = 0.05;
/** The lookout's dots round a ring. @a-mesurer */
const LOOKOUT_DOTS = 90;
/** A Guet's dotted ring sits just inside its reach, so the two read apart. @a-mesurer */
const WHOLE_INSET = 0.97;
/** Beyond, a point's disc darkens where it overlaps another: one player's network, in practice. */
// ponytail: discs only skip the first MAX_DISCS before them; a uniform texture lifts the cap.
const MAX_DISCS = 64;

const VERTEX = `
attribute vec2 aLonLat;
attribute float aIndex;
varying vec2 vLonLat;
varying float vIndex;
varying vec2 vWorld;
void main() {
  vLonLat = aLonLat;
  vIndex = aIndex;
  vWorld = (modelMatrix * vec4(position, 1.0)).xz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// A pixel takes the wash once: a disc leaves to those before it the ground they already cover,
// measured as the rings are walked (`lonLatAround`). The antimeridian is not crossed.
const FRAGMENT = `
${NIGHT_HERE_GLSL}
uniform vec3 uMoon;
uniform vec3 uDiscs[${MAX_DISCS}];
uniform vec3 uInk;
uniform float uAlpha;
varying vec2 vLonLat;
varying float vIndex;
varying vec2 vWorld;
void main() {
  for (int j = 0; j < ${MAX_DISCS}; j++) {
    if (float(j) > vIndex - 0.5) break;
    vec3 disc = uDiscs[j];
    vec2 d = (vLonLat - disc.xy) * vec2(${KM_PER_DEGREE} * max(0.05, cos(radians(disc.y))), ${KM_PER_DEGREE});
    if (dot(d, d) < disc.z * disc.z) discard;
  }
  // By night an ink wash is lost on the dark sheet: the wash turns to paper, a moonlit ground.
  gl_FragColor = vec4(mix(uInk, uMoon, nightAtWorld(vWorld)), uAlpha);
}`;

/**
 * **Les zones et les liaisons de mes avant-postes** (ADR 0037 §8, §9 ; #375). Au repos, un lavis
 * d'un seul tenant — les recouvrements ne foncent pas — et un trait fin par liaison tracée
 * (`drawnLiaisonsOf`). Sous la main, le cercle gradué du rayon de contrôle et, pointillé, celui
 * de la vigie, et des liaisons plus nettes. Le lavis et les liaisons sont du sol : la nuit les
 * baisse avec lui. Le compas se lit par-dessus, comme l'anneau d'une pile.
 */
export class OutpostZones {
  readonly object = new Group();
  private readonly wash: Mesh<BufferGeometry, ShaderMaterial>;
  private points: ReadonlyArray<ZonePoint> = [];
  private liaisons: Array<{ readonly a: string; readonly b: string; readonly line: Fat }> = [];
  private compasses = new Map<string, Compass>();
  private focused: ZoneFocus = null;
  /** Each point's emphasis on its way to its target: its reach ring, its lookout ring. */
  private shown = new Map<string, { reach: number; lookout: number }>();
  private size: readonly [number, number] = [1, 1];
  private stepAt = 0;

  constructor(
    private readonly frame: WorldFrame,
    night: NightUniforms,
  ) {
    this.wash = new Mesh(
      new BufferGeometry(),
      new ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        uniforms: {
          uDiscs: { value: Array.from({ length: MAX_DISCS }, () => new Vector3()) },
          uInk: { value: new Color(INK) },
          uAlpha: { value: REST_WASH },
          uMoon: { value: new Color(MOON) },
          ...night,
        },
        transparent: true,
        depthWrite: false,
      }),
    );
    // Over the terrain drawings and the contours, under the night's shade (2).
    this.wash.renderOrder = 1.8;
    this.wash.frustumCulled = false;
    this.wash.raycast = () => {};
    this.object.add(this.wash);
  }

  show(points: ReadonlyArray<ZonePoint>, liaisons: ReadonlyArray<readonly [string, string]>): void {
    this.clear();
    this.points = points;
    this.writeWash();
    const at = new Map(points.map((point) => [point.id, point.lonLat] as const));
    this.liaisons = liaisons.flatMap(([a, b]) => {
      const from = at.get(a);
      const to = at.get(b);
      if (from === undefined || to === undefined) return [];
      const line = new Fat(false, 1.85, true);
      line.write(this.segment(from, to));
      return [{ a, b, line }];
    });
    for (const point of points) this.compasses.set(point.id, new Compass(this.frame, point));
    for (const { line } of this.liaisons) this.object.add(line.line);
    for (const compass of this.compasses.values()) this.object.add(compass.object);
    this.resize(...this.size);
    this.step(true);
  }

  focus(focus: ZoneFocus): void {
    this.focused = focus;
    this.wash.material.uniforms.uAlpha!.value = focus?.points === 'all' ? HAND_WASH : REST_WASH;
  }

  /** The kilometres the board writes, for each point under the hand. */
  labels(): ReadonlyArray<ZoneLabel> {
    const focus = this.focused;
    if (focus === null) return [];
    return this.points
      .filter(({ id }) => focus.points === 'all' || focus.points.includes(id))
      .flatMap(({ lonLat, reachKm, lookoutKm, wholeLookout }): ZoneLabel[] => [
        { lonLat: lonLatAround(lonLat, reachKm, 0), km: reachKm, kind: 'reach' },
        ...(!focus.lookout || lookoutKm === null
          ? []
          : wholeLookout
            ? [
                {
                  lonLat: lonLatAround(lonLat, reachKm, Math.PI),
                  km: lookoutKm,
                  kind: 'whole' as const,
                },
              ]
            : [
                {
                  lonLat: lonLatAround(lonLat, lookoutKm, 0),
                  km: lookoutKm,
                  kind: 'lookout' as const,
                },
              ]),
      ]);
  }

  /** A liaison's straight stroke on the board, for the pen that traces a newborn one. */
  segment(from: LonLat, to: LonLat): ReadonlyArray<number> {
    return Array.from({ length: 25 }, (_, i) =>
      this.frame
        .projectLonLat(
          [from[0] + ((to[0] - from[0]) * i) / 24, from[1] + ((to[1] - from[1]) * i) / 24],
          COUNTRY_THICKNESS + LIFT,
        )
        .toArray(),
    ).flat();
  }

  resize(width: number, height: number): void {
    this.size = [width, height];
    for (const { line } of this.liaisons) line.resize(width, height);
    for (const compass of this.compasses.values()) compass.resize(width, height);
  }

  /** The hover's short fade at full motion, at once otherwise (`map-motion`). */
  animate(now: number, motion: MapMotion): void {
    const elapsed = now - this.stepAt;
    this.stepAt = now;
    this.step(motion !== 'full', elapsed / FADE_MS);
  }

  dispose(): void {
    this.clear();
    this.wash.geometry.dispose();
    this.wash.material.dispose();
    this.object.removeFromParent();
  }

  private step(snap: boolean, by = 1): void {
    const focus = this.focused;
    for (const { id } of this.points) {
      const held = focus !== null && (focus.points === 'all' || focus.points.includes(id));
      const target = { reach: held ? 1 : 0, lookout: held && focus.lookout ? 1 : 0 };
      const was = this.shown.get(id) ?? { reach: 0, lookout: 0 };
      const toward = (from: number, to: number) =>
        snap ? to : from + Math.sign(to - from) * Math.min(Math.abs(to - from), Math.max(0, by));
      const now = {
        reach: toward(was.reach, target.reach),
        lookout: toward(was.lookout, target.lookout),
      };
      this.shown.set(id, now);
      this.compasses.get(id)?.emphasise(now.reach, now.lookout);
    }
    for (const { a, b, line } of this.liaisons) {
      const e = Math.max(this.shown.get(a)?.reach ?? 0, this.shown.get(b)?.reach ?? 0);
      line.material.opacity =
        LIAISON_REST.opacity + (LIAISON_SHARP.opacity - LIAISON_REST.opacity) * e;
      line.material.linewidth = LIAISON_REST.width + (LIAISON_SHARP.width - LIAISON_REST.width) * e;
    }
  }

  /** Every disc a fan from its point, each vertex with its lon/lat and the disc's rank. */
  private writeWash(): void {
    const positions: number[] = [];
    const lonLats: number[] = [];
    const ranks: number[] = [];
    this.points.forEach(({ lonLat, reachKm }, rank) => {
      const rim = Array.from({ length: SEGMENTS + 1 }, (_, step) =>
        lonLatAround(lonLat, reachKm, (step / SEGMENTS) * Math.PI * 2),
      );
      for (let step = 0; step < SEGMENTS; step += 1)
        for (const vertex of [lonLat, rim[step + 1]!, rim[step]!]) {
          positions.push(
            ...this.frame.projectLonLat(vertex, COUNTRY_THICKNESS + LIFT / 2).toArray(),
          );
          lonLats.push(...vertex);
          ranks.push(rank);
        }
    });
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.setAttribute('aLonLat', new Float32BufferAttribute(lonLats, 2));
    geometry.setAttribute('aIndex', new Float32BufferAttribute(ranks, 1));
    this.wash.geometry.dispose();
    this.wash.geometry = geometry;
    const discs = this.wash.material.uniforms.uDiscs!.value as Vector3[];
    this.points
      .slice(0, MAX_DISCS)
      .forEach(({ lonLat, reachKm }, rank) => discs[rank]!.set(lonLat[0], lonLat[1], reachKm));
    this.wash.visible = this.points.length > 0;
  }

  private clear(): void {
    for (const { line } of this.liaisons) line.dispose();
    for (const compass of this.compasses.values()) compass.dispose();
    this.liaisons = [];
    this.compasses.clear();
  }
}

/** A fat line: a `LineBasicMaterial` ignores its width in WebGL (`reach.ts`). */
class Fat {
  readonly line: Line2;
  readonly material: LineMaterial;
  private readonly geometry = new LineGeometry();

  constructor(
    private readonly dotted: boolean,
    renderOrder: number,
    /** Of the ground: hidden behind a maquette, lowered by the night. */
    ground = false,
  ) {
    this.material = new LineMaterial({
      color: INK,
      linewidth: 1.2,
      transparent: true,
      opacity: 0,
      depthTest: ground,
      depthWrite: false,
      dashed: dotted,
    });
    this.line = new Line2(this.geometry, this.material);
    this.line.renderOrder = renderOrder;
    this.line.frustumCulled = false;
  }

  write(positions: ReadonlyArray<number>, perimeter = 0): void {
    this.geometry.setPositions([...positions]);
    this.geometry.computeBoundingSphere();
    if (!this.dotted) return;
    const period = perimeter / LOOKOUT_DOTS;
    this.material.dashSize = period * 0.35;
    this.material.gapSize = period * 0.65;
    this.line.computeLineDistances();
  }

  resize(width: number, height: number): void {
    this.material.resolution.set(width, height);
  }

  dispose(): void {
    this.line.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }
}

/** **Le cercle gradué** d'un point (POC `compas.html`) : son rayon de contrôle, ses graduations
 *  vers le dehors, et sa vigie en pointillé — au ras du rayon pour un Guet. */
class Compass {
  readonly object = new Group();
  private readonly reach = new Fat(false, 3);
  private readonly lookout = new Fat(true, 3);
  private readonly ticks: LineSegments2;
  private readonly tickMaterial: LineMaterial;
  private readonly hasLookout: boolean;

  constructor(frame: WorldFrame, point: ZonePoint) {
    const ring = circleAround(frame, point.lonLat, point.reachKm);
    this.reach.write(ring.positions);
    this.hasLookout = point.lookoutKm !== null;
    if (point.lookoutKm !== null) {
      const km = point.wholeLookout ? point.reachKm * WHOLE_INSET : point.lookoutKm;
      const dots = circleAround(frame, point.lonLat, km);
      this.lookout.write(dots.positions, dots.perimeter);
    }
    const positions: number[] = [];
    for (let degree = 0; degree < 360; degree += 10) {
      const angle = (degree * Math.PI) / 180;
      const length = degree % 30 === 0 ? TICK_LONG : TICK_SHORT;
      for (const km of [point.reachKm, point.reachKm * (1 + length)])
        positions.push(
          ...frame
            .projectLonLat(lonLatAround(point.lonLat, km, angle), COUNTRY_THICKNESS + LIFT)
            .toArray(),
        );
    }
    const geometry = new LineSegmentsGeometry();
    geometry.setPositions(positions);
    this.tickMaterial = new LineMaterial({
      color: INK,
      linewidth: 1,
      transparent: true,
      opacity: 0,
      depthTest: false,
    });
    this.ticks = new LineSegments2(geometry, this.tickMaterial);
    this.ticks.renderOrder = 3;
    this.ticks.frustumCulled = false;
    this.object.add(this.reach.line, this.lookout.line, this.ticks);
    this.object.visible = false;
  }

  emphasise(reach: number, lookout: number): void {
    this.object.visible = reach > 0;
    this.reach.material.opacity = COMPASS_OPACITY * reach;
    this.tickMaterial.opacity = COMPASS_OPACITY * reach;
    this.lookout.line.visible = this.hasLookout && lookout > 0;
    this.lookout.material.opacity = COMPASS_OPACITY * lookout;
  }

  resize(width: number, height: number): void {
    this.reach.resize(width, height);
    this.lookout.resize(width, height);
    this.tickMaterial.resolution.set(width, height);
  }

  dispose(): void {
    this.object.removeFromParent();
    this.reach.dispose();
    this.lookout.dispose();
    this.ticks.geometry.dispose();
    this.tickMaterial.dispose();
  }
}
