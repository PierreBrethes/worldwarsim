import { describe, expect, it } from 'vitest';
import { DEFAULT_PIECE_SCALE, parsePercent, parsePieceScale } from './piece-scale';

describe('parsePercent', () => {
  it('keeps a valid value and snaps to the step', () => {
    expect(parsePercent(90)).toBe(90);
    expect(parsePercent('107')).toBe(105);
  });
  it('bounds to 80..125', () => {
    expect(parsePercent(10)).toBe(80);
    expect(parsePercent(900)).toBe(125);
  });
  it('falls back on anything unreadable', () => {
    for (const bad of [null, undefined, '', 'abc', NaN, Infinity, {}])
      expect(parsePercent(bad)).toBe(100);
  });
});

describe('parsePieceScale', () => {
  it('reads one slider for troops and buildings alike (ADR 0035 §6)', () => {
    expect(parsePieceScale({ troops: 110, buildings: 90 })).toEqual({
      troops: 110,
      buildings: 110,
    });
  });
  it('defaults when nothing is kept', () => {
    expect(parsePieceScale(null)).toEqual(DEFAULT_PIECE_SCALE);
  });
});
