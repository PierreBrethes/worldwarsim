import { describe, expect, it } from 'vitest';
import { hourOf, splitSpot, spotOf } from './capture-cible.mjs';

describe('--heure', () => {
  it('defaults to noon UTC', () => {
    expect(hourOf(undefined)).toMatch(/T12:00:00\.000Z$/);
  });
  it('keeps an ISO instant with a Z', () => {
    expect(hourOf('2026-10-21T00:00Z')).toBe('2026-10-21T00:00:00.000Z');
  });
  it.each(['midi', '2026-10-21T00:00', '2026-10-21', '2026-13-45T00:00Z'])('refuses %s', (raw) => {
    expect(() => hourOf(raw)).toThrow(/--heure/);
  });
});

describe('lieu=@…', () => {
  const places = { combat: [4.94, 49.7] };
  it('reads a named place of the demo', () => {
    expect(spotOf('@combat', places)).toEqual({ id: null, lonLat: [4.94, 49.7] });
  });
  it('reads the point out of a pile or building id, and keeps the id', () => {
    expect(spotOf('@stack-point:2.35,48.85', places)).toEqual({
      id: 'stack-point:2.35,48.85',
      lonLat: [2.35, 48.85],
    });
    expect(spotOf('@building-barracks@1.5,47', places).lonLat).toEqual([1.5, 47]);
  });
  it('says which places exist when the name is unknown', () => {
    expect(() => spotOf('@nulle-part', places)).toThrow(/combat/);
  });
});

describe('lieu=@… with a distance', () => {
  it('keeps the comma of the id', () => {
    expect(splitSpot('@stack-point:1.6,48.2,6,45')).toEqual({
      spec: '@stack-point:1.6,48.2',
      rest: [6, 45],
    });
    expect(splitSpot('@camion')).toEqual({ spec: '@camion', rest: [] });
    expect(splitSpot('@camion,6')).toEqual({ spec: '@camion', rest: [6] });
  });
});
