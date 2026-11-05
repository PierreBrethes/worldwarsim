import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { STRATEGIC_POINTS } from '@/domain/strategic-points';
import type { World } from '@/domain/world';
import projectionAsset from '../../../public/projection.json';
import { WorldFrame } from './frame';

const world = {
  sphere: projectionAsset.sphere,
  outline: projectionAsset.outline,
  countries: [],
} as unknown as World;

/**
 * **Le recul de la victoire tient les Sept** (revue de #442), même tirés de Halifax à Hong Kong :
 * au téléphone, debout, le cadrage passe le plafond ordinaire de l'orbite (300) — il le lève pour
 * ce recul, sans quoi la caméra s'arrêterait en deçà et des points sortiraient du champ.
 */
describe('the pull-back of a victory', () => {
  it.each([
    ['at the desk', 1.6],
    ['on a phone', 0.46],
  ])('frames every one of the Seven, however far apart, %s', async (_where, aspect) => {
    const { MapEngine } = await import('./index');
    const camera = new PerspectiveCamera(42, aspect, 0.5, 3000);
    camera.position.set(0, 60, 1);
    const controls = { target: new Vector3(), maxDistance: 300, minDistance: 3 };
    const poseCamera = vi.fn();
    const frame = new WorldFrame(world);
    const engine = Object.assign(Object.create(MapEngine.prototype) as object, {
      camera,
      controls,
      frame,
      journey: null,
      invalidate: () => {},
      poseCamera,
    }) as unknown as InstanceType<typeof MapEngine>;
    const seven = Object.values(STRATEGIC_POINTS);
    engine.pullBack(seven, 0);
    const [pose] = poseCamera.mock.calls[0]!;
    // Every point inside the view, seen from where the pose stands.
    const eye = new PerspectiveCamera(42, aspect, 0.5, 3000);
    eye.position
      .fromArray(pose.target)
      .addScaledVector(new Vector3(...pose.orientation), pose.distance);
    eye.lookAt(new Vector3(...pose.target));
    eye.updateMatrixWorld();
    for (const place of seven) {
      const seen = frame.projectLonLat(place).project(eye);
      expect(Math.abs(seen.x), String(place)).toBeLessThanOrEqual(1);
      expect(Math.abs(seen.y), String(place)).toBeLessThanOrEqual(1);
    }
    expect(controls.maxDistance).toBeGreaterThanOrEqual(pose.distance);
  });
});
