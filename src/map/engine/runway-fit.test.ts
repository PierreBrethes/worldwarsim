import { describe, expect, it } from 'vitest';
import { AIRFIELD } from '@/emblems/kits/manifest';
import {
  fitRunway,
  RUNWAY_MIN_M,
  RUNWAY_MODULES,
  SOCLE,
  runwayLength,
  runwayModules,
  type RunwayGround,
} from './runway-fit';
import { AIR } from './timelines/airfield';
import { sceneOfFile } from './gltf-scene.fixture';
import { Box3 } from 'three';

/** A shore on the board, in the site's frame: `wet(x, z)` is the sea at a board point, and the site
 *  is carried to the board turned `turn` as `MaquetteLayer.pose` does. */
const shore =
  (wet: (x: number, z: number) => boolean): RunwayGround =>
  (x, z, turn) =>
    !wet(x * Math.cos(turn) + z * Math.sin(turn), -x * Math.sin(turn) + z * Math.cos(turn));

describe('a runway the coast presses (#493)', () => {
  it('stays whole, plain and straight on dry land', () => {
    expect(fitRunway(() => true)).toEqual({ turn: 0, mirrored: false, modules: RUNWAY_MODULES });
  });

  it('goes over to the other side first, in mirror, when its free end is in the sea', () => {
    // Water beyond the plain free end (x = -134) only.
    const fit = fitRunway(shore((x) => x < -100));
    expect(fit).toEqual({ turn: 0, mirrored: true, modules: RUNWAY_MODULES });
  });

  it('turns by steps of 15° when both sides are wet, nearest its heading first', () => {
    const ground = shore((x) => Math.abs(x) > 110);
    const fit = fitRunway(ground);
    expect(fit.mirrored).toBe(false);
    expect(fit.turn).not.toBe(0);
    const steps = fit.turn / (Math.PI / 12);
    expect(steps).toBeCloseTo(Math.round(steps), 6);
    expect(fit.modules).toBe(RUNWAY_MODULES);
    // Nearer its heading it is wet: the step before it is the plain one.
    const { x1, z, length } = AIRFIELD.runway;
    expect(ground(x1 - length + 2, z, 0)).toBe(false);
  });

  it('tries the mirror turned by the same steps before cutting short', () => {
    // Both free ends are in the sea at every turn but 15°, where only the side of +x is dry.
    const only: RunwayGround = (x, _z, turn) =>
      Math.abs(turn - Math.PI / 12) < 1e-9 ? x > -70 : Math.abs(x) < 100;
    expect(fitRunway(only)).toEqual({
      turn: Math.PI / 12,
      mirrored: true,
      modules: RUNWAY_MODULES,
    });
  });

  it('is cut short, from the free end in, when no side nor turn keeps it whole', () => {
    // A little island: land within 150 m of the site's middle.
    const fit = fitRunway(shore((x, z) => Math.hypot(x, z) > 150));
    expect(fit.modules).toBeLessThan(RUNWAY_MODULES);
    expect(runwayLength(fit.modules)).toBeGreaterThanOrEqual(RUNWAY_MIN_M);
    // Whole modules only, and what is kept is dry: the last metres of it stand on land.
    const { x1, z } = AIRFIELD.runway;
    const end = x1 - runwayLength(fit.modules);
    const ground = shore((x, zz) => Math.hypot(x, zz) > 150);
    const side = fit.mirrored ? -1 : 1;
    expect(ground(side * (end + 1), z, fit.turn)).toBe(true);
  });

  it('is not drawn under the minimum, the transport of the farthest lane at its roll', () => {
    expect(RUNWAY_MIN_M).toBe(138);
    expect(fitRunway(shore((x, z) => Math.hypot(x, z) > 135)).modules).toBe(0);
  });

  it('keeps the minimum a whole number of modules would reach', () => {
    expect(runwayLength(runwayModules(RUNWAY_MODULES).length)).toBe(AIRFIELD.runway.length);
    const shortest = runwayModules(RUNWAY_MODULES - 3);
    expect(shortest.map(([name]) => name)).toEqual([
      'piste_bout',
      'piste_seuil',
      ...Array.from({ length: 11 }, () => 'piste_troncon'),
      'piste_seuil',
      'piste_bout',
    ]);
    expect(runwayLength(RUNWAY_MODULES - 3)).toBe(140);
    expect(runwayModules(0)).toEqual([]);
  });

  it('reads the minimum off the planes, not a number of its own', () => {
    const roll = Math.max(...Object.values(AIR).map((each) => each.roll));
    expect(RUNWAY_MIN_M).toBe(AIRFIELD.runway.x1 - (AIRFIELD.lanes[0] - 12) + roll);
  });
});

describe('the socle the fit reads', () => {
  it('is the socle of airfield.glb', () => {
    const scene = sceneOfFile('src/emblems/buildings/airfield.glb');
    scene.updateWorldMatrix(true, true);
    const box = new Box3().setFromObject(scene.getObjectByName('socle')!);
    expect(box.max.x).toBeCloseTo(SOCLE.x, 1);
    expect(box.min.x).toBeCloseTo(-SOCLE.x, 1);
    expect(box.min.z).toBeCloseTo(SOCLE.z0, 1);
    expect(box.max.z).toBeCloseTo(SOCLE.z1, 1);
  });
});
