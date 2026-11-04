import {
  BoxGeometry,
  BufferGeometry,
  Box3,
  Group,
  InterleavedBuffer,
  InterleavedBufferAttribute,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from 'three';
import { describe, expect, it } from 'vitest';

import { RIG_PARTS } from '@/emblems/rigs';
import { BUILDING_MAQUETTES, buildingMaquette } from '@/emblems/buildings/manifest';
import { OBJECTIVE_MAQUETTES } from '@/emblems/objectives/manifest';
import { accessoriesShown, bakedRig, bakedSite, mergedByMaterial, type Part } from './baking';
import { meshesOf, sceneOfFile, sweptVolume } from './gltf-scene.fixture';

describe('bakedSite, as one geometry per material', () => {
  it('merges the meshes of one material into one part, their placement baked in', () => {
    const stone = new MeshStandardMaterial();
    const slate = new MeshStandardMaterial({ color: 0x334455 });
    const scene = new Group();
    const wall = new Mesh(new BoxGeometry(1, 1, 1), stone);
    wall.position.set(2, 0, 0);
    const tower = new Mesh(new BoxGeometry(1, 1, 1), stone);
    tower.position.set(0, 3, 0);
    const roof = new Mesh(new BoxGeometry(1, 1, 1), slate);
    scene.add(wall, tower, roof);

    const parts = bakedSite(scene).building;
    expect(parts.map((part) => part.material)).toEqual([stone, slate]);
    const walls = parts[0]!.geometry;
    walls.computeBoundingBox();
    expect(walls.boundingBox!.min.toArray()).toEqual([-0.5, -0.5, -0.5]);
    expect(walls.boundingBox!.max.toArray()).toEqual([2.5, 3.5, 0.5]);
  });

  it('merges materials that differ by their name alone, and never the ones read by name', () => {
    const named = (name: string) => new MeshStandardMaterial({ name });
    const meshes = ['paper', 'flank', 'lisere', 'fond_sombre'].map(
      (name) => new Mesh(new BoxGeometry(1, 1, 1), named(name)),
    );
    const parts = mergedByMaterial(meshes, new Matrix4());
    expect(parts.map((part) => part.material.name)).toEqual(['paper', 'lisere', 'fond_sombre']);
    expect(parts[0]!.geometry.attributes.position!.count).toBe(2 * 24);
  });

  it('bakes a rotated parent too', () => {
    const scene = new Group();
    scene.quaternion.copy(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2));
    const mesh = new Mesh(new BoxGeometry(2, 1, 1), new MeshStandardMaterial());
    scene.add(mesh);
    const [part] = bakedSite(scene).building;
    part!.geometry.computeBoundingBox();
    const size = part!.geometry.boundingBox!.getSize(new Vector3());
    expect(size.x).toBeCloseTo(1);
    expect(size.z).toBeCloseTo(2);
  });

  it('turns a mirrored mesh right side out, as three draws it unbaked', () => {
    const geometry = new BoxGeometry(1, 1, 1);
    const mesh = new Mesh(geometry, new MeshStandardMaterial());
    mesh.scale.set(-1, 1, 1);
    const scene = new Group().add(mesh);
    const [part] = bakedSite(scene).building;
    const index = part!.geometry.index!;
    expect([index.getX(0), index.getX(1), index.getX(2)]).toEqual([
      geometry.index!.getX(0),
      geometry.index!.getX(2),
      geometry.index!.getX(1),
    ]);
  });

  it('turns an interleaved mirrored mesh right side out, as the loader hands it', () => {
    // Position, normal, uv: eight floats a vertex, one buffer — `flag_right` as it loads.
    const buffer = new InterleavedBuffer(
      new Float32Array([0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 1, 0, 1]),
      8,
    );
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new InterleavedBufferAttribute(buffer, 3, 0));
    geometry.setAttribute('normal', new InterleavedBufferAttribute(buffer, 3, 3));
    geometry.setAttribute('uv', new InterleavedBufferAttribute(buffer, 2, 6));
    const mesh = new Mesh(geometry, new MeshStandardMaterial());
    mesh.scale.set(-1, 1, 1);
    const [part] = bakedSite(new Group().add(mesh)).building;
    const { position, normal, uv } = part!.geometry.attributes;
    expect([0, 1, 2].map((k) => [position!.getX(k) + 0, position!.getY(k)])).toEqual([
      [0, 0],
      [0, 1],
      [-1, 0],
    ]);
    for (const k of [0, 1, 2]) expect([normal!.getX(k) + 0, normal!.getZ(k)]).toEqual([0, 1]);
    expect([0, 1, 2].map((k) => [uv!.getX(k), uv!.getY(k)])).toEqual([
      [0, 0],
      [0, 1],
      [1, 0],
    ]);
  });
});

