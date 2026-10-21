import { describe, expect, it } from 'vitest';
import { Group, Mesh, MeshStandardMaterial, Texture } from 'three';
import { warmPieces } from './halo';

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
});
