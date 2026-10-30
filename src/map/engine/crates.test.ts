import { Box3, Vector3, type Mesh, type Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { CRATE_BOX, CRATE_SLAT } from './crate';
import { CratePile } from './crates';
import { FIGURINE_SCALE } from './figurines/figurine';
import { ParachuteLayer } from './parachute';
import type { WorldFrame } from './frame';

const heights = (pile: CratePile) => pile.object.children.map((crate) => crate.position.y);

describe('CratePile', () => {
  it('stands the crates already due, and drops only a quarter crossed under the eye', () => {
    const pile = new CratePile(2);
    pile.update(2, 0, true);
    expect(heights(pile)).toEqual([0, 0]);

    pile.update(3, 1000, true);
    expect(heights(pile)[2]).toBeGreaterThan(1);
    pile.update(3, 1300, true);
    expect(heights(pile)).toEqual([0, 0, 0]);
  });

  it('sets a crate down without a fall when motion is not full', () => {
    const pile = new CratePile(0);
    pile.update(1, 1000, false);
    expect(heights(pile)).toEqual([0]);
  });
});

const meshesOf = (root: Object3D, geometry: Mesh['geometry']) => {
  const found: Mesh[] = [];
  root.traverse((node) => {
    if ((node as Mesh).geometry === geometry) found.push(node as Mesh);
  });
  return found;
};
const boxOf = (root: Object3D) => {
  root.updateMatrixWorld(true);
  const [mesh] = meshesOf(root, CRATE_BOX);
  return new Box3().setFromObject(mesh!);
};
const frame = { projectLonLat: () => new Vector3() } as unknown as WorldFrame;
const PX = 0.01;

describe('one crate, from the loading to the drop', () => {
  it('draws the stack and the packet with the same box and slats', () => {
    const pile = new CratePile(1);
    const layer = new ParachuteLayer(frame);
    layer.release([0, 0], 0);
    for (const root of [pile.object, layer.group]) {
      expect(meshesOf(root, CRATE_BOX)).toHaveLength(1);
      expect(meshesOf(root, CRATE_SLAT)).toHaveLength(2);
    }
  });

  it('keeps the standing crate the size it had, within 5 %', () => {
    const pile = new CratePile(4);
    const side = boxOf(pile.object).getSize(new Vector3()).y;
    expect(side / (0.5 * FIGURINE_SCALE)).toBeCloseTo(1, 1);
    expect(Math.abs(side / (0.5 * FIGURINE_SCALE) - 1)).toBeLessThan(0.05);
    // the fourth rests on the first three, not above nor sunk
    expect(pile.object.children[3]!.position.y).toBeCloseTo(0.5, 1);
  });

  it('keeps the packet the size it had, falling and landed, and sets it on the sheet', () => {
    const layer = new ParachuteLayer(frame);
    layer.release([0, 0], 0);
    layer.animate(0, PX);
    const falling = boxOf(layer.group).getSize(new Vector3()).y;
    expect(Math.abs(falling / (0.16 * 34 * PX) - 1)).toBeLessThan(0.05);
    layer.animate(1900, PX);
    const landed = boxOf(layer.group);
    expect(Math.abs(landed.getSize(new Vector3()).y / (0.16 * 34 * PX * 0.7) - 1)).toBeLessThan(
      0.05,
    );
    expect(landed.min.y).toBeCloseTo(0, 3);
  });
});
