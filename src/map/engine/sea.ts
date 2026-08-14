import { Color, DataTexture, MeshStandardMaterial, SRGBColorSpace } from 'three';
import type { World } from '@/domain/world';
import { valueNoise } from './fields';
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
