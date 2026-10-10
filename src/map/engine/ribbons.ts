import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Mesh,
  Plane,
  Raycaster,
  ShaderMaterial,
  Vector2,
  Vector3,
  type PerspectiveCamera,
  type Scene,
  type WebGLRenderer,
} from 'three';
import type { Fx, MapMotion } from '@/domain/map-motion';
import { currentAt } from '@/domain/currents';
import type { LonLat } from '@/domain/geo';
import { windAt, type Wind } from '@/domain/weather';
import type { AmbientLayer } from './ambience';
import { COUNTRY_THICKNESS, type WorldFrame } from './frame';
import { PALETTE } from './palette';

const RIBBON_HZ = 30;
const RIBBON_ALTITUDE = COUNTRY_THICKNESS + 0.004;
const REFERENCE_AREA = 1280 * 800;
const MAX_RIBBONS = 200;
const BIRTHS_PER_STEP = 2;
const STILL_SHARE = 0.05;

type Range = readonly [low: number, high: number];

export type RibbonStyle = {
  readonly fx: Fx;
  readonly field: (lon: number, lat: number, epochMs: number) => Wind;
  /** The field's speed at which a ribbon reaches its full weight. */
  readonly fullForce: number;
  readonly ink: string;
  /** Below the threads (rank 10-12): a ribbon must never be read as a movement. */
  readonly rank: number;
  /** Ribbons per 1280 × 800 screen, scaled by area: as sparse at every window size. */
  readonly perScreen: number;
  readonly history: number;
  readonly speedPx: Range;
  /** Width in pixels: `base + random(widthPx) · (low + high · force) · taper`. */
  readonly widthBase: number;
  readonly widthPx: Range;
  readonly widthByForce: Range;
  /** Opacity: `(low + high · force) · taper · life`. */
  readonly alphaByForce: Range;
  readonly growthS: Range;
  readonly fadeInS: number;
  /** Points the tail eats per step once growth is over, while the head keeps going. */
  readonly tailPerStep: number;
  /** Where a ribbon may be born and go on; touching anywhere else, it stops and fades. */
  readonly afloat?: (lonLat: LonLat) => boolean;
};

export const WIND_RIBBONS: RibbonStyle = {
  fx: 'wind',
  field: windAt,
  fullForce: 2,
  ink: '#f4ecd8',
  rank: 9,
  perScreen: 50,
  history: 70,
  speedPx: [70, 170],
  widthBase: 0.6,
  widthPx: [2.5, 5.5],
  widthByForce: [0.6, 0.4],
  alphaByForce: [0.35, 0.5],
  growthS: [1.2, 2.3],
  fadeInS: 0.4,
  tailPerStep: 2,
};

/**
 * **Les courants** (décision de Pierre, 10/10) : un filigrane d'encre de mer, peu de rubans, longs
 * et lents, sous le vent. Réglage validé sur une démo canvas : 17 rubans sur 1280 × 720.
 */
export const CURRENT_RIBBONS: RibbonStyle = {
  fx: 'sea',
  field: currentAt,
  fullForce: 1,
  ink: PALETTE.seaInk,
  rank: WIND_RIBBONS.rank - 1,
  perScreen: Math.round((17 * 800) / 720),
  history: 100,
  speedPx: [40, 85],
  widthBase: 0.8,
  widthPx: [6, 6],
  widthByForce: [0.5, 0.5],
  // Twice the demo's 0.12-0.15: lit by the scene, the sea darkens toward the ink, and at the
  // demo's value the ribbons vanished on screen.
  alphaByForce: [0.22, 0.08],
  growthS: [8, 12],
  fadeInS: 1.5,
  tailPerStep: 2,
};

/**
 * `?weather=fast`: the sky runs twenty times faster from the page's opening, so a system lives
 * its 45 minutes in about two.
 */
// ponytail: prototype switch for watching the weather; removed before the merge.
const weatherPace = (search: string) =>
  new URLSearchParams(search).get('weather') === 'fast' ? 20 : 1;

