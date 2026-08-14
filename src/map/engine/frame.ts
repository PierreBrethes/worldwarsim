import { Vector3 } from 'three';
import type { LonLat } from '@/domain/geo';
import type { OutlineSample, World } from '@/domain/world';

export const COUNTRY_THICKNESS = 0.08;
export const SEA_LEVEL = -0.10;
/** How far a country's slab drops below zero: its cliff plunges into the water instead of floating. */
export const DRAFT = 0.10;
export const PLINTH_HEIGHT = 5;
const CURVATURE_RADIUS = 900;

/**
 * The world's frame and the fake-horizon curvature. Curvature is applied to positions on the
 * CPU, never in a shader: otherwise raycasting would keep aiming at flat geometry and clicks
 * would land off-target at the edges.
 */
export class WorldFrame {
  readonly centerX: number;
  readonly centerY: number;
  readonly width: number;
  readonly height: number;
  private readonly outline: ReadonlyArray<OutlineSample>;
  private curvatureIntensity = 0;

  constructor(world: World) {
    this.centerX = (world.sphere.minX + world.sphere.maxX) / 2;
    this.centerY = (world.sphere.minY + world.sphere.maxY) / 2;
    this.width = world.sphere.maxX - world.sphere.minX;
    this.height = world.sphere.maxY - world.sphere.minY;
    this.outline = world.outline;
  }

  get curvature(): number {
    return this.curvatureIntensity;
  }

  set curvature(value: number) {
    this.curvatureIntensity = value;
  }

  drop(x: number, z: number): number {
    return (-this.curvatureIntensity * (x * x + z * z)) / (2 * CURVATURE_RADIUS);
  }

  toWorld(projectedX: number, projectedY: number, height = COUNTRY_THICKNESS): Vector3 {
    const x = projectedX - this.centerX;
    const z = projectedY - this.centerY;
    return new Vector3(x, height + this.drop(x, z), z);
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
