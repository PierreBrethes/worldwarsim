import { describe, expect, it } from 'vitest';
import { crateTaking, TAKING } from './taking';

const to = [3, 0, 4] as const;

describe('crateTaking (#279, « Ramasser »)', () => {
  const taking = crateTaking({ part: 'man_0', to, perMetre: 1 });

  it('rests on the pile at the start and once over', () => {
    expect(taking.at(0)).toEqual({});
    expect(taking.at(taking.ms)).toEqual({});
  });

  it('walks one man to the crate, facing it, marching', () => {
    const { man_0 } = taking.at(TAKING.crateWalk / 2);
    expect(man_0?.travel?.[0]).toBeGreaterThan(0);
    expect(man_0?.travel?.[0]).toBeLessThan(3);
    expect(man_0?.heading).toBeCloseTo(Math.atan2(3, 4));
    expect(man_0?.stride).toBeGreaterThan(0);
    expect(man_0?.carry).toBeUndefined();
  });

  it('bends over the crate, then shoulders it', () => {
    const bending = taking.at(TAKING.crateWalk + TAKING.bend / 2).man_0!;
    expect(bending.travel).toEqual(to);
    expect(bending.carry![0]).toBeGreaterThan(0);
    expect(bending.carry![1]).toBe(0);
    const lifted = taking.at(TAKING.crateWalk + TAKING.bend + TAKING.lift).man_0!;
    expect(lifted.carry).toEqual([0, 1, 1]);
  });

  it('carries it back to his place, where it fades into the rank', () => {
    const back = TAKING.crateWalk + TAKING.bend + TAKING.lift;
    const walking = taking.at(back + TAKING.crateWalk / 2).man_0!;
    expect(walking.heading).toBeCloseTo(Math.atan2(-3, -4));
    expect(walking.carry).toEqual([0, 1, 1]);
    const home = taking.at(back + TAKING.crateWalk + TAKING.tag / 2).man_0!;
    expect(home.travel).toEqual([0, 0, 0]);
    expect(home.carry![2]).toBeLessThan(1);
    expect(home.carry![2]).toBeGreaterThan(0);
  });
});
