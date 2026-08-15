import { Color, DataTexture, MeshStandardMaterial, SRGBColorSpace } from 'three';
import type { World } from '@/domain/world';
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