describe('bakedSite (ADR 0038)', () => {
  const SOCLE = 'src/emblems/buildings/barracks.glb';
  const trianglesOf = (parts: ReadonlyArray<Part>) =>
    parts.reduce(
      (sum, { geometry }) => sum + (geometry.index ?? geometry.attributes.position!).count / 3,
      0,
    );
  const triangleCount = (object: Parameters<typeof meshesOf>[0]) =>
    meshesOf(object).reduce(
      (sum, { geometry }) => sum + (geometry.index ?? geometry.attributes.position!).count / 3,
      0,
    );
  const boxOf = (parts: ReadonlyArray<Part>) => {
    const box = new Box3();
    for (const { geometry } of parts) {
      geometry.computeBoundingBox();
      box.union(geometry.boundingBox!);
    }
    return box;
  };

  /** Every file the board draws that stands on no socle: the objectives'. */
  const files = [
    ...new Set([
      ...Object.values(BUILDING_MAQUETTES),
      buildingMaquette('mine', 'coal'),
      ...Object.values(OBJECTIVE_MAQUETTES),
    ]),
  ].flatMap((url) =>
    url === null || sceneOfFile(url).getObjectByName('socle') !== undefined ? [] : [url],
  );

  /** What the board drew before ADR 0038: every mesh but the flag's, merged per material. */
  const before = (url: string): Part[] => {
    const scene = sceneOfFile(url);
    scene.updateMatrixWorld(true);
    const meshes: Mesh[] = [];
    const walk = (node: (typeof scene)['children'][number]) => {
      if (node.name === 'drapeau') return;
      if ((node as Mesh).isMesh) meshes.push(node as Mesh);
      node.children.forEach(walk);
    };
    walk(scene);
    return mergedByMaterial(meshes, new Matrix4());
  };

  it.each(files)('bakes %s, which has no socle, as before: all building', (url) => {
    const { building, dressing, yard, sign } = bakedSite(sceneOfFile(url));
    const today = before(url);
    expect(dressing).toEqual([]);
    expect(yard).toEqual([]);
    expect(sign).toBeNull();
    expect(building.map((part) => part.material.name)).toEqual(
      today.map((part) => part.material.name),
    );
    expect(trianglesOf(building)).toBe(trianglesOf(today));
    expect(boxOf(building).equals(boxOf(today))).toBe(true);
    // A copy stood in for it draws the same, its `chantier` group included.
    expect(triangleCount(bakedRig(sceneOfFile(url), () => false))).toBe(trianglesOf(today));
  });

  it('bakes the building apart from its socle and liseré', () => {
    const { building, dressing } = bakedSite(sceneOfFile(SOCLE));
    const names = dressing.map((part) => part.material.name);
    expect(names).toContain('socle_papier');
    expect(names).toContain('lisere');
    expect(building.map((part) => part.material.name)).not.toContain('lisere');
    expect(building.map((part) => part.material.name)).not.toContain('socle_papier');
    // The building stands on the socle's top; the socle on the ground.
    expect(boxOf(building).min.y).toBeCloseTo(2.2, 3);
    expect(boxOf(dressing).min.y).toBeCloseTo(0, 3);
    // Its flagpole stands on the sign: the building keeps its walls and roofs alone.
    expect(trianglesOf(building)).toBe(1851);
  });

  it('bakes the yard and the sign apart, the sign with its foot (ADR 0038 §7)', () => {
    const { dressing, yard, sign } = bakedSite(sceneOfFile(SOCLE));
    // The socle and its liseré stand to the pin; the yard shrinks with the building.
    // The flank and the paper are one atlas look, one part; the liseré is inked apart.
    expect(dressing.map((part) => part.material.name).sort()).toEqual(['lisere', 'socle_papier']);
    expect(boxOf(dressing).max.y).toBeLessThan(2.5);
    expect(yard.map((part) => part.material.name)).toEqual(['gravier']);
    expect(boxOf(yard).min.y).toBeGreaterThan(2.2);
    // The sign grows on its foot, the signe node's place on the socle top; its mast and pole in it.
    expect(sign!.foot.toArray()).toEqual([-22, 2.2, 17]);
    expect(boxOf(sign!.parts).min.y).toBeCloseTo(2.2, 3);
    expect(sign!.height).toBeGreaterThanOrEqual(24);
    expect(sign!.height).toBeLessThan(32);
  });

  it('on a socle, bakes the flagpole into the sign, where the file hangs it', () => {
    const scene = sceneOfFile(SOCLE);
    const sign = scene.getObjectByName('signe')!;
    const top = new Box3().setFromObject(scene.getObjectByName('hampe')!).max.y;
    const { building, sign: baked } = bakedSite(scene);
    expect(scene.getObjectByName('hampe')!.parent).toBe(sign);
    expect(scene.getObjectByName('drapeau')!.parent).toBe(sign);
    // The pole stands in the sign's parts: it grows on its foot, and no cut reaches it.
    expect(boxOf(baked!.parts).max.y).toBeGreaterThanOrEqual(top);
    expect(boxOf(building).max.y).toBeLessThan(top);
  });

  it('bakes the flag apart from its sign, in its own material, to be inked (#279)', () => {
    const scene = sceneOfFile(SOCLE);
    const { flag, sign } = bakedSite(scene);
    expect(flag.map((part) => part.material.name)).toEqual(['drapeau']);
    expect(sign!.parts.some((part) => part.material.name === 'drapeau')).toBe(false);
    expect(boxOf(flag).max.y).toBeCloseTo(
      new Box3().setFromObject(scene.getObjectByName('drapeau')!).max.y,
      6,
    );
  });

  it('draws the first level of a yard, and none of the accessories that come later', () => {
    const scene = new Group();
    const socle = new Mesh(new BoxGeometry(4, 1, 4), new MeshStandardMaterial({ name: 'socle' }));
    socle.name = 'socle';
    const walls = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial({ name: 'murs' }));
    scene.add(socle, walls);
    for (const name of ['niveau_1', 'niveau_2', 'niveau_3', 'chantier', 'ruines']) {
      const group = new Group();
      group.name = name;
      group.add(new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial({ name })));
      scene.add(group);
    }
    const { building, dressing } = bakedSite(scene);
    expect(building.map((part) => part.material.name)).toEqual(['murs']);
    expect(dressing.map((part) => part.material.name)).toEqual(['socle']);
  });

  it('bakes each accessory group apart, by name, on a socle alone', () => {
    const scene = new Group();
    const socle = new Mesh(new BoxGeometry(4, 1, 4), new MeshStandardMaterial({ name: 'socle' }));
    socle.name = 'socle';
    scene.add(socle);
    for (const name of ['niveau_1', 'niveau_2', 'niveau_3', 'chantier', 'ruines']) {
      const group = new Group();
      group.name = name;
      group.add(new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial({ name })));
      scene.add(group);
    }
    const { accessories } = bakedSite(scene);
    expect([...accessories.keys()].sort()).toEqual([
      'chantier',
      'niveau_1',
      'niveau_2',
      'niveau_3',
      'ruines',
    ]);
    expect(accessories.get('niveau_2')!.map((part) => part.material.name)).toEqual(['niveau_2']);
    // Without a socle, a node named `chantier` is a part of the file, not an accessory.
    const plain = new Group();
    const slip = new Group();
    slip.name = 'chantier';
    slip.add(new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial()));
    plain.add(slip);
    expect(bakedSite(plain).accessories.size).toBe(0);
  });

  it('gives the barracks a yard per level, a works site and ruins, within 150 triangles each', () => {
    const { accessories } = bakedSite(sceneOfFile(SOCLE));
    expect([...accessories.keys()].sort()).toEqual([
      'chantier',
      'niveau_1',
      'niveau_2',
      'niveau_3',
      'ruines',
    ]);
    for (const [name, parts] of accessories) {
      expect(trianglesOf(parts), name).toBeGreaterThan(0);
      expect(trianglesOf(parts), name).toBeLessThanOrEqual(150);
    }
  });

  it('names what each level and state of a yard shows', () => {
    expect(accessoriesShown(1, undefined)).toEqual(['niveau_1']);
    expect(accessoriesShown(2, undefined)).toEqual(['niveau_1', 'niveau_2']);
    expect(accessoriesShown(3, undefined)).toEqual(['niveau_1', 'niveau_2', 'niveau_3']);
    // The HQ goes past 3: the three groups are all there are.
    expect(accessoriesShown(5, undefined)).toEqual(['niveau_1', 'niveau_2', 'niveau_3']);
    expect(accessoriesShown(1, 'rising')).toEqual(['niveau_1', 'chantier']);
    expect(accessoriesShown(2, 'raising')).toEqual(['niveau_1', 'niveau_2', 'chantier']);
    expect(accessoriesShown(1, 'queued')).toEqual([]);
  });
});

