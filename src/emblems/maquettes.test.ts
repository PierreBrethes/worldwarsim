import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Box3, Matrix4, Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import type { BuildingKey } from '@/domain/ids';
import { BUILDING_FOOTPRINT_METRES } from '@/domain/piece-size';
import { RIG_PARTS } from './rigs';
import { BUILDING_MAQUETTES, buildingMaquette } from './buildings/manifest';
import { OBJECTIVE_MAQUETTES } from './objectives/manifest';

/** The heaviest drawn on 13/10 is the shipyard, at 3 156; a site on its socle, in any one state
 *  it shows (ADR 0038 §9). */
const TRIANGLES = 3500;

/** **The accessory groups of a diorama**, and its fixed parts (`SITE` of `verifier-glb.mjs`). */
const GROUPS = ['niveau_1', 'niveau_2', 'niveau_3', 'chantier', 'ruines'] as const;
const FIXED = ['socle', 'lisere', 'cour', 'signe'];

/** **Today's barracks on a procedural socle** (`scripts/fixture-socle.mjs`): a test file, never
 *  in a manifest, until Pierre's GLBs come (#368). */
const SOCLE_FIXTURE = 'src/emblems/fixtures/barracks-socle.glb';

/** The flag, its pole and its marker: on every building (`FLAG` of `verifier-glb.mjs`). */
const FLAG = ['hampe', 'drapeau', 'fx_tete_hampe'];

/**
 * **The named parts each regenerated building carries, and its width in metres** (#286), copied
 * from `EXPECT` of `WWS/prototypes/glb/prompts/verifier-glb.mjs`: the board draws them at one
 * scale per metre (ADR 0035), so a file that loses its measure is drawn wrong. `of` is the node
 * measured on `x` (the whole model when absent), `tolerance` its share of slack, `below` the
 * nodes allowed under the ground.
 */
const BRIEF: Readonly<
  Record<
    Exclude<BuildingKey, 'depot'>,
    {
      readonly metres: number;
      readonly tolerance: number;
      readonly of?: string;
      readonly axis?: 'x' | 'z';
      readonly below?: ReadonlyArray<string>;
      readonly names: ReadonlyArray<string>;
    }
  >
