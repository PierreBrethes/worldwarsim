import {
  CanvasTexture,
  Color,
  DataTexture,
  LinearFilter,
  MeshStandardMaterial,
  RedFormat,
  SRGBColorSpace,
  type Texture,
} from 'three';
import type { LonLat } from '@/domain/geo';
import { decodeGrid, landMaskOf, type GridAsset, type RouteGrid } from '@/domain/routing';
import type { Projection } from '@/domain/world';
import type { AmbientLayer } from './ambience';
import { distanceToLand } from './coast-distance';
import { RECESSION, type WorldFrame } from './frame';
import { PALETTE } from './palette';
import { REGIONS_FULL_DISTANCE, REGIONS_GONE_DISTANCE } from './regions';

/** **Six cents texels suffisent à la marbrure** (#199) : une cellule de bruit en couvre près de
 *  quarante, filtrés ; à 2 400 sans filtre, la feuille pesait 11 Mo de mémoire graphique pour
 *  des écarts de teinte sous le niveau d'un octet, et se calculait seize fois plus longtemps. */
const TEXTURE_WIDTH = 600;
const MARBLING_AMPLITUDE = 0.055;

/**
 * The sea is a single ink, shore to open water: the texture only carries the paper's
 * marbling. Everything baked in texels that follows the coast — shadow, depth tint,
 * isobaths — pixelates at zoom; the geometric wash borders the coasts in its place
 * (see `coastal-wash.ts`), and the surf reads a distance field, which interpolates cleanly.
 */
function seaTexture(world: Projection, anisotropy: number): DataTexture {
  const width = TEXTURE_WIDTH;
  const height = Math.round(
    (width * (world.sphere.maxY - world.sphere.minY)) / (world.sphere.maxX - world.sphere.minX),
  );
  const image = new Uint8Array(width * height * 4);
  const marblingScale = (90 * width) / 1400;

  const sea = new Color(PALETTE.seaSheet);
  const color = new Color();
  const rgb = { r: 0, g: 0, b: 0 };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;

      // Land is painted sea-colored: the country meshes cover it, and every "paper" texel
      // peeking past their silhouette made a sand staircase on the coast.
      color.copy(sea);
      const marbling = valueNoise(x / marblingScale, y / marblingScale) - 0.5;
      color.offsetHSL(0, 0, marbling * MARBLING_AMPLITUDE);

      // The texture is decoded as sRGB, so it must be written as sRGB: the linear channels
      // written raw darkened the sea twice over, to a teal no swatch ever said.
      color.getRGB(rgb, SRGBColorSpace);
      image[offset] = rgb.r * 255;
      image[offset + 1] = rgb.g * 255;
      image[offset + 2] = rgb.b * 255;
      image[offset + 3] = 255;
    }
  }

  const texture = new DataTexture(image, width, height);
  texture.magFilter = texture.minFilter = LinearFilter;
  texture.flipY = true;
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = anisotropy;
  texture.needsUpdate = true;
  return texture;
}

export function seaMaterial(world: Projection, anisotropy: number): MeshStandardMaterial {
  const material = new MeshStandardMaterial({
    map: seaTexture(world, anisotropy),
    roughness: 0.98,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetUnits: RECESSION.sea,
  });
  // This texture is baked per engine, so the engine frees it on teardown. Sprite textures
  // are the opposite case — shared through `textureOf`'s cache — hence the flag rather than
  // a blanket "dispose every map you find".
  material.userData.ownsMap = true;
  return material;
}

/** How far the swell lightens and darkens the sea: the marbling's own range, no more — the
 *  contrast budget belongs to the game layer. */
const SWELL_AMPLITUDE = 0.04;
/** World units per swell wave (the board is 400 wide) and noise cells drifted per second. */
const SWELL_WAVELENGTH = 45;
const SWELL_DRIFT = 0.006;

const glsl = (value: number) => value.toFixed(4);

/** Cells of distance the coast texture holds: past the last isobath, the sea is just far. */
const COAST_CAP_CELLS = 24;
/** Isobaths, in board units off the coast (a unit is about a hundred kilometres): closer
 *  together inshore, paler and wider apart out at sea, like a chart's soundings. */
const ISOBATHS = [
  [0.3, 0.42],
  [0.75, 0.32],
  [1.4, 0.24],
  [2.4, 0.17],
  [3.8, 0.12],
] as const;
/** How much the open water deepens toward `seaInk`, reached at the last isobath. */
const DEEP_TINT = 0.1;
/** The sheet's own light. The lamp is warm and the sky warmer still: lit alone, a pale water
 *  tint came out the colour of the land, and the sea stopped reading as sea. */
