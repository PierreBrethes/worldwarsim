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
export function lavis(ink: string, load: number = HELD_OPACITY): string {
  const paper = channelsOf(PALETTE.neutralLand);
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
