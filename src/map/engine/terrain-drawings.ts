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
  PlaneGeometry,
  RedFormat,
  RGFormat,
  ShaderMaterial,
  UnsignedByteType,
  Vector2,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Atlas, Detail } from '@/domain/atlas';
import type { RegionType } from '@/domain/ids';
import { fillGeometry } from './atlas-geometry';
import { COUNTRY_THICKNESS, onLand, type WorldFrame } from './frame';
import { NIGHT_HERE_GLSL, type NightUniforms } from './night-here';
import { TRAME_SCALE } from './regions';

/**
 * **Les dessins généraux de terrain** (#197, maquette `WWS/prototypes/carte-refonte/sheet.js`) :
 * la plume pâle d'un atlas — forêts, montagnes, déserts, toundra, jungle ; la plaine reste nue —,
 * posée sur toute la terre et jamais effacée. Décor pur : le type est cuit hors ligne et aucune
 * règle ne le lit.
 *
 * **Cuit, pas dessiné** : la maquette grave ses dessins dans une feuille de 2560 à 4096 px (~22 Mo
 * à 2560) ; le monde entier à cette finesse ne tiendrait pas en mémoire. Deux petites textures à
 * la place, cuites une fois — la carte des types (par cellule de 0,2 u, le type et la profondeur
 * dans son massif) et l'atlas des glyphes (un octet par pixel, en mips) — et un fragment qui sème
 * les glyphes sur une grille décalée, dense au cœur des massifs et nue à leurs bords (#208), où le
 * grain tombe en dessous de la lisibilité. Rien par image côté CPU, rien à
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
/** The depth's byte: 1/32 u a step, so 8 u at most, far past where a massif is full. */
const DEPTH_PER_UNIT = 32;
/** A massif is bare up to `BARE_AT` from its edge, full from `FULL_AT`, in units (1 u ≈ 100 km);
 *  the edge wobbles by ±`EDGE_WOBBLE` on a noise `EDGE_GRAIN` wide, so no region's border shows
 *  through. @a-mesurer */
const BARE_AT = 0.05;
const FULL_AT = 0.4;
const EDGE_WOBBLE = 0.3;
const EDGE_GRAIN = 1.5;
/** Even a massif's heart has its clearings, `CLEARING_GRAIN` wide, down to `CLEARING_KEEP` of its
 *  drawings: a forest of a thousand kilometres is not one wall of trees. @a-mesurer */
const CLEARING_GRAIN = 4;
const CLEARING_KEEP = 0.5;
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

/**
 * **The massifs** (#208): each cell's distance, in cells, to the nearest cell of another code. A
 * type's regions are one block in the codes, so the borders between them are gone: a forest is
 * deepest at its heart, whatever regions it spans. The grid's edge is no shore. Two chamfer passes,
 * a step straight 1 and aslant √2.
 */
export function depthsFromCodes(
  codes: ArrayLike<number>,
  width: number,
  height: number,
): Float32Array {
  const depths = new Float32Array(width * height).fill(Infinity);
  for (let i = 0; i < depths.length; i++) {
    const x = i % width;
    const differs = (j: number) => codes[j] !== codes[i];
    const shore =
      (x > 0 && differs(i - 1)) ||
      (x < width - 1 && differs(i + 1)) ||
      (i >= width && differs(i - width)) ||
      (i < depths.length - width && differs(i + width));
    if (codes[i] === 0) depths[i] = 0;
    else if (shore) depths[i] = 1;
  }
  const relax = (i: number, x: number, y: number, dx: number, dy: number, step: number) => {
    const [nx, ny] = [x + dx, y + dy];
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) return;
    const through = depths[ny * width + nx]! + step;
    if (through < depths[i]!) depths[i] = through;
  };
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      relax(i, x, y, -1, 0, 1);
      relax(i, x, y, 0, -1, 1);
      relax(i, x, y, -1, -1, Math.SQRT2);
      relax(i, x, y, 1, -1, Math.SQRT2);
    }
  for (let y = height - 1; y >= 0; y--)
    for (let x = width - 1; x >= 0; x--) {
      const i = y * width + x;
      relax(i, x, y, 1, 0, 1);
      relax(i, x, y, 0, 1, 1);
      relax(i, x, y, 1, 1, Math.SQRT2);
      relax(i, x, y, -1, 1, Math.SQRT2);
    }
  return depths;
}

/** The regions of each drawn type merged (`Atlas.shapes`): a massif is one shape, its edge the
 *  arcs between two types. */
type Massifs = ReturnType<Atlas['shapes']>;

/** The type map's texels: the code in red, read by texel; the depth in green, read filtered so
 *  that its contours are smooth. */