const SHEET_GLOW = 0.2;
const GRATICULE_DEGREES = 10;
const GRATICULE_OPACITY = 0.22;
/** A rose engraved in the North Atlantic, where the Europe view always shows open water. */
const ROSE_AT: LonLat = [-33, 44];
const ROSE_RADIUS = 3.2;
const ROSE_OPACITY = 0.55;
/** The prototype's Bodoni « N », above the north point: its centre and its box, in rose radii. */
const ROSE_LETTER_AT = 1.42;
const ROSE_LETTER_SIZE = 0.6;
const ROSE_LETTER_PX = 128;
const ROSE_LETTER_FONT = `700 ${ROSE_LETTER_PX * 0.72}px "Bodoni Moda", Georgia, serif`;
const SURF_REACH = 1.25;
const SURF_PERIOD_S = 12;
const SURF_RINGS = 2;
const SURF_RING_OPACITY = 0.12;
const SURF_RING_WIDTH = 0.06;
const SURF_EDGE_OPACITY = 0.32;
const SURF_EDGE_WIDTH = 0.07;

/**
 * **La houle** (carte-vivante.md, prototype 1). A dot screen was tried first and dropped: a fine
 * regular pattern over the whole sea tires the eye. What is left is the paper's marbling, swelled
 * by broad waves of tone anchored to the board, so they do not slide under a pan.
 *
 * **L'écume** (décisions de Pierre, 10/10 et 11/10) rides on the same shader: a light edge on the
 * shore and two rings breathing out to sea, at close range only. Both read one field of distance
 * to the coast for the whole sea, so the rings of two countries merge where they meet and round
 * off at every cape — a band per outline left a seam wherever two overlapped.
 */
export class SeaLayer implements AmbientLayer {
  readonly fx = 'sea';
  private readonly time = { value: 0 };
  // Until the field lands, every texel says "far": no surf rather than surf everywhere.
  private readonly coast = { value: coastTexture(new Uint8Array([255]), 1, 1) };
  private readonly surf = { value: 0 };
  private readonly coastOrigin = { value: [0, 0] };
  private readonly coastScale = { value: [1, 1] };
  private readonly coastStep = { value: 1 };
  // Radius zero until the frame is known: no rose rather than a rose at the origin.
  private readonly rose = { value: [0, 0, 0] };
  private readonly roseLetter: { value: Texture } = {
    value: coastTexture(new Uint8Array([0]), 1, 1),
  };
  private readonly glow = { value: SHEET_GLOW };
  private readonly paper = { value: new Color(PALETTE.foam) };
  private disposed = false;

  /** The sheet's own light goes down with the sky: lit from within, the sea stayed day at night. */
  dim(night: number): void {
    this.glow.value = SHEET_GLOW * (1 - 0.8 * night);
    // The foam is laid after the light: left alone, it shone white along every coast at night.
    this.paper.value.set(PALETTE.foam).multiplyScalar(1 - 0.6 * night);
  }

  /** The surf along the coast of the routing grid the engine loaded (`loadShore`). */
  shore(frame: WorldFrame, shore: Shore): void {
    if (this.disposed) return;
    const { grid } = shore;
    this.coast.value.dispose();
    this.coast.value = coastTexture(shore.bytes, grid.width, grid.height);
    this.coastOrigin.value = [-frame.width / 2, -frame.height / 2];
    this.coastScale.value = [1 / (grid.width * grid.step), 1 / (grid.height * grid.step)];
    this.coastStep.value = grid.step;
    const rose = frame.projectLonLat(ROSE_AT);
    this.rose.value = [rose.x, rose.z, ROSE_RADIUS];
    const letter = roseLetterTexture();
    if (letter !== null) {
      this.roseLetter.value.dispose();
      this.roseLetter.value = letter;
    }
  }

  /** The regions' fade, threshold for threshold: the surf belongs to the close view. */
  fade(cameraDistance: number): void {
    this.surf.value = Math.min(
      1,
      Math.max(
        0,
        (REGIONS_GONE_DISTANCE - cameraDistance) / (REGIONS_GONE_DISTANCE - REGIONS_FULL_DISTANCE),
      ),
    );
  }

