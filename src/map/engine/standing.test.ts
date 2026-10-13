import { MeshStandardMaterial, Raycaster, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import type { UnitRole } from '@/domain/ids';
import { pilePieces } from '@/domain/pile-pieces';
import {
  drawnKey,
  dressedGroups,
  type Faces,
  pileLayout,
  pileObject,
  pickedIn,
  spreadLayout,
} from './standing';

const troop = (role: UnitRole, strength = 100) => ({
  id: role,
  role,
  tier: 1 as const,
  strength,
  nominalStrength: 100,
});

describe('pileLayout', () => {
  it('centres the groups side by side, the « +N » counter in the slot after them', () => {
    expect(pileLayout(1, false)).toEqual({ groups: [0], more: null });
    expect(pileLayout(2, false)).toEqual({ groups: [-0.25, 0.25], more: null });
    expect(pileLayout(3, true)).toEqual({ groups: [-0.75, -0.25, 0.25], more: 0.75 });
  });
});

describe('spreadLayout', () => {
  it('stands the troops side by side, centred on the point', () => {
    expect(spreadLayout(1)).toEqual([{ x: 0, z: 0 }]);
    expect(spreadLayout(3)).toEqual([
      { x: -0.5, z: 0 },
      { x: 0, z: 0 },
      { x: 0.5, z: 0 },
    ]);
  });

  it('starts a row behind the first past four, each row centred', () => {
    const layout = spreadLayout(6);
    expect(layout.slice(0, 4).map((at) => at.z)).toEqual([0, 0, 0, 0]);
    expect(layout[0]!.x).toBe(-0.75);
    expect(layout.slice(4)).toEqual([
      { x: -0.25, z: -0.7 },
      { x: 0.25, z: -0.7 },
    ]);
  });
});

describe('dressedGroups', () => {
  it('dresses a pile whose every group has a figurine', () => {
    expect(
      dressedGroups('france', pilePieces([troop('infantry'), troop('infantry')])),
    ).toHaveLength(1);
  });

  it('leaves the whole pile to its plate when one group has none', () => {
    expect(dressedGroups('france', pilePieces([troop('infantry'), troop('armor')]))).toBeNull();
    expect(dressedGroups('japan', pilePieces([troop('airTransport')]))).toBeNull();
    expect(dressedGroups('france', { groups: [], more: 0, troopIds: [], spread: [] })).toBeNull();
  });
});

describe('drawnKey', () => {
  it('redraws a pile whose vehicles cross a wear line, and only then', () => {
    const at = (strength: number) => drawnKey('germany', pilePieces([troop('armor', strength)]));
    expect(at(90)).toBe(at(80));
    expect(at(50)).not.toBe(at(80));
    expect(at(20)).not.toBe(at(50));
  });
});

describe('picking a pile', () => {
  const faces = { of: () => new MeshStandardMaterial() } as unknown as Faces;
  const texts = { count: String, more: String };
  const pieces = pilePieces([
    { ...troop('armor'), id: 'a1' },
    { ...troop('armor'), id: 'a2' },
    { ...troop('infantry'), id: 'i1' },
    { ...troop('landTransport'), id: 'l1' },
    { ...troop('fighter'), id: 'f1' },
  ]);
  const pile = pileObject('germany', pieces, texts, faces)!;
  // No model file loads under node: the footprints stand without them.
  pile.ready.catch(() => {});
  pile.object.updateMatrixWorld(true);
  const from = (x: number, z: number) => new Raycaster(new Vector3(x, 5, z), new Vector3(0, -1, 0));
  const picked = (x: number, z = 0) => pickedIn(from(x, z), pile.targets, pieces);
  const [armor, infantry, transport] = pileLayout(3, true).groups as [number, number, number];

  it('takes the group under the pointer, by its footprint and not its triangles', () => {
    expect(picked(armor)).toEqual(['a1', 'a2']);
    expect(picked(infantry + 0.1, 0.2)).toEqual(['i1']);
    expect(picked(transport)).toEqual(['l1']);
  });

  it('takes the whole pile on a counter, the ×N standing over its group included', () => {
    expect(picked(pileLayout(3, true).more!)).toEqual(['a1', 'a2', 'i1', 'l1', 'f1']);
    expect(picked(armor + 0.2, 0.22)).toEqual(['a1', 'a2', 'i1', 'l1', 'f1']);
  });

  it('takes nothing beside the pile', () => {
    expect(picked(3)).toBeNull();
  });
});