export type TypesData = {
  readonly texels: Uint8Array<ArrayBuffer>;
  readonly width: number;
  readonly height: number;
};

/** A 2D canvas: an `OffscreenCanvas` in the worker, a page's canvas where there is none. */
export type CanvasOf = (
  width: number,
  height: number,
) => { getContext(id: '2d', options: { willReadFrequently: boolean }): Paint | null };
type Paint = Pick<
  CanvasRenderingContext2D,
  | 'setTransform'
  | 'fillRect'
  | 'beginPath'
  | 'moveTo'
  | 'lineTo'
  | 'closePath'
  | 'fill'
  | 'getImageData'
> & { fillStyle: string | CanvasGradient | CanvasPattern };

export function typeTexels(massifs: Massifs, frame: WorldFrame, canvasOf: CanvasOf): TypesData {
  const width = Math.round(frame.width * TYPES_PER_UNIT);
  const height = Math.round(frame.height * TYPES_PER_UNIT);
  const g = canvasOf(width, height).getContext('2d', { willReadFrequently: true })!;
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
    g.beginPath();
    for (const { outer, holes } of massifs.get(type) ?? [])
      for (const ring of [outer, ...holes]) {
        g.moveTo(ring[0]!, ring[1]!);
        for (let i = 2; i < ring.length; i += 2) g.lineTo(ring[i]!, ring[i + 1]!);
        g.closePath();
      }
    g.fill('evenodd');
    const pixels = g.getImageData(0, 0, width, height).data;
    const mask = new Uint8Array(width * height);
    for (let i = 0; i < mask.length; i++) mask[i] = pixels[i * 4]!;
    return mask;
  });
  const codes = codesFromMasks(masks, width * height);
  const depths = depthsFromCodes(codes, width, height);
  const texels = new Uint8Array(width * height * 2);
  for (let i = 0; i < codes.length; i++) {
    texels[i * 2] = codes[i]!;
    texels[i * 2 + 1] = Math.min(255, Math.round((depths[i]! / TYPES_PER_UNIT) * DEPTH_PER_UNIT));
  }
  return { texels, width, height };
}

/** A page's canvas, where the worker had no `OffscreenCanvas`. */
export const pageCanvas: CanvasOf = (width, height) =>
  Object.assign(document.createElement('canvas'), { width, height });