const VERTEX = `
attribute vec3 toward;
attribute float side;
attribute float halfWidth;
attribute float alpha;
uniform vec2 resolution;
varying float vAlpha;
varying float vAcross;
void main() {
  vec4 here = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  vec4 there = projectionMatrix * modelViewMatrix * vec4(toward, 1.0);
  vec2 halfScreen = 0.5 * resolution;
  vec2 along = there.xy / there.w * halfScreen - here.xy / here.w * halfScreen;
  float run = length(along);
  along = run > 1e-4 ? along / run : vec2(1.0, 0.0);
  // Extruded in screen pixels, so a ribbon reads the same at every distance.
  here.xy += vec2(-along.y, along.x) * side * (halfWidth + 0.5) / halfScreen * here.w;
  gl_Position = here;
  vAlpha = alpha;
  vAcross = side * (halfWidth + 0.5) / max(halfWidth, 0.3);
}`;

const FRAGMENT = `
uniform vec3 ink;
varying float vAlpha;
varying float vAcross;
void main() {
  gl_FragColor = vec4(ink, vAlpha * (1.0 - smoothstep(0.7, 1.0, abs(vAcross))));
  #include <colorspace_fragment>
}`;

type Ribbon = {
  readonly x: number[];
  readonly z: number[];
  readonly force: number[];
  readonly width: number;
  growth: number;
  stalled: boolean;
  age: number;
  peak: number;
};

const between = ([low, high]: Range) => low + Math.random() * (high - low);

/**
 * **La météo de vent** (décision de Pierre, 10/10) : des rubans qui suivent un champ, ancrés au
 * monde mais pesés en pixels d'écran. Quand un ruban entre dans une dépression, c'est le champ qui
 * fait la volute — rien ici ne la dessine.
 */
export class RibbonLayer implements AmbientLayer {
  readonly fx: Fx;
  readonly hz = RIBBON_HZ;
  private readonly openedAt = Date.now();
  private readonly pace = weatherPace(location.search);
  private readonly ribbons: Ribbon[] = [];
  private readonly mesh: Mesh<BufferGeometry, ShaderMaterial>;
  private readonly positions: BufferAttribute;
  private readonly toward: BufferAttribute;
  private readonly halfWidth: BufferAttribute;
  private readonly alpha: BufferAttribute;
  private readonly index: BufferAttribute;
  private readonly resolution = new Vector2();
  private readonly ray = new Raycaster();
  private readonly ground = new Plane(new Vector3(0, 1, 0), -RIBBON_ALTITUDE);
  private readonly a = new Vector3();
  private readonly b = new Vector3();
  private readonly aim = new Vector2();
  private lastTime = Number.NaN;

  constructor(
    scene: Scene,
    private readonly camera: PerspectiveCamera,
    private readonly renderer: WebGLRenderer,
    private readonly board: WorldFrame,
    private readonly style: RibbonStyle,
  ) {
    this.fx = style.fx;
    const vertices = MAX_RIBBONS * style.history * 2;
    const geometry = new BufferGeometry();
    const attribute = (size: number) =>
      new BufferAttribute(new Float32Array(vertices * size), size);
    this.positions = attribute(3);
    this.toward = attribute(3);
    this.halfWidth = attribute(1);
    this.alpha = attribute(1);
    const side = attribute(1);
    for (let i = 0; i < vertices; i++) side.setX(i, i % 2 === 0 ? 1 : -1);
    this.index = new BufferAttribute(new Uint16Array(MAX_RIBBONS * (style.history - 1) * 6), 1);
    geometry.setAttribute('position', this.positions);
    geometry.setAttribute('toward', this.toward);
    geometry.setAttribute('side', side);
    geometry.setAttribute('halfWidth', this.halfWidth);
    geometry.setAttribute('alpha', this.alpha);
    geometry.setIndex(this.index);
    geometry.setDrawRange(0, 0);

    this.mesh = new Mesh(
      geometry,
      new ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        uniforms: {
          resolution: { value: this.resolution },
          ink: { value: new Color(style.ink) },
        },
      }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = style.rank;
    scene.add(this.mesh);
  }

