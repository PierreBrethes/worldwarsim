import { describe, expect, it } from 'vitest';
import { INK_BY_NATION } from '@/domain/nations';
import { builtInk, PALETTE } from './palette';

const channels = (hex: string): ReadonlyArray<number> => {
  const value = parseInt(hex.replace('#', ''), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
};

/** Relative luminance, the only honest way to say "darker" across eight different hues. */
const luminance = (hex: string): number => {
  const [red, green, blue] = channels(hex);
  return 0.2126 * red! + 0.7152 * green! + 0.0722 * blue!;
};

const inks = Object.entries(INK_BY_NATION);

describe('the ink of a built region', () => {
  it.each(inks)('is denser than %s own country, never lighter', (_nation, ink) => {
    expect(luminance(builtInk(ink))).toBeLessThan(luminance(ink));
  });

  it.each(inks)('stays darker than bare land for %s', (_nation, ink) => {
    expect(luminance(builtInk(ink))).toBeLessThan(luminance(PALETTE.neutralLand));
  });

  /**
   * The reading of the map hangs on this: lightening would bring the eight nations back onto
   * the same sand, and the country's colour is the first thing the board says. Ordering the
   * channels is what keeps France blue and the USSR red.
   */
  it.each(inks)('keeps the hue of %s — the channels keep their order', (_nation, ink) => {
    const order = (hex: string) =>
      channels(hex)
        .map((value, index) => [value, index] as const)
        .sort(([a], [b]) => a - b)
        .map(([, index]) => index);
    expect(order(builtInk(ink))).toEqual(order(ink));
  });

  it('never leaves the byte range, whatever it is handed', () => {
    for (const hex of ['#000000', '#ffffff', PALETTE.neutralLand, ...inks.map(([, ink]) => ink)]) {
      expect(builtInk(hex)).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});
