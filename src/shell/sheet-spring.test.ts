import { describe, expect, it } from 'vitest';
import { isSettled, stepSpring, type Spring } from './sheet-spring';

/** Runs the spring in 16 ms frames until it settles, returning every state it passed through. */
function run(from: Spring, target: number, ceiling: number): Spring[] {
  const path = [from];
  let state = from;
  for (let frame = 0; frame < 300 && !isSettled(state, target); frame++) {
    state = stepSpring(state, target, ceiling, 16);
    path.push(state);
  }
  return path;
}

describe('the sheet spring', () => {
  it('converges on the step it is released toward', () => {
    const path = run({ h: 300, v: 0 }, 420, 600);
    expect(isSettled(path.at(-1)!, 420)).toBe(true);
    expect(path.length).toBeLessThan(120);
  });

  it('takes up the position and the speed it had in flight', () => {
    const [start, first] = run({ h: 380, v: 0.8 }, 250, 600);
    // First frame continues the upward motion before turning back: speed is not reset to zero.
    expect(first!.h).toBeGreaterThan(start!.h);
    expect(isSettled(run({ h: 380, v: 0.8 }, 250, 600).at(-1)!, 250)).toBe(true);
  });

  it('stops at the top step without bouncing past it', () => {
    const path = run({ h: 500, v: 3 }, 600, 600);
    expect(Math.max(...path.map((s) => s.h))).toBeLessThanOrEqual(600);
    expect(isSettled(path.at(-1)!, 600)).toBe(true);
  });
});