  frame(time: number, motion: MapMotion): void {
    this.mesh.visible = motion === 'full';
    if (motion !== 'full') {
      this.ribbons.length = 0;
      this.lastTime = Number.NaN;
      return;
    }
    if (time === this.lastTime) return;
    this.lastTime = time;
    this.renderer.getSize(this.resolution);
    const epochMs = this.openedAt + (Date.now() - this.openedAt) * this.pace;
    // A hidden tab comes back with a pile of steps: the sky is a function of the hour, the
    // ribbons are not, so one step is enough to pick up where the wind is now.
    this.step(epochMs);
    this.write();
  }

  private step(epochMs: number): void {
    const { history, tailPerStep } = this.style;
    const target = Math.min(
      MAX_RIBBONS,
      Math.round((this.style.perScreen * this.resolution.x * this.resolution.y) / REFERENCE_AREA),
    );
    for (let births = 0; this.ribbons.length < target && births < BIRTHS_PER_STEP; births++) {
      const ribbon = this.spawn(epochMs);
      if (ribbon !== null) this.ribbons.push(ribbon);
    }

    for (let i = this.ribbons.length - 1; i >= 0; i--) {
      const ribbon = this.ribbons[i]!;
      ribbon.age += 1 / RIBBON_HZ;
      const alive = this.advance(ribbon, epochMs);
      if (ribbon.age > ribbon.growth) {
        ribbon.x.splice(0, tailPerStep);
        ribbon.z.splice(0, tailPerStep);
        ribbon.force.splice(0, tailPerStep);
      } else if (ribbon.x.length > history) {
        ribbon.x.shift();
        ribbon.z.shift();
        ribbon.force.shift();
      }
      ribbon.peak = Math.max(ribbon.peak, ribbon.x.length);
      if (!alive || ribbon.x.length < 2) this.ribbons.splice(i, 1);
    }
  }

  /** A ribbon is born where the player looks: a random screen point, cast onto the board. */
  private spawn(epochMs: number): Ribbon | null {
    this.aim.set(Math.random() * 2 - 1, Math.random() * 2 - 1);
    this.ray.setFromCamera(this.aim, this.camera);
    const hit = this.ray.ray.intersectPlane(this.ground, this.a);
    if (hit === null || !this.onBoard(hit.x, hit.z)) return null;
    const lonLat = this.lonLatOf(hit.x, hit.z);
    if (this.style.afloat && !this.style.afloat(lonLat)) return null;
    // Where the field is still, a ribbon would only drift at its slowest pace and say nothing.
    const { u, v } = this.style.field(lonLat[0], lonLat[1], epochMs);
    if (Math.hypot(u, v) < STILL_SHARE * this.style.fullForce) return null;
    return {
      x: [hit.x],
      z: [hit.z],
      force: [0],
      width: between(this.style.widthPx),
      growth: between(this.style.growthS),
      stalled: false,
      age: 0,
      peak: 1,
    };
  }

  private lonLatOf(x: number, z: number): LonLat {
    return this.board.lonLatAt(x + this.board.centerX, z + this.board.centerY);
  }

  private onBoard(x: number, z: number): boolean {
    const [, lat] = this.board.lonLatAt(x + this.board.centerX, z + this.board.centerY);
    if (Math.abs(lat) > 80) return false;
    const edge = this.board.edgeAtLatitude(lat);
    const projected = x + this.board.centerX;
    return projected > edge.westX && projected < edge.eastX;
  }

