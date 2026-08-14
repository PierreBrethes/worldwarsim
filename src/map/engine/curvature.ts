import type { BufferGeometry } from 'three';
import type { WorldFrame } from './frame';

type CurvableGeometry = BufferGeometry & { userData: { flatY?: Float32Array } };

/**
 * Remembers each vertex's original Y to recompute the curvature when its intensity changes,
 * without ever reloading the geometry.
 */
export class Curvature {
  private readonly geometries: CurvableGeometry[] = [];

  constructor(private readonly frame: WorldFrame) {}

  register<T extends BufferGeometry>(geometry: T): T {
    const curvable = geometry as CurvableGeometry;
    const positions = curvable.attributes.position!;
    const flatY = new Float32Array(positions.count);
    for (let i = 0; i < positions.count; i++) flatY[i] = positions.getY(i);
    curvable.userData.flatY = flatY;
    this.geometries.push(curvable);
    this.applyTo(curvable);
    return geometry;
  }

  applyAll(): void {
    for (const geometry of this.geometries) this.applyTo(geometry);
  }

  private applyTo(geometry: CurvableGeometry): void {
    const positions = geometry.attributes.position!;
    const flatY = geometry.userData.flatY;
    if (!flatY) return;
    for (let i = 0; i < positions.count; i++) {
      positions.setY(i, flatY[i]! + this.frame.drop(positions.getX(i), positions.getZ(i)));
    }
    positions.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
  }
}
