import {
  Box3,
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  type Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  SphereGeometry,
  Vector3,
} from 'three';
import type { UnitRole } from '@/domain/ids';
import { troopMetres } from '@/domain/piece-size';
import { DOMAIN_BY_ROLE } from '@/domain/troops';
import { BUILDING_MAQUETTES } from '@/emblems/buildings/manifest';
import { FIGURINE_FILES } from '@/emblems/figurines/manifest';
import { AIRFIELD, GANGWAY, KITS, MOLE, POSITION_LIGHTS } from '@/emblems/kits/manifest';

/** **The lamps the night lights** (`warmPieces`): a kit's `feux`, the position lights. */
export const LAMP = 'feux';
/** **The runway's edge lights, out** (#269): lit only while a plane moves on it, by the airfield's
 *  copy (`lightRunway`). Never merged with a lamp (`bakedSite`). */
export const RUNWAY_LIGHTS = 'feux_piste';

type Load = (url: string) => Promise<Object3D>;

const lit = new Map<string, Material>();
/**
 * **The runway's edge lights on, in a copy of its airfield** (#269): its `feux_piste` become lamps
 * (`LAMP`), which the night lights (`warmPieces`); the airfield standing keeps them out.
 */
export function lightRunway(copy: Object3D): void {
  copy.traverse((node) => {
    const mesh = node as Mesh;
    if (!mesh.isMesh || (mesh.material as Material).name !== RUNWAY_LIGHTS) return;
    const out = mesh.material as Material;
    let lamp = lit.get(out.uuid);
    if (lamp === undefined) {
      lamp = out.clone();
      lamp.name = LAMP;
      lit.set(out.uuid, lamp);
    }
    mesh.material = lamp;
  });
}

/** The roles that wear position lights, by their files. */
const LIT = new Map<string, UnitRole>(
  Object.values(FIGURINE_FILES).flatMap((files) =>
    Object.entries(files ?? {}).flatMap(([role, entry]) =>
      DOMAIN_BY_ROLE[role as UnitRole] === 'land'
        ? []
        : (typeof entry === 'string' ? [entry] : (entry as ReadonlyArray<string>)).map(
            (url) => [url, role as UnitRole] as const,
          ),
    ),
  ),
);

/**
 * **A file's scene, dressed with what the engine lays on it** (ADR 0038 §10): an airfield gets its
 * runway, its ramps and its windsock, a port its mole, a plane or a hull its position lights. What
 * every bake reads — the maquette's, the articulated copy's, the figurine's.
 */
export async function dressedScene(url: string, scene: Object3D, load: Load): Promise<Object3D> {
  if (url === BUILDING_MAQUETTES.airfield) scene.add(...(await airfieldKit(scene, load)));
  else if (url === BUILDING_MAQUETTES.port) scene.add(await moleKit(load));
  else {
    const role = LIT.get(url);
    if (role !== undefined) {
      if (role === 'cargo' || role === 'carrier') seaStandIns(scene, role);
      positionLights(scene, role);
    }
  }
  return scene;
}

const materialOf = (root: Object3D, name: string): Material | null => {
  let found: Material | null = null;
  root.traverse((node) => {
    const material = (node as Mesh).material as Material | undefined;
    if (found === null && material?.name === name) found = material;
  });
  return found;
};

/** **A material of the file, as the engine's own**: a geometry drawn here never merges with the
 *  file's, whose attributes are laid otherwise (`bakedSite` merges by material). */
function ownCopy(material: Material | null, color: string, name: string): Material {
  const copy = material?.clone() ?? new MeshStandardMaterial({ color });
  copy.name = name;
  return copy;
}