  /** The head takes one step along the field, as long on screen whatever the zoom. */
  private advance(ribbon: Ribbon, epochMs: number): boolean {
    if (ribbon.stalled) return true;
    const last = ribbon.x.length - 1;
    const x = ribbon.x[last]!;
    const z = ribbon.z[last]!;
    const lonLat = this.lonLatOf(x, z);
    const { u, v } = this.style.field(lonLat[0], lonLat[1], epochMs);
    const force = Math.min(1, Math.hypot(u, v) / this.style.fullForce);
    ribbon.force[last] = force;

    const here = this.board.projectLonLat(lonLat, 0);
    const east = this.board.projectLonLat([lonLat[0] + 0.5, lonLat[1]], 0).sub(here);
    const north = this.board.projectLonLat([lonLat[0], lonLat[1] + 0.5], 0).sub(here);
    const dx = u * east.x + v * north.x;
    const dz = u * east.z + v * north.z;
    const run = Math.hypot(dx, dz);
    if (run < 1e-6) return true;

    const probe = 0.01;
    const onScreen = this.screenPx(x, z, this.a).distanceTo(
      this.screenPx(x + (dx / run) * probe, z + (dz / run) * probe, this.b),
    );
    if (onScreen < 1e-6) return true;
    const [slow, fast] = this.style.speedPx;
    const pixels = (slow + (fast - slow) * force) / RIBBON_HZ;
    const stride = pixels * (probe / onScreen);
    const nx = x + (dx / run) * stride;
    const nz = z + (dz / run) * stride;
    if (!this.onBoard(nx, nz)) return false;
    if (this.style.afloat && !this.style.afloat(this.lonLatOf(nx, nz))) {
      ribbon.stalled = true;
      ribbon.growth = Math.min(ribbon.growth, ribbon.age);
      return true;
    }
    ribbon.x.push(nx);
    ribbon.z.push(nz);
    ribbon.force.push(force);
    return true;
  }

  private screenPx(x: number, z: number, out: Vector3): Vector3 {
    out.set(x, RIBBON_ALTITUDE + this.board.drop(x, z), z).project(this.camera);
    return out.set(out.x * this.resolution.x * 0.5, out.y * this.resolution.y * 0.5, 0);
  }

  private write(): void {
    let vertex = 0;
    let index = 0;
    const indices = this.index.array as Uint16Array;
    const { widthBase, widthByForce, alphaByForce } = this.style;
    for (const ribbon of this.ribbons) {
      const count = Math.min(ribbon.x.length, this.style.history);
      if (count < 2) continue;
      const life =
        Math.min(1, ribbon.age / this.style.fadeInS) *
        (ribbon.age > ribbon.growth ? count / ribbon.peak : 1);
      for (let k = 0; k < count; k++) {
        const x = ribbon.x[k]!;
        const z = ribbon.z[k]!;
        const next = k + 1 < count ? k + 1 : k - 1;
        const sign = k + 1 < count ? 1 : -1;
        const tx = x + sign * (ribbon.x[next]! - x);
        const tz = z + sign * (ribbon.z[next]! - z);
        const force = ribbon.force[k]!;
        const taper = Math.sin((Math.PI * k) / (count - 1)) ** 0.8;
        const width =
          widthBase + ribbon.width * (widthByForce[0] + widthByForce[1] * force) * taper;
        const alpha = Math.min(1, (alphaByForce[0] + alphaByForce[1] * force) * taper * life);
        for (let s = 0; s < 2; s++) {
          this.positions.setXYZ(vertex, x, RIBBON_ALTITUDE + this.board.drop(x, z), z);
          this.toward.setXYZ(vertex, tx, RIBBON_ALTITUDE + this.board.drop(tx, tz), tz);
          this.halfWidth.setX(vertex, width / 2);
          this.alpha.setX(vertex, alpha);
          vertex++;
        }
        if (k > 0) {
          const a = vertex - 4;
          indices.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], index);
          index += 6;
        }
      }
    }
    for (const attribute of [this.positions, this.toward, this.halfWidth, this.alpha, this.index]) {
      attribute.needsUpdate = true;
    }
    this.mesh.geometry.setDrawRange(0, index);
  }
}
