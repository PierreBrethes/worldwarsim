import { Color, DataTexture, MeshStandardMaterial, SRGBColorSpace } from 'three';
import type { World } from '@/domain/world';
import type { AmbientLayer } from './ambience';
import { PALETTE } from './palette';

const TEXTURE_WIDTH = 2400;
const MARBLING_AMPLITUDE = 0.055;

/**
 * The sea is a single ink, shore to open water: the texture only carries the paper's
 * marbling. Everything baked in texels that follows the coast — shadow, depth tint,
 * isobaths — pixelates at zoom; the geometric wash borders the coasts in its place
 * (see `coastal-wash.ts`).
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

/** Screen pixels between two dots, measured along the 45° grid. */
const DOT_CELL_PX = 6;
/** Ink coverage of a cell at the swell's trough and crest — the Journal 1947 range, held lower:
 *  the contrast budget belongs to the game layer. */
const DOT_TONE_MIN = 0.12;
const DOT_TONE_MAX = 0.3;
const DOT_INK = 0.4;
/** World units per swell wave (the board is 400 wide) and noise cells drifted per second. */
const SWELL_WAVELENGTH = 45;
const SWELL_DRIFT = 0.006;

const glsl = (value: number) => value.toFixed(4);

/**
 * **La mer gravée** (carte-vivante.md, prototype 1). The dot screen is laid at the fragment in
 * screen pixels, like the region hatching, so it stays sharp from orbit to region; the swell
 * that swells the dots is anchored to the board, so it does not slide under a pan. It replaces
 * the marbling instead of covering it — two fine patterns over each other moiré.
 */
export class SeaLayer implements AmbientLayer {
  readonly fx = 'sea';
  private readonly time = { value: 0 };

  /** The renderer's ratio, not the screen's: it is capped at 2, and the pitch follows what is drawn. */
  constructor(private readonly pixelRatio: number) {}

  material(): MeshStandardMaterial {
    const material = new MeshStandardMaterial({ roughness: 0.98, metalness: 0 });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.seaTime = this.time;
      shader.uniforms.seaPixelRatio = { value: this.pixelRatio };
      shader.uniforms.seaPaper = { value: new Color(PALETTE.sea) };
      shader.uniforms.seaInk = { value: new Color(PALETTE.seaInk) };
      shader.vertexShader = shader.vertexShader
        .replace('void main() {', 'varying vec2 vSeaBoard;\nvoid main() {')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSeaBoard = position.xz;');
      shader.fragmentShader = shader.fragmentShader
        .replace(
          'void main() {',
          `uniform float seaTime;
          uniform float seaPixelRatio;
          uniform vec3 seaPaper;
          uniform vec3 seaInk;
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
          `vec2 seaWave = vSeaBoard / ${glsl(SWELL_WAVELENGTH)};
          float seaDrift = seaTime * ${glsl(SWELL_DRIFT)};
          // Two layers drifting apart, so the swell breathes in place instead of only sliding.
          float seaSwell = 0.6 * seaNoise(seaWave + vec2(seaDrift, seaDrift * 0.4))
            + 0.4 * seaNoise(seaWave * 1.9 - vec2(seaDrift * 0.7, -seaDrift));
          float seaTone = mix(${glsl(DOT_TONE_MIN)}, ${glsl(DOT_TONE_MAX)}, smoothstep(0.2, 0.8, seaSwell));
          vec2 seaPx = gl_FragCoord.xy / seaPixelRatio;
          vec2 seaGrid = vec2(seaPx.x + seaPx.y, seaPx.y - seaPx.x) * 0.70710678 / ${glsl(DOT_CELL_PX)};
          float seaDistance = length(fract(seaGrid) - 0.5) * ${glsl(DOT_CELL_PX)};
          // Radius by the square root so the tone is the inked area, as in the 1947 plate.
          float seaRadius = ${glsl(DOT_CELL_PX * 0.46)} * sqrt(seaTone);
          float seaCover = 1.0 - smoothstep(seaRadius - 0.5, seaRadius + 0.5, seaDistance);
          diffuseColor.rgb *= mix(seaPaper, seaInk, seaCover * ${glsl(DOT_INK)});`,
        );
    };
    return material;
  }

  frame(time: number): void {
    this.time.value = time;
  }
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