async function airfieldKit(site: Object3D, load: Load): Promise<Object3D[]> {
  const [kit, windsock] = await Promise.all([load(KITS.piste), load(KITS.manche)]);
  const runway = new Group();
  runway.name = 'piste';
  const lamp = materialOf(kit, LAMP);
  const out = lamp?.clone() ?? null;
  if (out !== null) out.name = RUNWAY_LIGHTS;
  let along = 0;
  for (const [name, metres, way] of AIRFIELD.modules) {
    const module = kit.getObjectByName(name)!.clone(true);
    module.position.set(AIRFIELD.runway.x1 - (along + metres / 2), 0, AIRFIELD.runway.z);
    module.rotation.set(0, (way * Math.PI) / 2, 0);
    module.traverse((node) => {
      const mesh = node as Mesh;
      if (mesh.isMesh && out !== null && (mesh.material as Material).name === LAMP)
        mesh.material = out;
    });
    runway.add(module);
    along += metres;
  }
  const concrete = ownCopy(materialOf(site, 'beton_aire'), '#cfc6b2', 'beton_rampe');
  for (const x of AIRFIELD.lanes) {
    const ramp = new Mesh(rampGeometry(x), concrete);
    ramp.name = 'rampe';
    runway.add(ramp);
  }
  const sock = windsock.clone(true);
  sock.name = 'manche';
  sock.position.set(AIRFIELD.windsock.x, AIRFIELD.top, AIRFIELD.windsock.z);
  sock.rotation.y = AIRFIELD.windsock.turn;
  return [runway, sock];
}

/** **`piste_rampe`'s stand-in**: a wedge as wide as a lane, from the socle's top to the ground. */
function rampGeometry(x: number): BufferGeometry {
  const { from, to } = AIRFIELD.ramp;
  const [l, r, h] = [x - AIRFIELD.lane, x + AIRFIELD.lane, AIRFIELD.top];
  // Its slope, its two flanks and its back to the socle: the ground under it is never seen.
  const quad = (a: number[], b: number[], c: number[], d: number[]) => [
    ...a,
    ...b,
    ...c,
    ...a,
    ...c,
    ...d,
  ];
  const positions = [
    ...quad([l, h, from], [l, 0, to], [r, 0, to], [r, h, from]),
    ...[l, 0, from, l, 0, to, l, h, from],
    ...[r, 0, from, r, h, from, r, 0, to],
    ...quad([l, 0, from], [l, h, from], [r, h, from], [r, 0, from]),
  ];
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute(
    'uv',
    new Float32BufferAttribute(new Array((positions.length / 3) * 2).fill(0.5), 2),
  );
  geometry.computeVertexNormals();
  return geometry;
}

async function moleKit(load: Load): Promise<Object3D> {
  const kit = await load(KITS.mole);
  const mole = new Group();
  mole.name = 'mole';
  const count = MOLE.length / MOLE.module;
  for (let k = 0; k < count; k++) {
    const module = kit.getObjectByName('mole_troncon')!.clone(true);
    module.position.set(MOLE.x, MOLE.lift, MOLE.quay + MOLE.module / 2 + k * MOLE.module);
    // A bollard every third module, a fender every second, a lamp every fourth (storyboard).
    const keep = { bitte: k % 3 === 0, defense: k % 2 === 0, lampadaire: k % 4 === 2 };
    for (const [name, kept] of Object.entries(keep))
      if (!kept) module.getObjectByName(name)?.removeFromParent();
    mole.add(module);
  }
  const head = kit.getObjectByName('mole_tete')!.clone(true);
  const tip = MOLE.quay + MOLE.length + MOLE.head;
  head.position.set(MOLE.x, MOLE.lift, tip);
  mole.add(head);
  // The skirt under the raised kit, from the water to its own foot.
  const stone = ownCopy(materialOf(kit, 'pierre'), '#bdb3a0', 'pierre_jupe');
  const tall = MOLE.lift - MOLE.skirt;
  const along = new Mesh(new BoxGeometry(2 * (MOLE.x - MOLE.inner), tall, MOLE.length), stone);
  along.position.set(MOLE.x, MOLE.skirt + tall / 2, MOLE.quay + MOLE.length / 2);
  const round = new Mesh(new CylinderGeometry(MOLE.head, MOLE.head, tall, 24), stone);
  round.position.set(MOLE.x, MOLE.skirt + tall / 2, tip);
  mole.add(along, round);
  return mole;
}

const lights = new Map<string, Material>();
const lightOf = (color: string): Material => {
  let light = lights.get(color);
  if (light === undefined) {
    light = new MeshStandardMaterial({ color, roughness: 0.4 });
    light.name = LAMP;
    lights.set(color, light);
  }
  return light;
};

/**
 * **Position lights at the model's box** (stand-ins for `feu_gauche`… and `feu_babord`…): red
 * on its `+x`, green on its `-x`, white at a plane's tail or a hull's mast.
 */
