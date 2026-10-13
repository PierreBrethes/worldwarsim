import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { UnitRole } from '@/domain/ids';
import { FIGURINE_FILES } from './manifest';

/** The brief given to Claude Design, per role: its triangle ceiling and the parts the engine names. */
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
  landTransport: { triangles: 2500, parts: ['body', 'fx_smoke'] },
  fighter: { triangles: 2500, parts: ['fuselage', 'prop', 'fx_smoke'] },
  bomber: { triangles: 3500, parts: ['fuselage', 'fx_smoke'] },
  airTransport: { triangles: 3500, parts: ['fuselage', 'fx_smoke'] },
  escort: { triangles: 4000, parts: ['hull', 'fx_smoke'] },
  cargo: { triangles: 4000, parts: ['hull', 'fx_smoke'] },
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
  it.each(files)('%s keeps to the brief', (_, role, url, tier) => {
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
    for (const part of parts) expect(names.has(part), part).toBe(true);
  });
});
