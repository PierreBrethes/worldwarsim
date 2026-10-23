import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  Mesh,
  ShaderMaterial,
  Vector2,
} from 'three';
import type { DepositCall } from '@/domain/construction';
import type { DepositBasin } from '@/domain/deposit-basins';
import type { DepositKey } from '@/domain/ids';
import { COUNTRY_THICKNESS, onLand, type WorldFrame } from './frame';
import { NIGHT_HERE_GLSL, NIGHT_INK, type NightUniforms } from './night-here';
import { TRAME_SCALE } from './regions';
import { ADVERSE_INK } from './palette';

/**
 * **Les bassins des gisements** (#239, maquette `WWS/prototypes/gisements/bassin.html`) : chaque
 * gisement est un bassin dessiné dans le terrain à la plume, comme un massif — points serrés du
 * charbon, croisillons du fer, sillons des terres, gouttes du pétrole —, dense au cœur et nu au
 * bord. De loin, la texture tombe sous la lisibilité et il reste un lavis.
 *
 * **Un maillage, cuit une fois** : les contours (`public/deposit-basins.json`) remplis en éventail
 * depuis leur point, et un fragment qui sème la texture sur une grille du plateau. Rien par image,
 * rien à invalider : la carte à la demande n'en sait rien. Aucune donnée de joueur n'y entre — la
 * géologie est publique (décision 65a du 01/09) : ce que la vue dit d'un gisement est son nom.
 */

/** The order of the textures in the fragment: the `aKind` of each basin. */
const KINDS: ReadonlyArray<DepositKey> = ['coal', 'iron', 'food', 'oil'];
/** The resource's own ink, the maquette's `RES_INK`: the wash only, never the pen. The same
 *  inks as `--res-*-paper` in `src/styles/tokens.css` (iron is `--res-steel-paper`), which the
 *  woken names wear (`labels.css`): change one, change the other. @a-mesurer */
export const WASH: Record<DepositKey, string> = {
  food: '#6a7047',
  iron: '#627584',
  coal: '#605a49',
  oil: '#584973',
};
/** The texture's grid close in, in board units (1 u ≈ 100 km). @a-mesurer */
const CELL = 0.03;
/** The smallest cell the pen is laid at, in CSS pixels: smaller, the grid doubles and the basin
 *  holds fewer marks of the same size, as the massifs do. @a-mesurer */
const MIN_CELL_PX = 8;
/** At two doublings a basin holds a handful of marks; past them only its wash is left. */
const MAX_DOUBLINGS = 2;
const GONE_AT = MAX_DOUBLINGS + 1;
/** A wash barely there close in, as the mockup; from far, darker than its 0.26, for our sheet carries the terrain washes under it. @a-mesurer */
const NEAR_WASH = 0.09;
const FAR_WASH = 0.36;
const PEN_ALPHA = 0.5;
/** The share of cells that bear a mark at the basin's heart. @a-mesurer */
const KEEP = 0.85;
const INK = '#2a2118';
/** Woken (#239): the maquette's washes, near (open, refused) and far, and its dashes round. @a-mesurer */
const WOKEN_NEAR = 0.15;
const REFUSED_NEAR = 0.1;
const WOKEN_FAR = 0.6;
const DASHES = 60;
/** Reached by the sweep (#249): its three beats, and how long it stays awake. @a-mesurer */
const SWEEP_BEATS_MS = 2400;
export const SWEEP_GLOW_MS = 6000;
/** The echo ring's widest reach past the rim, in CSS pixels (maquette: 3 + 9). */
const ECHO_MAX_PX = 12;
/** Over the terrain drawings (0.0025), under the contours. */
const LIFT = 0.003;
/** From far a basin grows to this radius on screen, in CSS pixels, so its wash stays a spot the
 *  eye finds, as in the mockup's far view; close in it keeps its true size. @a-mesurer */
export const BASIN_MIN_RADIUS_PX = 12;

