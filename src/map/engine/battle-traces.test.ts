import { describe, expect, it } from 'vitest';
import { cratersAround } from './battle-traces';

describe('cratersAround (#642)', () => {
  it('pose le premier cratère au point, les autres autour, au même endroit d’une vue à l’autre', () => {
    const trace = { id: 'engagement-1', craters: 5 };
    const craters = cratersAround(trace);
    expect(craters).toHaveLength(5);
    expect(craters[0]).toMatchObject({ dx: 0, dz: 0, size: 1 });
    for (const { dx, dz, size } of craters.slice(1)) {
      expect(Math.hypot(dx, dz)).toBeGreaterThanOrEqual(1.15);
      expect(Math.hypot(dx, dz)).toBeLessThanOrEqual(2.2);
      expect(size).toBeLessThan(1.1);
    }
    expect(cratersAround(trace)).toEqual(craters);
    expect(cratersAround({ id: 'engagement-2', craters: 5 })).not.toEqual(craters);
  });
});

describe('BattleTraces.layWrecks (#642, #643)', () => {
  it('pose la carcasse au bord des cratères, l’épave à son point, pâlies avec la trace', async () => {
    const { BattleTraces } = await import('./battle-traces');
    const { Group, Mesh, BoxGeometry, MeshStandardMaterial, Vector3 } = await import('three');
    const part = () => {
      const group = new Group();
      group.add(new Mesh(new BoxGeometry(), new MeshStandardMaterial()));
      return group;
    };
    const frame = {
      projectLonLat: ([lon, lat]: readonly [number, number], y = 0) => new Vector3(lon, y, -lat),
    };
    const layer = new BattleTraces(frame, {} as never);
    layer.layWrecks(
      [
        { id: 'a', point: [1, 2], craters: 2, wreck: 'carcasse', ink: 0.5 },
        { id: 'b', point: [3, 4], craters: 0, wreck: 'epave', ink: 1 },
        { id: 'c', point: [5, 6], craters: 1, wreck: null, ink: 1 },
      ],
      { carcasse: part(), epave: part() },
    );
    expect(layer.wreckCount).toBe(2);
    const [burnt, sunk] = layer.object.children[0]!.children;
    expect(burnt!.position.x).not.toBe(1);
    expect(sunk!.position.x).toBe(3);
    const material = (burnt!.children[0] as InstanceType<typeof Mesh>).material as InstanceType<
      typeof MeshStandardMaterial
    >;
    expect(material.opacity).toBe(0.5);
    expect(material.transparent).toBe(true);
  });
});