  dispose(): void {
    this.disposed = true;
    this.coast.value.dispose();
    this.roseLetter.value.dispose();
  }

  swell(material: MeshStandardMaterial): MeshStandardMaterial {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.seaTime = this.time;
      shader.uniforms.seaCoast = this.coast;
      shader.uniforms.seaSurf = this.surf;
      shader.uniforms.seaCoastOrigin = this.coastOrigin;
      shader.uniforms.seaCoastScale = this.coastScale;
      shader.uniforms.seaCoastStep = this.coastStep;
      shader.uniforms.seaPaper = this.paper;
      shader.uniforms.seaInk = { value: new Color(PALETTE.seaInk) };
      shader.uniforms.seaRose = this.rose;
      shader.uniforms.seaRoseLetter = this.roseLetter;
      shader.uniforms.seaGlow = this.glow;
      shader.vertexShader = shader.vertexShader
        .replace(
          'void main() {',
          'attribute vec2 lonLat;\nvarying vec2 vSeaBoard;\nvarying vec2 vSeaLonLat;\nvoid main() {',
        )
        .replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvSeaBoard = position.xz;\nvSeaLonLat = lonLat;',
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          'void main() {',
          `uniform float seaTime;
          uniform sampler2D seaCoast;
          uniform float seaSurf;
          uniform vec2 seaCoastOrigin;
          uniform vec2 seaCoastScale;
          uniform float seaCoastStep;
          uniform vec3 seaPaper;
          uniform vec3 seaInk;
          uniform vec3 seaRose;
          uniform sampler2D seaRoseLetter;
          uniform float seaGlow;
          varying vec2 vSeaBoard;
          varying vec2 vSeaLonLat;
          // A line a pixel wide wherever value crosses at, whatever the zoom.
          float seaLine(float value, float at, float perPixel) {
            return 1.0 - smoothstep(0.5, 1.5, abs(value - at) / max(perPixel, 1e-5));
          }
          // One point of the rose: a kite along +y, filled on one side, lighter on the other.
          float seaRosePoint(vec2 p, float turn, float len, float half_, float aa) {
            vec2 axis = vec2(sin(turn), -cos(turn));
            float along = dot(p, axis);
            float across = p.x * axis.y - p.y * axis.x;
            float edge = half_ * (1.0 - along / len) - abs(across);
            float inside = smoothstep(-aa, aa, edge) * step(0.0, along);
            return inside * (across > 0.0 ? 1.0 : 0.4);
          }
          float seaHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float seaNoise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            vec2 u = f * f * (3.0 - 2.0 * f);
            return mix(
              mix(seaHash(i), seaHash(i + vec2(1.0, 0.0)), u.x),
              mix(seaHash(i + vec2(0.0, 1.0)), seaHash(i + vec2(1.0, 1.0)), u.x),
              u.y
            );
          }
          void main() {`,
        )
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
          vec2 seaWave = vSeaBoard / ${glsl(SWELL_WAVELENGTH)};
          float seaDrift = seaTime * ${glsl(SWELL_DRIFT)};
          // Two layers drifting apart, so the swell breathes in place instead of only sliding.
          float seaSwell = 0.6 * seaNoise(seaWave + vec2(seaDrift, seaDrift * 0.4))
            + 0.4 * seaNoise(seaWave * 1.9 - vec2(seaDrift * 0.7, -seaDrift));
          diffuseColor.rgb *= 1.0 + ${glsl(SWELL_AMPLITUDE * 2)} * (seaSwell - 0.5);