describe('bakedRig', () => {
  const barracks = () => sceneOfFile('src/emblems/buildings/barracks.glb');
  const keeping = (names: ReadonlyArray<string>) => (node: { name: string }) =>
    names.includes(node.name);
  const triangles = (object: Parameters<typeof meshesOf>[0]) =>
    meshesOf(object).reduce(
      (sum, { geometry }) => sum + (geometry.index ?? geometry.attributes.position!).count,
      0,
    );
  const drawn = (scene: Parameters<typeof bakedRig>[0]) => {
    const group = new Group();
    // On its socle the copy draws the whole diorama at its first level, as `standIn` leaves it.
    const site = bakedSite(scene);
    for (const { geometry, material } of [
      ...site.building,
      ...site.dressing,
      ...site.yard,
      ...(site.sign?.parts ?? []),
      ...site.flag,
      ...(site.accessories.get('niveau_1') ?? []),
    ])
      group.add(new Mesh(geometry, material));
    return group;
  };

  it('draws at rest what bakedSite draws: same box, triangles and oriented volume', () => {
    const rig = bakedRig(barracks(), keeping(RIG_PARTS.barracks));
    const rest = drawn(barracks());
    rig.updateMatrixWorld(true);
    const [a, b] = [rig, rest].map((made) => new Box3().setFromObject(made, true));
    expect(a!.min.distanceTo(b!.min)).toBeLessThan(1e-4);
    expect(a!.max.distanceTo(b!.max)).toBeLessThan(1e-4);
    expect(triangles(rig)).toBe(triangles(rest));
    expect(sweptVolume(rig)).toBeCloseTo(sweptVolume(rest), 3);
  });

  it('keeps each rig part by name, at its pivot, and its flag on its sign, apart (#279)', () => {
    const scene = barracks();
    scene.updateMatrixWorld(true);
    const rig = bakedRig(scene, keeping(RIG_PARTS.barracks));
    rig.updateMatrixWorld(true);
    for (const name of RIG_PARTS.barracks) {
      const was = scene.getObjectByName(name)!.getWorldPosition(new Vector3());
      const kept = rig.getObjectByName(name);
      expect(kept, name).toBeDefined();
      expect(kept!.getWorldPosition(new Vector3()).distanceTo(was), name).toBeLessThan(1e-5);
    }
    // The flag is no part that moves: merged into what it hangs from, in its own material, for
    // `standIn` to ink it.
    expect(rig.getObjectByName('drapeau')).toBeUndefined();
    const flags: string[] = [];
    rig.traverse((node) => {
      const { material } = node as Mesh;
      if ((material as { name?: string } | undefined)?.name === 'drapeau') flags.push(node.name);
    });
    expect(flags).toHaveLength(1);
  });
});