// From far, the basin swells about its point until its radius reads `BASIN_MIN_RADIUS_PX` on screen —
// never past `aRoom`, where it would reach half way to its nearest neighbour.
const VERTEX = `
attribute float aEdge;
attribute float aKind;
attribute vec2 aCentre;
attribute float aRadius;
attribute float aRoom;
attribute float aWake;
attribute float aSweep;
uniform vec2 uViewport;
uniform float uSweepAge;
uniform float uSweepBeat;
varying vec2 vWorld;
varying vec2 vCentre;
varying float vEdge;
varying float vKind;
varying float vWake;
varying float vSweep;
varying float vSwell;
varying float vRadiusPx;
vec2 onScreen(vec3 p) {
  vec4 clip = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  return clip.xy / clip.w * uViewport * 0.5;
}
void main() {
  vec3 centre = vec3(aCentre.x, position.y, aCentre.y);
  float px = length(onScreen(centre + vec3(aRadius, 0.0, 0.0)) - onScreen(centre));
  float grow = clamp(${BASIN_MIN_RADIUS_PX.toFixed(1)} / max(px, 0.001), 1.0, aRoom);
  // While a swept basin beats, it swells past its rim to leave room for the echo ring (#249).
  float age = uSweepAge - aSweep;
  bool beating = aSweep >= 0.0 && age >= 0.0 && age < ${SWEEP_BEATS_MS.toFixed(1)} && uSweepBeat > 0.0;
  vRadiusPx = max(px * grow, 1.0);
  vSwell = beating ? 1.0 + ${(ECHO_MAX_PX + 3).toFixed(1)} / vRadiusPx : 1.0;
  vec3 grown = centre + (position - centre) * grow * vSwell;
  vWorld = grown.xz;
  vCentre = aCentre;
  vEdge = aEdge;
  vKind = aKind;
  vWake = aWake;
  vSweep = aSweep;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(grown, 1.0);
}`;

