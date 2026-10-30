import { Box3, type Object3D, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { FIGURINE_FILES } from '@/emblems/figurines/manifest';
import { isRigPart, type RigFamily, RIG_PARTS } from '@/emblems/rigs';
import { bakedRig } from '../baking';
import { meshesOf, sceneOfFile, sweptVolume } from '../gltf-scene.fixture';
import { bakedFigurine } from './figurine';
import { JOINTS, POSED, squadOf, stride } from './infantry';

const readByName = (name: string) =>
  (POSED as ReadonlyArray<string>).includes(name) ||
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
    // The infantry of #316 is already one mesh per material and joint: baking has nothing left to merge.
    if (role === 'infantry')
      expect(meshesOf(baked).length).toBeLessThanOrEqual(meshesOf(scene).length);
    else expect(meshesOf(baked).length).toBeLessThan(meshesOf(scene).length);

    if (role === 'infantry') {
      // A joint's pose replaces its own rotation: whatever turns above it (a leaning torso)
      // must still turn it once baked.
      const marchers = [scene, baked].map((made) =>
        squadOf([{ make: () => made.clone(true), sculpted: false }]),
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

      const squad = squadOf([{ make: () => baked.clone(true), sculpted: false }]);
      const man = squad.children[0]!;
      for (const joint of JOINTS.filter((joint) => scene.getObjectByName(joint)))
        expect(man.getObjectByName(joint), joint).toBeDefined();
      expect(man.getObjectByName('leg_left')!.rotation.x).not.toBe(0);
    }
  });
});

/** A mark 2 leaves his knee to march: his feet stay on the ground, and he goes back as he was. */
describe.runIf(files.length > 0)('a sculpted mark 2 marching', () => {
  const rank2 = files.filter(([, role, url]) => role === 'infantry' && url.includes('infantry-2'));
  it.each(rank2)('%s keeps its feet on the plateau', (_, __, url) => {
    const squad = squadOf([{ make: () => bakedFigurine(sceneOfFile(url)), sculpted: true }]);
    const bottom = () => {
      squad.updateMatrixWorld(true);
      return new Box3().setFromObject(squad, true).min.y;
    };
    const resting = bottom();
    // Japan's crew rests on its gun carriage: the file is its own floor.
    for (const seconds of [0, 0.2, 0.4, 0.7, 1.1]) {
      stride(squad, seconds);
      expect(bottom(), `${seconds}s`).toBeGreaterThanOrEqual(-0.02);
    }
    stride(squad, null);
    expect(bottom()).toBeCloseTo(resting, 5);
  });
});

/** The articulated copy of a regenerated vehicle (ADR 0036 §11) is the resting figurine, parts apart. */
describe.runIf(files.length > 0)('articulated copies of the figurines', () => {
  const rigged = files.filter(([, role]) => role in RIG_PARTS);
  const triangles = (object: Object3D) =>
    meshesOf(object).reduce(
      (sum, { geometry }) => sum + (geometry.index ?? geometry.attributes.position!).count,
      0,
    );

  it.each(rigged)('%s draws at rest what the resting figurine does', (_, role, url) => {
    const scene = sceneOfFile(url);
    const rig = bakedRig(scene, (node) => isRigPart(role as RigFamily, node.name));
    const rest = bakedFigurine(sceneOfFile(url));
    for (const made of [rig, rest]) made.updateMatrixWorld(true);
    const [a, b] = [rig, rest].map((made) => new Box3().setFromObject(made, true));
    expect(a!.min.distanceTo(b!.min)).toBeLessThan(1e-4);
    expect(a!.max.distanceTo(b!.max)).toBeLessThan(1e-4);
    expect(triangles(rig)).toBe(triangles(rest));
    expect(sweptVolume(rig)).toBeCloseTo(sweptVolume(rest), 3);
    // A truck has as many meshes as primitives: the parts apart may merge nothing.
    expect(meshesOf(rig).length).toBeLessThanOrEqual(meshesOf(scene).length);
  });

  it.each(rigged)('%s keeps each part where it was, by name', (_, role, url) => {
    const scene = sceneOfFile(url);
    scene.updateMatrixWorld(true);
    const rig = bakedRig(scene, (node) => isRigPart(role as RigFamily, node.name));
    rig.updateMatrixWorld(true);
    scene.traverse((node) => {
      if (!isRigPart(role as RigFamily, node.name)) return;
      const kept = rig.getObjectByName(node.name);
      expect(kept, node.name).toBeDefined();
      const was = node.getWorldPosition(new Vector3());
      expect(kept!.getWorldPosition(new Vector3()).distanceTo(was), node.name).toBeLessThan(1e-5);
    });
  });
});
