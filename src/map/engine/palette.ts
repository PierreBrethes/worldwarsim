/** Literals, because the engine cannot read CSS. `src/styles/tokens.css` is the source and
 *  `src/styles/colors.test.ts` fails when the two drift. */
/** **The adverse red** of the mockups: a refused pose, a pin, a woken basin out of reach, an
 *  annotation (#239). One literal for every ink that says "refused here" on the board. */
export const ADVERSE_INK = '#8f3a2c';

export const PALETTE = {
  desk: '#171208',
  /** The wood under the board, past its edge (#187): close to `desk`, quieter than the sheet
   *  (direction artistique). The fog takes it back to `desk`. Engine-only. */
  table: '#2a2318',
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
 * **How much ink a lavis lays over the paper.** The board no longer washes any ground (ADR 0033):
 * the lavis is left to the landing's table (`routes/-index/table/sheet.ts`) and the pictogram
 * review, which still paint a nation's sheet.
 */
export const HELD_OPACITY = 0.65;
/** An old survey's share of that load, on the landing's table. */
const SURVEYED_LOAD = 0.35;

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

/** A nation's ground on the landing's table: held, and known by an old survey. */
export function nationShades(ink: string) {
  return {
    sheet: lavis(ink),
    surveyed: lavis(ink, HELD_OPACITY * SURVEYED_LOAD),
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

/** How far the pen's ink goes toward the black: dark enough to read on the land, enough of the
 *  nation left that the drawing stays in its family. */
export const PEN_DEPTH = 0.75;

/** The hover's contour is laid at this, thin enough to read as a pen stroke and not as a second
 *  border. */
export const PEN_OPACITY = 0.85;

/**
 * The pen of the hover's contour on the bare land: the **deep**
 * of the holder's ink, or plain ink where nobody holds. The land is never washed any more
 * (ADR 0033), so the pen has only that one ground to read on.
 */
export function penOf(ink: string | null): string {
  return ink === null ? PALETTE.border : lavis('#000000', PEN_DEPTH, ink);
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

/**
 * Le bleu dont la maquette (`carte-refonte`) multiplie la feuille la nuit, en valeurs linéaires :
 * le voile de la lune le porte, une seule fois (`night.ts`).
 * @a-mesurer
 */
export const MOON_TINT = [0.4, 0.5, 0.84] as const;
