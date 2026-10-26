import { Box3, type Object3D, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { FIGURINE_FILES } from '@/emblems/figurines/manifest';
import { meshesOf, sceneOfFile, sweptVolume } from '../gltf-scene.fixture';
import { bakedFigurine } from './figurine';
import { JOINTS, squadOf, stride } from './infantry';

const readByName = (name: string) =>
  (JOINTS as ReadonlyArray<string>).includes(name) ||
  name.startsWith('fx_') ||
  name.startsWith('prop');

const files = Object.entries(FIGURINE_FILES).flatMap(([nation, roles]) =>
  Object.entries(roles ?? {}).flatMap(([role, entry]) =>
    (typeof entry === 'string' ? [entry] : entry).flatMap((url) =>
      url === null ? [] : [[`${nation} ${role} ${url}`, role, url] as const],
    ),
  ),
);

describe.runIf(files.length > 0)('baked figurines', () => {
  it.each(files)('%s keeps every name the code reads, where it was', (_, role, url) => {
    const scene = sceneOfFile(url);
    const baked = bakedFigurine(scene);
    baked.updateMatrixWorld(true);
    scene.updateMatrixWorld(true);

    scene.traverse((node) => {
      // A blade rides its hub: the spin finds the hub, never the blade.
      if (!readByName(node.name) || node.parent?.name.startsWith('prop')) return;
      const kept = baked.getObjectByName(node.name);
      expect(kept, node.name).toBeDefined();
      const was = node.getWorldPosition(new Vector3());
      expect(kept!.getWorldPosition(new Vector3()).distanceTo(was), node.name).toBeLessThan(1e-5);
    });

    const before = new Box3().setFromObject(scene, true);
    const after = new Box3().setFromObject(baked, true);
    expect(after.min.distanceTo(before.min)).toBeLessThan(1e-4);
    expect(after.max.distanceTo(before.max)).toBeLessThan(1e-4);
    const triangles = (object: Object3D) =>
      meshesOf(object).reduce(
        (sum, { geometry }) => sum + (geometry.index ?? geometry.attributes.position!).count,
        0,
      );
    expect(triangles(baked)).toBe(triangles(scene));
    expect(sweptVolume(baked)).toBeCloseTo(sweptVolume(scene), 3);
    expect(meshesOf(baked).length).toBeLessThan(meshesOf(scene).length);

    if (role === 'infantry') {
      // A joint's pose replaces its own rotation: whatever turns above it (a leaning torso)
      // must still turn it once baked.
      const marchers = [scene, baked].map((made) =>
        squadOf([{ make: () => made.clone(true), marches: true }]),
      );
      for (const seconds of [0, 0.13]) {
        for (const squad of marchers) {
          stride(squad, seconds);
          squad.updateMatrixWorld(true);
        }
        for (const joint of JOINTS) {
          const [was, is] = marchers.map((squad) => squad.getObjectByName(joint));
          if (was === undefined) continue;
          const drift = was.matrixWorld.elements.map((value, k) =>
            Math.abs(value - is!.matrixWorld.elements[k]!),
          );
          expect(Math.max(...drift), `${joint} at ${seconds}s`).toBeLessThan(1e-5);
        }
      }

      const squad = squadOf([{ make: () => baked.clone(true), marches: true }]);
      const man = squad.children[0]!;
      for (const joint of JOINTS.filter((joint) => scene.getObjectByName(joint)))
        expect(man.getObjectByName(joint), joint).toBeDefined();
      expect(man.getObjectByName('leg_left')!.rotation.x).not.toBe(0);
    }
  });
});
