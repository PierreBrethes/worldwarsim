import {
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  NearestFilter,
  PlaneGeometry,
  RedFormat,
  ShapeUtils,
  ShaderMaterial,
  UnsignedByteType,
  Vector2,
} from 'three';
import type { RegionType } from '@/domain/ids';
import type { DisplayedRegion } from '@/domain/world';
import { COUNTRY_THICKNESS, onLand, type WorldFrame } from './frame';
import { spansTheFrame, TRAME_SCALE } from './regions';

/**
 * **Les dessins généraux de terrain** (#197, maquette `WWS/prototypes/carte-refonte/sheet.js`) :
 * la plume pâle d'un atlas — forêts, montagnes, déserts, toundra, jungle ; la plaine reste nue —,
 * posée sur toute la terre et jamais effacée. Décor pur : le type est cuit hors ligne et aucune
 * règle ne le lit.
 *
 * **Cuit, pas dessiné** : la maquette grave ses dessins dans une feuille de 2560 à 4096 px (~22 Mo
 * à 2560) ; le monde entier à cette finesse ne tiendrait pas en mémoire. Deux petites textures à
 * la place, cuites une fois — la carte des types (un octet par cellule de 0,2 u) et l'atlas des
 * glyphes (un octet par pixel, en mips) — et un fragment qui sème les glyphes sur une grille
 * décalée, où le grain tombe en dessous de la lisibilité. Rien par image côté CPU, rien à
 * invalider : la carte à la demande n'en sait rien.
 */

/** Les cinq types dessinés, dans l'ordre des rangées de l'atlas ; la plaine est le code 0. */
const DRAWN = ['forest', 'jungle', 'mountain', 'desert', 'tundra'] as const;
type DrawnType = (typeof DRAWN)[number];
const CODE_STEP = 40;

/** Le code que la carte des types écrit pour un type ; `0` : rien à dessiner. */
export const terrainCode = (type: RegionType): number => {
  const index = DRAWN.indexOf(type as DrawnType);
  return index < 0 ? 0 : index + 1;
};

/** Une cellule de la carte des types : 0,2 u, soit quelque vingt kilomètres. @a-mesurer */
const TYPES_PER_UNIT = 5.12;
const ATLAS_CELL = 128;
const VARIANTS = 4;
/** One pen for every glyph, in atlas pixels: the stroke must not follow the glyph's size. */
const STROKE_ATLAS_PX = 9;
/** What a drawing may drift off its cell's middle without the cell's edge cutting it, with the
 *  ±15 % of scale and the ±12° it is given on top. */
const jitterOf = (fill: number): number => Math.max(0, (1 - fill * 1.3) / 2);
/** Mountains on a grid of their own, twice as wide: they would be dwarfed on the others'. */
const MOUNTAIN_CODE = terrainCode('mountain');
/** Mountains are fainter than the rest for their thin hatching. @a-mesurer */
const OPACITY_BY_TYPE: Record<DrawnType, number> = {
  forest: 1,
  jungle: 1,
  mountain: 1.3,
  desert: 1,
  tundra: 1,
};

/**
 * Le dessin de chaque type, à la plume de la maquette : `s` est l'unité du dessin, `k` sa variante
 * (0 à 1). `fill` est la part de la cellule que le dessin couvre, `keep` la part des cellules qui
 * en portent un. @a-mesurer
 */
const GLYPHS: Record<
  DrawnType,
  {
    extent: number;
    fill: number;
    keep: number;
    draw: (g: CanvasRenderingContext2D, x: number, y: number, s: number, k: number) => void;
  }
