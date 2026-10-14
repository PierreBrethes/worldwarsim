import { FADED_WASH } from '@/domain/control';

/** Literals, because the engine cannot read CSS. `src/styles/tokens.css` is the source and
 *  `src/styles/colors.test.ts` fails when the two drift. */
export const PALETTE = {
  desk: '#171208',
  paper: '#e4d8bd',
  sea: '#a9c5cd',
  seaInk: '#2c5063',
  /** The board's sea: a printed chart's water-tinted paper, paler than `sea` so the land and the
   *  pieces stand out of it. Engine-only — the interface keeps `sea` for its swatches. */
  seaSheet: '#cfe6ec',
  neutralLand: '#d5c5a0',
  border: '#2a2118',
  plinthTop: '#c7b48e',
  plinthBottom: '#5f5039',
  worldRim: '#6b4a24',
  /** `--notable`, the rail's amber: the board's one ink for "you are here", never an alarm. */
  designated: '#b07434',
  /** A concluded public report: retained on the map, but no longer presented as live. */
  searchEnded: '#777166',
  rimStroke: '#3a2a18',
  /** The light of moving air and breaking water, paler than the sheet so it reads on both seas. */
  foam: '#f4ecd8',
  /** The wind's ink: the sheet's own tone, so a ribbon is ambience and not a white line over the pieces. */
  wind: '#cfc5aa',
} as const;

/**
 * **How much ink the sheet carries: a lavis, not a flat** (carte allégée, 13/10/2026). Every
 * held region, and every country held whole, is the seat's ink laid at this load **over the
 * paper** — no longer over the nation's ink laid full, which stacked two dark inks and buried
 * the pieces. The ink keeps its hue (France stays blue), the sheet comes back through it, and
 * the pieces stand out of it as on the prototype (`WWS/prototypes/table-etat-major.html`).
 *
 * It does not follow the zoomed-in fade (Pierre, 31/08): beyond the threshold the region
 * strokes go, the tint stays — who holds what reads without the cut.
 *
 * The survey's wash floor (`FADED_WASH`) multiplies this load, so the gap between fresh and
 * faded — an information, ADR 0020 §5 — keeps its ratio.
 *
 * History: 0.5 → 0.72 on 31/08 when a seat blue read grey over bare sand, and the home sheet
 * was then painted over its nation's ink at full. Back to 0.65 on 13/10, over the paper.
 */
export const HELD_OPACITY = 0.65;

/** A region that bears a building: the same pen, a heavier hand. */
const BUILT_LOAD = 0.8;

const channelsOf = (hex: string): ReadonlyArray<number> => {
  const value = parseInt(hex.replace('#', ''), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
};

/** The ink laid on the paper at a load, as the framebuffer blends it: in sRGB. */
export function lavis(
  ink: string,
  load: number = HELD_OPACITY,
  ground: string = PALETTE.neutralLand,
): string {
  const paper = channelsOf(ground);
  return `#${channelsOf(ink)
    .map((channel, index) =>
      Math.round(paper[index]! * (1 - load) + channel * load)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

/**
 * The nation's ink laid heavier, for a region that carries a building: denser than the
 * country's lavis, never darker than the ink itself — a built region is a stronger wash, not
 * a black patch that would compete with the building standing on it.
 */
export const builtInk = (countryInk: string): string => lavis(countryInk, BUILT_LOAD);

/**
 * **One nation, one family** (palette des nations, 14/10/2026). Every ground a nation colours
 * on the board is its ink at a load over the paper — never a second ink. The table is
 * `INK_BY_NATION`; these are its steps. The engine paints `sheet` and `built`; a region fill
 * is the ink laid at `HELD_OPACITY × wash` by the blend, which lands on `sheet` when fresh and
 * on `surveyed` at the floor — where a suspended zone is hatched too (`regions.ts`). A held
 * region and the home sheet are the same step: possession is possession, the cut says where.
 */
export function nationShades(ink: string) {
  return {
    sheet: lavis(ink),
    built: builtInk(ink),
    surveyed: lavis(ink, HELD_OPACITY * FADED_WASH),
  };
}

const linear = (channel: number): number => {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

const luminance = (hex: string): number => {
  const [red, green, blue] = channelsOf(hex).map(linear);
  return 0.2126 * red! + 0.7152 * green! + 0.0722 * blue!;
};

/** WCAG's ratio: the one measure of "does it read" that holds across hues. */
export function contrastRatio(first: string, second: string): number {
  const [light, dark] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (light! + 0.05) / (dark! + 0.05);
}

/** How far the pen's ink goes toward the black: dark enough to read on the nation's own wash,
 *  enough of the nation left that the drawing stays in its family. */
const PEN_DEPTH = 0.75;

/** The hover's contour is laid at this, thin enough to read as a pen stroke and not as a second
 *  border; the pictograms land fuller. The pen is chosen for its contrast as it lands. */
export const PEN_OPACITY = 0.85;

/** What the warm lamp leaves of a lit ground's light, measured on screenshots of the board (the
 *  sand and France's sheet both render at about this share of their luminance) — to measure
 *  again when `lamp.ts` changes. The pen is a line, unlit. */
const LAMP_SHARE = 0.45;

/** A ground as the board renders it under the lamp, in sRGB. */
export function lit(ground: string): string {
  return `#${channelsOf(ground)
    .map((channel) => {
      const value = linear(channel) * LAMP_SHARE;
      const encoded = value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;
      return Math.round(encoded * 255)
        .toString(16)
        .padStart(2, '0');
    })
    .join('')}`;
}

/**
 * The pen that draws over a painted ground — terrain pictograms and the hover's contour. It
 * takes the **deep** of the ink that painted the ground (plain ink on bare land), or the paper
 * when the paper reads better on the ground as lit: the hover says the terrain with the
 * drawing, never by changing the nation's colour.
 * The night does not change it: it is chosen on the ground by day, and the veil darkens the
 * ground under an unlit stroke — the paper gains, the deep ink loses, deliberately left so.
 */
export function penOn(ground: string, ink: string | null): string {
  const deep = ink === null ? PALETTE.border : lavis('#000000', PEN_DEPTH, ink);
  const seen = lit(ground);
  const stroke = (pen: string) => contrastRatio(lavis(pen, PEN_OPACITY, seen), seen);
  return stroke(deep) >= stroke(PALETTE.paper) ? deep : PALETTE.paper;
}

/**
 * The inks of the "taut thread" plates, verbatim. Ink on paper: a calm ochre for what I
 * pilot, the muted critical ink for what comes from the other side, the routine grey for
 * what is only a memory. No saturated orange, no emissive material — the contrast budget
 * belongs to the game layer, not to the light.
 */
export const ARC_COLORS = {
  mine: { trace: '#c98a3c', progress: '#e0a552' },
  enemyDetected: { trace: '#8f4a3e', progress: '#9d4638' },
  lastKnown: { trace: '#6e6a5e', progress: '#6e6a5e' },
  seaControl: { trace: '#3e6b7a', progress: '#5a8fa0' },
} as const;
