import { describe, expect, it } from 'vitest';
import { AIRFIELD } from '@/emblems/kits/manifest';
import { Vector3 } from 'three';
import {
  LIGHT_FADE_MS,
  LIGHT_WAVE_MS,
  RUNWAY_HALO_CAP,
  runwayHalos,
  runwayLit,
} from './runway-lights';
import { RUNWAY_MODULES, runwayLength } from './runway-fit';

const LENGTH = AIRFIELD.runway.length;
const MS = 6000;

describe('the runway lights, lit one reach after another (#497)', () => {
  it('are all out before the movement, and the first reach is lit before the last', () => {
    expect(runwayLit(0, 0, MS)).toBe(0);
    expect(runwayLit(LENGTH, 0, MS)).toBe(0);
    const t = LIGHT_WAVE_MS / 2;
    expect(runwayLit(5, t, MS)).toBe(1);
    expect(runwayLit(LENGTH - 5, t, MS)).toBe(0);
  });

  it('come on from the hangars out, never back', () => {
    for (const t of [200, 600, 1000, LIGHT_WAVE_MS]) {
      let last = 1;
      for (let reach = 0; reach <= LENGTH; reach += 5) {
        const now = runwayLit(reach, t, MS);
        expect(now).toBeLessThanOrEqual(last);
        last = now;
      }
    }
  });

  it('are all lit once the wave has run, and fade out together by the end of the movement', () => {
    const settled = LIGHT_WAVE_MS + 500;
    for (const reach of [5, 85, LENGTH - 5]) expect(runwayLit(reach, settled, MS)).toBe(1);
    const end = MS - LIGHT_FADE_MS / 2;
    expect(runwayLit(5, end, MS)).toBe(runwayLit(LENGTH - 5, end, MS));
    expect(runwayLit(5, end, MS)).toBeGreaterThan(0);
    expect(runwayLit(5, end, MS)).toBeLessThan(1);
    expect(runwayLit(5, MS, MS)).toBe(0);
  });

  it('never flicker: a short movement is a wave cut short, not a lamp lit then put out then lit', () => {
    const short = 900;
    for (const reach of [5, 85, LENGTH - 5]) {
      let rising = true;
      let last = 0;
      for (let t = 0; t <= short; t += 20) {
        const now = runwayLit(reach, t, short);
        if (now < last) rising = false;
        else if (!rising && now > last) throw new Error(`flicker at ${t}`);
        last = now;
      }
    }
  });
});

describe('the lights of a runway cut short (#493)', () => {
  const cut = 15;
  const length = runwayLength(cut);

  it('light their wave over the runway that remains: the free end is reached in the same time', () => {
    const t = LIGHT_WAVE_MS + LIGHT_FADE_MS;
    expect(runwayLit(length - 5, t, MS * 2, length)).toBe(1);
    expect(runwayLit(length - 5, 1200, MS, length)).toBe(0);
    // Read against the whole one, the last reach of the short one would be lit earlier.
    expect(runwayLit(length - 5, 1200, MS)).toBeGreaterThan(0);
  });

  it('stand on the modules of the cut runway, the whole one’s scene left as it was', async () => {
    const { sceneOfFile } = await import('./gltf-scene.fixture');
    const { dressedScene, RUNWAY_LIGHTS, withRunway } = await import('./site-kits');
    const { BUILDING_MAQUETTES } = await import('@/emblems/buildings/manifest');
    const file = sceneOfFile('src/emblems/buildings/airfield.glb');
    const kit = async () => sceneOfFile('src/emblems/kits/piste.glb');
    const url = BUILDING_MAQUETTES.airfield!;
    const reaches = (scene: import('three').Object3D) => {
      const found = new Set<number>();
      scene.traverse((node) => {
        const material = (node as import('three').Mesh).material as unknown as
          { name: string; userData: { reach: number } } | undefined;
        if (material?.name === RUNWAY_LIGHTS) found.add(material.userData.reach);
      });
      return [...found].sort((a, b) => a - b);
    };
    const cutScene = await dressedScene(withRunway(url, cut), file, kit);
    const whole = await dressedScene(url, file, kit);
    expect(reaches(cutScene)).toHaveLength(cut - 2);
    expect(reaches(cutScene).at(-1)).toBeLessThan(length);
    expect(reaches(whole)).toHaveLength(RUNWAY_MODULES - 2);
    expect(file.getObjectByName('piste')).toBeUndefined();
  });

  it('lay their halos on the modules that remain, none beyond the free end', () => {
    const halos = runwayHalos(RUNWAY_HALO_CAP, cut);
    expect(halos).toHaveLength(2 * (cut - 2));
    const { x1 } = AIRFIELD.runway;
    for (const { reach, at } of halos) {
      expect(reach).toBeLessThan(length);
      expect(at.x).toBeGreaterThan(x1 - length - 1);
    }
    expect(runwayHalos(RUNWAY_HALO_CAP, 0)).toEqual([]);
  });
});