const FRAGMENT = `
${NIGHT_HERE_GLSL}
uniform vec3 uInk;
uniform vec3 uRefused;
uniform vec3 uWash[${KINDS.length}];
uniform float uPixelRatio;
uniform float uSweepAge;
uniform float uSweepGlow;
uniform float uSweepBeat;
varying vec2 vWorld;
varying vec2 vCentre;
varying float vEdge;
varying float vKind;
varying float vWake;
varying float vSweep;
varying float vSwell;
varying float vRadiusPx;
// The basin's own radial share, 1 on its rim, whatever the swell of a beat.
float edge;

// Straight-alpha "over".
vec4 over(vec4 top, vec4 under) {
  float a = top.a + under.a * (1.0 - top.a);
  if (a < 0.0001) return vec4(0.0);
  return vec4((top.rgb * top.a + under.rgb * under.a * (1.0 - top.a)) / a, a);
}

// The maquette's ink by night (inkAt): lifted toward the moon rather than darkened.
vec3 moonlit(vec3 ink, float night) {
  return mix(ink, (ink * 0.55 + vec3(0.2, 0.23, 0.34)) * 1.25, 0.75 * night);
}

float hash(vec2 p) {
  p = fract(p * vec2(0.1031, 0.1030));
  p += dot(p, p.yx + 33.33);
  return fract((p.x + p.y) * p.x);
}

// One mark, in a cell's own units (its middle at 0); north is -y.
float mark(int kind, vec2 d, float aa) {
  float sd;
  if (kind == 0) sd = length(d) - 0.13;
  else if (kind == 1) {
    vec2 a = abs(d);
    sd = max(abs(a.x - a.y) * 0.7071 - 0.05, max(a.x, a.y) - 0.2);
  } else if (kind == 2) sd = max(abs(d.y + d.x * 0.13) - 0.05, abs(d.x) - 0.3);
  else {
    float body = length(d - vec2(0.0, 0.06)) - 0.12;
    float t = clamp((d.y + 0.22) / 0.28, 0.0, 1.0);
    sd = min(body, max(abs(d.x) - 0.12 * t, max(-0.22 - d.y, d.y - 0.06)));
  }
  return 1.0 - smoothstep(-aa, aa, sd);
}

// One grid of marks, every other row shifted by half a cell; dense at the heart, rare at the
// edge, as the massifs.
float marks(int kind, float cell, float unitsPerPixel) {
  vec2 q = vWorld / cell;
  q.x += mod(floor(q.y), 2.0) * 0.5;
  vec2 id = floor(q);
  vec3 h = vec3(hash(id), hash(id + 7.7), hash(id + 19.1));
  if (h.x >= ${KEEP.toFixed(2)} * (1.0 - smoothstep(0.5, 0.95, edge))) return 0.0;
  return mark(kind, fract(q) - 0.5 - (h.yz - 0.5) * 0.3, unitsPerPixel / cell);
}

void main() {
  edge = vEdge * vSwell;
  float age = uSweepAge - vSweep;
  float k = min(1.0, age / 220.0) * min(1.0, (uSweepGlow - age) / 1600.0);
  float beat = vSweep >= 0.0 && age >= 0.0 && age < ${SWEEP_BEATS_MS.toFixed(1)}
    ? uSweepBeat * (0.5 - 0.5 * cos(age / ${(SWEEP_BEATS_MS / 3).toFixed(1)} * 6.2832))
    : 0.0;
  if (edge > 1.0) {
    // Outside the rim, only the echo ring of a beat: it leaves the rim and fades as it goes
    // (maquette: outline(r + 3 + 9 * beat)).
    float ring = 1.0 + (3.0 + ${(ECHO_MAX_PX - 3).toFixed(1)} * beat) / vRadiusPx;
    float line = 1.0 - smoothstep(0.5, 1.2, abs(edge - ring) / max(fwidth(edge), 1e-5));
    float alpha = beat > 0.02 ? k * (1.0 - beat) * 0.6 * line : 0.0;
    if (alpha < 0.003) discard;
    vec3 res = uWash[int(vKind + 0.5)];
    gl_FragColor = vec4(moonlit(res, nightAtWorld(vWorld)), alpha);
    #include <colorspace_fragment>
    return;
  }
  float unitsPerPixel = max(length(dFdx(vWorld)), length(dFdy(vWorld)));
  float wanted = log2(${MIN_CELL_PX.toFixed(1)} * uPixelRatio * unitsPerPixel / ${CELL.toFixed(3)});
  float near = 1.0 - smoothstep(${MAX_DOUBLINGS.toFixed(1)}, ${GONE_AT.toFixed(1)}, wanted);
  int kind = int(vKind + 0.5);
  float pen = 0.0;
  if (near > 0.0) {
    float doublings = clamp(wanted, 0.0, ${MAX_DOUBLINGS.toFixed(1)});
    float whole = floor(doublings);
    float share = smoothstep(0.3, 0.7, doublings - whole);
    float cell = ${CELL.toFixed(3)} * exp2(whole);
    pen = marks(kind, cell, unitsPerPixel) * (1.0 - share);
    if (share > 0.001) pen += marks(kind, cell * 2.0, unitsPerPixel) * share;
    pen = min(pen, 1.0) * near;
  }
  float night = nightAtWorld(vWorld);
  vec3 res = uWash[kind];
  vec4 color;
  if (vWake < 0.5) {
    float dim = mix(1.0, ${NIGHT_INK.toFixed(2)}, night);
    float wash = mix(${FAR_WASH.toFixed(2)}, ${NEAR_WASH.toFixed(2)}, near) * (1.0 - smoothstep(0.8, 1.0, edge));
    color = over(vec4(uInk * dim, pen * ${PEN_ALPHA.toFixed(2)}), vec4(res * dim, wash));
  } else {
    // Woken by a key in hand (#239): the resource's own ink, a pen line round it — dashed red
    // when the pose would refuse it.
    bool open = vWake < 1.5;
    vec3 ink = moonlit(res, night);
    float wash = mix(${WOKEN_FAR.toFixed(2)}, open ? ${WOKEN_NEAR.toFixed(2)} : ${REFUSED_NEAR.toFixed(2)}, near);
    float w = fwidth(edge);
    float stroke = 1.0 - smoothstep(1.2 * w, 2.2 * w, 1.0 - edge);
    if (!open) {
      vec2 d = vWorld - vCentre;
      stroke *= step(0.45, fract(atan(d.y, d.x) * ${(DASHES / (2 * Math.PI)).toFixed(4)}));
    }
    color = over(vec4(ink, pen * (open ? 1.0 : 0.55)), vec4(ink, wash));
    color = over(vec4(open ? ink : moonlit(uRefused, night), stroke), color);
  }
  // Reached by the sweep's front (#249, maquette radar-gisements): the basin wakes in its own
  // ink, its pen line beats three times, then it goes back to rest.
  if (vSweep >= 0.0 && age >= 0.0 && age <= uSweepGlow) {
    vec3 ink = moonlit(res, night);
    float w = fwidth(edge);
    float stroke = 1.0 - smoothstep((1.0 + beat) * w, (1.8 + 1.4 * beat) * w, 1.0 - edge);
    vec4 woken = over(vec4(ink, pen), vec4(res, mix(${WOKEN_FAR.toFixed(2)}, 0.14 + 0.16 * beat, near)));
    woken = over(vec4(ink, stroke), woken);
    color = mix(color, woken, k);
  }
  if (color.a < 0.003) discard;
  gl_FragColor = color;
  #include <colorspace_fragment>
}`;

