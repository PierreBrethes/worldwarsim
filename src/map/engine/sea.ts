import {
  Color,
  DataTexture,
  LinearFilter,
  MeshStandardMaterial,
  RedFormat,
  SRGBColorSpace,
} from 'three';
import { LAND, type GridAsset } from '@/domain/routing';
import type { World } from '@/domain/world';
import type { AmbientLayer } from './ambience';
import { distanceToLand } from './coast-distance';
import type { WorldFrame } from './frame';
import { PALETTE } from './palette';
import { REGIONS_FULL_DISTANCE, REGIONS_GONE_DISTANCE } from './regions';

const TEXTURE_WIDTH = 2400;
const MARBLING_AMPLITUDE = 0.055;

/**
 * The sea is a single ink, shore to open water: the texture only carries the paper's
 * marbling. Everything baked in texels that follows the coast — shadow, depth tint,
 * isobaths — pixelates at zoom; the geometric wash borders the coasts in its place
 * (see `coastal-wash.ts`), and the surf reads a distance field, which interpolates cleanly.
 */
function seaTexture(world: World, anisotropy: number): DataTexture {
  const width = TEXTURE_WIDTH;
  const height = Math.round(
    (width * (world.sphere.maxY - world.sphere.minY)) / (world.sphere.maxX - world.sphere.minX),
  );
  const image = new Uint8Array(width * height * 4);
  const marblingScale = (90 * width) / 1400;

  const sea = new Color(PALETTE.sea);
  const color = new Color();

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;

      // Land is painted sea-colored: the country meshes cover it, and every "paper" texel
      // peeking past their silhouette made a sand staircase on the coast.
      color.copy(sea);
      const marbling = valueNoise(x / marblingScale, y / marblingScale) - 0.5;
      color.offsetHSL(0, 0, marbling * MARBLING_AMPLITUDE);

      image[offset] = color.r * 255;
      image[offset + 1] = color.g * 255;
      image[offset + 2] = color.b * 255;
      image[offset + 3] = 255;
    }
  }

  const texture = new DataTexture(image, width, height);
  texture.flipY = true;
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = anisotropy;
  texture.needsUpdate = true;
  return texture;
}

export function seaMaterial(world: World, anisotropy: number): MeshStandardMaterial {
  const material = new MeshStandardMaterial({
    map: seaTexture(world, anisotropy),
    roughness: 0.98,
    metalness: 0,
  });
  // This texture is baked per engine, so the engine frees it on teardown. Sprite textures
  // are the opposite case — shared through `textureOf`'s cache — hence the flag rather than
  // a blanket "dispose every map you find".
  material.userData.ownsMap = true;
  return material;
}

/** How far the swell lightens and darkens the sea: the marbling's own range, no more — the
 *  contrast budget belongs to the game layer. */
const SWELL_AMPLITUDE = 0.06;
/** World units per swell wave (the board is 400 wide) and noise cells drifted per second. */
const SWELL_WAVELENGTH = 45;
const SWELL_DRIFT = 0.006;

const glsl = (value: number) => value.toFixed(4);

/** Cells of distance the surf texture holds: past the rings' reach, the sea is just far. */
const COAST_CAP_CELLS = 16;
const SURF_REACH = 1;
const SURF_PERIOD_S = 6;
const SURF_RINGS = 2;
const SURF_RING_OPACITY = 0.25;
const SURF_RING_WIDTH = 0.06;
const SURF_EDGE_OPACITY = 0.32;
const SURF_EDGE_WIDTH = 0.07;
const PAPER = '#f4ecd8';

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
  private readonly coast = { value: coastTexture(new Float32Array([COAST_CAP_CELLS]), 1, 1) };
  private readonly surf = { value: 0 };
  private readonly coastOrigin = { value: [0, 0] };
  private readonly coastScale = { value: [1, 1] };
  private readonly coastStep = { value: 1 };

  /** Rasterised once from the baked routing grid — the client's own copy of the same coasts. */
  async shore(frame: WorldFrame, url = '/grid.json'): Promise<void> {
    const asset = (await (await fetch(url)).json()) as GridAsset;
    const land = new Uint8Array(asset.width * asset.height);
    let at = 0;
    for (let run = 0; run < asset.cells.length; run += 2) {
      if (asset.cells[run] === LAND) land.fill(1, at, at + asset.cells[run + 1]!);
      at += asset.cells[run + 1]!;
    }
    const distance = distanceToLand(land, asset.width, asset.height);
    this.coast.value.dispose();
    this.coast.value = coastTexture(distance, asset.width, asset.height);
    this.coastOrigin.value = [-frame.width / 2, -frame.height / 2];
    this.coastScale.value = [1 / (asset.width * asset.step), 1 / (asset.height * asset.step)];
    this.coastStep.value = asset.step;
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
    this.coast.value.dispose();
  }

  swell(material: MeshStandardMaterial): MeshStandardMaterial {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.seaTime = this.time;
      shader.uniforms.seaCoast = this.coast;
      shader.uniforms.seaSurf = this.surf;
      shader.uniforms.seaCoastOrigin = this.coastOrigin;
      shader.uniforms.seaCoastScale = this.coastScale;
      shader.uniforms.seaCoastStep = this.coastStep;
      shader.uniforms.seaPaper = { value: new Color(PAPER) };
      shader.vertexShader = shader.vertexShader
        .replace('void main() {', 'varying vec2 vSeaBoard;\nvoid main() {')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSeaBoard = position.xz;');
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
          varying vec2 vSeaBoard;
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
          diffuseColor.rgb *= 1.0 + ${glsl(SWELL_AMPLITUDE * 2)} * (seaSwell - 0.5);`,
        )
        .replace(
          '#include <colorspace_fragment>',
          `if (seaSurf > 0.0) {
            float seaCells = texture2D(seaCoast, (vSeaBoard - seaCoastOrigin) * seaCoastScale).r
              * ${glsl(COAST_CAP_CELLS)};
            // Land cells hold 0 and their sea neighbours 1: the coast runs halfway between.
            float offshore = max(0.0, seaCells - 0.5) * seaCoastStep;
            float foam = ${glsl(SURF_EDGE_OPACITY)}
              * (1.0 - smoothstep(0.0, ${glsl(SURF_EDGE_WIDTH)}, offshore));
            for (int i = 0; i < ${SURF_RINGS}; i++) {
              float reach = fract(seaTime / ${glsl(SURF_PERIOD_S)} + float(i) / ${glsl(SURF_RINGS)});
              float ring = exp(-pow((offshore - reach * ${glsl(SURF_REACH)}) / ${glsl(SURF_RING_WIDTH)}, 2.0));
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

/** One byte per cell is a sixteenth of a cell at the cap: bilinear filtering does the rest. */
function coastTexture(distance: Float32Array, width: number, height: number): DataTexture {
  const capped = new Float32Array(distance.length);
  for (let i = 0; i < distance.length; i++) capped[i] = Math.min(distance[i]!, COAST_CAP_CELLS);
  const smooth = softenColumns(softenRows(capped, width), width);
  const bytes = new Uint8Array(smooth.length);
  for (let i = 0; i < smooth.length; i++) bytes[i] = (smooth[i]! / COAST_CAP_CELLS) * 255 + 0.5;
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
