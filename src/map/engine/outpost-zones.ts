import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  Mesh,
  type Raycaster,
  ShaderMaterial,
  Vector3,
} from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { shortestLongitudeGap, type LonLat } from '@/domain/geo';
import { sameLiaison } from '@/domain/outposts';
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
 * lookout; a hover or an open garrison, its point. Only the `labelled` points write their km: a
 * lifted pile labelling every ring covered the map with them.
 */
export type ZoneFocus = {
  readonly points: 'all' | ReadonlyArray<string>;
  readonly lookout: boolean;
  readonly labelled: ReadonlyArray<string>;
} | null;

/** A point whose reach a held building reads (`reachesOf`, a disabled one too): the pose's. */
export type HeldReach = { readonly lonLat: LonLat; readonly reachKm: number };

/** A km label the board writes at a ring's top (or foot, for a Guet's whole lookout). */
export type ZoneLabel = {
  readonly lonLat: LonLat;
  readonly km: number;
  readonly kind: 'reach' | 'lookout' | 'whole';
};

const INK = PALETTE.border;
/**
 * **Le lavis se lit sans peser** (ADR 0033 : une carte sans aplat) : à peine plus qu'un papier
 * teinté, sous les tirets des régions tenues. Un peu plus quand une pile est en main, où il dit
 * où l'ordre porte. @a-mesurer
 */
const REST_WASH = 0.07;
/** The wash by night, a paper the moon lights. @a-mesurer */
const MOON = PALETTE.paper;
const HAND_WASH = 0.11;
/** A liaison at rest, a thin pen; sharper under the hand. In CSS pixels. @a-mesurer */
const LIAISON_REST = { opacity: 0.5, width: 1.2 };
const LIAISON_SHARP = { opacity: 0.85, width: 2 };
/**
 * **Une liaison sous ronde se lit sur son trait** (ADR 0037 §10, #377), comme l'aperçu des rondes
 * de `WWS/prototypes/avant-postes` (`paintRonde`) : à l'encre de ma nation, nette, en tiret-point
 * `[10, 4, 2, 4]`, et une dent de 6 tous les 16 vers le dehors du réseau — en pixels d'écran,
 * pour qu'elle se lise de l'Europe entière comme de près. Calque éteint aussi, comme l'arc d'un
 * ordre en cours (Décisions du 02/11). @a-mesurer
 */
