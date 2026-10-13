import { describe, expect, it } from 'vitest';
import { SEAT_INKS } from '@/domain/control';
import { INK_BY_NATION } from '@/domain/nations';
import { builtInk, lavis, PALETTE } from './palette';

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

/** The order of the three channels, brightest last: what says blue rather than red. */
const hueOrder = (hex: string) =>
  channels(hex)
    .map((value, index) => [value, index] as const)
    .sort(([a], [b]) => a - b)
    .map(([, index]) => index);

describe('the lavis of a held sheet', () => {
  it.each(SEAT_INKS.map((ink) => [ink]))(
    'lays %s lighter than the ink, darker than the paper',
    (ink) => {
      expect(luminance(lavis(ink))).toBeGreaterThan(luminance(ink));
      expect(luminance(lavis(ink))).toBeLessThan(luminance(PALETTE.neutralLand));
    },
  );

  /** A wash brings every ink toward the same sand: the eight seats must still read apart. */
  it('keeps the eight seats apart', () => {
    const washed = SEAT_INKS.map((ink) => channels(lavis(ink)));
    for (const [rank, first] of washed.entries())
      for (const second of washed.slice(rank + 1)) {
        const gap = Math.hypot(...first.map((channel, index) => channel - second[index]!));
        expect(gap).toBeGreaterThan(24);
      }
  });

  /** The strongest channel names the colour; the two weaker may cross toward the sand (the old
   *  rose's green and blue sit fourteen apart) without France turning red. */
  it.each(SEAT_INKS.map((ink) => [ink]))('keeps the dominant channel of %s', (ink) => {
    expect(hueOrder(lavis(ink))[2]).toBe(hueOrder(ink)[2]);
  });
});

describe('the ink of a built region', () => {
  it.each(inks)('is denser than the lavis of %s own country', (_nation, ink) => {
    expect(luminance(builtInk(ink))).toBeLessThan(luminance(lavis(ink)));
  });

  it.each(inks)('stays darker than bare land for %s', (_nation, ink) => {
    expect(luminance(builtInk(ink))).toBeLessThan(luminance(PALETTE.neutralLand));
  });

  it.each(inks)('keeps the hue of %s — the channels keep their order', (_nation, ink) => {
    expect(hueOrder(builtInk(ink))).toEqual(hueOrder(ink));
  });

  it('never leaves the byte range, whatever it is handed', () => {
    for (const hex of ['#000000', '#ffffff', PALETTE.neutralLand, ...inks.map(([, ink]) => ink)]) {
      expect(builtInk(hex)).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});
