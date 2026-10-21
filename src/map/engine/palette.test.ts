import { describe, expect, it } from 'vitest';
import { INK_BY_NATION, typeInk, type Nation } from '@/domain/nations';
import { contrastRatio, lavis, lit, nationShades, PALETTE, PEN_OPACITY, penOn } from './palette';

const channels = (hex: string): ReadonlyArray<number> => {
  const value = parseInt(hex.replace('#', ''), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
};

/** CIELAB under D65: the space where a distance is a difference the eye sees. */
const lab = (hex: string): readonly [number, number, number] => {
  const [r, g, b] = channels(hex).map((channel) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((0.4124 * r! + 0.3576 * g! + 0.1805 * b!) / 0.95047);
  const y = f(0.2126 * r! + 0.7152 * g! + 0.0722 * b!);
  const z = f((0.0193 * r! + 0.1192 * g! + 0.9505 * b!) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
};

const deltaE = (first: string, second: string): number => {
  const [a, b] = [lab(first), lab(second)];
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
};

const hue = (hex: string): number => {
  const [, a, b] = lab(hex);
  return ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
};

const hueDrift = (first: string, second: string): number => {
  const gap = Math.abs(hue(first) - hue(second));
  return Math.min(gap, 360 - gap);
};

const direction = (hex: string): number => {
  const [, a, b] = lab(hex);
  const [, landA, landB] = lab(PALETTE.neutralLand);
  return (Math.atan2(b - landB, a - landA) * 180) / Math.PI;
};

const angleGap = (first: number, second: number): number => {
  const gap = Math.abs(first - second) % 360;
  return Math.min(gap, 360 - gap);
};

/** The contrast a pen stroke gives on screen: laid at its opacity over the ground as lit. */
const strokeContrast = (pen: string, ground: string): number =>
  contrastRatio(lavis(pen, PEN_OPACITY, lit(ground)), lit(ground));

const inks = Object.entries(INK_BY_NATION) as ReadonlyArray<[Nation, string]>;

/** The nations whose grounds touch, or nearly, on the board. */
const NEIGHBOURS: ReadonlyArray<[Nation, Nation]> = [
  ['france', 'germany'],
  ['france', 'italy'],
  ['france', 'uk'],
  ['germany', 'italy'],
  ['germany', 'uk'],
  ['germany', 'ussr'],
  ['japan', 'china'],
  ['japan', 'ussr'],
  ['china', 'ussr'],
  ['usa', 'ussr'],
];

describe('the eight nation inks', () => {
  it.each(NEIGHBOURS)('keep %s and %s apart once washed on the sheet', (first, second) => {
    expect(
      deltaE(nationShades(INK_BY_NATION[first]).sheet, nationShades(INK_BY_NATION[second]).sheet),
    ).toBeGreaterThan(20);
  });

  it('keep any two nations apart, neighbours or not — a legend reads them all', () => {
    for (const [rank, [, first]] of inks.entries())
      for (const [, second] of inks.slice(rank + 1))
        expect(deltaE(nationShades(first).sheet, nationShades(second).sheet)).toBeGreaterThan(18);
  });

  it.each(inks)('lays %s clearly off the bare land', (_nation, ink) => {
    expect(deltaE(nationShades(ink).sheet, PALETTE.neutralLand)).toBeGreaterThan(25);
  });

  /** The mast, the telegraph's sender: the ink is also read as type on paper. */
  it.each(inks)('reads %s as type on the paper', (_nation, ink) => {
    expect(contrastRatio(ink, PALETTE.paper)).toBeGreaterThanOrEqual(3);
  });

  /** The telegraph sets a sender's name in small capitals: body text, so the body text floor. */
  it.each(inks)('sets %s as small type on the paper, in its own hue', (_nation, ink) => {
    expect(contrastRatio(typeInk(ink), PALETTE.paper)).toBeGreaterThanOrEqual(4.5);
    expect(hueDrift(typeInk(ink), ink)).toBeLessThan(15);
  });
});

describe('the shades of one nation', () => {
  /**
   * A wash pulls every ink toward the sand, so a family is a **direction away from the paper**:
   * the angle of a shade's offset from the bare land, in the colour plane. Every step of a nation
   * leaves the paper the way its ink does, and nearer that way than any other nation's.
   */
  it.each(inks)('keeps every shade of %s in its own family', (_nation, ink) => {
    const { sheet, surveyed } = nationShades(ink);
    for (const shade of [sheet, surveyed]) {
      expect(angleGap(direction(shade), direction(ink))).toBeLessThan(20);
      for (const [, other] of inks.filter(([, candidate]) => candidate !== ink))
        expect(angleGap(direction(shade), direction(ink))).toBeLessThan(
          angleGap(direction(shade), direction(other)),
        );
    }
  });

  it.each(inks)('tells a fresh ground of %s from an old survey', (_nation, ink) => {
    const { sheet, surveyed } = nationShades(ink);
    expect(deltaE(sheet, surveyed)).toBeGreaterThan(15);
  });

  it('never leaves the byte range, whatever it is handed', () => {
    for (const hex of ['#000000', '#ffffff', PALETTE.neutralLand]) {
      for (const shade of Object.values(nationShades(hex))) expect(shade).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe('the pen over a ground', () => {
  /** The board's one ground since ADR 0033: the bare land, under the hover of a held region. */
  it.each(inks)('reads in the deep of %s on the bare land', (_nation, ink) => {
    expect(
      strokeContrast(penOn(PALETTE.neutralLand, ink), PALETTE.neutralLand),
    ).toBeGreaterThanOrEqual(3);
  });

  it('draws in the deep of the nation ink, never a foreign hue, where ink reads', () => {
    const { surveyed } = nationShades(INK_BY_NATION.japan);
    const pen = penOn(surveyed, INK_BY_NATION.japan);
    expect(pen).not.toBe(PALETTE.paper);
    expect(hueDrift(pen, INK_BY_NATION.japan)).toBeLessThan(35);
  });

  it('draws in plain ink on the bare land', () => {
    expect(penOn(PALETTE.neutralLand, null)).toBe(PALETTE.border);
  });

  it('turns to paper on a ground too dark for any ink', () => {
    expect(penOn(lavis(INK_BY_NATION.france, 0.8), INK_BY_NATION.france)).toBe(PALETTE.paper);
  });
});