> = {
  forest: {
    extent: 12,
    fill: 0.4,
    keep: 0.85,
    // From a lone tree to a clump of three, by variant.
    draw: (g, x, y, s, k) => {
      const trees: ReadonlyArray<readonly [number, number, number]> =
        k < 0.5
          ? [[0, 0, 4.8]]
          : k < 0.9
            ? [
                [-3.8, 0.5, 3.6],
                [3.8, -0.5, 3.6],
              ]
            : [
                [-4, 1, 3.2],
                [4, 1, 3.2],
                [0, -2.5, 3.2],
              ];
      for (const [dx, dy, r] of trees) {
        g.beginPath();
        g.arc(x + dx * s, y + dy * s - r * s, r * s, 0, 7);
        g.moveTo(x + dx * s, y + dy * s);
        g.lineTo(x + dx * s, y + dy * s + 3 * s);
        g.stroke();
      }
    },
  },
  mountain: {
    extent: 24,
    fill: 0.6,
    keep: 0.8,
    draw: (g, x, y, s, k) => {
      const w = (8 + 4 * k) * s;
      const h = w * 0.72;
      g.beginPath();
      g.moveTo(x - w, y);
      g.lineTo(x, y - h);
      g.lineTo(x + w, y);
      g.stroke();
      for (let i = 1; i < 4; i++) {
        g.beginPath();
        g.moveTo(x + ((w * i) / 4) * 0.95, y - h * (1 - i / 4) * 0.95);
        g.lineTo(x + ((w * i) / 4) * 0.95 - 4 * s, y);
        g.stroke();
      }
    },
  },
  desert: {
    extent: 16,
    fill: 0.6,
    keep: 0.8,
    draw: (g, x, y, s, k) => {
      if (k < 0.5) {
        g.beginPath();
        g.arc(x, y + 6 * s, 7 * s, Math.PI * 1.2, Math.PI * 1.8);
        g.stroke();
      } else {
        for (let i = 0; i < 3; i++) {
          g.beginPath();
          g.arc(x + (i - 1) * 3 * s, y + (i % 2) * 2 * s, 0.7 * s, 0, 7);
          g.fill();
        }
      }
    },
  },
  tundra: {
    extent: 11,
    fill: 0.45,
    keep: 0.8,
    draw: (g, x, y, s) => {
      g.beginPath();
      for (const a of [-0.45, 0, 0.45]) {
        g.moveTo(x, y);
        g.lineTo(x + Math.sin(a) * 5 * s, y - Math.cos(a) * 5 * s);
      }
      g.moveTo(x - 5 * s, y);
      g.lineTo(x + 5 * s, y);
      g.stroke();
    },
  },
  jungle: {
    extent: 11,
    fill: 0.45,
    keep: 0.85,
    draw: (g, x, y, s) => {
      g.beginPath();
      g.moveTo(x, y + 3 * s);
      g.quadraticCurveTo(x + s, y - 2 * s, x, y - 5 * s);
      for (const d of [-1, 1]) {
        g.moveTo(x, y - 5 * s);
        g.quadraticCurveTo(x + d * 3 * s, y - 7 * s, x + d * 5 * s, y - 4 * s);
      }
      g.stroke();
    },
  },
};

/** The box of the pixels that carry ink, in a cell's RGBA bytes. */
function inkBox(rgba: Uint8ClampedArray): [number, number, number, number] {
  let [minX, minY, maxX, maxY] = [ATLAS_CELL, ATLAS_CELL, 0, 0];
  for (let i = 3; i < rgba.length; i += 4) {
    if (rgba[i]! < 16) continue;
    const [x, y] = [((i - 3) / 4) % ATLAS_CELL, Math.floor((i - 3) / 4 / ATLAS_CELL)];
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX + 1, maxY + 1];
}

