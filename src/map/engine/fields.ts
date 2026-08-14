import type { World } from '@/domain/world';

/**
 * Deterministic value noise: the same point always yields the same value, with no table or
 * seed to carry around. Shared between the sea (marbling) and the regions (relief) — two
 * renders that must stay stable across reloads.
 */
export function valueNoise(x: number, y: number): number {
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

/**
 * Rasterizes the countries onto the sphere's box: 1 = land, 0 = sea. This is the source of
 * both distance fields — depth for the sea, distance-to-coast for the regions.
 */
export function landMask(world: World, width: number, height: number): Uint8Array {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  const scaleX = width / (world.sphere.maxX - world.sphere.minX);
  const scaleY = height / (world.sphere.maxY - world.sphere.minY);

  context.fillStyle = '#000';
  context.fillRect(0, 0, width, height);
  context.fillStyle = '#fff';
  context.beginPath();
  for (const country of world.countries) {
    for (const ring of country.rings) {
      ring.forEach(([px, py], index) => {
        const x = (px - world.sphere.minX) * scaleX;
        const y = (py - world.sphere.minY) * scaleY;
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.closePath();
    }
  }
  context.fill();

  const image = context.getImageData(0, 0, width, height).data;
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < mask.length; i++) mask[i] = image[i * 4]! > 127 ? 1 : 0;
  return mask;
}

/**
 * Two-pass chamfer distance: an approximation of the Euclidean distance field, exact to
 * ~4%, in O(pixels). Yields each cell's distance (in pixels) to the nearest source.
 */
export function distanceField(
  width: number,
  height: number,
  isSource: (index: number) => boolean,
): Float32Array {
  const INFINITY = 1e9;
  const distance = new Float32Array(width * height);
  for (let i = 0; i < distance.length; i++) distance[i] = isSource(i) ? 0 : INFINITY;

  const read = (x: number, y: number) =>
    x < 0 || y < 0 || x >= width || y >= height ? INFINITY : distance[y * width + x]!;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (distance[i] === 0) continue;
      distance[i] = Math.min(
        distance[i]!,
        read(x - 1, y) + 1, read(x, y - 1) + 1,
        read(x - 1, y - 1) + 1.414, read(x + 1, y - 1) + 1.414,
      );
    }
  }
  for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
      const i = y * width + x;
      if (distance[i] === 0) continue;
      distance[i] = Math.min(
        distance[i]!,
        read(x + 1, y) + 1, read(x, y + 1) + 1,
        read(x + 1, y + 1) + 1.414, read(x - 1, y + 1) + 1.414,
      );
    }
  }
  return distance;
}
