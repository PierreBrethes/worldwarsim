import { describe, expect, it } from 'vitest';
import { DEFAULT_PIECE_SCALE, parsePercent, parsePieceScale } from './piece-scale';

describe('parsePercent', () => {
  it('keeps a valid value and snaps to the step', () => {
    expect(parsePercent(80)).toBe(80);
    expect(parsePercent('87')).toBe(85);
  });
  it('bounds to 50..150', () => {
    expect(parsePercent(10)).toBe(50);
    expect(parsePercent(900)).toBe(150);
  });
  it('falls back on anything unreadable', () => {
    for (const bad of [null, undefined, '', 'abc', NaN, Infinity, {}])
      expect(parsePercent(bad)).toBe(100);
  });
});

describe('parsePieceScale', () => {
  it('reads each slider on its own', () => {
    expect(parsePieceScale({ troops: 70, buildings: 'x' })).toEqual({ troops: 70, buildings: 100 });
  });
  it('defaults when nothing is kept', () => {
    expect(parsePieceScale(null)).toEqual(DEFAULT_PIECE_SCALE);
  });
});