describe('the runway lights, a halo to each (#498)', () => {
  it('lays two halos to each module but the ends, 32 in all, under the cap', () => {
    const halos = runwayHalos();
    expect(halos).toHaveLength(32);
    expect(halos.length).toBeLessThanOrEqual(RUNWAY_HALO_CAP);
    const reaches = new Set(halos.map(({ reach }) => reach));
    expect(reaches.size).toBe(16);
  });

  it('falls back to one a module, on its axis, past the cap', () => {
    const halos = runwayHalos(31);
    expect(halos).toHaveLength(16);
    for (const { reach, at } of halos) {
      expect(at.z).toBe(AIRFIELD.runway.z);
      expect(at.x).toBe(AIRFIELD.runway.x1 - reach);
      const lamp = runwayHalos().find((each) => each.reach === reach)!;
      expect(at.y).toBe(lamp.at.y);
      expect(Math.abs(at.x - lamp.at.x)).toBeLessThan(1);
    }
  });

  it('stand on the lights of the file', async () => {
    const { sceneOfFile } = await import('./gltf-scene.fixture');
    const { dressedScene, RUNWAY_LIGHTS } = await import('./site-kits');
    const { BUILDING_MAQUETTES } = await import('@/emblems/buildings/manifest');
    const { Group } = await import('three');
    const airfield = await dressedScene(BUILDING_MAQUETTES.airfield!, new Group(), async () =>
      sceneOfFile('src/emblems/kits/piste.glb'),
    );
    airfield.updateWorldMatrix(true, true);
    const halos = runwayHalos();
    // A module's two lights are two meshes of one material, which names how far out they are.
    const vertices = new Map<number, Vector3[]>();
    airfield.traverse((node) => {
      const mesh = node as import('three').Mesh;
      if (!mesh.isMesh || (mesh.material as { name: string }).name !== RUNWAY_LIGHTS) return;
      const { reach } = (mesh.material as unknown as { userData: { reach: number } }).userData;
      const p = mesh.geometry.getAttribute('position');
      const own = vertices.get(reach) ?? [];
      for (let i = 0; i < p.count; i++)
        own.push(new Vector3().fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld));
      vertices.set(reach, own);
    });
    // Each side of the axis, for each reach: a light of the file stands under the halo.
    const sides = (own: Vector3[], side: number) =>
      own.filter((v) => Math.sign(v.z - AIRFIELD.runway.z) === side);
    for (const set of [halos, runwayHalos(31)])
      for (const { reach, at } of set) {
        if (at.z === AIRFIELD.runway.z) continue;
        const own = sides(vertices.get(reach)!, Math.sign(at.z - AIRFIELD.runway.z));
        expect(own.length).toBeGreaterThan(0);
        expect(Math.min(...own.map((v) => Math.hypot(v.x - at.x, v.z - at.z)))).toBeLessThan(0.2);
        expect(Math.abs(Math.max(...own.map((v) => v.y)) - at.y)).toBeLessThan(0.15);
      }
    expect(vertices.size).toBe(16);
  });
});