function positionLights(scene: Object3D, role: UnitRole): void {
  scene.updateMatrixWorld(true);
  const box = new Box3().setFromObject(scene);
  const size = box.getSize(new Vector3());
  const air = DOMAIN_BY_ROLE[role] === 'air';
  const metre = Math.max(size.x, size.z) / troopMetres(role);
  const radius = (air ? POSITION_LIGHTS.air.globe : POSITION_LIGHTS.sea.globe) * metre;
  const globe = new SphereGeometry(radius, 8, 6);
  // Inside the box: a light that grew it would grow the measure the figurine is sized by.
  const { min, max } = box.expandByScalar(-radius);
  const mid = (min.z + max.z) / 2;
  const spots: ReadonlyArray<readonly [string, number, number, number]> = air
    ? [
        [POSITION_LIGHTS.red, max.x, (min.y + max.y) / 2, mid],
        [POSITION_LIGHTS.green, min.x, (min.y + max.y) / 2, mid],
        [POSITION_LIGHTS.white, 0, (min.y + max.y) / 2, min.z],
      ]
    : [
        [POSITION_LIGHTS.red, max.x * 0.6, max.y * 0.45, max.z * 0.3],
        [POSITION_LIGHTS.green, min.x * 0.6, max.y * 0.45, max.z * 0.3],
        [POSITION_LIGHTS.white, 0, max.y, max.z * 0.4],
      ];
  for (const [color, x, y, z] of spots) {
    const light = new Mesh(globe, lightOf(color));
    light.name = 'feu_position';
    light.position.set(x, y, z);
    scene.add(light);
  }
}

let dark: Material | null = null;
const darkOf = (): Material => {
  dark ??= new MeshStandardMaterial({ color: GANGWAY.dark, roughness: 1, side: DoubleSide });
  return dark;
};

/**
 * **The gangway marks and the black planes a hull lacks** (`GANGWAY`): a mark at a flank, its mirror
 * for the cargo, a black door plane at each, and a black deck under a carrier's lift. A name the
 * file carries is left to the file.
 */
function seaStandIns(scene: Object3D, role: 'cargo' | 'carrier'): void {
  scene.updateMatrixWorld(true);
  const box = new Box3().setFromObject(scene);
  const size = box.getSize(new Vector3());
  const metre = Math.max(size.x, size.z) / troopMetres(role);
  const mid = (box.min.z + box.max.z) / 2;
  const have = (name: string) => scene.getObjectByName(name) !== undefined;
  const mark = (name: string, x: number, y: number, z: number): Object3D => {
    const found = scene.getObjectByName(name);
    if (found !== undefined) return found;
    const node = new Object3D();
    node.name = name;
    node.position.set(x, y, z);
    scene.add(node);
    return node;
  };
  const door = (name: string, at: Object3D): void => {
    if (have(name)) return;
    const { width, height, off } = GANGWAY.plane;
    const plane = new Mesh(new PlaneGeometry(width * metre, height * metre), darkOf());
    const side = Math.sign(at.position.x) || 1;
    plane.name = name;
    plane.rotation.y = (side * Math.PI) / 2;
    plane.position.set(
      at.position.x + side * off * metre,
      at.position.y + (height * metre) / 2,
      at.position.z,
    );
    scene.add(plane);
  };
  const sill = GANGWAY.sill[role] * metre;
  if (role === 'cargo') {
    const port = mark('fx_passerelle', box.max.x, sill, box.min.z * GANGWAY.aft);
    const starboard = mark(
      'fx_passerelle_tribord',
      -port.position.x,
      port.position.y,
      port.position.z,
    );
    door('fond_sombre_coupee_babord', port);
    door('fond_sombre_coupee_tribord', starboard);
    return;
  }
  door('fond_sombre_coupee', mark('fx_passerelle', box.min.x, sill, mid));
  const lift = scene.getObjectByName('ascenseur');
  if (lift === undefined || have('fond_sombre')) return;
  const lifted = new Box3().setFromObject(lift);
  const floor = new Mesh(
    new PlaneGeometry(lifted.max.x - lifted.min.x, lifted.max.z - lifted.min.z),
    darkOf(),
  );
  floor.name = 'fond_sombre';
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(
    (lifted.min.x + lifted.max.x) / 2,
    lifted.min.y - GANGWAY.lift * metre,
    (lifted.min.z + lifted.max.z) / 2,
  );
  scene.add(floor);
}