function typesTexture({ texels, width, height }: TypesData): DataTexture {
  const texture = new DataTexture(texels, width, height, RGFormat, UnsignedByteType);
  texture.unpackAlignment = 1;
  texture.generateMipmaps = false;
  texture.minFilter = texture.magFilter = LinearFilter;
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
 *  the massifs' own outlines, not from the type map, whose cells would make stairs of its edges.
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
${NIGHT_HERE_GLSL}
uniform sampler2D uTypes, uAtlas;
uniform vec2 uWorld;
uniform vec3 uInk;
uniform float uOpacity, uMinCellPx, uPixelRatio;
uniform float uKeep[6], uJitter[6], uWeight[6];
varying vec2 vWorld;

float hash(vec2 p) {
  p = fract(p * vec2(0.1031, 0.1030));
  p += dot(p, p.yx + 33.33);
  return fract((p.x + p.y) * p.x);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = smoothstep(0.0, 1.0, fract(p));
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + 1.0), f.x), f.y);
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
  vec2 uv = middle / uWorld + 0.5;
  ivec2 grid = textureSize(uTypes, 0);
  ivec2 texel = clamp(ivec2(uv * vec2(grid)), ivec2(0), grid - 1);
  float code = floor(texelFetch(uTypes, texel, 0).r * 255.0 / ${CODE_STEP.toFixed(1)} + 0.5);
  if (code < 0.5 || code > 5.5 || (code == ${MOUNTAIN_CODE}.0) != mountains) return 0.0;
  // Dense at the massif's heart, thinning out to bare at its wobbled edge.
  float depth = textureLod(uTypes, uv, 0.0).g * ${(255 / DEPTH_PER_UNIT).toFixed(4)};
  depth += (noise(middle / ${EDGE_GRAIN.toFixed(2)}) - 0.5) * ${(2 * EDGE_WOBBLE).toFixed(2)};
  vec3 h = vec3(hash(id), hash(id + 7.7), hash(id + 19.1));
  float dense = smoothstep(${BARE_AT.toFixed(2)}, ${FULL_AT.toFixed(2)}, depth);
  dense *= mix(${CLEARING_KEEP.toFixed(2)}, 1.0, smoothstep(0.3, 0.7, noise(middle / ${CLEARING_GRAIN.toFixed(1)} + 17.0)));
  if (h.x > uKeep[int(code)] * dense) return 0.0;
  // Each cell's own size, turn and drift, so the grid does not read as wallpaper.
  float turn = (hash(id + 3.3) - 0.5) * 0.42;
  float size = 0.85 + 0.3 * hash(id + 11.1);
  vec2 d = inside - 0.5 - (h.yz - 0.5) * 2.0 * uJitter[int(code)];
  d = vec2(cos(turn) * d.x + sin(turn) * d.y, cos(turn) * d.y - sin(turn) * d.x) / size;
  vec2 at = d + 0.5;
  if (any(lessThan(at, vec2(0.0))) || any(greaterThan(at, vec2(1.0)))) return 0.0;
  vec2 atlas = vec2(${VARIANTS}.0, ${DRAWN.length}.0);
  vec2 glyph = (vec2(floor(hash(id + 23.4) * ${VARIANTS}.0), code - 1.0) + at) / atlas;
  vec2 step = 1.0 / (cell * atlas);
  return textureGrad(uAtlas, glyph, dx * step, dy * step).r * uWeight[int(code)];
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
  gl_FragColor = vec4(uInk * mix(1.0, ${NIGHT_INK.toFixed(2)}, nightAtWorld(vWorld)), min(ink, 1.0));
  #include <colorspace_fragment>
}`;

const WASH_VERTEX = `
attribute vec4 wash;
varying vec4 vWash;
varying vec2 vWorld;
void main() {
  vWash = wash;
  vWorld = position.xz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const WASH_FRAGMENT = `
${NIGHT_HERE_GLSL}
varying vec4 vWash;
varying vec2 vWorld;
void main() {
  gl_FragColor = vec4(vWash.rgb * mix(1.0, ${NIGHT_INK.toFixed(2)}, nightAtWorld(vWorld)), vWash.a);
  #include <colorspace_fragment>
}`;

export const drawnOf = (types: ReadonlyMap<string, RegionType>) => (region: { id: string }) => {
  const type = types.get(region.id) ?? 'plain';
  return terrainCode(type) === 0 ? null : type;
};

/** The massifs triangulated flat, each vertex carrying its type's wash. */
export function massifWash(
  massifs: Massifs,
  frame: Pick<WorldFrame, 'centerX' | 'centerY'>,
): BufferGeometry {
  const color = new Color();
  const parts = [...massifs].map(([type, shapes]) => {
    const geometry = fillGeometry(shapes, frame, COUNTRY_THICKNESS + WASH_LIFT);
    const { color: css, alpha } = WASH[type as DrawnType];
    color.set(css);
    const wash = new Float32Array(geometry.getAttribute('position').count * 4);
    for (let i = 0; i < wash.length; i += 4) wash.set([color.r, color.g, color.b, alpha], i);
    geometry.setAttribute('wash', new Float32BufferAttribute(wash, 4));
    return geometry;
  });
  if (parts.length === 0) return new BufferGeometry();
  const merged = mergeGeometries(parts, false)!;
  parts.forEach((part) => part.dispose());
  return merged;
}

export class TerrainDrawings {
  readonly object = new Group();
  private readonly drawing: Mesh<PlaneGeometry, ShaderMaterial>;
  private readonly wash: Mesh<BufferGeometry, ShaderMaterial>;
  private types: DataTexture | null = null;
  private readonly washes: Partial<Record<Detail, BufferGeometry>> = {};
  private washShown: Detail = 'far';
  private readonly atlas = paintAtlas();

  constructor(
    frame: WorldFrame,
    anisotropy: number,
    /** At the finger the cell is read from nearer. */
    touch: boolean,
    private readonly night: NightUniforms,
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
            ...this.night,
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
          uniforms: { ...this.night },
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

  /** The type map and both washes, built off the main thread with the near level. */
  display(types: TypesData, washes: Record<Detail, BufferGeometry>): void {
    this.types?.dispose();
    this.types = typesTexture(types);
    this.drawing.material.uniforms.uTypes!.value = this.types;
    for (const geometry of Object.values(this.washes)) geometry.dispose();
    Object.assign(this.washes, washes);
    this.showWash(this.washShown);
    this.object.visible = true;
  }

  showWash(detail: Detail): void {
    this.washShown = detail;
    const geometry = this.washes[detail];
    if (geometry !== undefined) this.wash.geometry = geometry;
  }

  dispose(): void {
    this.types?.dispose();
    this.atlas.dispose();
    for (const geometry of Object.values(this.washes)) geometry.dispose();
    for (const mesh of [this.wash, this.drawing]) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.object.removeFromParent();
  }
}