const WATCH = { opacity: 0.85, width: 2, dash: 10, gap: 4, dot: 2 } as const;
const TOOTH = { length: 6, every: 16, width: 1.2 } as const;
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
/** One player's network, in practice. */
// ponytail: past 64 points the overlaps darken (a disc skips only the first 64); a texture lifts it.
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
  private liaisons: Array<{
    readonly a: string;
    readonly b: string;
    /** Le trait d'une liaison, ou la ligne de guet d'une liaison sous ronde. */
    readonly line: Fat | WatchLine;
  }> = [];
  /** Kept for a watch line born between two frames. */
  private unitsPerPixel = 1;
  private compasses = new Map<string, Compass>();
  /** **Le rayon que lit la pose d'un bâtiment** (#239), hors du calque : il remplace `ReachRings`. */
  private held: Array<{ readonly reach: HeldReach; readonly compass: Compass }> = [];
  private focused: ZoneFocus = null;
  /** Shown for a patrol troop in hand only: sharp at once. */
  private linesOnly = false;
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

  show(
    points: ReadonlyArray<ZonePoint>,
    liaisons: ReadonlyArray<readonly [string, string]>,
    /** **Les liaisons seules** (#376) : une troupe de ronde en main les montre, calque éteint. */
    linesOnly = false,
    /** Celles où tourne une de mes rondes (#377), et l'encre de ma nation. */
    patrol: {
      readonly liaisons: ReadonlyArray<readonly [string, string]>;
      readonly ink: string;
    } = {
      liaisons: [],
      ink: INK,
    },
  ): void {
    this.clear();
    this.linesOnly = linesOnly;
    this.points = linesOnly ? [] : points;
    this.writeWash();
    const at = new Map(points.map((point) => [point.id, point.lonLat] as const));
    /** Le dehors du réseau : à l'opposé du centre de mes points. */
    const middle = this.frame.projectLonLat(
      [
        points.reduce(
          (sum, point) =>
            sum +
            points[0]!.lonLat[0] +
            shortestLongitudeGap(points[0]!.lonLat[0], point.lonLat[0]),
          0,
        ) / Math.max(1, points.length),
        points.reduce((sum, point) => sum + point.lonLat[1], 0) / Math.max(1, points.length),
      ],
      0,
    );
    this.liaisons = liaisons.flatMap(([a, b]) => {
      const from = at.get(a);
      const to = at.get(b);
      if (from === undefined || to === undefined) return [];
      const segment = this.segment(from, to);
      if (!patrol.liaisons.some((pair) => sameLiaison(pair, [a, b]))) {
        const line = new Fat(false, 1.85, true);
        line.write(segment);
        return [{ a, b, line: line as Fat | WatchLine }];
      }
      const line = new WatchLine(segment, patrol.ink, middle);
      line.scale(this.unitsPerPixel);
      return [{ a, b, line }];
    });
    for (const point of this.points) this.compasses.set(point.id, new Compass(this.frame, point));
    for (const { line } of this.liaisons) this.object.add(line.object);
    for (const compass of this.compasses.values()) this.object.add(compass.object);
    this.resize(...this.size);
    // A new view mid-fade carries on from where the fade was.
    this.step(false, 0);
  }

  /** The reach of every standing point of mine while a building is held, or nothing. */
  hold(reaches: ReadonlyArray<HeldReach>): void {
    for (const { compass } of this.held) compass.dispose();
    this.held = reaches.map((reach) => {
      const compass = new Compass(this.frame, {
        id: '',
        ...reach,
        lookoutKm: null,
        wholeLookout: false,
      });
      compass.resize(...this.size);
      compass.emphasise(1, 0);
      this.object.add(compass.object);
      return { reach, compass };
    });
  }

  focus(focus: ZoneFocus): void {
    this.focused = focus;
    this.stepAt = performance.now();
    this.wash.material.uniforms.uAlpha!.value = focus?.points === 'all' ? HAND_WASH : REST_WASH;
  }

  /** The kilometres the board writes, for each point under the hand. */
  labels(): ReadonlyArray<ZoneLabel> {
    const focus = this.focused;
    const held = this.held.map(({ reach: { lonLat, reachKm } }): ZoneLabel => ({
      lonLat: lonLatAround(lonLat, reachKm, 0),
      km: reachKm,
      kind: 'reach',
    }));
    if (focus === null) return held;
    return this.points
      .filter(({ id }) => focus.labelled.includes(id))
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
      ])
      .concat(held);
  }

  /** **The liaison under the ray** (#376): what a patrol troop is let go on, by its two ids. */
  liaisonUnder(ray: Raycaster): readonly [string, string] | null {
    const lines = this.liaisons.map(({ line }) => line.line);
    const [hit] = ray.intersectObjects(lines, false);
    const liaison =
      hit === undefined ? undefined : this.liaisons[lines.indexOf(hit.object as Line2)];
    return liaison === undefined ? null : [liaison.a, liaison.b];
  }

  /** A liaison's straight stroke on the board, for the pen that traces a newborn one. */
  segment(from: LonLat, to: LonLat): ReadonlyArray<number> {
    const reach = shortestLongitudeGap(from[0], to[0]);
    return Array.from({ length: 25 }, (_, i) =>
      this.frame
        .projectLonLat(
          [from[0] + (reach * i) / 24, from[1] + ((to[1] - from[1]) * i) / 24],
          COUNTRY_THICKNESS + LIFT,
        )
        .toArray(),
    ).flat();
  }

  resize(width: number, height: number): void {
    this.size = [width, height];
    for (const { line } of this.liaisons) line.resize(width, height);
    for (const compass of this.compasses.values()) compass.resize(width, height);
    for (const { compass } of this.held) compass.resize(width, height);
  }

  /** The hover's short fade at full motion, at once otherwise (`map-motion`). */
  animate(now: number, motion: MapMotion, unitsPerPixel: number): void {
    this.unitsPerPixel = unitsPerPixel;
    for (const { line } of this.liaisons) if (line instanceof WatchLine) line.scale(unitsPerPixel);
    const elapsed = now - this.stepAt;
    this.stepAt = now;
    this.step(motion !== 'full', elapsed / FADE_MS);
  }

  dispose(): void {
    this.clear();
    this.hold([]);
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
      if (line instanceof WatchLine) continue;
      const e = this.linesOnly
        ? 1
        : Math.max(this.shown.get(a)?.reach ?? 0, this.shown.get(b)?.reach ?? 0);
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
  get object(): Line2 {
    return this.line;
  }
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

/**
 * **La ligne de guet** : trois traits sur la liaison, le tiret et le point du tiret-point, et les
 * dents — un trait épais de leur longueur, tiré en tirets de leur épaisseur, décalé d'une
 * demi-dent vers le dehors. Les tirets se règlent en pixels d'écran à chaque image (`scale`).
 */
class WatchLine {
  readonly object = new Group();
  readonly line: Line2;
  private readonly strokes: ReadonlyArray<Line2>;
  private readonly teeth: Line2;
  /** Perpendicular to the liaison on the board, toward the outside of my network. */
  private readonly outward = new Vector3();

  constructor(positions: ReadonlyArray<number>, ink: string, middle: Vector3) {
    const period = WATCH.dash + WATCH.gap + WATCH.dot + WATCH.gap;
    const stroke = (width: number, dash: number, offset: number, every: number) => {
      const geometry = new LineGeometry();
      geometry.setPositions([...positions]);
      const material = new LineMaterial({
        color: ink,
        linewidth: width,
        transparent: true,
        opacity: WATCH.opacity,
        depthTest: true,
        depthWrite: false,
        dashed: true,
        dashSize: dash,
        gapSize: every - dash,
        dashOffset: offset,
      });
      const line = new Line2(geometry, material);
      line.computeLineDistances();
      line.renderOrder = 1.85;
      line.frustumCulled = false;
      this.object.add(line);
      return line;
    };
    this.line = stroke(WATCH.width, WATCH.dash, 0, period);
    this.strokes = [
      this.line,
      stroke(WATCH.width, WATCH.dot, period - WATCH.dash - WATCH.gap, period),
    ];
    this.teeth = stroke(TOOTH.length, TOOTH.width, 0, TOOTH.every);
    this.teeth.raycast = () => {};
    this.strokes[1]!.raycast = () => {};
    const [x0, , z0] = positions;
    const [x1, , z1] = positions.slice(-3);
    this.outward.set(-(z1! - z0!), 0, x1! - x0!).normalize();
    const mid = new Vector3((x0! + x1!) / 2, 0, (z0! + z1!) / 2).sub(middle.setY(0));
    if (this.outward.dot(mid) < 0) this.outward.negate();
  }

  scale(unitsPerPixel: number): void {
    for (const line of [...this.strokes, this.teeth])
      (line.material as LineMaterial).dashScale = 1 / unitsPerPixel;
    this.teeth.position.copy(this.outward).multiplyScalar((TOOTH.length / 2) * unitsPerPixel);
  }

  resize(width: number, height: number): void {
    for (const line of [...this.strokes, this.teeth])
      (line.material as LineMaterial).resolution.set(width, height);
  }

  dispose(): void {
    this.object.removeFromParent();
    for (const line of [...this.strokes, this.teeth]) {
      line.geometry.dispose();
      (line.material as LineMaterial).dispose();
    }
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