          // The chart's engraving: ink laid on the paper before the lamp lights it. Land cells
          // hold 0 and their sea neighbours 1: the coast runs halfway between.
          float seaOff = max(0.0,
            texture2D(seaCoast, (vSeaBoard - seaCoastOrigin) * seaCoastScale).r
              * ${glsl(COAST_CAP_CELLS)} - 0.5) * seaCoastStep;
          float seaPerPixel = fwidth(seaOff);
          float seaEngraving = ${glsl(DEEP_TINT)} * smoothstep(0.0, ${glsl(ISOBATHS.at(-1)![0])}, seaOff);
          ${ISOBATHS.map(
            ([at, opacity], i) => `
          // Out of sight when the next one would sit closer than a few pixels: no grey felt.
          seaEngraving = max(seaEngraving, ${glsl(opacity)} * seaLine(seaOff, ${glsl(at)}, seaPerPixel)
            * (1.0 - smoothstep(0.12, 0.3, seaPerPixel / ${glsl(at - (ISOBATHS[i - 1]?.[0] ?? 0))})));`,
          ).join('')}
          vec2 seaDegrees = vSeaLonLat / ${glsl(GRATICULE_DEGREES)};
          vec2 seaDegreesPerPixel = fwidth(seaDegrees);
          vec2 seaGrid = abs(fract(seaDegrees - 0.5) - 0.5) / max(seaDegreesPerPixel, vec2(1e-5));
          float seaGraticule = 1.0 - smoothstep(0.5, 1.5, min(seaGrid.x, seaGrid.y));
          seaGraticule *= 1.0 - smoothstep(0.15, 0.4, max(seaDegreesPerPixel.x, seaDegreesPerPixel.y));
          seaEngraving = max(seaEngraving, ${glsl(GRATICULE_OPACITY)} * seaGraticule);
          if (seaRose.z > 0.0) {
            vec2 roseAt = (vSeaBoard - seaRose.xy) / seaRose.z;
            float roseR = length(roseAt);
            float rosePx = fwidth(roseR);
            float rose = max(seaLine(roseR, 0.84, rosePx), seaLine(roseR, 0.76, rosePx));
            // Its letter stands within two radii, its north point's antialiased tip within nine
            // pixels past them: further out, eight kites for nothing.
            if (roseR < 2.0 + 10.0 * rosePx) {
              for (int k = 0; k < 4; k++) {
                float turn = float(k) * 1.5708;
                rose = max(rose, seaRosePoint(roseAt, turn, k == 0 ? 1.15 : 1.0, 0.13, rosePx));
                rose = max(rose, seaRosePoint(roseAt, turn + 0.7854, 0.55, 0.08, rosePx));
              }
              // North is -y on the board: the letter's top faces it, and reads upright from the south.
              vec2 letterUv = vec2(0.5, 0.5) + vec2(roseAt.x, -(roseAt.y + ${glsl(ROSE_LETTER_AT)}))
                / ${glsl(ROSE_LETTER_SIZE)};
              if (all(greaterThan(letterUv, vec2(0.0))) && all(lessThan(letterUv, vec2(1.0)))) {
                rose = max(rose, texture2D(seaRoseLetter, letterUv).r);
              }
            }
            seaEngraving = max(seaEngraving, ${glsl(ROSE_OPACITY)} * rose);
          }
          diffuseColor.rgb = mix(diffuseColor.rgb, seaInk, seaEngraving);`,
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          totalEmissiveRadiance += seaGlow * diffuseColor.rgb;`,
        )
        .replace(
          '#include <colorspace_fragment>',
          `if (seaSurf > 0.0) {
            float offshore = seaOff;
            float foam = ${glsl(SURF_EDGE_OPACITY)}
              * (1.0 - smoothstep(0.0, ${glsl(SURF_EDGE_WIDTH)}, offshore));
            for (int i = 0; i < ${SURF_RINGS}; i++) {
              float reach = fract(seaTime / ${glsl(SURF_PERIOD_S)} + float(i) / ${glsl(SURF_RINGS)});
              // A square written out: pow() is undefined for a negative base, NaN under ANGLE.
              float apart = (offshore - reach * ${glsl(SURF_REACH)}) / ${glsl(SURF_RING_WIDTH)};
              float ring = exp(-apart * apart);
              foam = max(foam, ${glsl(SURF_RING_OPACITY)} * (1.0 - reach) * ring);
            }
            gl_FragColor.rgb = mix(gl_FragColor.rgb, seaPaper, foam * seaSurf);
          }
          #include <colorspace_fragment>`,
        );
    };
    return material;
  }

  frame(time: number): void {
    this.time.value = time;
  }
}

export type Shore = { readonly grid: RouteGrid; readonly bytes: Uint8Array<ArrayBuffer> };
let shoreField: Promise<Shore> | null = null;

/** One download and one transform per page, whatever the engines: a remounted board reuses them.
 *  A failure is forgotten, so the next load tries afresh: without the grid the land would read
 *  as sea, which is worth an error. */
export function loadShore(projection: Projection, url = '/grid.json'): Promise<Shore> {
  shoreField ??= fetch(url)
    .then((response) => {
      if (!response.ok) throw new Error(`grid not found: ${url}`);
      return response.json() as Promise<GridAsset>;
    })
    .then((asset): Shore => {
      const grid = decodeGrid(asset, projection);
      const distance = distanceToLand(landMaskOf(grid), grid.width, grid.height);
      return { grid, bytes: coastBytes(distance, grid.width) };
    })
    .catch((error: unknown) => {
      shoreField = null;
      throw error;
    });
  return shoreField;
}

