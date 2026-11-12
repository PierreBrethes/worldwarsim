import { describe, expect, it } from 'vitest';
import type { UnitRole } from '@/domain/ids';
import { bakedFigurine } from './figurines/figurine';
import { sceneOfFile } from './gltf-scene.fixture';
import { rolledAngle, rollersOf, rolls } from './rolling';

const FILES = {
  truck: 'src/emblems/figurines/germany/landTransport.glb',
  bigTruck: 'src/emblems/figurines/france/landTransport.glb',
  gun: 'src/emblems/figurines/germany/artillery.glb',
  tank: 'src/emblems/figurines/france/armor-1.glb',
  bigTank: 'src/emblems/figurines/china/armor-1.glb',
};

describe('what a wheel turns by', () => {
  it('turns one whole turn over its circumference, and not at all where it stands', () => {
    expect(rolledAngle(2 * Math.PI * 0.5, 0.5)).toBeCloseTo(2 * Math.PI, 9);
    expect(rolledAngle(0, 0.5)).toBe(0);
  });

  it('turns by the road walked, whatever the time it took', () => {
    expect(rolledAngle(3, 1)).toBe(rolledAngle(1, 1) * 3);
  });
});

describe('the wheels the bake keeps apart', () => {
  const baked = (url: string, role: UnitRole) => bakedFigurine(sceneOfFile(url), role);

  it('keeps the wheels of a truck, each at its own hub, at the radius of its tyre', () => {
    const wheels = rollersOf(baked(FILES.truck, 'landTransport'), 'landTransport');
    expect(wheels.map(({ part }) => part.name).sort()).toEqual([
      'roue_left_1',
      'roue_left_2',
      'roue_right_1',
      'roue_right_2',
    ]);
    for (const { part, radius } of wheels) {
      // The hub stands one radius above the ground: the wheel turns on its axle, not on the body.
      expect(radius).toBeCloseTo(part.position.y, 2);
    }
  });

  it('keeps as many wheels as the truck has, up to three a side', () => {
    expect(rollersOf(baked(FILES.bigTruck, 'landTransport'), 'landTransport')).toHaveLength(6);
  });

  it('keeps the one wheel of each side of a gun', () => {
    const wheels = rollersOf(baked(FILES.gun, 'artillery'), 'artillery');
    expect(wheels.map(({ part }) => part.name).sort()).toEqual(['wheels_left', 'wheels_right']);
    for (const { part, radius } of wheels) expect(radius).toBeCloseTo(part.position.y, 2);
  });

  it('keeps nothing of a tank: its road wheels stay merged, a call each is not worth a turn', () => {
    for (const url of [FILES.tank, FILES.bigTank]) {
      expect(rollersOf(baked(url, 'armor'), 'armor')).toHaveLength(0);
      sceneOfFile(url).traverse((node) => expect(rolls(node, 'armor'), node.name).toBe(false));
    }
  });
});
