import { describe, expect, it } from 'vitest';
import { embarkingOf } from './hull-boardings';

describe('embarkingOf (#504)', () => {
  const quiet = { pending: false, docking: false };

  it('waits for the hull to stand, then settles it, when nothing else is going on', () => {
    expect(embarkingOf('full', quiet)).toBe('wait');
    expect(embarkingOf('reduced', quiet)).toBe('wait');
  });

  it('settles at once at off motion, for a second boarding on the hull, and while it docks', () => {
    expect(embarkingOf('off', quiet)).toBe('now');
    expect(embarkingOf('full', { ...quiet, pending: true })).toBe('now');
    expect(embarkingOf('full', { ...quiet, docking: true })).toBe('now');
  });
});