/** The pen strokes of every glyph, one row per type and one column per variant, alpha kept. */
function paintAtlas(): DataTexture {
  const width = ATLAS_CELL * VARIANTS;
  const height = ATLAS_CELL * DRAWN.length;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d', { willReadFrequently: true })!;
  const cell = document.createElement('canvas');
  cell.width = cell.height = ATLAS_CELL;
  const c = cell.getContext('2d', { willReadFrequently: true })!;
  c.strokeStyle = c.fillStyle = '#000';
  c.lineCap = c.lineJoin = 'round';
  c.lineWidth = STROKE_ATLAS_PX;
  DRAWN.forEach((type, row) => {
    const glyph = GLYPHS[type];
    const s = (ATLAS_CELL * glyph.fill) / glyph.extent;
    for (let column = 0; column < VARIANTS; column++) {
      c.clearRect(0, 0, ATLAS_CELL, ATLAS_CELL);
      glyph.draw(c, ATLAS_CELL / 2, ATLAS_CELL / 2, s, column / (VARIANTS - 1));
      // Centred on what was drawn, not on where it was drawn from: a crown sits above its base.
      const [minX, minY, maxX, maxY] = inkBox(c.getImageData(0, 0, ATLAS_CELL, ATLAS_CELL).data);
      g.drawImage(
        cell,
        column * ATLAS_CELL + ATLAS_CELL / 2 - (minX + maxX) / 2,
        row * ATLAS_CELL + ATLAS_CELL / 2 - (minY + maxY) / 2,
      );
    }
  });
  const pixels = g.getImageData(0, 0, width, height).data;
  const alpha = new Uint8Array(width * height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = pixels[i * 4 + 3]!;
  const texture = new DataTexture(alpha, width, height, RedFormat, UnsignedByteType);
  texture.unpackAlignment = 1;
  texture.generateMipmaps = true;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/**
 * One byte a cell: the type's code × `CODE_STEP`. **One mask a type, thresholded**: the canvas
 * antialiases its edges, and a blend of two flat codes decodes as a third type (a mountain edge on
 * a plain read as jungle). Each mask is a coverage in [0, 255]; a cell is the type's only above
 * half. Masks come in the order of `DRAWN`.
 */
export function codesFromMasks(
  masks: ReadonlyArray<ArrayLike<number>>,
  cells: number,
): Uint8Array<ArrayBuffer> {
  const codes = new Uint8Array(new ArrayBuffer(cells));
  masks.forEach((mask, index) => {
    for (let i = 0; i < cells; i++) if (mask[i]! >= 128) codes[i] = (index + 1) * CODE_STEP;
  });
  return codes;
}

function paintTypes(regions: ReadonlyArray<DisplayedRegion>, frame: WorldFrame): DataTexture {
  const width = Math.round(frame.width * TYPES_PER_UNIT);
  const height = Math.round(frame.height * TYPES_PER_UNIT);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d', { willReadFrequently: true })!;
  const masks = DRAWN.map((type) => {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#000';
    g.fillRect(0, 0, width, height);
    g.setTransform(
      TYPES_PER_UNIT,
      0,
      0,
      TYPES_PER_UNIT,
      (frame.width / 2 - frame.centerX) * TYPES_PER_UNIT,
      (frame.height / 2 - frame.centerY) * TYPES_PER_UNIT,
    );
    g.fillStyle = '#fff';
    for (const region of regions) {
      if (region.type !== type) continue;
      for (const ring of region.rings) {
        g.beginPath();
        ring.forEach(([x, y], index) => (index === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
        g.closePath();
        g.fill();
      }
    }
    const pixels = g.getImageData(0, 0, width, height).data;
    const mask = new Uint8Array(width * height);
    for (let i = 0; i < mask.length; i++) mask[i] = pixels[i * 4]!;
    return mask;
  });
  const texture = new DataTexture(
    codesFromMasks(masks, width * height),
    width,
    height,
    RedFormat,
    UnsignedByteType,
  );
  texture.unpackAlignment = 1;
  texture.generateMipmaps = false;
  texture.minFilter = texture.magFilter = NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

const CELL = 0.24;
/** The smallest cell the pen is laid at, in CSS pixels: smaller, the grid doubles (and the
 *  drawings go out from far away), so they keep a size the eye reads rather than turning to grain.
 *  A finger's screen is read from nearer. @a-mesurer */
const MIN_CELL_PX = 12;
const MIN_CELL_PX_AT_THE_FINGER = 14;
const MAX_DOUBLINGS = 3;
/** Past this many doublings the cell would be grain even doubled: nothing is drawn. */
const GONE_AT = MAX_DOUBLINGS + 1.5;
const INK = '#2a2118';
/** The maquette's own weight (`uDrawAlpha`). @a-mesurer */
const OPACITY = 0.36;
/** The ink goes down with the sheet it is laid on: left at its day colour it would be lighter than a
 *  moonlit page, and vanish. @a-mesurer */
const NIGHT_INK = 0.25;
/** Over the washes and the hatch, under the contours and the hover's stroke. */
const LIFT = 0.0025;
/** The terrain's wash, under the drawings: the maquette's `TINT` (`sheet.js`), by type. Laid from
 *  the regions' own outlines, not from the type map, whose cells would make stairs of its edges.
 *  @a-mesurer */
const WASH: Record<DrawnType, { color: string; alpha: number }> = {
  forest: { color: 'rgb(110,128,70)', alpha: 0.16 },
  mountain: { color: 'rgb(140,106,66)', alpha: 0.15 },
  desert: { color: 'rgb(214,176,98)', alpha: 0.2 },
  tundra: { color: 'rgb(170,180,182)', alpha: 0.22 },
  jungle: { color: 'rgb(90,120,60)', alpha: 0.16 },
};
const WASH_LIFT = 0.002;

const VERTEX = `
varying vec2 vWorld;
void main() {
  vWorld = position.xz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAGMENT = `
uniform sampler2D uTypes, uAtlas;
uniform vec2 uWorld;
uniform vec3 uInk;
uniform float uOpacity, uMinCellPx, uPixelRatio, uNight;
uniform float uKeep[6], uJitter[6], uWeight[6];
varying vec2 vWorld;

float hash(vec2 p) {
  p = fract(p * vec2(0.1031, 0.1030));
  p += dot(p, p.yx + 33.33);
  return fract((p.x + p.y) * p.x);
}

// One grid of drawings: every other row shifted by half a cell, each cell asking the type map for
// the type at its middle. The mountains have a grid of their own (\`mountains\`), the others share
// one. The derivatives are said outright, since the cell edges cut the ones the hardware would
// guess.
float layer(vec2 p, float cell, vec2 dx, vec2 dy, bool mountains) {
  vec2 q = p / cell;
  float shift = mod(floor(q.y), 2.0) * 0.5;
  q.x += shift;
  vec2 id = floor(q);
  vec2 inside = fract(q);
  vec2 middle = (id + 0.5 - vec2(shift, 0.0)) * cell;
  float code = floor(textureLod(uTypes, middle / uWorld + 0.5, 0.0).r * 255.0 / ${CODE_STEP.toFixed(1)} + 0.5);
  if (code < 0.5 || code > 5.5 || (code == ${MOUNTAIN_CODE}.0) != mountains) return 0.0;
  vec3 h = vec3(hash(id), hash(id + 7.7), hash(id + 19.1));
  if (h.x > uKeep[int(code)]) return 0.0;
  // Each cell's own size, turn and drift, so the grid does not read as wallpaper.
  float turn = (hash(id + 3.3) - 0.5) * 0.42;
  float size = 0.85 + 0.3 * hash(id + 11.1);
  vec2 d = inside - 0.5 - (h.yz - 0.5) * 2.0 * uJitter[int(code)];
  d = vec2(cos(turn) * d.x + sin(turn) * d.y, cos(turn) * d.y - sin(turn) * d.x) / size;
  vec2 at = d + 0.5;
  if (any(lessThan(at, vec2(0.0))) || any(greaterThan(at, vec2(1.0)))) return 0.0;
  vec2 atlas = vec2(${VARIANTS}.0, ${DRAWN.length}.0);
  vec2 uv = (vec2(floor(fract(h.x * 7.13) * ${VARIANTS}.0), code - 1.0) + at) / atlas;
  vec2 step = 1.0 / (cell * atlas);
  return textureGrad(uAtlas, uv, dx * step, dy * step).r * uWeight[int(code)];
}

float level(vec2 p, float cell, vec2 dx, vec2 dy) {
  return layer(p, cell, dx, dy, false) + layer(p, cell * 2.0, dx, dy, true);
}

void main() {
  vec2 dx = dFdx(vWorld);
  vec2 dy = dFdy(vWorld);
  float unitsPerPixel = max(length(dx), length(dy));
  float wanted = log2(uMinCellPx * uPixelRatio * unitsPerPixel / ${CELL.toFixed(2)});
  if (wanted > ${GONE_AT.toFixed(1)}) discard;
  float doublings = clamp(wanted, 0.0, ${MAX_DOUBLINGS.toFixed(1)});
  float whole = floor(doublings);
  float share = smoothstep(0.3, 0.7, doublings - whole);
  float cell = ${CELL.toFixed(2)} * exp2(whole);
  float ink = level(vWorld, cell, dx, dy) * (1.0 - share);
  if (share > 0.001) ink += level(vWorld, cell * 2.0, dx, dy) * share;
  ink *= 1.0 - smoothstep(${MAX_DOUBLINGS.toFixed(1)}, ${GONE_AT.toFixed(1)}, wanted);
  ink *= uOpacity;
  if (ink < 0.003) discard;
  gl_FragColor = vec4(uInk * mix(1.0, ${NIGHT_INK.toFixed(2)}, uNight), min(ink, 1.0));
  #include <colorspace_fragment>
}`;

const WASH_VERTEX = `
attribute vec4 wash;
varying vec4 vWash;
void main() {
  vWash = wash;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const WASH_FRAGMENT = `
uniform float uNight;
varying vec4 vWash;
void main() {
  gl_FragColor = vec4(vWash.rgb * mix(1.0, ${NIGHT_INK.toFixed(2)}, uNight), vWash.a);
  #include <colorspace_fragment>
}`;

/** The regions of the drawn types, triangulated flat, each vertex carrying its type's wash. */
function washGeometry(regions: ReadonlyArray<DisplayedRegion>, frame: WorldFrame): BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const index: number[] = [];
  const color = new Color();
  for (const region of regions) {
    if (terrainCode(region.type) === 0) continue;
    const { color: css, alpha } = WASH[region.type as DrawnType];
    color.set(css);
    for (const ring of region.rings) {
      if (spansTheFrame(ring, frame)) continue;
      const contour = ring.map(([x, y]) => new Vector2(x - frame.centerX, y - frame.centerY));
      const base = positions.length / 3;
      for (const point of contour) {
        positions.push(point.x, COUNTRY_THICKNESS + WASH_LIFT, point.y);
        colors.push(color.r, color.g, color.b, alpha);
      }
      for (const [a, b, c] of ShapeUtils.triangulateShape(contour, []))
        index.push(base + a!, base + b!, base + c!);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('wash', new Float32BufferAttribute(colors, 4));
  geometry.setIndex(index);
  return geometry;
}

export class TerrainDrawings {
  readonly object = new Group();
  private readonly drawing: Mesh<PlaneGeometry, ShaderMaterial>;
  private readonly wash: Mesh<BufferGeometry, ShaderMaterial>;
  private types: DataTexture | null = null;
  private readonly atlas = paintAtlas();
  private readonly night = { value: 0 };

  constructor(
    private readonly frame: WorldFrame,
    anisotropy: number,
    /** At the finger the cell is read from nearer. */
    touch: boolean,
  ) {
    this.atlas.anisotropy = anisotropy;
    const byCode = (pick: (type: DrawnType) => number) => [0, ...DRAWN.map(pick)];
    const onTheLand = (material: ShaderMaterial): ShaderMaterial => {
      material.transparent = true;
      material.depthWrite = false;
      material.polygonOffset = true;
      material.polygonOffsetFactor = -2;
      material.polygonOffsetUnits = -4;
      return onLand(material);
    };
    this.drawing = new Mesh(
      new PlaneGeometry(frame.width, frame.height),
      onTheLand(
        new ShaderMaterial({
          vertexShader: VERTEX,
          fragmentShader: FRAGMENT,
          uniforms: {
            uTypes: { value: null },
            uAtlas: { value: this.atlas },
            uWorld: { value: new Vector2(frame.width, frame.height) },
            uInk: { value: new Color(INK) },
            uOpacity: { value: OPACITY },
            uNight: this.night,
            uMinCellPx: { value: touch ? MIN_CELL_PX_AT_THE_FINGER : MIN_CELL_PX },
            uPixelRatio: TRAME_SCALE,
            uKeep: { value: byCode((type) => GLYPHS[type].keep) },
            uJitter: { value: byCode((type) => jitterOf(GLYPHS[type].fill)) },
            uWeight: { value: byCode((type) => OPACITY_BY_TYPE[type]) },
          },
        }),
      ),
    );
    this.drawing.geometry.rotateX(-Math.PI / 2);
    this.drawing.geometry.translate(0, COUNTRY_THICKNESS + LIFT, 0);
    this.wash = new Mesh(
      new BufferGeometry(),
      onTheLand(
        new ShaderMaterial({
          vertexShader: WASH_VERTEX,
          fragmentShader: WASH_FRAGMENT,
          side: DoubleSide,
          uniforms: { uNight: this.night },
        }),
      ),
    );
    // Over the washed ground, the wash under the drawings, both under the contours (0.5 and up).
    this.wash.renderOrder = 0.1;
    this.drawing.renderOrder = 0.2;
    for (const mesh of [this.wash, this.drawing]) {
      mesh.frustumCulled = false;
      // Decor: neither picked nor aimed at.
      mesh.raycast = () => {};
      this.object.add(mesh);
    }
    this.object.visible = false;
  }

  /** How dark it is where one looks, 0 to 1. */
  set darkness(night: number) {
    this.night.value = night;
  }

  /** Bakes the type map and the wash of the regions that came. */
  display(regions: ReadonlyArray<DisplayedRegion>): void {
    this.types?.dispose();
    this.types = paintTypes(regions, this.frame);
    this.drawing.material.uniforms.uTypes!.value = this.types;
    this.wash.geometry.dispose();
    this.wash.geometry = washGeometry(regions, this.frame);
    this.object.visible = true;
  }

  dispose(): void {
    this.types?.dispose();
    this.atlas.dispose();
    for (const mesh of [this.wash, this.drawing]) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.object.removeFromParent();
  }
}
