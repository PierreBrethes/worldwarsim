import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { KIT_REACH_METRES } from '@/domain/piece-size';
import { AIRFIELD, KITS, MOLE } from './manifest';

type Gltf = {
  nodes: ReadonlyArray<{ name?: string; mesh?: number; children?: number[] }>;
  meshes: ReadonlyArray<{
    primitives: ReadonlyArray<{ attributes: { POSITION: number }; indices?: number }>;
  }>;
  accessors: ReadonlyArray<{ count: number; min?: number[]; max?: number[] }>;
  images?: ReadonlyArray<{ mimeType?: string }>;
};

const read = (url: string): Gltf => {
  const bytes = readFileSync(join(process.cwd(), url));
  const length = bytes.readUInt32LE(12);
  return JSON.parse(bytes.subarray(20, 20 + length).toString('utf8')) as Gltf;
};

/** A node's own mesh box, in its own frame. */
const boxOf = (gltf: Gltf, name: string) => {
  const node = gltf.nodes.find((each) => each.name === name)!;
  const accessors = gltf.meshes[node.mesh!]!.primitives.map(
    (p) => gltf.accessors[p.attributes.POSITION]!,
  );
  return {
    min: [0, 1, 2].map((k) => Math.min(...accessors.map((a) => a.min![k]!))),
    max: [0, 1, 2].map((k) => Math.max(...accessors.map((a) => a.max![k]!))),
  };
};

describe('terrain kits', () => {
  it.each(Object.entries(KITS))('%s: textures in WebP', (_, url) => {
    for (const image of read(url).images ?? []) expect(image.mimeType).toBe('image/webp');
  });

  it('the runway: its modules lay 170 m, 30 m wide, with their lights and threshold', () => {
    const gltf = read(KITS.piste);
    const names = new Set(gltf.nodes.map((node) => node.name));
    for (const name of ['piste_troncon', 'piste_seuil', 'piste_bout', 'feu_gauche', 'fx_seuil'])
      expect(names.has(name), name).toBe(true);
    const laid = AIRFIELD.modules.reduce((sum, [name, metres]) => {
      const { min, max } = boxOf(gltf, name);
      expect(max[2]! - min[2]!, name).toBeCloseTo(metres, 1);
      expect(max[0]! - min[0]!, name).toBeCloseTo(2 * AIRFIELD.runway.half, 1);
      return sum + metres;
    }, 0);
    expect(laid).toBe(AIRFIELD.runway.length);
  });

  it('the mole: its module 20 × 10 m, its top at 0.5 m, raised to the quay at 2.2 m', () => {
    const gltf = read(KITS.mole);
    for (const name of [
      'mole_troncon',
      'mole_tete',
      'bitte',
      'defense',
      'lampadaire',
      'feu_musoir',
    ])
      expect(
        gltf.nodes.some((node) => node.name === name),
        name,
      ).toBe(true);
    const { min, max } = boxOf(gltf, 'mole_troncon');
    expect(max[0]! - min[0]!).toBeCloseTo(2 * (MOLE.x - MOLE.inner), 1);
    expect(max[2]! - min[2]!).toBeCloseTo(MOLE.module, 1);
    // The bollards stand on its top: 0.5 m, raised by `lift` to the socle's 2.2.
    const bitte = gltf.nodes.find((node) => node.name === 'bitte') as { translation?: number[] };
    expect(bitte.translation![1]! + MOLE.lift).toBeCloseTo(AIRFIELD.top, 2);
  });

  it("the ring reserves the kits: the runway's far corner, the mole's head", () => {
    const { x1, length, z, half } = AIRFIELD.runway;
    const runway = Math.hypot(Math.max(Math.abs(x1), Math.abs(x1 - length)), z + half);
    expect(Math.abs(runway / KIT_REACH_METRES.airfield! - 1)).toBeLessThan(0.02);
    const mole = Math.hypot(
      MOLE.x + (MOLE.x - MOLE.inner),
      MOLE.quay + MOLE.length + 2 * MOLE.head,
    );
    expect(Math.abs(mole / KIT_REACH_METRES.port! - 1)).toBeLessThan(0.02);
  });

  it('the windsock: one root', () => {
    expect(read(KITS.manche).nodes.some((node) => node.name === 'windsock')).toBe(true);
  });
});
