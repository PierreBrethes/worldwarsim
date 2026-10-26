import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { UnitRole } from '@/domain/ids';
import { FIGURINE_FILES } from './manifest';

const PLANE = [
  'fuselage',
  'gear_left',
  'gear_right',
  'wheel_left',
  'wheel_right',
  'tailwheel',
  'fx_smoke',
];

/** The brief given to Claude Design, per role: its triangle ceiling and the parts the engine names.
 *  A part ending in `*` is a family (`roue_left_*`). The moving parts of the regenerated roles
 *  (#286) are copied from `EXPECT` of `WWS/prototypes/glb/prompts/verifier-glb.mjs`. */
const BRIEF: Readonly<
  Record<UnitRole, { readonly triangles: number; readonly parts: ReadonlyArray<string> }>
> = {
  infantry: {
    triangles: 2500,
    parts: [
      'body',
      'head',
      'arm_left',
      'forearm_left',
      'arm_right',
      'forearm_right',
      'leg_left',
      'shin_left',
      'leg_right',
      'shin_right',
      'rifle',
    ],
  },
  armor: { triangles: 3000, parts: ['hull', 'turret', 'gun', 'fx_smoke', 'fx_muzzle'] },
  landTransport: {
    triangles: 1500,
    parts: [
      'body',
      'wheels_left',
      'wheels_right',
      'roue_left_*',
      'roue_right_*',
      'tailgate',
      'tarp',
      'fond_sombre',
      'fx_smoke',
      'fx_poussiere',
      'fx_hayon',
    ],
  },
  artillery: {
    triangles: 3000,
    parts: [
      'carriage',
      'barrel',
      'shield',
      'wheels_left',
      'wheels_right',
      'trail_left',
      'trail_right',
      'fx_muzzle',
      'fx_smoke',
    ],
  },
  fighter: { triangles: 2500, parts: [...PLANE, 'prop', 'fx_muzzle'] },
  bomber: { triangles: 1500, parts: [...PLANE, 'prop*', 'fx_muzzle'] },
  airTransport: {
    triangles: 1500,
    parts: [
      ...PLANE,
      'prop_*',
      'cabin_door',
      'bay_door',
      'fond_sombre',
      'fond_sombre_soute',
      'fx_porte',
      'fx_parachute',
    ],
  },
  escort: { triangles: 4000, parts: ['hull', 'fx_smoke'] },
  cargo: {
    triangles: 4000,
    parts: [
      'hull',
      'mat_charge_*',
      'hold_hatch_*',
      'fond_sombre_*',
      'boat_left',
      'fx_charge_*',
      'fx_smoke',
      'fx_sillage',
      'fx_passerelle',
      'fx_amarre_avant_babord',
      'fx_amarre_avant_tribord',
      'fx_amarre_arriere_babord',
      'fx_amarre_arriere_tribord',
    ],
  },
  carrier: { triangles: 4000, parts: ['hull', 'fx_smoke'] },
};

type Gltf = {
  nodes?: ReadonlyArray<{ name?: string }>;
  meshes?: ReadonlyArray<{
    primitives: ReadonlyArray<{ indices?: number; attributes: { POSITION: number } }>;
  }>;
  accessors: ReadonlyArray<{ count: number }>;
};

/** A GLB is a 12-byte header then a JSON chunk: enough to count and name without three.js. */
function readGlb(url: string): Gltf {
  const bytes = readFileSync(join(process.cwd(), url));
  const length = bytes.readUInt32LE(12);
  return JSON.parse(bytes.subarray(20, 20 + length).toString('utf8')) as Gltf;
}

const files = Object.entries(FIGURINE_FILES).flatMap(([nation, roles]) =>
  Object.entries(roles ?? {}).flatMap(([role, entry]) =>
    (typeof entry === 'string' ? [entry] : entry).flatMap((url, k) =>
      url === null ? [] : [[`${nation} ${role} ${url}`, role as UnitRole, url, k + 1] as const],
    ),
  ),
);

describe.runIf(files.length > 0)('sculpted figurines', () => {
  it.each(files)('%s keeps to the brief', (name, role, url, tier) => {
    const gltf = readGlb(url);
    const triangles = (gltf.meshes ?? [])
      .flatMap((mesh) => mesh.primitives)
      .reduce((sum, p) => sum + gltf.accessors[p.indices ?? p.attributes.POSITION]!.count / 3, 0);
    expect(triangles).toBeLessThanOrEqual(BRIEF[role].triangles);
    const names = new Set((gltf.nodes ?? []).map((node) => node.name));
    // A mark-2 infantryman may carry something else than a rifle (the French bazooka).
    const parts = BRIEF[role].parts.filter(
      (part) => !(role === 'infantry' && tier === 2 && part === 'rifle'),
    );
    for (const part of parts)
      expect(
        part.endsWith('*')
          ? [...names].some((node) => node?.startsWith(part.slice(0, -1)))
          : names.has(part),
        part,
      ).toBe(true);
    // The junk has no second boat; the other cargo ships carry both (`byNation` of `EXPECT`).
    if (role === 'cargo' && !name.startsWith('china')) expect(names.has('boat_right')).toBe(true);
  });
});
