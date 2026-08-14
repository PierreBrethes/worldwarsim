import {
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshLambertMaterial,
  OctahedronGeometry,
  SphereGeometry,
  type BufferGeometry,
  type Material,
} from 'three';
import type { RegionType } from '@/domain/ids';

/**
 * Hover wash per type — muted inks, under the highlight material's opacity: the map stays
 * paper, the tint is only a hint.
 */
export const TYPE_TINTS: Record<RegionType, string> = {
  plain: '#a8a352',
  forest: '#48663a',
  jungle: '#2f7a4c',
  mountain: '#8a8072',
  desert: '#c99f56',
  tundra: '#9fbfc4',
};

const geometries: BufferGeometry[] = [];
const materials: Material[] = [];

function geometry<G extends BufferGeometry>(g: G): G {
  geometries.push(g);
  return g;
}

function material(color: string): MeshLambertMaterial {
  const m = new MeshLambertMaterial({ color });
  materials.push(m);
  return m;
}

/**
 * Each prop is built at unit height, base at y = 0: the engine only has to place it on the
 * ground and play the scale for the growth animation.
 */
const FACTORIES: Record<RegionType, () => Group> = (() => {
  const trunk = material('#5d4630');
  const fir = material('#3c5a30');
  const canopy = material('#2f7a3e');
  const rock = material('#7d7568');
  const snow = material('#ede8dc');
  const sand = material('#d3aa60');
  const ice = material('#c8dde0');
  const wheat = material('#c2b45a');

  const firCone = geometry(new ConeGeometry(0.3, 0.85, 6).translate(0, 0.575, 0));
  const shortTrunk = geometry(new CylinderGeometry(0.06, 0.08, 0.18, 5).translate(0, 0.09, 0));
  const tallTrunk = geometry(new CylinderGeometry(0.05, 0.07, 0.55, 5).translate(0, 0.275, 0));
  const ball = geometry(new SphereGeometry(0.34, 7, 5).scale(1, 0.72, 1).translate(0, 0.72, 0));
  const pyramid = geometry(new ConeGeometry(0.55, 1, 4).translate(0, 0.5, 0));
  const cap = geometry(new ConeGeometry(0.21, 0.38, 4).translate(0, 0.81, 0));
  const dune = geometry(new SphereGeometry(0.5, 8, 5).scale(1, 0.35, 0.6).translate(0, 0, 0));
  const shard = geometry(new OctahedronGeometry(0.32).scale(1, 1.5, 1).translate(0, 0.48, 0));
  const spike = geometry(new ConeGeometry(0.09, 0.55, 5).translate(0, 0.275, 0));

  const group = (...meshes: Mesh[]): Group => {
    const g = new Group();
    for (const mesh of meshes) g.add(mesh);
    return g;
  };

  return {
    forest: () => group(new Mesh(shortTrunk, trunk), new Mesh(firCone, fir)),
    jungle: () => group(new Mesh(tallTrunk, trunk), new Mesh(ball, canopy)),
    mountain: () => group(new Mesh(pyramid, rock), new Mesh(cap, snow)),
    desert: () => group(new Mesh(dune, sand)),
    tundra: () => group(new Mesh(shard, ice)),
    plain: () => {
      const left = new Mesh(spike, wheat);
      left.position.set(-0.12, 0, 0.05);
      const right = new Mesh(spike, wheat);
      right.position.set(0.13, 0, -0.06);
      right.scale.setScalar(0.8);
      return group(new Mesh(spike, wheat), left, right);
    },
  };
})();

export function createProp(type: RegionType): Group {
  return FACTORIES[type]();
}

export function disposeTerrain(): void {
  for (const g of geometries) g.dispose();
  for (const m of materials) m.dispose();
}