export class DepositBasins {
  readonly object = new Group();
  readonly mesh: Mesh<BufferGeometry, ShaderMaterial>;
  private shown = false;
  private loaded = false;
  /** The ids in the mesh's order, each basin's first vertex, and what a key in hand woke. */
  private ids: ReadonlyArray<string> = [];
  private firsts: number[] = [];
  private woken: ReadonlyMap<string, number> | null = null;
  /** When the sweep's front reaches each basin it names, in ms from its start. */
  private swept: ReadonlyMap<string, number> | null = null;
  private sweptAt = 0;

  constructor(
    private readonly frame: WorldFrame,
    night: NightUniforms,
  ) {
    const material = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: {
        uInk: { value: new Color(INK) },
        uRefused: { value: new Color(ADVERSE_INK) },
        uWash: { value: KINDS.map((kind) => new Color(WASH[kind])) },
        uPixelRatio: TRAME_SCALE,
        uSweepAge: { value: 0 },
        uSweepGlow: { value: SWEEP_GLOW_MS },
        uSweepBeat: { value: 1 },
        uViewport: { value: new Vector2(1, 1) },
        ...night,
      },
    });
    material.transparent = true;
    material.depthWrite = false;
    material.polygonOffset = true;
    material.polygonOffsetFactor = -2;
    material.polygonOffsetUnits = -4;
    this.mesh = new Mesh(new BufferGeometry(), onLand(material));
    // Over the terrain drawings (0.2), under the contours (0.5 and up).
    this.mesh.renderOrder = 0.3;
    this.mesh.frustumCulled = false;
    // Decor: the placement aims at the point, the click at the region.
    this.mesh.raycast = () => {};
    this.object.add(this.mesh);
    this.object.visible = false;
  }

  display(basins: ReadonlyArray<DepositBasin>): void {
    const positions: number[] = [];
    const edges: number[] = [];
    const kinds: number[] = [];
    const index: number[] = [];
    const radii: number[] = [];
    const firsts: number[] = [];
    for (const { at, deposit, ring } of basins) {
      const first = positions.length / 3;
      firsts.push(first);
      const count = ring.length / 2;
      const kind = KINDS.indexOf(deposit);
      const centre = this.frame.projectLonLat(at);
      let radius = 0;
      for (let k = -1; k < count; k++) {
        const point = this.frame.projectLonLat(
          k < 0 ? at : [ring[2 * k]!, ring[2 * k + 1]!],
          COUNTRY_THICKNESS + LIFT,
        );
        positions.push(point.x, point.y, point.z);
        radius = Math.max(radius, Math.hypot(point.x - centre.x, point.z - centre.z));
        edges.push(k < 0 ? 0 : 1);
        kinds.push(kind);
      }
      for (let k = 0; k < count; k++)
        // Counter-clockwise seen from above: the ring turns east to south, so its order reverses.
        index.push(first, first + 1 + ((k + 1) % count), first + 1 + k);
      radii.push(radius);
    }
    // Each vertex knows its basin's point, its widest radius, and how far it may swell.
    const centres = basins.map(({ at }) => this.frame.projectLonLat(at));
    const perBasin: number[][] = basins.map((basin, b) => {
      const nearest = Math.min(
        ...centres.map((other, o) =>
          o === b ? Infinity : Math.hypot(other.x - centres[b]!.x, other.z - centres[b]!.z),
        ),
      );
      const room = Math.max(1, nearest / 2 / radii[b]!);
      return [centres[b]!.x, centres[b]!.z, radii[b]!, room, 1 + basin.ring.length / 2];
    });
    const attribute = (pick: (row: number[]) => number[]) =>
      new Float32Array(
        perBasin.flatMap((row) => Array.from({ length: row[4]! }, () => pick(row)).flat()),
      );
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
    geometry.setAttribute('aEdge', new BufferAttribute(new Float32Array(edges), 1));
    geometry.setAttribute('aKind', new BufferAttribute(new Float32Array(kinds), 1));
    geometry.setAttribute(
      'aCentre',
      new BufferAttribute(
        attribute(([x, z]) => [x!, z!]),
        2,
      ),
    );
    geometry.setAttribute(
      'aRadius',
      new BufferAttribute(
        attribute(([, , r]) => [r!]),
        1,
      ),
    );
    geometry.setAttribute(
      'aRoom',
      new BufferAttribute(
        attribute(([, , , room]) => [room!]),
        1,
      ),
    );
    geometry.setAttribute('aWake', new BufferAttribute(new Float32Array(edges.length), 1));
    geometry.setAttribute('aSweep', new BufferAttribute(new Float32Array(edges.length), 1));
    geometry.setIndex(index);
    this.mesh.geometry.dispose();
    this.mesh.geometry = geometry;
    this.ids = basins.map(({ id }) => id);
    this.firsts = [...firsts, edges.length];
    this.loaded = true;
    this.refresh();
  }

  /**
   * **A key in hand wakes the basins it calls** (#239), near and far, day and night: 1 where the
   * pose would take it, 2 where it would refuse it; `null` puts them all back to sleep. Woken,
   * the basins show even when the toggle hides them.
   */
  wake(
    calls: ReadonlyArray<Pick<DepositCall, 'refusal'> & { deposit: { id: string } }> | null,
  ): void {
    this.woken =
      calls === null
        ? null
        : new Map(calls.map((call) => [call.deposit.id, call.refusal === null ? 1 : 2]));
    this.refresh();
  }

  /**
   * **The sweep wakes the basins it reaches** (#249), each at its `hitMs`; `still`, they light at
   * once without beating and stay lit until the sweep is cleared (`null`).
   */
  sweep(
    hits: ReadonlyArray<{ readonly id: string; readonly hitMs: number }> | null,
    now: number,
    still: boolean,
  ): void {
    this.swept = hits === null ? null : new Map(hits.map((hit) => [hit.id, still ? 0 : hit.hitMs]));
    this.sweptAt = now;
    const uniforms = this.mesh.material.uniforms;
    uniforms.uSweepGlow!.value = still ? 1e9 : SWEEP_GLOW_MS;
    uniforms.uSweepBeat!.value = still ? 0 : 1;
    this.animate(now);
    this.refresh();
  }

  animate(now: number): void {
    this.mesh.material.uniforms.uSweepAge!.value = now - this.sweptAt;
  }

  private refresh(): void {
    this.object.visible = this.loaded && (this.shown || this.woken !== null || this.swept !== null);
    if (!this.loaded) return;
    const swept = this.mesh.geometry.getAttribute('aSweep') as BufferAttribute;
    this.ids.forEach((id, k) =>
      (swept.array as Float32Array).fill(
        this.swept?.get(id) ?? -1,
        this.firsts[k],
        this.firsts[k + 1],
      ),
    );
    swept.needsUpdate = true;
    const wake = this.mesh.geometry.getAttribute('aWake') as BufferAttribute;
    this.ids.forEach((id, k) =>
      (wake.array as Float32Array).fill(
        this.woken?.get(id) ?? 0,
        this.firsts[k],
        this.firsts[k + 1],
      ),
    );
    wake.needsUpdate = true;
  }

  resize(width: number, height: number): void {
    this.mesh.material.uniforms.uViewport!.value.set(width, height);
  }

  show(shown: boolean): void {
    this.shown = shown;
    this.refresh();
  }

  get wanted(): boolean {
    return (this.shown || this.woken !== null || this.swept !== null) && !this.loaded;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.object.removeFromParent();
  }
}
