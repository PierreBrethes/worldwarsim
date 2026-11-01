import { beforeAll, describe, expect, it } from 'vitest';
import { Box3, BoxGeometry, Color, Matrix4, type Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { MAX_PLAYING } from './sequences';
import { RAZE_MS, RAZE_RING_MS } from './timelines/raze';
import { razedOf, RazeLayer } from './razes';

beforeAll(() => {
  // The dust's puff is painted on a canvas: this file has no DOM.
  const ctx = new Proxy({}, { get: () => () => ({ addColorStop() {} }) });
  Object.assign(globalThis, {
    document: { createElement: () => ({ getContext: () => ctx }) },
  });
});

const geometry = new BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
const drawn = (material = new MeshStandardMaterial({ color: '#c8b48c' })) => ({
  parts: [{ geometry, material }],
  matrix: new Matrix4().makeTranslation(3, 0, 2),
  box: new Box3(new Vector3(-0.5, 0, -0.5), new Vector3(0.5, 1, 0.5)),
});
const heightOf = (layer: RazeLayer) => {
  layer.group.updateMatrixWorld(true);
  const box = new Box3();
  layer.group.traverse((node) => {
    if ((node as { isMesh?: boolean }).isMesh && node.visible && node.userData.building)
      box.expandByObject(node);
  });
  return box.isEmpty() ? 0 : box.max.y - box.min.y;
};

describe('razedOf', () => {
  it('names the razed maquettes the view no longer serves, and only those', () => {
    const razing = new Set(['building-barracks@2,48', 'building-farm@3,47']);
    const served = [{ id: 'building-farm@3,47' }, { id: 'building-hq@2,48' }];
    expect(razedOf(razing, served)).toEqual(['building-barracks@2,48']);
    expect(razedOf(new Set(), [])).toEqual([]);
  });
});

const wornOf = (layer: RazeLayer) => {
  let worn: MeshStandardMaterial | undefined;
  layer.group.traverse((node) => {
    if (node.userData.building)
      worn = (node as unknown as { material: MeshStandardMaterial }).material;
  });
  return worn!;
};
const markOf = (layer: RazeLayer) => {
  let mark: { position: Vector3 } | undefined;
  layer.group.traverse((node) => {
    // Its footprint or its ring: on the ground, and not a puff of dust.
    if (node.userData.ground && !(node as { isSprite?: boolean }).isSprite) mark = node;
  });
  return mark!;
};

describe('RazeLayer', () => {
  it('falls on itself where it stood, blackening, and is gone with its footprint by 3.2 s', () => {
    const source = new MeshStandardMaterial({ color: '#c8b48c' });
    const layer = new RazeLayer();
    const ended: string[] = [];
    layer.onEnded = (id) => ended.push(id);
    expect(layer.play('a', drawn(source), 0)).toBe(true);
    expect(layer.active).toBe(true);
    layer.advance(0);
    expect(heightOf(layer)).toBeCloseTo(1);
    layer.advance(1200);
    expect(heightOf(layer)).toBeCloseTo(0.12, 2);
    // Its own copy blackens: every other maquette of its model keeps its colour.
    expect(source.color.getHexString()).toBe('c8b48c');
    // Toward the storyboard's soot (`scene.js`, `tint`): 0.7 of the way at 1.2 s, 0.85 at 1.8 s.
    const soot = new Color('#1b1610');
    expect(wornOf(layer).color.r).toBeCloseTo(source.color.clone().lerp(soot, 0.7).r, 4);
    layer.advance(1800);
    expect(wornOf(layer).color.g).toBeCloseTo(source.color.clone().lerp(soot, 0.85).g, 4);
    expect(ended).toEqual([]);
    layer.advance(RAZE_MS);
    expect(layer.group.children).toHaveLength(0);
    expect(layer.active).toBe(false);
    expect(ended).toEqual(['a']);
  });

  it('ends on the ruins: the building cut 3 m over the socle and darkened, the yard replaced', () => {
    const wall = new MeshStandardMaterial({ color: '#c8b48c' });
    const socle = new MeshStandardMaterial({ color: '#ebe1c8' });
    const rubble = new MeshStandardMaterial({ color: '#6b6457' });
    const shell = { geometry, material: wall };
    const withRuins = {
      ...drawn(),
      matrix: new Matrix4().makeTranslation(3, 1, 2).scale(new Vector3(2, 2, 2)),
      parts: [shell, { geometry, material: socle }],
      ruins: { parts: [{ geometry, material: rubble }], stump: 5.2, shell: [shell] },
    };
    const layer = new RazeLayer();
    layer.play('a', withRuins, 0);
    layer.advance(0);
    const meshes: Mesh[] = [];
    layer.group.traverse((node) => {
      if (node.userData.building) meshes.push(node as Mesh);
    });
    expect(meshes).toHaveLength(3);
    const byColour = (hex: number) =>
      meshes.find((mesh) => (mesh.material as MeshStandardMaterial).color.getHex() === hex)
        ?.material as MeshStandardMaterial | undefined;
    // The building: darkened to 0.45, cut at the socle top and 3 m, in the board's units.
    const cutWall = meshes
      .map((mesh) => mesh.material as MeshStandardMaterial)
      .find((m) => m.clippingPlanes?.length === 1)!;
    expect(cutWall.color.r).toBeCloseTo(new Color('#c8b48c').r * 0.45, 4);
    expect(cutWall.clippingPlanes![0]!.constant).toBeCloseTo(1 + 5.2 * 2, 6);
    // The rest of the yard is not cut, and the source is untouched.
    expect(byColour(new Color('#ebe1c8').getHex())?.clippingPlanes ?? []).toHaveLength(0);
    expect(wall.color.getHexString()).toBe('c8b48c');
    expect(wall.clippingPlanes ?? []).toHaveLength(0);
  });

  it('draws no ruins when reduced: the ring alone', () => {
    const shell = { geometry, material: new MeshStandardMaterial() };
    const layer = new RazeLayer();
    layer.motion = 'reduced';
    layer.play('a', { ...drawn(), ruins: { parts: [shell], stump: 5.2, shell: [] } }, 0);
    layer.advance(0);
    expect(heightOf(layer)).toBe(0);
  });

  it('glows no more by night once blackened, though its model did', () => {
    const source = new MeshStandardMaterial({ color: '#c8b48c', emissive: '#553311' });
    const layer = new RazeLayer();
    layer.play('a', drawn(source), 0);
    layer.advance(0);
    expect(wornOf(layer).emissive.r).toBeCloseTo(source.emissive.r);
    layer.advance(1800);
    expect(wornOf(layer).emissive.getHex()).toBe(0);
    expect(source.emissive.getHexString()).toBe('553311');
  });

  it('keeps its pool of light while it stands, shrinking as the heap fades', () => {
    const layer = new RazeLayer();
    layer.play('a', drawn(), 0);
    const lit = (t: number) => {
      layer.advance(t);
      const radii: number[] = [];
      layer.lights((_, radius) => radii.push(radius));
      return radii;
    };
    const whole = lit(0)[0]!;
    expect(whole).toBeGreaterThan(0);
    expect(lit(2200)[0]).toBeCloseTo(whole / 2);
    expect(lit(2700)).toEqual([0]);
  });

  it('lays its footprint, and its ring when reduced, a little above the ground', () => {
    const full = new RazeLayer();
    full.play('a', drawn(), 0);
    full.advance(2200);
    expect(markOf(full).position.y).toBeGreaterThan(0);
    const reduced = new RazeLayer();
    reduced.motion = 'reduced';
    reduced.play('a', drawn(), 0);
    reduced.advance(100);
    expect(markOf(reduced).position.y).toBeGreaterThan(0);
  });

  it('plays at most MAX_PLAYING at once: beyond, the maquette goes as it did', () => {
    const layer = new RazeLayer();
    for (let k = 0; k < MAX_PLAYING; k++) expect(layer.play(`p${k}`, drawn(), 0)).toBe(true);
    expect(layer.play('over', drawn(), 0)).toBe(false);
    expect(layer.group.children).toHaveLength(MAX_PLAYING);
  });

  it('opens a ring of ink in its place when reduced, and plays nothing when cut', () => {
    const reduced = new RazeLayer();
    reduced.motion = 'reduced';
    reduced.play('a', drawn(), 0);
    reduced.advance(0);
    expect(heightOf(reduced)).toBe(0);
    expect(reduced.group.children).toHaveLength(1);
    reduced.advance(RAZE_RING_MS);
    expect(reduced.group.children).toHaveLength(0);
    const cut = new RazeLayer();
    cut.motion = 'off';
    expect(cut.play('a', drawn(), 0)).toBe(false);
    expect(cut.group.children).toHaveLength(0);
    expect(cut.active).toBe(false);
  });
});