/** One byte per cell is a sixteenth of a cell at the cap: bilinear filtering does the rest. */
function coastBytes(distance: Float32Array, width: number): Uint8Array<ArrayBuffer> {
  const capped = new Float32Array(distance.length);
  for (let i = 0; i < distance.length; i++) capped[i] = Math.min(distance[i]!, COAST_CAP_CELLS);
  const smooth = softenColumns(softenRows(capped, width), width);
  const bytes = new Uint8Array(smooth.length);
  for (let i = 0; i < smooth.length; i++) bytes[i] = (smooth[i]! / COAST_CAP_CELLS) * 255 + 0.5;
  return bytes;
}

/** White on black, read as coverage: redrawn once Bodoni has loaded, Georgia until then. */
function roseLetterTexture(): CanvasTexture | null {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = ROSE_LETTER_PX;
  const ctx = canvas.getContext('2d');
  if (ctx === null) return null;
  const draw = (): void => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, ROSE_LETTER_PX, ROSE_LETTER_PX);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.font = ROSE_LETTER_FONT;
    // Centred on its ink, not its line box: the cap sits mid-square whatever the face.
    const ink = ctx.measureText('N');
    const middle = (ink.actualBoundingBoxAscent - ink.actualBoundingBoxDescent) / 2;
    ctx.fillText('N', ROSE_LETTER_PX / 2, ROSE_LETTER_PX / 2 + middle);
    // Bodoni's hairlines vanish once laid flat and seen at a slant: a stroke gives them the
    // weight of the face at a small optical size.
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = ROSE_LETTER_PX * 0.025;
    ctx.strokeText('N', ROSE_LETTER_PX / 2, ROSE_LETTER_PX / 2 + middle);
  };
  draw();
  const texture = new CanvasTexture(canvas);
  void document.fonts?.load(ROSE_LETTER_FONT).then(() => {
    draw();
    texture.needsUpdate = true;
  });
  return texture;
}

function coastTexture(bytes: Uint8Array<ArrayBuffer>, width: number, height: number): DataTexture {
  const texture = new DataTexture(bytes, width, height, RedFormat);
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/*
 * A binomial 1-4-6-4-1, across the rows then down the columns, both read in memory order. An
 * exact distance over a raster still carries its staircase, and bilinear filtering draws it at
 * the closest zoom as a kink in every ring.
 */
function softenRows(field: Float32Array, width: number): Float32Array {
  const out = new Float32Array(field.length);
  const last = width - 1;
  for (let base = 0; base < field.length; base += width) {
    for (let k = 0; k < width; k++) {
      const a = base + Math.max(0, k - 2);
      const b = base + Math.max(0, k - 1);
      const d = base + Math.min(last, k + 1);
      const e = base + Math.min(last, k + 2);
      out[base + k] =
        (field[a]! + 4 * (field[b]! + field[d]!) + 6 * field[base + k]! + field[e]!) / 16;
    }
  }
  return out;
}

function softenColumns(field: Float32Array, width: number): Float32Array {
  const out = new Float32Array(field.length);
  const height = field.length / width;
  for (let row = 0; row < height; row++) {
    const a = Math.max(0, row - 2) * width;
    const b = Math.max(0, row - 1) * width;
    const c = row * width;
    const d = Math.min(height - 1, row + 1) * width;
    const e = Math.min(height - 1, row + 2) * width;
    for (let k = 0; k < width; k++) {
      out[c + k] =
        (field[a + k]! + 4 * (field[b + k]! + field[d + k]!) + 6 * field[c + k]! + field[e + k]!) /
        16;
    }
  }
  return out;
}

/**
 * Deterministic value noise: the same point always yields the same value, with no table or
 * seed to carry around. The sea's marbling is its only consumer; it must stay
 * identical across reloads, hence no seed and no random.
 */
function valueNoise(x: number, y: number): number {
  const hash = (a: number, b: number) => {
    const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const low = hash(xi, yi) + (hash(xi + 1, yi) - hash(xi, yi)) * u;
  const high = hash(xi, yi + 1) + (hash(xi + 1, yi + 1) - hash(xi, yi + 1)) * u;
  return low + (high - low) * v;
}
