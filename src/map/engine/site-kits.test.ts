import {
  Group,
  type Material,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  BoxGeometry,
  PlaneGeometry,
} from 'three';
import { describe, expect, it } from 'vitest';

import { BUILDING_MAQUETTES } from '@/emblems/buildings/manifest';
import { FIGURINE_FILES } from '@/emblems/figurines/manifest';
import { AIRFIELD, KITS } from '@/emblems/kits/manifest';
import { warmPieces } from './halo';
import { sceneOfFile } from './gltf-scene.fixture';
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

describe('the stand-in marks and black planes of the sea (#503)', () => {
  const hullFile = (extra: ReadonlyArray<string> = []): Object3D => {
    const scene = new Group();
    const hull = new Mesh(new BoxGeometry(20, 10, 100), new MeshStandardMaterial());
    hull.name = 'hull';
    hull.position.y = 5;
    scene.add(hull);
    for (const name of extra) {
      const node = new Group();
      node.name = name;
      node.position.set(8, 4, -14);
      scene.add(node);
    }
    return scene;
  };
  const urlOf = (role: string) =>
    Object.values(FIGURINE_FILES).flatMap((files) => {
      const entry = (files as Record<string, string | ReadonlyArray<string>>)[role];
      return entry === undefined ? [] : [typeof entry === 'string' ? entry : entry[0]!];
    })[0]!;
  const names = (root: Object3D) => {
    const found = new Set<string>();
    root.traverse((node) => found.add(node.name));
    return found;
  };

  it('lays both gangway marks and both black planes on a cargo that has none', async () => {
    const cargo = await dressedScene(urlOf('cargo'), hullFile(), load);
    for (const name of ['fx_passerelle', 'fx_passerelle_tribord'])
      expect(names(cargo).has(name), name).toBe(true);
    for (const name of ['fond_sombre_coupee_babord', 'fond_sombre_coupee_tribord'])
      expect(names(cargo).has(name), name).toBe(true);
    const port = cargo.getObjectByName('fx_passerelle')!;
    const starboard = cargo.getObjectByName('fx_passerelle_tribord')!;
    expect(starboard.position.x).toBeCloseTo(-port.position.x);
    expect(starboard.position.y).toBeCloseTo(port.position.y);
  });

  it('mirrors the port mark a file carries, and keeps it', async () => {
    const cargo = await dressedScene(urlOf('cargo'), hullFile(['fx_passerelle']), load);
    expect(cargo.getObjectByName('fx_passerelle')!.position.toArray()).toEqual([8, 4, -14]);
    expect(cargo.getObjectByName('fx_passerelle_tribord')!.position.toArray()).toEqual([
      -8, 4, -14,
    ]);
  });

  it('gives a carrier a black deck under its lift, and no door: its men go up a plank (#506)', async () => {
    const carrier = await dressedScene(urlOf('carrier'), hullFile(['ascenseur']), load);
    expect(names(carrier).has('fond_sombre')).toBe(true);
    expect(names(carrier).has('fx_passerelle')).toBe(false);
    expect(names(carrier).has('fond_sombre_coupee')).toBe(false);
  });

  it('takes nothing the file already carries', async () => {
    const file = hullFile([
      'fx_passerelle',
      'fx_passerelle_tribord',
      'fond_sombre_coupee_babord',
      'fond_sombre_coupee_tribord',
    ]);
    const cargo = await dressedScene(urlOf('cargo'), file, load);
    expect(cargo.children.filter((node) => node.name === 'fx_passerelle')).toHaveLength(1);
    expect(cargo.children.filter((node) => node.name === 'fond_sombre_coupee_babord')).toHaveLength(
      1,
    );
  });

  it("takes the night: a black plane lights as the file's doorways do, which only its material name says", async () => {
    const cargo = await dressedScene(urlOf('cargo'), hullFile(), load);
    const doorway = new MeshStandardMaterial({ name: 'fond_sombre' });
    const reference = new Mesh(new BoxGeometry(), doorway);
    warmPieces(cargo, 1);
    warmPieces(reference, 1);
    const door = cargo.getObjectByName('fond_sombre_coupee_babord') as Mesh;
    expect((door.material as MeshStandardMaterial).emissive.getHex()).toBe(
      doorway.emissive.getHex(),
    );
    expect(doorway.emissive.getHex()).not.toBe(0);
  });
});

describe('the stand-ins on the real hulls (#503 review)', () => {
  const real = (nation: 'france' | 'japan' | 'uk' | 'ussr', role: 'cargo' | 'carrier') => {
    const entry = (FIGURINE_FILES[nation] as Record<string, string | ReadonlyArray<string>>)[role]!;
    const url = typeof entry === 'string' ? entry : entry[0]!;
    return dressedScene(url, sceneOfFile(url), load);
  };

  it.each(['france', 'ussr'] as const)(
    "keeps a %s cargo's black door under the deck, where the wall stands out to the flank",
    async (nation) => {
      const cargo = await real(nation, 'cargo');
      const door = cargo.getObjectByName('fond_sombre_coupee_babord') as Mesh;
      const top = door.position.y + (door.geometry as PlaneGeometry).parameters.height / 2;
      // The wall falls back from the flank above y = 5 (4.7 in the Soviet ship).
      expect(top).toBeLessThanOrEqual(5.01);
      expect(top).toBeGreaterThan(cargo.getObjectByName('fx_passerelle')!.position.y);
    },
  );
});
