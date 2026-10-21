import {
  Color,
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  NearestFilter,
  PlaneGeometry,
  RedFormat,
  ShaderMaterial,
  UnsignedByteType,
  Vector2,
} from 'three';
import type { RegionType } from '@/domain/ids';
import type { DisplayedRegion } from '@/domain/world';
import { COUNTRY_THICKNESS, onLand, type WorldFrame } from './frame';
import { TRAME_SCALE } from './regions';

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

/**
 * Le dessin de chaque type, à la plume de la maquette : `s` est l'unité du dessin, `k` sa variante
 * (0 à 1). `fill` est la part de la cellule que le dessin couvre, `jitter` ce dont son centre
 * peut dévier sans sortir de la cellule, `keep` la part des cellules qui en portent un.
 * @a-mesurer
 */
const GLYPHS: Record<
  DrawnType,
  {
    extent: number;
    fill: number;
    jitter: number;
    keep: number;
    draw: (g: CanvasRenderingContext2D, x: number, y: number, s: number, k: number) => void;
  }
> = {
  forest: {
    extent: 8,
    fill: 0.55,
    jitter: 0.14,
    keep: 0.88,
    draw: (g, x, y, s) => {
      const r = 3.6 * s;
      g.beginPath();
      g.arc(x, y - r, r, 0, 7);
      g.moveTo(x, y);
      g.lineTo(x, y + 3 * s);
      g.stroke();
    },
  },
  mountain: {
    extent: 24,
    fill: 0.92,
    jitter: 0,
    keep: 0.75,
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
    fill: 0.7,
    jitter: 0.08,
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
    fill: 0.6,
    jitter: 0.1,
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
    fill: 0.62,
    jitter: 0.12,
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

/** The pen strokes of every glyph, one row per type and one column per variant, alpha kept. */
function paintAtlas(): DataTexture {
  const width = ATLAS_CELL * VARIANTS;
  const height = ATLAS_CELL * DRAWN.length;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d', { willReadFrequently: true })!;
  g.strokeStyle = g.fillStyle = '#000';
  g.lineCap = g.lineJoin = 'round';
  DRAWN.forEach((type, row) => {
    const glyph = GLYPHS[type];
    const s = (ATLAS_CELL * glyph.fill) / glyph.extent;
    g.lineWidth = 1.15 * s;
    for (let column = 0; column < VARIANTS; column++) {
      const x = (column + 0.5) * ATLAS_CELL;
      // The drawings are made around their base: the middle of the cell sits halfway up.
      const y = (row + 0.5) * ATLAS_CELL + (glyph.extent * s) / 6;
      glyph.draw(g, x, y, s, column / (VARIANTS - 1));
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

/** One byte a cell: the type's code × `CODE_STEP`, the regions painted flat on a canvas. */
function paintTypes(regions: ReadonlyArray<DisplayedRegion>, frame: WorldFrame): DataTexture {
  const width = Math.round(frame.width * TYPES_PER_UNIT);
  const height = Math.round(frame.height * TYPES_PER_UNIT);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d', { willReadFrequently: true })!;
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
  for (const region of regions) {
    const code = terrainCode(region.type);
    if (code === 0) continue;
    const level = code * CODE_STEP;
    g.fillStyle = `rgb(${level},${level},${level})`;
    for (const ring of region.rings) {
      g.beginPath();
      ring.forEach(([x, y], index) => (index === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
      g.closePath();
      g.fill();
    }
  }
  const pixels = g.getImageData(0, 0, width, height).data;
  const codes = new Uint8Array(width * height);
  for (let i = 0; i < codes.length; i++) codes[i] = pixels[i * 4]!;
  const texture = new DataTexture(codes, width, height, RedFormat, UnsignedByteType);
  texture.unpackAlignment = 1;
  texture.generateMipmaps = false;
  texture.minFilter = texture.magFilter = NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

const CELL = 0.24;
/** The smallest cell the pen is laid at, in CSS pixels: smaller, the grid doubles (and fades out
 *  from far away), so the drawings keep a size the eye reads rather than turning to grain. */
const MIN_CELL_PX = 12;
const MAX_DOUBLINGS = 3;
const INK = '#2a2118';
/** The maquette's own weight (`uDrawAlpha`). @a-mesurer */
const OPACITY = 0.36;
/** Over the washes and the hatch, under the contours and the hover's stroke. */
const LIFT = 0.0025;

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
uniform float uOpacity, uMinCellPx, uPixelRatio;
uniform float uKeep[6], uJitter[6];
varying vec2 vWorld;

float hash(vec2 p) {
  p = fract(p * vec2(0.1031, 0.1030));
  p += dot(p, p.yx + 33.33);
  return fract((p.x + p.y) * p.x);
}

// One grid of drawings: every other row shifted by half a cell, each cell asking the type map for
// the type at its middle. The derivatives are said outright, since the cell edges cut the ones
// the hardware would guess.
float layer(vec2 p, float cell, vec2 dx, vec2 dy) {
  vec2 q = p / cell;
  float shift = mod(floor(q.y), 2.0) * 0.5;
  q.x += shift;
  vec2 id = floor(q);
  vec2 inside = fract(q);
  vec2 middle = (id + 0.5 - vec2(shift, 0.0)) * cell;
  float code = floor(textureLod(uTypes, middle / uWorld + 0.5, 0.0).r * 255.0 / ${CODE_STEP.toFixed(1)} + 0.5);
  if (code < 0.5 || code > 5.5) return 0.0;
  vec3 h = vec3(hash(id), hash(id + 7.7), hash(id + 19.1));
  if (h.x > uKeep[int(code)]) return 0.0;
  vec2 at = inside - (h.yz - 0.5) * uJitter[int(code)] * 2.0;
  if (any(lessThan(at, vec2(0.0))) || any(greaterThan(at, vec2(1.0)))) return 0.0;
  vec2 atlas = vec2(${VARIANTS}.0, ${DRAWN.length}.0);
  vec2 uv = (vec2(floor(fract(h.x * 7.13) * ${VARIANTS}.0), code - 1.0) + at) / atlas;
  vec2 step = 1.0 / (cell * atlas);
  return textureGrad(uAtlas, uv, dx * step, dy * step).r;
}

void main() {
  vec2 dx = dFdx(vWorld);
  vec2 dy = dFdy(vWorld);
  float unitsPerPixel = max(length(dx), length(dy));
  float wanted = log2(uMinCellPx * uPixelRatio * unitsPerPixel / ${CELL.toFixed(2)});
  float doublings = clamp(wanted, 0.0, ${MAX_DOUBLINGS.toFixed(1)});
  float whole = floor(doublings);
  float share = doublings - whole;
  float cell = ${CELL.toFixed(2)} * exp2(whole);
  float ink = layer(vWorld, cell, dx, dy) * (1.0 - share);
  if (share > 0.001) ink += layer(vWorld, cell * 2.0, dx, dy) * share;
  ink *= 1.0 - smoothstep(${MAX_DOUBLINGS.toFixed(1)}, ${(MAX_DOUBLINGS + 1.5).toFixed(1)}, wanted);
  ink *= uOpacity;
  if (ink < 0.003) discard;
  gl_FragColor = vec4(uInk, ink);
  #include <colorspace_fragment>
}`;

export class TerrainDrawings {
  readonly object: Mesh<PlaneGeometry, ShaderMaterial>;
  private types: DataTexture | null = null;
  private readonly atlas = paintAtlas();

  constructor(
    private readonly frame: WorldFrame,
    anisotropy: number,
  ) {
    this.atlas.anisotropy = anisotropy;
    const byCode = (pick: (glyph: (typeof GLYPHS)[DrawnType]) => number) => [
      0,
      ...DRAWN.map((type) => pick(GLYPHS[type])),
    ];
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
          uTypes: { value: null },
          uAtlas: { value: this.atlas },
          uWorld: { value: new Vector2(frame.width, frame.height) },
          uInk: { value: new Color(INK) },
          uOpacity: { value: OPACITY },
          uMinCellPx: { value: MIN_CELL_PX },
          uPixelRatio: TRAME_SCALE,
          uKeep: { value: byCode((glyph) => glyph.keep) },
          uJitter: { value: byCode((glyph) => glyph.jitter) },
        },
      }),
    );
    const geometry = new PlaneGeometry(frame.width, frame.height);
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, COUNTRY_THICKNESS + LIFT, 0);
    this.object = new Mesh(geometry, material);
    // Over the washed ground, under the contours (0.5 and up).
    this.object.renderOrder = 0.2;
    this.object.frustumCulled = false;
    this.object.visible = false;
    // Decor: neither picked nor aimed at.
    this.object.raycast = () => {};
  }

  /** Bakes the type map of the regions that came. */
  display(regions: ReadonlyArray<DisplayedRegion>): void {
    this.types?.dispose();
    this.types = paintTypes(regions, this.frame);
    this.object.material.uniforms.uTypes!.value = this.types;
    this.object.visible = true;
  }

  dispose(): void {
    this.types?.dispose();
    this.atlas.dispose();
    this.object.geometry.dispose();
    this.object.material.dispose();
    this.object.removeFromParent();
  }
}
