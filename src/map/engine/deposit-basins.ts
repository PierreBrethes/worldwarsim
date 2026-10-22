import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  Mesh,
  ShaderMaterial,
  Vector2,
} from 'three';
import type { DepositBasin } from '@/domain/deposit-basins';
import type { DepositKey } from '@/domain/ids';
import { COUNTRY_THICKNESS, onLand, type WorldFrame } from './frame';
import { NIGHT_HERE_GLSL, type NightUniforms } from './night-here';
import { TRAME_SCALE } from './regions';

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
/** The resource's own ink, the maquette's `RES_INK`: the wash only, never the pen. @a-mesurer */
const WASH: Record<DepositKey, string> = {
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
/** As the terrain drawings' ink: it goes down with the moonlit sheet. */
const NIGHT_INK = 0.25;
/** Over the terrain drawings (0.0025), under the contours. */
const LIFT = 0.003;
/** From far a basin grows to this radius on screen, in CSS pixels, so its wash stays a spot the
 *  eye finds, as in the mockup's far view; close in it keeps its true size. @a-mesurer */
const MIN_RADIUS_PX = 12;

// From far, the basin swells about its point until its radius reads `MIN_RADIUS_PX` on screen —
// never past `aRoom`, where it would reach half way to its nearest neighbour.
const VERTEX = `
attribute float aEdge;
attribute float aKind;
attribute vec2 aCentre;
attribute float aRadius;
attribute float aRoom;
uniform vec2 uViewport;
varying vec2 vWorld;
varying float vEdge;
varying float vKind;
vec2 onScreen(vec3 p) {
  vec4 clip = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  return clip.xy / clip.w * uViewport * 0.5;
}
void main() {
  vec3 centre = vec3(aCentre.x, position.y, aCentre.y);
  float px = length(onScreen(centre + vec3(aRadius, 0.0, 0.0)) - onScreen(centre));
  float grow = clamp(${MIN_RADIUS_PX.toFixed(1)} / max(px, 0.001), 1.0, aRoom);
  vec3 grown = centre + (position - centre) * grow;
  vWorld = grown.xz;
  vEdge = aEdge;
  vKind = aKind;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(grown, 1.0);
}`;

const FRAGMENT = `
${NIGHT_HERE_GLSL}
uniform vec3 uInk;
uniform vec3 uWash[${KINDS.length}];
uniform float uPixelRatio;
varying vec2 vWorld;
varying float vEdge;
varying float vKind;

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
  if (h.x >= ${KEEP.toFixed(2)} * (1.0 - smoothstep(0.5, 0.95, vEdge))) return 0.0;
  return mark(kind, fract(q) - 0.5 - (h.yz - 0.5) * 0.3, unitsPerPixel / cell);
}

void main() {
  float unitsPerPixel = max(length(dFdx(vWorld)), length(dFdy(vWorld)));
  float wanted = log2(${MIN_CELL_PX.toFixed(1)} * uPixelRatio * unitsPerPixel / ${CELL.toFixed(3)});
  float near = 1.0 - smoothstep(${MAX_DOUBLINGS.toFixed(1)}, ${GONE_AT.toFixed(1)}, wanted);
  int kind = int(vKind + 0.5);
  float wash = mix(${FAR_WASH.toFixed(2)}, ${NEAR_WASH.toFixed(2)}, near) * (1.0 - smoothstep(0.8, 1.0, vEdge));
  float ink = 0.0;
  if (near > 0.0) {
    float doublings = clamp(wanted, 0.0, ${MAX_DOUBLINGS.toFixed(1)});
    float whole = floor(doublings);
    float share = smoothstep(0.3, 0.7, doublings - whole);
    float cell = ${CELL.toFixed(3)} * exp2(whole);
    ink = marks(kind, cell, unitsPerPixel) * (1.0 - share);
    if (share > 0.001) ink += marks(kind, cell * 2.0, unitsPerPixel) * share;
    ink = min(ink, 1.0) * ${PEN_ALPHA.toFixed(2)} * near;
  }
  float alpha = ink + wash * (1.0 - ink);
  if (alpha < 0.003) discard;
  vec3 color = (uInk * ink + uWash[kind] * wash * (1.0 - ink)) / alpha;
  gl_FragColor = vec4(color * mix(1.0, ${NIGHT_INK.toFixed(2)}, nightAtWorld(vWorld)), alpha);
  #include <colorspace_fragment>
}`;

export class DepositBasins {
  readonly object = new Group();
  readonly mesh: Mesh<BufferGeometry, ShaderMaterial>;
  private shown = false;
  private loaded = false;

  constructor(
    private readonly frame: WorldFrame,
    night: NightUniforms,
  ) {
    const material = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: {
        uInk: { value: new Color(INK) },
        uWash: { value: KINDS.map((kind) => new Color(WASH[kind])) },
        uPixelRatio: TRAME_SCALE,
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
    for (const { at, deposit, ring } of basins) {
      const first = positions.length / 3;
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
    geometry.setIndex(index);
    this.mesh.geometry.dispose();
    this.mesh.geometry = geometry;
    this.loaded = true;
    this.object.visible = this.shown;
  }

  resize(width: number, height: number): void {
    this.mesh.material.uniforms.uViewport!.value.set(width, height);
  }

  show(shown: boolean): void {
    this.shown = shown;
    this.object.visible = shown && this.loaded;
  }

  get wanted(): boolean {
    return this.shown && !this.loaded;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.object.removeFromParent();
  }
}
