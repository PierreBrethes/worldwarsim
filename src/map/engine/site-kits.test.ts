import {
  Group,
  type Material,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  BoxGeometry,
} from 'three';
import { describe, expect, it } from 'vitest';

import { BUILDING_MAQUETTES } from '@/emblems/buildings/manifest';
import { AIRFIELD, KITS } from '@/emblems/kits/manifest';
import { LAMP, RUNWAY_LIGHTS, dressedScene, lightRunway } from './site-kits';

/** The runway kit as its file lays it: each module wearing the kit's lamps. */
function kitFile(): Object3D {
  const kit = new Group();
  const lamp = new MeshStandardMaterial();
  lamp.name = LAMP;
  for (const [name] of AIRFIELD.modules) {
    if (kit.getObjectByName(name) !== undefined) continue;
    const module = new Group();
    module.name = name;
    module.add(new Mesh(new BoxGeometry(), lamp));
    kit.add(module);
  }
  return kit;
}

const load = async (url: string) => (url === KITS.piste ? kitFile() : new Group());

const lampsOf = (root: Object3D) => {
  const names = new Set<string>();
  root.traverse((node) => {
    const mesh = node as Mesh;
    if (mesh.isMesh) names.add((mesh.material as Material).name);
  });
  return names;
};

describe('the runway lights (#269)', () => {
  it('stay out on the airfield, the night lights none of them', async () => {
    const airfield = await dressedScene(BUILDING_MAQUETTES.airfield!, new Group(), load);
    expect(lampsOf(airfield).has(RUNWAY_LIGHTS)).toBe(true);
    expect(lampsOf(airfield).has(LAMP)).toBe(false);
  });

  it('light in its copy, and the airfield keeps them out', async () => {
    const airfield = await dressedScene(BUILDING_MAQUETTES.airfield!, new Group(), load);
    const copy = airfield.clone(true);
    lightRunway(copy);
    expect(lampsOf(copy).has(LAMP)).toBe(true);
    expect(lampsOf(copy).has(RUNWAY_LIGHTS)).toBe(false);
    expect(lampsOf(airfield).has(LAMP)).toBe(false);
  });
});
