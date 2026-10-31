import { beforeAll, describe, expect, it } from 'vitest';
import { Group, Mesh, MeshStandardMaterial, Texture, Vector3 } from 'three';
import { brightest, Halos, warmPieces, type Flash } from './halo';

beforeAll(() => {
  const ctx = new Proxy({}, { get: () => () => ({ addColorStop() {} }) });
  Object.assign(globalThis, { document: { createElement: () => ({ getContext: () => ctx }) } });
});

const flash = (strength: number, x = 0): Flash => ({
  at: new Vector3(x, 0, 0),
  strength,
  reach: 1,
});

const piece = (material: MeshStandardMaterial): Group => {
  const group = new Group();
  group.add(new Mesh(undefined, material));
  return group;
};

describe('the glow on the pieces themselves', () => {
  it('lights nothing by day, and a warm share of their own colour by night', () => {
    const material = new MeshStandardMaterial({ color: '#c0a080' });
    warmPieces(piece(material), 0);
    expect(material.emissive.r + material.emissive.g + material.emissive.b).toBe(0);
    warmPieces(piece(material), 1);
    expect(material.emissive.r).toBeGreaterThan(material.emissive.g);
    expect(material.emissive.g).toBeGreaterThan(material.emissive.b);
    warmPieces(piece(material), 0.5);
    const half = material.emissive.r;
    warmPieces(piece(material), 1);
    expect(half).toBeCloseTo(material.emissive.r / 2);
  });

  it('warms a textured piece through its own map', () => {
    const map = new Texture();
    const material = new MeshStandardMaterial({ map });
    warmPieces(piece(material), 1);
    expect(material.emissiveMap).toBe(map);
  });

  it('leaves alone a material that already carries its own emission', () => {
    const print = new Texture();
    const material = new MeshStandardMaterial({ map: new Texture(), emissiveMap: print });
    material.emissive.set('#ffffff');
    warmPieces(piece(material), 1);
    expect(material.emissiveMap).toBe(print);
    expect(material.emissive.getHex()).toBe(0xffffff);
  });

  it('lights the dark of a doorway by night, far brighter than its own dark colour', () => {
    const doorway = new MeshStandardMaterial({ color: '#1a1410', name: 'fond_sombre' });
    const wall = new MeshStandardMaterial({ color: '#1a1410' });
    warmPieces(piece(doorway), 0);
    expect(doorway.emissive.getHex()).toBe(0);
    warmPieces(piece(doorway), 1);
    warmPieces(piece(wall), 1);
    expect(doorway.emissive.r).toBeGreaterThan(0.5);
    expect(doorway.emissive.r).toBeGreaterThan(10 * wall.emissive.r);
  });
});

describe('the flash of a shot lighting the board (#332)', () => {
  it('takes the most vivid flash of all the scenes, and none when none is lit', () => {
    expect(brightest([])).toBeNull();
    expect(brightest([flash(0), flash(0)])).toBeNull();
    expect(brightest([flash(0.3, 1), flash(0.9, 2), flash(0.5, 3)])?.at.x).toBe(2);
  });

  it('lights the ground with the night: nothing by day, more as dusk deepens', () => {
    const halos = new Halos();
    const lit = (night: number): number => {
      halos.begin();
      halos.flare(flash(1));
      halos.end(night);
      return halos.object.visible ? halos.object.material.opacity : 0;
    };
    expect(lit(0)).toBe(0);
    expect(lit(0.5)).toBeGreaterThan(0);
    expect(lit(0.5)).toBeCloseTo(lit(1) / 2);
  });

  it('weighs the disc by the flash, so a dying flash is dimmer', () => {
    const halos = new Halos();
    const weightOf = (strength: number): number => {
      halos.begin();
      halos.flare(flash(strength));
      halos.end(1);
      return halos.object.instanceColor!.getX(0);
    };
    expect(weightOf(0.25)).toBeCloseTo(weightOf(1) / 4);
  });

  it('swells the glow of the pieces with the beat, and not by day', () => {
    const material = new MeshStandardMaterial({ color: '#c0a080' });
    warmPieces(piece(material), 1);
    const rest = material.emissive.r;
    warmPieces(piece(material), 1, 1);
    expect(material.emissive.r).toBeGreaterThan(rest);
    warmPieces(piece(material), 0, 1);
    expect(material.emissive.r).toBe(0);
  });
});
