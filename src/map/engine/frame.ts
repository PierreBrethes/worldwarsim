import { Vector3 } from 'three';
import type { LonLat } from '@/domain/geo';
import type { OutlineSample, World } from '@/domain/world';

export const COUNTRY_THICKNESS = 0.08;
export const SEA_LEVEL = -0.1;
export const PLINTH_HEIGHT = 5;

/**
 * The world's frame. **La table est plate** (13/10/2026) : la courbure d'horizon, qui n'était
 * plus jamais réglée au-dessus de zéro, est partie avec ses reconstructions — une carte posée
 * sur un bureau ne bombe pas.
 */
export class WorldFrame {
  readonly centerX: number;
  readonly centerY: number;
  readonly width: number;
  readonly height: number;
  private readonly outline: ReadonlyArray<OutlineSample>;

  constructor(world: World) {
    this.centerX = (world.sphere.minX + world.sphere.maxX) / 2;
    this.centerY = (world.sphere.minY + world.sphere.maxY) / 2;
    this.width = world.sphere.maxX - world.sphere.minX;
    this.height = world.sphere.maxY - world.sphere.minY;
    this.outline = world.outline;
  }

  toWorld(projectedX: number, projectedY: number, height = COUNTRY_THICKNESS): Vector3 {
    const x = projectedX - this.centerX;
    const z = projectedY - this.centerY;
    return new Vector3(x, height, z);
  }

  /**
   * The world is not equirectangular: the edges tighten toward the poles, so a longitude
   * only converts at the latitude where it is read.
   */
  projectLonLat(lonLat: LonLat, height = COUNTRY_THICKNESS): Vector3 {
    const edge = this.edgeAtLatitude(lonLat[1]);
    const x = this.centerX + (lonLat[0] / 180) * (edge.eastX - this.centerX);
    return this.toWorld(x, edge.y, height);
  }

  /**
   * The inverse of `projectLonLat`, for the one gesture that starts on the board rather than on
   * a datum: a right click names a place, and a place is a lon/lat.
   *
   * The outline is monotonic in `y`, so a bisection finds the latitude; the longitude then reads
   * off the width at *that* latitude, since the world is not equirectangular and the edges
   * tighten toward the poles.
   */
  lonLatAt(projectedX: number, projectedY: number): LonLat {
    let low = 0;
    let high = this.outline.length - 1;
    while (high - low > 1) {
      const middle = (low + high) >> 1;
      if (this.outline[middle]![3] >= projectedY) low = middle;
      else high = middle;
    }
    const a = this.outline[low]!;
    const b = this.outline[high]!;
    const span = b[3] - a[3];
    const fraction = span === 0 ? 0 : (projectedY - a[3]) / span;
    const latitude = Math.min(90, Math.max(-90, a[0] + (b[0] - a[0]) * fraction));
    const halfWidth = this.edgeAtLatitude(latitude).eastX - this.centerX;
    const longitude = halfWidth === 0 ? 0 : ((projectedX - this.centerX) / halfWidth) * 180;
    return [Math.min(180, Math.max(-180, longitude)), latitude];
  }

  edgeAtLatitude(latitude: number): { westX: number; eastX: number; y: number } {
    const position = Math.min(179.999, Math.max(0, latitude + 90));
    const index = Math.floor(position);
    const fraction = position - index;
    const a = this.outline[index] ?? this.outline[0]!;
    const b = this.outline[index + 1] ?? a;
    return {
      westX: a[1] + (b[1] - a[1]) * fraction,
      eastX: a[2] + (b[2] - a[2]) * fraction,
      y: a[3] + (b[3] - a[3]) * fraction,
    };
  }
}