> = {
  barracks: {
    metres: 50,
    tolerance: 0.04,
    of: 'murs',
    names: [
      'murs',
      'porte_gauche',
      'porte_droite',
      'fond_sombre',
      'remise_murs',
      'remise_toit',
      'remise_porte_gauche',
      'remise_porte_droite',
      'remise_fond_sombre',
      'fx_entree',
      'fx_sortie',
      'fx_entree_remise',
      'fx_sortie_remise',
      'fx_smoke',
      ...FLAG,
    ],
  },
  airfield: {
    metres: 50,
    tolerance: 0.05,
    names: [
      'rail_porte',
      'porte_gauche_1',
      'porte_gauche_2',
      'porte_droite_1',
      'porte_droite_2',
      'fond_sombre',
      'fx_entree',
      'fx_sortie',
      ...FLAG,
    ],
  },
  port: {
    metres: 210,
    tolerance: 0.05,
    axis: 'z',
    below: ['avant_cale'],
    names: [
      'coque_cale',
      'ber_1',
      'ber_2',
      'ber_3',
      'accore_1',
      'accore_2',
      'accore_3',
      'accore_4',
      'accore_5',
      'accore_6',
      'avant_cale',
      'grue',
      'grue_couronne',
      'fleche',
      'cable',
      'crochet',
      'fx_bord_eau',
      'fx_smoke',
      ...FLAG,
    ],
  },
  warehouse: {
    metres: 60,
    tolerance: 0.04,
    of: 'murs',
    names: [
      'murs',
      'porte',
      'rail',
      'galet',
      'galet_2',
      'fond_sombre',
      'caisse_1',
      'caisse_2',
      'caisse_3',
      'caisse_4',
      'caisse_5',
      'fx_quai',
      'fx_entree',
      'fx_sortie',
      ...FLAG,
    ],
  },
  hq: {
    metres: 60,
    tolerance: 0.05,
    names: [
      'porte_gauche',
      'porte_droite',
      'fond_sombre',
      'porte_service',
      'fond_sombre_service',
      'fx_entree',
      'fx_sortie',
      'fx_quai',
      'fx_smoke',
      ...FLAG,
    ],
  },
  arsenal: {
    metres: 80,
    tolerance: 0.05,
    names: [
      'murs',
      'porte',
      'rail_porte',
      'fond_sombre',
      'fx_quai',
      'fx_sortie',
      'fx_smoke',
      ...FLAG,
    ],
  },
  farm: {
    metres: 40,
    tolerance: 0.06,
    names: ['eolienne_tete', 'eolienne_roue', 'fx_smoke', ...FLAG],
  },
  mine: {
    metres: 50,
    tolerance: 0.06,
    names: [
      'molette_1',
      'molette_2',
      'wagonnet',
      'wagonnet_caisse',
      'rail',
      'fx_smoke',
      'fx_sortie',
      ...FLAG,
    ],
  },
  oilWell: {
    metres: 25,
    tolerance: 0.06,
    names: [
      'balancier',
      'tete_de_cheval',
      'manivelle',
      'contrepoids',
      'bielle',
      'tige',
      'fx_smoke',
      ...FLAG,
    ],
  },
  researchCenter: {
    metres: 50,
    tolerance: 0.06,
    names: [
      'coupole',
      'volet_coupole',
      'lunette',
      'porte_gauche',
      'porte_droite',
      'fond_sombre',
      'fx_sortie',
      'fx_smoke',
      ...FLAG,
    ],
  },
  listening: {
    metres: 30,
    tolerance: 0.06,
    names: ['cadre_gonio', 'porte', 'fond_sombre', 'fx_sortie', 'fx_smoke', ...FLAG],
  },
  city: { metres: 50, tolerance: 0.05, names: ['fx_smoke', ...FLAG] },
};
/** The coal mine is a second file for the same key, with the same parts and width as the mine. */
const COAL_MINE = BRIEF.mine;

type Node = {
  name?: string;
  mesh?: number;
  children?: ReadonlyArray<number>;
  matrix?: number[];
  translation?: [number, number, number];
  rotation?: [number, number, number, number];
  scale?: [number, number, number];
};
type Gltf = {
  scene?: number;
  scenes: ReadonlyArray<{ nodes: ReadonlyArray<number> }>;
  nodes: ReadonlyArray<Node>;
  meshes: ReadonlyArray<{
    primitives: ReadonlyArray<{
      indices?: number;
      material?: number;
      attributes: { POSITION: number };
    }>;
  }>;
  accessors: ReadonlyArray<{ count: number; min?: number[]; max?: number[] }>;
  materials?: ReadonlyArray<{ name?: string }>;
};

function readGlb(url: string): Gltf {
  const bytes = readFileSync(join(process.cwd(), url));
  const length = bytes.readUInt32LE(12);
  return JSON.parse(bytes.subarray(20, 20 + length).toString('utf8')) as Gltf;
}

/** The scene's bounds, node transforms applied to each primitive's own box. `only` keeps the
 *  subtree of the node of that name; `without` leaves out those of the nodes it lists. */
