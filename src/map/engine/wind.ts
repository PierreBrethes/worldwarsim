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
import type { MapMotion } from '@/domain/map-motion';
import { windAt } from '@/domain/weather';
import type { AmbientLayer } from './ambience';
import { COUNTRY_THICKNESS, type WorldFrame } from './frame';

const WIND_HZ = 30;
/** Below the threads (rank 10-12): a ribbon of wind must never be read as a movement. */
const RIBBON_RANK = 9;
const RIBBON_ALTITUDE = COUNTRY_THICKNESS + 0.004;
const PAPER = '#f4ecd8';
/** Ribbons per 1280 × 800 screen, scaled by area: the sky is as sparse at every window size. */
const RIBBONS_PER_SCREEN = 50;
const REFERENCE_AREA = 1280 * 800;
const MAX_RIBBONS = 200;
const HISTORY = 70;
const SPEED_PX_S = [70, 170] as const;
const WIDTH_PX = [2.5, 5.5] as const;
const GROWTH_S = [1.2, 2.3] as const;
const FADE_IN_S = 0.4;
/** Points the tail eats per step once growth is over, while the head keeps going. */
const TAIL_PER_STEP = 2;
const BIRTHS_PER_STEP = 2;
/** Force read by the ink: the field runs 0 to 2, a ribbon's weight 0 to 1. */
const forceOf = (u: number, v: number) => Math.min(1, Math.hypot(u, v) / 2);

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
  readonly growth: number;
  age: number;
  peak: number;
};

const between = ([low, high]: readonly [number, number]) => low + Math.random() * (high - low);

/**
 * **La météo de vent** (décision de Pierre, 10/10) : des rubans qui suivent `windAt`, ancrés au
 * monde mais pesés en pixels d'écran. Quand un ruban entre dans une dépression, c'est le champ qui
 * fait la volute — rien ici ne la dessine.
 */
export class WindLayer implements AmbientLayer {
  readonly fx = 'wind' as const;
  readonly hz = WIND_HZ;
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
  ) {
    const vertices = MAX_RIBBONS * HISTORY * 2;
    const geometry = new BufferGeometry();
    const attribute = (size: number) =>
      new BufferAttribute(new Float32Array(vertices * size), size);
    this.positions = attribute(3);
    this.toward = attribute(3);
    this.halfWidth = attribute(1);
    this.alpha = attribute(1);
    const side = attribute(1);
    for (let i = 0; i < vertices; i++) side.setX(i, i % 2 === 0 ? 1 : -1);
    this.index = new BufferAttribute(new Uint16Array(MAX_RIBBONS * (HISTORY - 1) * 6), 1);
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
          ink: { value: new Color(PAPER) },
        },
      }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = RIBBON_RANK;
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
    const target = Math.min(
      MAX_RIBBONS,
      Math.round((RIBBONS_PER_SCREEN * this.resolution.x * this.resolution.y) / REFERENCE_AREA),
    );
    for (let births = 0; this.ribbons.length < target && births < BIRTHS_PER_STEP; births++) {
      const ribbon = this.spawn();
      if (ribbon !== null) this.ribbons.push(ribbon);
    }

    for (let i = this.ribbons.length - 1; i >= 0; i--) {
      const ribbon = this.ribbons[i]!;
      ribbon.age += 1 / WIND_HZ;
      const alive = this.advance(ribbon, epochMs);
      if (ribbon.age > ribbon.growth) {
        ribbon.x.splice(0, TAIL_PER_STEP);
        ribbon.z.splice(0, TAIL_PER_STEP);
        ribbon.force.splice(0, TAIL_PER_STEP);
      } else if (ribbon.x.length > HISTORY) {
        ribbon.x.shift();
        ribbon.z.shift();
        ribbon.force.shift();
      }
      ribbon.peak = Math.max(ribbon.peak, ribbon.x.length);
      if (!alive || ribbon.x.length < 2) this.ribbons.splice(i, 1);
    }
  }

  /** A ribbon is born where the player looks: a random screen point, cast onto the board. */
  private spawn(): Ribbon | null {
    this.aim.set(Math.random() * 2 - 1, Math.random() * 2 - 1);
    this.ray.setFromCamera(this.aim, this.camera);
    const hit = this.ray.ray.intersectPlane(this.ground, this.a);
    if (hit === null || !this.onBoard(hit.x, hit.z)) return null;
    return {
      x: [hit.x],
      z: [hit.z],
      force: [0],
      width: between(WIDTH_PX),
      growth: between(GROWTH_S),
      age: 0,
      peak: 1,
    };
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
    const last = ribbon.x.length - 1;
    const x = ribbon.x[last]!;
    const z = ribbon.z[last]!;
    const lonLat = this.board.lonLatAt(x + this.board.centerX, z + this.board.centerY);
    const { u, v } = windAt(lonLat[0], lonLat[1], epochMs);
    const force = forceOf(u, v);
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
    const pixels = (SPEED_PX_S[0] + (SPEED_PX_S[1] - SPEED_PX_S[0]) * force) / WIND_HZ;
    const stride = pixels * (probe / onScreen);
    const nx = x + (dx / run) * stride;
    const nz = z + (dz / run) * stride;
    if (!this.onBoard(nx, nz)) return false;
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
    for (const ribbon of this.ribbons) {
      const count = Math.min(ribbon.x.length, HISTORY);
      if (count < 2) continue;
      const life =
        Math.min(1, ribbon.age / FADE_IN_S) *
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
        const width = 0.6 + ribbon.width * (0.6 + 0.4 * force) * taper;
        const alpha = Math.min(1, (0.35 + 0.5 * force) * taper * life);
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
