import { describe, expect, it } from 'vitest';
import { FALL_MS, PARACHUTE_MS, parachuteAt } from './parachute';

describe('a packet under its parachute', () => {
  it('falls from the plane to the ground, slowing as it nears it', () => {
    expect(parachuteAt(0, 'full')).toEqual({ height: 1, opacity: 1 });
    const early = parachuteAt(FALL_MS * 0.25, 'full')!.height;
    const late = parachuteAt(FALL_MS * 0.75, 'full')!.height;
    expect(early).toBeGreaterThan(late);
    expect(early - parachuteAt(FALL_MS * 0.5, 'full')!.height).toBeGreaterThan(
      parachuteAt(FALL_MS * 0.5, 'full')!.height - late,
    );
    expect(parachuteAt(FALL_MS, 'full')!.height).toBe(0);
  });

  it('rests on the ground, fades, then is gone', () => {
    expect(parachuteAt(FALL_MS + 100, 'full')).toEqual({ height: 0, opacity: 1 });
    expect(parachuteAt(PARACHUTE_MS - 50, 'full')!.opacity).toBeLessThan(0.2);
    expect(parachuteAt(PARACHUTE_MS, 'full')).toBeNull();
  });

  it('is laid down at once when motion is reduced, and not drawn when it is cut', () => {
    expect(parachuteAt(0, 'reduced')).toEqual({ height: 0, opacity: 1 });
    expect(parachuteAt(5000, 'reduced')).toBeNull();
    expect(parachuteAt(10, 'off')).toBeNull();
  });
});