function boundsOf(gltf: Gltf, only?: string, without: ReadonlyArray<string> = []): Box3 {
  const box = new Box3();
  const visit = (index: number, parent: Matrix4, inside: boolean) => {
    const node = gltf.nodes[index]!;
    if (without.includes(node.name ?? '')) return;
    inside ||= only === undefined || node.name === only;
    const local = node.matrix
      ? new Matrix4().fromArray(node.matrix)
      : new Matrix4().compose(
          new Vector3(...(node.translation ?? [0, 0, 0])),
          new Quaternion(...(node.rotation ?? [0, 0, 0, 1])),
          new Vector3(...(node.scale ?? [1, 1, 1])),
        );
    const world = parent.clone().multiply(local);
    for (const primitive of node.mesh === undefined || !inside
      ? []
      : gltf.meshes[node.mesh]!.primitives) {
      const { min, max } = gltf.accessors[primitive.attributes.POSITION]!;
      for (const x of [min![0]!, max![0]!])
        for (const y of [min![1]!, max![1]!])
          for (const z of [min![2]!, max![2]!])
            box.expandByPoint(new Vector3(x, y, z).applyMatrix4(world));
    }
    for (const child of node.children ?? []) visit(child, world, inside);
  };
  for (const root of gltf.scenes[gltf.scene ?? 0]!.nodes) visit(root, new Matrix4(), false);
  return box;
}

const buildings = [
  ...Object.entries(BUILDING_MAQUETTES).filter(([key]) => key !== 'depot'),
  ['mine (coal)', buildingMaquette('mine', 'coal')],
].flatMap(([key, url]) => (url === null ? [] : [[key!, url!] as const]));
const objectives = [...new Set(Object.values(OBJECTIVE_MAQUETTES))].flatMap((url) =>
  url === null ? [] : [url],
);

const trianglesOf = (gltf: Gltf): number =>
  gltf.meshes
    .flatMap((mesh) => mesh.primitives)
    .reduce((sum, p) => sum + gltf.accessors[p.indices ?? p.attributes.POSITION]!.count / 3, 0);

/**
 * **The triangles of each state a site shows** (ADR 0038 §9, as `verifier-glb.mjs` counts them):
 * at level 3 the building, its fixed parts and `niveau_1` to `niveau_3`; at work `niveau_1` and
 * `chantier`; in ruins `ruines` alone. A file without a socle shows one state, all of it.
 */
function trianglesByState(gltf: Gltf): number[] {
  const under = (index: number): number => {
    const node = gltf.nodes[index]!;
    const own =
      node.mesh === undefined
        ? 0
        : gltf.meshes[node.mesh]!.primitives.reduce(
            (sum, p) => sum + gltf.accessors[p.indices ?? p.attributes.POSITION]!.count / 3,
            0,
          );
    return own + (node.children ?? []).reduce((sum, child) => sum + under(child), 0);
  };
  const named = (name: string) =>
    gltf.nodes.reduce((sum, node, k) => sum + (node.name === name ? under(k) : 0), 0);
  const total = trianglesOf(gltf);
  if (!gltf.nodes.some((node) => node.name === 'socle')) return [total];
  const [one, two, three, works, ruins] = GROUPS.map(named) as [
    number,
    number,
    number,
    number,
    number,
  ];
  const fixedAndBuilding = total - one - two - three - works - ruins;
  return [
    fixedAndBuilding + one + two + three,
    fixedAndBuilding + one + works,
    fixedAndBuilding + ruins,
  ];
}

/** What the ring spaces a site by: its socle's box, else the model as built, its flag left out. */
const footprintOf = (gltf: Gltf): Vector3 =>
  (gltf.nodes.some((node) => node.name === 'socle')
    ? boundsOf(gltf, 'socle')
    : boundsOf(gltf, undefined, ['hampe', 'drapeau'])
  ).getSize(new Vector3());

