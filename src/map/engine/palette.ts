export const PALETTE = {
  desk: '#171208',
  paper: '#e4d8bd',
  sea: '#a9c5cd',
  seaInk: '#2c5063',
  neutralLand: '#d5c5a0',
  border: '#2a2118',
  graticule: '#4a4436',
  plinthTop: '#c7b48e',
  plinthBottom: '#5f5039',
  worldRim: '#6b4a24',
  /** `--notable`, the rail's amber: the board's one ink for "you are here", never an alarm. */
  designated: '#b07434',
  rimStroke: '#3a2a18',
} as const;

/**
 * How much ink the sheet carries. A country is inked once; a region that bears a building is
 * inked again over it — the same pen, a heavier hand.
 */
const COUNTRY_LOAD = 0.45;
const BUILT_LOAD = 0.7;

const channelsOf = (hex: string): ReadonlyArray<number> => {
  const value = parseInt(hex.replace('#', ''), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
};

/**
 * The nation's ink laid heavier, for a region that carries a building. **Denser, never
 * lighter**: the board is ink on paper, so more matter absorbs more sheet. The load composes
 * on the paper the way ink does — the sheet's channel raised to the ratio of the two loads —
 * rather than mixing toward black or toward white. Both alternatives cost the reading of the
 * map: white brings Italy and China back to the bare sand they already sit close to, and
 * flattens the eight nations onto one pale family, when the nation's colour is the first
 * signal the map gives. This keeps France blue and the USSR red.
 */
export function builtInk(countryInk: string): string {
  const paper = channelsOf(PALETTE.neutralLand);
  return `#${channelsOf(countryInk)
    .map((channel, index) => {
      const sheet = Math.max(1, paper[index]!);
      const transmitted = Math.min(1, channel / sheet);
      return Math.round(sheet * transmitted ** (BUILT_LOAD / COUNTRY_LOAD))
        .toString(16)
        .padStart(2, '0');
    })
    .join('')}`;
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
