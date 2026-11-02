import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Box3, Matrix4, Mesh, Vector3, type Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { isRigPart } from '@/emblems/rigs';
import { Guns } from './articulation';
import { bakedRig } from './baking';
import { movesOnItsOwn } from './figurines/figurine';

const NATIONS = ['france', 'germany', 'uk', 'usa', 'ussr', 'italy', 'japan', 'china'];

/** The GLB without its images: node has no `Image` to decode them, and a muzzle needs none. */
function untextured(bytes: Buffer): ArrayBuffer {
  const jsonLength = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8'));
  delete json.images;
  delete json.textures;
  delete json.samplers;
  for (const material of json.materials ?? []) {
    delete material.pbrMetallicRoughness?.baseColorTexture;
    delete material.pbrMetallicRoughness?.metallicRoughnessTexture;
    delete material.normalTexture;
    delete material.occlusionTexture;
    delete material.emissiveTexture;
  }
  json.extensionsUsed = (json.extensionsUsed ?? []).filter((e: string) => !e.includes('webp'));
  json.extensionsRequired = (json.extensionsRequired ?? []).filter(
    (e: string) => !e.includes('webp'),
  );
  let text = Buffer.from(JSON.stringify(json), 'utf8');
  text = Buffer.concat([text, Buffer.alloc((4 - (text.length % 4)) % 4, 0x20)]);
  const rest = bytes.subarray(20 + jsonLength);
  const head = Buffer.alloc(20);
  head.writeUInt32LE(0x46546c67, 0);
  head.writeUInt32LE(2, 4);
  head.writeUInt32LE(20 + text.length + rest.length, 8);
  head.writeUInt32LE(text.length, 12);
  head.writeUInt32LE(0x4e4f534a, 16);
  const glb = Buffer.concat([head, text, rest]);
  return glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength);
}

/** **Where a tube ends, read on the file as it came** (#324): its meshes' box in its own frame,
 *  whatever node they hang from. */
function tipOf(gun: Object3D): Vector3 {
  const toGun = new Matrix4().copy(gun.matrixWorld).invert();
  const box = new Box3();
  gun.traverse((part) => {
    if (!(part instanceof Mesh)) return;
    part.geometry.computeBoundingBox();
    box.union(
      part.geometry
        .boundingBox!.clone()
        .applyMatrix4(new Matrix4().multiplyMatrices(toGun, part.matrixWorld)),
    );
  });
  return new Vector3(0, 0, box.max.z);
}

/**
 * **The real escorts' muzzles** (#324) : no file names an `fx_muzzle_N`, so every tube past the
 * first fires from the end of its geometry, read on the baked rig. It must be the end read on the
 * file as it came, in the tube's own frame — not a child mesh's.
 */
describe('the muzzles of the escorts as they are drawn', () => {
  it.each(NATIONS)('%s: each tube past the first fires from its own end', async (nation) => {
    const bytes = readFileSync(join('src/emblems/figurines', nation, 'escort.glb'));
    const source = (await new GLTFLoader().parseAsync(untextured(bytes), '')).scene;
    source.updateMatrixWorld(true);
    const rig = bakedRig(source, (node) => isRigPart('escort', node.name) || movesOnItsOwn(node));
    rig.updateMatrixWorld(true);
    const guns = new Guns(rig, 'escort', null);
    expect(guns.muzzles.length).toBeGreaterThan(1);
    guns.muzzles.forEach((muzzle, j) => {
      if (j === 0) return;
      const tube = rig.getObjectByName(`gun_${j + 1}`)!;
      const at = tube.worldToLocal(muzzle.getWorldPosition(new Vector3()));
      const tip = tipOf(source.getObjectByName(`gun_${j + 1}`)!);
      expect(at.z, `gun_${j + 1}`).toBeCloseTo(tip.z, 3);
      expect(Math.hypot(at.x, at.y)).toBeCloseTo(0, 3);
    });
  });
});