describe('maquettes', () => {
  it.each(objectives)('%s keeps to the brief', (url) => {
    const gltf = readGlb(url);
    expect(trianglesOf(gltf)).toBeLessThanOrEqual(TRIANGLES);
    // One material per primitive, named: the board merges by material (`bakedSite`), and a
    // primitive without one would wear the loader's grey default.
    for (const primitive of gltf.meshes.flatMap((mesh) => mesh.primitives))
      expect(primitive.material).toBeTypeOf('number');
    // Y up, origin on the ground and inside the footprint: the point stands under the building.
    const { min, max } = boundsOf(gltf);
    expect(Math.abs(min.y)).toBeLessThan(0.02);
    expect(max.y).toBeGreaterThan(0.5);
    expect(min.x < 0 && max.x > 0 && min.z < 0 && max.z > 0).toBe(true);
  });

  it.each(buildings)('%s keeps to the brief, in metres', (key, url) => {
    const brief = key === 'mine (coal)' ? COAL_MINE : BRIEF[key as keyof typeof BRIEF];
    const gltf = readGlb(url);
    for (const state of trianglesByState(gltf)) expect(state).toBeLessThanOrEqual(TRIANGLES);
    for (const primitive of gltf.meshes.flatMap((mesh) => mesh.primitives))
      expect(primitive.material).toBeTypeOf('number');
    const names = new Set(gltf.nodes.map((node) => node.name));
    for (const part of brief.names) expect(names.has(part), part).toBe(true);
    // Drawn at one scale per metre (ADR 0035): the file's own width is the building's.
    // The flagpole and the slipway are left out of the measure, as `verifier-glb.mjs` does.
    const size = boundsOf(gltf, brief.of, ['hampe', 'drapeau', ...(brief.below ?? [])]).getSize(
      new Vector3(),
    );
    expect(Math.abs(size[brief.axis ?? 'x'] / brief.metres - 1)).toBeLessThan(brief.tolerance);
    // Y up, origin on the ground — but the port's slipway, which goes under the water — and
    // inside the footprint: the point stands under the building.
    const { min, max } = boundsOf(gltf, undefined, brief.below);
    expect(Math.abs(min.y)).toBeLessThan(0.02);
    expect(max.y).toBeGreaterThan(0.5);
    const whole = boundsOf(gltf);
    expect(whole.min.x < 0 && whole.max.x > 0 && whole.min.z < 0 && whole.max.z > 0).toBe(true);
  });

  it.each(buildings)('%s: the ring spaces it by its real footprint', (key, url) => {
    const k = (key === 'mine (coal)' ? 'mine' : key) as BuildingKey;
    // The flagpole is left out: the ring spaces what is built, not what flies.
    const size = footprintOf(readGlb(url));
    expect(Math.abs(Math.max(size.x, size.z) / BUILDING_FOOTPRINT_METRES[k] - 1)).toBeLessThan(
      0.02,
    );
  });

  describe('the barracks on its socle (fixture, ADR 0038)', () => {
    const gltf = readGlb(SOCLE_FIXTURE);

    it('carries the diorama, its liseré in a material of its own, and its building whole', () => {
      const names = new Set(gltf.nodes.map((node) => node.name));
      for (const part of [...BRIEF.barracks.names, ...FIXED, 'fx_rang', ...GROUPS])
        expect(names.has(part), part).toBe(true);
      const materials = (gltf.materials ?? []).map((m) => m.name);
      expect(materials).toContain('lisere');
      // The flag rides on the sign, so that the animations reading it are not lost.
      const signe = gltf.nodes.find((node) => node.name === 'signe')!;
      const carried = (signe.children ?? []).map((k) => gltf.nodes[k]!.name);
      expect(carried).toEqual(expect.arrayContaining(['hampe', 'drapeau']));
    });

    it('keeps each state it shows to its budget', () => {
      const states = trianglesByState(gltf);
      expect(states).toHaveLength(3);
      for (const state of states) expect(state).toBeLessThanOrEqual(TRIANGLES);
    });

    it('is spaced by its socle, 80 m: what BUILDING_FOOTPRINT_METRES reads once it replaces barracks.glb', () => {
      const size = footprintOf(gltf);
      expect(Math.max(size.x, size.z)).toBeCloseTo(80, 1);
    });
  });

  // The vehicles' parts are held by `glb.test.ts`.
  it.each(Object.entries(RIG_PARTS).filter(([family]) => family in BUILDING_MAQUETTES))(
    '%s: each rig part is carried by one node',
    (family, parts) => {
      const gltf = readGlb(BUILDING_MAQUETTES[family as BuildingKey]!);
      for (const part of parts)
        expect(gltf.nodes.filter((node) => node.name === part).length, part).toBe(1);
    },
  );
});
