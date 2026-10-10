export const GUST_FIRST_S = [10, 30] as const;
export const GUST_GAP_S = [60, 180] as const;
export const GUST_LENGTH_S = 4;

export type Gust = {
  /** 0 → 1 over the gust. */
  readonly progress: number;
  /** 0 → 1 → 0, smooth at both ends. */
  readonly force: number;
  /** Radians on the board's ground plane. */
  readonly angle: number;
  /** 0 → 1 across the sheet, perpendicular to the direction. */
  readonly band: number;
};

type Planned = { start: number; angle: number; band: number };

/**
 * Gusts are drawn lazily, one at a time, from the ambient clock: `time` only ever grows, so a
 * gust is forgotten once it is over and nothing is precomputed.
 */
type Range = readonly [number, number];

export function createGusts(
  random: () => number = Math.random,
  pace: { readonly first: Range; readonly gap: Range } = { first: GUST_FIRST_S, gap: GUST_GAP_S },
) {
  const between = ([low, high]: Range, from: number): number =>
    from + low + random() * (high - low);
  const plan = (start: number): Planned => ({
    start,
    angle: random() * Math.PI * 2,
    band: random(),
  });
  let next = plan(between(pace.first, 0));

  return {
    at(time: number): Gust | null {
      while (time >= next.start + GUST_LENGTH_S) {
        next = plan(between(pace.gap, next.start + GUST_LENGTH_S));
      }
      if (time < next.start) return null;
      const progress = (time - next.start) / GUST_LENGTH_S;
      return {
        progress,
        force: Math.sin(Math.PI * progress) ** 2,
        angle: next.angle,
        band: next.band,
      };
    },
  };
}
